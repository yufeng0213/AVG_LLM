<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  createNewNarratorProfile,
  deleteNarratorProfile,
  exportNarratorProfile,
  importNarratorProfiles,
  loadNarratorProfiles,
  persistNarratorProfiles,
} from '../narrator/narratorStore'

const emit = defineEmits(['back'])

const narratorProfiles = ref([])
const activeNarratorId = ref('')
const statusMessage = ref('可在这里维护全局叙事者风格模板。')
const isSaving = ref(false)
const importInputRef = ref(null)

const activeNarrator = computed(() =>
  narratorProfiles.value.find((profile) => profile.id === activeNarratorId.value) || null,
)

const ensureActiveSelection = () => {
  if (narratorProfiles.value.length === 0) {
    activeNarratorId.value = ''
    return
  }

  const exists = narratorProfiles.value.some((profile) => profile.id === activeNarratorId.value)
  if (!exists) {
    activeNarratorId.value = narratorProfiles.value[0].id
  }
}

const loadProfiles = async () => {
  narratorProfiles.value = await loadNarratorProfiles()
  ensureActiveSelection()
}

const markActiveUpdated = () => {
  if (!activeNarrator.value) return
  activeNarrator.value.updatedAt = new Date().toISOString()
}

const updateActiveField = (field, value) => {
  if (!activeNarrator.value) return
  activeNarrator.value[field] = value

  if (activeNarrator.value.isDefault) {
    activeNarrator.value.enabled = true
  }

  markActiveUpdated()
}

const addNarrator = () => {
  const nextNarrator = createNewNarratorProfile(narratorProfiles.value)
  narratorProfiles.value = [...narratorProfiles.value, nextNarrator]
  activeNarratorId.value = nextNarrator.id
  statusMessage.value = `已新增叙事者：${nextNarrator.name}`
}

const removeActiveNarrator = () => {
  if (!activeNarrator.value) return

  const result = deleteNarratorProfile(narratorProfiles.value, activeNarrator.value.id)
  if (!result.success) {
    statusMessage.value = result.message
    return
  }

  narratorProfiles.value = result.profiles
  ensureActiveSelection()
  statusMessage.value = result.message
}

const saveProfiles = async () => {
  isSaving.value = true
  try {
    await persistNarratorProfiles(narratorProfiles.value)
    statusMessage.value = '叙事者配置已保存。'
  } finally {
    isSaving.value = false
  }
}

const triggerImport = () => {
  importInputRef.value?.click()
}

const handleImportFile = async (event) => {
  const file = event?.target?.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const result = importNarratorProfiles(text, narratorProfiles.value)

    if (!result.success || result.profiles.length === 0) {
      statusMessage.value = result.message || '导入失败'
      return
    }

    narratorProfiles.value = [...narratorProfiles.value, ...result.profiles]
    activeNarratorId.value = result.profiles[0].id
    await persistNarratorProfiles(narratorProfiles.value)
    statusMessage.value = result.message
  } catch (error) {
    statusMessage.value = `导入失败：${error.message}`
  } finally {
    if (event?.target) {
      event.target.value = ''
    }
  }
}

const exportActive = () => {
  if (!activeNarrator.value) return

  const jsonStr = exportNarratorProfile(activeNarrator.value)
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${activeNarrator.value.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_narrator.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  statusMessage.value = `已导出：${activeNarrator.value.name}`
}

onMounted(async () => {
  await loadProfiles()
})
</script>

<template>
  <main class="narrator-manager-screen" role="main">
    <p class="narrator-bg-word" aria-hidden="true">VOICE</p>

    <header class="narrator-header">
      <button type="button" class="back-button" @click="emit('back')">返回主菜单</button>
      <div class="narrator-title-group">
        <p class="narrator-tag">Narrator Profile Library</p>
        <h1 class="narrator-title">叙事者管理</h1>
      </div>
    </header>

    <section class="narrator-layout">
      <aside class="narrator-list-panel" aria-label="叙事者列表">
        <div class="list-actions">
          <button type="button" class="action-button action-outline small-btn" @click="addNarrator">
            ＋ 新增叙事者
          </button>
          <button type="button" class="action-button action-outline small-btn" @click="triggerImport">
            导入 JSON
          </button>
          <button type="button" class="action-button action-strong small-btn" :disabled="isSaving" @click="saveProfiles">
            {{ isSaving ? '保存中...' : '保存配置' }}
          </button>
          <input
            ref="importInputRef"
            type="file"
            accept=".json,application/json"
            class="hidden-input"
            @change="handleImportFile"
          />
        </div>

        <div class="narrator-list">
          <button
            v-for="profile in narratorProfiles"
            :key="profile.id"
            type="button"
            class="narrator-item"
            :class="{ active: activeNarratorId === profile.id }"
            @click="activeNarratorId = profile.id"
          >
            <span class="narrator-item-name">{{ profile.name }}</span>
            <span class="narrator-item-meta">
              {{ profile.isDefault ? '系统默认' : profile.enabled ? '已启用' : '已禁用' }}
            </span>
          </button>
        </div>
      </aside>

      <section class="narrator-editor-panel settings-panel-content">
        <template v-if="activeNarrator">
          <h2 class="panel-title">叙事者配置</h2>
          <p class="panel-description">用于控制剧情输出的笔触风格与叙事习惯，可与不同世界书自由组合。</p>

          <div class="settings-grid two-column">
            <label class="setting-field">
              <span class="setting-label">名称</span>
              <input
                :value="activeNarrator.name"
                class="setting-input"
                type="text"
                placeholder="例如：冷峻悬疑主笔"
                @input="updateActiveField('name', $event.target.value)"
              />
            </label>

            <label class="setting-field">
              <span class="setting-label">状态</span>
              <div class="narrator-toggle-row">
                <label class="toggle-checkbox">
                  <input
                    type="checkbox"
                    :checked="activeNarrator.enabled"
                    :disabled="activeNarrator.isDefault"
                    @change="updateActiveField('enabled', $event.target.checked)"
                  />
                  <span>{{ activeNarrator.enabled ? '已启用' : '已禁用' }}</span>
                </label>
                <span v-if="activeNarrator.isDefault" class="setting-hint">默认叙事者始终启用</span>
              </div>
            </label>
          </div>

          <label class="setting-field">
            <span class="setting-label">简介</span>
            <textarea
              :value="activeNarrator.summary"
              class="setting-textarea"
              rows="3"
              placeholder="描述该叙事者擅长的风格与适配场景。"
              spellcheck="false"
              @input="updateActiveField('summary', $event.target.value)"
            ></textarea>
          </label>

          <label class="setting-field">
            <span class="setting-label">文风主提示（stylePrompt）</span>
            <textarea
              :value="activeNarrator.stylePrompt"
              class="setting-textarea"
              rows="8"
              placeholder="例如：短句推进、镜头感强、对话张力优先、避免过度抒情。"
              spellcheck="false"
              @input="updateActiveField('stylePrompt', $event.target.value)"
            ></textarea>
          </label>

          <label class="setting-field">
            <span class="setting-label">额外约束（instructionPrompt）</span>
            <textarea
              :value="activeNarrator.instructionPrompt"
              class="setting-textarea"
              rows="6"
              placeholder="例如：每次分支必须可执行；避免无意义复读；场景切换需有过渡。"
              spellcheck="false"
              @input="updateActiveField('instructionPrompt', $event.target.value)"
            ></textarea>
          </label>

          <div class="editor-actions">
            <button type="button" class="action-button action-outline small-btn" @click="exportActive">导出 JSON</button>
            <button
              type="button"
              class="action-button action-danger small-btn"
              :disabled="activeNarrator.isDefault"
              @click="removeActiveNarrator"
            >
              删除叙事者
            </button>
          </div>
        </template>

        <p v-else class="empty-tip">暂无叙事者配置，请先新增一个。</p>
      </section>
    </section>

    <p class="status-message">{{ statusMessage }}</p>
  </main>
</template>

<style scoped>
.narrator-manager-screen {
  position: relative;
  width: 100%;
  height: calc(100vh - clamp(40px, 8vw, 110px));
  max-height: calc(100vh - clamp(40px, 8vw, 110px));
  border: 8px solid var(--accent-cyan);
  border-radius: 30px 18px 28px 16px;
  background: color-mix(in srgb, var(--muted) 86%, transparent);
  box-shadow:
    0 0 30px color-mix(in srgb, var(--accent-cyan) 36%, transparent),
    10px 10px 0 var(--accent-magenta), 20px 20px 0 var(--accent-yellow);
  backdrop-filter: blur(8px);
  padding: clamp(16px, 3vw, 26px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 12px;
  overflow: hidden;
}

.narrator-bg-word {
  margin: 0;
  position: absolute;
  right: -1%;
  top: -6%;
  font-family: var(--font-heading);
  font-size: clamp(5rem, 20vw, 14rem);
  line-height: 0.82;
  letter-spacing: -0.07em;
  color: color-mix(in srgb, var(--accent-cyan) 26%, transparent);
  pointer-events: none;
  user-select: none;
}

.narrator-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.narrator-title-group {
  display: grid;
  gap: 6px;
}

.narrator-tag {
  margin: 0;
  width: fit-content;
  padding: 6px 12px;
  border: 3px dashed var(--accent-yellow);
  border-radius: 9999px;
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.narrator-title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  text-shadow: var(--text-shadow-double);
}

.narrator-layout {
  position: relative;
  z-index: 2;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 12px;
}

.narrator-list-panel {
  min-height: 0;
  border: 3px solid color-mix(in srgb, var(--accent-cyan) 58%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--background) 30%, transparent);
  padding: 12px;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 10px;
}

.list-actions {
  display: grid;
  gap: 8px;
}

.hidden-input {
  display: none;
}

.narrator-list {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 8px;
}

.narrator-item {
  appearance: none;
  width: 100%;
  text-align: left;
  border: 2px solid color-mix(in srgb, var(--accent-magenta) 55%, transparent);
  border-radius: 12px;
  padding: 10px;
  background: color-mix(in srgb, var(--surface-panel) 90%, transparent);
  color: var(--foreground);
  cursor: pointer;
  display: grid;
  gap: 4px;
}

.narrator-item.active {
  border-color: var(--accent-cyan);
  background: color-mix(in srgb, var(--accent-cyan) 18%, transparent);
}

.narrator-item-name {
  font-weight: 700;
  font-size: 0.95rem;
}

.narrator-item-meta {
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--foreground) 76%, transparent);
}

.narrator-editor-panel {
  min-height: 0;
  overflow-y: auto;
  border: 3px solid color-mix(in srgb, var(--accent-orange) 45%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--background) 24%, transparent);
  padding: 14px;
}

.narrator-toggle-row {
  display: grid;
  gap: 6px;
}

.toggle-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.action-danger {
  border-color: var(--accent-magenta);
  background: color-mix(in srgb, var(--accent-magenta) 18%, transparent);
  color: var(--accent-magenta);
}

.empty-tip {
  margin: 0;
  color: color-mix(in srgb, var(--foreground) 80%, transparent);
}

.status-message {
  margin: 0;
  position: relative;
  z-index: 2;
  min-height: 1.4em;
  font-size: 0.88rem;
  color: color-mix(in srgb, var(--foreground) 85%, var(--accent-cyan));
}

@media (max-width: 900px) {
  .narrator-manager-screen {
    border-width: 3px;
    border-radius: 14px;
    box-shadow: 0 0 14px color-mix(in srgb, var(--accent-cyan) 25%, transparent);
  }

  .narrator-layout {
    grid-template-columns: 1fr;
  }

  .narrator-list-panel {
    max-height: 220px;
  }
}

@media (max-width: 768px) and (orientation: portrait) {
  .narrator-manager-screen {
    min-height: 100vh;
    height: auto;
    max-height: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
    padding: 14px 12px;
  }

  .narrator-bg-word {
    display: none;
  }

  .narrator-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .narrator-title {
    font-size: 1.6rem;
  }

  .narrator-tag {
    display: none;
  }

  .narrator-list-panel {
    max-height: 280px;
  }
}
</style>

