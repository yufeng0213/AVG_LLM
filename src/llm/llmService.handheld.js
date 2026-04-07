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

const HANDHELD_DUNGEON_MAP_SYSTEM_PROMPT = `你是“掌机RPG地下城网格生成器”。
你只输出 JSON 对象，不要解释，不要 markdown。

输出格式：
{
  "theme":"地下城主题名",
  "width":7,
  "height":6,
  "start":{"x":0,"y":5},
  "exit":{"x":6,"y":0},
  "tiles":[
    {
      "x":2,
      "y":4,
      "type":"monster",
      "enemy":{
        "name":"腐骨战兵",
        "hp":180,
        "attack":26,
        "drops":[
          {"name":"小型回复瓶","effectType":"heal_hp","target":"ally","value":20,"amount":1,"desc":"恢复20点生命"}
        ]
      },
      "reward":{"coins":120,"gems":28,"exp":64,"equipmentChance":0.22}
    },
    {
      "x":4,
      "y":1,
      "type":"boss",
      "enemy":{
        "name":"断刃督军",
        "hp":560,
        "attack":52,
        "drops":[
          {"name":"王者回复药","effectType":"heal_hp","target":"ally","value":48,"amount":1,"desc":"恢复48点生命"}
        ]
      },
      "reward":{"coins":420,"gems":120,"exp":220,"equipmentChance":0.58}
    },
    {
      "x":1,
      "y":2,
      "type":"treasure",
      "reward":{"coins":150,"gems":36,"exp":50,"equipmentChance":0.2}
    }
  ]
}

硬性约束：
1) width/height 均为 5-9 的整数。
2) start/exit 必须在地图内，且不能重叠。
3) tiles 只能包含 type: "monster"|"boss"|"treasure"|"empty"。
4) 每层必须同时有 boss 与 monster，且至少 2 个 boss、6 个 monster。
5) 同一坐标最多 1 个 tile；不要占用 start/exit。
6) monster/boss 必须包含 enemy + reward；treasure 至少包含 reward。
7) enemy 必须包含 drops 数组，至少 1 条掉落；每条掉落含 name/effectType/target/value/amount/desc。
8) effectType 仅使用 "heal_hp"，target 仅使用 "ally"。
9) reward 的 equipmentChance 为 0-1 浮点数。
10) 数值要与楼层递增相关，但不要夸张。`

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

  const used = new Set([`${startX}:${startY}`, `${exit.x}:${exit.y}`])
  const tiles = []
  const monsterNames = ['洞窟狼', '骸骨兵', '腐沼蜥', '巡逻石像', '暗影潜伏者', '裂隙蠕虫']
  const bossNames = ['灰烬领主', '深井守门者', '幽冥主教', '巨械监工', '碎星骑士', '虚影女王']
  const monsterDropNames = ['小型回复瓶', '应急绷带', '草本药剂', '止痛药水']
  const bossDropNames = ['王者回复药', '圣愈药剂', '战地急救包', '炽焰回生药']

  const normalizeDrop = (rawDrop, isBoss = false, index = 0) => {
    const drop = rawDrop && typeof rawDrop === 'object' ? rawDrop : {}
    const fallbackValue = isBoss ? Math.round(42 + floor * 3) : Math.round(18 + floor * 2)
    const fallbackName = isBoss ? bossDropNames[index % bossDropNames.length] : monsterDropNames[index % monsterDropNames.length]
    const effectTypeRaw = String(drop.effectType || drop.type || drop.effect || '').trim().toLowerCase()
    const effectType = effectTypeRaw === 'heal_hp' ? 'heal_hp' : 'heal_hp'
    const targetRaw = String(drop.target || drop.targetType || '').trim().toLowerCase()
    const target = targetRaw === 'ally' ? 'ally' : 'ally'
    const value = clampInt(drop.value ?? drop.effectValue ?? drop.hp, 1, 9999, fallbackValue)
    const amount = clampInt(drop.amount ?? drop.count ?? drop.quantity, 1, 99, 1)
    const name = String(drop.name || fallbackName).trim().slice(0, 24) || fallbackName
    const desc = String(drop.desc || drop.description || `恢复${value}点生命`).trim().slice(0, 40) || `恢复${value}点生命`
    return {
      name,
      effectType,
      target,
      value,
      amount,
      desc,
    }
  }

  const normalizeEnemy = (rawEnemy, isBoss = false, index = 0) => {
    const enemy = rawEnemy && typeof rawEnemy === 'object' ? rawEnemy : {}
    const fallbackName = isBoss
      ? `${bossNames[index % bossNames.length]}`
      : `${monsterNames[index % monsterNames.length]}`
    const rawDrops = Array.isArray(enemy.drops)
      ? enemy.drops
      : (Array.isArray(enemy.dropItems) ? enemy.dropItems : [])
    const drops = (rawDrops.length > 0 ? rawDrops : [null])
      .map((item, dropIndex) => normalizeDrop(item, isBoss, index + dropIndex))
      .slice(0, 3)
    return {
      name: String(enemy.name || fallbackName).trim().slice(0, 24) || fallbackName,
      hp: clampInt(enemy.hp, 20, 999999, Math.round((isBoss ? 230 : 108) + floor * (isBoss ? 40 : 20))),
      attack: clampInt(enemy.attack, 6, 99999, Math.round((isBoss ? 34 : 17) + floor * (isBoss ? 4 : 2))),
      drops,
    }
  }

  const normalizeReward = (rawReward, isBoss = false) => {
    const reward = rawReward && typeof rawReward === 'object' ? rawReward : {}
    const chanceRaw = Number.parseFloat(String(reward.equipmentChance))
    return {
      coins: clampInt(reward.coins, 0, 999999, Math.round((isBoss ? 280 : 86) + floor * (isBoss ? 54 : 16))),
      gems: clampInt(reward.gems, 0, 999999, Math.round((isBoss ? 90 : 24) + floor * (isBoss ? 10 : 4))),
      exp: clampInt(reward.exp, 0, 999999, Math.round((isBoss ? 136 : 42) + floor * (isBoss ? 30 : 10))),
      equipmentChance: Number.isFinite(chanceRaw)
        ? Math.max(0, Math.min(1, chanceRaw))
        : (isBoss ? 0.56 : 0.2),
    }
  }

  const pushTile = (x, y, type, payload = {}) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    if (x < 0 || y < 0 || x >= width || y >= height) return false
    const key = `${x}:${y}`
    if (used.has(key)) return false
    used.add(key)
    tiles.push({
      x,
      y,
      type,
      ...payload,
    })
    return true
  }

  const rawTiles = Array.isArray(rawValue.tiles) ? rawValue.tiles : []
  let monsterCount = 0
  let bossCount = 0
  let treasureCount = 0

  for (const item of rawTiles) {
    const x = clampInt(item?.x, 0, width - 1, Number.NaN)
    const y = clampInt(item?.y, 0, height - 1, Number.NaN)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const type = normalizeDungeonMapTileType(item?.type, 'empty')
    if (type === 'boss') {
      const added = pushTile(x, y, type, {
        enemy: normalizeEnemy(item?.enemy, true, bossCount),
        reward: normalizeReward(item?.reward, true),
      })
      if (added) bossCount += 1
      continue
    }
    if (type === 'monster') {
      const added = pushTile(x, y, type, {
        enemy: normalizeEnemy(item?.enemy, false, monsterCount),
        reward: normalizeReward(item?.reward, false),
      })
      if (added) monsterCount += 1
      continue
    }
    if (type === 'treasure') {
      const added = pushTile(x, y, type, {
        reward: normalizeReward(item?.reward, false),
      })
      if (added) treasureCount += 1
      continue
    }
  }

  const pickFreePos = () => {
    const maxTry = width * height * 3
    for (let index = 0; index < maxTry; index += 1) {
      const x = clampInt(Math.random() * width, 0, width - 1, 0)
      const y = clampInt(Math.random() * height, 0, height - 1, 0)
      const key = `${x}:${y}`
      if (used.has(key)) continue
      return { x, y }
    }
    return null
  }

  const minBoss = Math.max(2, Math.min(3, Math.round(width * height * 0.08)))
  const minMonster = Math.max(6, Math.min(18, Math.round(width * height * 0.3)))
  const targetTreasure = Math.max(2, Math.min(7, Math.round(width * height * 0.1)))

  while (bossCount < minBoss) {
    const pos = pickFreePos()
    if (!pos) break
    const added = pushTile(pos.x, pos.y, 'boss', {
      enemy: normalizeEnemy(null, true, bossCount),
      reward: normalizeReward(null, true),
    })
    if (!added) break
    bossCount += 1
  }

  while (monsterCount < minMonster) {
    const pos = pickFreePos()
    if (!pos) break
    const added = pushTile(pos.x, pos.y, 'monster', {
      enemy: normalizeEnemy(null, false, monsterCount),
      reward: normalizeReward(null, false),
    })
    if (!added) break
    monsterCount += 1
  }

  while (treasureCount < targetTreasure) {
    const pos = pickFreePos()
    if (!pos) break
    const added = pushTile(pos.x, pos.y, 'treasure', {
      reward: normalizeReward(null, false),
    })
    if (!added) break
    treasureCount += 1
  }

  return {
    id: String(rawValue.id || `dungeon-map-f${floor}`).trim().slice(0, 80) || `dungeon-map-f${floor}`,
    floor,
    theme,
    width,
    height,
    start: { x: startX, y: startY },
    exit,
    player: { x: startX, y: startY },
    tiles,
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
    '【任务】生成掌机 RPG 地下城网格地图 JSON。',
    `【楼层】${floor}`,
    `【地图尺寸范围】${sizeHint}`,
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    partySummary ? `【队伍】${partySummary}` : '',
    '要求：给出随机主题、地图尺寸、小怪/Boss、血量、奖励配置；每层必须同时有 Boss 和小怪；每个怪都必须给 drops（至少1项，可直接用于背包消耗品）；可玩性优先，数值随楼层递增。',
    '只返回 JSON 对象。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_DUNGEON_MAP_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? 980,
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
