<script setup>
/**
 * TodoScreen.vue - 待办全屏界面
 * 按分类分组，支持筛选（全部/待完成/已完成/已逾期）
 */
import { ref } from 'vue'
import { useTodoInventory } from '../composables/useTodoInventory.js'

const emit = defineEmits(['back'])

const todo = useTodoInventory()

// 筛选: 'all' | 'pending' | 'done' | 'overdue'
const filter = ref('pending')

// 添加弹窗
const showAddModal = ref(false)
const newForm = ref({
  title: '',
  category: 'life',
  priority: 'medium',
  dueDate: '',
  description: '',
  tags: '',
})

const CATEGORY_OPTIONS = Object.entries(todo.CATEGORY_META).map(([key, val]) => ({
  value: key,
  label: `${val.emoji} ${val.label}`,
}))

const PRIORITY_OPTIONS = Object.entries(todo.PRIORITY_META).map(([key, val]) => ({
  value: key,
  label: val.label,
  color: val.color,
}))

// 过滤数据
function filteredTodos() {
  let list = [...todo.todos]
  if (filter.value === 'pending') {
    list = list.filter(t => t.status === 'pending')
  } else if (filter.value === 'done') {
    list = list.filter(t => t.status === 'done')
  } else if (filter.value === 'overdue') {
    list = list.filter(t => t.status === 'pending' && todo.getDueStatus(t) === 'overdue')
  }
  // 排序：优先级 + 逾期状态
  return list.sort((a, b) => {
    const pa = todo.PRIORITY_META[a.priority]?.weight || 2
    const pb = todo.PRIORITY_META[b.priority]?.weight || 2
    if (pa !== pb) return pb - pa
    const order = { overdue: 3, due_today: 2, upcoming: 1, normal: 0 }
    return (order[todo.getDueStatus(b)] || 0) - (order[todo.getDueStatus(a)] || 0)
  })
}

// 按分类分组
function groupedTodos() {
  const groups = {}
  for (const t of filteredTodos()) {
    if (!groups[t.category]) groups[t.category] = []
    groups[t.category].push(t)
  }
  return groups
}

// 快捷完成/删除
async function quickComplete(id) {
  await todo.completeTodo(id)
}

async function quickDelete(id) {
  await todo.deleteTodo(id)
}

// 切换完成
async function toggleDone(item) {
  if (item.status === 'done') {
    // 恢复为未完成
    item.status = 'pending'
    item.completedAt = null
  } else {
    await quickComplete(item.id)
  }
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatDateTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 添加待办
async function saveTodo() {
  if (!newForm.value.title.trim()) return
  await todo.addTodo({
    title: newForm.value.title.trim(),
    category: newForm.value.category,
    priority: newForm.value.priority,
    dueDate: newForm.value.dueDate ? new Date(newForm.value.dueDate).toISOString() : null,
    description: newForm.value.description.trim(),
    tags: newForm.value.tags.split(',').map(t => t.trim()).filter(Boolean),
  })
  newForm.value = { title: '', category: 'life', priority: 'medium', dueDate: '', description: '', tags: '' }
  showAddModal.value = false
}
</script>

<template>
  <div class="todo-screen">
    <!-- 顶部导航 -->
    <div class="todo-header">
      <button type="button" class="back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h2 class="title">待办</h2>
      <div class="header-spacer" />
    </div>

    <!-- 统计行 -->
    <div class="stats-bar">
      <span class="stat-item">待办 <b>{{ todo.stats.pending }}</b></span>
      <span class="stat-item">已完成 <b>{{ todo.stats.done }}</b></span>
      <span class="stat-item overdue" v-if="todo.stats.overdue > 0">逾期 <b>{{ todo.stats.overdue }}</b></span>
    </div>

    <!-- 筛选按钮 -->
    <div class="filter-bar">
      <button type="button" :class="['filter-btn', { active: filter === 'pending' }]" @click="filter = 'pending'">待完成</button>
      <button type="button" :class="['filter-btn', { active: filter === 'all' }]" @click="filter = 'all'">全部</button>
      <button type="button" :class="['filter-btn', { active: filter === 'done' }]" @click="filter = 'done'">已完成</button>
      <button type="button" :class="['filter-btn', { active: filter === 'overdue' }]" @click="filter = 'overdue'">已逾期</button>
    </div>

    <!-- 内容区 -->
    <div class="todo-content">
      <div v-for="cat in todo.CATEGORY_ORDER" :key="cat" class="category-section" v-if="groupedTodos()[cat]">
        <div class="category-header">
          <span class="cat-emoji">{{ todo.CATEGORY_META[cat].emoji }}</span>
          <span class="cat-label">{{ todo.CATEGORY_META[cat].label }}</span>
          <span class="cat-count">{{ groupedTodos()[cat].length }} 项</span>
        </div>
        <div class="item-list">
          <div v-for="item in groupedTodos()[cat]" :key="item.id" class="todo-item" :class="todo.getDueStatus(item)">
            <!-- 完成勾选 -->
            <button type="button" class="check-btn" :class="{ checked: item.status === 'done' }" @click="toggleDone(item)">
              <span v-if="item.status === 'done'">&#10004;</span>
              <span v-else></span>
            </button>
            <!-- 内容 -->
            <div class="todo-body" :class="{ done: item.status === 'done' }">
              <div class="todo-title-row">
                <span class="todo-title">{{ item.title }}</span>
                <!-- 优先级标签 -->
                <span class="priority-badge" :style="{ background: todo.PRIORITY_META[item.priority]?.color }">
                  {{ todo.PRIORITY_META[item.priority]?.label }}
                </span>
              </div>
              <!-- 截止日期 -->
              <div class="todo-due" v-if="item.dueDate">
                <span :style="{ color: item.status === 'pending' && todo.getDueStatus(item) === 'overdue' ? '#ff3b30' : 'rgba(255,255,255,0.5)' }">
                  {{ todo.formatDueLabel(item) }}
                </span>
              </div>
              <!-- 标签 -->
              <div class="todo-tags" v-if="item.tags?.length">
                <span v-for="tag in item.tags" :key="tag" class="tag-pill">{{ tag }}</span>
              </div>
            </div>
            <!-- 操作按钮 -->
            <button type="button" class="todo-delete" @click="quickDelete(item.id)">&times;</button>
          </div>
        </div>
      </div>

      <p v-if="filteredTodos().length === 0" class="empty-text">
        {{ filter === 'pending' ? '暂无待办事项，真轻松！' : '没有匹配的待办事项' }}
      </p>
    </div>

    <!-- 底部添加按钮 -->
    <div class="todo-footer">
      <button type="button" class="add-btn" @click="showAddModal = true">+ 添加待办</button>
    </div>

    <!-- 添加弹窗 -->
    <div class="add-modal-overlay" v-if="showAddModal" @click.self="showAddModal = false">
      <div class="add-modal">
        <div class="modal-header">
          <h3 class="modal-title">添加待办</h3>
          <button type="button" class="modal-close" @click="showAddModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">标题 *</label>
            <input v-model="newForm.title" class="form-input" placeholder="如：买衣服、准备考试" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">分类</label>
              <select v-model="newForm.category" class="form-select">
                <option v-for="opt in CATEGORY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">优先级</label>
              <select v-model="newForm.priority" class="form-select">
                <option v-for="opt in PRIORITY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">截止日期</label>
            <input v-model="newForm.dueDate" type="datetime-local" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <input v-model="newForm.description" class="form-input" placeholder="可选" />
          </div>
          <div class="form-group">
            <label class="form-label">标签</label>
            <input v-model="newForm.tags" class="form-input" placeholder="逗号分隔，如：急,重要" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="footer-btn cancel" @click="showAddModal = false">取消</button>
          <button type="button" class="footer-btn save" @click="saveTodo">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-screen {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1c1c1e;
  color: #fff;
}

.todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(28, 28, 30, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.back-btn {
  display: flex;
  align-items: center;
  padding: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
}

.title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.header-spacer {
  width: 32px;
}

.stats-bar {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-item {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.stat-item b {
  color: #fff;
  font-weight: 600;
}

.stat-item.overdue b {
  color: #ff3b30;
}

.filter-bar {
  display: flex;
  padding: 8px 16px;
  gap: 6px;
}

.filter-btn {
  flex: 1;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
}

.filter-btn.active {
  background: rgba(255, 204, 0, 0.12);
  border-color: rgba(255, 204, 0, 0.3);
  color: #ffd60a;
}

.todo-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.category-section {
  margin-bottom: 16px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  margin-bottom: 8px;
}

.cat-emoji {
  font-size: 16px;
}

.cat-label {
  font-size: 14px;
  font-weight: 500;
}

.cat-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-left: auto;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  padding: 10px 12px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 10px;
  gap: 10px;
}

.todo-item.overdue {
  border-left: 3px solid #ff3b30;
}

.todo-item.due_today {
  border-left: 3px solid #ffcc00;
}

.check-btn {
  width: 22px;
  height: 22px;
  min-width: 22px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  background: transparent;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  margin-top: 2px;
}

.check-btn.checked {
  background: #34c759;
  border-color: #34c759;
}

.todo-body {
  flex: 1;
  min-width: 0;
}

.todo-body.done {
  opacity: 0.5;
}

.todo-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.todo-title {
  font-size: 15px;
  font-weight: 500;
}

.priority-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-weight: 500;
  white-space: nowrap;
}

.todo-due {
  font-size: 12px;
  margin-top: 2px;
}

.todo-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.tag-pill {
  font-size: 11px;
  padding: 1px 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
}

.todo-delete {
  background: none;
  border: none;
  color: rgba(255, 59, 48, 0.4);
  font-size: 18px;
  cursor: pointer;
  padding: 0 0 0 8px;
  line-height: 1;
}

.empty-text {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  padding: 40px 20px;
  font-size: 14px;
}

.todo-footer {
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.add-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  background: rgba(255, 204, 0, 0.15);
  color: #ffd60a;
}

/* 添加弹窗 */
.add-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.add-modal {
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  background: #2c2c2e;
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-title {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 24px;
  cursor: pointer;
  padding: 0 4px;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
}

.form-input, .form-select {
  width: 100%;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #fff;
  font-size: 15px;
  outline: none;
}

.form-input:focus, .form-select:focus {
  border-color: rgba(255, 204, 0, 0.4);
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.footer-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}

.footer-btn.cancel {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.footer-btn.save {
  background: rgba(255, 204, 0, 0.2);
  color: #ffd60a;
}
</style>
