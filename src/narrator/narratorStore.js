import { kvStorage } from '../storage/index.js'

export const NARRATOR_STORAGE_KEY = 'narrator_profiles'
export const DEFAULT_NARRATOR_ID = 'default_narrator'

const nowIso = () => new Date().toISOString()

export const createDefaultNarratorProfile = () => ({
  id: DEFAULT_NARRATOR_ID,
  name: '标准叙事者',
  summary: '平衡叙事风格，强调可读性、情绪推进与分支清晰度。',
  stylePrompt:
    '整体文风要沉浸、连贯、节奏稳定。对白与叙述平衡，避免堆砌华丽辞藻，优先保证剧情推进和角色动机清晰。',
  instructionPrompt:
    '在关键节点保留悬念并提供有意义的分支选项；不得破坏世界设定和角色既有性格；避免跳跃式叙事。',
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
  const stylePrompt = String(rawProfile?.stylePrompt || rawProfile?.prompt || rawProfile?.style || '').trim()
  const instructionPrompt = String(
    rawProfile?.instructionPrompt || rawProfile?.systemPrompt || rawProfile?.instructions || '',
  ).trim()

  return {
    id,
    name: name || (isDefault ? fallback.name : `叙事者 ${index + 1}`),
    summary: summary || (isDefault ? fallback.summary : ''),
    stylePrompt: stylePrompt || (isDefault ? fallback.stylePrompt : ''),
    instructionPrompt: instructionPrompt || (isDefault ? fallback.instructionPrompt : ''),
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

export const loadNarratorProfiles = async () => {
  if (typeof window === 'undefined') {
    return [createDefaultNarratorProfile()]
  }

  try {
    const parsed = await kvStorage.get(NARRATOR_STORAGE_KEY)
    const normalized = Array.isArray(parsed)
      ? parsed.map((profile, index) => normalizeNarratorProfile(profile, index))
      : []
    return sortNarratorProfiles(ensureDefaultNarratorProfile(normalized))
  } catch {
    return [createDefaultNarratorProfile()]
  }
}

export const persistNarratorProfiles = async (profiles) => {
  if (typeof window === 'undefined') return
  await kvStorage.set(NARRATOR_STORAGE_KEY, profiles)
}

export const createNewNarratorProfile = (profiles = []) => {
  const index = profiles.filter((profile) => !profile.isDefault).length + 1
  return normalizeNarratorProfile({
    id: `narrator_${Date.now()}`,
    name: `叙事者 ${index}`,
    summary: '请填写该叙事者的风格定位。',
    stylePrompt: '',
    instructionPrompt: '',
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

