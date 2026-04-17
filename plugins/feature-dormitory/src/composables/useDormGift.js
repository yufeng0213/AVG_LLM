/**
 * 寝室物品赠送 Composable
 * 管理物品赠送给角色的所有逻辑
 *
 * @param {object} deps - 依赖项
 * @param {import('vue').Ref} deps.selectedCharacter - 当前选中的角色 ref
 * @param {import('vue').Ref} deps.activeBook - 当前选中的世界书 ref
 * @param {import('vue').Ref} deps.selectedDormState - 寝室状态 ref
 * @param {import('vue').Ref} deps.actionFeedback - 操作反馈 ref
 * @param {Function} deps.updateSelectedDormState - 更新寝室状态的函数
 * @param {Function} deps.scrollDormChatToBottom - 滚动聊天到底部的函数
 * @param {Function} deps.getAffectionStage - 根据好感度获取阶段ID的函数
 * @param {Function} deps.getStageLabel - 根据阶段ID获取阶段标签的函数
 * @param {Function} deps.normalizeStage - 规范化阶段ID的函数
 * @param {Function} deps.renderTemplate - 模板渲染函数
 * @param {Function} deps.appendJournal - 添加日记条目的函数
 * @param {Function} deps.appendDormChatMessage - 添加聊天消息的函数
 * @param {Function} deps.normalizeDormChatHistory - 规范化聊天历史的函数
 */

import { ref } from 'vue'
import { generateDormItemGiftReply } from '../../../../src/llm'
import { useBackStorage } from '../../../feature-back-storage/src/composables/useBackStorage.js'

const DORM_AFFECTION_MIN = 0
const DORM_AFFECTION_MAX = 100

function clampInt(value, min, max, fallback = min) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function useDormGift(deps) {
  // 赠送状态
  const showGiftItemConfirm = ref(false)
  const pendingGiftItem = ref(null)
  const isGiftItemProcessing = ref(false)

  let giftRequestToken = 0

  /**
   * 显示物品赠送确认弹窗
   */
  function handleGiftDormItem(item) {
    if (!item) return
    if (isGiftItemProcessing.value) return
    if (!deps.selectedCharacter.value) {
      deps.actionFeedback.value = '请先选择一个角色'
      return
    }
    if (!deps.activeBook.value) {
      deps.actionFeedback.value = '未找到当前世界书'
      return
    }
    pendingGiftItem.value = item
    showGiftItemConfirm.value = true
  }

  /**
   * 关闭物品赠送确认弹窗
   */
  function closeGiftItemConfirm() {
    showGiftItemConfirm.value = false
    pendingGiftItem.value = null
  }

  /**
   * 确认赠送物品给当前角色
   */
  async function confirmGiftItem() {
    const item = pendingGiftItem.value
    if (!item) {
      closeGiftItemConfirm()
      return
    }

    if (isGiftItemProcessing.value) return

    closeGiftItemConfirm()

    const requestToken = ++giftRequestToken
    isGiftItemProcessing.value = true

    const charName = deps.selectedCharacter.value.label
    const itemName = String(item.name || '').trim()

    try {
      // 获取最近聊天记录
      const recentChat = deps.normalizeDormChatHistory(deps.selectedDormState.value.chatHistory)
        .slice(-8)
        .map(msg => ({
          role: msg.role,
          text: msg.type === 'redPacket' && msg.redPacket
            ? `${msg.redPacket.senderName || '玩家'}发了一个红包`
            : msg.text,
        }))

      const result = await generateDormItemGiftReply({
        worldBook: deps.activeBook.value,
        character: {
          name: charName,
          identity: deps.selectedCharacter.value.raw?.identity || '',
          subtitle: deps.selectedCharacter.value.raw?.subtitle || '',
          background: deps.selectedCharacter.value.raw?.background || '',
          tags: Array.isArray(deps.selectedCharacter.value.raw?.tags) ? deps.selectedCharacter.value.raw.tags : [],
        },
        item: {
          name: item.name,
          description: item.description || '',
          category: item.category || '',
          categoryLabel: item.categoryLabel || '',
          icon: item.icon || '',
        },
        currentAffection: deps.selectedDormState.value.affection,
        relationshipStage: deps.getStageLabel(
          deps.normalizeStage(deps.selectedDormState.value.relationshipStage, deps.selectedDormState.value.affection)
        ),
        recentChat,
      })

      if (requestToken !== giftRequestToken) return

      if (!result.success || !result.reply) {
        deps.actionFeedback.value = result.error || '生成回复失败'
        return
      }

      const { replyText, journalText, mood, affectionDelta } = result.reply

      // 从背包中移除物品（减少数量）
      if (item.id) {
        const backStorage = useBackStorage()
        backStorage.removeFromInventory(item.id, 1)
      }

      // 更新寝室状态：好感度、日记
      deps.updateSelectedDormState((previous) => {
        const nextAffection = clampInt(
          previous.affection + affectionDelta,
          DORM_AFFECTION_MIN,
          DORM_AFFECTION_MAX,
          previous.affection
        )

        // 检查关系阶段是否提升
        const previousStage = deps.normalizeStage(previous.relationshipStage, previous.affection)
        const nextStage = deps.normalizeStage(previous.relationshipStage, nextAffection)
        const stageChanged = previousStage !== nextStage

        let nextJournal = deps.appendJournal(
          previous.journal,
          deps.renderTemplate(`你把${itemName}送给了{char}。${journalText}`, charName),
          'gift'
        )

        // 如果关系阶段提升，添加额外记录
        if (stageChanged) {
          const stageLabel = deps.getStageLabel(nextStage)
          nextJournal = deps.appendJournal(
            nextJournal,
            deps.renderTemplate(`因为这份心意，你和{char}的关系进入了「${stageLabel}」阶段。`, charName),
            'stage'
          )
        }

        return {
          ...previous,
          affection: nextAffection,
          mood: String(mood || '开心').trim() || previous.mood,
          journal: nextJournal,
          giftCount: (previous.giftCount || 0) + 1,
          chatHistory: deps.appendDormChatMessage(previous.chatHistory, 'assistant', `${charName}：${replyText}`),
        }
      })

      // 滚动到最新消息
      deps.scrollDormChatToBottom()

      // 设置反馈
      deps.actionFeedback.value = `${charName}收下了${itemName}，看起来${mood || '很开心'}。`
    } catch (err) {
      if (requestToken !== giftRequestToken) return
      deps.actionFeedback.value = '赠送物品时出错，请稍后再试'
    } finally {
      if (requestToken === giftRequestToken) {
        isGiftItemProcessing.value = false
      }
    }
  }

  return {
    showGiftItemConfirm,
    pendingGiftItem,
    isGiftItemProcessing,
    handleGiftDormItem,
    closeGiftItemConfirm,
    confirmGiftItem,
  }
}
