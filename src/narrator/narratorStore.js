import { isSQLiteAvailable, query, exec, transaction } from '../db/connection.js'

export const NARRATOR_ACTIVE_KEY = 'narrator_active_id'
export const DEFAULT_NARRATOR_ID = 'default_narrator'

const nowIso = () => new Date().toISOString()

// 默认条目模板
const createDefaultItems = () => [
  {
    id: 'item_style',
    name: '文风设定',
    content: '整体文风要沉浸、连贯、节奏稳定。对白与叙述平衡，避免堆砌华丽辞藻，优先保证剧情推进和角色动机清晰。',
    enabled: true,
    order: 0,
  },
  {
    id: 'item_instruction',
    name: '叙事规则',
    content: '在关键节点保留悬念并提供有意义的分支选项；不得破坏世界设定和角色既有性格；避免跳跃式叙事。',
    enabled: true,
    order: 1,
  },
]

export const createDefaultNarratorProfile = () => ({
  id: DEFAULT_NARRATOR_ID,
  name: '标准叙事者',
  summary: '平衡叙事风格，强调可读性、情绪推进与分支清晰度。',
  items: createDefaultItems(),
  enabled: true,
  isDefault: true,
  createdAt: nowIso(),
  updatedAt: nowIso(),
})

export const normalizeNarratorProfile = (rawProfile, index = 0) => {
  const fallback = createDefaultNarratorProfile()
  const isDefault = Boolean(rawProfile?.isDefault) || rawProfile?.id === DEFAULT_NARRATOR_ID
  const id = isDefault
    ? DEFAULT_NARRATOR_ID
    : String(rawProfile?.id || `narrator_${Date.now()}_${index}`)

  const name = String(rawProfile?.name || rawProfile?.title || '').trim()
  const summary = String(rawProfile?.summary || rawProfile?.description || '').trim()

  // 兼容旧数据：将stylePrompt和instructionPrompt转换为items
  let items = rawProfile?.items || []
  if (items.length === 0) {
    const stylePrompt = String(rawProfile?.stylePrompt || rawProfile?.prompt || rawProfile?.style || '').trim()
    const instructionPrompt = String(
      rawProfile?.instructionPrompt || rawProfile?.systemPrompt || rawProfile?.instructions || '',
    ).trim()

    if (stylePrompt) {
      items.push({
        id: 'item_style_legacy',
        name: '文风设定',
        content: stylePrompt,
        enabled: true,
        order: 0,
      })
    }
    if (instructionPrompt) {
      items.push({
        id: 'item_instruction_legacy',
        name: '叙事规则',
        content: instructionPrompt,
        enabled: true,
        order: 1,
      })
    }

    // 如果旧数据也没有prompt，使用默认条目
    if (items.length === 0 && isDefault) {
      items = createDefaultItems()
    }
  }

  // 确保每个item有完整结构
  items = items.map((item, i) => ({
    id: String(item.id || `item_${Date.now()}_${i}`),
    name: String(item.name || `条目 ${i + 1}`).trim(),
    content: String(item.content || '').trim(),
    enabled: item.enabled !== false,
    order: Number(item.order || i),
  }))

  return {
    id,
    name: name || (isDefault ? fallback.name : `叙事者 ${index + 1}`),
    summary: summary || (isDefault ? fallback.summary : ''),
    items,
    enabled: isDefault ? true : rawProfile?.enabled !== false,
    isDefault,
    createdAt: String(rawProfile?.createdAt || nowIso()),
    updatedAt: String(rawProfile?.updatedAt || nowIso()),
  }
}

const sortNarratorProfiles = (profiles) => {
  return [...profiles].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return String(a.createdAt).localeCompare(String(b.createdAt))
  })
}

const ensureDefaultNarratorProfile = (profiles) => {
  const hasDefault = profiles.some((profile) => profile.id === DEFAULT_NARRATOR_ID || profile.isDefault)
  if (hasDefault) {
    return profiles.map((profile) =>
      profile.id === DEFAULT_NARRATOR_ID || profile.isDefault
        ? { ...profile, id: DEFAULT_NARRATOR_ID, isDefault: true, enabled: true, name: '标准叙事者' }
        : profile,
    )
  }
  return [createDefaultNarratorProfile(), ...profiles]
}

/**
 * 加载叙事者配置列表
 * 直接从 narrator_profiles 表读取，不回退到 kvStorage（避免被 App.vue 清除）
 */
export const loadNarratorProfiles = async () => {
  if (typeof window === 'undefined') {
    return [createDefaultNarratorProfile()]
  }

  try {
    if (!isSQLiteAvailable()) {
      console.warn('[NarratorStore] SQLite not available, returning default narrator')
      return [createDefaultNarratorProfile()]
    }

    const rows = await query('SELECT profile_data FROM narrator_profiles ORDER BY is_default DESC, created_at')
    const parsed = rows.map(r => JSON.parse(r.profile_data))
    const normalized = Array.isArray(parsed)
      ? parsed.map((profile, index) => normalizeNarratorProfile(profile, index))
      : []
    return sortNarratorProfiles(ensureDefaultNarratorProfile(normalized))
  } catch (e) {
    console.error('[NarratorStore] Failed to load profiles:', e.message)
    return [createDefaultNarratorProfile()]
  }
}

/**
 * 持久化叙事者配置列表
 * 使用事务保证原子性：要么全部成功，要么全部失败（原有数据保留）
 */
export const persistNarratorProfiles = async (profiles) => {
  if (typeof window === 'undefined') return
  if (!isSQLiteAvailable()) {
    console.warn('[NarratorStore] SQLite not available, cannot persist narrator profiles')
    return
  }

  try {
    // 使用事务包装所有操作，保证原子性
    await transaction((statements) => {
      // 先删除所有记录
      statements.push({ statement: 'DELETE FROM narrator_profiles', values: [] })
      // 再逐条插入
      for (const profile of profiles) {
        statements.push({
          statement: `INSERT INTO narrator_profiles (id, profile_data, is_default, enabled, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?)`,
          values: [profile.id, JSON.stringify(profile), profile.isDefault ? 1 : 0,
                   profile.enabled ? 1 : 0, profile.createdAt, profile.updatedAt]
        })
      }
    })
    console.log('[NarratorStore] Persisted', profiles.length, 'narrator profiles to SQLite')
  } catch (e) {
    console.error('[NarratorStore] Failed to persist profiles:', e.message)
    throw e // 抛出错误让调用者知道保存失败
  }
}

export const createNewNarratorProfile = (profiles = []) => {
  const index = profiles.filter((profile) => !profile.isDefault).length + 1
  return normalizeNarratorProfile({
    id: `narrator_${Date.now()}`,
    name: `叙事者 ${index}`,
    summary: '请填写该叙事者的风格定位。',
    items: [],
    enabled: true,
    isDefault: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })
}

export const deleteNarratorProfile = (profiles, profileId) => {
  const target = profiles.find((profile) => profile.id === profileId)
  if (!target || target.isDefault || profileId === DEFAULT_NARRATOR_ID) {
    return { success: false, message: '默认叙事者不可删除', profiles }
  }

  const filtered = profiles.filter((profile) => profile.id !== profileId)
  return {
    success: true,
    message: `已删除：${target.name}`,
    profiles: sortNarratorProfiles(filtered),
  }
}

export const exportNarratorProfile = (profile) => {
  const exportData = {
    version: '1.0',
    exportedAt: nowIso(),
    narratorProfile: {
      ...profile,
      _exportedId: profile.id,
    },
  }
  return JSON.stringify(exportData, null, 2)
}

export const importNarratorProfile = (jsonString, existingProfiles = []) => {
  try {
    const data = JSON.parse(jsonString)
    const rawProfile = data.narratorProfile || data.narrator || data

    if (!rawProfile || typeof rawProfile !== 'object') {
      return { success: false, message: '无效的叙事者 JSON 格式', profile: null }
    }

    const newId = `narrator_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const normalized = normalizeNarratorProfile(
      {
        ...rawProfile,
        id: newId,
        isDefault: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      existingProfiles.length,
    )

    return {
      success: true,
      message: `已导入叙事者：${normalized.name}`,
      profile: normalized,
    }
  } catch (error) {
    return { success: false, message: `导入失败：${error.message}`, profile: null }
  }
}

export const importNarratorProfiles = (jsonString, existingProfiles = []) => {
  try {
    const data = JSON.parse(jsonString)

    if (Array.isArray(data)) {
      const results = []
      for (const item of data) {
        const result = importNarratorProfile(JSON.stringify(item), existingProfiles)
        if (result.success && result.profile) {
          results.push(result.profile)
        }
      }
      return {
        success: true,
        message: `成功导入 ${results.length} 个叙事者`,
        profiles: results,
      }
    }

    if (Array.isArray(data.narratorProfiles)) {
      const results = []
      for (const item of data.narratorProfiles) {
        const result = importNarratorProfile(JSON.stringify(item), existingProfiles)
        if (result.success && result.profile) {
          results.push(result.profile)
        }
      }
      return {
        success: true,
        message: `成功导入 ${results.length} 个叙事者`,
        profiles: results,
      }
    }

    const result = importNarratorProfile(jsonString, existingProfiles)
    return {
      success: result.success,
      message: result.message,
      profiles: result.profile ? [result.profile] : [],
    }
  } catch (error) {
    return { success: false, message: `导入失败：${error.message}`, profiles: [] }
  }
}

export const getEnabledNarratorProfiles = (profiles = []) => {
  return profiles.filter((profile) => profile.enabled || profile.isDefault)
}

export const resolveNarratorProfile = (profiles = [], preferredId = '') => {
  const normalized = sortNarratorProfiles(ensureDefaultNarratorProfile(profiles))
  const available = getEnabledNarratorProfiles(normalized)

  if (preferredId) {
    const matched = available.find((profile) => profile.id === preferredId)
    if (matched) return matched
  }

  return available.find((profile) => profile.isDefault) || available[0] || createDefaultNarratorProfile()
}

// ===== 条目管理函数 =====

/**
 * 创建新条目
 */
export const createNarratorItem = (items = []) => {
  const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.order || 0)) + 1 : 0
  return {
    id: `item_${Date.now()}`,
    name: '新条目',
    content: '',
    enabled: true,
    order: nextOrder,
  }
}

/**
 * 添加条目到叙事者
 */
export const addNarratorItem = (profile, item) => {
  const newItem = item || createNarratorItem(profile.items || [])
  const updatedItems = [...(profile.items || []), newItem]
  return {
    ...profile,
    items: updatedItems,
    updatedAt: nowIso(),
  }
}

/**
 * 删除条目
 */
export const deleteNarratorItem = (profile, itemId) => {
  const updatedItems = (profile.items || []).filter((item) => item.id !== itemId)
  return {
    ...profile,
    items: updatedItems,
    updatedAt: nowIso(),
  }
}

/**
 * 更新条目
 */
export const updateNarratorItem = (profile, itemId, updates) => {
  const updatedItems = (profile.items || []).map((item) =>
    item.id === itemId ? { ...item, ...updates } : item,
  )
  return {
    ...profile,
    items: updatedItems,
    updatedAt: nowIso(),
  }
}

/**
 * 移动条目顺序
 */
export const moveNarratorItem = (profile, itemId, direction) => {
  const items = [...(profile.items || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
  const index = items.findIndex((item) => item.id === itemId)
  if (index === -1) return profile

  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= items.length) return profile

  // 交换order
  const swapped = [...items]
  swapped[index] = { ...swapped[index], order: items[newIndex].order }
  swapped[newIndex] = { ...swapped[newIndex], order: items[index].order }

  return {
    ...profile,
    items: swapped,
    updatedAt: nowIso(),
  }
}

/**
 * 合并启用的条目内容生成prompt
 */
export const buildNarratorPromptFromItems = (profile) => {
  if (!profile?.items || profile.items.length === 0) {
    // 兼容旧数据：返回空字符串或使用旧的prompt字段
    return ''
  }

  const enabledItems = profile.items
    .filter((item) => item.enabled)
    .sort((a, b) => (a.order || 0) - (b.order || 0))

  if (enabledItems.length === 0) return ''

  const combinedContent = enabledItems
    .map((item) => `【${item.name}】\n${item.content}`)
    .join('\n\n')

  return combinedContent
}

/**
 * 获取叙事者的完整prompt（用于LLM加载）
 */
export const getNarratorFullPrompt = (profile) => {
  const itemsPrompt = buildNarratorPromptFromItems(profile)
  const summaryPart = profile?.summary ? `【叙事风格简介】\n${profile.summary}` : ''

  if (itemsPrompt && summaryPart) {
    return `${summaryPart}\n\n${itemsPrompt}`
  }
  return itemsPrompt || summaryPart || ''
}

/**
 * 获取当前激活的叙事者ID
 * 直接从 app_config 表读取，不回退到 kvStorage（避免被 App.vue 清除）
 */
export const getActiveNarratorId = async () => {
  try {
    if (!isSQLiteAvailable()) {
      console.warn('[NarratorStore] SQLite not available, cannot get active narrator')
      return ''
    }
    const rows = await query('SELECT value FROM app_config WHERE key = ?', [NARRATOR_ACTIVE_KEY])
    console.log('[NarratorStore] getActiveNarratorId from SQLite:', rows[0]?.value || '(empty)')
    return rows[0]?.value || ''
  } catch (e) {
    console.error('[NarratorStore] getActiveNarratorId failed:', e)
    return ''
  }
}

/**
 * 设置当前激活的叙事者ID
 * 直接写入 app_config 表，不回退到 kvStorage（避免被 App.vue 清除）
 */
export const setActiveNarratorId = async (id) => {
  try {
    if (!isSQLiteAvailable()) {
      console.warn('[NarratorStore] SQLite not available, cannot set active narrator')
      return
    }
    await exec(
      'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)',
      [NARRATOR_ACTIVE_KEY, id || '']
    )
    console.log('[NarratorStore] setActiveNarratorId wrote to SQLite:', id || '(empty)')
  } catch (e) {
    console.error('[NarratorStore] setActiveNarratorId failed:', e)
  }
}

