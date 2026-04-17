/**
 * useQuizData.js - 陪学 APP 数据层
 * 提供所有 quiz 相关数据的 kvStorage 读写。
 */
import { kvStorage } from '../../../../../src/storage/index.js'

const KEYS = {
  profile: 'phone_quiz_profile',
  history: 'phone_quiz_history',
  achievements: 'phone_quiz_achievements',
  topics: 'phone_quiz_topics',
  stats: 'phone_quiz_stats',
  wrong: 'phone_quiz_wrong',
  urlCache: 'phone_quiz_url_cache',
  teachingSessions: 'phone_quiz_teaching_sessions',
}

// ===== 用户画像 =====

export async function loadProfile() {
  return await kvStorage.get(KEYS.profile) || {
    rating: null,        // D/C/B/A/S
    xp: 0,
    level: 1,
    totalCorrect: 0,
    totalWrong: 0,
    totalQuestions: 0,
    streak: 0,
    bestStreak: 0,
    topics: [],
    createdAt: new Date().toISOString(),
  }
}

export async function saveProfile(profile) {
  await kvStorage.set(KEYS.profile, profile)
}

export function addXP(profile, amount) {
  profile.xp += amount
  const xpNeeded = profile.level * 100
  let leveledUp = false
  while (profile.xp >= xpNeeded) {
    profile.xp -= xpNeeded
    profile.level += 1
    leveledUp = true
  }
  return leveledUp
}

export function xpToNextLevel(profile) {
  return profile.level * 100 - profile.xp
}

// ===== 答题历史 =====

export async function loadHistory() {
  return await kvStorage.get(KEYS.history) || []
}

export async function saveHistory(history) {
  await kvStorage.set(KEYS.history, history)
}

export function addHistoryItem(history, item) {
  return [
    {
      id: `quiz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...item,
    },
    ...history,
  ]
}

// ===== 错题本 =====

export async function loadWrongQuestions() {
  return await kvStorage.get(KEYS.wrong) || []
}

export async function saveWrongQuestions(wrong) {
  await kvStorage.set(KEYS.wrong, wrong)
}

export function addWrongQuestion(wrong, question) {
  return [
    {
      id: `wrong_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      addedAt: new Date().toISOString(),
      reviewCount: 0,
      ...question,
    },
    ...wrong,
  ]
}

export function removeWrongQuestion(wrong, questionId) {
  return wrong.filter(q => q.id !== questionId)
}

// ===== 成就 =====

const DEFAULT_ACHIEVEMENTS = [
  { id: 'first_quiz', name: '初次尝试', description: '完成第一次测评', icon: '🎓', unlocked: false, unlockedAt: null },
  { id: 'streak_5', name: '连胜 5 题', description: '连续答对 5 题', icon: '🔥', unlocked: false, unlockedAt: null },
  { id: 'streak_10', name: '连胜 10 题', description: '连续答对 10 题', icon: '⚡', unlocked: false, unlockedAt: null },
  { id: 'perfect', name: '满分通关', description: '一套题全对', icon: '💯', unlocked: false, unlockedAt: null },
  { id: 'level_up', name: '升级', description: '达到 Level 5', icon: '🌟', unlocked: false, unlockedAt: null },
  { id: 'teacher_student', name: '名师高徒', description: '使用角色教学完成第一次学习', icon: '🧙', unlocked: false, unlockedAt: null },
  { id: 'multi_teacher', name: '博采众长', description: '使用过 3 个以上不同角色教学', icon: '📚', unlocked: false, unlockedAt: null },
  { id: 'url_hunter', name: 'URL 猎人', description: '导入 10 个不同 URL 学习', icon: '🔗', unlocked: false, unlockedAt: null },
  { id: 'rating_a', name: '学霸', description: '达到 A 评级', icon: '🏆', unlocked: false, unlockedAt: null },
  { id: 'rating_s', name: '学神', description: '达到 S 评级', icon: '👑', unlocked: false, unlockedAt: null },
  { id: 'total_50', name: '题海战术', description: '累计答题 50 道', icon: '📝', unlocked: false, unlockedAt: null },
  { id: 'total_100', name: '百题斩', description: '累计答题 100 道', icon: '⚔️', unlocked: false, unlockedAt: null },
]

export async function loadAchievements() {
  const stored = await kvStorage.get(KEYS.achievements)
  if (!stored) return DEFAULT_ACHIEVEMENTS.map(a => ({ ...a }))
  // 合并新增成就
  const storedIds = new Set(stored.map(a => a.id))
  const merged = [...stored]
  for (const def of DEFAULT_ACHIEVEMENTS) {
    if (!storedIds.has(def.id)) {
      merged.push({ ...def })
    }
  }
  return merged
}

export async function saveAchievements(achievements) {
  await kvStorage.set(KEYS.achievements, achievements)
}

export function checkAchievements(profile, achievements, newUnlock = []) {
  const unlocks = []
  for (const achievement of achievements) {
    if (achievement.unlocked) continue
    let shouldUnlock = false
    switch (achievement.id) {
      case 'first_quiz':
        shouldUnlock = profile.totalQuestions > 0
        break
      case 'streak_5':
        shouldUnlock = profile.bestStreak >= 5
        break
      case 'streak_10':
        shouldUnlock = profile.bestStreak >= 10
        break
      case 'level_up':
        shouldUnlock = profile.level >= 5
        break
      case 'rating_a':
        shouldUnlock = profile.rating === 'A' || profile.rating === 'S'
        break
      case 'rating_s':
        shouldUnlock = profile.rating === 'S'
        break
      case 'total_50':
        shouldUnlock = profile.totalQuestions >= 50
        break
      case 'total_100':
        shouldUnlock = profile.totalQuestions >= 100
        break
      default:
        shouldUnlock = newUnlock.includes(achievement.id)
    }
    if (shouldUnlock) {
      achievement.unlocked = true
      achievement.unlockedAt = new Date().toISOString()
      unlocks.push(achievement)
    }
  }
  return unlocks
}

// ===== 已学主题 =====

export async function loadTopics() {
  return await kvStorage.get(KEYS.topics) || []
}

export async function saveTopics(topics) {
  await kvStorage.set(KEYS.topics, topics)
}

export function addTopic(topics, topicName) {
  if (topics.some(t => t.name === topicName)) return topics
  return [
    { name: topicName, addedAt: new Date().toISOString(), questionCount: 0 },
    ...topics,
  ]
}

// ===== 每日统计 =====

export async function loadStats() {
  return await kvStorage.get(KEYS.stats) || {}
}

export async function saveStats(stats) {
  await kvStorage.set(KEYS.stats, stats)
}

export function recordDailyStat(stats, date, data) {
  const key = date || new Date().toISOString().slice(0, 10)
  if (!stats[key]) {
    stats[key] = { date: key, questionCount: 0, correctCount: 0, xpGained: 0, studyMinutes: 0 }
  }
  const day = stats[key]
  day.questionCount += data.questionCount || 0
  day.correctCount += data.correctCount || 0
  day.xpGained += data.xpGained || 0
  day.studyMinutes += data.studyMinutes || 0
  return stats
}

// ===== URL 缓存 =====

export async function loadUrlCache() {
  return await kvStorage.get(KEYS.urlCache) || {}
}

export async function saveUrlCache(cache) {
  await kvStorage.set(KEYS.urlCache, cache)
}

export function getCachedUrl(cache, url) {
  return cache[url] || null
}

export function setCachedUrl(cache, url, data) {
  cache[url] = {
    ...data,
    cachedAt: new Date().toISOString(),
  }
  return cache
}

// ===== 陪学会话记录 =====

export async function loadTeachingSessions() {
  return await kvStorage.get(KEYS.teachingSessions) || []
}

export async function saveTeachingSessions(sessions) {
  await kvStorage.set(KEYS.teachingSessions, sessions)
}

export function addTeachingSession(sessions, session) {
  return [
    {
      id: `teach_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...session,
    },
    ...sessions,
  ]
}

// ===== 时间格式化 =====

export function formatQuizTime(isoStr) {
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
  return `${date.getMonth() + 1}/${date.getDate()}`
}
