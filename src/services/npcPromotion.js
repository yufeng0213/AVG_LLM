/**
 * NPC 转正服务
 * 为曝光达标的角色生成角色卡，转正并初始化
 */
import { callChatCompletion, getValidatedActiveConfig } from '../llm/llmService.core.js'
import { persistWorldBooks, loadWorldBooks } from '../worldbook/worldBookStore.js'
import { addEvent } from '../memory/worldMemoryStore.js'
import { setCharacterState } from '../../plugins/feature-character-state/src/services/characterStateStore.js'
import { saveExposureData } from './exposureTracker.js'

/**
 * 解析 LLM 返回的 JSON（复用 core 的逻辑）
 */
function parseJsonObjectFromText(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const parseJson = (text) => {
    try { return JSON.parse(text) } catch { return null }
  }

  // 1. markdown code block
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]?.trim()) {
    const parsed = parseJson(fencedMatch[1].trim())
    if (parsed) return parsed
  }

  // 2. direct
  const direct = parseJson(raw)
  if (direct) return direct

  // 3. brace extraction
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const parsed = parseJson(raw.slice(start, end + 1))
    if (parsed) return parsed
  }

  return null
}

/**
 * 为曝光达标的角色生成基础角色卡
 * @param {Object} params
 * @param {string} params.name - 角色名称
 * @param {Object} params.worldBookEntries - 世界书条目
 * @param {string[]} params.mentionContexts - 对话中被提及的上下文
 * @returns {Promise<{success: boolean, characterCard?: Object, error?: string}>}
 */
export async function generateCharacterCard(params) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: 'API 配置不可用', characterCard: null }
  }

  const parts = [
    `【任务】请为以下角色生成基础角色卡。`,
    `【角色名称】${params.name}`,
  ]

  if (params.worldBookEntries) {
    parts.push(`\n【世界观背景】`)
    for (const [key, value] of Object.entries(params.worldBookEntries)) {
      if (value) parts.push(`- ${key}: ${String(value).slice(0, 200)}`)
    }
  }

  if (params.mentionContexts?.length > 0) {
    parts.push(`\n【对话中被提及的上下文】`)
    params.mentionContexts.forEach((ctx, i) => {
      parts.push(`${i + 1}. ${ctx}`)
    })
  }

  parts.push(`\n请生成以下结构的 JSON：`)
  parts.push(`{"id":"char_${params.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}","name":"${params.name}","identity":"身份/职业","background":"角色背景描述（200字以内）","appearance":"外貌描述（100字以内）","personalityProfile":{"mbti":"四字母MBTI","behaviorTags":["标签1","标签2","标签3"]},"notes":"备注"}`)

  const userPrompt = parts.join('\n')

  const systemPrompt = `你是一个角色设计师。请根据给定的世界观背景和角色被提及的上下文，生成一个有深度的角色卡。

要求：
- 角色身份/职业需要与世界观契合
- 背景描述要有故事感，让人想要了解这个角色
- 外貌描述要具体、有画面感
- MBTI 要符合角色可能的性格
- behaviorTags 选 3-5 个最能代表该角色的标签
- 严格输出 JSON，不要解释`

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    maxTokens: 2000,
  })

  if (!result.success) {
    return { success: false, error: result.error, characterCard: null }
  }

  const parsed = parseJsonObjectFromText(result.data)
  if (!parsed) {
    return { success: false, error: '角色卡解析失败', characterCard: null, data: result.data }
  }

  const card = {
    id: parsed.id || `char_${params.name}_${Date.now()}`,
    name: parsed.name || params.name,
    identity: parsed.identity || '',
    background: parsed.background || '',
    appearance: parsed.appearance || '',
    personalityProfile: {
      mbti: parsed.personalityProfile?.mbti || 'INTJ',
      behaviorTags: Array.isArray(parsed.personalityProfile?.behaviorTags)
        ? parsed.personalityProfile.behaviorTags : ['神秘'],
    },
    notes: parsed.notes || '',
    relationshipBase: { favor: 0, trust: 0, stance: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return { success: true, characterCard: card, error: null }
}

/**
 * 转正流程：stage 1 → 2
 * @param {Object} worldBook
 * @param {Object} exposureEntry
 * @param {Object} characterCard
 */
export async function promoteCharacter(worldBook, exposureEntry, characterCard) {
  // 去重：按角色名判断（LLM 每次生成的 id 带时间戳，不同次调用 id 不同）
  if (!worldBook.characters) worldBook.characters = []
  const normalizedName = String(characterCard.name || '').trim()
  if (normalizedName && worldBook.characters.some(c => String(c.name || '').trim() === normalizedName)) {
    console.warn('[NpcPromotion] 角色已存在于世界书，跳过重复添加:', characterCard.name)
    return { success: false, error: '角色已存在' }
  }
  worldBook.characters.push(characterCard)

  // 保存世界书
  try {
    const books = await loadWorldBooks()
    const idx = books.findIndex(b => b.id === worldBook.id)
    if (idx >= 0) {
      books[idx] = worldBook
      await persistWorldBooks(books)
    }
  } catch (e) {
    console.warn('[NpcPromotion] saveWorldBook failed:', e.message)
  }

  // 2. 初始化角色状态
  try {
    await setCharacterState(worldBook.id, characterCard.id, {
      id: characterCard.id,
      bookId: worldBook.id,
      name: characterCard.name,
      affection: 0,
      energy: 50,
      mood: '平静',
      relationshipStage: 'stranger',
      favor: 0, trust: 0, stance: 0,
      createdAt: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[NpcPromotion] setCharacterState failed:', e.message)
  }

  // 3. 写入世界记忆事件
  try {
    await addEvent(worldBook.id, {
      type: 'npc_promotion',
      participants: [characterCard.id],
      summary: `新角色 ${characterCard.name} 正式登场`,
      emotionalImpact: 30,
    })
  } catch (e) {
    console.warn('[NpcPromotion] addEvent failed:', e.message)
  }

  // 4. 更新曝光数据
  exposureEntry.stage = 2
  exposureEntry.promotedAt = new Date().toISOString()
  await saveExposureData(await import('./exposureTracker.js').then(m => m.loadExposureData())
    .then(d => { d[worldBook.id] = d[worldBook.id] || {}; d[worldBook.id][characterCard.id] = exposureEntry; return d }))

  return { success: true, character: characterCard }
}

/**
 * 删除角色（级联清理）
 * @param {Object} worldBook
 * @param {string} charId
 */
export async function deleteCharacter(worldBook, charId) {
  // 1. 从 characters 移除
  if (worldBook.characters) {
    worldBook.characters = worldBook.characters.filter(c => String(c.id) !== charId)
  }

  // 2. 清理 relationships
  if (worldBook.relationships) {
    delete worldBook.relationships[charId]
    for (const [, targets] of Object.entries(worldBook.relationships)) {
      delete targets[charId]
    }
  }

  // 3. 清理角色状态
  try {
    const { removeCharacterState } = await import('../../plugins/feature-character-state/src/services/characterStateStore.js')
    await removeCharacterState(worldBook.id, charId)
  } catch (e) {
    console.warn('[NpcPromotion] removeCharacterState failed:', e.message)
  }

  // 4. 清理曝光数据
  try {
    const data = await import('./exposureTracker.js').then(m => m.loadExposureData())
    if (data[worldBook.id]) {
      delete data[worldBook.id][charId]
      await import('./exposureTracker.js').then(m => m.saveExposureData(data))
    }
  } catch (e) {
    console.warn('[NpcPromotion] cleanup exposure data failed:', e.message)
  }

  // 5. 保存世界书
  try {
    const books = await loadWorldBooks()
    const idx = books.findIndex(b => b.id === worldBook.id)
    if (idx >= 0) {
      books[idx] = worldBook
      await persistWorldBooks(books)
    }
  } catch (e) {
    console.warn('[NpcPromotion] saveWorldBook failed:', e.message)
  }

  return { success: true }
}
