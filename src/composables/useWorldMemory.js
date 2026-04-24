/**
 * 世界记忆提取流程
 * 将对话存档与 WorldMemory 数据库打通
 */
import { getDialogueArchive } from './useDialogueArchive.js'
import { getWorldMemory, addEvents, addCharacterMemory, recordExtraction } from '../memory/worldMemoryStore.js'
import { extractWorldMemory } from '../llm/llmService.memory.js'

/**
 * 从当前对话存档中提取并保存世界记忆
 * @param {string} worldBookId - 世界书ID
 * @returns {Promise<{success: boolean, eventsExtracted: number, memoriesExtracted: number}>}
 */
export async function extractMemoriesFromArchive(worldBookId) {
  if (!worldBookId) return { success: false, eventsExtracted: 0, memoriesExtracted: 0 }

  // 1. 加载当前世界记忆，获取上次提取记录
  const memory = await getWorldMemory(worldBookId)
  const lastLineCount = memory.lastExtractedLineCount || 0

  // 2. 获取全部对话存档
  const archive = await getDialogueArchive()
  if (archive.length <= lastLineCount) {
    return { success: false, eventsExtracted: 0, memoriesExtracted: 0 }
  }

  // 3. 只取新增部分
  const newDialogue = archive.slice(lastLineCount)

  // 4. 调用 LLM 提取
  // 需要世界书数据 — 这里通过 worldBookId 去加载
  const { loadWorldBooks } = await import('../worldbook/worldBookStore.js')
  const books = await loadWorldBooks()
  const worldBook = books.find(b => b.id === worldBookId)
  if (!worldBook) {
    return { success: false, eventsExtracted: 0, memoriesExtracted: 0 }
  }

  const result = await extractWorldMemory({
    worldBook,
    newDialogue,
    lastLineCount,
  })

  if (!result.success || (result.events.length === 0 && Object.keys(result.characterMemories).length === 0)) {
    // 即使没有提取到内容，也更新最后提取记录，避免反复尝试
    await recordExtraction(worldBookId, archive.length)
    return { success: true, eventsExtracted: 0, memoriesExtracted: 0 }
  }

  // 5. 保存事件
  if (result.events.length > 0) {
    await addEvents(worldBookId, result.events)
  }

  // 6. 保存角色记忆
  for (const [charId, memories] of Object.entries(result.characterMemories)) {
    for (const mem of memories) {
      await addCharacterMemory(worldBookId, charId, mem)
    }
  }

  // 7. 更新最后提取记录
  await recordExtraction(worldBookId, archive.length)

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
  const memory = await getWorldMemory(worldBookId)
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
    const { getSharedContext } = await import('../memory/worldMemoryStore.js')
    const shared = await getSharedContext(worldBookId, characterId, '__player__')
    if (shared.sharedEvents.length > 0 || shared.aAboutB.length > 0 || shared.bAboutA.length > 0) {
      parts.push('【共享记忆】')
      for (const evt of shared.sharedEvents) {
        parts.push(`- ${evt.summary}`)
      }
      for (const mem of shared.aAboutB) {
        parts.push(`- 你对他/她的印象: ${mem.content}`)
      }
      for (const mem of shared.bAboutA) {
        parts.push(`- 他/她对你的印象: ${mem.content}`)
      }
    }
  }

  return parts.join('\n')
}
