/**
 * 线索收集任务生成服务
 * LLM 生成案件摘要、NPC对话、线索和结论
 */

import { callChatCompletion, getValidatedActiveConfig } from '../../../../../src/llm/llmService.core.js'
import { resolvePrompt } from '../../../../../src/llm/promptRegistry.js'

async function saveClueLlmDebug(userPrompt, systemPrompt, rawResponse, parseSuccess) {
  const timestamp = new Date().toISOString()
  const entry = [
    '='.repeat(60),
    `[${timestamp}] 线索收集 | 解析${parseSuccess ? '成功' : '失败'}`,
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
    try { localStorage.setItem('clue_llm_debug', entry) } catch {}
    return
  }
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    try { await Filesystem.mkdir({ path: 'debug', directory: Directory.Documents, recursive: true }) } catch {}
    const result = await Filesystem.writeFile({
      path: 'debug/clue-llm-responses.log', data: entry,
      directory: Directory.Documents, encoding: Encoding.UTF8,
    })
    if (result && result.uri) return
  } catch {}
  try { localStorage.setItem('clue_llm_debug', entry) } catch {}
}

export const generateClueData = async ({ task, worldBook, userProfile }) => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) throw new Error(validation.error || 'API配置无效')

  const systemPrompt = await resolvePrompt('task:clue')

  const userPrompt = `世界书标题：${worldBook?.title || '未命名'}
世界书概述：${worldBook?.summary || worldBook?.entries?.overview || '无'}
任务名称：${task?.name || '未知任务'}
任务描述：${task?.description || '无'}

请按紧凑 XML 格式生成线索收集任务数据。`

  try {
    const result = await callChatCompletion({
      config: validation.config, systemPrompt, userPrompt,
      temperature: 0.85, maxTokens: 20000, timeout: 120000,
    })

    if (!result.success) throw new Error(result.error || 'LLM调用失败')

    const content = result.data || ''
    const parsed = parseClueXml(content)

    if (!parsed || parsed.npcs.length === 0) {
      await saveClueLlmDebug(userPrompt, systemPrompt, content, false)
      return { success: false, error: 'LLM 生成线索任务失败', data: null }
    }

    await saveClueLlmDebug(userPrompt, systemPrompt, content, true)
    return { success: true, data: parsed, rawResponse: content }
  } catch (error) {
    console.error('[ClueGen] 异常:', error.message)
    return { success: false, error: error.message, data: null }
  }
}

function parseClueXml(rawContent) {
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
    npcs: [],
    clues: [],
    conclusion: null,
  }

  const storyMatch = content.match(/<story>([\s\S]*?)<\/story>/i)
  if (storyMatch) data.story = storyMatch[1].trim()

  // Parse NPCs
  const npcRegex = /<npc([\s\S]*?)>([\s\S]*?)<\/npc>/gi
  let nMatch
  while ((nMatch = npcRegex.exec(content)) !== null) {
    const attrs = parseAttrs(nMatch[1])
    const inner = nMatch[2]

    const dialogues = []
    const dialogueRegex = /<dialogue([\s\S]*?)>([\s\S]*?)<\/dialogue>/gi
    let dMatch
    while ((dMatch = dialogueRegex.exec(inner)) !== null) {
      const dAttrs = parseAttrs(dMatch[1])
      const dInner = dMatch[2]
      const textMatch = dInner.match(/<text>([\s\S]*?)<\/text>/i)

      const options = []
      const optionRegex = /<option([\s\S]*?)\/>/gi
      let oMatch
      while ((oMatch = optionRegex.exec(dInner)) !== null) {
        const oAttrs = parseAttrs(oMatch[1])
        options.push({
          text: oAttrs.text || '',
          strategy: oAttrs.strategy || 'gentle',
          trustChange: parseInt(oAttrs.trust || '0', 10),
        })
      }

      dialogues.push({
        round: parseInt(dAttrs.round || '1', 10),
        text: textMatch?.[1].trim() || '',
        options,
      })
    }

    const clues = []
    const clueRegex = /<clue([\s\S]*?)\/>/gi
    let cMatch
    while ((cMatch = clueRegex.exec(inner)) !== null) {
      const cAttrs = parseAttrs(cMatch[1])
      clues.push({
        name: cAttrs.name || '',
        text: cAttrs.text || '',
        condition: parseInt(cAttrs.trust || '0', 10),
      })
    }

    data.npcs.push({
      name: attrs.name || '',
      role: attrs.role || '',
      personality: attrs.personality || '',
      dialogues,
      clues,
    })
  }

  // Parse global clues (not inside NPC)
  const globalClueRegex = /<clue([\s\S]*?)\/>/gi
  let gcMatch
  while ((gcMatch = globalClueRegex.exec(content)) !== null) {
    const cAttrs = parseAttrs(gcMatch[1])
    if (cAttrs.name && !data.npcs.some(n => n.clues.some(nc => nc.name === cAttrs.name))) {
      data.clues.push({
        name: cAttrs.name || '',
        text: cAttrs.text || '',
        source: cAttrs.source || '',
      })
    }
  }

  // Parse conclusion - self-closing variant
  const conclusionMatch = content.match(/<conclusion([\s\S]*?)\/>/i)
  if (conclusionMatch) {
    const cAttrs = parseAttrs(conclusionMatch[1])
    data.conclusion = {
      answer: cAttrs.answer || '',
      hint: cAttrs.hint || '',
      options: [],
    }
  }

  // Parse conclusion - block variant with options
  if (!data.conclusion) {
    const conclusionBlockMatch = content.match(/<conclusion([\s\S]*?)>([\s\S]*?)<\/conclusion>/i)
    if (conclusionBlockMatch) {
      const cAttrs = parseAttrs(conclusionBlockMatch[1])
      const textMatch = conclusionBlockMatch[2].match(/<answer>([\s\S]*?)<\/answer>/i)
      const hintMatch = conclusionBlockMatch[2].match(/<hint>([\s\S]*?)<\/hint>/i)

      const options = []
      const optionRegex = /<option([\s\S]*?)\/>/gi
      let oMatch
      while ((oMatch = optionRegex.exec(conclusionBlockMatch[2])) !== null) {
        const oAttrs = parseAttrs(oMatch[1])
        if (oAttrs.text) options.push(oAttrs.text)
      }

      data.conclusion = {
        answer: cAttrs.answer || textMatch?.[1].trim() || '',
        hint: cAttrs.hint || hintMatch?.[1].trim() || '',
        options,
      }
    }
  }

  if (data.npcs.length === 0) return null
  return data
}
