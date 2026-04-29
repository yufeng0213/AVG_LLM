/**
 * 角色曝光追踪服务
 * 追踪角色在对话中的出场/提及次数，计算曝光分数，检测转正候选
 */
import { isSQLiteAvailable, query, exec } from '../db/connection.js'
import { appConfigRepo } from '../db/repos/appConfig.repo.js'

const STORAGE_KEY = 'avg_llm_character_exposure'
const CONFIG_KEY = 'avg_llm_exposure_config'

/**
 * 加载曝光数据
 */
export async function loadExposureData() {
  try {
    if (isSQLiteAvailable()) {
      const rows = await query('SELECT world_book_id, character_id, exposure_data FROM exposure_data')
      const result = {}
      for (const r of rows) {
        if (!result[r.world_book_id]) result[r.world_book_id] = {}
        result[r.world_book_id][r.character_id] = JSON.parse(r.exposure_data)
      }
      return result
    } else {
      const { kvStorage } = await import('../storage/index.js')
      const data = await kvStorage.get(STORAGE_KEY)
      return data && typeof data === 'object' ? data : {}
    }
  } catch {
    return {}
  }
}

/**
 * 保存曝光数据
 */
export async function saveExposureData(data) {
  if (isSQLiteAvailable()) {
    await exec('DELETE FROM exposure_data')
    for (const [worldBookId, chars] of Object.entries(data)) {
      for (const [charId, entry] of Object.entries(chars)) {
        await exec(
          'INSERT INTO exposure_data (world_book_id, character_id, exposure_data) VALUES (?, ?, ?)',
          [worldBookId, charId, JSON.stringify(entry)]
        )
      }
    }
  } else {
    const { kvStorage } = await import('../storage/index.js')
    await kvStorage.set(STORAGE_KEY, data)
  }
}

/**
 * 加载曝光配置
 */
export async function loadExposureConfig() {
  const defaults = {
    enabled: true,
    appearanceWeight: 10,
    mentionWeight: 3,
    thresholdToTracked: 1,
    thresholdToInteractive: 80,
    thresholdToCore: 200,
    decayStartAfterLines: 50,
    decayRate: 0.005,
    decayMinFactor: 0.5,
    fadeOutThreshold: 30,
  }
  try {
    if (isSQLiteAvailable()) {
      const stored = await appConfigRepo.get(CONFIG_KEY)
      return stored && typeof stored === 'object' ? { ...defaults, ...stored } : defaults
    } else {
      const { kvStorage } = await import('../storage/index.js')
      const stored = await kvStorage.get(CONFIG_KEY)
      return stored && typeof stored === 'object' ? { ...defaults, ...stored } : defaults
    }
  } catch {
    return defaults
  }
}

/**
 * 保存曝光配置
 */
export async function saveExposureConfig(config) {
  if (isSQLiteAvailable()) {
    await appConfigRepo.set(CONFIG_KEY, config)
  } else {
    const { kvStorage } = await import('../storage/index.js')
    await kvStorage.set(CONFIG_KEY, config)
  }
}

/**
 * 处理新对话，更新曝光数据
 * @param {string} worldBookId
 * @param {Array} newLines - 新增对话行 [{speaker, text, ...}]
 * @param {number} startLineIndex - 起始行号
 * @param {Object} worldBook - 世界书对象（含 characters）
 * @returns {Promise<Array>} 需要转正的角色列表 [{id, stage, score}]
 */
export async function processNewDialogue(worldBookId, newLines, startLineIndex, worldBook) {
  const data = await loadExposureData()
  const config = await loadExposureConfig()
  if (!data[worldBookId]) data[worldBookId] = {}

  const wbData = data[worldBookId]
  const knownChars = (worldBook?.characters || []).map(c => ({
    id: String(c.id),
    name: String(c.name || ''),
    nickname: String(c.nickname || ''),
  }))
  const knownNameSet = new Set(knownChars.map(c => c.name).filter(Boolean))
  const knownNicknameSet = new Set(knownChars.map(c => c.nickname).filter(Boolean))
  // 世界书已有的名字（用于排除新角色检测）
  const existingNames = new Set([...knownNameSet, ...knownNicknameSet, '旁白'])

  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i]
    const lineIndex = startLineIndex + i
    const lineText = String(line?.text || '')
    const lineSpeaker = String(line?.speaker || '')

    // 检测未在世界书中的角色（通过 speaker 字段）
    if (lineSpeaker && lineSpeaker !== '旁白' && !existingNames.has(lineSpeaker)) {
      // 用名字作为临时 ID
      const newCharId = `npc_${lineSpeaker}`
      const entry = ensureEntry(wbData, newCharId)
      entry.displayName = lineSpeaker
      entry.appearanceCount++
      entry.lastSeenAt = new Date().toISOString()
      entry.lastSeenLineIndex = lineIndex
      // 记录上下文
      entry.mentionContexts = entry.mentionContexts || []
      entry.mentionContexts.push(lineText.slice(0, 100))
      if (entry.mentionContexts.length > 10) entry.mentionContexts.shift()
    }

    for (const char of knownChars) {
      if (!char.id) continue

      // Speaker 出场计数
      if (lineSpeaker === char.id || lineSpeaker === char.name) {
        const entry = ensureEntry(wbData, char.id)
        entry.appearanceCount++
        entry.lastSeenAt = new Date().toISOString()
        entry.lastSeenLineIndex = lineIndex
      }

      // 文本提及计数
      if (lineText && (char.name || char.nickname)) {
        let mentioned = false
        if (char.name && lineText.includes(char.name)) mentioned = true
        if (!mentioned && char.nickname && lineText.includes(char.nickname)) mentioned = true

        if (mentioned) {
          const entry = ensureEntry(wbData, char.id)
          entry.mentionCount++
          entry.lastSeenAt = new Date().toISOString()
          entry.lastSeenLineIndex = lineIndex
          entry.mentionContexts = entry.mentionContexts || []
          entry.mentionContexts.push(lineText.slice(0, 100))
          if (entry.mentionContexts.length > 10) {
            entry.mentionContexts.shift()
          }
        }
      }
    }
  }

  // 计算分数 + 衰减 + 淡出检测
  for (const [id, entry] of Object.entries(wbData)) {
    entry.exposureScore = calculateExposureScore(entry, config, newLines.length)

    // 淡出检测：低于阈值降级
    if (entry.stage > 1 && entry.exposureScore < config.fadeOutThreshold) {
      entry.stage = Math.max(1, entry.stage - 1)
      entry.fadedAt = new Date().toISOString()
    }

    // 记录最高分
    entry.peakScore = Math.max(entry.peakScore || 0, entry.exposureScore)
  }

  await saveExposureData(data)

  // 检查转正
  return checkForPromotions(wbData, knownChars, config)
}

/**
 * 检查是否有角色满足转正条件
 */
function checkForPromotions(wbData, knownChars, config) {
  const promotions = []
  const knownIds = new Set(knownChars.map(c => c.id))

  for (const [id, entry] of Object.entries(wbData)) {
    // 已知角色：stage 1 → 2 转正
    if (knownIds.has(id)) {
      if (entry.stage === 0 && entry.exposureScore >= config.thresholdToTracked) {
        entry.stage = 1
      }
      if (entry.stage === 1 && entry.exposureScore >= config.thresholdToInteractive) {
        promotions.push({ id, stage: 2, score: entry.exposureScore, name: getCharName(id, knownChars) })
        entry.stage = 2
      }
    } else if (entry.displayName) {
      // 未在世界书中的新角色：曝光达标后直接转正
      if (entry.stage === 0 && entry.exposureScore >= config.thresholdToInteractive) {
        promotions.push({ id, stage: 2, score: entry.exposureScore, name: entry.displayName, isNewCharacter: true })
        entry.stage = 2
      }
    }
  }

  return promotions
}

/**
 * 计算曝光分数
 */
function calculateExposureScore(entry, config, currentBatchSize) {
  const baseScore = entry.appearanceCount * config.appearanceWeight
    + entry.mentionCount * config.mentionWeight

  // 时间衰减
  const linesSinceLastSeen = currentBatchSize > 0
    ? Math.max(0, currentBatchSize - ((entry.lastSeenLineIndex || 0) % currentBatchSize || 0))
    : 0

  const decayFactor = linesSinceLastSeen > config.decayStartAfterLines
    ? Math.max(config.decayMinFactor, 1 - (linesSinceLastSeen - config.decayStartAfterLines) * config.decayRate)
    : 1

  return Math.round(baseScore * decayFactor)
}

function ensureEntry(wbData, id) {
  if (!wbData[id]) {
    wbData[id] = {
      mentionCount: 0,
      appearanceCount: 0,
      lastSeenAt: null,
      lastSeenLineIndex: 0,
      exposureScore: 0,
      stage: 0,
      mentionContexts: [],
      promotedAt: null,
      fadedAt: null,
      peakScore: 0,
    }
  }
  return wbData[id]
}

function getCharName(id, knownChars) {
  const found = knownChars.find(c => c.id === id)
  return found?.name || id
}
