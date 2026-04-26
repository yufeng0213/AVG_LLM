<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  createNewNarratorProfile,
  deleteNarratorProfile,
  exportNarratorProfile,
  importNarratorProfiles,
  loadNarratorProfiles,
  persistNarratorProfiles,
  createNarratorItem,
  deleteNarratorItem,
  updateNarratorItem,
  moveNarratorItem,
} from '../../../src/narrator/narratorStore'

const emit = defineEmits(['back'])

const narratorProfiles = ref([])
const activeNarratorId = ref('')
const statusMessage = ref('可在这里维护全局叙事者风格模板。')
const isSaving = ref(false)
const importInputRef = ref(null)

// 展开状态（记录哪些条目正在编辑）
const expandedItems = ref(new Set())

const activeNarrator = computed(() =>
  narratorProfiles.value.find((profile) => profile.id === activeNarratorId.value) || null,
)

const activeItems = computed(() => {
  if (!activeNarrator.value?.items) return []
  return [...activeNarrator.value.items].sort((a, b) => (a.order || 0) - (b.order || 0))
})

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

// 叙事者选择变更
const onNarratorSelect = (e) => {
  activeNarratorId.value = e.target.value
  expandedItems.value = new Set()
}

// 新增叙事者
const addNarrator = () => {
  const nextNarrator = createNewNarratorProfile(narratorProfiles.value)
  narratorProfiles.value = [...narratorProfiles.value, nextNarrator]
  activeNarratorId.value = nextNarrator.id
  expandedItems.value = new Set()
  statusMessage.value = `已新增叙事者：${nextNarrator.name}`
}

// 删除当前叙事者
const removeActiveNarrator = () => {
  if (!activeNarrator.value) return

  const result = deleteNarratorProfile(narratorProfiles.value, activeNarrator.value.id)
  if (!result.success) {
    statusMessage.value = result.message
    return
  }

  narratorProfiles.value = result.profiles
  ensureActiveSelection()
  expandedItems.value = new Set()
  statusMessage.value = result.message
}

// 新增条目
const addItem = () => {
  if (!activeNarrator.value) return
  const newItem = createNarratorItem(activeNarrator.value.items)
  activeNarrator.value.items = [...(activeNarrator.value.items || []), newItem]
  markActiveUpdated()
  // 自动展开新条目
  expandedItems.value = new Set([...expandedItems.value, newItem.id])
  statusMessage.value = `已新增条目`
}

// 删除条目
const removeItem = (itemId) => {
  if (!activeNarrator.value) return
  activeNarrator.value.items = (activeNarrator.value.items || []).filter((item) => item.id !== itemId)
  expandedItems.value = new Set([...expandedItems.value].filter((id) => id !== itemId))
  markActiveUpdated()
  statusMessage.value = '已删除条目'
}

// 切换条目展开状态
const toggleItemExpand = (itemId) => {
  const newSet = new Set(expandedItems.value)
  if (newSet.has(itemId)) {
    newSet.delete(itemId)
  } else {
    newSet.add(itemId)
  }
  expandedItems.value = newSet
}

// 更新条目字段
const updateItemField = (itemId, field, value) => {
  if (!activeNarrator.value) return
  activeNarrator.value.items = (activeNarrator.value.items || []).map((item) =>
    item.id === itemId ? { ...item, [field]: value } : item,
  )
  markActiveUpdated()
}

// 移动条目顺序
const moveItem = (itemId, direction) => {
  if (!activeNarrator.value) return
  const items = [...activeNarrator.value.items].sort((a, b) => (a.order || 0) - (b.order || 0))
  const index = items.findIndex((item) => item.id === itemId)
  if (index === -1) return

  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= items.length) return

  // 交换order
  items[index] = { ...items[index], order: items[newIndex].order }
  items[newIndex] = { ...items[newIndex], order: items[index].order }

  activeNarrator.value.items = items
  markActiveUpdated()
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
    expandedItems.value = new Set()
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
  a.download = `${activeNarrator.value.name.replace(/[^a-zA-Z0-9一-龥]/g, '_')}_narrator.json`
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
  <main class="narrator-manager-screen">
    <!-- Header -->
    <header class="narrator-header">
      <button type="button" class="narrator-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        <span>返回</span>
      </button>
      <h1 class="narrator-title">叙事者管理</h1>
    </header>

    <!-- 叙事者选择器 -->
    <section class="narrator-selector-section">
      <div class="narrator-selector-row">
        <select class="narrator-select" :value="activeNarratorId" @change="onNarratorSelect">
          <option v-for="profile in narratorProfiles" :key="profile.id" :value="profile.id">
            {{ profile.name }} {{ profile.isDefault ? '(默认)' : '' }}
          </option>
        </select>
        <button type="button" class="narrator-selector-btn" @click="addNarrator" title="新增叙事者">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button type="button" class="narrator-selector-btn narrator-selector-btn--danger" :disabled="activeNarrator?.isDefault" @click="removeActiveNarrator" title="删除叙事者">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </section>

    <!-- 编辑面板 -->
    <section class="narrator-editor-panel">
      <template v-if="activeNarrator">
        <!-- 基本信息 -->
        <div class="narrator-basic-section">
          <label class="narrator-field">
            <span class="narrator-field-label">名称</span>
            <input
              :value="activeNarrator.name"
              class="narrator-input"
              type="text"
              placeholder="叙事者名称"
              @input="updateActiveField('name', $event.target.value)"
            />
          </label>

          <label class="narrator-field">
            <span class="narrator-field-label">简介</span>
            <textarea
              :value="activeNarrator.summary"
              class="narrator-textarea"
              rows="2"
              placeholder="简要描述该叙事者的风格定位"
              @input="updateActiveField('summary', $event.target.value)"
            ></textarea>
          </label>
        </div>

        <!-- 条目列表 -->
        <div class="narrator-items-section">
          <div class="narrator-items-header">
            <span class="narrator-items-title">叙事条目</span>
            <button type="button" class="narrator-add-item-btn" @click="addItem">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>新增条目</span>
            </button>
          </div>

          <div class="narrator-items-list">
            <div v-for="item in activeItems" :key="item.id" class="narrator-item-block">
              <!-- 条目行：Switch + 名称 + 展开按钮 + 编辑按钮 -->
              <div class="narrator-item-row">
                <input
                  type="checkbox"
                  class="narrator-item-switch"
                  :checked="item.enabled"
                  @change="updateItemField(item.id, 'enabled', $event.target.checked)"
                />
                <input
                  type="text"
                  class="narrator-item-name-input"
                  :value="item.name"
                  placeholder="条目名称"
                  @input="updateItemField(item.id, 'name', $event.target.value)"
                />
          
                <button type="button" class="narrator-item-btn" @click="toggleItemExpand(item.id)" title="展开/收起">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" :class="{ 'narrator-icon-rotated': expandedItems.has(item.id) }"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <button type="button" class="narrator-item-btn narrator-item-btn--danger" @click="removeItem(item.id)" title="删除">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <!-- 展开后的内容编辑区 -->
              <div v-if="expandedItems.has(item.id)" class="narrator-item-content">
                <textarea
                  :value="item.content"
                  class="narrator-item-textarea"
                  rows="4"
                  placeholder="输入条目内容..."
                  @input="updateItemField(item.id, 'content', $event.target.value)"
                ></textarea>
              </div>
            </div>

            <p v-if="activeItems.length === 0" class="narrator-items-empty">暂无条目，点击"新增条目"添加</p>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="narrator-actions">
          <button type="button" class="narrator-action-btn narrator-action-btn--primary" :disabled="isSaving" @click="saveProfiles">
            {{ isSaving ? '保存中...' : '保存配置' }}
          </button>
          <button type="button" class="narrator-action-btn" @click="exportActive">导出JSON</button>
          <button type="button" class="narrator-action-btn" @click="triggerImport">导入JSON</button>
          <input ref="importInputRef" type="file" accept=".json,application/json" class="hidden-input" @change="handleImportFile" />
        </div>
      </template>

      <p v-else class="narrator-empty-tip">暂无叙事者配置，请先新增一个。</p>
    </section>

    <!-- 状态提示 -->
    <p class="narrator-status">{{ statusMessage }}</p>
  </main>
</template>

<style scoped src="./NarratorManagerScreen.css"></style>