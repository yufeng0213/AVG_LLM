/**
 * useGlobalUser - 兼容层
 *
 * 转发到 useBackStorage，保持旧 API 不变。
 * 新代码应直接使用 useBackStorage。
 */

import { computed } from 'vue'
import { useBackStorage } from '../../plugins/feature-back-storage/src/composables/useBackStorage.js'

// 使用同一个底层 state，确保双向同步
const {
  state: bsState,
  initialized,
  updateUsername,
  updateAvatar,
  updateAvatarFrame,
  updateEconomy,
  addItemToInventory: addToInventory,
  removeFromInventory,
  addToMailbox,
  removeFromMailbox,
} = useBackStorage()

// 导出同一个 reactive state 的引用
const state = bsState

export function useGlobalUser() {
  return {
    state,
    initialized,
    username: computed(() => state.username),
    avatar: computed(() => state.avatar),
    avatarFrame: computed(() => state.avatarFrame),
    economy: computed(() => state.economy),
    inventory: computed(() => state.inventory),
    mailbox: computed(() => state.mailbox),
    updateUsername,
    updateAvatar,
    updateAvatarFrame,
    updateEconomy,
    addToInventory,
    removeFromInventory,
    addToMailbox,
    removeFromMailbox,
  }
}
