/**
 * LLM 输入/输出日志工具
 * 将每次 LLM 调用的 prompt 和 response 写入文件，便于调试
 *
 * Android 原生环境：写入 Documents/debug/llm-debug.log
 * Web 环境：写入 localStorage（key: llm_debug_log）
 */

let _capacitorFs = null
let _capacitorDir = null
let _capacitorEnc = null

const loadCapacitor = async () => {
  if (_capacitorFs) return
  try {
    const fs = await import('@capacitor/filesystem')
    _capacitorFs = fs.Filesystem
    _capacitorDir = fs.Directory
    _capacitorEnc = fs.Encoding
  } catch {
    // Capacitor 不可用
  }
}

/**
 * 写入一条 LLM 日志
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

  await loadCapacitor()

  // Capacitor Filesystem（Android 原生环境）
  if (_capacitorFs) {
    try {
      await _capacitorFs.mkdir({
        path: 'debug',
        directory: _capacitorDir.Documents,
        recursive: true,
      })
    } catch {
      // 目录已存在或无法创建
    }
    try {
      await _capacitorFs.writeFile({
        path: 'debug/llm-debug.log',
        data: entry,
        directory: _capacitorDir.Documents,
        encoding: _capacitorEnc.UTF8,
      })
      return
    } catch {
      // 写入失败，回退到 localStorage
    }
  }

  // localStorage 回退（覆盖写入）
  try {
    localStorage.setItem('llm_debug_log', entry)
  } catch {
    // localStorage 不可用
  }
}
