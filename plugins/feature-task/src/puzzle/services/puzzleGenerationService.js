/**
 * 解谜任务生成服务
 * LLM 生成谜题链，前端负责展示和交互
 */

import { callChatCompletion, getValidatedActiveConfig } from '../../../../../src/llm/llmService.core.js'
import { resolvePrompt } from '../../../../../src/llm/promptRegistry.js'

async function savePuzzleLlmDebug(userPrompt, systemPrompt, rawResponse, parseSuccess) {
  const timestamp = new Date().toISOString()
  const entry = [
    '='.repeat(60),
    `[${timestamp}] 解谜生成 | 解析${parseSuccess ? '成功' : '失败'}`,
    '='.repeat(60),
    '',
    '--- SYSTEM PROMPT ---', systemPrompt,
    '',
    '--- USER PROMPT ---', userPrompt,
    '',
    '--- LLM RESPONSE ---', rawResponse,
    '',
  ].join('\n')

  if (typeof window !== 'undefined' && !window.Capacitor) {
    try { localStorage.setItem('puzzle_llm_debug_log', entry) } catch {}
    return
  }
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    try { await Filesystem.mkdir({ path: 'debug', directory: Directory.Documents, recursive: true }) } catch {}
    const result = await Filesystem.writeFile({
      path: 'debug/puzzle-llm-responses.log', data: entry,
      directory: Directory.Documents, encoding: Encoding.UTF8,
    })
    if (result && result.uri) return
  } catch {}
  try { localStorage.setItem('puzzle_llm_debug_log', entry) } catch {}
}

export const generatePuzzleData = async ({ task, worldBook, userProfile }) => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) throw new Error(validation.error || 'API配置无效')

  const systemPrompt = await resolvePrompt('task:puzzle')

  const userPrompt = `世界书标题：${worldBook?.title || '未命名'}
世界书概述：${worldBook?.summary || worldBook?.entries?.overview || '无'}
任务名称：${task?.name || '未知任务'}
任务描述：${task?.description || '无'}
玩家：${userProfile?.name || '玩家'}

请按紧凑 XML 格式生成解谜任务数据。`

  try {
    console.log('[PuzzleGen] 开始调用 LLM, maxTokens=20000')
    const result = await callChatCompletion({
      config: validation.config, systemPrompt, userPrompt,
      temperature: 0.85, maxTokens: 20000, timeout: 120000,
    })
    console.log('[PuzzleGen] LLM 返回, success:', result.success, 'data长度:', result.data?.length || 0)

    if (!result.success) throw new Error(result.error || 'LLM调用失败')

    const content = result.data || ''
    const parsed = parsePuzzleXml(content)

    if (!parsed || parsed.puzzles.length === 0) {
      console.warn('[PuzzleGen] 解析失败或无谜题')
      await savePuzzleLlmDebug(userPrompt, systemPrompt, content, false)
      return { success: false, error: 'LLM 生成谜题失败', data: null }
    }

    await savePuzzleLlmDebug(userPrompt, systemPrompt, content, true)
    return { success: true, data: parsed, rawResponse: content }
  } catch (error) {
    console.error('[PuzzleGen] 异常:', error.message)
    return { success: false, error: error.message, data: null }
  }
}

function parsePuzzleXml(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const withoutThinking = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
  const fencedMatch = withoutThinking.match(/```(?:xml)?\s*([\s\S]*?)```/i)
  const content = fencedMatch?.[1]?.trim() || withoutThinking

  const parseAttrs = (str) => {
    const result = {}
    const regex = /([\w-]+)="([^"]*)"/g
    let match
    while ((match = regex.exec(str)) !== null) result[match[1]] = match[2]
    return result
  }

  const data = {
    story: '',
    finalAnswerPrompt: '',
    puzzles: [],
  }

  const storyMatch = content.match(/<story>([\s\S]*?)<\/story>/i)
  if (storyMatch) data.story = storyMatch[1].trim()

  const finalMatch = content.match(/<final>([\s\S]*?)<\/final>/i)
  if (finalMatch) data.finalAnswerPrompt = finalMatch[1].trim()

  const puzzleRegex = /<puzzle([\s\S]*?)>([\s\S]*?)<\/puzzle>/gi
  let pMatch
  while ((pMatch = puzzleRegex.exec(content)) !== null) {
    const attrs = parseAttrs(pMatch[1])
    const inner = pMatch[2]

    const clueMatch = inner.match(/<clue>([\s\S]*?)<\/clue>/i)
    const options = []
    const optRegex = /<options>([\s\S]*?)<\/options>/gi
    let oMatch
    while ((oMatch = optRegex.exec(inner)) !== null) options.push(oMatch[1].trim())

    const hint1Match = inner.match(/<hint1>([\s\S]*?)<\/hint1>/i)
    const hint2Match = inner.match(/<hint2>([\s\S]*?)<\/hint2>/i)
    const hints = [hint1Match?.[1].trim(), hint2Match?.[1].trim()].filter(Boolean)

    data.puzzles.push({
      type: attrs.type || 'riddle',
      answer: attrs.answer || '',
      clue: clueMatch?.[1].trim() || '',
      options,
      hints,
    })
  }

  if (data.puzzles.length === 0) return null
  return data
}
