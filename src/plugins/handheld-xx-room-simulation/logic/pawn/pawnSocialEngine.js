// 社交系统 - 互动、对话触发

const SOCIAL_DIALOGUE_TEMPLATES = [
  { context: 'greeting', texts: ['早上好！', '你好啊！', '今天天气不错！'] },
  { context: 'work', texts: ['工作进展不错呢', '一起加油吧', '休息一下？'] },
  { context: 'meal', texts: ['一起吃点什么？', '今天吃什么？', '我饿了'] },
  { context: 'rest', texts: ['累了就休息吧', '晚安', '明天继续努力'] },
  { context: 'happy', texts: ['心情真好！', '今天很顺利', '太棒了！'] },
  { context: 'sad', texts: ['有点累...', '今天不太顺利', '需要休息'] },
]

const SOCIAL_INTERACTION_DURATION = 4000 // 社交互动持续时间（毫秒）
const SOCIAL_COOLDOWN = 30000 // 社交冷却时间（毫秒）

export const createPawnSocialEngine = (deps = {}) => {
  // 检查两个小人是否足够近可以社交
  const canInteract = (pawnA, pawnB, maxDistance = 3) => {
    if (!pawnA?.position || !pawnB?.position) return false
    const dist = Math.abs(pawnA.position.x - pawnB.position.x) + Math.abs(pawnA.position.y - pawnB.position.y)
    return dist <= maxDistance
  }

  // 检查小人是否可以开始社交
  const canStartSocial = (pawn) => {
    if (!pawn) return false
    if (pawn.currentActivity !== 'idle') return false
    if (pawn.dialogueCooldown > 0) return false
    if (pawn.needs?.social?.value <= pawn.needs?.social?.threshold) return true // 社交需求低时触发
    return Math.random() < 0.05 // 5% 随机触发
  }

  // 开始社交互动
  const startSocialInteraction = (pawnA, pawnB) => {
    if (!canInteract(pawnA, pawnB)) return false

    pawnA.currentActivity = 'socializing'
    pawnA.targetPawn = pawnB.id
    pawnA.activityStartTime = Date.now()
    pawnA.dialogueCooldown = SOCIAL_COOLDOWN
    pawnA.sprite.action = 'talk'

    pawnB.currentActivity = 'socializing'
    pawnB.targetPawn = pawnA.id
    pawnB.activityStartTime = Date.now()
    pawnB.dialogueCooldown = SOCIAL_COOLDOWN
    pawnB.sprite.action = 'talk'

    // 生成对话
    const dialogue = generateDialogue(pawnA, pawnB)
    pawnA.lastDialogue = dialogue.textA
    pawnB.lastDialogue = dialogue.textB

    return {
      success: true,
      pawnA,
      pawnB,
      dialogue,
    }
  }

  // 完成社交互动
  const completeSocialInteraction = (pawnA, pawnB) => {
    // 恢复社交需求
    if (pawnA?.needs?.social) {
      pawnA.needs.social.value = Math.min(100, pawnA.needs.social.value + 15)
    }
    if (pawnB?.needs?.social) {
      pawnB.needs.social.value = Math.min(100, pawnB.needs.social.value + 15)
    }

    // 恢复娱乐需求
    if (pawnA?.needs?.joy) {
      pawnA.needs.joy.value = Math.min(100, pawnA.needs.joy.value + 8)
    }
    if (pawnB?.needs?.joy) {
      pawnB.needs.joy.value = Math.min(100, pawnB.needs.joy.value + 8)
    }

    // 重置状态
    pawnA.currentActivity = 'idle'
    pawnA.targetPawn = null
    pawnA.sprite.action = 'idle'

    pawnB.currentActivity = 'idle'
    pawnB.targetPawn = null
    pawnB.sprite.action = 'idle'

    return { pawnA, pawnB }
  }

  // 生成对话文本
  const generateDialogue = (pawnA, pawnB) => {
    // 根据小人的心情选择对话类型
    const moodA = getMoodContext(pawnA)
    const moodB = getMoodContext(pawnB)

    // 选择一个共同的对话主题
    const context = moodA === moodB ? moodA : (Math.random() < 0.5 ? moodA : moodB)
    const template = SOCIAL_DIALOGUE_TEMPLATES.find(t => t.context === context) || SOCIAL_DIALOGUE_TEMPLATES[0]

    const textA = template.texts[Math.floor(Math.random() * template.texts.length)]
    const textB = template.texts[Math.floor(Math.random() * template.texts.length)]

    return {
      context,
      textA: `${pawnA.name}: ${textA}`,
      textB: `${pawnB.name}: ${textB}`,
    }
  }

  // 根据小人状态判断心情
  const getMoodContext = (pawn) => {
    if (!pawn?.needs) return 'greeting'

    // 根据需求值判断心情
    if (pawn.needs.hunger?.value <= pawn.needs.hunger?.threshold) return 'meal'
    if (pawn.needs.rest?.value <= pawn.needs.rest?.threshold) return 'rest'
    if (pawn.needs.joy?.value >= 80) return 'happy'
    if (pawn.needs.joy?.value <= pawn.needs.joy?.threshold) return 'sad'

    // 根据活动判断
    if (pawn.currentActivity === 'working') return 'work'

    // 根据时间判断
    const hour = (pawn.context?.hourOfDay || 12)
    if (hour >= 6 && hour < 12) return 'greeting'
    if (hour >= 18) return 'rest'

    return 'greeting'
  }

  // 找到可以社交的邻近小人
  const findNearbyPawnForSocial = (pawn, otherPawns) => {
    for (const other of otherPawns) {
      if (other.id === pawn.id) continue
      if (!canStartSocial(other)) continue
      if (canInteract(pawn, other)) {
        return other
      }
    }
    return null
  }

  // 更新社交冷却
  const updateDialogueCooldown = (pawn, deltaMs) => {
    if (pawn?.dialogueCooldown > 0) {
      pawn.dialogueCooldown = Math.max(0, pawn.dialogueCooldown - deltaMs)
    }
    return pawn
  }

  // 触发随机社交事件
  const triggerRandomSocialEvent = (pawns, state) => {
    const availablePawns = pawns.filter(p => canStartSocial(p) && p.currentActivity === 'idle')
    if (availablePawns.length < 2) return null

    // 随机选择两个小人
    const indexA = Math.floor(Math.random() * availablePawns.length)
    const pawnA = availablePawns[indexA]

    const nearbyPawn = findNearbyPawnForSocial(pawnA, availablePawns.filter(p => p.id !== pawnA.id))
    if (!nearbyPawn) return null

    return startSocialInteraction(pawnA, nearbyPawn)
  }

  return {
    canInteract,
    canStartSocial,
    startSocialInteraction,
    completeSocialInteraction,
    generateDialogue,
    getMoodContext,
    findNearbyPawnForSocial,
    updateDialogueCooldown,
    triggerRandomSocialEvent,
    SOCIAL_INTERACTION_DURATION,
    SOCIAL_COOLDOWN,
  }
}

export default createPawnSocialEngine