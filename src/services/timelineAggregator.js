/**
 * 时间线聚合器
 * 聚合今天所有事件：日程执行、世界记忆、NPC 互动、羁绊事件、梦境
 */
import { useWorldMemoryStore } from '../stores/worldMemory.store.js'

const ENTRY_TYPE_META = {
  schedule: { emoji: '📅', label: '日程' },
  event: { emoji: '📜', label: '事件' },
  npc_interaction: { emoji: '💬', label: '互动' },
  bond_event: { emoji: '💫', label: '羁绊' },
  character_dream: { emoji: '🌙', label: '梦境' },
  birthday: { emoji: '🎂', label: '生日' },
  daily_activity: { emoji: '☀️', label: '日常' },
  relationship_shift: { emoji: '❤️', label: '关系变化' },
}

function getEntryMeta(type) {
  return ENTRY_TYPE_META[type] || { emoji: '📌', label: type }
}

function resolveName(charId, worldBook) {
  if (charId === '__player__') return '玩家'
  const char = worldBook?.characters?.find(c => c.id === charId)
  return char?.name || charId
}

function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return ''
  }
}

function getTodayStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

/**
 * 聚合今天的所有事件
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {Object} deps.worldMemory
 * @param {Function} deps.getScheduleForWorldBook — () => schedule status map
 * @returns {Promise<Array<{hour: number, entries: Array}>>}
 */
export async function aggregateTodayTimeline(deps) {
  const { worldBook, worldMemory, getScheduleForWorldBook } = deps
  const hourMap = {} // { hour: { hour, entries: [] } }

  // 1. 日程执行数据
  if (getScheduleForWorldBook) {
    try {
      const scheduleStatus = getScheduleForWorldBook(worldBook.id)
      for (const [charId, status] of Object.entries(scheduleStatus || {})) {
        if (!status || !status.hourEntries) continue

        for (const entry of status.hourEntries) {
          if (!entry || entry.hour == null) continue
          const hour = entry.hour

          // 已执行的小时
          if (entry.executed) {
            if (!hourMap[hour]) hourMap[hour] = { hour, entries: [] }
            hourMap[hour].entries.push({
              type: 'schedule',
              charName: resolveName(charId, worldBook),
              charId,
              activity: entry.plannedActivity?.activityLabel || entry.plannedActivity?.activityType || '未知活动',
              location: entry.plannedActivity?.locationName || '',
              mood: entry.executed.actualMood || '',
              time: formatTime(entry.executed.executedAt),
            })
          }
          // 当前或未来小时（显示计划）
          else if (entry.isCurrent || (entry.hour >= new Date().getHours() && entry.plannedActivity)) {
            if (!hourMap[hour]) hourMap[hour] = { hour, entries: [] }
            hourMap[hour].entries.push({
              type: 'schedule',
              charName: resolveName(charId, worldBook),
              charId,
              activity: entry.plannedActivity?.activityLabel || entry.plannedActivity?.activityType || '未知活动',
              location: entry.plannedActivity?.locationName || '',
              mood: '',
              time: '',
              isPlanned: true,
            })
          }
        }
      }
    } catch (e) {
      console.warn('[Timeline] schedule data load failed:', e.message)
    }
  }

  // 2. 世界记忆事件
  if (worldMemory?.events) {
    const todayStart = getTodayStart()
    const todayEvents = worldMemory.events.filter(e => e.createdAt >= todayStart)

    for (const evt of todayEvents) {
      const hour = evt.createdAt ? new Date(evt.createdAt).getHours() : null
      if (hour == null) continue

      if (!hourMap[hour]) hourMap[hour] = { hour, entries: [] }

      const participants = (evt.participants || []).map(id => resolveName(id, worldBook)).join('、')
      hourMap[hour].entries.push({
        type: evt.type || 'event',
        summary: evt.summary || '',
        participants,
        impact: evt.emotionalImpact || 0,
        time: formatTime(evt.createdAt),
      })
    }
  }

  // 按小时排序，返回有数据的小时
  return Object.values(hourMap).sort((a, b) => a.hour - b.hour)
}
