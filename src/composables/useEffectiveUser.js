import { computed } from 'vue'
import { useGlobalUser } from './useGlobalUser.js'
import { useBookData } from './useBookData.js'

/**
 * 合成有效用户身份。
 * 全局用户是父节点，世界书 User 设定是覆写层。
 * LLM 交互时使用此合成身份。
 */
export function useEffectiveUser(bookId) {
  const globalUser = useGlobalUser()
  const bookData = useBookData(bookId)

  return computed(() => ({
    // 基础信息来自全局用户
    avatar: globalUser.avatar.value,
    avatarFrame: globalUser.avatarFrame.value,

    // name 和 description 优先使用世界书的覆写值
    name: bookData.userName.value || globalUser.username.value,
    description: bookData.userDescription.value || '',
  }))
}
