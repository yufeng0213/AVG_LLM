/**
 * 世界记忆采样：为 prompt 构建近期事件 + 加权随机回忆
 */
import { useWorldMemoryStore } from '../stores/worldMemory.store.js'

const RECENT_COUNT = 15
const RANDOM_COUNT = 5

/**
 * 从世界记忆中采样事件，返回格式化的 prompt 段落
 * @param {string} worldBookId
 * @param {Object} worldBook - 用于解析角色名称
 * @returns {Promise<string>} 格式化后的记忆文本，若无事件则返回空串
 */
export async function sampleMemoryForPrompt(worldBookId, worldBook) {
  const mem = useWorldMemoryStore()
  const memory = await mem.get(worldBookId)
  const allEvents = (memory.events || [])
    .filter(e => e.status === 'active')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  if (allEvents.length === 0) return ''

  // 最近 N 条
  const recent = allEvents.slice(0, RECENT_COUNT)

  // 更早的事件中加权随机抽样
  const older = allEvents.slice(RECENT_COUNT)
  const random = older.length > 0 ? weightedSample(older, RANDOM_COUNT) : []

  const lines = ['## 世界记忆']

  // 近期事件
  lines.push('')
  lines.push(`### 近期事件（最近 ${recent.length} 条）`)
  for (const evt of recent) {
    lines.push(formatEventLine(evt, worldBook))
  }

  // 过往回忆（仅当有随机抽样时）
  if (random.length > 0) {
    lines.push('')
    lines.push('### 过往回忆')
    // 按时间排序（旧的在前）
    for (const evt of [...random].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))) {
      lines.push(formatEventLine(evt, worldBook))
    }
  }

  lines.push('')
  lines.push('请保持与以上历史事件的一致性。')

  return lines.join('\n')
}

/**
 * 按 emotionalImpact 加权随机抽样
 */
function weightedSample(arr, count) {
  const weights = arr.map(e => Math.max(e.emotionalImpact || 1, 1))
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const result = []
  const used = new Set()

  for (let i = 0; i < Math.min(count, arr.length); i++) {
    let r = Math.random() * totalWeight
    for (let j = 0; j < arr.length; j++) {
      if (used.has(j)) continue
      r -= weights[j]
      if (r <= 0) {
        used.add(j)
        result.push(arr[j])
        break
      }
    }
  }

  return result
}

/**
 * 格式化单条事件为 prompt 行
 */
function formatEventLine(evt, worldBook) {
  const participants = (evt.participants || [])
    .map(id => resolveName(id, worldBook))
    .join('、')
  const time = formatDate(evt.createdAt)
  const type = evt.type || 'other'
  const impact = evt.emotionalImpact ?? 0
  const scene = evt.scene ? ` [${evt.scene}]` : ''

  return `- [${time}]${scene} [${type}] ${evt.summary} (参与者: ${participants}, 情感: ${impact})`
}

function resolveName(id, worldBook) {
  if (id === '__player__') return '玩家'
  const char = worldBook?.characters?.find(c => c.id === id)
  return char?.name || id
}

function formatDate(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    const MM = String(d.getMonth() + 1).padStart(2, '0')
    const DD = String(d.getDate()).padStart(2, '0')
    const HH = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${MM}-${DD} ${HH}:${mm}`
  } catch {
    return ''
  }
}
