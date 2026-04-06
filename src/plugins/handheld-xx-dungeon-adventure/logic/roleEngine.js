export const ROLE_FALLBACK_LIST = ['守护者', '侦察员', '施法者', '炼金师', '机关师', '驯兽师']

export const normalizeRoleText = (value, maxLen = 24) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLen)

export const resolveClassicRole = (rawValue, index = 0, hintText = '') => {
  const raw = normalizeRoleText(rawValue, 24)
  if (raw) return raw
  const text = `${raw} ${normalizeRoleText(hintText, 120)}`.toLowerCase()
  if (text.includes('治疗') || text.includes('医') || text.includes('祈祷')) return '治疗师'
  if (text.includes('刺') || text.includes('潜行') || text.includes('暗杀') || text.includes('盗')) return '潜行者'
  if (text.includes('守护') || text.includes('盾') || text.includes('护卫')) return '守护者'
  if (text.includes('法术') || text.includes('魔法') || text.includes('咒')) return '施法者'
  if (text.includes('弓') || text.includes('猎') || text.includes('游侠') || text.includes('侦查')) return '游猎者'
  if (text.includes('炼金') || text.includes('药')) return '炼金师'
  if (text.includes('机') || text.includes('工程')) return '机巧师'
  return ROLE_FALLBACK_LIST[index % ROLE_FALLBACK_LIST.length]
}

