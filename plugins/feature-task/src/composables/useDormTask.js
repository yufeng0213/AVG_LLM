/**
 * 寝室任务板 Composable
 * 管理任务板、任务执行、任务邀请的所有逻辑
 *
 * @param {object} deps - 依赖项
 * @param {import('vue').Ref} deps.activeBook - 当前选中的世界书 ref
 * @param {import('vue').Ref} deps.selectedCharacter - 当前选中的角色 ref
 * @param {import('vue').Ref} deps.selectedCharacterId - 当前选中角色ID ref
 * @param {import('vue').Ref} deps.selectedDormState - 寝室状态 ref
 * @param {import('vue').Ref} deps.selectedDormChatHistory - 聊天历史 ref
 * @param {Function} deps.updateSelectedDormState - 更新寝室状态的函数
 * @param {Function} deps.updateWorldBookEconomy - 更新经济状态的函数
 * @param {Function} deps.addToWorldBookInventory - 添加物品到背包的函数
 * @param {Function} deps.normalizeDormChatHistory - 规范化聊天历史的函数
 */

import { computed, ref } from 'vue'
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

const DORM_CHAT_HISTORY_LIMIT = 24

// 任务类型标签（用于聊天邀请下拉框）
export const TASK_TYPE_LABELS_TASK = {
  explore: '探索',
  collect: '收集',
  social: '社交',
  combat: '战斗',
  daily: '日常',
}

export function useDormTask(deps) {
  // 任务板状态
  const isTaskBoardOpen = ref(false)
  const taskBoardTasks = ref([])
  const taskBoardGenerating = ref(false)
  const taskBoardFeedback = ref('')

  // 任务执行状态
  const isTaskExecutionOpen = ref(false)
  const currentExecutionTask = ref(null)
  const showTaskInviteDropdown = ref(false)
  const taskInviteBtnRef = ref(null)
  const taskDropdownStyle = ref('')

  // 辅助
  function getActiveBookId() {
    return String(deps.activeBook.value?.id || '').trim()
  }

  function loadTaskBoardForActiveBook() {
    const bookId = getActiveBookId()
    if (!bookId) return { tasks: [], lastGenerated: 0 }
    const board = loadTaskBoard(bookId)
    // 清理可能存在的 undefined/null 元素
    if (board.tasks && !Array.isArray(board.tasks)) {
      board.tasks = []
    } else if (board.tasks) {
      board.tasks = board.tasks.filter(Boolean)
    }
    return board
  }

  function saveTaskBoardForActiveBook(board) {
    const bookId = getActiveBookId()
    if (!bookId) return
    saveTaskBoard(bookId, board)
  }

  // 计算属性
  const getAcceptedTasksForInvite = computed(() => {
    const result = taskBoardTasks.value.filter((t) =>
      t && (t.status === 'accepted' || t.status === 'in_progress' || t.status === 'completable')
    )
    console.log('[Dormitory] getAcceptedTasksForInvite: raw=', taskBoardTasks.value, 'filtered=', result)
    return result
  })

  // 方法
  function toggleTaskInviteDropdown() {
    console.log('[Dormitory] toggleTaskInviteDropdown, showTaskInviteDropdown:', showTaskInviteDropdown.value)
    console.log('[Dormitory] toggleTaskInviteDropdown, taskBoardTasks:', taskBoardTasks.value.length, JSON.stringify(taskBoardTasks.value.map(t => ({ id: t?.id, status: t?.status, name: t?.name }))))
    console.log('[Dormitory] toggleTaskInviteDropdown, getAcceptedTasksForInvite:', getAcceptedTasksForInvite.value.length, JSON.stringify(getAcceptedTasksForInvite.value.map(t => ({ id: t?.id, name: t?.name, type: t?.type }))))
    if (!showTaskInviteDropdown.value) {
      const btn = taskInviteBtnRef.value
      if (btn) {
        const rect = btn.getBoundingClientRect()
        const viewportH = window.innerHeight
        const dropdownBottom = viewportH - rect.top
        taskDropdownStyle.value = `bottom:${dropdownBottom}px;left:${rect.left + rect.width / 2}px;`
      }
    } else {
      taskDropdownStyle.value = ''
    }
    showTaskInviteDropdown.value = !showTaskInviteDropdown.value
  }

  function handleOpenTaskBoard() {
    const board = loadTaskBoardForActiveBook()
    console.log('[Dormitory] handleOpenTaskBoard, loaded board:', board)
    taskBoardTasks.value = board.tasks || []
    console.log('[Dormitory] handleOpenTaskBoard, taskBoardTasks set to:', taskBoardTasks.value.length, taskBoardTasks.value.map(t => ({ id: t.id, status: t.status })))
    taskBoardFeedback.value = ''
    isTaskBoardOpen.value = true
  }

  function handleCloseTaskBoard() {
    const cleaned = cleanupCompletedTasks({ tasks: taskBoardTasks.value })
    taskBoardTasks.value = cleaned.tasks
    saveTaskBoardForActiveBook({ tasks: taskBoardTasks.value, lastGenerated: Date.now() })
    isTaskBoardOpen.value = false
  }

  function syncTaskBoardFromBook() {
    const board = loadTaskBoardForActiveBook()
    console.log('[Dormitory] watch activeBook, bookId:', getActiveBookId())
    taskBoardTasks.value = board.tasks || []
    console.log('[Dormitory] watch activeBook, loaded taskBoardTasks:', taskBoardTasks.value.length, taskBoardTasks.value.map(t => ({ id: t.id, status: t.status })))
  }

  async function handleGenerateTaskBoardTasks() {
    if (taskBoardGenerating.value) return
    taskBoardGenerating.value = true
    taskBoardFeedback.value = ''

    try {
      const result = await generateTaskBoardTasks({
        worldBook: deps.activeBook.value,
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
      }))

      const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
      const cleaned = cleanupCompletedTasks(board)
      const merged = mergeTasks(cleaned, newTasks)
      taskBoardTasks.value = merged.tasks
      saveTaskBoardForActiveBook(merged)
      taskBoardFeedback.value = `已生成 ${newTasks.length} 个新任务！`
    } catch (e) {
      taskBoardFeedback.value = '任务生成异常：' + (e.message || '未知错误')
    } finally {
      taskBoardGenerating.value = false
    }
  }

  function handleAcceptTaskBoardTask(taskId) {
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    console.log('[Dormitory] handleAcceptTaskBoardTask, before:', taskBoardTasks.value.length, 'tasks:', taskBoardTasks.value.map(t => ({ id: t.id, status: t.status })))
    const updated = acceptTask(board, taskId)
    taskBoardTasks.value = updated.tasks
    saveTaskBoardForActiveBook(updated)
    console.log('[Dormitory] handleAcceptTaskBoardTask, after:', taskBoardTasks.value.length, 'tasks:', taskBoardTasks.value.map(t => ({ id: t.id, status: t.status })))
  }

  function handleSubmitTaskBoardTask(taskId, description) {
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const updated = submitTask(board, taskId, description)
    taskBoardTasks.value = updated.tasks
    saveTaskBoardForActiveBook(updated)
  }

  function handleCompleteTaskBoardTask(taskId) {
    const bookId = getActiveBookId()
    if (!bookId) return

    const task = taskBoardTasks.value.find((t) => t.id === taskId)
    if (!task || task.status !== 'submitted') return

    // 发放奖励
    if (task.rewardType === 'coins') {
      const amount = Math.floor(task.rewardAmount)
      deps.updateWorldBookEconomy(bookId, (prev) => ({
        ...prev,
        coins: Math.min(9999, (prev.coins || 0) + amount),
      }))
      taskBoardFeedback.value = `任务完成！获得 💰 ${amount} 金币`
    } else if (task.rewardType === 'crystals') {
      const amount = Math.floor(task.rewardAmount)
      deps.updateWorldBookEconomy(bookId, (prev) => ({
        ...prev,
        crystals: Math.max(0, (prev.crystals || 0) + amount),
      }))
      taskBoardFeedback.value = `任务完成！获得 💎 ${amount} 晶石`
    } else if (task.rewardType === 'item') {
      deps.addToWorldBookInventory(bookId, {
        id: `task_item_${Date.now()}`,
        name: task.name + ' 奖励',
        description: `完成任务「${task.name}」获得的物品`,
        icon: '🎁',
        category: 'misc',
        price: task.rewardAmount || 30,
      })
      taskBoardFeedback.value = `任务完成！获得 🎁 ${task.name}`
    }

    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const updated = completeTask(board, taskId)
    taskBoardTasks.value = updated.tasks
    saveTaskBoardForActiveBook(updated)
  }

  function handleDeleteTaskBoardTask(taskId) {
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const updated = deleteTask(board, taskId)
    taskBoardTasks.value = updated.tasks
    saveTaskBoardForActiveBook(updated)
  }

  // 任务执行相关方法
  function handleSendTaskInvite(task) {
    console.log('[Dormitory] handleSendTaskInvite, task:', task.id, task.name)
    console.log('[Dormitory] handleSendTaskInvite, selectedCharacterId:', deps.selectedCharacterId.value)
    console.log('[Dormitory] handleSendTaskInvite, selectedCharacter:', deps.selectedCharacter.value)
    console.log('[Dormitory] handleSendTaskInvite, selectedCharacter.label:', deps.selectedCharacter.value?.label)

    showTaskInviteDropdown.value = false

    const targetCharId = deps.selectedCharacterId.value || ''
    const targetCharName = deps.selectedCharacter.value?.label || ''

    console.log('[Dormitory] handleSendTaskInvite, targetCharId:', targetCharId, 'targetCharName:', targetCharName)

    const inviteMessage = {
      id: `task_invite_${Date.now()}`,
      role: 'user',
      type: 'taskInvite',
      taskId: task.id,
      taskName: task.name,
      taskType: task.type,
      targetCharacterId: targetCharId,
      targetCharacterName: targetCharName,
      time: new Date().toISOString(),
    }

    if (deps.selectedCharacterId.value) {
      deps.updateSelectedDormState((prev) => {
        const history = deps.normalizeDormChatHistory(prev.chatHistory)
        return {
          ...prev,
          chatHistory: [...history, inviteMessage].slice(-DORM_CHAT_HISTORY_LIMIT),
        }
      })
    }

    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const updated = startTaskExecution(board, task.id)
    const taskRef = updated.tasks.find((t) => t.id === task.id)
    if (taskRef) {
      taskRef.targetCharacterId = targetCharId
      taskRef.targetCharacterName = targetCharName
    }
    taskBoardTasks.value = updated.tasks
    saveTaskBoardForActiveBook(updated)

    currentExecutionTask.value = task
    isTaskExecutionOpen.value = true
  }

  function handleTaskInviteClick(taskId) {
    console.log('[Dormitory] handleTaskInviteClick, taskId:', taskId)
    let task = taskBoardTasks.value.find((t) => t.id === taskId)
    console.log('[Dormitory] 任务板找到任务:', task ? task.id : 'null', task ? task.status : 'null')

    if (!task) {
      const session = loadTaskExecutionSession(taskId)
      if (session) {
        console.log('[Dormitory] 从 session 恢复, taskName:', session.taskName, 'targetChar:', session.targetCharacterName)
        task = {
          id: taskId,
          name: session.taskName || '未知任务',
          type: 'daily',
          targetCharacterId: session.targetCharacterId || '',
          targetCharacterName: session.targetCharacterName || '',
        }
      }
    }

    if (!task) {
      console.log('[Dormitory] 找不到任务和 session, taskId:', taskId)
      return
    }

    let targetCharId = task.targetCharacterId || ''
    let targetCharName = task.targetCharacterName || ''

    console.log('[Dormitory] handleTaskInviteClick, 任务 targetCharId:', targetCharId, 'targetCharName:', targetCharName)

    if (!targetCharId) {
      const history = deps.selectedDormChatHistory.value
      const inviteMsg = history.find((m) => m.type === 'taskInvite' && m.taskId === taskId)
      if (inviteMsg) {
        targetCharId = inviteMsg.targetCharacterId || ''
        targetCharName = inviteMsg.targetCharacterName || ''
      }
    }

    currentExecutionTask.value = {
      ...task,
      targetCharacterId: targetCharId,
      targetCharacterName: targetCharName,
    }
    console.log('[Dormitory] 设置 currentExecutionTask:', currentExecutionTask.value.id, 'target:', targetCharId)
    isTaskExecutionOpen.value = true
    console.log('[Dormitory] 设置 isTaskExecutionOpen: true')
  }

  function handleTaskExecutionComplete(taskId, evidence) {
    const board = { tasks: taskBoardTasks.value, lastGenerated: 0 }
    const updated = markTaskCompletable(board, taskId, evidence)
    taskBoardTasks.value = updated.tasks
    saveTaskBoardForActiveBook(updated)

    const completionMsg = {
      id: `task_complete_${Date.now()}`,
      role: 'assistant',
      text: `✅ 任务「${evidence.summary || '任务'}」执行完成！可以在任务板提交领取奖励。`,
      time: new Date().toISOString(),
    }

    if (deps.selectedCharacterId.value) {
      deps.updateSelectedDormState((prev) => {
        const history = deps.normalizeDormChatHistory(prev.chatHistory)
        return {
          ...prev,
          chatHistory: [...history, completionMsg].slice(-DORM_CHAT_HISTORY_LIMIT),
        }
      })
    }

    isTaskExecutionOpen.value = false
    currentExecutionTask.value = null
  }

  function handleTaskExecutionClose() {
    isTaskExecutionOpen.value = false
    currentExecutionTask.value = null
  }

  // 关闭任务邀请下拉框（供外部点击其他地方时调用）
  function closeTaskInviteDropdown() {
    showTaskInviteDropdown.value = false
  }

  return {
    // 状态
    isTaskBoardOpen,
    taskBoardTasks,
    taskBoardGenerating,
    taskBoardFeedback,
    isTaskExecutionOpen,
    currentExecutionTask,
    showTaskInviteDropdown,
    taskInviteBtnRef,
    taskDropdownStyle,
    // 计算属性
    getAcceptedTasksForInvite,
    // 常量
    TASK_TYPE_LABELS_TASK,
    // 任务板方法
    syncTaskBoardFromBook,
    handleOpenTaskBoard,
    handleCloseTaskBoard,
    handleGenerateTaskBoardTasks,
    handleAcceptTaskBoardTask,
    handleSubmitTaskBoardTask,
    handleCompleteTaskBoardTask,
    handleDeleteTaskBoardTask,
    // 任务执行方法
    handleSendTaskInvite,
    handleTaskInviteClick,
    handleTaskExecutionComplete,
    handleTaskExecutionClose,
    // 下拉框方法
    toggleTaskInviteDropdown,
    closeTaskInviteDropdown,
  }
}
