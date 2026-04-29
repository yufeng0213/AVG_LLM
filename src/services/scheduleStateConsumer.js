/**
 * 日程结算消费者 — 监听日程执行事件，将结算结果写入角色状态和世界记忆
 */
import { onScheduleEvent } from '../../plugins/feature-character-schedule/src/composables/useCharacterSchedule.js'
import { applyDelta as applyStateDelta } from '../../plugins/feature-character-state/src/services/characterStateStore.js'
import { useRelationshipStore } from '../stores/relationship.store.js'
import { useWorldMemoryStore } from '../stores/worldMemory.store.js'
import { loadWorldBooks } from '../../src/worldbook/worldBookStore.js'

/**
 * 启动日程消费者（游戏初始化时调用一次）
 */
export function initScheduleConsumer() {
  onScheduleEvent('hour:executed', async ({ key, executedHours }) => {
    const [bookId, charId] = key.split('::')
    await applyScheduleEffects(bookId, charId, executedHours)
  })
  console.log('[ScheduleConsumer] initialized')
}

/**
 * 将已执行小时的结算效果应用到各子系统
 */
async function applyScheduleEffects(bookId, charId, executedHours) {
  // 从日程状态获取 schedule 数据
  const { useCharacterSchedule } = await import('../../plugins/feature-character-schedule/src/composables/useCharacterSchedule.js')
  const scheduleAPI = useCharacterSchedule()
  const schedule = scheduleAPI.scheduleState?.scheduleMap?.[`${bookId}::${charId}`]
  if (!schedule) return

  const effects = aggregateEffects(schedule, executedHours)
  if (!effects.hasChanges) return

  // 获取角色名
  const charName = await getCharacterName(bookId, charId)

  // 1. 更新角色状态
  await applyStateDelta(bookId, charId, {
    affection: effects.totalAffectionDelta,
    mood: effects.mood,
    scheduleAffectionDelta: effects.totalAffectionDelta,
  }, `日程结算: ${effects.summary}`)

  // 2. 更新 relationship
  if (effects.totalAffectionDelta !== 0) {
    try {
      const rel = useRelationshipStore()
      rel.update(charId, {
        favor: effects.totalAffectionDelta,
      }, `日程活动结算 (${effects.summary})`, null)
    } catch (e) {
      console.warn('[ScheduleConsumer] relationship update failed:', e.message)
    }
  }

  // 3. 写入世界记忆
  if (effects.summary) {
    try {
      const mem = useWorldMemoryStore()
      await mem.addEvent(bookId, {
        type: 'daily_activity',
        participants: [charId],
        summary: `${charName} ${effects.summary}`,
        emotionalImpact: Math.abs(effects.totalAffectionDelta) + 10,
        scene: effects.lastLocation,
      })
    } catch (e) {
      console.warn('[ScheduleConsumer] world memory write failed:', e.message)
    }
  }

  console.log(`[ScheduleConsumer] applied effects for ${charName}: ${effects.summary}`)
}

/**
 * 聚合多个小时的执行效果
 */
function aggregateEffects(schedule, executedHours) {
  let totalAffectionDelta = 0
  let mood = null
  let lastLocation = ''
  const activities = []

  for (const hour of executedHours) {
    const entry = schedule.hourEntries[hour]
    if (!entry?.executed) continue
    totalAffectionDelta += entry.executed.actualAffectionChange || 0
    if (entry.executed.actualMood) mood = entry.executed.actualMood
    if (entry.plannedActivity?.locationName) lastLocation = entry.plannedActivity.locationName
    if (entry.plannedActivity?.activityLabel) {
      activities.push(entry.plannedActivity.activityLabel)
    }
  }

  return {
    hasChanges: totalAffectionDelta !== 0 || mood !== null,
    totalAffectionDelta,
    mood,
    lastLocation,
    summary: activities.length > 0
      ? `完成了: ${activities.join('、')}`
      : null,
  }
}

/**
 * 从世界书获取角色名
 */
async function getCharacterName(bookId, charId) {
  try {
    const books = await loadWorldBooks()
    const book = books.find(b => b.id === bookId)
    if (book?.characters) {
      const char = book.characters.find(c => c.id === charId)
      if (char?.name) return char.name
    }
  } catch {
    // ignore
  }
  return charId
}
