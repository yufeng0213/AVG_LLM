/**
 * useReaderComments.js - 段评/章评管理
 * 使用 kvStorage 存储，key 格式: reader_comments_{storyId}_{chapterIndex}
 */
import { kvStorage } from '../../../../src/storage/index.js'

function commentsKey(storyId, chapterIndex) {
  return `reader_comments_${storyId}_${chapterIndex}`
}

export function createEmptyComments() {
  return {
    chapterComments: [],
    paragraphComments: {},
    meta: { totalParagraphs: 0, generatedAt: new Date().toISOString() },
  }
}

/**
 * 加载指定章节的评论数据
 */
export async function loadComments(storyId, chapterIndex) {
  try {
    const data = await kvStorage.get(commentsKey(storyId, chapterIndex))
    return data || createEmptyComments()
  } catch {
    return createEmptyComments()
  }
}

/**
 * 保存评论数据（覆盖模式）
 */
export async function saveComments(storyId, chapterIndex, comments) {
  await kvStorage.set(commentsKey(storyId, chapterIndex), comments)
}

/**
 * 合并评论（用于 LLM 生成后追加）
 */
export async function mergeComments(storyId, chapterIndex, newComments) {
  const existing = await loadComments(storyId, chapterIndex)

  // 合并章评
  for (const cc of (newComments.chapterComments || [])) {
    if (!existing.chapterComments.find(c => c.id === cc.id)) {
      existing.chapterComments.push(cc)
    }
  }

  // 合并段评
  for (const [idx, comments] of Object.entries(newComments.paragraphComments || {})) {
    if (!existing.paragraphComments[idx]) {
      existing.paragraphComments[idx] = []
    }
    for (const c of comments) {
      if (!existing.paragraphComments[idx].find(ec => ec.id === c.id)) {
        existing.paragraphComments[idx].push(c)
      }
    }
  }

  existing.meta.totalParagraphs = Math.max(
    existing.meta.totalParagraphs || 0,
    newComments.meta?.totalParagraphs || 0
  )

  await saveComments(storyId, chapterIndex, existing)
  return existing
}

/**
 * 获取有评论的段落索引集合
 */
export function getCommentedParagraphs(comments) {
  return new Set(Object.keys(comments.paragraphComments || {}))
}

/**
 * 添加用户评论
 */
export async function addComment(storyId, chapterIndex, paraIdx, comment) {
  const data = await loadComments(storyId, chapterIndex)
  const key = String(paraIdx)
  if (paraIdx === 'chapter') {
    data.chapterComments.push(comment)
  } else {
    if (!data.paragraphComments[key]) data.paragraphComments[key] = []
    data.paragraphComments[key].push(comment)
  }
  await saveComments(storyId, chapterIndex, data)
  return data
}

/**
 * 添加回复
 */
export async function addReply(storyId, chapterIndex, paraIdx, commentId, reply) {
  const data = await loadComments(storyId, chapterIndex)
  const comments = paraIdx === 'chapter'
    ? data.chapterComments
    : (data.paragraphComments[String(paraIdx)] || [])

  const target = comments.find(c => c.id === commentId)
  if (!target) return data

  if (!target.replies) target.replies = []
  target.replies.push(reply)
  await saveComments(storyId, chapterIndex, data)
  return data
}

/**
 * 点赞/取消点赞
 */
export async function toggleLike(storyId, chapterIndex, paraIdx, commentId) {
  const data = await loadComments(storyId, chapterIndex)
  const comments = paraIdx === 'chapter'
    ? data.chapterComments
    : (data.paragraphComments[String(paraIdx)] || [])

  const target = comments.find(c => c.id === commentId)
  if (!target) return { data, liked: false }

  if (!target.liked) {
    target.likes = (target.likes || 0) + 1
    target.liked = true
  } else {
    target.likes = Math.max(0, (target.likes || 1) - 1)
    target.liked = false
  }

  await saveComments(storyId, chapterIndex, data)
  return { data, liked: target.liked }
}
