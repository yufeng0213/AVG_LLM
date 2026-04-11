/**
 * LLM 服务模块（Backpack / Handheld / WorldBook）
 */

import { getValidatedActiveConfig, callChatCompletion } from './llmService.core'
const BACKPACK_USE_SYSTEM_PROMPT = `你是“背包物品使用结果生成器”。
你的任务是根据物品信息、世界书与当前剧情，生成“使用该物品后的剧情反馈”。

硬性要求：
1) 只输出 JSON 对象，不要 markdown，不要解释。
2) JSON 格式优先：
{"resultText":"...", "consume":true, "quantityDelta":-1, "effectTag":"story", "followupHint":"..."}
3) 字段约束：
- resultText: 必填，中文 20-140 字，描述使用后的即时反馈。
- consume: 必填，布尔值，表示是否消耗一件该物品。
- quantityDelta: 可选，整数，范围 -99 到 99；负数表示减少，正数表示增加，0 表示不变。
- effectTag: 可选，只能是 "story"|"clue"|"unlock"|"heal"|"buff"|"debuff"|"none"。
- followupHint: 可选，中文 0-40 字，用于简短提示下一步。`

const tryParseBackpackUseResult = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  let parsed = parseJson(candidate)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      parsed = parseJson(candidate.slice(start, end + 1))
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const resultText = String(
    parsed?.resultText ||
    parsed?.text ||
    parsed?.narration ||
    parsed?.result ||
    '',
  ).trim()

  if (!resultText) return null

  const normalizeBool = (value, fallback = false) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    const lower = String(value || '').trim().toLowerCase()
    if (['true', '1', 'yes', 'y', '是', '消耗', 'consume'].includes(lower)) return true
    if (['false', '0', 'no', 'n', '否', '不消耗', 'keep'].includes(lower)) return false
    return fallback
  }

  const normalizeInt = (value, fallback = 0, min = -99, max = 99) => {
    const parsedInt = Number.parseInt(String(value), 10)
    if (!Number.isFinite(parsedInt)) return fallback
    return Math.max(min, Math.min(max, parsedInt))
  }

  const effectAllowed = new Set(['story', 'clue', 'unlock', 'heal', 'buff', 'debuff', 'none'])
  const effectRaw = String(parsed?.effectTag || parsed?.effect || parsed?.tag || '').trim().toLowerCase()
  const effectTag = effectAllowed.has(effectRaw) ? effectRaw : 'story'

  const consume = normalizeBool(parsed?.consume, false)
  const quantityDelta = normalizeInt(
    parsed?.quantityDelta ?? parsed?.countDelta ?? parsed?.delta ?? (consume ? -1 : 0),
    consume ? -1 : 0,
    -99,
    99,
  )
  const followupHint = String(parsed?.followupHint || parsed?.hint || '').trim()

  return {
    resultText,
    consume,
    quantityDelta,
    effectTag,
    followupHint,
  }
}

export const generateBackpackUseResult = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      result: null,
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const item = params.item && typeof params.item === 'object' ? params.item : null
  const itemName = String(item?.name || '').trim()
  if (!itemName) {
    return {
      success: false,
      error: '物品参数不完整',
      result: null,
    }
  }

  const itemDescription = String(item?.description || item?.detail || item?.summary || '').trim()
  const itemCategory = String(item?.category || item?.type || '').trim()
  const itemTags = Array.isArray(item?.tags)
    ? item.tags
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : []
  const itemCount = Math.max(0, Number.parseInt(String(item?.count ?? item?.quantity ?? 1), 10) || 1)

  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const currentLine = params.currentLine && typeof params.currentLine === 'object' ? params.currentLine : null

  const parseLineCount = (value, fallback) => {
    const parsed = Number.parseInt(String(value), 10)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(0, Math.min(320, parsed))
  }

  const parseMaxTokens = (value, fallback) => {
    const parsed = Number.parseInt(String(value), 10)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(128, Math.min(200000, parsed))
  }

  const historyLimit = parseLineCount(params.options?.dialogueLimit, 18)
  const maxTokens = parseMaxTokens(params.options?.maxTokens, 520)
  const recentDialogue = (historyLimit > 0 ? dialogueHistory.slice(-historyLimit) : [])
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(
    worldBook?.summary ||
    worldBook?.entries?.overview ||
    '',
  ).trim()
  const currentLineText = currentLine?.text
    ? `${String(currentLine?.speaker || '旁白')}: ${String(currentLine.text || '').trim()}`
    : ''

  const userPrompt = [
    '【任务】玩家在剧情中使用了一个背包物品，请生成此次使用结果。',
    `【世界书标题】${worldTitle}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【物品名】${itemName}`,
    itemCategory ? `【物品分类】${itemCategory}` : '',
    itemDescription ? `【物品说明】${itemDescription}` : '',
    itemTags.length > 0 ? `【物品标签】${itemTags.join('、')}` : '',
    `【当前持有数量】${itemCount}`,
    currentLineText ? `【当前剧情句】${currentLineText}` : '',
    recentDialogue ? `【最近剧情】\n${recentDialogue}` : '',
    '请返回 JSON，至少包含 resultText 与 consume。',
    '若物品确实被用掉，consume=true 且 quantityDelta 建议为 -1；若只是展示或无法使用，可 consume=false。',
    'effectTag 仅可选：story/clue/unlock/heal/buff/debuff/none。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: BACKPACK_USE_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.78,
    maxTokens,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '物品使用结果生成失败',
      result: null,
    }
  }

  const parsed = tryParseBackpackUseResult(result.data)
  if (!parsed) {
    return {
      success: false,
      error: '物品使用结果解析失败',
      result: null,
    }
  }

  return {
    success: true,
    error: null,
    result: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const BRICK_LEVEL_SYSTEM_PROMPT = `你是“打砖块关卡参数生成器”。
你只负责输出一组可被前端直接使用的关卡参数，不要输出解释。

硬性要求：
1) 只输出 JSON 对象，不要 markdown。
2) JSON 格式必须是：
{"rows":6,"cols":10,"density":0.72,"durabilityBias":"normal","pattern":"pyramid","palette":"neon","paddleWidthRatio":0.18,"ballSpeed":340,"lives":3}
3) 字段约束：
- rows: 4-9
- cols: 7-12
- density: 0.35-0.95
- durabilityBias: "soft"|"normal"|"hard"
- pattern: "solid"|"pyramid"|"diamond"|"corridor"|"waves"|"checker"|"stairs"
- palette: "neon"|"sunset"|"ice"|"forest"|"mono"|"retro"
- paddleWidthRatio: 0.12-0.26
- ballSpeed: 240-430
- lives: 2-5
4) 难度需要随关卡序号提升，但不要陡增。`

const clampNumber = (value, min, max, fallback) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

const clampInt = (value, min, max, fallback) =>
  Math.round(clampNumber(value, min, max, fallback))

const tryParseBrickLevelConfig = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  let parsed = parseJson(candidate)
  if (!parsed || typeof parsed !== 'object') {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      parsed = parseJson(candidate.slice(start, end + 1))
    }
  }
  if (!parsed || typeof parsed !== 'object') return null

  const durabilityAllowed = new Set(['soft', 'normal', 'hard'])
  const patternAllowed = new Set(['solid', 'pyramid', 'diamond', 'corridor', 'waves', 'checker', 'stairs'])
  const paletteAllowed = new Set(['neon', 'sunset', 'ice', 'forest', 'mono', 'retro'])

  const durabilityBias = durabilityAllowed.has(String(parsed.durabilityBias || '').trim())
    ? String(parsed.durabilityBias).trim()
    : 'normal'
  const pattern = patternAllowed.has(String(parsed.pattern || '').trim())
    ? String(parsed.pattern).trim()
    : 'solid'
  const palette = paletteAllowed.has(String(parsed.palette || '').trim())
    ? String(parsed.palette).trim()
    : 'neon'

  return {
    rows: clampInt(parsed.rows, 4, 9, 6),
    cols: clampInt(parsed.cols, 7, 12, 10),
    density: clampNumber(parsed.density, 0.35, 0.95, 0.72),
    durabilityBias,
    pattern,
    palette,
    paddleWidthRatio: clampNumber(parsed.paddleWidthRatio, 0.12, 0.26, 0.18),
    ballSpeed: clampInt(parsed.ballSpeed, 240, 430, 340),
    lives: clampInt(parsed.lives, 2, 5, 3),
  }
}

export const generateHandheldBrickLevel = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      config: null,
    }
  }

  const stage = clampInt(params.stage, 1, 999, 1)
  const difficultyHint = String(params.difficultyHint || '').trim()
  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const sceneName = String(params.sceneName || '').trim()

  const userPrompt = [
    `【目标】生成掌机“打砖块”第 ${stage} 关参数 JSON。`,
    difficultyHint ? `【难度倾向】${difficultyHint}` : '',
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    sceneName ? `【当前场景】${sceneName}` : '',
    '要求：节奏逐关提升，可玩性优先，避免极端参数。',
    '只返回 JSON 对象，不要解释。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: BRICK_LEVEL_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.78,
    maxTokens: params.options?.maxTokens ?? 260,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '打砖块关卡参数生成失败',
      config: null,
    }
  }

  const parsed = tryParseBrickLevelConfig(result.data)
  if (!parsed) {
    return {
      success: false,
      error: '打砖块关卡参数解析失败',
      config: null,
    }
  }

  return {
    success: true,
    error: null,
    config: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const HANDHELD_PET_PROFILE_SYSTEM_PROMPT = `你是“掌机像素宠物领养生成器”。
你的任务是输出一个可爱的宠物设定，用于游戏内领养。

硬性要求：
1) 只输出 JSON 对象，不要 markdown，不要解释。
2) JSON 格式必须是：
{"name":"宠物名","species":"slime","title":"称号","personality":"性格描述","colorTheme":"mint","favoriteFood":"最爱食物","openingLine":"初次见面台词"}
3) 字段约束：
- name: 2-8 字中文昵称，避免生僻字。
- species: 只能是 "cat"|"dog"|"fox"|"rabbit"|"slime"|"dragon"。
- title: 4-14 字，像宠物卡片称号。
- personality: 8-24 字，简洁自然。
- colorTheme: 只能是 "mint"|"peach"|"sky"|"violet"|"lime"。
- favoriteFood: 2-10 字。
- openingLine: 10-40 字，像宠物开口说的话。`

const HANDHELD_PET_REPLY_SYSTEM_PROMPT = `你是“掌机像素宠物互动回复生成器”。
你只负责生成宠物的一句中文互动台词。

硬性要求：
1) 只输出 JSON 对象，不要 markdown，不要解释。
2) JSON 格式优先：{"line":"..."}。
3) line 要口语化、可爱、符合宠物设定，长度 8-36 字。
4) 不要出现“作为AI”等元话术。`

const parseFirstJsonObject = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  let parsed = parseJson(candidate)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    parsed = parseJson(candidate.slice(start, end + 1))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
  }

  return null
}

const PET_SPECIES_SET = new Set(['cat', 'dog', 'fox', 'rabbit', 'slime', 'dragon'])
const PET_COLOR_THEME_SET = new Set(['mint', 'peach', 'sky', 'violet', 'lime'])

const normalizeHandheldPetProfile = (rawValue) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null

  const normalizeText = (value, fallback, maxLen = 40) => {
    const text = String(value || '').trim().slice(0, maxLen)
    return text || fallback
  }

  const name = normalizeText(rawValue.name, '小团子', 10)
  const speciesRaw = String(rawValue.species || '').trim().toLowerCase()
  const colorRaw = String(rawValue.colorTheme || rawValue.color || '').trim().toLowerCase()

  return {
    name,
    species: PET_SPECIES_SET.has(speciesRaw) ? speciesRaw : 'slime',
    title: normalizeText(rawValue.title, '口袋小伙伴', 20),
    personality: normalizeText(rawValue.personality, '黏人、好奇、爱冒险', 36),
    colorTheme: PET_COLOR_THEME_SET.has(colorRaw) ? colorRaw : 'mint',
    favoriteFood: normalizeText(rawValue.favoriteFood, '宠物饼干', 14),
    openingLine: normalizeText(rawValue.openingLine, `${name} 来啦，今天也要一起冒险吗？`, 48),
  }
}

const normalizeHandheldPetReplyLine = (rawContent) => {
  const parsed = parseFirstJsonObject(rawContent)
  const lineFromJson = String(parsed?.line || parsed?.text || parsed?.reply || parsed?.content || '').trim()
  if (lineFromJson) return lineFromJson.slice(0, 64)

  const plain = String(rawContent || '')
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plain) return ''
  return plain.slice(0, 64)
}

export const generateHandheldPetProfile = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      profile: null,
    }
  }

  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const sceneName = String(params.sceneName || '').trim()
  const preferredSpecies = String(params.preferredSpecies || '').trim().toLowerCase()
  const adoptionHint = String(params.adoptionHint || '').trim()

  const userPrompt = [
    '【任务】请生成一只可领养的掌机像素宠物设定。',
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    sceneName ? `【当前场景】${sceneName}` : '',
    preferredSpecies && PET_SPECIES_SET.has(preferredSpecies) ? `【偏好物种】${preferredSpecies}` : '',
    adoptionHint ? `【玩家期望】${adoptionHint}` : '',
    '要求：风格可爱，适配口袋掌机。',
    '只返回 JSON 对象。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_PET_PROFILE_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? 280,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '宠物领养生成失败',
      profile: null,
    }
  }

  const parsed = normalizeHandheldPetProfile(parseFirstJsonObject(result.data))
  if (!parsed) {
    return {
      success: false,
      error: '宠物设定解析失败',
      profile: null,
    }
  }

  return {
    success: true,
    error: null,
    profile: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

export const generateHandheldPetReply = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      line: '',
    }
  }

  const petProfile = params.petProfile && typeof params.petProfile === 'object' ? params.petProfile : null
  const petName = String(petProfile?.name || '小团子').trim()
  const action = String(params.action || 'idle').trim()
  const actionTextMap = {
    feed: '喂食',
    pet: '摸摸',
    buy_food: '购买食物',
    idle: '闲聊',
  }
  const actionText = actionTextMap[action] || action

  const stats = params.stats && typeof params.stats === 'object' ? params.stats : {}
  const mood = clampInt(stats.mood, 0, 100, 60)
  const hunger = clampInt(stats.hunger, 0, 100, 58)
  const affection = clampInt(stats.affection, 0, 100, 55)
  const energy = clampInt(stats.energy, 0, 100, 68)
  const food = Math.max(0, clampInt(stats.food, 0, 999, 0))
  const coins = Math.max(0, clampInt(stats.coins, 0, 999999, 0))

  const userPrompt = [
    '【任务】请生成宠物的一句互动台词。',
    `【宠物名】${petName}`,
    petProfile?.species ? `【物种】${String(petProfile.species).trim()}` : '',
    petProfile?.title ? `【称号】${String(petProfile.title).trim()}` : '',
    petProfile?.personality ? `【性格】${String(petProfile.personality).trim()}` : '',
    petProfile?.favoriteFood ? `【最爱食物】${String(petProfile.favoriteFood).trim()}` : '',
    `【本次互动】${actionText}`,
    `【状态】心情${mood} 饱腹${hunger} 好感${affection} 体力${energy} 食物${food} 金币${coins}`,
    '请只输出 JSON：{"line":"宠物台词"}',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_PET_REPLY_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.88,
    maxTokens: params.options?.maxTokens ?? 140,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '宠物回复生成失败',
      line: '',
    }
  }

  const line = normalizeHandheldPetReplyLine(result.data)
  if (!line) {
    return {
      success: false,
      error: '宠物回复解析失败',
      line: '',
    }
  }

  return {
    success: true,
    error: null,
    line,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const HANDHELD_DUNGEON_SCENE_SYSTEM_PROMPT = `你是“掌机RPG地下城内容生成器”。
你只负责输出一个可被前端直接解析的 JSON 对象，不要输出解释，不要输出 markdown。

输出格式：
{
  "eventType":"battle",
  "title":"...",
  "description":"...",
  "enemy":{
    "name":"...",
    "rarity":"R",
    "hp":120,
    "attack":28,
    "rewardCoins":120,
    "rewardGems":24
  },
  "loot":{
    "name":"...",
    "rarity":"SR",
    "slot":"weapon",
    "atk":18,
    "def":0,
    "hp":6,
    "desc":"..."
  },
  "banterHint":"..."
}

约束：
1) eventType 只能是 "battle"|"boss"|"rest"|"treasure"
2) 当 eventType 为 "battle" 或 "boss" 时必须给出 enemy；其余可置空
3) rarity 只能是 "R"|"SR"|"SSR"
4) slot 只能是 "weapon"|"armor"|"relic"
5) 文案简短，适合掌机屏幕阅读`

const HANDHELD_DUNGEON_BANTER_SYSTEM_PROMPT = `你是“掌机RPG队友吐槽台词生成器”。
你只输出一条短台词 JSON，不要解释，不要 markdown。
格式：{"line":"..."}
要求：
1) line 长度 8-36 字
2) 口语化，有轻度吐槽感
3) 不要出现“作为AI”等元话术`

const HANDHELD_CAMPFIRE_COMPANION_MAX = 60

const HANDHELD_CAMPFIRE_COMPANION_SYSTEM_PROMPT = `你是“掌机RPG篝火角色像素风设定生成器”。
你只输出 JSON 对象，不要解释，不要 markdown。

输出格式：
{
  "companions":[
    {
      "name":"角色名",
      "role":"骑士",
      "style":"knight",
      "palette":"ember",
      "action":"warm_hands",
      "line":"简短动作说明"
    }
  ]
}

硬性约束：
1) companions 数组长度必须与请求人数一致（至少 1，最多 60）。
2) role 必填，2-12 字；不要局限固定职业名，要依据角色背景、身份、性格自动命名（例如“遗迹译码师”“夜巡斥候”“灰烬祝祷者”）。
3) style 只能是 "knight"|"mage"|"ranger"|"rogue"|"priest"|"alchemist"。
4) palette 只能是 "ember"|"forest"|"sky"|"violet"|"sand"|"iron"。
5) action 只能是 "idle"|"warm_hands"|"sharpen_blade"|"lookout"|"stretch"|"cheer"。
6) line 6-24 字，描述此角色在篝火旁的小动作与状态。
7) 角色之间不要风格重复过多，整体有队伍感。
8) 输入候选含“外观与设定”描述时，必须据此映射 role/style/palette/action（例如职业装束、配色、武器习惯、气质动作）。
9) name 优先使用候选原名，不要擅自改名。`

const DUNGEON_EVENT_TYPE_SET = new Set(['battle', 'boss', 'rest', 'treasure'])
const DUNGEON_RARITY_SET = new Set(['R', 'SR', 'SSR'])
const DUNGEON_SLOT_SET = new Set(['weapon', 'armor', 'relic'])
const CAMPFIRE_STYLE_SET = new Set(['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist'])
const CAMPFIRE_PALETTE_SET = new Set(['ember', 'forest', 'sky', 'violet', 'sand', 'iron'])
const CAMPFIRE_ACTION_SET = new Set(['idle', 'warm_hands', 'sharpen_blade', 'lookout', 'stretch', 'cheer'])
const CAMPFIRE_ROLE_FALLBACK_LIST = ['守护者', '侦察员', '施法者', '炼金师', '机关师', '驯兽师']
const DUNGEON_MAP_TILE_TYPE_SET = new Set(['monster', 'boss', 'treasure', 'empty'])
const DUNGEON_OBJECT_TYPE_SET = new Set(['start', 'exit', 'monster', 'boss', 'treasure', 'empty'])
const DUNGEON_TILE_CATALOG_COLOR_RE = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i
const DUNGEON_TILE_CATALOG_ID_RE = /[^a-z0-9_-]/g
const DUNGEON_TILE_MATRIX_SIZE = 16

const createDungeonTileMatrixFallback = (main = '1', accent = '2', accentStep = 7) => {
  const rows = []
  const mainChar = String(main || '1').slice(0, 1) || '1'
  const accentChar = String(accent || '2').slice(0, 1) || '2'
  const step = Math.max(2, Math.min(15, Number.parseInt(String(accentStep), 10) || 7))
  for (let y = 0; y < DUNGEON_TILE_MATRIX_SIZE; y += 1) {
    let line = ''
    for (let x = 0; x < DUNGEON_TILE_MATRIX_SIZE; x += 1) {
      const useAccent = ((x * 3 + y * 5) % step) === 0
      line += useAccent ? accentChar : mainChar
    }
    rows.push(line)
  }
  return rows
}

const wrapHue = (value) => {
  const raw = Number(value) || 0
  const wrapped = raw % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

const toHexByte = (value) => {
  const clipped = Math.max(0, Math.min(255, Math.round(Number(value) || 0)))
  return clipped.toString(16).padStart(2, '0')
}

const hslToHex = (h, s, l, alpha = 1) => {
  const hue = wrapHue(h) / 360
  const sat = Math.max(0, Math.min(1, (Number(s) || 0) / 100))
  const lig = Math.max(0, Math.min(1, (Number(l) || 0) / 100))
  const a = Math.max(0, Math.min(1, Number(alpha)))

  if (sat <= 0) {
    const v = Math.round(lig * 255)
    if (a >= 0.999) {
      return `#${toHexByte(v)}${toHexByte(v)}${toHexByte(v)}`
    }
    return `#${toHexByte(v)}${toHexByte(v)}${toHexByte(v)}${toHexByte(a * 255)}`
  }

  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat
  const p = 2 * lig - q
  const hueToRgb = (t) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const r = Math.round(hueToRgb(hue + 1 / 3) * 255)
  const g = Math.round(hueToRgb(hue) * 255)
  const b = Math.round(hueToRgb(hue - 1 / 3) * 255)
  if (a >= 0.999) {
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
  }
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}${toHexByte(a * 255)}`
}

const hashSeed32 = (seedSource) => {
  const text = String(seedSource || 'seed')
  let seed = 2166136261 >>> 0
  for (let index = 0; index < text.length; index += 1) {
    seed ^= text.charCodeAt(index)
    seed = Math.imul(seed, 16777619)
    seed >>>= 0
  }
  return seed >>> 0
}

const createDungeonSeededRandom = (seedSource) => {
  let seed = hashSeed32(seedSource)
  if (seed === 0) seed = 0x9e3779b9
  return () => {
    seed += 0x6d2b79f5
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const createDungeonTilePaletteFallback = (seedHint, passable = true) => {
  const random = createDungeonSeededRandom(`tile-palette|${seedHint}|${passable ? 'p' : 'b'}`)
  const baseHue = Math.floor(random() * 360)
  if (passable) {
    const sat = 32 + Math.floor(random() * 30)
    const light = 24 + Math.floor(random() * 10)
    return [
      '#00000000',
      hslToHex(baseHue, sat, light),
      hslToHex(baseHue + 9 + random() * 18, sat + 8, light + 8),
      hslToHex(baseHue + 20 + random() * 24, sat + 10, light + 18),
      hslToHex(baseHue + 32 + random() * 26, sat + 5, light + 30),
    ]
  }
  const sat = 18 + Math.floor(random() * 22)
  const light = 13 + Math.floor(random() * 7)
  return [
    '#00000000',
    hslToHex(baseHue, sat, light),
    hslToHex(baseHue + 8 + random() * 14, sat + 5, light + 5),
    hslToHex(baseHue + 18 + random() * 18, sat + 7, light + 11),
    hslToHex(baseHue + 30 + random() * 18, sat + 6, light + 18),
  ]
}

const createDungeonTilePixelsFallback = (seedHint, passable = true) => {
  const seed = hashSeed32(`tile-pixels|${seedHint}|${passable ? 'p' : 'b'}`)
  const stepA = 4 + (seed % 7)
  const stepB = 5 + ((seed >>> 3) % 6)
  const stepC = 6 + ((seed >>> 6) % 5)
  const offsetA = (seed >>> 8) % 29
  const offsetB = (seed >>> 13) % 31
  const offsetC = (seed >>> 17) % 37
  const baseChar = passable ? '1' : '2'
  const accentA = passable ? '2' : '3'
  const accentB = passable ? '3' : '4'
  const ridge = passable ? '4' : '1'
  const rows = []
  for (let y = 0; y < DUNGEON_TILE_MATRIX_SIZE; y += 1) {
    let line = ''
    for (let x = 0; x < DUNGEON_TILE_MATRIX_SIZE; x += 1) {
      let char = baseChar
      if (((x * 3 + y * 5 + offsetA) % stepA) === 0) char = accentA
      if (((x * 7 + y * 2 + offsetB) % stepB) === 0) char = accentB
      if (((x - y + offsetC) % stepC) === 0) char = ridge
      line += char
    }
    rows.push(line)
  }
  return rows
}

const createDungeonTileCatalogFallback = (seedHint = 'fallback-seed', themeHint = '迷宫遗迹') => {
  const random = createDungeonSeededRandom(`tile-catalog|${seedHint}|${themeHint}`)
  const pathNames = ['碎石步道', '苔纹地砖', '雾影小径', '古阶回廊', '藤蔓走道', '青石甬道']
  const blockNames = ['断壁残垣', '深渊裂缝', '荆棘岩墙', '塌陷石堆', '毒雾泥潭', '黑曜障壁']
  const pickName = (list, fallback, index) => {
    if (!Array.isArray(list) || list.length < 1) return `${fallback}${index + 1}`
    const picked = list[Math.floor(random() * list.length)]
    return String(picked || `${fallback}${index + 1}`).trim().slice(0, 20) || `${fallback}${index + 1}`
  }
  const makeTile = (passable, slot) => {
    const suffix = hashSeed32(`${seedHint}|${themeHint}|${passable ? 'p' : 'b'}|${slot}`).toString(16).slice(-4)
    const id = passable ? `llm-path-${slot + 1}-${suffix}` : `llm-block-${slot + 1}-${suffix}`
    const name = passable
      ? pickName(pathNames, '可通行地形', slot)
      : pickName(blockNames, '阻塞地形', slot)
    return {
      id,
      name,
      passable,
      weight: clampInt(28 + Math.round(random() * 52), 1, 100, 40),
      palette: createDungeonTilePaletteFallback(`${seedHint}|${themeHint}|${id}`, passable),
      pixels16: createDungeonTilePixelsFallback(`${seedHint}|${themeHint}|${id}`, passable),
    }
  }
  return [
    makeTile(true, 0),
    makeTile(true, 1),
    makeTile(false, 0),
    makeTile(false, 1),
  ]
}

const createDungeonObjectMatrixFallback = (kind = 'empty', main = '2', accent = '3', detail = '4') => {
  const rows = []
  const mainChar = String(main || '2').slice(0, 1) || '2'
  const accentChar = String(accent || '3').slice(0, 1) || '3'
  const detailChar = String(detail || '4').slice(0, 1) || '4'

  for (let y = 0; y < DUNGEON_TILE_MATRIX_SIZE; y += 1) {
    let line = ''
    for (let x = 0; x < DUNGEON_TILE_MATRIX_SIZE; x += 1) {
      let char = '0'

      if (kind === 'start') {
        const inCore = x >= 5 && x <= 10 && y >= 5 && y <= 10
        if (inCore) char = (x + y) % 2 === 0 ? mainChar : accentChar
        if ((x === 7 || x === 8) && y >= 2 && y <= 13) char = detailChar
        if ((y === 7 || y === 8) && x >= 2 && x <= 13) char = detailChar
      } else if (kind === 'exit') {
        const dx = x - 7.5
        const dy = y - 7.5
        const dist = dx * dx + dy * dy
        if (dist >= 20 && dist <= 52) char = mainChar
        if (dist >= 30 && dist <= 36 && (x + y) % 2 === 0) char = accentChar
        if (dist < 8) char = detailChar
      } else if (kind === 'monster') {
        if (x >= 4 && x <= 11 && y >= 4 && y <= 11) char = mainChar
        if ((x === 6 || x === 9) && y >= 6 && y <= 7) char = '0'
        if ((x === 6 || x === 9) && y >= 9 && y <= 10) char = '0'
        if (y === 11 && x >= 6 && x <= 9) char = accentChar
        if (y === 12 && x >= 5 && x <= 10) char = accentChar
      } else if (kind === 'boss') {
        if (x >= 4 && x <= 11 && y >= 5 && y <= 12) char = mainChar
        if (y >= 2 && y <= 5 && (x === 5 || x === 7 || x === 9 || x === 11)) char = accentChar
        if (y === 6 && x >= 4 && x <= 11) char = detailChar
      } else if (kind === 'treasure') {
        if (x >= 4 && x <= 11 && y >= 8 && y <= 12) char = mainChar
        if (x >= 5 && x <= 10 && y >= 6 && y <= 8) char = accentChar
        if (y === 9 && (x === 7 || x === 8)) char = detailChar
      } else if (kind === 'empty') {
        if ((x * 3 + y * 5) % 17 === 0) char = mainChar
        if ((x + y) % 11 === 0) char = accentChar
      }

      line += char
    }
    rows.push(line)
  }
  return rows
}

const DUNGEON_OBJECT_CATALOG_FALLBACK = [
  {
    id: 'obj-start-rune',
    type: 'start',
    name: '启程符阵',
    weight: 46,
    palette: ['#00000000', '#1d2d3a', '#2f6f72', '#5bd0cf', '#cffff8'],
    pixels16: createDungeonObjectMatrixFallback('start', '2', '3', '4'),
  },
  {
    id: 'obj-exit-gate',
    type: 'exit',
    name: '传送门',
    weight: 44,
    palette: ['#00000000', '#1d1f39', '#4250a8', '#7f9dff', '#d3e1ff'],
    pixels16: createDungeonObjectMatrixFallback('exit', '2', '3', '4'),
  },
  {
    id: 'obj-monster-totem',
    type: 'monster',
    name: '魔物图腾',
    weight: 50,
    palette: ['#00000000', '#2b1d21', '#7b3a43', '#c85a63', '#ffd0b8'],
    pixels16: createDungeonObjectMatrixFallback('monster', '2', '3', '4'),
  },
  {
    id: 'obj-boss-crown',
    type: 'boss',
    name: '王冠祭坛',
    weight: 52,
    palette: ['#00000000', '#26170f', '#7c3f1a', '#d68f33', '#ffe08a'],
    pixels16: createDungeonObjectMatrixFallback('boss', '2', '3', '4'),
  },
  {
    id: 'obj-treasure-chest',
    type: 'treasure',
    name: '宝箱',
    weight: 48,
    palette: ['#00000000', '#2a2216', '#7d4f23', '#c58b3e', '#f6de9a'],
    pixels16: createDungeonObjectMatrixFallback('treasure', '2', '3', '4'),
  },
  {
    id: 'obj-empty-rubble',
    type: 'empty',
    name: '碎石堆',
    weight: 20,
    palette: ['#00000000', '#1f2530', '#384255', '#59667f', '#8b9ab4'],
    pixels16: createDungeonObjectMatrixFallback('empty', '2', '3', '4'),
  },
]

const normalizeDungeonSceneEventType = (value, fallback = 'battle') => {
  const eventType = String(value || '').trim().toLowerCase()
  return DUNGEON_EVENT_TYPE_SET.has(eventType) ? eventType : fallback
}

const normalizeDungeonSceneRarity = (value, fallback = 'R') => {
  const rarity = String(value || '').trim().toUpperCase()
  return DUNGEON_RARITY_SET.has(rarity) ? rarity : fallback
}

const normalizeDungeonSceneSlot = (value, fallback = 'weapon') => {
  const slot = String(value || '').trim().toLowerCase()
  return DUNGEON_SLOT_SET.has(slot) ? slot : fallback
}

const normalizeClassicClassRole = (value, index = 0, hintText = '') => {
  const raw = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24)
  if (raw) return raw
  const hint = String(hintText || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  if (hint) {
    const picked = hint
      .split(/[|；;，,。]/)
      .map((item) => String(item || '').trim().slice(0, 12))
      .find((item) => item.length >= 2)
    if (picked) return picked
  }
  return CAMPFIRE_ROLE_FALLBACK_LIST[index % CAMPFIRE_ROLE_FALLBACK_LIST.length]
}

const normalizeHandheldDungeonScene = (rawValue, options = {}) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null

  const floor = clampInt(options.floor, 1, 999, 1)
  const eventTypeHint = normalizeDungeonSceneEventType(options.eventTypeHint, floor % 5 === 0 ? 'boss' : 'battle')
  const eventType = normalizeDungeonSceneEventType(rawValue.eventType, eventTypeHint)

  const title = String(rawValue.title || '').trim().slice(0, 36) || `地下城第 ${floor} 层`
  const description = String(rawValue.description || '').trim().slice(0, 96) || `${title}，继续推进。`
  const banterHint = String(rawValue.banterHint || '').trim().slice(0, 60)

  let enemy = null
  if (eventType === 'battle' || eventType === 'boss') {
    const enemyRaw = rawValue.enemy && typeof rawValue.enemy === 'object' ? rawValue.enemy : {}
    const isBoss = eventType === 'boss'
    enemy = {
      name: String(enemyRaw.name || (isBoss ? '深渊守门者' : '地窟魔物')).trim().slice(0, 20) || (isBoss ? '深渊守门者' : '地窟魔物'),
      rarity: normalizeDungeonSceneRarity(enemyRaw.rarity, isBoss ? 'SSR' : floor >= 9 ? 'SR' : 'R'),
      hp: clampInt(enemyRaw.hp, 20, 4000, (isBoss ? 180 : 90) + floor * (isBoss ? 16 : 9)),
      attack: clampInt(enemyRaw.attack, 8, 600, (isBoss ? 36 : 18) + floor * (isBoss ? 3 : 2)),
      rewardCoins: clampInt(enemyRaw.rewardCoins, 1, 99999, floor * (isBoss ? 62 : 24)),
      rewardGems: clampInt(enemyRaw.rewardGems, 1, 99999, floor * (isBoss ? 20 : 6)),
    }
  }

  let loot = null
  if (rawValue.loot && typeof rawValue.loot === 'object' && !Array.isArray(rawValue.loot)) {
    const lootName = String(rawValue.loot.name || '').trim().slice(0, 18)
    if (lootName) {
      loot = {
        name: lootName,
        rarity: normalizeDungeonSceneRarity(rawValue.loot.rarity, 'R'),
        slot: normalizeDungeonSceneSlot(rawValue.loot.slot, 'weapon'),
        atk: clampInt(rawValue.loot.atk, 0, 160, 0),
        def: clampInt(rawValue.loot.def, 0, 160, 0),
        hp: clampInt(rawValue.loot.hp, 0, 320, 0),
        desc: String(rawValue.loot.desc || '').trim().slice(0, 36),
      }
    }
  }

  return {
    eventType,
    title,
    description,
    enemy,
    loot,
    banterHint,
  }
}

const normalizeHandheldDungeonBanterLine = (rawContent) => {
  const parsed = parseFirstJsonObject(rawContent)
  const fromJson = String(parsed?.line || parsed?.text || parsed?.reply || '').trim()
  if (fromJson) return fromJson.slice(0, 64)

  const plain = String(rawContent || '')
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plain) return ''
  return plain.slice(0, 64)
}

const normalizeHandheldCampfireCompanions = (rawValue, fallbackNames = [], fallbackRoles = []) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null
  const rawList = Array.isArray(rawValue.companions) ? rawValue.companions : null
  if (!rawList || rawList.length === 0) return null

  const styleFallback = ['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist']
  const paletteFallback = ['ember', 'forest', 'sky', 'violet', 'sand', 'iron']
  const actionFallback = ['warm_hands', 'idle', 'lookout', 'stretch', 'sharpen_blade', 'cheer']

  const list = rawList
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const fallbackName = String(fallbackNames[index] || `营地伙伴${index + 1}`).trim().slice(0, 12) || `营地伙伴${index + 1}`
      const name = String(item.name || fallbackName).trim().slice(0, 12) || fallbackName
      const styleRaw = String(item.style || '').trim().toLowerCase()
      const paletteRaw = String(item.palette || item.color || '').trim().toLowerCase()
      const actionRaw = String(item.action || '').trim().toLowerCase()
      const line = String(item.line || item.pose || item.note || '').trim().slice(0, 32)
      const roleHint = fallbackRoles[index] || item.hint || line
      return {
        id: `camp-${index + 1}`,
        name,
        role: normalizeClassicClassRole(item.role, index, roleHint),
        style: CAMPFIRE_STYLE_SET.has(styleRaw) ? styleRaw : styleFallback[index % styleFallback.length],
        palette: CAMPFIRE_PALETTE_SET.has(paletteRaw) ? paletteRaw : paletteFallback[index % paletteFallback.length],
        action: CAMPFIRE_ACTION_SET.has(actionRaw) ? actionRaw : actionFallback[index % actionFallback.length],
        line,
      }
    })
    .filter(Boolean)
    .slice(0, HANDHELD_CAMPFIRE_COMPANION_MAX)

  if (list.length < 1) return null
  return list
}

const HANDHELD_DUNGEON_MAP_SYSTEM_PROMPT = `你是“掌机RPG地下城地形像素素材生成器”。
你只输出 JSON 对象，不要解释，不要 markdown。

输出格式：
{
  "theme":"地下城主题名",
  "width":7,
  "height":6,
  "start":{"x":0,"y":5},
  "exit":{"x":6,"y":0},
  "tileCatalog":[
    {
      "id":"tile_alpha_path",
      "name":"潮湿石纹地",
      "passable":true,
      "weight":42,
      "palette":["#00000000","#2f462c","#4f7244","#78a061","#9ec486"],
      "pixels16":[
        "1111111111111111",
        "1121111111111211",
        "1111113111111111",
        "1112111111111121",
        "1111111112111111",
        "1131111111113111",
        "1111111211111111",
        "1111111111111111",
        "1112111111111211",
        "1111113111111111",
        "1121111111111111",
        "1111111112111111",
        "1111311111111111",
        "1111111211111111",
        "1111111111111111",
        "1111111111111111"
      ]
    }
  ]
}

硬性约束：
1) width/height 均为 5-9 的整数。
2) start/exit 必须在地图内，且不能重叠。
3) tileCatalog 必须 3-6 种地形，至少 1 种 passable=true，至少 1 种 passable=false。
4) tileCatalog 每项必须含 id/name/passable/weight/palette/pixels16。
5) weight 为 1-100 的整数；palette 长度 2-8，颜色仅用 #RRGGBB 或 #RRGGBBAA。
6) pixels16 必须是 16 行，每行 16 字符；字符只能是 0-9a-f，且索引不能超过 palette 长度-1。
7) tileCatalog 必须是本次地图原创像素风，不要复用固定模板或固定命名。
8) 不要生成 monster/boss/treasure 的坐标与数值配置，这部分由前端算法处理。`

const cloneDungeonTileCatalogFallback = (seedHint = 'fallback-seed', themeHint = '迷宫遗迹') => {
  return createDungeonTileCatalogFallback(seedHint, themeHint).map((tile) => ({
    id: tile.id,
    name: tile.name,
    passable: Boolean(tile.passable),
    weight: clampInt(tile.weight, 1, 100, 10),
    palette: Array.isArray(tile.palette) ? tile.palette.map((color) => String(color || '')) : [],
    pixels16: Array.isArray(tile.pixels16) ? tile.pixels16.map((line) => String(line || '')) : [],
  }))
}

const cloneDungeonObjectCatalogFallback = () => {
  return DUNGEON_OBJECT_CATALOG_FALLBACK.map((item) => ({
    id: item.id,
    type: String(item.type || 'empty').trim().toLowerCase(),
    name: item.name,
    weight: clampInt(item.weight, 1, 100, 20),
    palette: Array.isArray(item.palette) ? item.palette.map((color) => String(color || '')) : [],
    pixels16: Array.isArray(item.pixels16) ? item.pixels16.map((line) => String(line || '')) : [],
  }))
}

const normalizeDungeonTileCatalogId = (value, fallback = 'terrain') => {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(DUNGEON_TILE_CATALOG_ID_RE, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return cleaned || fallback
}

const normalizeDungeonTileCatalogColor = (value, fallback = '#00000000') => {
  const text = String(value || '').trim()
  if (DUNGEON_TILE_CATALOG_COLOR_RE.test(text)) return text
  return fallback
}

const normalizeDungeonTileCatalogPalette = (rawPalette, fallbackPalette) => {
  const source = Array.isArray(rawPalette) ? rawPalette : []
  const fallback = Array.isArray(fallbackPalette) ? fallbackPalette : ['#00000000', '#2f462c', '#4f7244']
  const normalized = source
    .map((item, index) => normalizeDungeonTileCatalogColor(item, fallback[index] || fallback[fallback.length - 1] || '#00000000'))
    .slice(0, 8)
  if (normalized.length < 2) {
    return fallback.map((item) => normalizeDungeonTileCatalogColor(item, '#00000000')).slice(0, 8)
  }
  return normalized
}

const normalizeDungeonTileCatalogPixels16 = (rawPixels, paletteSize, fallbackPixels) => {
  const fallbackRows = Array.isArray(fallbackPixels) ? fallbackPixels : []
  const safeFallback = []
  for (let row = 0; row < DUNGEON_TILE_MATRIX_SIZE; row += 1) {
    const fallbackRow = String(fallbackRows[row] || '')
    const fallbackChar = fallbackRow[0] || '0'
    safeFallback.push((fallbackRow.padEnd(DUNGEON_TILE_MATRIX_SIZE, fallbackChar)).slice(0, DUNGEON_TILE_MATRIX_SIZE))
  }

  const source = Array.isArray(rawPixels) ? rawPixels : null
  if (!source || source.length < DUNGEON_TILE_MATRIX_SIZE) {
    return safeFallback
  }

  const maxIndex = Math.max(0, Math.min(15, (Number.parseInt(String(paletteSize), 10) || 1) - 1))
  const rows = []
  for (let y = 0; y < DUNGEON_TILE_MATRIX_SIZE; y += 1) {
    const rawLine = String(source[y] || '')
    const fallbackLine = safeFallback[y] || safeFallback[0] || '0'.repeat(DUNGEON_TILE_MATRIX_SIZE)
    if (!rawLine) {
      rows.push(fallbackLine)
      continue
    }
    let line = ''
    for (let x = 0; x < DUNGEON_TILE_MATRIX_SIZE; x += 1) {
      const char = rawLine[x] || fallbackLine[x] || '0'
      const value = Number.parseInt(char, 16)
      if (!Number.isFinite(value)) {
        line += fallbackLine[x] || '0'
        continue
      }
      const clipped = Math.max(0, Math.min(maxIndex, Math.round(value)))
      line += clipped.toString(16)
    }
    rows.push(line)
  }
  return rows
}

const normalizeDungeonTileCatalog = (rawCatalog, options = {}) => {
  const fallback = cloneDungeonTileCatalogFallback(
    String(options.seedHint || 'fallback-seed'),
    String(options.themeHint || '迷宫遗迹'),
  )
  const source = Array.isArray(rawCatalog) ? rawCatalog : []
  const result = []
  const usedIds = new Set()
  for (let index = 0; index < source.length; index += 1) {
    const item = source[index]
    if (!item || typeof item !== 'object') continue
    const fallbackTile = fallback[index % fallback.length]
    const id = normalizeDungeonTileCatalogId(item.id, `${fallbackTile.id}-${index + 1}`)
    if (usedIds.has(id)) continue
    const passable = typeof item.passable === 'boolean' ? item.passable : Boolean(fallbackTile.passable)
    const palette = normalizeDungeonTileCatalogPalette(item.palette, fallbackTile.palette)
    const pixels16 = normalizeDungeonTileCatalogPixels16(
      item.pixels16 || item.matrix16 || item.pixels || item.pattern,
      palette.length,
      fallbackTile.pixels16,
    )
    result.push({
      id,
      name: String(item.name || fallbackTile.name).trim().slice(0, 20) || fallbackTile.name,
      passable,
      weight: clampInt(item.weight, 1, 100, fallbackTile.weight),
      palette,
      pixels16,
    })
    usedIds.add(id)
    if (result.length >= 8) break
  }

  const pushFallbackTile = (tile) => {
    if (!tile || typeof tile !== 'object') return
    const id = normalizeDungeonTileCatalogId(tile.id, `fallback-${result.length + 1}`)
    if (usedIds.has(id)) return
    result.push({
      id,
      name: String(tile.name || '地形').trim().slice(0, 20) || '地形',
      passable: Boolean(tile.passable),
      weight: clampInt(tile.weight, 1, 100, 10),
      palette: normalizeDungeonTileCatalogPalette(tile.palette, ['#00000000', '#2f462c', '#4f7244']),
      pixels16: normalizeDungeonTileCatalogPixels16(tile.pixels16, Array.isArray(tile.palette) ? tile.palette.length : 3, tile.pixels16),
    })
    usedIds.add(id)
  }

  if (result.length < 3) {
    fallback.forEach((item) => {
      if (result.length >= 4) return
      pushFallbackTile(item)
    })
  }

  if (!result.some((item) => item.passable)) {
    pushFallbackTile(fallback.find((item) => item.passable) || fallback[0])
  }
  if (!result.some((item) => !item.passable)) {
    pushFallbackTile(fallback.find((item) => !item.passable) || fallback[fallback.length - 1])
  }
  return result.slice(0, 8)
}

const normalizeDungeonObjectCatalogType = (value, fallback = 'empty') => {
  const type = String(value || '').trim().toLowerCase()
  if (DUNGEON_OBJECT_TYPE_SET.has(type)) return type
  return fallback
}

const normalizeDungeonObjectCatalog = (rawCatalog) => {
  const fallback = cloneDungeonObjectCatalogFallback()
  const source = Array.isArray(rawCatalog) ? rawCatalog : []
  const result = []
  const usedIds = new Set()
  for (let index = 0; index < source.length; index += 1) {
    const item = source[index]
    if (!item || typeof item !== 'object') continue
    const fallbackItem = fallback[index % fallback.length]
    const id = normalizeDungeonTileCatalogId(item.id, `${fallbackItem.id}-${index + 1}`)
    if (usedIds.has(id)) continue
    const type = normalizeDungeonObjectCatalogType(item.type || item.kind || item.cellType, fallbackItem.type)
    const palette = normalizeDungeonTileCatalogPalette(item.palette, fallbackItem.palette)
    const pixels16 = normalizeDungeonTileCatalogPixels16(
      item.pixels16 || item.matrix16 || item.pixels || item.pattern,
      palette.length,
      fallbackItem.pixels16,
    )
    result.push({
      id,
      type,
      name: String(item.name || fallbackItem.name).trim().slice(0, 20) || fallbackItem.name,
      weight: clampInt(item.weight, 1, 100, fallbackItem.weight),
      palette,
      pixels16,
    })
    usedIds.add(id)
    if (result.length >= 12) break
  }

  const pushFallbackObject = (item) => {
    if (!item || typeof item !== 'object') return
    const id = normalizeDungeonTileCatalogId(item.id, `object-fallback-${result.length + 1}`)
    if (usedIds.has(id)) return
    result.push({
      id,
      type: normalizeDungeonObjectCatalogType(item.type, 'empty'),
      name: String(item.name || '场景物体').trim().slice(0, 20) || '场景物体',
      weight: clampInt(item.weight, 1, 100, 20),
      palette: normalizeDungeonTileCatalogPalette(item.palette, ['#00000000', '#2b3947', '#4a7f9a']),
      pixels16: normalizeDungeonTileCatalogPixels16(item.pixels16, Array.isArray(item.palette) ? item.palette.length : 3, item.pixels16),
    })
    usedIds.add(id)
  }

  const requiredTypes = ['start', 'exit', 'monster', 'boss', 'treasure']
  requiredTypes.forEach((type) => {
    if (result.some((item) => item.type === type)) return
    const fallbackItem = fallback.find((item) => item.type === type)
    pushFallbackObject(fallbackItem)
  })

  if (result.length < 4) {
    fallback.forEach((item) => {
      if (result.length >= 6) return
      pushFallbackObject(item)
    })
  }

  return result.slice(0, 12)
}

const normalizeDungeonMapTileType = (value, fallback = 'empty') => {
  const type = String(value || '').trim().toLowerCase()
  return DUNGEON_MAP_TILE_TYPE_SET.has(type) ? type : fallback
}

const parseDungeonMapSizeHint = (value) => {
  const text = String(value || '').trim()
  const matched = text.match(/(\d+)\s*[-~xX]\s*(\d+)/)
  if (!matched) {
    return { minSize: 5, maxSize: 9 }
  }
  const first = clampInt(matched[1], 5, 9, 5)
  const second = clampInt(matched[2], 5, 9, 9)
  return {
    minSize: Math.min(first, second),
    maxSize: Math.max(first, second),
  }
}

const normalizeHandheldDungeonMap = (rawValue, options = {}) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null

  const floor = clampInt(options.floor, 1, 999, 1)
  const sizeHint = parseDungeonMapSizeHint(options.sizeHint)
  const width = clampInt(
    rawValue.width ?? rawValue.cols ?? rawValue.size,
    sizeHint.minSize,
    sizeHint.maxSize,
    Math.min(sizeHint.maxSize, Math.max(sizeHint.minSize, 6)),
  )
  const height = clampInt(
    rawValue.height ?? rawValue.rows ?? rawValue.size,
    sizeHint.minSize,
    sizeHint.maxSize,
    Math.min(sizeHint.maxSize, Math.max(sizeHint.minSize, 6)),
  )

  const theme = String(rawValue.theme || rawValue.style || '迷宫遗迹').trim().slice(0, 28) || '迷宫遗迹'
  const startX = clampInt(rawValue?.start?.x, 0, width - 1, 0)
  const startY = clampInt(rawValue?.start?.y, 0, height - 1, height - 1)
  const exitX = clampInt(rawValue?.exit?.x, 0, width - 1, width - 1)
  const exitY = clampInt(rawValue?.exit?.y, 0, height - 1, 0)
  const fallbackExitX = startX === width - 1 && startY === 0 ? 0 : width - 1
  const fallbackExitY = startX === width - 1 && startY === 0 ? height - 1 : 0
  const exit = startX === exitX && startY === exitY
    ? { x: fallbackExitX, y: fallbackExitY }
    : { x: exitX, y: exitY }
  const terrainSeed = String(
    rawValue.terrainSeed ||
    rawValue.seed ||
    rawValue.mapSeed ||
    `f${floor}-${theme}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  ).trim().slice(0, 120)
  const tileCatalog = normalizeDungeonTileCatalog(
    rawValue.tileCatalog || rawValue.terrainTiles || rawValue.tileset,
    { seedHint: terrainSeed, themeHint: theme },
  )
  const objectCatalog = normalizeDungeonObjectCatalog(
    rawValue.objectCatalog ||
    rawValue.sceneObjectCatalog ||
    rawValue.objectTiles ||
    rawValue.objectSet,
  )

  return {
    id: String(rawValue.id || `dungeon-map-f${floor}-${terrainSeed.slice(0, 6)}`).trim().slice(0, 80) || `dungeon-map-f${floor}-${terrainSeed.slice(0, 6)}`,
    floor,
    theme,
    width,
    height,
    start: { x: startX, y: startY },
    exit,
    player: { x: startX, y: startY },
    terrainSeed,
    tileCatalog,
    objectCatalog,
    // 遭遇点坐标由前端地图算法决定，LLM只负责地形素材。
    tiles: [],
  }
}

export const generateHandheldDungeonMap = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      map: null,
    }
  }

  const floor = clampInt(params.floor, 1, 999, 1)
  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const partySummary = String(params.partySummary || '').trim()
  const sizeHint = String(params.sizeHint || '5-9').trim()

  const userPrompt = [
    '【任务】生成掌机 RPG 地下城地图用的 tileCatalog（像素地形素材）JSON。',
    `【楼层】${floor}`,
    `【地图尺寸范围】${sizeHint}`,
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    partySummary ? `【队伍】${partySummary}` : '',
    '要求：给出随机主题、地图尺寸、tileCatalog（地形属性+像素素材）。',
    'tileCatalog 每个地形必须包含 passable/weight/palette/pixels16（16x16，字符索引）。',
    'tileCatalog 必须每次重新设计，不要沿用固定地板模板或固定命名。',
    '不要生成 monster/boss/treasure 的坐标与数值配置，遭遇点由前端算法生成。',
    '只返回 JSON 对象。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_DUNGEON_MAP_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? 1900,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '地下城地图生成失败',
      map: null,
    }
  }

  const parsed = normalizeHandheldDungeonMap(parseFirstJsonObject(result.data), {
    floor,
    sizeHint,
  })
  if (!parsed) {
    return {
      success: false,
      error: '地下城地图解析失败',
      map: null,
    }
  }

  return {
    success: true,
    error: null,
    map: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

export const generateHandheldDungeonScene = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      scene: null,
    }
  }

  const floor = clampInt(params.floor, 1, 999, 1)
  const eventTypeHint = normalizeDungeonSceneEventType(params.eventTypeHint, floor % 5 === 0 ? 'boss' : 'battle')
  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const sceneName = String(params.sceneName || '').trim()
  const partySummary = String(params.partySummary || '').trim()

  const userPrompt = [
    '【任务】生成掌机 RPG 地下城的单次事件 JSON。',
    `【楼层】${floor}`,
    `【事件倾向】${eventTypeHint}`,
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    sceneName ? `【当前场景】${sceneName}` : '',
    partySummary ? `【队伍】${partySummary}` : '',
    '要求：短文本，可玩性优先，数值不要离谱。',
    '只返回 JSON 对象。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_DUNGEON_SCENE_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.84,
    maxTokens: params.options?.maxTokens ?? 360,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '地下城事件生成失败',
      scene: null,
    }
  }

  const parsed = normalizeHandheldDungeonScene(parseFirstJsonObject(result.data), { floor, eventTypeHint })
  if (!parsed) {
    return {
      success: false,
      error: '地下城事件解析失败',
      scene: null,
    }
  }

  return {
    success: true,
    error: null,
    scene: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

export const generateHandheldDungeonBanter = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      line: '',
    }
  }

  const teammateName = String(params.teammateName || '队友').trim() || '队友'
  const teammateRole = String(params.teammateRole || '冒险者').trim()
  const teammateRarity = normalizeDungeonSceneRarity(params.teammateRarity, 'R')
  const floor = clampInt(params.floor, 1, 999, 1)
  const scene = String(params.scene || '').trim().slice(0, 40)
  const moodHint = String(params.moodHint || '').trim().slice(0, 36)

  const userPrompt = [
    '【任务】生成一条队友吐槽台词。',
    `【队友】${teammateName}`,
    `【职业】${teammateRole || '冒险者'}`,
    `【稀有度】${teammateRarity}`,
    `【楼层】${floor}`,
    scene ? `【当前场景】${scene}` : '',
    moodHint ? `【语气提示】${moodHint}` : '',
    '请只输出 JSON：{"line":"..."}',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_DUNGEON_BANTER_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? 120,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '队友吐槽生成失败',
      line: '',
    }
  }

  const line = normalizeHandheldDungeonBanterLine(result.data)
  if (!line) {
    return {
      success: false,
      error: '队友吐槽解析失败',
      line: '',
    }
  }

  return {
    success: true,
    error: null,
    line,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

export const generateHandheldCampfireCompanions = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      companions: [],
    }
  }

  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const hints = Array.isArray(params.characterHints)
    ? params.characterHints
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, HANDHELD_CAMPFIRE_COMPANION_MAX)
    : []
  const companionCount = clampInt(
    params.companionCount,
    1,
    HANDHELD_CAMPFIRE_COMPANION_MAX,
    Math.min(HANDHELD_CAMPFIRE_COMPANION_MAX, Math.max(1, hints.length || 4)),
  )

  const userPrompt = [
    '【任务】为掌机 RPG 的篝火首页生成像素风角色小队设定 JSON。',
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    hints.length > 0 ? `【角色候选】${hints.join('；')}` : '',
    hints.length > 0 ? '【候选格式】名字|身份|外观与设定提示（请强依赖外观描述映射风格与动作）' : '',
    `【人数】${companionCount}`,
    '每名角色必须返回 role，且要根据角色背景/身份/性格自动命名职业，不要套固定职业列表。',
    'companions 数组长度必须严格等于人数。',
    '请直接输出 JSON 对象，不要补充解释。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_CAMPFIRE_COMPANION_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.82,
    maxTokens: params.options?.maxTokens ?? 380,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '篝火角色设定生成失败',
      companions: [],
    }
  }

  const fallbackNames = hints
    .map((item) => {
      const name = String(item.split('|')[0] || '').trim()
      return name.slice(0, 12)
    })
    .filter(Boolean)
    .slice(0, companionCount)

  const fallbackRoles = hints
    .map((item, index) => {
      const rawRole = String(item.split('|')[1] || '').trim()
      return normalizeClassicClassRole(rawRole, index, item)
    })
    .slice(0, companionCount)

  const parsed = normalizeHandheldCampfireCompanions(parseFirstJsonObject(result.data), fallbackNames, fallbackRoles)
  if (!parsed) {
    return {
      success: false,
      error: '篝火角色设定解析失败',
      companions: [],
    }
  }

  return {
    success: true,
    error: null,
    companions: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const WORLDBOOK_OPENING_SYSTEM_PROMPT = `你是“AVG世界书开场对白生成器”。
你只输出 JSON，不要输出 markdown，不要解释。

输出格式必须是：
{
  "openingDialogue": [
    { "speaker": "旁白", "text": "......", "emotion": null },
    { "speaker": "角色名", "text": "......", "emotion": "neutral" }
  ]
}

硬性要求：
1) openingDialogue 必须是 10-15 条。
2) 每条必须包含 speaker 与 text；emotion 可为 null 或常见情绪英文词（如 neutral/happy/worried/angry/sad/excited/confident）。
3) 文本为中文自然叙事，单条建议 12-80 字。
4) 对白必须显著依赖给定世界书（世界观、角色、user设定），不能写成通用模板。
5) 不要包含多余字段，不要输出 JSON 以外的任何内容。`

const parseFirstJsonArray = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  let parsed = parseJson(candidate)
  if (Array.isArray(parsed)) return parsed

  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  if (start >= 0 && end > start) {
    parsed = parseJson(candidate.slice(start, end + 1))
    if (Array.isArray(parsed)) {
      return parsed
    }
  }

  return null
}

const normalizeWorldBookOpeningDialogue = (rawValue, options = {}) => {
  const minLines = clampInt(options.minLines, 1, 50, 10)
  const maxLines = clampInt(options.maxLines, minLines, 80, 15)
  const sourceList = Array.isArray(rawValue)
    ? rawValue
    : (Array.isArray(rawValue?.openingDialogue) ? rawValue.openingDialogue : [])
  const normalized = sourceList
    .map((line) => ({
      speaker: String(line?.speaker || '旁白').trim() || '旁白',
      text: String(line?.text || '').trim(),
      emotion: line?.emotion || null,
    }))
    .filter((line) => line.text)
    .slice(0, maxLines)

  if (normalized.length < minLines) {
    return null
  }

  return normalized
}

export const generateWorldBookOpeningDialogue = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      openingDialogue: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : {}
  const minLines = clampInt(params.minLines, 10, 15, 10)
  const maxLines = clampInt(params.maxLines, minLines, 15, 15)
  const worldTitle = String(worldBook?.title || params.worldTitle || '未命名世界书').trim()
  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const worldEntries = worldBook?.entries && typeof worldBook.entries === 'object' ? worldBook.entries : {}
  const entryLines = Object.entries(worldEntries)
    .map(([key, value]) => {
      const text = String(value || '').trim()
      if (!text) return ''
      return `- ${String(key)}: ${text}`
    })
    .filter(Boolean)
    .slice(0, 12)

  const userProfile = worldBook?.userProfile && typeof worldBook.userProfile === 'object'
    ? worldBook.userProfile
    : {}
  const userProfileLines = [
    `名字: ${String(userProfile.name || userProfile.nickname || '你').trim() || '你'}`,
    String(userProfile.identity || '').trim() ? `身份: ${String(userProfile.identity).trim()}` : '',
    String(userProfile.appearance || '').trim() ? `外表: ${String(userProfile.appearance).trim()}` : '',
    String(userProfile.background || '').trim() ? `背景: ${String(userProfile.background).trim()}` : '',
  ]
    .filter(Boolean)
    .slice(0, 6)

  const characterLines = (Array.isArray(worldBook?.characters) ? worldBook.characters : [])
    .map((char, index) => {
      const name = String(char?.name || char?.nickname || `角色${index + 1}`).trim() || `角色${index + 1}`
      const identity = String(char?.identity || '').trim()
      const appearance = String(char?.appearance || '').trim()
      const background = String(char?.background || '').trim()
      return [
        `角色${index + 1}: ${name}`,
        identity ? `身份=${identity}` : '',
        appearance ? `外表=${appearance}` : '',
        background ? `背景=${background}` : '',
      ].filter(Boolean).join(' | ')
    })
    .filter(Boolean)
    .slice(0, 16)

  const userPrompt = [
    '【任务】根据下面世界书信息生成游戏开场对白。',
    `【条数要求】${minLines}-${maxLines} 条`,
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界书摘要】${worldSummary}` : '',
    entryLines.length > 0 ? `【世界条目】\n${entryLines.join('\n')}` : '',
    userProfileLines.length > 0 ? `【User设定】\n${userProfileLines.join('\n')}` : '',
    characterLines.length > 0 ? `【角色设定】\n${characterLines.join('\n')}` : '',
    '要求：开场应有叙述推进与人物互动，逻辑自然，可直接作为新游戏前 10-15 句台词。',
    '请严格返回 JSON 对象，字段仅为 openingDialogue。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: WORLDBOOK_OPENING_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.84,
    maxTokens: params.options?.maxTokens ?? 1500,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '开场白生成失败',
      openingDialogue: [],
    }
  }

const parsedObject = parseFirstJsonObject(result.data)
const parsedArray = parseFirstJsonArray(result.data)
const normalized = normalizeWorldBookOpeningDialogue(
  parsedObject?.openingDialogue ? parsedObject : parsedArray,
    { minLines, maxLines },
  )

  if (!normalized) {
    return {
      success: false,
      error: '开场白解析失败（返回结果不符合 10-15 句格式）',
      openingDialogue: [],
      data: result.data,
      rawResponse: result.rawResponse,
    }
  }

  return {
    success: true,
    error: null,
    openingDialogue: normalized,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

// 卧室家具生成
const BEDROOM_FURNITURE_SYSTEM_PROMPT = `你是“像素风卧室家具素材生成器”。
你只输出 JSON，不要输出 markdown，不要解释。

输出格式必须是：
{
  "items": [
    {
      "name": "家具名称",
      "kind": "floor|sleep|storage|decor|utility",
      "width": 1-4,
      "height": 1-4,
      "z": 0-60,
      "walkable": true 或 false,
      "desc": "简短描述",
      "spriteTemplate": {
        "w": 16,
        "h": 16,
        "palette": {
          "a": "#7a5a3a",
          "b": "#c89f72",
          "g": "#efe2c2"
        },
        "rows": [
          "................",
          "....aaaabbbb....",
          "...(共 h 行，每行长度 = w)"
        ]
      }
    }
  ]
}

要求：
1. items 数组长度建议为 3-6。
2. 至少包含 1 个 floor 或 sleep 类家具。
3. 不同 kind 的家具尽量混搭，避免重复。
4. 像素风，描述简短，适合奇幻冒险营地卧室。
5. 每件必须提供 spriteTemplate；w/h 范围 8-24。
6. rows 只允许字符 "." 或 palette 中定义的单字符 token（建议 a/b/c/g 等小写字母）。
7. palette 的颜色值只能是 #RGB 或 #RRGGBB。
8. 不同家具的 spriteTemplate 要明显不同，避免重复或轻微改色。`

const BEDROOM_FURNITURE_KIND_SET = new Set(['floor', 'sleep', 'storage', 'decor', 'utility'])
const BEDROOM_SPRITE_MOTIF_SET = new Set(['tile', 'rug', 'bed', 'sofa', 'desk', 'table', 'chair', 'cabinet', 'shelf', 'plant', 'lamp', 'window', 'chest', 'screen'])
const BEDROOM_SPRITE_PALETTE_SET = new Set(['oak', 'pine', 'walnut', 'mint', 'sky', 'rose', 'stone', 'violet'])
const BEDROOM_SPRITE_SILHOUETTE_SET = new Set(['compact', 'wide', 'tall', 'low'])
const BEDROOM_SPRITE_ORNAMENT_SET = new Set(['none', 'border', 'cushion', 'drawer', 'leaf', 'rune'])
const BEDROOM_SPRITE_MOTIFS_BY_KIND = {
  floor: ['tile', 'rug'],
  sleep: ['bed', 'sofa'],
  storage: ['cabinet', 'shelf', 'chest'],
  decor: ['plant', 'lamp', 'window', 'screen'],
  utility: ['desk', 'table', 'chair'],
}
const BEDROOM_SPRITE_PALETTES_BY_KIND = {
  floor: ['oak', 'pine', 'stone'],
  sleep: ['walnut', 'rose', 'mint'],
  storage: ['oak', 'walnut', 'stone'],
  decor: ['mint', 'sky', 'violet'],
  utility: ['oak', 'pine', 'sky'],
}

const BEDROOM_TEMPLATE_TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const BEDROOM_TEMPLATE_TOKEN_SET = new Set(BEDROOM_TEMPLATE_TOKEN_ALPHABET.split(''))
const BEDROOM_TEMPLATE_MAX_COLORS = 12
const BEDROOM_TEMPLATE_FALLBACK_PALETTE = {
  a: '#7a5a3a',
  b: '#c89f72',
  g: '#efe2c2',
}

const isValidBedroomTemplateColor = (value) => {
  const text = String(value || '').trim()
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(text)
}

const sanitizeBedroomSpriteTemplate = (rawValue) => {
  if (!rawValue || typeof rawValue !== 'object') return null
  const width = clampInt(rawValue?.w ?? rawValue?.width, 8, 24, 16)
  const height = clampInt(rawValue?.h ?? rawValue?.height, 8, 24, 16)

  const paletteSource = rawValue?.palette && typeof rawValue.palette === 'object' ? rawValue.palette : {}
  const palette = {}
  const paletteEntries = Object.entries(paletteSource)
  for (let i = 0; i < paletteEntries.length; i += 1) {
    if (Object.keys(palette).length >= BEDROOM_TEMPLATE_MAX_COLORS) break
    const [tokenRaw, colorRaw] = paletteEntries[i]
    const token = String(tokenRaw || '').trim().slice(0, 1).toLowerCase()
    if (!token || token === '.' || !BEDROOM_TEMPLATE_TOKEN_SET.has(token) || palette[token]) continue
    if (!isValidBedroomTemplateColor(colorRaw)) continue
    palette[token] = String(colorRaw).trim()
  }
  if (Object.keys(palette).length < 1) {
    Object.assign(palette, BEDROOM_TEMPLATE_FALLBACK_PALETTE)
  }

  let rowsRaw = []
  if (Array.isArray(rawValue?.rows)) {
    rowsRaw = rawValue.rows
  } else if (typeof rawValue?.rows === 'string') {
    rowsRaw = rawValue.rows.split(/\r?\n/g)
  } else if (typeof rawValue?.pixels === 'string') {
    rowsRaw = rawValue.pixels.split(/\r?\n/g)
  }
  if (rowsRaw.length < 1) return null

  const validTokens = new Set(['.', ...Object.keys(palette)])
  const normalizedRows = rowsRaw
    .slice(0, height)
    .map((line) => {
      const rawLine = String(line || '').toLowerCase()
      let next = ''
      for (let i = 0; i < width; i += 1) {
        const token = rawLine[i] || '.'
        next += validTokens.has(token) ? token : '.'
      }
      return next
    })

  while (normalizedRows.length < height) {
    normalizedRows.push('.'.repeat(width))
  }

  const hasVisible = normalizedRows.some((line) => {
    for (let i = 0; i < line.length; i += 1) {
      const token = line[i]
      if (token === '.') continue
      if (palette[token]) return true
    }
    return false
  })
  if (!hasVisible) return null

  return {
    w: width,
    h: height,
    palette,
    rows: normalizedRows,
  }
}

const sanitizeBedroomSpriteSpec = (rawValue, kind = 'decor', index = 0) => {
  const motifFallbackList = BEDROOM_SPRITE_MOTIFS_BY_KIND[kind] || BEDROOM_SPRITE_MOTIFS_BY_KIND.decor
  const paletteFallbackList = BEDROOM_SPRITE_PALETTES_BY_KIND[kind] || BEDROOM_SPRITE_PALETTES_BY_KIND.decor
  const fallback = {
    motif: motifFallbackList[index % motifFallbackList.length] || 'table',
    palette: paletteFallbackList[index % paletteFallbackList.length] || 'oak',
    silhouette: ['compact', 'wide', 'tall', 'low'][index % 4],
    ornament: ['none', 'border', 'cushion', 'drawer', 'leaf', 'rune'][index % 6],
    glow: kind === 'decor' ? 1 : 0,
    seed: Math.max(0, Math.min(999999, (index + 3) * 6151)),
  }

  const value = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const motifRaw = String(value.motif || '').trim().toLowerCase()
  const paletteRaw = String(value.palette || '').trim().toLowerCase()
  const silhouetteRaw = String(value.silhouette || '').trim().toLowerCase()
  const ornamentRaw = String(value.ornament || '').trim().toLowerCase()
  const glowRaw = String(value.glow ?? '').trim().toLowerCase()
  const hasGlowInput = glowRaw !== ''
  const glowParsed = hasGlowInput && (glowRaw === '1' || glowRaw === 'true' || glowRaw === 'yes') ? 1 : 0
  const seed = Number.isFinite(Number(value.seed))
    ? Math.max(0, Math.min(999999, Math.round(Number(value.seed))))
    : fallback.seed

  return {
    motif: BEDROOM_SPRITE_MOTIF_SET.has(motifRaw) ? motifRaw : fallback.motif,
    palette: BEDROOM_SPRITE_PALETTE_SET.has(paletteRaw) ? paletteRaw : fallback.palette,
    silhouette: BEDROOM_SPRITE_SILHOUETTE_SET.has(silhouetteRaw) ? silhouetteRaw : fallback.silhouette,
    ornament: BEDROOM_SPRITE_ORNAMENT_SET.has(ornamentRaw) ? ornamentRaw : fallback.ornament,
    glow: hasGlowInput ? glowParsed : fallback.glow,
    seed,
  }
}

const normalizeBedroomFurnitureItems = (rawData) => {
  if (!rawData || typeof rawData !== 'object') return null
  const items = Array.isArray(rawData.items) ? rawData.items : []
  if (items.length < 1) return null

  return items
    .slice(0, 8)
    .map((item, index) => {
      const kindRaw = String(item?.kind || '').trim().toLowerCase()
      const kind = BEDROOM_FURNITURE_KIND_SET.has(kindRaw) ? kindRaw : 'decor'
      const width = clampInt(item?.width, 1, 4, kind === 'floor' ? 3 : 2)
      const height = clampInt(item?.height, 1, 4, kind === 'floor' ? 2 : (kind === 'sleep' ? 2 : 1))
      const z = clampInt(item?.z, 0, 60, kind === 'floor' ? 0 : 8 + index * 2)
      const walkable = typeof item?.walkable === 'boolean'
        ? item.walkable
        : kind === 'floor' || kind === 'decor'
      const name = String(item?.name || `家具${index + 1}`).trim().slice(0, 18)
      return {
        name: name || `家具${index + 1}`,
        kind,
        width,
        height,
        z,
        walkable,
        desc: String(item?.desc || '').trim().slice(0, 60),
        spriteTemplate: sanitizeBedroomSpriteTemplate(item?.spriteTemplate),
        spriteSpec: sanitizeBedroomSpriteSpec(item?.spriteSpec, kind, index),
      }
    })
    .filter(Boolean)
}

export const generateBedroomFurnitureItems = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      items: [],
    }
  }

  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const floor = Math.max(1, Number(params.floor) || 1)
  const styleHint = String(params.styleHint || '像素风冒险者卧室').trim().slice(0, 120)
  const itemCount = clampInt(params.itemCount, 1, 8, 4)

  const userPrompt = [
    `【任务】生成 ${itemCount} 件卧室家具数据，供前端像素网格摆放。`,
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【当前楼层】${floor}`,
    `【风格提示】${styleHint}`,
    '请保证有可用于地面的元素（floor 或 rug/tile）以及可交互家具。',
    '每件家具都要提供 spriteTemplate，确保 rows 与 w/h 一致。',
    '请直接输出 JSON 对象，不要补充解释。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: BEDROOM_FURNITURE_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.88,
    maxTokens: params.options?.maxTokens ?? 1800,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '卧室家具生成失败',
      items: [],
    }
  }

  const parsed = normalizeBedroomFurnitureItems(parseFirstJsonObject(result.data))
  if (!parsed || parsed.length === 0) {
    return {
      success: false,
      error: '卧室家具解析失败',
      items: [],
      data: result.data,
      rawResponse: result.rawResponse,
    }
  }

  return {
    success: true,
    error: null,
    items: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

// 流浪商人商品生成
const MERCHANT_ITEMS_SYSTEM_PROMPT = `你是"流浪商人商品生成器"。
你只输出 JSON，不要输出 markdown，不要解释。

输出格式必须是：
{
  "items": [
    {
      "name": "装备名称",
      "rarity": "R|SR|SSR",
      "slot": "weapon|armor|relic",
      "atk": 0-999,
      "def": 0-999,
      "hp": 0-9999,
      "price": 50-9999,
      "desc": "简短描述",
      "spriteSpec": {
        "motif": "blade|axe|spear|shield|armor|helm|ring|orb|amulet",
        "palette": "iron|frost|jade|royal|ember|obsidian",
        "silhouette": "slim|wide|spike|round",
        "ornament": "none|rune|gem|wing|chain",
        "glow": 0,
        "seed": 0-999999
      }
    }
  ]
}

要求：
1. items 数组长度必须为 6
2. rarity 分布：R 约 70%，SR 约 25%，SSR 约 5%
3. slot 分布：weapon、armor、relic 各约 1/3
4. 属性值根据稀有度递增：R < SR < SSR
5. 价格根据稀有度和属性合理定价
6. 名称要有创意，符合奇幻RPG风格
7. 描述简短有趣，体现装备特点
8. 每件商品都必须提供 spriteSpec，且字段值只能从枚举中选择
9. 武器优先使用 blade|axe|spear，护甲优先使用 shield|armor|helm，饰品优先使用 ring|orb|amulet`

const MERCHANT_SPRITE_MOTIF_SET = new Set(['blade', 'axe', 'spear', 'shield', 'armor', 'helm', 'ring', 'orb', 'amulet'])
const MERCHANT_SPRITE_PALETTE_SET = new Set(['iron', 'frost', 'jade', 'royal', 'ember', 'obsidian'])
const MERCHANT_SPRITE_SILHOUETTE_SET = new Set(['slim', 'wide', 'spike', 'round'])
const MERCHANT_SPRITE_ORNAMENT_SET = new Set(['none', 'rune', 'gem', 'wing', 'chain'])
const MERCHANT_SPRITE_MOTIFS_BY_SLOT = {
  weapon: ['blade', 'axe', 'spear'],
  armor: ['shield', 'armor', 'helm'],
  relic: ['ring', 'orb', 'amulet'],
}
const MERCHANT_SPRITE_PALETTES_BY_RARITY = {
  R: ['iron', 'frost'],
  SR: ['jade', 'royal'],
  SSR: ['ember', 'obsidian'],
}

const sanitizeMerchantSpriteSpec = (rawValue, rarity = 'R', slot = 'weapon', index = 0) => {
  const motifFallbackList = MERCHANT_SPRITE_MOTIFS_BY_SLOT[slot] || MERCHANT_SPRITE_MOTIFS_BY_SLOT.weapon
  const paletteFallbackList = MERCHANT_SPRITE_PALETTES_BY_RARITY[rarity] || MERCHANT_SPRITE_PALETTES_BY_RARITY.R
  const fallbackSeed = Math.max(0, Math.min(999999, (index + 1) * 7919))
  const fallback = {
    motif: motifFallbackList[index % motifFallbackList.length] || 'blade',
    palette: paletteFallbackList[index % paletteFallbackList.length] || 'iron',
    silhouette: ['slim', 'wide', 'spike', 'round'][index % 4],
    ornament: ['none', 'rune', 'gem', 'wing', 'chain'][index % 5],
    glow: rarity === 'SSR' ? 1 : 0,
    seed: fallbackSeed,
  }

  const value = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const motifRaw = String(value.motif || '').trim().toLowerCase()
  const paletteRaw = String(value.palette || '').trim().toLowerCase()
  const silhouetteRaw = String(value.silhouette || '').trim().toLowerCase()
  const ornamentRaw = String(value.ornament || '').trim().toLowerCase()
  const glowRaw = String(value.glow ?? '').trim().toLowerCase()

  const hasGlowInput = glowRaw !== ''
  const glowParsed = hasGlowInput && (glowRaw === '1' || glowRaw === 'true' || glowRaw === 'yes') ? 1 : 0
  const seed = Number.isFinite(Number(value.seed))
    ? Math.max(0, Math.min(999999, Math.round(Number(value.seed))))
    : fallback.seed

  return {
    motif: MERCHANT_SPRITE_MOTIF_SET.has(motifRaw) ? motifRaw : fallback.motif,
    palette: MERCHANT_SPRITE_PALETTE_SET.has(paletteRaw) ? paletteRaw : fallback.palette,
    silhouette: MERCHANT_SPRITE_SILHOUETTE_SET.has(silhouetteRaw) ? silhouetteRaw : fallback.silhouette,
    ornament: MERCHANT_SPRITE_ORNAMENT_SET.has(ornamentRaw) ? ornamentRaw : fallback.ornament,
    glow: hasGlowInput ? glowParsed : fallback.glow,
    seed,
  }
}

const normalizeMerchantItems = (rawData, fallbackItems = []) => {
  if (!rawData || typeof rawData !== 'object') return null
  const items = Array.isArray(rawData.items) ? rawData.items : []
  if (items.length === 0) return null

  return items.slice(0, 6).map((item, index) => {
    const rarity = String(item?.rarity || 'R').toUpperCase()
    const slot = String(item?.slot || 'weapon').toLowerCase()
    const name = String(item?.name || `商品${index + 1}`).trim().slice(0, 18)
    const normalizedRarity = ['R', 'SR', 'SSR'].includes(rarity) ? rarity : 'R'
    const normalizedSlot = ['weapon', 'armor', 'relic'].includes(slot) ? slot : 'weapon'
    
    return {
      name,
      rarity: normalizedRarity,
      slot: normalizedSlot,
      atk: Math.max(0, Math.min(999, Number(item?.atk) || 0)),
      def: Math.max(0, Math.min(999, Number(item?.def) || 0)),
      hp: Math.max(0, Math.min(9999, Number(item?.hp) || 0)),
      price: Math.max(50, Math.min(9999, Number(item?.price) || 50)),
      desc: String(item?.desc || '').trim().slice(0, 40),
      spriteSpec: sanitizeMerchantSpriteSpec(item?.spriteSpec, normalizedRarity, normalizedSlot, index),
    }
  })
}

export const generateMerchantItems = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      items: [],
    }
  }

  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const floor = Math.max(1, Number(params.floor) || 1)
  const playerLevel = Math.max(1, Number(params.playerLevel) || 1)

  const userPrompt = [
    '【任务】为流浪商人生成 6 件装备商品。',
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【当前楼层】${floor}`,
    `【玩家等级】${playerLevel}`,
    '请根据世界背景和玩家进度生成合适的装备。',
    '请直接输出 JSON 对象，不要补充解释。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: MERCHANT_ITEMS_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.85,
    maxTokens: params.options?.maxTokens ?? 900,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '商人商品生成失败',
      items: [],
    }
  }

  const parsed = normalizeMerchantItems(parseFirstJsonObject(result.data))
  if (!parsed || parsed.length === 0) {
    return {
      success: false,
      error: '商人商品解析失败',
      items: [],
      data: result.data,
      rawResponse: result.rawResponse,
    }
  }

  return {
    success: true,
    error: null,
    items: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}
