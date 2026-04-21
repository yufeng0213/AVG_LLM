/**
 * usePhoneMoments.js - 朋友圈/动态数据管理
 * 角色基于日程/心情发动态，玩家点赞评论，角色回应
 */
import { computed, reactive, ref } from 'vue'
import { kvStorage } from '../../../../../src/storage/index.js'
import { getGroupedContacts, getWorldBookById } from './usePhoneData.js'
import { generatePhoneMomentsReply } from '../../../../../src/llm/llmService.js'

const STORAGE_KEY_MOMENTS = 'avg_llm_moments_v1'
const STORAGE_KEY_MOMENTS_SEEN = 'avg_llm_moments_seen_v1'

// 模块级状态
let _moments = null
let _momentsSeen = null
let _initialized = false

async function loadFromStorage() {
  const stored = await kvStorage.get(STORAGE_KEY_MOMENTS)
  const seen = await kvStorage.get(STORAGE_KEY_MOMENTS_SEEN)
  _moments = Array.isArray(stored) ? stored : []
  _momentsSeen = Array.isArray(seen) ? seen : []
  _initialized = true
}

async function saveMoments() {
  await kvStorage.set(STORAGE_KEY_MOMENTS, _moments)
}

async function saveSeen() {
  await kvStorage.set(STORAGE_KEY_MOMENTS_SEEN, _momentsSeen)
}

function genId() {
  return `moment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// 动态模板库（用于日程驱动的自动生成）
const MOMENT_TEMPLATES = [
  { trigger: 'sleep', emojis: ['😴', '🌙', '💤'], texts: ['困了', '晚安', '好梦'] },
  { trigger: 'meal', emojis: ['🍽️', '🍚', '🍜'], texts: ['吃饭中', '开饭了', '好饿'] },
  { trigger: 'study', emojis: ['📖', '📚', '✏️'], texts: ['学习中', '看书', '复习'] },
  { trigger: 'work', emojis: ['💼', '🏢'], texts: ['工作中', '好忙', '加班中'] },
  { trigger: 'class', emojis: ['📚', '🏫'], texts: ['上课中', '听课', '困在课堂上'] },
  { trigger: 'training', emojis: ['🏃', '💪', '🏋️'], texts: ['训练中', '好累但开心', '挥洒汗水'] },
  { trigger: 'leisure', emojis: ['🎮', '☕', '🎵'], texts: ['放松一下', '好悠闲', '享受时光'] },
  { trigger: 'hobby', emojis: ['🎨', '🎸', '🎯'], texts: ['做喜欢的事', '专注中', '沉浸在自己世界里'] },
  { trigger: 'social', emojis: ['👥', '🎉'], texts: ['和朋友在一起', '好开心', '热闹的一天'] },
  { trigger: 'mission', emojis: ['🎯', '⚡'], texts: ['执行任务中', '全力以赴', '不能分心'] },
  { trigger: 'appointment', emojis: ['❤️', '🌹'], texts: ['在等一个人', '有点紧张', '希望今天顺利'] },
]

// 心情词库
const MOOD_WORDS = {
  happy: ['开心', '心情不错', '今天很美好', '感觉很好'],
  tired: ['累了', '好想休息', '需要充电'],
  bored: ['好无聊', '没事做', '发呆中'],
  excited: ['好激动', '期待', '迫不及待'],
  calm: ['平静的一天', '岁月静好', '安宁'],
  annoyed: ['有点烦', '不太开心', '心累'],
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function usePhoneMoments() {
  if (!_initialized) {
    _moments = []
    _momentsSeen = []
    _initialized = true
    loadFromStorage()
  }

  const moments = reactive(_moments)
  const isPosting = ref(false)

  // 未读动态（没看过的）
  const unseenMoments = computed(() => {
    return moments
      .filter(m => !_momentsSeen.includes(m.id))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  })

  // 已读动态
  const seenMoments = computed(() => {
    return moments
      .filter(m => _momentsSeen.includes(m.id))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  })

  // 某角色的动态
  function getMomentsByChar(charId) {
    return moments
      .filter(m => m.charId === charId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }

  // 某动态的互动统计
  function getInteraction(momentId) {
    const m = moments.find(mm => mm.id === momentId)
    if (!m) return { likes: 0, comments: [], hasCharReply: false }
    return {
      likes: m.likes?.length || 0,
      comments: m.comments || [],
      hasCharReply: m.charReply ? true : false,
      charReply: m.charReply || null,
    }
  }

  // 点赞
  async function likeMoment(momentId) {
    const m = moments.find(mm => mm.id === momentId)
    if (!m) return
    if (!m.likes) m.likes = []
    // 玩家点赞
    if (!m.likes.includes('player')) {
      m.likes.push('player')
      await saveMoments()
      // 触发角色回应（小概率）
      if (Math.random() < 0.4) {
        await generateCharReply(m)
      }
    }
  }

  // 评论
  async function commentMoment(momentId, text) {
    const m = moments.find(mm => mm.id === momentId)
    if (!m || !text.trim()) return
    if (!m.comments) m.comments = []
    m.comments.push({
      id: genId(),
      from: 'player',
      text: text.trim(),
      createdAt: new Date().toISOString(),
    })
    await saveMoments()

    // 触发角色回应（大概率）
    if (Math.random() < 0.7) {
      await generateCharReply(m)
    }
  }

  // 角色回应
  async function generateCharReply(moment) {
    if (moment.charReply) return // 已有回应
    try {
      const book = await getWorldBookById(moment.bookId)
      const char = book?.characters?.find(c => c.id === moment.charId)
      if (!char) return

      const playerAction = [
        moment.likes?.includes('player') ? '玩家点了赞' : '',
        moment.comments?.filter(c => c.from === 'player').map(c => `玩家评论：${c.text}`).join('，') || '无评论',
      ].filter(Boolean).join('，')

      const result = await generatePhoneMomentsReply({
        worldBook: book,
        contact: {
          id: char.id,
          name: char.name,
          identity: char.identity || '',
        },
        momentText: moment.text,
        playerAction,
        options: { temperature: 0.85, maxTokens: 60 },
      })

      if (result.success && result.reply) {
        moment.charReply = {
          text: result.reply,
          createdAt: new Date().toISOString(),
        }
        await saveMoments()
      }
    } catch (e) {
      console.warn('[Moments] 角色回应生成失败:', e)
    }
  }

  // 生成角色动态
  async function generateMomentForChar(bookId, charId, charName, activityType, mood) {
    const template = MOMENT_TEMPLATES.find(t => t.trigger === activityType)
    const emoji = template ? randomPick(template.emojis) : '📍'
    const baseText = template ? randomPick(template.texts) : '日常'

    // 加入心情
    const moodWords = mood ? MOOD_WORDS[mood] : null
    const moodText = moodWords ? randomPick(moodWords) : ''

    const text = moodText ? `${baseText}，${moodText}` : baseText

    const newMoment = {
      id: genId(),
      bookId,
      charId,
      charName,
      text,
      emoji,
      activityType,
      mood,
      likes: [],
      comments: [],
      charReply: null,
      createdAt: new Date().toISOString(),
    }

    moments.push(newMoment)
    await saveMoments()
    return newMoment
  }

  // 标记已读
  async function markAsSeen(momentId) {
    if (!_momentsSeen.includes(momentId)) {
      _momentsSeen.push(momentId)
      await saveSeen()
    }
  }

  // 标记全部已读
  async function markAllSeen() {
    for (const m of moments) {
      if (!_momentsSeen.includes(m.id)) {
        _momentsSeen.push(m.id)
      }
    }
    await saveSeen()
  }

  // 删除动态
  async function deleteMoment(momentId) {
    const idx = moments.findIndex(m => m.id === momentId)
    if (idx !== -1) moments.splice(idx, 1)
    await saveMoments()
  }

  // 清理旧动态（保留近7天）
  async function cleanupOldMoments(days = 7) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const before = moments.length
    const filtered = moments.filter(m => new Date(m.createdAt) >= cutoff)
    if (filtered.length !== before) {
      moments.splice(0, moments.length, ...filtered)
      await saveMoments()
    }
  }

  return {
    moments,
    isPosting,
    unseenMoments,
    seenMoments,
    getMomentsByChar,
    getInteraction,
    likeMoment,
    commentMoment,
    generateMomentForChar,
    markAsSeen,
    markAllSeen,
    deleteMoment,
    cleanupOldMoments,
  }
}
