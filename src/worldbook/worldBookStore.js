import { getEmotionLabel } from './emotionPresets'

export const WORLD_BOOK_STORAGE_KEY = 'avg_llm_world_books'
export const ACTIVE_WORLD_BOOK_KEY = 'avg_llm_active_world_book'

export const WORLD_BOOK_ENTRY_DEFS = [
  { key: 'overview', label: '世界概述', hint: '一句话说明这个世界最核心的设定。' },
  { key: 'era', label: '时代背景', hint: '故事发生的时代、科技水平与历史阶段。' },
  { key: 'regions', label: '地理与区域', hint: '大陆/城市/禁区/交通方式等信息。' },
  { key: 'forces', label: '主要势力', hint: '政体、组织、家族、阵营及其关系。' },
  { key: 'rules', label: '世界规则', hint: '魔法/科技/能力运行规则与限制。' },
  { key: 'culture', label: '社会文化', hint: '价值观、宗教、风俗、语言、礼仪。' },
  { key: 'conflict', label: '核心冲突', hint: '推动剧情的根本矛盾与风险。' },
  { key: 'secrets', label: '秘密与禁忌', hint: '禁区、真相、伏笔、不可公开设定。' },
  { key: 'storyHook', label: '开局前提', hint: '主角进入故事时已知/未知的状态。' },
]

export const createEmptyEntries = () => {
  const entries = {}
  for (const item of WORLD_BOOK_ENTRY_DEFS) {
    entries[item.key] = ''
  }
  return entries
}

// 创建空立绘数组
export const createEmptyPortraits = () => []

// 创建新立绘配置
export const createNewPortrait = (filePath, fileName, emotion = 'default') => ({
  id: `portrait_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  label: getEmotionLabel(emotion),
  emotion: emotion,
  filePath,
  fileName,
  addedAt: new Date().toISOString(),
})

export const createEmptyUserProfile = () => ({
  name: '',
  nickname: '',
  appearance: '',
  identity: '',
  background: '',
  portraits: [],  // 新增：立绘列表
})

export const createCharacterSkeleton = (index = 1) => ({
  id: `char_${Date.now()}_${index}`,
  name: `角色 ${index}`,
  nickname: '',
  appearance: '',
  identity: '',
  background: '',
  notes: '',
  portraits: [],  // 新增：立绘列表
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

// 规范化单个立绘数据
const normalizePortrait = (rawPortrait) => {
  return {
    id: String(rawPortrait?.id || `portrait_${Date.now()}`),
    label: String(rawPortrait?.label || '默认'),
    emotion: String(rawPortrait?.emotion || 'default'),
    filePath: String(rawPortrait?.filePath || ''),
    fileName: String(rawPortrait?.fileName || ''),
    addedAt: String(rawPortrait?.addedAt || new Date().toISOString()),
  }
}

// 规范化立绘数组
const normalizePortraits = (rawPortraits) => {
  if (!Array.isArray(rawPortraits)) {
    return []
  }
  return rawPortraits.map(normalizePortrait).filter((p) => p.filePath)
}

const normalizeUserProfile = (rawProfile) => {
  const fallback = createEmptyUserProfile()
  const nextProfile = { ...fallback }
  for (const key of Object.keys(fallback)) {
    if (key === 'portraits') {
      nextProfile[key] = normalizePortraits(rawProfile?.portraits)
    } else if (typeof rawProfile?.[key] === 'string') {
      nextProfile[key] = rawProfile[key]
    }
  }
  return nextProfile
}

const normalizeCharacter = (rawCharacter, index = 0) => {
  const fallback = createCharacterSkeleton(index + 1)
  return {
    id: String(rawCharacter?.id || fallback.id),
    name: String(rawCharacter?.name || fallback.name),
    nickname: String(rawCharacter?.nickname || ''),
    appearance: String(rawCharacter?.appearance || ''),
    identity: String(rawCharacter?.identity || ''),
    background: String(rawCharacter?.background || ''),
    notes: String(rawCharacter?.notes || ''),
    portraits: normalizePortraits(rawCharacter?.portraits),
    createdAt: String(rawCharacter?.createdAt || fallback.createdAt),
    updatedAt: String(rawCharacter?.updatedAt || fallback.updatedAt),
  }
}

const normalizeCharacters = (rawCharacters) => {
  if (!Array.isArray(rawCharacters)) {
    return [createCharacterSkeleton(1)]
  }

  const parsed = rawCharacters.map((char, index) => normalizeCharacter(char, index))
  return parsed.length > 0 ? parsed : [createCharacterSkeleton(1)]
}

export const createDefaultWorldBook = () => ({
  id: 'default_world_book',
  title: '默认世界书',
  summary: '主线剧情默认背景设定。',
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  entries: createEmptyEntries(),
  userProfile: createEmptyUserProfile(),
  characters: [createCharacterSkeleton(1)],
})

export const normalizeWorldBook = (rawBook, index = 0) => {
  const fallback = createDefaultWorldBook()
  const nextEntries = createEmptyEntries()

  for (const item of WORLD_BOOK_ENTRY_DEFS) {
    if (typeof rawBook?.entries?.[item.key] === 'string') {
      nextEntries[item.key] = rawBook.entries[item.key]
    }
  }

  const isDefault = Boolean(rawBook?.isDefault) || rawBook?.id === fallback.id
  const id = isDefault ? fallback.id : String(rawBook?.id || `world_book_${Date.now()}_${index}`)

  return {
    id,
    title: String(rawBook?.title || (isDefault ? fallback.title : `世界书 ${index + 1}`)),
    summary: String(rawBook?.summary || ''),
    isDefault,
    createdAt: String(rawBook?.createdAt || new Date().toISOString()),
    updatedAt: String(rawBook?.updatedAt || new Date().toISOString()),
    entries: nextEntries,
    userProfile: normalizeUserProfile(rawBook?.userProfile),
    characters: normalizeCharacters(rawBook?.characters),
  }
}

const sortWorldBooks = (books) => {
  return [...books].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return String(a.createdAt).localeCompare(String(b.createdAt))
  })
}

const ensureDefaultWorldBook = (books) => {
  const hasDefault = books.some((book) => book.id === 'default_world_book' || book.isDefault)
  if (hasDefault) {
    return books.map((book) =>
      book.id === 'default_world_book'
        ? { ...book, isDefault: true, title: '默认世界书' }
        : book,
    )
  }

  return [createDefaultWorldBook(), ...books]
}

export const loadWorldBooks = () => {
  if (typeof window === 'undefined') {
    return [createDefaultWorldBook()]
  }

  try {
    const raw = window.localStorage.getItem(WORLD_BOOK_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const normalized = Array.isArray(parsed)
      ? parsed.map((book, index) => normalizeWorldBook(book, index))
      : []

    return sortWorldBooks(ensureDefaultWorldBook(normalized))
  } catch {
    return [createDefaultWorldBook()]
  }
}

export const persistWorldBooks = (books) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(WORLD_BOOK_STORAGE_KEY, JSON.stringify(books))
}

export const getActiveWorldBookId = () => {
  if (typeof window === 'undefined') return 'default_world_book'
  return window.localStorage.getItem(ACTIVE_WORLD_BOOK_KEY) || 'default_world_book'
}

export const setActiveWorldBookId = (bookId) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACTIVE_WORLD_BOOK_KEY, String(bookId || 'default_world_book'))
}

export const createNewWorldBook = (books = []) => {
  const index = books.filter((book) => !book.isDefault).length + 1
  return normalizeWorldBook({
    id: `world_book_${Date.now()}`,
    title: `世界书 ${index}`,
    summary: '用于扩展支线或平行世界背景。',
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries: createEmptyEntries(),
    userProfile: createEmptyUserProfile(),
    characters: [createCharacterSkeleton(1)],
  })
}

export const createNewCharacter = (characters = []) => {
  const nextIndex = (Array.isArray(characters) ? characters.length : 0) + 1
  return createCharacterSkeleton(nextIndex)
}
