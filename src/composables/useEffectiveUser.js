/**
 * useEffectiveUser - 合成有效用户身份
 * 全局用户是父节点，世界书 User 设定是覆写层。
 */

import { computed } from 'vue'
import { usePlayerState } from '../stores/playerState.store.js'
import { useWorldBookData } from '../stores/worldBookData.store.js'

export function useEffectiveUser(bookId) {
  const globalUser = usePlayerState()
  const worldBookData = useWorldBookData()
  const bookData = computed(() => worldBookData.getBookData(bookId))

  return computed(() => ({
    avatar: globalUser.avatar,
    avatarFrame: globalUser.avatarFrame,
    name: bookData.value.userName || globalUser.username,
    description: bookData.value.userDescription || '',
  }))
}
