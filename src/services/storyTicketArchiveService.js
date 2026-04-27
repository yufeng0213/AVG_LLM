/**
 * 剧情券存档服务
 * 负责保存、加载、删除剧情券生成的完整剧情
 */

import { isSQLiteAvailable, query, exec } from '../db/db.js'

const KV_ARCHIVE_KEY = 'story_ticket_archives'

/**
 * 保存剧情存档
 */
export async function saveStoryArchive(archive) {
  if (isSQLiteAvailable()) {
    await exec(
      `INSERT INTO story_ticket_archives (id, title, target_character, theme, world_book_id, dialogues, raw_content, word_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [archive.id, archive.title || '', archive.targetCharacter || '',
       archive.theme || '', archive.worldBookId || '',
       JSON.stringify(archive.dialogues || []), archive.rawContent || '',
       archive.wordCount || 0, new Date(archive.createdAt || Date.now()).toISOString()]
    )
  } else {
    const { kvStorage } = await import('../storage/index.js')
    const archives = await kvStorage.get(KV_ARCHIVE_KEY) || []
    archives.push(archive)
    await kvStorage.set(KV_ARCHIVE_KEY, archives)
  }
}

/**
 * 加载所有剧情存档列表
 */
export async function loadStoryArchives() {
  if (isSQLiteAvailable()) {
    const rows = await query('SELECT * FROM story_ticket_archives ORDER BY created_at DESC')
    return rows.map(r => ({
      id: r.id, title: r.title, targetCharacter: r.target_character,
      theme: r.theme, worldBookId: r.world_book_id,
      dialogues: JSON.parse(r.dialogues || '[]'),
      rawContent: r.raw_content, wordCount: r.word_count,
      createdAt: new Date(r.created_at).getTime(),
    }))
  } else {
    const { kvStorage } = await import('../storage/index.js')
    return await kvStorage.get(KV_ARCHIVE_KEY) || []
  }
}

/**
 * 加载单个剧情存档
 */
export async function loadStoryArchive(archiveId) {
  const archives = await loadStoryArchives()
  return archives.find(a => a.id === archiveId) || null
}

/**
 * 删除剧情存档
 */
export async function deleteStoryArchive(archiveId) {
  if (isSQLiteAvailable()) {
    await exec('DELETE FROM story_ticket_archives WHERE id = ?', [archiveId])
  } else {
    const { kvStorage } = await import('../storage/index.js')
    const archives = await kvStorage.get(KV_ARCHIVE_KEY) || []
    const filtered = archives.filter(a => a.id !== archiveId)
    await kvStorage.set(KV_ARCHIVE_KEY, filtered)
  }
}

/**
 * 按世界书ID过滤存档
 */
export async function loadArchivesByWorldBook(worldBookId) {
  if (isSQLiteAvailable()) {
    const rows = await query(
      'SELECT * FROM story_ticket_archives WHERE world_book_id = ? ORDER BY created_at DESC',
      [worldBookId]
    )
    return rows.map(r => ({
      id: r.id, title: r.title, targetCharacter: r.target_character,
      theme: r.theme, worldBookId: r.world_book_id,
      dialogues: JSON.parse(r.dialogues || '[]'),
      rawContent: r.raw_content, wordCount: r.word_count,
      createdAt: new Date(r.created_at).getTime(),
    }))
  } else {
    const archives = await loadStoryArchives()
    return archives.filter(a => a.worldBookId === worldBookId)
  }
}
