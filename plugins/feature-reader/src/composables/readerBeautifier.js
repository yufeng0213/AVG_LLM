/**
 * readerBeautifier.js - Reader 文本美化引擎
 * 支持导入 JSON 配置，按规则对 HTML 进行后处理美化。
 */

// ===== 内置默认规则 =====

export const DEFAULT_RULES = [
  {
    type: 'dropCap',
    enabled: true,
    label: '首字下沉',
    description: '每段第一个字放大变色',
  },
  {
    type: 'quote',
    enabled: false,
    pattern: '[「「」『』"""""]',
    label: '引号文字美化',
    description: '引号内文字变色+斜体（默认关闭，" 会与 HTML 属性冲突）',
    class: 'reader-quote',
  },
  {
    type: 'replace',
    enabled: true,
    find: '[…]{2,}|(\\.\\s*){3,}',
    replace: '<span class="reader-ellipsis">…</span>',
    label: '省略号美化',
    description: '连续点号变成标准省略号',
  },
  {
    type: 'replace',
    enabled: true,
    find: '——{1,2}',
    replace: '<span class="reader-dash">—</span>',
    label: '破折号美化',
    description: '破折号统一字符',
  },
  {
    type: 'wrap',
    enabled: false,
    find: '([^<\\n]{1,4}[：:])(?!<\\/span>)',
    class: 'reader-speak',
    label: '对话人名称重',
    description: '人名+冒号加粗（如"林夏："）',
  },
]

export const DEFAULT_STYLES = `
.reader-quote {
  font-style: italic;
  color: var(--reader-accent-start, #667eea);
}
.reader-ellipsis {
  letter-spacing: 4px;
  opacity: 0.7;
}
.reader-dash {
  letter-spacing: 2px;
}
.reader-speak {
  color: var(--reader-strong, #ccc);
  font-weight: 600;
}
.reader-body .reader-dropcap {
  float: left;
  font-size: 2.8em;
  line-height: 0.8;
  padding-right: 6px;
  padding-top: 4px;
  color: var(--reader-accent-start, #667eea);
  font-weight: 700;
}
`

// ===== 引擎 =====

/**
 * 验证配置格式
 */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: '配置格式无效' }
  }
  if (!Array.isArray(config.rules)) {
    return { valid: false, error: '缺少 rules 数组' }
  }
  for (let i = 0; i < config.rules.length; i++) {
    const rule = config.rules[i]
    if (!rule.type) {
      return { valid: false, error: `规则 #${i + 1} 缺少 type 字段` }
    }
    if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
      return { valid: false, error: `规则 #${i + 1} enabled 必须是布尔值` }
    }
    // 类型检查
    if (rule.type === 'replace' && (!rule.find || !rule.replace)) {
      return { valid: false, error: `规则 #${i + 1} (replace) 必须有 find 和 replace` }
    }
    if (rule.type === 'wrap' && (!rule.find || !rule.class)) {
      return { valid: false, error: `规则 #${i + 1} (wrap) 必须有 find 和 class` }
    }
    if (rule.type === 'quote' && (!rule.class)) {
      return { valid: false, error: `规则 #${i + 1} (quote) 必须有 class` }
    }
  }
  return { valid: true }
}

/**
 * 加载配置，合并内置默认
 */
export function loadBeautifyConfig(userConfig) {
  if (!userConfig) return { rules: DEFAULT_RULES, styles: DEFAULT_STYLES }

  const userRules = Array.isArray(userConfig.rules) ? userConfig.rules : []
  const userStyles = typeof userConfig.styles === 'string' ? userConfig.styles : ''

  // 用户规则覆盖内置规则（同 type 优先用用户的）
  const merged = [...DEFAULT_RULES]
  for (const userRule of userRules) {
    const idx = merged.findIndex(r => r.type === userRule.type)
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], ...userRule }
    } else {
      merged.push(userRule)
    }
  }

  return {
    rules: merged,
    styles: DEFAULT_STYLES + '\n' + userStyles,
  }
}

/**
 * 应用美化规则到 HTML
 */
export function beautifyHtml(html, config) {
  if (!html || !config?.rules?.length) return html

  for (const rule of config.rules) {
    if (rule.enabled === false) continue

    switch (rule.type) {
      case 'dropCap':
        html = applyDropCap(html)
        break
      case 'quote':
        html = applyQuote(html, rule)
        break
      case 'replace':
        html = applyReplace(html, rule)
        break
      case 'wrap':
        html = applyWrap(html, rule)
        break
    }
  }

  return html
}

/**
 * 首字下沉：每个 <p> 的第一个字符
 */
function applyDropCap(html) {
  return html.replace(
    /<p([^>]*)>([^<])/g,
    '<p$1><span class="reader-dropcap">$2</span>'
  )
}

/**
 * 仅对 HTML 标签外的文本节点应用替换
 * @param {string} html
 * @param {(text: string) => string} fn
 */
function processTextNodesOnly(html, fn) {
  // 将 HTML 拆分为标签和文本片段，只对文本部分调用 fn
  const re = /(<[^>]+>)/g
  let result = ''
  let lastIndex = 0
  let match
  while ((match = re.exec(html)) !== null) {
    result += fn(html.slice(lastIndex, match.index))
    result += match[1]
    lastIndex = match.index + match[1].length
  }
  result += fn(html.slice(lastIndex))
  return result
}

/**
 * 引号内文字美化
 */
function applyQuote(html, rule) {
  const cls = rule.class || 'reader-quote'
  return processTextNodesOnly(html, (text) =>
    text.replace(
      /([「『])((?:[^'「」『』])*?)(['」』])/g,
      `$1<span class="${cls}">$2</span>$3`
    )
  )
}

/**
 * 正则替换（跳过 HTML 标签）
 */
function applyReplace(html, rule) {
  try {
    const flags = rule.flags || 'g'
    const re = new RegExp(rule.find, flags)
    return processTextNodesOnly(html, (text) => text.replace(re, rule.replace))
  } catch (e) {
    console.warn('[beautifier] 替换规则失败:', e.message, rule)
    return html
  }
}

/**
 * 正则包裹：匹配内容用 <span class="..."> 包起来（跳过 HTML 标签）
 */
function applyWrap(html, rule) {
  try {
    const flags = rule.flags || 'g'
    const re = new RegExp(rule.find, flags)
    const cls = rule.class || ''
    return processTextNodesOnly(html, (text) =>
      text.replace(re, `<span class="${cls}">$&</span>`)
    )
  } catch (e) {
    console.warn('[beautifier] 包裹规则失败:', e.message, rule)
    return html
  }
}

/**
 * 获取当前配置的 JSON 字符串（供导出）
 */
export function exportBeautifyConfig(config) {
  if (!config) return JSON.stringify({ rules: DEFAULT_RULES, styles: DEFAULT_STYLES }, null, 2)
  // 只导出用户自定义的规则（不在内置默认中的，或有差异的）
  const userRules = config.rules.filter(r => {
    const def = DEFAULT_RULES.find(d => d.type === r.type)
    return !def || JSON.stringify(r) !== JSON.stringify(def)
  })
  const userStyles = config.styles?.replace(DEFAULT_STYLES, '')?.trim()
  return JSON.stringify({
    rules: userRules.length > 0 ? userRules : DEFAULT_RULES,
    styles: userStyles || undefined,
  }, null, 2)
}

export default {
  DEFAULT_RULES,
  DEFAULT_STYLES,
  validateConfig,
  loadBeautifyConfig,
  beautifyHtml,
  exportBeautifyConfig,
}
