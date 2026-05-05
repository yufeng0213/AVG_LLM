/**
 * 手机主屏角色信息 — 随机选择一个角色，提供头像、签名、好感度等
 */
import { computed, ref, onMounted } from 'vue'
import { getGroupedContacts } from './usePhoneData.js'
import { useContactStatus } from './useContactStatus.js'
import { getCharacterRelationship } from '../../../../../src/relationship/relationshipStore.js'
import { getRelationshipLevel } from '../../../../../src/relationship/relationshipLevels.js'

export function usePhoneHomeCharacter() {
  const { getSignature, getOnlineStatus } = useContactStatus()

  const character = ref(null)
  const signature = ref('')
  const status = ref({ label: '', emoji: '', color: '' })
  const favor = ref(50)
  const favorLevel = ref({ name: '中立', icon: '' })

  async function loadRandomCharacter() {
    try {
      const groups = await getGroupedContacts()
      const allChars = groups.flatMap(g => g.characters || [])
      if (allChars.length === 0) return

      const randomChar = allChars[Math.floor(Math.random() * allChars.length)]
      character.value = randomChar

      // 好感度
      const rel = getCharacterRelationship(randomChar.id, randomChar)
      favor.value = rel.favor
      favorLevel.value = getRelationshipLevel(rel.favor)

      // 签名
      signature.value = getSignature(randomChar.id) || ''

      // 在线状态（暂时用默认 leisure）
      status.value = getOnlineStatus('leisure', true)
    } catch (e) {
      console.warn('[usePhoneHomeCharacter] load failed:', e.message)
    }
  }

  onMounted(loadRandomCharacter)

  return {
    character,
    signature,
    status,
    favor,
    favorLevel,
    refresh: loadRandomCharacter,
  }
}
