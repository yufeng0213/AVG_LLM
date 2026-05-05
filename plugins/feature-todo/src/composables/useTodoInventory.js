/**
 * useTodoInventory.js - 全局待办管理
 * 支持增删改查、逾期检测、到期推送、LLM上下文生成
 */
import { computed, reactive, ref } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'

const STORAGE_KEY = 'avg_llm_todos_v1'
const STORAGE_KEY_SEEDED = 'avg_llm_todos_v1_seeded'

// 分类元信息
const CATEGORY_META = {
  work:    { label: '工作', emoji: '💼' },
  study:   { label: '学习', emoji: '📚' },
  life:    { label: '生活', emoji: '🏠' },
  shopping: { label: '购物', emoji: '🛒' },
  health:  { label: '健康', emoji: '💪' },
  social:  { label: '社交', emoji: '🤝' },
  other:   { label: '其他', emoji: '📋' },
}

// 优先级元信息
const PRIORITY_META = {
  urgent:  { label: '紧急', color: '#ff3b30', weight: 4 },
  high:    { label: '高', color: '#ff9500', weight: 3 },
  medium:  { label: '中', color: '#ffcc00', weight: 2 },
  low:     { label: '低', color: '#34c759', weight: 1 },
}

// 分类顺序
const CATEGORY_ORDER = ['work', 'study', 'life', 'shopping', 'health', 'social', 'other']

// 模块级状态（本身就是 reactive 代理，确保 splice 等突变触发响应式）
let _todos = reactive([])
let _initialized = false
let _notifCounter = 10000

async function loadFromStorage() {
  const stored = await kvStorage.get(STORAGE_KEY)
  const loaded = Array.isArray(stored) ? stored : []

  // 首次使用：自动添加示例待办
  const alreadySeeded = await kvStorage.get(STORAGE_KEY_SEEDED)
  if (!alreadySeeded && loaded.length === 0) {
    const now = new Date()
    loaded.push(
      {
        id: 'todo_seed_1', title: '朋友圈/动态功能', category: 'social', priority: 'urgent',
        status: 'pending', dueDate: null, createdAt: now.toISOString(), completedAt: null,
        description: '在feature-phone内实现朋友圈/动态系统，角色发动态，玩家点赞评论',
        tags: ['开发中'],
      },
      {
        id: 'todo_seed_2', title: '角色已读/未读标记', category: 'social', priority: 'high',
        status: 'pending', dueDate: null, createdAt: now.toISOString(), completedAt: null,
        description: '短信已读状态，角色偶尔已读不回',
        tags: ['待开发'],
      },
      {
        id: 'todo_seed_3', title: '角色在线状态/签名', category: 'social', priority: 'medium',
        status: 'pending', dueDate: null, createdAt: now.toISOString(), completedAt: null,
        description: '角色在线状态、个性签名显示',
        tags: ['待开发'],
      },
      {
        id: 'todo_seed_4', title: '红包+经济循环系统', category: 'social', priority: 'medium',
        status: 'pending', dueDate: null, createdAt: now.toISOString(), completedAt: null,
        description: '红包收入变零花钱余额，可买小礼物送角色，角色回赠，形成经济循环',
        tags: ['待开发'],
      },
    )
    await kvStorage.set(STORAGE_KEY_SEEDED, true)
    await saveTodos()
  }

  // 同步到已存在的数组引用，保持 reactive 代理有效
  _todos.splice(0, _todos.length, ...loaded)
  _initialized = true
}

async function saveTodos() {
  await kvStorage.set(STORAGE_KEY, _todos)
}

// 判断待办状态：'overdue' | 'due_today' | 'upcoming' | 'normal'
function getDueStatus(todo) {
  if (!todo.dueDate) return 'normal'
  const now = new Date()
  const due = new Date(todo.dueDate)
  const diffMs = due - now
  const diffHours = diffMs / (1000 * 60 * 60)
  if (diffHours < 0) return 'overdue'
  if (diffHours <= 24) return 'due_today'
  return 'upcoming'
}

// 生成ID
function genId() {
  return `todo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function useTodoInventory() {
  if (!_initialized) {
    _initialized = true
    loadFromStorage()
  }

  const isLoading = ref(false)
  const todos = _todos // _todos 已是 reactive 代理，直接引用

  // 按时间分组（未完成待办）
  const groupedByTime = computed(() => {
    const groups = { today: [], tomorrow: [], future: [], overdue: [] }
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dayAfter = new Date(tomorrow)
    dayAfter.setDate(dayAfter.getDate() + 1)

    for (const t of todos) {
      if (t.status === 'done') continue
      const ds = getDueStatus(t)
      if (ds === 'overdue') {
        groups.overdue.push(t)
      } else if (t.dueDate) {
        const due = new Date(t.dueDate)
        if (due >= tomorrow && due < dayAfter) {
          groups.tomorrow.push(t)
        } else if (due >= dayAfter) {
          groups.future.push(t)
        } else {
          groups.today.push(t)
        }
      } else {
        groups.today.push(t)
      }
    }
    return groups
  })

  // 按分类分组（仅未完成）
  const categorizedTodos = computed(() => {
    const groups = {}
    const active = todos.filter(t => t.status === 'pending')
    for (const cat of CATEGORY_ORDER) {
      const items = active.filter(t => t.category === cat)
      if (items.length > 0) {
        groups[cat] = items
      }
    }
    return groups
  })

  // 统计
  const stats = computed(() => {
    const pending = todos.filter(t => t.status === 'pending')
    const done = todos.filter(t => t.status === 'done')
    const overdue = pending.filter(t => getDueStatus(t) === 'overdue')
    const dueToday = pending.filter(t => getDueStatus(t) === 'due_today')
    return {
      total: todos.length,
      pending: pending.length,
      done: done.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
    }
  })

  // 完成率
  const completionRate = computed(() => {
    return todos.length ? Math.round(todos.filter(t => t.status === 'done').length / todos.length * 100) : 0
  })

  // 按分类统计
  const statsByCategory = computed(() => {
    const result = {}
    for (const cat of CATEGORY_ORDER) {
      result[cat] = todos.filter(t => t.category === cat).length
    }
    return result
  })

  // 已完成（最近7天）
  const recentDone = computed(() => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    return todos
      .filter(t => t.status === 'done' && t.completedAt && new Date(t.completedAt) >= weekAgo)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
  })

  // 添加待办
  async function addTodo(todo) {
    const newItem = {
      id: genId(),
      title: todo.title || '',
      description: todo.description || '',
      category: todo.category || 'other',
      priority: todo.priority || 'medium',
      status: 'pending',
      dueDate: todo.dueDate || null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      tags: Array.isArray(todo.tags) ? todo.tags : [],
      reminder: todo.reminder ?? true, // 是否调度推送通知
    }
    todos.push(newItem)
    await saveTodos()

    // 如果有截止日期且开启提醒，调度推送
    if (newItem.dueDate && newItem.reminder) {
      await scheduleReminder(newItem)
    }

    dispatchTodoEvent('TODO_ADDED', { todo: newItem })
    return newItem
  }

  // 更新待办
  async function updateTodo(todoId, updates) {
    const todo = todos.find(t => t.id === todoId)
    if (!todo) return
    Object.assign(todo, updates)
    await saveTodos()

    // 如果更新了dueDate，重新调度通知
    if (updates.dueDate !== undefined && todo.dueDate && todo.reminder) {
      await scheduleReminder(todo)
    } else if (updates.dueDate === null || updates.reminder === false) {
      await cancelReminder(todoId)
    }

    dispatchTodoEvent('TODO_UPDATED', { todo })
  }

  // 完成待办
  async function completeTodo(todoId) {
    const todo = todos.find(t => t.id === todoId)
    if (!todo) return
    todo.status = 'done'
    todo.completedAt = new Date().toISOString()
    await saveTodos()
    await cancelReminder(todoId)
    dispatchTodoEvent('TODO_COMPLETED', { todo })
  }

  // 删除待办
  async function deleteTodo(todoId) {
    const idx = todos.findIndex(t => t.id === todoId)
    if (idx === -1) return
    const removed = todos.splice(idx, 1)[0]
    await saveTodos()
    await cancelReminder(todoId)
    dispatchTodoEvent('TODO_DELETED', { todo: removed })
  }

  // 批量完成/删除
  async function batchComplete(category) {
    const list = category ? todos.filter(t => t.category === category && t.status === 'pending') : todos.filter(t => t.status === 'pending')
    for (const t of list) {
      t.status = 'done'
      t.completedAt = new Date().toISOString()
      await cancelReminder(t.id)
    }
    await saveTodos()
  }

  async function batchDelete(category) {
    const list = category ? todos.filter(t => t.category === category && t.status === 'done') : todos.filter(t => t.status === 'done')
    for (const t of list) {
      const idx = todos.indexOf(t)
      if (idx !== -1) todos.splice(idx, 1)
    }
    await saveTodos()
  }

  // LLM上下文生成
  function getContextForLLM(limit = 8) {
    const pending = todos.filter(t => t.status === 'pending')
    if (pending.length === 0) return null

    const sorted = [...pending].sort((a, b) => {
      // 先按优先级，再按是否逾期
      const pa = PRIORITY_META[a.priority]?.weight || 2
      const pb = PRIORITY_META[b.priority]?.weight || 2
      if (pa !== pb) return pb - pa
      const sa = getDueStatus(a)
      const sb = getDueStatus(b)
      const order = { overdue: 3, due_today: 2, upcoming: 1, normal: 0 }
      return (order[sb] || 0) - (order[sa] || 0)
    })

    const picked = sorted.slice(0, limit)
    const parts = picked.map(t => {
      const due = t.dueDate ? formatDueLabel(t) : ''
      return `${t.title}${due}`
    })
    return `待完成${picked.length}项：${parts.join('、')}`
  }

  // 辅助：格式化截止提示
  function formatDueLabel(todo) {
    const status = getDueStatus(todo)
    if (status === 'overdue') {
      const now = new Date()
      const due = new Date(todo.dueDate)
      const days = Math.ceil((now - due) / (1000 * 60 * 60 * 24))
      return `(已逾期${days}天)`
    }
    if (status === 'due_today') return '(今天到期)'
    if (status === 'upcoming') {
      const due = new Date(todo.dueDate)
      return `(${due.getMonth() + 1}/${due.getDate()})`
    }
    return ''
  }

  // 推送通知调度
  async function scheduleReminder(todo) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')

      // 检查权限（Android 13+）
      const perm = await LocalNotifications.checkPermissions()
      if (perm.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions()
        if (req.display !== 'granted') return
      }

      // 取消旧的通知
      await cancelReminder(todo.id)

      const dueDate = new Date(todo.dueDate)
      if (dueDate <= new Date()) return // 已经过了，不调度

      // 调度：到期时间前1小时提醒
      const remindAt = new Date(dueDate.getTime() - 60 * 60 * 1000)
      if (remindAt <= new Date()) {
        // 如果截止时间太近，直接用截止时间
        remindAt.setTime(dueDate.getTime())
      }
      // 最早15秒后（太近的通知可能不触发）
      const soonest = new Date(Date.now() + 15000)
      if (remindAt < soonest) remindAt.setTime(soonest.getTime())

      const notifId = ++_notifCounter
      // 存到todo上
      todo._notifId = notifId

      await LocalNotifications.schedule({
        notifications: [{
          title: `📋 待办提醒`,
          body: `${todo.title} ${formatDueLabel(todo)}`,
          id: notifId,
          schedule: {
            at: remindAt,
            allowsWhileIdle: true,
          },
          extra: {
            todoId: todo.id,
            type: 'todo_reminder',
          },
          actionTypeId: '',
          sound: null,
          attachments: null,
        }],
      })
    } catch (err) {
      console.warn('[TodoReminder] 通知调度失败（可能因为非原生环境）:', err.message)
    }
  }

  // 取消通知
  async function cancelReminder(todoId) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const todo = _todos.find(t => t.id === todoId)
      if (todo && todo._notifId) {
        await LocalNotifications.cancel({ notifications: [{ id: todo._notifId }] })
        delete todo._notifId
      }
    } catch (err) {
      // 非原生环境忽略
    }
  }

  // 重载数据
  async function reload() {
    isLoading.value = true
    await loadFromStorage()
    isLoading.value = false
  }

  return {
    todos,
    isLoading,
    categorizedTodos,
    groupedByTime,
    stats,
    completionRate,
    statsByCategory,
    recentDone,
    addTodo,
    updateTodo,
    completeTodo,
    deleteTodo,
    batchComplete,
    batchDelete,
    getContextForLLM,
    formatDueLabel,
    getDueStatus,
    reload,
    CATEGORY_META,
    CATEGORY_ORDER,
    PRIORITY_META,
  }
}

// ---- 事件系统 ----

const todoEventListeners = new Map()

export const TODO_EVENTS = {
  TODO_ADDED: 'todo:added',
  TODO_UPDATED: 'todo:updated',
  TODO_COMPLETED: 'todo:completed',
  TODO_DELETED: 'todo:deleted',
}

function dispatchTodoEvent(eventType, data) {
  const listeners = todoEventListeners.get(eventType)
  if (listeners) {
    listeners.forEach(cb => {
      try { cb(data) } catch (e) { console.warn('[TodoEvent] callback error:', e) }
    })
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(eventType, { detail: data }))
  }
}

export function onTodoEvent(eventType, callback) {
  if (!todoEventListeners.has(eventType)) {
    todoEventListeners.set(eventType, new Set())
  }
  todoEventListeners.get(eventType).add(callback)
}

export function offTodoEvent(eventType, callback) {
  const listeners = todoEventListeners.get(eventType)
  if (listeners) listeners.delete(callback)
}
