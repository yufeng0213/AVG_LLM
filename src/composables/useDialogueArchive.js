import { kvStorage } from '../storage/index.js'

const ARCHIVE_KEY = 'dialogue_archive'
const MAX_ARCHIVE = 150
const AUTO_ANALYSE_MIN = 100
const AUTO_ANALYSE_MAX = 140

export async function archiveDialogue(line) {
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

export async function getDialogueArchive() {
  return await kvStorage.get(ARCHIVE_KEY) || []
}

export async function getUnanalysedCount() {
  const entries = await kvStorage.get(ARCHIVE_KEY) || []
  return entries.length
}

export async function markAsAnalysed() {
  await kvStorage.set(ARCHIVE_KEY, [])
}

export function shouldAutoAnalyse(count) {
  return count >= AUTO_ANALYSE_MIN && count <= AUTO_ANALYSE_MAX
}
