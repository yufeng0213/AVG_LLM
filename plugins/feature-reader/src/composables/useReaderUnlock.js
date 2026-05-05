/**
 * useReaderUnlock.js - 章节解锁管理
 * 第一章免费，后续每章 50 金币
 */
import { kvStorage } from '../../../../src/storage/index.js'
import { getReaderCoins, spendReaderCoins } from './useReaderEconomy.js'

const UNLOCK_KEY_PREFIX = 'reader_unlock_'
const CHAPTER_PRICE = 50

function unlockKey(storyId, chapterIndex) {
  return `${UNLOCK_KEY_PREFIX}${storyId}_${chapterIndex}`
}

/**
 * 检查章节是否已解锁
 */
export async function isChapterUnlocked(storyId, chapterIndex) {
  // 第一章永远免费
  if (chapterIndex === 0) return true
  const data = await kvStorage.get(unlockKey(storyId, chapterIndex))
  return !!data
}

/**
 * 解锁章节（扣除金币）
 * @returns {{ success, message, coinsRemaining }}
 */
export async function unlockChapter(storyId, chapterIndex) {
  if (chapterIndex === 0) return { success: true, message: '免费章节', coinsRemaining: await getReaderCoins() }

  const alreadyUnlocked = await isChapterUnlocked(storyId, chapterIndex)
  if (alreadyUnlocked) return { success: true, message: '已解锁', coinsRemaining: await getReaderCoins() }

  const canSpend = await spendReaderCoins(CHAPTER_PRICE)
  if (!canSpend) {
    return { success: false, message: `金币不足！解锁本章需要 ${CHAPTER_PRICE} 金币` }
  }

  await kvStorage.set(unlockKey(storyId, chapterIndex), { unlockedAt: new Date().toISOString() })
  const remaining = await getReaderCoins()
  return { success: true, message: '解锁成功', coinsRemaining: remaining }
}

/**
 * 获取解锁章节的价格
 */
export function getChapterPrice() {
  return CHAPTER_PRICE
}

/**
 * 获取故事大纲（标题列表）
 */
export async function getChapterOutline(storyId) {
  const key = `reader_outline_${storyId}`
  const data = await kvStorage.get(key)
  return Array.isArray(data) ? data : []
}

/**
 * 保存故事大纲
 */
export async function saveChapterOutline(storyId, titles) {
  const key = `reader_outline_${storyId}`
  await kvStorage.set(key, titles)
}

/**
 * 清除故事大纲
 */
export async function clearChapterOutline(storyId) {
  const key = `reader_outline_${storyId}`
  await kvStorage.set(key, [])
}
