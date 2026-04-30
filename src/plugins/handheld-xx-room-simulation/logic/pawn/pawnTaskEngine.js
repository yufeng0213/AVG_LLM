// 任务队列系统 - 工作分配、优先级管理

import { createPawnPathfindEngine } from './pawnPathfind.js'

const fallbackMakeId = (prefix = 'task') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const fallbackClampInt = (value, min, max, fallback) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

// 任务状态
export const TASK_STATUS_PENDING = 'pending'
export const TASK_STATUS_ASSIGNED = 'assigned'
export const TASK_STATUS_IN_PROGRESS = 'in_progress'
export const TASK_STATUS_COMPLETED = 'completed'
export const TASK_STATUS_CANCELLED = 'cancelled'

// 任务类型
export const TASK_TYPE_WORK = 'work'
export const TASK_TYPE_EAT = 'eat'
export const TASK_TYPE_SLEEP = 'sleep'
export const TASK_TYPE_SOCIAL = 'social'
export const TASK_TYPE_URGENT = 'urgent'

export const createPawnTaskEngine = (deps = {}) => {
  const makeId = deps.makeId || fallbackMakeId
  const clampInt = deps.clampInt || fallbackClampInt
  const pathfindEngine = deps.pathfindEngine || createPawnPathfindEngine()

  // 创建任务
  const createTask = (options = {}) => {
    const {
      type = TASK_TYPE_WORK,
      priority = 1,
      targetFurnitureId = '',
      workType = '',
      duration = 120,
    } = options

    return {
      id: makeId('task'),
      type,
      priority: clampInt(priority, 1, 10, 1),
      targetFurnitureId: String(targetFurnitureId || '').slice(0, 48),
      workType: String(workType || '').slice(0, 16),
      duration: clampInt(duration, 10, 600, 120),
      assignedPawnId: '',
      status: TASK_STATUS_PENDING,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      progress: 0,
      output: null,
    }
  }

  // 添加任务到队列
  const addTask = (taskQueue, task) => {
    if (!Array.isArray(taskQueue)) return []
    const newTask = createTask(task)
    taskQueue.push(newTask)
    // 按优先级排序
    taskQueue.sort((a, b) => b.priority - a.priority)
    return taskQueue
  }

  // 分配任务给小人
  const assignTaskToPawn = (task, pawn, roomState) => {
    if (!task || !pawn) return false
    if (task.status !== TASK_STATUS_PENDING) return false

    // 检查技能匹配
    if (task.workType && !hasRequiredSkill(pawn, task.workType)) {
      return false
    }

    // 检查可达性
    if (task.targetFurnitureId) {
      const furniture = roomState?.furniture?.find(f => f.id === task.targetFurnitureId)
      if (!furniture) return false

      const path = pathfindEngine.findPath(
        pawn.position,
        { x: furniture.x, y: furniture.y },
        roomState.tiles,
        roomState.width,
        roomState.height
      )
      if (!path) return false
    }

    task.assignedPawnId = pawn.id
    task.status = TASK_STATUS_ASSIGNED
    pawn.taskQueue.push(task.id)

    return true
  }

  // 自动分配待处理任务
  const autoAssignTasks = (taskQueue, pawns, roomState) => {
    const pendingTasks = taskQueue.filter(t => t.status === TASK_STATUS_PENDING)
    const availablePawns = pawns.filter(p => p.currentActivity === 'idle' && p.taskQueue.length === 0)

    for (const task of pendingTasks) {
      for (const pawn of availablePawns) {
        if (assignTaskToPawn(task, pawn, roomState)) {
          // 从可用列表中移除已分配的小人
          availablePawns.splice(availablePawns.indexOf(pawn), 1)
          break
        }
      }
    }

    return taskQueue
  }

  // 开始执行任务
  const startTask = (task) => {
    if (!task || task.status !== TASK_STATUS_ASSIGNED) return false
    task.status = TASK_STATUS_IN_PROGRESS
    task.startedAt = Date.now()
    task.progress = 0
    return true
  }

  // 更新任务进度
  const updateTaskProgress = (task, delta) => {
    if (!task || task.status !== TASK_STATUS_IN_PROGRESS) return task
    task.progress += delta
    if (task.progress >= task.duration) {
      completeTask(task)
    }
    return task
  }

  // 完成任务
  const completeTask = (task) => {
    if (!task) return false
    task.status = TASK_STATUS_COMPLETED
    task.completedAt = Date.now()
    task.progress = task.duration

    // 设置产出
    if (task.type === TASK_TYPE_WORK) {
      task.output = generateTaskOutput(task)
    }

    return true
  }

  // 取消任务
  const cancelTask = (task, reason = '') => {
    if (!task) return false
    task.status = TASK_STATUS_CANCELLED
    task.completedAt = Date.now()
    return true
  }

  // 从队列中移除完成的任务
  const removeCompletedTasks = (taskQueue) => {
    if (!Array.isArray(taskQueue)) return []
    return taskQueue.filter(t =>
      t.status !== TASK_STATUS_COMPLETED && t.status !== TASK_STATUS_CANCELLED
    )
  }

  // 生成任务产出
  const generateTaskOutput = (task) => {
    switch (task.workType) {
      case 'crafting':
        return { type: 'material', name: '制作材料', amount: 2 }
      case 'cooking':
        return { type: 'food', name: '简单餐食', amount: 1 }
      case 'research':
        return { type: 'knowledge', name: '研究成果', amount: 1 }
      default:
        return null
    }
  }

  // 检查是否有必需技能
  const hasRequiredSkill = (pawn, workType) => {
    const skill = pawn?.skills
    if (!skill) return false

    switch (workType) {
      case 'crafting':
        return skill.crafting?.level >= 1
      case 'cooking':
        return skill.cooking?.level >= 1
      case 'research':
        return skill.social?.level >= 1
      case 'cleaning':
        return skill.cleaning?.level >= 1
      default:
        return true
    }
  }

  // 获取小人的活跃任务
  const getPawnActiveTask = (pawn, taskQueue) => {
    if (!pawn?.taskQueue?.length) return null
    return taskQueue.find(t =>
      t.assignedPawnId === pawn.id &&
      (t.status === TASK_STATUS_ASSIGNED || t.status === TASK_STATUS_IN_PROGRESS)
    ) || null
  }

  // 规范化任务数据
  const normalizeTask = (raw) => {
    if (!raw || typeof raw !== 'object') return createTask()

    return {
      id: String(raw.id || makeId('task')).slice(0, 48),
      type: [TASK_TYPE_WORK, TASK_TYPE_EAT, TASK_TYPE_SLEEP, TASK_TYPE_SOCIAL, TASK_TYPE_URGENT].includes(raw.type)
        ? raw.type : TASK_TYPE_WORK,
      priority: clampInt(raw.priority, 1, 10, 1),
      targetFurnitureId: String(raw.targetFurnitureId || '').slice(0, 48),
      workType: String(raw.workType || '').slice(0, 16),
      duration: clampInt(raw.duration, 10, 600, 120),
      assignedPawnId: String(raw.assignedPawnId || '').slice(0, 48),
      status: [TASK_STATUS_PENDING, TASK_STATUS_ASSIGNED, TASK_STATUS_IN_PROGRESS, TASK_STATUS_COMPLETED, TASK_STATUS_CANCELLED].includes(raw.status)
        ? raw.status : TASK_STATUS_PENDING,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
      startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : null,
      completedAt: Number.isFinite(raw.completedAt) ? raw.completedAt : null,
      progress: clampInt(raw.progress, 0, 600, 0),
      output: raw.output || null,
    }
  }

  // 规范化任务列表
  const normalizeTaskList = (rawList) => {
    if (!Array.isArray(rawList)) return []
    return rawList.slice(0, 50).map(normalizeTask)
  }

  return {
    createTask,
    addTask,
    assignTaskToPawn,
    autoAssignTasks,
    startTask,
    updateTaskProgress,
    completeTask,
    cancelTask,
    removeCompletedTasks,
    generateTaskOutput,
    hasRequiredSkill,
    getPawnActiveTask,
    normalizeTask,
    normalizeTaskList,
  }
}

export default createPawnTaskEngine