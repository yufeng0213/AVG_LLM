import { isSQLiteAvailable, query, exec } from '../db/connection.js'

const MAX_ARCHIVE = 150
const AUTO_ANALYSE_MIN = 100
const AUTO_ANALYSE_MAX = 140

export async function archiveDialogue(line) {
  if (isSQLiteAvailable()) {
    await exec(
      `INSERT INTO dialogue_archive (speaker, text_preview, full_text, timestamp, world_book_id, character_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        line?.speaker || '',
        String(line?.text || '').slice(0, 150),
        String(line?.text || ''),
        line?.timestamp || new Date().toISOString(),
        line?.worldBookId || '',
        line?.characterId || '',
      ]
    )
    // 保留最近 MAX_ARCHIVE 条
    const rows = await query('SELECT COUNT(*) as cnt FROM dialogue_archive')
    const cnt = rows[0]?.cnt || 0
    if (cnt > MAX_ARCHIVE) {
      await exec(
        `DELETE FROM dialogue_archive WHERE id IN (
          SELECT id FROM dialogue_archive ORDER BY id ASC LIMIT ?
        )`,
        [cnt - MAX_ARCHIVE]
      )
    }
  } else {
    const { kvStorage } = await import('../storage/index.js')
    const ARCHIVE_KEY = 'dialogue_archive'
    const entries = await kvStorage.get(ARCHIVE_KEY) || []
    entries.push({
      speaker: line?.speaker || '',
      text: String(line?.text || '').slice(0, 150),
      timestamp: line?.timestamp || new Date().toISOString(),
      worldBookId: line?.worldBookId || '',
      characterId: line?.characterId || '',
    })
    if (entries.length > MAX_ARCHIVE) {
      entries.splice(0, entries.length - MAX_ARCHIVE)
    }
    await kvStorage.set(ARCHIVE_KEY, entries)
  }
}

export async function getDialogueArchive() {
  if (isSQLiteAvailable()) {
    const rows = await query('SELECT speaker, text_preview as text, timestamp, world_book_id as worldBookId, character_id as characterId FROM dialogue_archive ORDER BY id DESC LIMIT ?', [MAX_ARCHIVE])
    return rows.reverse()
  } else {
    const { kvStorage } = await import('../storage/index.js')
    return await kvStorage.get('dialogue_archive') || []
  }
}

export async function getUnanalysedCount() {
  if (isSQLiteAvailable()) {
    const rows = await query('SELECT COUNT(*) as cnt FROM dialogue_archive')
    return rows[0]?.cnt || 0
  } else {
    const { kvStorage } = await import('../storage/index.js')
    const entries = await kvStorage.get('dialogue_archive') || []
    return entries.length
  }
}

export async function markAsAnalysed() {
  if (isSQLiteAvailable()) {
    await exec('DELETE FROM dialogue_archive')
  } else {
    const { kvStorage } = await import('../storage/index.js')
    await kvStorage.set('dialogue_archive', [])
  }
}

export function shouldAutoAnalyse(count) {
  return count >= AUTO_ANALYSE_MIN && count <= AUTO_ANALYSE_MAX
}
