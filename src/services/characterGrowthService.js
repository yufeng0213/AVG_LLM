/**
 * 角色成长服务 — 基于积累的记忆和关系，让 NPC 性格/目标随时间变化
 * 低频高影响系统：周期性检查或事件积累触发
 */
import { callChatCompletion, getValidatedActiveConfig } from '../llm/llmService.core.js'
import { resolvePrompt } from '../llm/promptRegistry.js'
import { useWorldMemoryStore } from '../stores/worldMemory.store.js'
import { acquireLlmSlot } from './llmThrottle.js'

import { isSQLiteAvailable } from '../db/connection.js'
import { appConfigRepo } from '../db/repos/appConfig.repo.js'

const STORAGE_KEY = 'avg_llm_character_growth_config'
const DEFAULT_CHECK_INTERVAL_DAYS = 7
const DEFAULT_MIN_EVENTS = 20

let _config = null
let _lastCheckPerChar = {} // { charId: timestamp }
let _eventCountPerChar = {} // { charId: count }

/**
 * 加载配置
 */
async function loadConfig() {
  const defaults = {
    enabled: true,
    checkIntervalDays: DEFAULT_CHECK_INTERVAL_DAYS,
    minEventsForGrowth: DEFAULT_MIN_EVENTS,
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
 * 评估单个角色的成长
 * @param {Object} params
 * @param {Object} params.worldBook
 * @param {Object} params.character
 * @param {Array} params.characterEvents — 该角色参与的事件
 * @param {Object} params.relationships
 * @returns {Promise<{success: boolean, growth?: Object, error?: string}>}
 */
export async function evaluateCharacterGrowth(params) {
  const { worldBook, character, characterEvents, relationships } = params

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: 'API 配置不可用' }
  }

  // 收集角色相关信息
  const eventsText = characterEvents.slice(0, 15).map(e =>
    `- ${e.type}: ${e.summary}`
  ).join('\n')

  const relText = []
  if (relationships) {
    for (const [otherId, rel] of Object.entries(relationships[character.id] || {})) {
      const otherName = resolveName(otherId, worldBook)
      relText.push(`对 ${otherName}: score=${rel.score}, ${rel.description || '无描述'}`)
    }
  }

  const currentProfile = character?.personalityProfile || {}
  const currentTags = (currentProfile?.behaviorTags || []).join('、')
  const currentGoals = (character?.goals || []).join('、')

  const userPrompt = [
    `【任务】评估角色的成长变化。基于该角色近期经历的事件和关系变化，判断其性格、目标、行为模式是否发生了改变。`,
    `【角色】${character.name}`,
    `【身份】${character.identity || '未知'}`,
    `【背景】${character.background || '未知'}`,
    `【当前性格】MBTI: ${currentProfile?.mbti || '未知'} | 标签: ${currentTags || '无'}`,
    `【当前目标】${currentGoals || '无明确目标'}`,
    `\n【近期事件】（最近${characterEvents.length}条）\n${eventsText}`,
    relText.length > 0 ? `\n【关系状态】\n${relText.join('\n')}` : '',
    `\n请分析该角色的成长变化，输出以下结构的 JSON：`,
    `{`,
    `  "newTags": ["新标签1", "新标签2"],  // 新增或变化的行为标签（0-3个）`,
    `  "removedTags": ["不再适用的标签"],  // 不再适用的标签`,
    `  "newGoals": ["新目标1"],            // 新增目标（0-2个）`,
    `  "removedGoals": ["已完成/放弃的目标"],`,
    `  "growthNote": "一段话描述成长变化（50字以内）",`,
    `}`,
    `如果没有任何变化，输出 {"noChange": true}。严格输出 JSON，不要解释。`,
  ].filter(Boolean).join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('aliveness:character_growth'),
    userPrompt,
    temperature: 0.6,
    maxTokens: 1000,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  // 解析 JSON
  const cleaned = result.data.trim()
  let growth
  try {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) return { success: false, error: 'JSON 解析失败' }
    growth = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return { success: false, error: '成长评估解析失败', data: result.data }
  }

  return { success: true, growth }
}

/**
 * 运行一轮角色成长检查
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {Object} deps.worldMemory
 * @param {Function} deps.getCharacterScheduleApi - () => scheduleAPI
 * @returns {Promise<Array>} 发生成长的角色列表
 */
export async function runCharacterGrowthCheck(deps) {
  if (!_config) _config = await loadConfig()
  if (!_config.enabled) return []

  const chars = deps.worldBook?.characters || []
  const events = deps.worldMemory?.events || []
  const grownChars = []

  for (const char of chars) {
    const now = Date.now()

    // 更新该角色的事件计数
    const charEvents = events.filter(e =>
      Array.isArray(e.participants) && e.participants.includes(char.id)
    )
    _eventCountPerChar[char.id] = (_eventCountPerChar[char.id] || 0) +
      charEvents.length - (_eventCountPerChar[char.id] || 0)

    // 检查条件
    if (_eventCountPerChar[char.id] < _config.minEventsForGrowth) continue
    if (_lastCheckPerChar[char.id] &&
        now - _lastCheckPerChar[char.id] < _config.checkIntervalDays * 24 * 60 * 60 * 1000) continue

    const throttle = acquireLlmSlot()
    if (!throttle.allowed) {
      console.log(`[CharacterGrowth] throttle blocked for ${char.name}: ${throttle.reason}`)
      continue
    }

    const result = await evaluateCharacterGrowth({
      worldBook: deps.worldBook,
      character: char,
      characterEvents: charEvents,
      relationships: deps.worldBook.relationships,
    })

    if (result.success && result.growth && !result.growth.noChange) {
      // 应用成长变化
      applyGrowthToCharacter(char, result.growth)
      _lastCheckPerChar[char.id] = now
      _eventCountPerChar[char.id] = 0

      // 记录成长事件
      try {
        const mem = useWorldMemoryStore()
        await mem.addEvent(deps.worldBook.id, {
          type: 'character_growth',
          participants: [char.id],
          summary: `${char.name} 发生了成长变化：${result.growth.growthNote || ''}`,
          emotionalImpact: 20,
          growthDetails: result.growth,
        })
      } catch (e) {
        console.warn('[CharacterGrowth] addEvent failed:', e.message)
      }

      grownChars.push({ char, growth: result.growth })
      console.log(`[CharacterGrowth] ${char.name} evolved: ${result.growth.growthNote || '无描述'}`)
    } else {
      _lastCheckPerChar[char.id] = now // 即使没变化也更新时间
    }
  }

  return grownChars
}

/**
 * 将成长变化应用到角色对象
 */
function applyGrowthToCharacter(character, growth) {
  // 更新 personalityProfile
  if (!character.personalityProfile) character.personalityProfile = {}

  const tags = Array.isArray(character.personalityProfile.behaviorTags)
    ? [...character.personalityProfile.behaviorTags] : []

  // 移除标签
  if (growth.removedTags) {
    for (const tag of growth.removedTags) {
      const idx = tags.indexOf(tag)
      if (idx >= 0) tags.splice(idx, 1)
    }
  }

  // 新增标签
  if (growth.newTags) {
    for (const tag of growth.newTags) {
      if (!tags.includes(tag) && tag) tags.push(tag)
    }
  }

  character.personalityProfile.behaviorTags = tags

  // 更新目标
  if (growth.newGoals || growth.removedGoals) {
    if (!Array.isArray(character.goals)) character.goals = []
    if (growth.removedGoals) {
      character.goals = character.goals.filter(g => !growth.removedGoals.includes(g))
    }
    if (growth.newGoals) {
      for (const goal of growth.newGoals) {
        if (!character.goals.includes(goal) && goal) character.goals.push(goal)
      }
    }
  }

  // 记录成长笔记
  if (growth.growthNote) {
    if (!character.growthNotes) character.growthNotes = []
    character.growthNotes.push({
      note: growth.growthNote,
      date: new Date().toISOString(),
    })
  }

  character.updatedAt = new Date().toISOString()
}

function resolveName(id, worldBook) {
  if (id === '__player__') return '玩家'
  const char = worldBook?.characters?.find(c => c.id === id)
  return char?.name || id
}
