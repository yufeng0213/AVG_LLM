/**
 * NPC 间短信服务
 * 两个角色在同一地点时，自动互相发短信
 * SQLite-only 存储模式
 */
import { isSQLiteAvailable, query, exec } from '../db/connection.js'
import { callChatCompletion, getValidatedActiveConfig } from '../llm/llmService.core.js'
import { resolvePrompt } from '../llm/promptRegistry.js'
import { acquireLlmSlot } from './llmThrottle.js'

let _lastDate = null

function _getTodayStr() {
  return new Date().toDateString()
}

function resolveName(id, worldBook) {
  if (id === '__player__') return '玩家'
  const char = worldBook?.characters?.find(c => c.id === id)
  return char?.name || id
}

/**
 * 检测当前小时在同一地点的 NPC 对
 * @param {Object} worldBook
 * @param {Function} getScheduleFn — (bookId, charId) => schedule
 * @returns {Array<{charA, charB, location, hour}>}
 */
export function detectLocationOverlaps(worldBook, getScheduleFn) {
  const chars = worldBook?.characters || []
  if (chars.length < 2) return []

  const currentHour = new Date().getHours()
  const active = []

  for (const char of chars) {
    const schedule = getScheduleFn(worldBook.id, char.id)
    if (!schedule?.hourEntries) continue

    const entry = schedule.hourEntries[currentHour]
    if (entry?.plannedActivity?.locationName) {
      active.push({
        id: char.id,
        name: char.name,
        identity: char.identity || '',
        location: entry.plannedActivity.locationName,
        activity: entry.plannedActivity.activityLabel || '',
        hour: currentHour,
      })
    }
  }

  // 分组按地点
  const byLocation = {}
  for (const npc of active) {
    if (!byLocation[npc.location]) byLocation[npc.location] = []
    byLocation[npc.location].push(npc)
  }

  // 生成对
  const pairs = []
  for (const loc of Object.values(byLocation)) {
    for (let i = 0; i < loc.length; i++) {
      for (let j = i + 1; j < loc.length; j++) {
        pairs.push({
          charA: loc[i],
          charB: loc[j],
          location: loc[i].location,
          hour: currentHour,
        })
      }
    }
  }

  return pairs
}

/**
 * 生成 NPC 间短信对话（3-5 条来回）
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {Object} deps.charA — {id, name, identity}
 * @param {Object} deps.charB — {id, name, identity}
 * @param {string} deps.location
 * @param {number} deps.relScore — 关系分数 0-1000
 * @returns {Promise<{success: boolean, messages?: Array, error?: string}>}
 */
export async function generateNpcSmsThread(deps) {
  const { worldBook, charA, charB, location, relScore } = deps

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: 'API 配置不可用' }
  }

  const relationshipLabel = relScore >= 800 ? '挚友' : relScore >= 600 ? '亲近' : relScore >= 400 ? '普通' : relScore >= 200 ? '疏远' : '敌对'

  const userPrompt = [
    `【任务】生成 ${charA.name} 和 ${charB.name} 之间的短信对话。`,
    `【${charA.name}】身份: ${charA.identity || '未知'}`,
    `【${charB.name}】身份: ${charB.identity || '未知'}`,
    `【场景】两人都在「${location}」`,
    `【关系】${relationshipLabel}（分数: ${relScore}）`,
    '',
    `请生成 4-6 条短信对话，格式为:`,
    `|m=${charA.name}:短信内容|`,
    `|m=${charB.name}:短信内容|`,
    `交替进行。`,
    `要求:`,
    `- 语气日常、自然，像朋友之间的闲聊`,
    `- 可以提到他们正在做的事情或感受`,
    `- 展现他们的关系特点`,
    `- 每条短信简短（20-60字）`,
  ].join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('npc:sms_thread'),
    userPrompt,
    temperature: 0.8,
    maxTokens: 600,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  // 解析 |m=角色名:内容| 格式
  const messages = []
  const lines = result.data.trim().split('\n')
  for (const line of lines) {
    const match = line.match(/^\|m=(.+?):(.+?)\|/)
    if (match) {
      const speaker = match[1].trim()
      const text = match[2].trim()
      if (speaker && text) {
        messages.push({
          id: `npcsms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: speaker === charA.name ? 'assistant_a' : 'assistant_b',
          senderId: speaker === charA.name ? charA.id : charB.id,
          senderName: speaker,
          text,
          timestamp: new Date().toISOString(),
        })
      }
    }
  }

  if (messages.length === 0) {
    return { success: false, error: '解析失败，未生成有效短信' }
  }

  return { success: true, messages }
}

/**
 * 保存 NPC 短信线程
 */
export async function saveNpcSmsThread(charA, charB, messages, location) {
  if (!isSQLiteAvailable()) {
    console.warn('[NpcSms] SQLite not available, cannot save thread')
    return false
  }

  try {
    const threadData = {
      id: `npcsms_thread_${Date.now()}`,
      messages,
      location,
      charA: { id: charA.id, name: charA.name },
      charB: { id: charB.id, name: charB.name },
      createdAt: new Date().toISOString(),
    }

    const threadKey = `${charA.id}::${charB.id}`
    await exec(
      `INSERT INTO npc_sms_threads (world_book_id, thread_key, thread_data, created_at)
       VALUES (?, ?, ?, ?)`,
      ['_global', threadKey, JSON.stringify(threadData), threadData.createdAt]
    )
    console.log('[NpcSms] Saved thread', threadKey)
    return true
  } catch (e) {
    console.error('[NpcSms] save thread failed:', e.message)
    return false
  }
}

/**
 * 加载 NPC 短信线程
 */
export async function loadNpcSmsThreads(worldBookId, relationships = {}) {
  if (!isSQLiteAvailable()) {
    console.warn('[NpcSms] SQLite not available, returning empty threads')
    return []
  }

  try {
    const rows = await query(
      'SELECT thread_data FROM npc_sms_threads ORDER BY created_at DESC'
    )
    const all = []
    for (const r of rows) {
      const thread = JSON.parse(r.thread_data)
      if (thread.charA?.id?.includes(worldBookId) || thread.charB?.id?.includes(worldBookId)) {
        all.push(thread)
      }
    }
    return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  } catch (e) {
    console.error('[NpcSms] load threads failed:', e.message)
    return []
  }
}

/**
 * 运行一轮 NPC 短信生成
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {Function} deps.getScheduleFn
 * @param {Object} deps.relationships
 * @returns {Promise<Array>} 生成的短信线程
 */
export async function runNpcSmsCheck(deps) {
  const { worldBook, getScheduleFn, relationships } = deps

  // 重置每日计数
  const today = _getTodayStr()
  if (today !== _lastDate) {
    _lastDate = today
  }

  const throttle = acquireLlmSlot()
  if (!throttle.allowed) {
    console.log('[NpcSms] throttle blocked:', throttle.reason)
    return []
  }

  const pairs = detectLocationOverlaps(worldBook, getScheduleFn)
  if (pairs.length === 0) return []

  const threads = []

  for (const pair of pairs.slice(0, 1)) {
    const relScore = relationships?.[pair.charA.id]?.[pair.charB.id]?.score ?? 500
    if (relScore < 300) continue // 关系太差不发短信

    const result = await generateNpcSmsThread({
      worldBook,
      charA: pair.charA,
      charB: pair.charB,
      location: pair.location,
      relScore,
    })

    if (result.success && result.messages.length > 0) {
      await saveNpcSmsThread(pair.charA, pair.charB, result.messages, pair.location)
      threads.push({ charA: pair.charA, charB: pair.charB, messages: result.messages })
    }
  }

  return threads
}
