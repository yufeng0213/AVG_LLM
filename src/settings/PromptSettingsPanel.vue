<script setup>
import { ref, computed, onMounted } from 'vue'
import { PROMPT_CATEGORIES, PROMPT_DEFAULTS, listAllPrompts, getPromptInfo, setOverride, resetToDefault, resetAll, exportAll, importAll } from '../llm/promptRegistry.js'

const emit = defineEmits([])

const promptSummaries = ref([])
const selectedCategory = ref('all')
const selectedPromptId = ref(null)
const selectedPrompt = ref(null)
const editValue = ref('')
const showDefault = ref(false)
const statusMsg = ref('')
const loading = ref(true)

const categories = [
  { id: 'all', name: '全部', count: 0 },
  ...PROMPT_CATEGORIES.map((c) => ({ id: c.id, name: c.name, count: 0 })),
]

const filteredPrompts = computed(() => {
  if (selectedCategory.value === 'all') return promptSummaries.value
  return promptSummaries.value.filter((p) => p.category === selectedCategory.value)
})

async function loadPrompts() {
  loading.value = true
  promptSummaries.value = await listAllPrompts()
  // 更新分类计数
  for (const cat of categories) {
    if (cat.id === 'all') {
      cat.count = promptSummaries.value.length
    } else {
      cat.count = promptSummaries.value.filter((p) => p.category === cat.id).length
    }
  }
  loading.value = false
}

async function selectPrompt(id) {
  selectedPromptId.value = id
  showDefault.value = false
  const info = await getPromptInfo(id)
  selectedPrompt.value = info
  editValue.value = info.userValue || info.defaultValue
  // 等 DOM 更新后自动调整高度
  setTimeout(() => {
    const ta = document.querySelector('.prompt-textarea')
    if (ta) autoResize(ta)
  }, 50)
}

function autoResize(el) {
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

async function savePrompt() {
  if (!selectedPrompt.value) return
  await setOverride(selectedPrompt.value.id, editValue.value)
  selectedPrompt.value.userValue = editValue.value
  selectedPrompt.value.isCustomized = true
  // 更新列表状态
  const idx = promptSummaries.value.findIndex((p) => p.id === selectedPrompt.value.id)
  if (idx >= 0) promptSummaries.value[idx].isCustomized = true
  statusMsg.value = '已保存'
  setTimeout(() => { statusMsg.value = '' }, 2000)
}

async function resetPrompt() {
  if (!selectedPrompt.value) return
  await resetToDefault(selectedPrompt.value.id)
  selectedPrompt.value.userValue = null
  selectedPrompt.value.isCustomized = false
  editValue.value = selectedPrompt.value.defaultValue
  const idx = promptSummaries.value.findIndex((p) => p.id === selectedPrompt.value.id)
  if (idx >= 0) promptSummaries.value[idx].isCustomized = false
  statusMsg.value = '已重置为默认'
  setTimeout(() => { statusMsg.value = '' }, 2000)
}

async function handleExport() {
  try {
    const data = await exportAll()
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'prompts-export.json'
    a.click()
    URL.revokeObjectURL(url)
    statusMsg.value = '已导出全部 prompt'
    setTimeout(() => { statusMsg.value = '' }, 2000)
  } catch (e) {
    statusMsg.value = '导出失败: ' + e.message
  }
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const result = await importAll(ev.target.result)
      statusMsg.value = result.message
      if (result.success) {
        await loadPrompts()
        if (selectedPromptId.value) {
          await selectPrompt(selectedPromptId.value)
        }
      }
      setTimeout(() => { statusMsg.value = '' }, 3000)
    }
    reader.readAsText(file)
  }
  input.click()
}

async function handleResetAll() {
  if (!confirm('确定要重置所有 prompt 为默认值吗？此操作不可撤销。')) return
  await resetAll()
  await loadPrompts()
  if (selectedPromptId.value) {
    await selectPrompt(selectedPromptId.value)
  }
  statusMsg.value = '已重置全部 prompt'
  setTimeout(() => { statusMsg.value = '' }, 2000)
}

onMounted(loadPrompts)
</script>

<template>
  <section class="settings-panel-content prompt-manager">
    <div class="prompt-manager-header">
      <h2 class="panel-title">Prompt 管理</h2>
      <p class="panel-description">自定义所有 LLM Prompt 的内容，调整 AI 的回复风格和输出格式。</p>
      <div class="prompt-toolbar">
        <button type="button" class="action-button action-outline" @click="handleExport">导出全部</button>
        <button type="button" class="action-button action-outline" @click="handleImport">导入</button>
        <button type="button" class="action-button action-danger" @click="handleResetAll">全部重置</button>
      </div>
    </div>

    <div class="prompt-layout" :class="{ 'no-selection': !selectedPromptId }">
      <!-- 左侧：分类 -->
      <aside class="prompt-categories">
        <button
          v-for="cat in categories"
          :key="cat.id"
          type="button"
          class="cat-btn"
          :class="{ active: selectedCategory === cat.id }"
          @click="selectedCategory = cat.id"
        >
          <span class="cat-name">{{ cat.name }}</span>
          <span class="cat-count">{{ cat.count }}</span>
        </button>
      </aside>

      <!-- 中间：Prompt 列表 -->
      <section class="prompt-list">
        <div v-if="loading" class="prompt-loading">加载中...</div>
        <button
          v-for="p in filteredPrompts"
          :key="p.id"
          type="button"
          class="prompt-item"
          :class="{ active: selectedPromptId === p.id }"
          @click="selectPrompt(p.id)"
        >
          <span class="prompt-item-name">{{ p.name }}</span>
          <span class="prompt-item-status" :class="{ customized: p.isCustomized }">
            {{ p.isCustomized ? '已修改' : '默认' }}
          </span>
        </button>
      </section>

      <!-- 右侧：编辑器 -->
      <section v-if="selectedPrompt" class="prompt-editor">
        <div class="editor-header">
          <h3 class="editor-title">{{ selectedPrompt.name }}</h3>
          <p class="editor-desc">{{ selectedPrompt.description }}</p>
          <span class="protocol-badge">{{ selectedPrompt.protocol }}</span>
        </div>

        <div class="editor-toggle">
          <button
            type="button"
            class="toggle-btn"
            :class="{ active: !showDefault }"
            @click="showDefault = false"
          >当前值</button>
          <button
            type="button"
            class="toggle-btn"
            :class="{ active: showDefault }"
            @click="showDefault = true; editValue = selectedPrompt.defaultValue"
          >默认值</button>
        </div>

        <textarea
          v-model="editValue"
          class="prompt-textarea"
          :placeholder="selectedPrompt.description"
          spellcheck="false"
          @input="autoResize($event.target)"
        />

        <div class="editor-actions">
          <button
            v-if="selectedPrompt.isCustomized"
            type="button"
            class="action-button action-outline"
            @click="resetPrompt"
          >重置为默认</button>
          <button
            type="button"
            class="action-button action-strong"
            @click="savePrompt"
          >保存</button>
        </div>
      </section>
    </div>

    <p v-if="statusMsg" class="status-message">{{ statusMsg }}</p>
  </section>
</template>

<style scoped>
.prompt-manager {
  max-width: none !important;
  width: 100% !important;
}

.prompt-manager-header {
  margin-bottom: 16px !important;
}

.prompt-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.prompt-layout {
  display: grid;
  grid-template-columns: 140px 220px 1fr;
  gap: 0;
  min-height: 500px;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
  border-radius: 10px;
  overflow: hidden;
  background: color-mix(in srgb, var(--foreground, #ffffff) 2%, transparent);
}

.prompt-layout.no-selection {
  grid-template-columns: 140px 1fr;
}

/* 分类侧栏 */
.prompt-categories {
  display: flex;
  flex-direction: column;
  border-right: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
  background: color-mix(in srgb, var(--foreground, #ffffff) 3%, transparent);
  padding: 8px 0;
  overflow-y: auto;
  max-height: 600px;
}

.cat-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: var(--foreground, #ffffff);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: background 150ms ease;
  text-align: left;
}

.cat-btn:hover {
  background: color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
}

.cat-btn.active {
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 15%, transparent);
  color: var(--accent-cyan, #00d4ff);
}

.cat-count {
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
  padding: 2px 6px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
}

.cat-btn.active .cat-count {
  color: var(--accent-cyan, #00d4ff);
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 20%, transparent);
}

/* Prompt 列表 */
.prompt-list {
  display: flex;
  flex-direction: column;
  border-right: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
  overflow-y: auto;
  max-height: 600px;
}

.prompt-loading {
  padding: 20px;
  text-align: center;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
  font-size: 0.85rem;
}

.prompt-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
  background: transparent;
  color: var(--foreground, #ffffff);
  cursor: pointer;
  text-align: left;
  transition: background 150ms ease;
}

.prompt-item:hover {
  background: color-mix(in srgb, var(--foreground, #ffffff) 4%, transparent);
}

.prompt-item.active {
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 10%, transparent);
}

.prompt-item-name {
  font-size: 0.88rem;
  font-weight: 500;
}

.prompt-item-status {
  font-size: 0.72rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 35%, transparent);
}

.prompt-item-status.customized {
  color: var(--accent-cyan, #00d4ff);
}

/* 编辑器 */
.prompt-editor {
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 16px;
  overflow-y: auto;
  max-height: 600px;
}

.editor-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.editor-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--foreground, #ffffff);
}

.editor-desc {
  margin: 0;
  font-size: 0.82rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 45%, transparent);
}

.protocol-badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 15%, transparent);
  color: var(--accent-cyan, #00d4ff);
  text-transform: uppercase;
  width: fit-content;
}

.editor-toggle {
  display: flex;
  gap: 4px;
}

.toggle-btn {
  padding: 6px 14px;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
  border-radius: 6px;
  background: transparent;
  color: color-mix(in srgb, var(--foreground, #ffffff) 55%, transparent);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.toggle-btn.active {
  background: var(--accent-cyan, #00d4ff);
  color: var(--background, #0a0a0a);
  border-color: var(--accent-cyan, #00d4ff);
}

.prompt-textarea {
  width: 100%;
  height: auto;
  min-height: 80px;
  resize: none;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
  border-radius: 8px;
  padding: 12px 14px;
  font: 400 0.88rem/1.6 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  color: var(--foreground, #ffffff);
  background: color-mix(in srgb, var(--foreground, #ffffff) 4%, transparent);
  box-shadow: none;
}

.prompt-textarea:focus-visible {
  outline: none;
  border-color: var(--accent-cyan, #00d4ff);
}

.editor-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.action-button.action-danger {
  color: #ff6b6b;
  border: 1px solid color-mix(in srgb, #ff6b6b 30%, transparent);
}

.action-button.action-danger:hover:not(:disabled) {
  background: color-mix(in srgb, #ff6b6b 12%, transparent);
}

/* 响应式 */
@media (max-width: 900px) {
  .prompt-layout {
    grid-template-columns: 1fr;
  }

  .prompt-layout.no-selection {
    grid-template-columns: 1fr;
  }

  .prompt-categories {
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
    max-height: none;
  }

  .cat-btn {
    white-space: nowrap;
    min-width: fit-content;
  }

  .prompt-list {
    border-right: none;
    border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
    max-height: 240px;
  }

  .prompt-editor {
    max-height: none;
  }


    .platform-android.android-portrait .cat-btn,
    .platform-android.android-portrait .toggle-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }
}
</style>
