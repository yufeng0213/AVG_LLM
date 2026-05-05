<script setup>
import { ref, computed } from 'vue'
import { useTodoInventory } from './composables/useTodoInventory.js'

const todo = useTodoInventory()
const emit = defineEmits(['saved'])

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const form = ref({
  title: '',
  category: 'life',
  dueDate: '',
  dueTime: '',
  repeat: 'none',
  tags: [],
})

const showCategoryModal = ref(false)
const showTagModal = ref(false)
const tagInput = ref('')

const categoryList = computed(() =>
  todo.CATEGORY_ORDER.map(k => ({ key: k, ...todo.CATEGORY_META[k] }))
)

const currentCategory = computed(() => {
  return categoryList.value.find(c => c.key === form.value.category) || categoryList.value[0]
})

// 格式化日期显示: "5月22日(四)"
const displayDate = computed(() => {
  if (!form.value.dueDate) return '不设置'
  const d = new Date(form.value.dueDate)
  const m = d.getMonth() + 1
  const day = d.getDate()
  const wd = WEEKDAYS[d.getDay()]
  return `${m}月${day}日(${wd})`
})

// 格式化时间显示
const displayTime = computed(() => {
  if (!form.value.dueTime) return '不设置'
  return form.value.dueTime
})

// 重复选项
const repeatOptions = [
  { key: 'none', label: '不重复' },
  { key: 'daily', label: '每天' },
  { key: 'weekly', label: '每周' },
  { key: 'monthly', label: '每月' },
]
const currentRepeat = computed(() => {
  return repeatOptions.find(r => r.key === form.value.repeat) || repeatOptions[0]
})

const displayTags = computed(() => {
  if (!form.value.tags || form.value.tags.length === 0) return '添加标签'
  return form.value.tags.join('、')
})

async function handleSave() {
  if (!form.value.title.trim()) return

  let dueDateTime = null
  if (form.value.dueDate) {
    dueDateTime = form.value.dueTime
      ? new Date(`${form.value.dueDate}T${form.value.dueTime}`).toISOString()
      : new Date(form.value.dueDate + 'T23:59:59').toISOString()
  }

  await todo.addTodo({
    title: form.value.title.trim(),
    category: form.value.category,
    dueDate: dueDateTime,
    tags: form.value.tags,
  })
  emit('saved')
  form.value = { title: '', category: 'life', dueDate: '', dueTime: '', repeat: 'none', tags: [] }
}

function cycleRepeat() {
  const idx = repeatOptions.findIndex(r => r.key === form.value.repeat)
  form.value.repeat = repeatOptions[(idx + 1) % repeatOptions.length].key
}

function addTag() {
  const t = tagInput.value.trim()
  if (t && !form.value.tags.includes(t)) {
    form.value.tags.push(t)
  }
  tagInput.value = ''
}

function removeTag(idx) {
  form.value.tags.splice(idx, 1)
}
</script>

<template>
  <div class="todo-add-screen">
    <!-- 顶部 -->
    <div class="add-header">
      <button type="button" class="close-btn" @click="emit('saved')">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#8888a0" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <h2 class="add-title">添加待办</h2>
      <button type="button" class="save-btn-top" :class="{ active: form.title.trim() }" @click="handleSave">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" :stroke="form.title.trim() ? '#9b8ec4' : '#c8c4d8'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
    </div>

    <div class="add-content">
      <!-- 标题输入 -->
      <div class="title-card">
        <input
          v-model="form.title"
          class="title-input"
          placeholder="请输入待办事项"
          autofocus
        />
      </div>

      <!-- 设置列表 -->
      <div class="settings-list">
        <!-- 分类 -->
        <div class="settings-row" @click="showCategoryModal = true">
          <svg class="row-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8888a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          <span class="row-label">分类</span>
          <div class="row-right">
            <span class="row-value">{{ currentCategory.label }}</span>
            <svg class="row-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c8c4d8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
          </div>
        </div>
        <div class="row-divider" />

        <!-- 日期 -->
        <div class="settings-row" @click="() => $refs.dateInput.click()">
          <svg class="row-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8888a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span class="row-label">日期</span>
          <div class="row-right">
            <span class="row-value">{{ displayDate }}</span>
            <svg class="row-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c8c4d8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
          </div>
          <input ref="dateInput" type="date" v-model="form.dueDate" class="hidden-input" />
        </div>
        <div class="row-divider" />

        <!-- 时间 -->
        <div class="settings-row" @click="() => $refs.timeInput.click()">
          <svg class="row-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8888a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span class="row-label">时间</span>
          <div class="row-right">
            <span class="row-value">{{ displayTime }}</span>
            <svg class="row-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c8c4d8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
          </div>
          <input ref="timeInput" type="time" v-model="form.dueTime" class="hidden-input" />
        </div>
        <div class="row-divider" />

        <!-- 重复 -->
        <div class="settings-row" @click="cycleRepeat">
          <svg class="row-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8888a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          <span class="row-label">重复</span>
          <div class="row-right">
            <span class="row-value">{{ currentRepeat.label }}</span>
            <svg class="row-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c8c4d8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
          </div>
        </div>
        <div class="row-divider" />

        <!-- 标签 -->
        <div class="settings-row" @click="showTagModal = true">
          <svg class="row-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8888a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          <span class="row-label">标签</span>
          <div class="row-right">
            <span class="row-value">{{ displayTags }}</span>
            <svg class="row-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c8c4d8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
          </div>
        </div>
      </div>

      <!-- 分类选择弹窗 -->
      <div v-if="showCategoryModal" class="modal-overlay" @click.self="showCategoryModal = false">
        <div class="category-modal">
          <div class="category-modal-header">
            <h3>选择分类</h3>
            <button type="button" class="modal-close" @click="showCategoryModal = false">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8888a0" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="category-modal-list">
            <button
              v-for="cat in categoryList"
              :key="cat.key"
              type="button"
              :class="['cat-modal-item', { active: form.category === cat.key }]"
              @click="form.category = cat.key; showCategoryModal = false"
            >
              <span class="cat-modal-emoji">{{ cat.emoji }}</span>
              <span class="cat-modal-name">{{ cat.label }}</span>
              <svg v-if="form.category === cat.key" class="cat-modal-check" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#9b8ec4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 标签管理弹窗 -->
      <div v-if="showTagModal" class="modal-overlay" @click.self="showTagModal = false">
        <div class="tag-modal">
          <div class="modal-header">
            <h3>管理标签</h3>
            <button type="button" class="modal-close" @click="showTagModal = false">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8888a0" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="tag-list">
            <span v-for="(tag, i) in form.tags" :key="i" class="tag-chip">
              {{ tag }}
              <button type="button" class="tag-remove" @click="removeTag(i)">×</button>
            </span>
            <span v-if="!form.tags.length" class="tag-empty">暂无标签</span>
          </div>
          <div class="tag-add-row">
            <input v-model="tagInput" class="tag-input" placeholder="输入标签名称" @keyup.enter="addTag" />
            <button type="button" class="tag-add-btn" @click="addTag">添加</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-add-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== Header ===== */
.add-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  padding-top: max(12px, var(--safe-area-inset-top, 12px));
}

.close-btn, .save-btn-top {
  display: flex;
  align-items: center;
  padding: 4px;
  background: none;
  border: none;
  cursor: pointer;
}

.save-btn-top.active svg {
  stroke: #9b8ec4 !important;
}

.add-title {
  font-size: 17px;
  font-weight: 600;
  color: #2d2d3a;
  margin: 0;
  flex: 1;
  text-align: center;
}

/* ===== Content ===== */
.add-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 40px;
}

/* ===== 标题卡片 ===== */
.title-card {
  background: #fff;
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.04);
}

.title-input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 15px;
  color: #2d2d3a;
  outline: none;
}

.title-input::placeholder {
  color: #c8c4d8;
}

/* ===== iOS 设置列表 ===== */
.settings-list {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.04);
  margin-bottom: 20px;
}

.settings-row {
  display: flex;
  align-items: center;
  padding: 18px 16px;
  min-height: 56px;
  cursor: pointer;
  position: relative;
}

.settings-row:active {
  background: #f5f5f5;
}

.row-icon {
  flex-shrink: 0;
  margin-right: 12px;
}

.row-label {
  font-size: 15px;
  color: #2d2d3a;
  width: 60px;
  flex-shrink: 0;
}

.row-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

.row-value {
  font-size: 15px;
  color: #8888a0;
  white-space: nowrap;
}

.row-chevron {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.row-divider {
  height: 0.5px;
  background: #e8e6f0;
  margin-left: 76px;
}

.hidden-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

/* ===== 弹窗通用 ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #2d2d3a;
}

.modal-close {
  display: flex;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}

/* ===== 分类弹窗 ===== */
.category-modal {
  background: #fff;
  border-radius: 16px;
  width: 85%;
  max-width: 340px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.category-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.category-modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #2d2d3a;
}

.category-modal-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cat-modal-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: transparent;
  border: 1.5px solid #e8e6f0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.cat-modal-item.active {
  border-color: #9b8ec4;
  background: #f5f2ff;
}

.cat-modal-item:active {
  background: #f5f5f5;
}

.cat-modal-emoji {
  font-size: 20px;
}

.cat-modal-name {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  color: #2d2d3a;
}

.cat-modal-check {
  flex-shrink: 0;
}

/* ===== 标签弹窗 ===== */
.tag-modal {
  background: #fff;
  border-radius: 16px;
  width: 85%;
  max-width: 340px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 36px;
  margin-bottom: 16px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #f5f2ff;
  border: 1px solid #d8d4f0;
  border-radius: 16px;
  font-size: 13px;
  color: #7c6bb0;
}

.tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: #e0daf5;
  color: #7c6bb0;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.tag-empty {
  color: #c8c4d8;
  font-size: 13px;
  padding: 6px 0;
}

.tag-add-row {
  display: flex;
  gap: 8px;
}

.tag-input {
  flex: 1;
  padding: 10px 14px;
  border: 1.5px solid #e8e6f0;
  border-radius: 10px;
  font-size: 14px;
  color: #2d2d3a;
  outline: none;
}

.tag-input:focus {
  border-color: #9b8ec4;
}

.tag-add-btn {
  padding: 10px 18px;
  background: #9b8ec4;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

  .platform-android.android-portrait .close-btn,
  .platform-android.android-portrait .save-btn-top,
  .platform-android.android-portrait .settings-row,
  .platform-android.android-portrait .tag-add-btn {
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
</style>
