/**
 * LLM 输入/输出日志工具
 * 将每次 LLM 调用的 prompt 和 response 写入文件，便于调试
 *
 * Android 原生环境：写入公共 Documents/debug/llm-debug.log
 * Web 环境：写入 localStorage（key: llm_debug_log）
 */

import { writeDebugLog } from '../capacitor-plugins/StoragePermission.js'

/**
 * 写入一条 LLM 日志（覆盖写入）
 * @param {object} params
 * @param {string} params.label - 调用类型标识，如 "Story", "Phone SMS", "Schedule" 等
 * @param {string} params.systemPrompt - 系统提示词
 * @param {string} params.userPrompt - 用户提示词
 * @param {string} params.rawResponse - LLM 原始响应
 * @param {boolean} params.success - 调用是否成功
 * @param {string} [params.model] - 使用的模型名称
 * @param {number} [params.temperature] - 温度参数
 */
export const logLlmCall = async (params = {}) => {
  const {
    label = 'Unknown',
    systemPrompt = '',
    userPrompt = '',
    rawResponse = '',
    success = true,
    model = '',
    temperature,
  } = params

  const timestamp = new Date().toISOString()
  const separator = '='.repeat(60)

  const parts = [
    separator,
    `[${timestamp}] ${label} | ${success ? '成功' : '失败'}${model ? ` | Model: ${model}` : ''}${temperature != null ? ` | Temp: ${temperature}` : ''}`,
    separator,
    '',
    '--- SYSTEM PROMPT ---',
    systemPrompt || '(empty)',
    '',
    '--- USER PROMPT ---',
    userPrompt || '(empty)',
    '',
    '--- OUTPUT RESPONSE ---',
    typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse, null, 2),
    '',
  ]

  const entry = parts.join('\n')

  // 使用原生插件写入公共 Documents/debug 目录
  const result = await writeDebugLog(entry, 'llm-debug.log')

  if (result.success) {
    console.log(`[LLM Logger] 已写入日志文件: ${label} (${success ? '成功' : '失败'}) -> ${result.path}`)
  } else {
    console.warn('[LLM Logger] 写入失败:', result.error)

    // Fallback: 尝试 localStorage
    try {
      localStorage.setItem('llm_debug_log', entry)
      console.log(`[LLM Logger] Fallback 写入 localStorage: ${label}`)
    } catch (e) {
      console.warn('[LLM Logger] localStorage 写入失败:', e.message)
    }
  }
}