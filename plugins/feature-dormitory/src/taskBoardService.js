/**
 * 任务板服务
 * 负责任务存储、生命周期管理
 */

const TASK_BOARD_STORAGE_KEY = 'avg_llm_dormitory_world_book_tasks_v1'

/**
 * 加载任务板数据
 */
export const loadTaskBoard = (bookId) => {
  try {
    const raw = window.localStorage.getItem(TASK_BOARD_STORAGE_KEY)
    if (raw) {
      const all = JSON.parse(raw)
      return all[bookId] || { tasks: [], lastGenerated: 0 }
    }
  } catch {
    // ignore
  }
  return { tasks: [], lastGenerated: 0 }
}

/**
 * 保存任务板数据
 */
export const saveTaskBoard = (bookId, data) => {
  try {
    const raw = window.localStorage.getItem(TASK_BOARD_STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    all[bookId] = data
    window.localStorage.setItem(TASK_BOARD_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

/**
 * 清除任务板数据
 */
export const clearTaskBoard = (bookId) => {
  try {
    const raw = window.localStorage.getItem(TASK_BOARD_STORAGE_KEY)
    if (raw) {
      const all = JSON.parse(raw)
      delete all[bookId]
      window.localStorage.setItem(TASK_BOARD_STORAGE_KEY, JSON.stringify(all))
    }
  } catch {
    // ignore
  }
}

/**
 * 生成任务 ID
 */
let _taskIdCounter = 0
export const generateTaskId = () => `task_${Date.now()}_${++_taskIdCounter}`

/**
 * 领取任务
 */
export const acceptTask = (board, taskId) => {
  const task = board.tasks.find((t) => t.id === taskId)
  if (!task || task.status !== 'available') return board
  task.status = 'accepted'
  task.acceptedAt = Date.now()
  return { ...board, tasks: [...board.tasks] }
}

/**
 * 提交任务描述（支持 accepted 和 completable 状态）
 */
export const submitTask = (board, taskId, description) => {
  const task = board.tasks.find((t) => t.id === taskId)
  if (!task || (task.status !== 'accepted' && task.status !== 'completable')) return board
  task.status = 'submitted'
  task.userDescription = description || task.evidence?.summary || ''
  task.submittedAt = Date.now()
  return { ...board, tasks: [...board.tasks] }
}

/**
 * 开始执行任务（accepted → in_progress）
 */
export const startTaskExecution = (board, taskId) => {
  const task = board.tasks.find((t) => t.id === taskId)
  if (!task || (task.status !== 'accepted' && task.status !== 'completable')) return board
  task.status = 'in_progress'
  task.startedAt = Date.now()
  return { ...board, tasks: [...board.tasks] }
}

/**
 * 标记任务可完成（in_progress → completable）
 */
export const markTaskCompletable = (board, taskId, evidence) => {
  const task = board.tasks.find((t) => t.id === taskId)
  if (!task || task.status !== 'in_progress') return board
  task.status = 'completable'
  task.evidence = evidence
  task.completableAt = Date.now()
  return { ...board, tasks: [...board.tasks] }
}

/**
 * 完成任务（发放奖励）
 */
export const completeTask = (board, taskId) => {
  const task = board.tasks.find((t) => t.id === taskId)
  if (!task || task.status !== 'submitted') return board
  task.status = 'completed'
  task.completedAt = Date.now()
  return { ...board, tasks: [...board.tasks] }
}

/**
 * 删除任务
 */
export const deleteTask = (board, taskId) => {
  const filtered = board.tasks.filter((t) => t.id !== taskId)
  return { ...board, tasks: filtered }
}

/**
 * 合并新任务到任务板
 */
export const mergeTasks = (board, newTasks) => {
  const tasks = [...board.tasks, ...newTasks]
  return { ...board, tasks, lastGenerated: Date.now() }
}

/**
 * 清理已完成的任务（可选）
 */
export const cleanupCompletedTasks = (board) => {
  const tasks = board.tasks.filter((t) => t.status !== 'completed')
  return { ...board, tasks }
}

// ==================== 任务执行 Session ====================

const TASK_EXECUTION_STORAGE_KEY = 'avg_llm_dormitory_world_book_task_execution_v1'
const TASK_EXECUTION_HISTORY_STORAGE_KEY = 'avg_llm_dormitory_world_book_task_execution_history_v1'

/**
 * 加载任务执行 session（当前活跃的执行记录）
 */
export const loadTaskExecutionSession = (taskId) => {
  try {
    const raw = window.localStorage.getItem(TASK_EXECUTION_STORAGE_KEY)
    if (raw) {
      const all = JSON.parse(raw)
      return all[taskId] || null
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * 保存任务执行 session（当前活跃的执行记录）
 */
export const saveTaskExecutionSession = (taskId, session) => {
  try {
    const raw = window.localStorage.getItem(TASK_EXECUTION_STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    all[taskId] = session
    window.localStorage.setItem(TASK_EXECUTION_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

/**
 * 清除当前活跃的任务执行 session（提交完成时调用）
 * 但保留历史记录
 */
export const clearTaskExecutionSession = (taskId) => {
  try {
    const raw = window.localStorage.getItem(TASK_EXECUTION_STORAGE_KEY)
    if (raw) {
      const all = JSON.parse(raw)
      delete all[taskId]
      window.localStorage.setItem(TASK_EXECUTION_STORAGE_KEY, JSON.stringify(all))
    }
  } catch {
    // ignore
  }
}

/**
 * 将当前 session 归档到历史记录
 */
export const archiveExecutionSession = (taskId, session) => {
  try {
    const raw = window.localStorage.getItem(TASK_EXECUTION_HISTORY_STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    if (!all[taskId]) all[taskId] = []
    all[taskId].push({
      ...session,
      archivedAt: Date.now(),
    })
    window.localStorage.setItem(TASK_EXECUTION_HISTORY_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

/**
 * 加载任务的全部执行历史
 */
export const loadTaskExecutionHistory = (taskId) => {
  try {
    const raw = window.localStorage.getItem(TASK_EXECUTION_HISTORY_STORAGE_KEY)
    if (raw) {
      const all = JSON.parse(raw)
      return all[taskId] || []
    }
  } catch {
    // ignore
  }
  return []
}

/**
 * 清除任务的全部执行历史
 */
export const clearTaskExecutionHistory = (taskId) => {
  try {
    const raw = window.localStorage.getItem(TASK_EXECUTION_HISTORY_STORAGE_KEY)
    if (raw) {
      const all = JSON.parse(raw)
      delete all[taskId]
      window.localStorage.setItem(TASK_EXECUTION_HISTORY_STORAGE_KEY, JSON.stringify(all))
    }
  } catch {
    // ignore
  }
}
