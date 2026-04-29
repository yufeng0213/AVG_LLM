/**
 * 全局任务板 Composable
 * 任务刷新时随机选取一个世界书作为上下文，奖励存入全局经济。
 */

import { computed, ref } from 'vue'
import { usePlayerState } from '../../../../src/stores/playerState.store.js'
import { loadWorldBooks } from '../../../../src/worldbook/worldBookStore.js'
import { generateTaskBoardTasks } from '../../../../src/llm'
import {
  loadTaskBoard,
  saveTaskBoard,
  acceptTask,
  submitTask,
  completeTask,
  deleteTask,
  mergeTasks,
  generateTaskId,
  cleanupCompletedTasks,
  startTaskExecution,
  markTaskCompletable,
  loadTaskExecutionSession,
} from '../taskBoardService.js'

const GLOBAL_TASK_STORAGE_KEY = 'avg_llm_global_tasks_v1'
const DORM_CHAT_HISTORY_LIMIT = 24

function readGlobalTaskBoard() {
  try {
    const raw = localStorage.getItem(GLOBAL_TASK_STORAGE_KEY)
    if (!raw) return { tasks: [], lastGenerated: 0 }
    const data = JSON.parse(raw)
    return {
      tasks: Array.isArray(data.tasks) ? data.tasks.filter(Boolean) : [],
      lastGenerated: data.lastGenerated || 0,
    }
  } catch {
    return { tasks: [], lastGenerated: 0 }
  }
}

function persistGlobalTaskBoard(board) {
  try {
    localStorage.setItem(GLOBAL_TASK_STORAGE_KEY, JSON.stringify(board))
  } catch {
    // ignore
  }
}

export function useGlobalTaskBoard() {
  const playerState = usePlayerState()

  const isTaskBoardOpen = ref(false)
  const taskBoardTasks = ref([])
  const taskBoardGenerating = ref(false)
  const taskBoardFeedback = ref('')
  const isTaskExecutionOpen = ref(false)
  const currentExecutionTask = ref(null)

  function loadGlobalTasks() {
    const board = readGlobalTaskBoard()
    taskBoardTasks.value = board.tasks || []
    return board
  }

  function saveGlobalTasks(board) {
    persistGlobalTaskBoard(board)
  }

  const getAcceptedTasksForInvite = computed(() => {
    return taskBoardTasks.value.filter((t) =>
      t && (t.status === 'accepted' || t.status === 'in_progress' || t.status === 'completable')
    )
  })

  function handleOpenTaskBoard() {
    loadGlobalTasks()
    taskBoardFeedback.value = ''
    isTaskBoardOpen.value = true
  }

  function handleCloseTaskBoard() {
    const cleaned = cleanupCompletedTasks({ tasks: taskBoardTasks.value })
    taskBoardTasks.value = cleaned.tasks
    persistGlobalTaskBoard({ tasks: taskBoardTasks.value, lastGenerated: Date.now() })
    isTaskBoardOpen.value = false
  }

  async function handleGenerateTaskBoardTasks() {
    if (taskBoardGenerating.value) return
    taskBoardGenerating.value = true
    taskBoardFeedback.value = ''

    try {
      // 随机选一个世界书
      const allBooks = await loadWorldBooks()
      if (allBooks.length === 0) {
        taskBoardFeedback.value = '暂无世界书，无法生成任务'
        return
      }
      const randomBook = allBooks[Math.floor(Math.random() * allBooks.length)]

      const result = await generateTaskBoardTasks({
        worldBook: randomBook,
        count: 5,
      })

      if (!result.success || result.tasks.length === 0) {
        taskBoardFeedback.value = '任务生成失败：' + (result.error || '未知错误')
        return
      }

      const newTasks = result.tasks.map((t) => ({
        ...t,
        id: generateTaskId(),
        status: 'available',
        createdAt: Date.now(),
        // 标注来源世界书
        sourceBookId: randomBook.id,
        sourceBookTitle: randomBook.title,
      }))

      const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
      const cleaned = cleanupCompletedTasks(board)
      const merged = mergeTasks(cleaned, newTasks)
      taskBoardTasks.value = merged.tasks
      persistGlobalTaskBoard(merged)

      const bookLabel = randomBook.title ? `《${randomBook.title}》` : ''
      taskBoardFeedback.value = `已生成 ${newTasks.length} 个新任务${bookLabel}！`
    } catch (e) {
      taskBoardFeedback.value = '任务生成异常：' + (e.message || '未知错误')
    } finally {
      taskBoardGenerating.value = false
    }
  }

  function handleAcceptTaskBoardTask(taskId) {
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const updated = acceptTask(board, taskId)
    taskBoardTasks.value = updated.tasks
    persistGlobalTaskBoard(updated)
  }

  function handleSubmitTaskBoardTask(taskId, description) {
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const updated = submitTask(board, taskId, description)
    taskBoardTasks.value = updated.tasks
    persistGlobalTaskBoard(updated)
  }

  function handleCompleteTaskBoardTask(taskId) {
    const task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task || (task.status !== 'submitted' && task.status !== 'completable')) return

    // 发放奖励到全局经济
    if (task.rewardType === 'coins') {
      const amount = Math.floor(task.rewardAmount)
      playerState.updateEconomy(prev => ({
        ...prev,
        coins: Math.min(9999, (prev.coins || 0) + amount),
      }))
      taskBoardFeedback.value = `任务完成！获得 💰 ${amount} 金币`
    } else if (task.rewardType === 'crystals') {
      const amount = Math.floor(task.rewardAmount)
      playerState.updateEconomy(prev => ({
        ...prev,
        crystals: Math.min(9999, (prev.crystals || 0) + amount),
      }))
      taskBoardFeedback.value = `任务完成！获得 💎 ${amount} 晶石`
    } else if (task.rewardType === 'item') {
      playerState.addToInventory({
        id: `task_item_${Date.now()}`,
        name: task.name + ' 奖励',
        description: `完成任务「${task.name}」获得的物品`,
        icon: '🎁',
        category: 'misc',
        price: task.rewardAmount || 30,
        scope: 'global',
      })
      taskBoardFeedback.value = `任务完成！获得 🎁 ${task.name}`
    }

    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const updated = completeTask(board, taskId)
    taskBoardTasks.value = updated.tasks
    persistGlobalTaskBoard(updated)
  }

  function handleDeleteTaskBoardTask(taskId) {
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const updated = deleteTask(board, taskId)
    taskBoardTasks.value = updated.tasks
    persistGlobalTaskBoard(updated)
  }

  function handleTaskInviteClick(taskId) {
    let task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task) {
      const session = loadTaskExecutionSession(taskId)
      if (session) {
        task = {
          id: taskId,
          name: session.taskName || '未知任务',
          type: 'daily',
          targetCharacterId: session.targetCharacterId || '',
          targetCharacterName: session.targetCharacterName || '',
        }
      }
    }
    if (!task) return

    currentExecutionTask.value = task
    isTaskExecutionOpen.value = true
  }

  function handleTaskExecutionComplete(taskId, evidence) {
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const updated = markTaskCompletable(board, taskId, evidence)
    taskBoardTasks.value = updated.tasks
    persistGlobalTaskBoard(updated)
    isTaskExecutionOpen.value = false
    currentExecutionTask.value = null
  }

  function handleTaskExecutionClose() {
    isTaskExecutionOpen.value = false
    currentExecutionTask.value = null
  }

  function handleBattleVictory(taskId) {
    // 标记任务为可完成
    const task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task) return
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const evidence = {
      type: 'battle',
      waves: 3,
      victory: true,
      timestamp: Date.now(),
    }
    const updated = markTaskCompletable(board, taskId, evidence)
    taskBoardTasks.value = updated.tasks
    persistGlobalTaskBoard(updated)
    taskBoardFeedback.value = `战斗胜利！任务「${task.name}」已完成，请返回任务板领取奖励。`
  }

  function handleBattleDefeat(taskId) {
    // 战斗失败：任务状态不变，可以重试
    const task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task) return
    taskBoardFeedback.value = `战斗失败！任务「${task.name}」未完成，可以再次挑战。`
  }

  function handleCollectSuccess(taskId) {
    const task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task) return
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const evidence = { type: 'collect', success: true, timestamp: Date.now() }
    const updated = markTaskCompletable(board, taskId, evidence)
    taskBoardTasks.value = updated.tasks
    persistGlobalTaskBoard(updated)
    taskBoardFeedback.value = `采集成功！任务「${task.name}」已完成，请返回任务板领取奖励。`
  }

  function handleCollectFail(taskId) {
    const task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task) return
    taskBoardFeedback.value = `采集失败！任务「${task.name}」未完成，可以再次尝试。`
  }

  function handlePuzzleSuccess(taskId, reasoningPoints) {
    const task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task) return
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const evidence = { type: 'puzzle', success: true, reasoningPoints, timestamp: Date.now() }
    const updated = markTaskCompletable(board, taskId, evidence)
    taskBoardTasks.value = updated.tasks
    persistGlobalTaskBoard(updated)

    // Bonus coins based on reasoning points
    const bonusCoins = Math.max(10, Math.floor(reasoningPoints * 0.5))
    playerState.updateEconomy(prev => ({
      ...prev,
      coins: Math.min(9999, (prev.coins || 0) + bonusCoins),
    }))
    taskBoardFeedback.value = `谜题全部解开！推理点数 ${reasoningPoints}，额外获得 💰 ${bonusCoins} 金币！`
  }

  function handlePuzzleFail(taskId) {
    const task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task) return
    taskBoardFeedback.value = `解谜失败！任务「${task.name}」未完成，可以重新开始。`
  }

  function handleClueSuccess(taskId, score) {
    const task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task) return
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const evidence = { type: 'clue', success: true, score, timestamp: Date.now() }
    const updated = markTaskCompletable(board, taskId, evidence)
    taskBoardTasks.value = updated.tasks
    persistGlobalTaskBoard(updated)

    const bonusCoins = Math.max(10, Math.floor(score * 0.5))
    playerState.updateEconomy(prev => ({
      ...prev,
      coins: Math.min(9999, (prev.coins || 0) + bonusCoins),
    }))
    taskBoardFeedback.value = `线索收集完成！得分 ${score}，额外获得 💰 ${bonusCoins} 金币！`
  }

  function handleClueFail(taskId) {
    const task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task) return
    taskBoardFeedback.value = `线索收集失败！任务「${task.name}」未完成，可以重新开始。`
  }

  return {
    // 状态
    isTaskBoardOpen,
    taskBoardTasks,
    taskBoardGenerating,
    taskBoardFeedback,
    isTaskExecutionOpen,
    currentExecutionTask,
    // 计算属性
    getAcceptedTasksForInvite,
    // 方法
    handleOpenTaskBoard,
    handleCloseTaskBoard,
    handleGenerateTaskBoardTasks,
    handleAcceptTaskBoardTask,
    handleSubmitTaskBoardTask,
    handleCompleteTaskBoardTask,
    handleDeleteTaskBoardTask,
    handleTaskInviteClick,
    handleTaskExecutionComplete,
    handleTaskExecutionClose,
    handleBattleVictory,
    handleBattleDefeat,
    handleCollectSuccess,
    handleCollectFail,
    handlePuzzleSuccess,
    handlePuzzleFail,
    handleClueSuccess,
    handleClueFail,
  }
}
