<script setup>
import { ref } from 'vue'
import { useTodoInventory } from './composables/useTodoInventory.js'

const todo = useTodoInventory()
const emit = defineEmits(['switchTab'])

const filter = ref('pending')

const filterTabs = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待完成' },
  { key: 'done', label: '已完成' },
  { key: 'overdue', label: '已逾期' },
]

const confirmDeleteId = ref(null)

function filteredTodos(group) {
  let list = todo.groupedByTime[group] || []
  if (filter.value === 'pending') {
    list = list.filter(t => t.status === 'pending')
  } else if (filter.value === 'done') {
    list = list.filter(t => t.status === 'done')
  } else if (filter.value === 'overdue') {
    list = list.filter(t => t.status === 'pending' && todo.getDueStatus(t) === 'overdue')
  }
  return list
}

async function toggleDone(item) {
  if (item.status === 'done') {
    item.status = 'pending'
    item.completedAt = null
    await todo.updateTodo(item.id, { status: 'pending', completedAt: null })
  } else {
    await todo.completeTodo(item.id)
  }
}

async function deleteTodo(id) {
  if (confirmDeleteId.value === id) {
    await todo.deleteTodo(id)
    confirmDeleteId.value = null
  } else {
    confirmDeleteId.value = id
    setTimeout(() => { confirmDeleteId.value = null }, 2000)
  }
}

function getDueLabel(t) {
  if (!t.dueDate) return ''
  const ds = todo.getDueStatus(t)
  if (ds === 'overdue') {
    const days = Math.ceil((new Date() - new Date(t.dueDate)) / 86400000)
    return `逾期 ${days} 天`
  }
  if (ds === 'due_today') return '今天到期'
  const d = new Date(t.dueDate)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

const timeGroups = [
  { key: 'today', label: '今天', dot: '', dotColor: '#ffa94d' },
  { key: 'tomorrow', label: '明天', dot: '🟡', dotColor: '#ffd43b' },
  { key: 'future', label: '未来', dot: '⚪', dotColor: '#ccc' },
  { key: 'overdue', label: '逾期', dot: '', dotColor: '#ff6b6b' },
]
</script>

<template>
  <div class="todo-list-view">
    <!-- 顶部标题 -->
    <div class="list-header">
      <h1 class="list-title">我的待办</h1>
      <button type="button" class="settings-icon-btn" @click="emit('switchTab', 'settings')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      </button>
    </div>

    <!-- 筛选胶囊 -->
    <div class="filter-bar">
      <div class="filter-segmented">
        <button
          v-for="tab in filterTabs"
          :key="tab.key"
          type="button"
          :class="['seg-btn', { active: filter === tab.key }]"
          @click="filter = tab.key"
        >{{ tab.label }}</button>
      </div>
    </div>

    <!-- 列表内容 -->
    <div class="list-content">
      <template v-for="grp in timeGroups" :key="grp.key">
        <div v-if="filteredTodos(grp.key).length" class="time-group">
          <div class="group-header">
            <span class="group-dot" :style="{ color: grp.dotColor }">{{ grp.dot }}</span>
            <span class="group-label">{{ grp.label }}</span>
            <span class="group-count">{{ filteredTodos(grp.key).length }}</span>
          </div>
          <div class="todo-items">
            <div
              v-for="item in filteredTodos(grp.key)"
              :key="item.id"
              class="todo-item"
              :class="{ overdue: grp.key === 'overdue' }"
            >
              <!-- 复选框 -->
              <button type="button" class="check-btn" :class="{ checked: item.status === 'done' }" @click="toggleDone(item)">
                <svg v-if="item.status === 'done'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
              <!-- 内容 -->
              <div class="item-body" :class="{ done: item.status === 'done' }">
                <div class="item-title">{{ item.title }}</div>
                <div class="item-meta">
                  <span class="item-cat">{{ todo.CATEGORY_META[item.category]?.emoji }} {{ todo.CATEGORY_META[item.category]?.label }}</span>
                  <span class="item-due" v-if="item.dueDate">{{ getDueLabel(item) }}</span>
                </div>
              </div>
              <!-- 优先级色点 -->
              <span class="priority-dot" :style="{ background: todo.PRIORITY_META[item.priority]?.color }" :title="todo.PRIORITY_META[item.priority]?.label" />
              <!-- 删除 -->
              <button type="button" class="delete-btn" :class="{ confirm: confirmDeleteId === item.id }" @click="deleteTodo(item.id)">
                {{ confirmDeleteId === item.id ? '确认?' : '×' }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-if="filteredTodos('today').length + filteredTodos('tomorrow').length + filteredTodos('future').length + filteredTodos('overdue').length === 0" class="empty-state">
        <div class="empty-icon">✨</div>
        <p class="empty-text">暂无待办，享受当下吧</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-list-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  padding-top: max(16px, var(--safe-area-inset-top, 16px));
}

.list-title {
  font-size: 24px;
  font-weight: 700;
  color: #2d2d3a;
  margin: 0;
}

.settings-icon-btn {
  background: none;
  border: none;
  color: #8888a0;
  cursor: pointer;
  padding: 4px;
}

/* 筛选胶囊 — 整体分段式 */
.filter-bar {
  display: flex;
  justify-content: center;
  padding: 0 20px 14px;
}

.filter-segmented {
  display: flex;
  background: transparent;
  border: 1.5px solid #e8e4f5;
  border-radius: 22px;
  padding: 6px;
  gap: 6px;
}

.seg-btn {
  padding: 7px 16px;
  border: none;
  border-radius: 22px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  color: #8888a0;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.seg-btn.active {
  background: #9b8ec4;
  color: #fff;
  box-shadow: 0 2px 8px rgba(155, 142, 196, 0.3);
}

/* 列表内容 */
.list-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px 16px 90px;
}

.time-group {
  margin-bottom: 20px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 8px;
}

.group-dot {
  font-size: 10px;
}

.group-label {
  font-size: 14px;
  font-weight: 600;
  color: #2d2d3a;
}

.group-count {
  margin-left: auto;
  font-size: 12px;
  color: #8888a0;
}

.todo-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  transition: opacity 0.2s;
}

.todo-item.overdue {
  border-left: 3px solid #ff6b6b;
}

.check-btn {
  width: 22px;
  height: 22px;
  min-width: 22px;
  border: 2px solid #d0cce0;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s;
}

.check-btn.checked {
  background: #51cf66;
  border-color: #51cf66;
}

.item-body {
  flex: 1;
  min-width: 0;
}

.item-body.done {
  opacity: 0.45;
}

.item-body.done .item-title {
  text-decoration: line-through;
  color: #aaa;
}

.item-title {
  font-size: 15px;
  font-weight: 500;
  color: #2d2d3a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  gap: 12px;
  margin-top: 3px;
}

.item-cat {
  font-size: 12px;
  color: #8888a0;
}

.item-due {
  font-size: 12px;
  color: #ffa94d;
}

.todo-item.overdue .item-due {
  color: #ff6b6b;
}

.priority-dot {
  width: 8px;
  height: 8px;
  min-width: 8px;
  border-radius: 50%;
}

.delete-btn {
  background: none;
  border: none;
  color: #ccc;
  font-size: 18px;
  cursor: pointer;
  padding: 0 0 0 4px;
  line-height: 1;
  transition: color 0.2s;
}

.delete-btn.confirm {
  color: #ff6b6b;
  font-size: 12px;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 15px;
  color: #8888a0;
  margin: 0;
}

  .platform-android.android-portrait .settings-icon-btn,
  .platform-android.android-portrait .check-btn,
  .platform-android.android-portrait .delete-btn {
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

  .platform-android.android-portrait .seg-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 14px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 22px !important;
    white-space: nowrap !important;
  }

</style>
