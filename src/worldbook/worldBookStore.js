import { getEmotionLabel } from './emotionPresets'
import { kvStorage } from '../storage/index.js'
import { DEFAULT_NARRATOR_ID } from '../narrator/narratorStore'

export const WORLD_BOOK_STORAGE_KEY = 'world_books'
export const ACTIVE_WORLD_BOOK_KEY = 'active_world_book'

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

export const WORLD_BOOK_PORTRAIT_STYLE_OPTIONS = [
  { value: 'card', label: '卡片式立绘（底部贴对话框顶部 -10px）' },
  { value: 'half_body', label: '半身立绘（底部贴对话框顶部 -10px）' },
  { value: 'full_body', label: '全身立绘（底部贴屏幕底部）' },
  { value: 'leg_body', label: '腿部立绘（底部贴屏幕底部）' },
]

const WORLD_BOOK_PORTRAIT_STYLE_VALUES = WORLD_BOOK_PORTRAIT_STYLE_OPTIONS.map((item) => item.value)

export const createEmptyEntries = () => {
  const entries = {}
  for (const item of WORLD_BOOK_ENTRY_DEFS) {
    entries[item.key] = ''
  }
  return entries
}

// 创建空立绘数组
export const createEmptyPortraits = () => []

// 创建空场景数组
export const createEmptyScenes = () => []
export const createEmptyBackgroundAssets = () => []

export const createDefaultDisplaySettings = () => ({
  portraitStyle: 'card',
})

// 创建新场景配置
export const createNewScene = (index = 1) => ({
  id: `scene_${Date.now()}_${index}`,
  name: `场景 ${index}`,
  background: '',
  description: '',
  createdAt: new Date().toISOString(),
})

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

const normalizePortraitStyle = (rawStyle) => {
  const nextStyle = String(rawStyle || '').trim()
  if (WORLD_BOOK_PORTRAIT_STYLE_VALUES.includes(nextStyle)) {
    return nextStyle
  }
  return 'card'
}

const normalizeDisplaySettings = (rawSettings) => {
  const fallback = createDefaultDisplaySettings()
  return {
    portraitStyle: normalizePortraitStyle(rawSettings?.portraitStyle || fallback.portraitStyle),
  }
}

const normalizeBackgroundAsset = (rawAsset, index = 0) => {
  const idFallback = `bg_${index + 1}`
  const nameFallback = `背景 ${index + 1}`
  return {
    id: String(rawAsset?.id || idFallback),
    name: String(rawAsset?.name || nameFallback),
    path: String(rawAsset?.path || ''),
    label: String(rawAsset?.label || rawAsset?.name || nameFallback),
  }
}

const normalizeBackgroundAssets = (rawAssets) => {
  if (!Array.isArray(rawAssets)) {
    return []
  }

  return rawAssets
    .map((asset, index) => normalizeBackgroundAsset(asset, index))
    .filter((asset) => asset.path)
}

// 规范化单个场景数据
const normalizeScene = (rawScene, index = 0) => {
  return {
    id: String(rawScene?.id || `scene_${Date.now()}_${index}`),
    name: String(rawScene?.name || `场景 ${index + 1}`),
    background: String(rawScene?.background || ''),
    description: String(rawScene?.description || ''),
    createdAt: String(rawScene?.createdAt || new Date().toISOString()),
  }
}

// 规范化场景数组
const normalizeScenes = (rawScenes) => {
  if (!Array.isArray(rawScenes)) {
    return []
  }
  return rawScenes.map((scene, index) => normalizeScene(scene, index)).filter((s) => s.name || s.background)
}

export const createDefaultWorldBook = () => ({
  id: 'default_world_book',
  title: '默认世界书',
  summary: '主线剧情默认背景设定。',
  isDefault: true,
  defaultNarratorId: DEFAULT_NARRATOR_ID,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  entries: createEmptyEntries(),
  userProfile: createEmptyUserProfile(),
  characters: [createCharacterSkeleton(1)],
  scenes: [],  // 新增：场景列表
  backgroundAssets: createEmptyBackgroundAssets(),
  displaySettings: createDefaultDisplaySettings(),
  openingDialogue: [
    { speaker: '旁白', text: '雨夜的图书馆只剩你与断续的电流声，窗外的霓虹正把地面切成碎片。', emotion: null },
    { speaker: '伊芙', text: '终于等到你了，档案室的门只会在今晚开启，过了零点就会再次封存。', emotion: 'happy' },
    { speaker: '你', text: '我来找失踪案的原始记录，线索应该在禁区最深处的那排手稿里。', emotion: 'neutral' },
    { speaker: '零号', text: '再往前一步，你会看到不该被公开的名字，也会看到你自己的过去。', emotion: 'worried' },
    { speaker: '旁白', text: '你握紧终端，屏幕上的微光把三道身影叠在一起，像命运重写前的倒计时。', emotion: null },
  ],
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

  // 规范化开场对话
  const normalizeOpeningDialogue = (rawDialogue) => {
    if (!Array.isArray(rawDialogue) || rawDialogue.length === 0) {
      return fallback.openingDialogue
    }
    return rawDialogue.map(line => ({
      speaker: String(line?.speaker || '旁白'),
      text: String(line?.text || ''),
      emotion: line?.emotion || null,
    })).filter(line => line.text)
  }

  return {
    id,
    title: String(rawBook?.title || (isDefault ? fallback.title : `世界书 ${index + 1}`)),
    summary: String(rawBook?.summary || ''),
    isDefault,
    defaultNarratorId: String(rawBook?.defaultNarratorId || fallback.defaultNarratorId || DEFAULT_NARRATOR_ID),
    createdAt: String(rawBook?.createdAt || new Date().toISOString()),
    updatedAt: String(rawBook?.updatedAt || new Date().toISOString()),
    entries: nextEntries,
    userProfile: normalizeUserProfile(rawBook?.userProfile),
    characters: normalizeCharacters(rawBook?.characters),
    scenes: normalizeScenes(rawBook?.scenes),
    backgroundAssets: normalizeBackgroundAssets(rawBook?.backgroundAssets),
    displaySettings: normalizeDisplaySettings(rawBook?.displaySettings),
    openingDialogue: normalizeOpeningDialogue(rawBook?.openingDialogue),
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

export const loadWorldBooks = async () => {
  if (typeof window === 'undefined') {
    return [createDefaultWorldBook()]
  }

  try {
    const parsed = await kvStorage.get(WORLD_BOOK_STORAGE_KEY)
    const normalized = Array.isArray(parsed)
      ? parsed.map((book, index) => normalizeWorldBook(book, index))
      : []

    return sortWorldBooks(ensureDefaultWorldBook(normalized))
  } catch {
    return [createDefaultWorldBook()]
  }
}

export const persistWorldBooks = async (books) => {
  if (typeof window === 'undefined') return
  await kvStorage.set(WORLD_BOOK_STORAGE_KEY, books)
}

export const getActiveWorldBookId = async () => {
  if (typeof window === 'undefined') return 'default_world_book'
  return (await kvStorage.get(ACTIVE_WORLD_BOOK_KEY)) || 'default_world_book'
}

export const setActiveWorldBookId = async (bookId) => {
  if (typeof window === 'undefined') return
  await kvStorage.set(ACTIVE_WORLD_BOOK_KEY, bookId || 'default_world_book')
}

export const createNewWorldBook = (books = []) => {
  const index = books.filter((book) => !book.isDefault).length + 1
  return normalizeWorldBook({
    id: `world_book_${Date.now()}`,
    title: `世界书 ${index}`,
    summary: '用于扩展支线或平行世界背景。',
    isDefault: false,
    defaultNarratorId: DEFAULT_NARRATOR_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries: createEmptyEntries(),
    userProfile: createEmptyUserProfile(),
    characters: [createCharacterSkeleton(1)],
    backgroundAssets: createEmptyBackgroundAssets(),
    displaySettings: createDefaultDisplaySettings(),
  })
}

export const createNewCharacter = (characters = []) => {
  const nextIndex = (Array.isArray(characters) ? characters.length : 0) + 1
  return createCharacterSkeleton(nextIndex)
}

// 创建新场景（用于世界书编辑器）
export const addNewScene = (scenes = []) => {
  const nextIndex = (Array.isArray(scenes) ? scenes.length : 0) + 1
  return createNewScene(nextIndex)
}

// 删除世界书（不能删除默认世界书）
export const deleteWorldBook = (books, bookId) => {
  const bookToDelete = books.find((book) => book.id === bookId)
  
  // 不能删除默认世界书
  if (!bookToDelete || bookToDelete.isDefault || bookId === 'default_world_book') {
    return { success: false, message: '无法删除默认世界书', books }
  }
  
  const filteredBooks = books.filter((book) => book.id !== bookId)
  const sortedBooks = sortWorldBooks(filteredBooks)
  
  return { success: true, message: `已删除：${bookToDelete.title}`, books: sortedBooks }
}

// 导出世界书为JSON
export const exportWorldBook = (book) => {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    worldBook: {
      ...book,
      // 移除内部ID相关字段，导入时会生成新ID
      _exportedId: book.id,
    }
  }
  return JSON.stringify(exportData, null, 2)
}

// 导入世界书
export const importWorldBook = (jsonString, existingBooks = []) => {
  try {
    const data = JSON.parse(jsonString)
    
    // 验证数据结构
    if (!data.worldBook && !data.title) {
      return { success: false, message: '无效的世界书格式', book: null }
    }
    
    // 支持两种格式：带包装的和不带包装的
    const rawBook = data.worldBook || data
    
    // 生成新ID，避免冲突
    const newId = `world_book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    
    // 规范化并创建新世界书
    const normalizedBook = normalizeWorldBook({
      ...rawBook,
      id: newId,
      isDefault: false, // 导入的世界书不可能是默认的
      title: rawBook.title || `导入的世界书 ${existingBooks.length}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    
    return { success: true, message: `已导入：${normalizedBook.title}`, book: normalizedBook }
  } catch (error) {
    return { success: false, message: `导入失败：${error.message}`, book: null }
  }
}

// 批量导入世界书
export const importWorldBooks = (jsonString, existingBooks = []) => {
  try {
    const data = JSON.parse(jsonString)
    
    // 支持数组格式
    if (Array.isArray(data)) {
      const results = []
      for (const item of data) {
        const result = importWorldBook(JSON.stringify(item), existingBooks)
        if (result.success && result.book) {
          results.push(result.book)
        }
      }
      return {
        success: true,
        message: `成功导入 ${results.length} 本世界书`,
        books: results
      }
    }
    
    // 支持带 worldBooks 字段的格式
    if (data.worldBooks && Array.isArray(data.worldBooks)) {
      const results = []
      for (const item of data.worldBooks) {
        const result = importWorldBook(JSON.stringify(item), existingBooks)
        if (result.success && result.book) {
          results.push(result.book)
        }
      }
      return {
        success: true,
        message: `成功导入 ${results.length} 本世界书`,
        books: results
      }
    }
    
    // 单本世界书
    const result = importWorldBook(jsonString, existingBooks)
    return {
      success: result.success,
      message: result.message,
      books: result.book ? [result.book] : []
    }
  } catch (error) {
    return { success: false, message: `导入失败：${error.message}`, books: [] }
  }
}
