/**
 * 角色梦境服务
 * 为角色生成梦境/深夜独白，基于当天积累的事件和关系变化
 */
import { callChatCompletion, getValidatedActiveConfig } from '../llm/llmService.core.js'
import { resolvePrompt } from '../llm/promptRegistry.js'
import { useWorldMemoryStore } from '../stores/worldMemory.store.js'
import { acquireLlmSlot } from './llmThrottle.js'

import { isSQLiteAvailable } from '../db/connection.js'
import { appConfigRepo } from '../db/repos/appConfig.repo.js'

const STORAGE_KEY = 'avg_llm_dream_config'

let _config = null
let _lastDreamPerChar = {} // { charId: dateStr }

/**
 * 加载配置
 */
async function loadConfig() {
  const defaults = {
    enabled: true,
    triggerHour: 23, // 默认 23:00 触发
    maxDreamsPerDayPerChar: 1,
  }
  try {
    if (isSQLiteAvailable()) {
      const stored = await appConfigRepo.get(STORAGE_KEY)
      if (stored && typeof stored === 'object') return { ...defaults, ...stored }
    } else {
      const { kvStorage } = await import('../storage/index.js')
      const stored = await kvStorage.get(STORAGE_KEY)
      if (stored && typeof stored === 'object') return { ...defaults, ...stored }
    }
  } catch {}
  return defaults
}

/**
 * 生成单个角色的梦境
 * @param {Object} params
 * @param {Object} params.worldBook
 * @param {Object} params.character
 * @param {Array} params.recentEvents — 该角色参与的近期事件
 * @param {Object} params.relationships — 该角色的关系数据
 * @param {string} params.currentMood — 当前心情
 * @returns {Promise<{success: boolean, dream?: Object, error?: string}>}
 */
export async function generateCharacterDream(params) {
  const { worldBook, character, recentEvents, relationships, currentMood } = params

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: 'API 配置不可用' }
  }

  const parts = [
    `【任务】以角色第一人称视角，生成一段梦境/深夜独白。`,
    `【角色】${character.name}`,
    `【身份】${character.identity || '未知'}`,
    `【背景】${character.background?.slice(0, 150) || '未知'}`,
  ]

  const mbti = character.personalityProfile?.mbti
  const tags = Array.isArray(character.personalityProfile?.behaviorTags)
    ? character.personalityProfile.behaviorTags.join('、')
    : ''
  if (mbti) parts.push(`【MBTI】${mbti}`)
  if (tags) parts.push(`【行为标签】${tags}`)
  if (currentMood) parts.push(`【当前心情】${currentMood}`)

  // 近期事件
  if (recentEvents?.length > 0) {
    const eventsText = recentEvents.slice(0, 8).map(e =>
      `- ${e.type}: ${e.summary}${e.scene ? ` @ ${e.scene}` : ''}`
    ).join('\n')
    parts.push(`\n【今日经历的事件】\n${eventsText}`)
  }

  // 关系状态
  if (relationships && Object.keys(relationships).length > 0) {
    parts.push(`\n【当前关系】`)
    for (const [otherId, rel] of Object.entries(relationships)) {
      if (!rel || typeof rel !== 'object') continue
      const name = resolveName(otherId, worldBook)
      parts.push(`对 ${name}: score=${rel.score}, ${rel.description || '无描述'}`)
    }
  }

  parts.push(`\n请以第一人称"我"的口吻，生成一段 80-150 字的梦境/深夜独白。`)
  parts.push(`要求：`)
  parts.push(`- 像梦一样模糊、朦胧、有诗意，但也融入今天发生的真实事件`)
  parts.push(`- 展现角色不为人知的内心一面`)
  parts.push(`- 可以是对某个人的思念、对某件事的反思、或者一个梦的片段`)
  parts.push(`- 不要出现"玩家"或"__player__"，除非角色确实在梦中想到了那个人`)
  parts.push(`- 语气要自然，像半梦半醒之间的呢喃`)

  const userPrompt = parts.join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('aliveness:character_dream'),
    userPrompt,
    temperature: 0.8, // 更高温度，更有梦幻感
    maxTokens: 600,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true, dream: result.data.trim() }
}

/**
 * 运行一轮梦境生成
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {Object} deps.worldMemory
 * @param {Object} deps.relationships — 关系数据
 * @returns {Promise<Array>} 生成的梦境列表
 */
export async function runDreamGeneration(deps) {
  if (!_config) _config = await loadConfig()
  if (!_config.enabled) return []

  const today = new Date().toDateString()
  const chars = deps.worldBook?.characters || []
  const dreams = []

  for (const char of chars) {
    // 检查今天是否已经生成过
    if (_lastDreamPerChar[char.id] === today) continue

    const throttle = acquireLlmSlot()
    if (!throttle.allowed) {
      console.log(`[Dreams] throttle blocked for ${char.name}: ${throttle.reason}`)
      continue
    }

    // 收集该角色的事件
    const charEvents = (deps.worldMemory?.events || []).filter(e =>
      Array.isArray(e.participants) && e.participants.includes(char.id)
    ).slice(-10)

    // 收集该角色的关系
    const charRelationships = deps.relationships?.[char.id] || {}

    // 获取心情（从 characterStateStore）
    let currentMood = null
    try {
      const { getCharacterState } = await import('../../plugins/feature-character-state/src/services/characterStateStore.js')
      const state = await getCharacterState(deps.worldBook.id, char.id)
      currentMood = state?.mood
    } catch {
      // ignore
    }

    const result = await generateCharacterDream({
      worldBook: deps.worldBook,
      character: char,
      recentEvents: charEvents,
      relationships: charRelationships,
      currentMood,
    })

    if (result.success && result.dream) {
      try {
        const mem = useWorldMemoryStore()
        // 写入世界记忆事件
        await mem.addEvent(deps.worldBook.id, {
          type: 'character_dream',
          participants: [char.id],
          summary: result.dream,
          emotionalImpact: 15,
          dreamMood: currentMood || '未知',
        })

        // 写入角色个人记忆（自己的梦）
        await mem.addCharacterMemory(deps.worldBook.id, char.id, {
          about: char.id,
          content: result.dream,
          sentiment: 0,
          type: 'dream',
        })

        dreams.push({ character: char, dream: result.dream })
        _lastDreamPerChar[char.id] = today

        console.log(`[Dreams] ${char.name} dreamed: ${result.dream.slice(0, 30)}...`)
      } catch (e) {
        console.warn('[Dreams] save dream failed:', e.message)
      }
    } else {
      // 即使失败也标记，避免同一角色反复尝试
      _lastDreamPerChar[char.id] = today
    }
  }

  return dreams
}

/**
 * 手动触发某个角色的梦境生成（供 UI 调用）
 */
export async function triggerSingleDream(worldBook, worldMemory, relationships, charId) {
  const char = (worldBook?.characters || []).find(c => c.id === charId)
  if (!char) return { success: false, error: '角色不存在' }

  const throttle = acquireLlmSlot()
  if (!throttle.allowed) {
    return { success: false, error: throttle.reason }
  }

  const charEvents = (worldMemory?.events || []).filter(e =>
    Array.isArray(e.participants) && e.participants.includes(charId)
  ).slice(-10)

  const charRelationships = relationships?.[charId] || {}

  let currentMood = null
  try {
    const { getCharacterState } = await import('../../plugins/feature-character-state/src/services/characterStateStore.js')
    const state = await getCharacterState(worldBook.id, charId)
    currentMood = state?.mood
  } catch {}

  return generateCharacterDream({
    worldBook, character: char,
    recentEvents: charEvents,
    relationships: charRelationships,
    currentMood,
  })
}

/**
 * 重置梦境追踪（用于新游戏）
 */
export function resetDreamTracking() {
  _lastDreamPerChar = {}
}

function resolveName(id, worldBook) {
  if (id === '__player__') return '玩家'
  const char = worldBook?.characters?.find(c => c.id === id)
  return char?.name || id
}
