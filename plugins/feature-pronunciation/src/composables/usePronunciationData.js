/**
 * usePronunciationData.js - 口语发音数据层
 * 提供课程、笔记本、设置、档案的 kvStorage 读写。
 * 参照 useReaderData.js 模式。
 */
import { kvStorage } from '../../../../src/storage/index.js'

const KEYS = {
  settings: 'pronunciation_settings',
  notebook: 'pronunciation_notebook',
  profile: 'pronunciation_profile',
  practiceHistory: 'pronunciation_history',
}

// ===== 设置 =====

const DEFAULT_SETTINGS = {
  ttsApiEndpoint: null,
  ttsApiKey: null,
  ttsVoiceId: null,
  preferredLanguage: 'en',
}

export async function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(await kvStorage.get(KEYS.settings) || {}) }
}

export async function saveSettings(settings) {
  await kvStorage.set(KEYS.settings, settings)
}

// ===== 笔记本 =====

export async function loadNotebook() {
  return await kvStorage.get(KEYS.notebook) || []
}

export async function saveNotebook(notebook) {
  await kvStorage.set(KEYS.notebook, notebook)
}

export function addNotebookEntry(notebook, entry) {
  return [
    {
      id: `lesson_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    },
    ...notebook,
  ]
}

export function updateNotebookEntry(notebook, lessonId, updates) {
  return notebook.map((n) => (n.id === lessonId ? { ...n, ...updates } : n))
}

export function deleteNotebookEntry(notebook, lessonId) {
  return notebook.filter((n) => n.id !== lessonId)
}

export function getNotebookEntryById(notebook, lessonId) {
  return notebook.find((n) => n.id === lessonId) || null
}

// ===== 档案/统计 =====

const DEFAULT_PROFILE = {
  totalSessions: 0,
  totalItemsPracticed: 0,
  averageScore: 0,
  bestScore: 0,
  streakDays: 0,
  lastPracticeDate: null,
  createdAt: new Date().toISOString(),
}

export async function loadProfile() {
  return { ...DEFAULT_PROFILE, ...(await kvStorage.get(KEYS.profile) || {}) }
}

export async function saveProfile(profile) {
  await kvStorage.set(KEYS.profile, profile)
}

export function recordPractice(profile, score) {
  const today = new Date().toISOString().slice(0, 10)
  const lastDate = profile.lastPracticeDate
  let newStreak = profile.streakDays
  if (lastDate) {
    const diff = new Date(today) - new Date(lastDate)
    const daysDiff = Math.round(diff / (1000 * 60 * 60 * 24))
    if (daysDiff === 1) {
      newStreak += 1
    } else if (daysDiff > 1) {
      newStreak = 1
    }
    // daysDiff === 0: same day, keep streak
  } else {
    newStreak = 1
  }

  const totalItems = profile.totalItemsPracticed + 1
  const newAvg =
    Math.round((profile.averageScore * profile.totalItemsPracticed + score) / totalItems)

  return {
    ...profile,
    totalSessions: profile.totalSessions + 1,
    totalItemsPracticed: totalItems,
    averageScore: newAvg,
    bestScore: Math.max(profile.bestScore, score),
    streakDays: newStreak,
    lastPracticeDate: today,
  }
}

// ===== 练习历史 =====

export async function loadPracticeHistory() {
  return await kvStorage.get(KEYS.practiceHistory) || []
}

export async function savePracticeHistory(history) {
  // 只保留最近 100 条
  const trimmed = history.slice(-100)
  await kvStorage.set(KEYS.practiceHistory, trimmed)
}

export function addPracticeRecord(history, record) {
  return [
    ...history,
    {
      id: `practice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...record,
    },
  ]
}

// ===== 时间格式化 =====

export function formatPronTime(isoStr) {
  if (!isoStr) return ''
  const date = new Date(isoStr)
  const now = new Date()
  const diff = now - date
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }
  if (diff < 2 * 24 * 60 * 60 * 1000) return '昨天'
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`
  return `${date.getMonth() + 1}/${date.getDate()}`
}
