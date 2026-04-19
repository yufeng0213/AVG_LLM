/**
 * 剧情券存档服务
 * 负责保存、加载、删除剧情券生成的完整剧情
 */

import { kvStorage } from '../storage/index.js'

const ARCHIVE_KEY = 'story_ticket_archives'

/**
 * 保存剧情存档
 * @param {Object} archive - 存档对象
 * @param {string} archive.id - 唯一ID
 * @param {string} archive.title - 标题
 * @param {string} archive.targetCharacter - 目标角色名
 * @param {string} archive.theme - 主题
 * @param {string} archive.worldBookId - 世界书ID
 * @param {Array} archive.dialogues - 对话数组（AVG格式）
 * @param {string} archive.rawContent - 原始LLM返回内容
 * @param {number} archive.createdAt - 创建时间戳
 * @param {number} archive.wordCount - 字数统计
 */
export async function saveStoryArchive(archive) {
  const archives = await loadStoryArchives()
  archives.push(archive)
  await kvStorage.set(ARCHIVE_KEY, archives)
}

/**
 * 加载所有剧情存档列表
 * @returns {Promise<Array>} 存档数组
 */
export async function loadStoryArchives() {
  return await kvStorage.get(ARCHIVE_KEY) || []
}

/**
 * 加载单个剧情存档
 * @param {string} archiveId - 存档ID
 * @returns {Promise<Object|null>} 存档对象
 */
export async function loadStoryArchive(archiveId) {
  const archives = await loadStoryArchives()
  return archives.find(a => a.id === archiveId) || null
}

/**
 * 删除剧情存档
 * @param {string} archiveId - 存档ID
 */
export async function deleteStoryArchive(archiveId) {
  const archives = await loadStoryArchives()
  const filtered = archives.filter(a => a.id !== archiveId)
  await kvStorage.set(ARCHIVE_KEY, filtered)
}

/**
 * 按世界书ID过滤存档
 * @param {string} worldBookId - 世界书ID
 * @returns {Promise<Array>} 存档数组
 */
export async function loadArchivesByWorldBook(worldBookId) {
  const archives = await loadStoryArchives()
  return archives.filter(a => a.worldBookId === worldBookId)
}
