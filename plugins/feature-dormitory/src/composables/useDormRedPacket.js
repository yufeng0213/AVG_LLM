/**
 * 寝室红包 Composable
 * 管理红包发送、领取、LLM 金额生成等逻辑
 *
 * @param {object} deps - 依赖项
 * @param {import('vue').Ref} deps.selectedCharacter - 当前选中的角色 ref
 * @param {import('vue').Ref} deps.selectedCharacterId - 当前选中角色 ID ref
 * @param {import('vue').Ref} deps.selectedDormState - 寝室状态 ref
 * @param {import('vue').Ref} deps.selectedDormRuntimeKey - 寝室运行时 key ref
 * @param {import('vue').Ref} deps.dormRuntimeMap - 寝室运行时映射 ref
 * @param {import('vue').Ref} deps.dormChatError - 聊天错误信息 ref
 * @param {import('vue').Ref} deps.actionFeedback - 操作反馈 ref
 * @param {import('vue').Ref} deps.isDormChatSending - 是否正在聊天 ref
 * @param {import('vue').ComputedRef} deps.activeBook - 当前世界书 computed
 * @param {import('vue').ComputedRef} deps.activeBookEconomyCoins - 当前金币 computed
 * @param {import('vue').ComputedRef} deps.selectedDormChatHistory - 聊天历史 computed
 * @param {Function} deps.updateSelectedDormState - 更新寝室状态的函数
 * @param {Function} deps.updateWorldBookEconomy - 更新世界书经济的函数
 * @param {Function} deps.scrollDormChatToBottom - 滚动聊天到底部的函数
 * @param {Function} deps.createDefaultDormState - 创建默认寝室状态的函数
 * @param {Function} deps.normalizeDormChatHistory - 标准化聊天历史的函数
 * @param {Function} deps.appendJournal - 追加日志的函数
 * @param {Function} deps.getValidatedActiveConfig - 获取验证后的 API 配置函数
 * @param {Function} deps.callChatCompletion - 调用聊天完成函数
 * @param {number} deps.DORM_CHAT_HISTORY_LIMIT - 聊天历史条数限制
 */

import { ref } from 'vue'
import {
  createRedPacket,
  sendUserRedPacket,
  openRedPacket,
  addRedPacket,
  recordSentRedPacket,
} from '../redPacketService.js'

// 红包 UI 状态（模块级，供模板绑定）
const showRedPacketModal = ref(false)
const selectedRedPacket = ref(null)
const redPacketOpenedAmount = ref(0)
const showRedPacketAmountDialog = ref(false)
const redPacketAmountInput = ref('')
const redPacketBlessingInput = ref('')

export function useDormRedPacket(deps) {
  // ==================== 工具函数 ====================

  // 创建红包聊天消息
  const createRedPacketChatMessage = (redPacket) => ({
    id: `rp_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: redPacket.senderId === 'user' ? 'user' : 'assistant',
    type: 'redPacket',
    redPacket: {
      id: redPacket.id,
      senderId: redPacket.senderId,
      senderName: redPacket.senderName,
      amount: redPacket.amount,
      type: redPacket.type,
      blessing: redPacket.blessing,
      createdAt: redPacket.createdAt,
      isOpened: false,
      openedAt: null,
    },
    time: new Date().toISOString(),
  })

  // 使用指定金额生成角色红包
  const generateCharacterRedPacketWithAmount = (characterId, characterName, amount, blessing) => {
    const packet = createRedPacket({
      senderId: `char_${characterId}`,
      senderName: characterName,
      amount,
      type: 'normal',
      blessing,
      characterId,
    })

    if (!packet) return null

    addRedPacket(packet)
    recordSentRedPacket(packet)

    return packet
  }

  // ==================== 用户发送红包 ====================

  const handleSendRedPacket = async () => {
    console.log('[红包] 点击发送红包按钮')

    if (deps.isDormChatSending.value) {
      console.log('[红包] 正在聊天中，请稍后')
      return
    }

    const bookId = String(deps.activeBook.value?.id || '').trim()
    if (!bookId) {
      deps.dormChatError.value = '请先选择世界书'
      return
    }

    if (deps.activeBookEconomyCoins.value <= 0) {
      deps.dormChatError.value = '金币不足，无法发送红包'
      return
    }

    const characterLabel = deps.selectedCharacter.value?.label || '角色'
    redPacketAmountInput.value = ''
    redPacketBlessingInput.value = `${characterLabel}，给你发个红包！`
    showRedPacketAmountDialog.value = true
  }

  const confirmSendRedPacket = async () => {
    const amount = Number(redPacketAmountInput.value)
    if (!amount || amount <= 0) {
      deps.dormChatError.value = '请输入有效的红包金额'
      return
    }

    const bookId = String(deps.activeBook.value?.id || '').trim()
    if (!bookId) {
      deps.dormChatError.value = '请先选择世界书'
      return
    }

    if (deps.activeBookEconomyCoins.value < amount) {
      deps.dormChatError.value = `金币不足，需要 ${amount} 金币`
      return
    }

    const characterLabel = deps.selectedCharacter.value?.label || '角色'

    // 扣除金币
    deps.updateWorldBookEconomy(bookId, (previous) => ({
      ...previous,
      coins: clampInt(previous.coins - amount, 0, 9999, previous.coins),
    }))

    // 生成用户红包
    const packet = sendUserRedPacket({
      amount,
      type: 'normal',
      blessing: redPacketBlessingInput.value || `${characterLabel}，给你发个红包！`,
    })

    if (!packet) {
      deps.dormChatError.value = '红包生成失败'
      return
    }

    const redPacketMessage = createRedPacketChatMessage(packet)

    const currentState = deps.selectedDormState.value
    if (!currentState) {
      deps.dormChatError.value = '请先选择一个角色'
      return
    }

    const newChatHistory = [...deps.normalizeDormChatHistory(currentState.chatHistory), redPacketMessage].slice(-deps.DORM_CHAT_HISTORY_LIMIT)

    if (deps.selectedDormRuntimeKey.value) {
      deps.updateSelectedDormState((previous) => ({
        ...previous,
        chatHistory: newChatHistory,
        journal: deps.appendJournal(previous.journal, `你给${characterLabel}发了一个红包（${amount}金币）`, 'redPacket'),
      }))
    } else {
      const defaultState = deps.createDefaultDormState(deps.selectedCharacter.value?.raw, deps.selectedCharacter.value?.label)
      defaultState.chatHistory = newChatHistory
      defaultState.journal = deps.appendJournal(defaultState.journal, `你给${characterLabel}发了一个红包（${amount}金币）`, 'redPacket')

      const tempKey = `temp_${Date.now()}`
      deps.dormRuntimeMap.value[tempKey] = defaultState
    }

    showRedPacketAmountDialog.value = false

    deps.actionFeedback.value = `你发送了一个红包（-${amount} 金币）`

    deps.scrollDormChatToBottom()
  }

  const cancelSendRedPacket = () => {
    showRedPacketAmountDialog.value = false
    redPacketAmountInput.value = ''
    redPacketBlessingInput.value = ''
  }

  // ==================== 红包开启处理 ====================

  const handleRedPacketOpened = (packet) => {
    const result = openRedPacket(packet.id)

    if (result.success) {
      redPacketOpenedAmount.value = result.amount

      // 更新聊天消息中的红包状态
      deps.updateSelectedDormState((previous) => {
        const updatedHistory = deps.normalizeDormChatHistory(previous.chatHistory).map(msg => {
          if (msg.type === 'redPacket' && msg.redPacket && msg.redPacket.id === packet.id) {
            return {
              ...msg,
              redPacket: {
                ...msg.redPacket,
                isOpened: true,
                openedAt: new Date().toISOString(),
              },
            }
          }
          return msg
        })

        return {
          ...previous,
          chatHistory: updatedHistory,
        }
      })

      // 关联经济系统：领取红包增加金币
      const bookId = String(deps.activeBook.value?.id || '').trim()
      if (bookId) {
        const coinAmount = Math.round(result.amount)
        deps.updateWorldBookEconomy(bookId, (previous) => ({
          ...previous,
          coins: clampInt(previous.coins + coinAmount, 0, 9999, previous.coins),
        }))
        deps.actionFeedback.value = `你领取了红包，获得 +${coinAmount} 金币`
      } else {
        deps.actionFeedback.value = `你领取了 ¥${result.amount.toFixed(2)}`
      }
    } else if (result.error === '红包已被开启') {
      redPacketOpenedAmount.value = result.amount || 0
      deps.actionFeedback.value = `红包已领取，金额：¥${(result.amount || 0).toFixed(2)}`
    } else {
      deps.actionFeedback.value = result.error || '开启失败'
    }
  }

  return {
    // 状态（供模板绑定）
    showRedPacketModal,
    selectedRedPacket,
    redPacketOpenedAmount,
    showRedPacketAmountDialog,
    redPacketAmountInput,
    redPacketBlessingInput,
    // 方法
    handleSendRedPacket,
    confirmSendRedPacket,
    cancelSendRedPacket,
    handleRedPacketOpened,
    createRedPacketChatMessage,
  }
}

// clampInt 可能需要从外部传入，这里保留一个本地版本
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return typeof fallback === 'number' ? fallback : min
  if (n < min) return min
  if (n > max) return max
  return n
}
