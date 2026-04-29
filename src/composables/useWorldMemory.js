/**
 * 世界记忆提取流程
 * 将对话存档与 WorldMemory 数据库打通
 */
import { getDialogueArchive } from './useDialogueArchive.js'
import { useWorldMemoryStore } from '../stores/worldMemory.store.js'
import { extractWorldMemory } from '../llm/llmService.memory.js'

/**
 * 从当前对话存档中提取并保存世界记忆
 * @param {string} worldBookId - 世界书ID
 * @returns {Promise<{success: boolean, eventsExtracted: number, memoriesExtracted: number}>}
 */
export async function extractMemoriesFromArchive(worldBookId) {
  if (!worldBookId) return { success: false, eventsExtracted: 0, memoriesExtracted: 0 }

  const mem = useWorldMemoryStore()

  // 1. 加载当前世界记忆，获取上次提取记录
  const memory = await mem.get(worldBookId)
  const lastLineCount = memory.lastExtractedLineCount || 0

  // 2. 获取全部对话存档
  const archive = await getDialogueArchive()
  if (archive.length <= lastLineCount) {
    return { success: false, eventsExtracted: 0, memoriesExtracted: 0 }
  }

  // 3. 只取新增部分
  const newDialogue = archive.slice(lastLineCount)

  // 4. 调用 LLM 提取
  const { getNormalizedBook } = await import('../worldbook/worldBookStore.js')
  const worldBook = await getNormalizedBook(worldBookId)
  if (!worldBook || worldBook.id !== worldBookId) {
    return { success: false, eventsExtracted: 0, memoriesExtracted: 0 }
  }

  const result = await extractWorldMemory({
    worldBook,
    newDialogue,
    lastLineCount,
  })

  if (!result.success || (result.events.length === 0 && Object.keys(result.characterMemories).length === 0)) {
    await mem.recordExtraction(worldBookId, archive.length)
    return { success: true, eventsExtracted: 0, memoriesExtracted: 0 }
  }

  // 5. 保存事件
  if (result.events.length > 0) {
    await mem.addEvents(worldBookId, result.events)
  }

  // 6. 批量保存角色记忆
  const memoryItems = []
  for (const [charId, memories] of Object.entries(result.characterMemories)) {
    for (const memEntry of memories) {
      memoryItems.push({ characterId: charId, memoryEntry: memEntry })
    }
  }
  if (memoryItems.length > 0) {
    await mem.addCharacterMemoriesBatch(worldBookId, memoryItems)
  }

  // 7. 更新最后提取记录
  await mem.recordExtraction(worldBookId, archive.length)

  return {
    success: true,
    eventsExtracted: result.events.length,
    memoriesExtracted: Object.values(result.characterMemories).reduce((sum, arr) => sum + arr.length, 0),
  }
}

/**
 * 获取指定世界书的记忆摘要（用于注入 LLM 上下文）
 * @param {string} worldBookId
 * @param {string} characterId - 可选，指定角色
 * @returns {Promise<string>} 记忆摘要文本
 */
export async function getMemoryContext(worldBookId, characterId) {
  const mem = useWorldMemoryStore()

  const memory = await mem.get(worldBookId)
  const parts = []

  // 最近事件
  const recentEvents = (memory.events || [])
    .filter(e => e.status === 'active')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(-5)

  if (recentEvents.length > 0) {
    parts.push('【近期事件】')
    for (const evt of recentEvents) {
      parts.push(`- ${evt.summary} (参与者: ${evt.participants.join(', ')}, 情感强度: ${evt.emotionalImpact})`)
    }
  }

  // 角色记忆
  if (characterId) {
    const shared = await mem.getSharedContext(worldBookId, characterId, '__player__')
    if (shared.sharedEvents.length > 0 || shared.aAboutB.length > 0 || shared.bAboutA.length > 0) {
      parts.push('【共享记忆】')
      for (const evt of shared.sharedEvents) {
        parts.push(`- ${evt.summary}`)
      }
      for (const m of shared.aAboutB) {
        parts.push(`- 你对他/她的印象: ${m.content}`)
      }
      for (const m of shared.bAboutA) {
        parts.push(`- 他/她对你的印象: ${m.content}`)
      }
    }
  }

  return parts.join('\n')
}
