/**
 * llmService.schedule.js - 角色日程生成服务
 * 提供24小时日程LLM生成函数
 */
import { getValidatedActiveConfig, callChatCompletion } from './llmService.core.js'
import { resolvePrompt } from './promptRegistry.js'

// 活动类型到地点类型的映射
const ACTIVITY_LOCATION_TYPE_MAP = {
  sleep: 'home',
  meal: 'home',
  hygiene: 'home',
  work: 'work',
  study: 'school',
  class: 'school',
  training: 'work',
  social: 'outdoor',
  leisure: 'outdoor',
  hobby: 'home',
  mission: 'outdoor',
  appointment: 'outdoor',
  dorm_visit: 'home',
}

/**
 * 生成角色24小时日程
 * @param {Object} params
 * @returns {Promise<{success, schedule, error, rawResponse}>}
 */
export const generateCharacterSchedule = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      schedule: null,
    }
  }

  const {
    worldBook,
    character,
    scheduleDate,
    dormState = null,
    options = {},
  } = params

  // 构建角色摘要
  const characterName = String(character?.name || character?.nickname || '角色').trim()
  const characterIdentity = String(character?.identity || '').trim()
  const characterBackground = String(character?.background || '').trim()

  // 性格特征
  const personalityText = buildPersonalityText(character?.personalityProfile)
  const behaviorTags = Array.isArray(character?.personalityProfile?.behaviorTags)
    ? character?.personalityProfile.behaviorTags.join('、')
    : ''

  // 世界观摘要
  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const eraText = String(worldBook?.entries?.era || '').trim()

  // 场景/地点信息
  const scenes = Array.isArray(worldBook?.scenes) ? worldBook.scenes : []
  const sceneText = scenes.slice(0, 6).map(s => {
    const name = String(s?.name || '').trim()
    const desc = String(s?.description || '').trim()
    if (!name) return ''
    return desc ? `${name}（${desc.slice(0, 50)}）` : name
  }).filter(Boolean).join('、')

  // 寝室状态提示
  const dormHint = dormState
    ? `\n【当前关系】好感度:${dormState.affection}, 关系阶段:${dormState.relationshipStage || '陌生'}`
    : ''

  const userPrompt = [
    `【世界书】${worldTitle}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    eraText ? `【时代设定】${eraText}` : '',
    sceneText ? `【主要地点】${sceneText}` : '',
    `【角色】${characterName}`,
    characterIdentity ? `【身份/职业】${characterIdentity}` : '',
    characterBackground ? `【角色背景】${characterBackground.slice(0, 200)}` : '',
    personalityText ? `【性格特征】${personalityText}` : '',
    behaviorTags ? `【行为标签】${behaviorTags}` : '',
    dormHint,
    `【生成日期】${scheduleDate}`,
    '',
    `请为角色生成符合其身份和性格的24小时日程计划。`,
    `每个活动区块包含起始小时(hour=N)和持续时间(duration=D)，覆盖全天24小时。`,
  ].filter(Boolean).join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('schedule:daily_generation'),
    userPrompt,
    temperature: options.temperature ?? 0.75,
    maxTokens: options.maxTokens ?? 1200,
    extraParams: options.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '日程生成失败',
      schedule: null,
    }
  }

  // 解析分隔符格式输出
  const parsed = parseScheduleDelimiterOutput(result.data)

  if (!parsed || !parsed.hourEntries || parsed.hourEntries.length < 24) {
    return {
      success: false,
      error: '日程解析失败，请重试',
      schedule: null,
      rawResponse: result.data,
    }
  }

  return {
    success: true,
    schedule: parsed,
    rawResponse: result.data,
  }
}

/**
 * 构建性格特征文本
 */
function buildPersonalityText(personalityProfile) {
  if (!personalityProfile || typeof personalityProfile !== 'object') return ''

  const mbti = String(personalityProfile.mbti || '').trim()
  const dimensions = personalityProfile.cognitiveDimensions || {}

  if (!mbti && !dimensions) return ''

  const parts = []
  if (mbti) parts.push(`MBTI: ${mbti}`)

  if (dimensions && typeof dimensions === 'object') {
    const highDims = Object.entries(dimensions)
      .filter(([key, value]) => Number(value) >= 60)
      .map(([key]) => key)
    if (highDims.length > 0) {
      parts.push(`优势维度: ${highDims.join('、')}`)
    }
  }

  return parts.join('，')
}

/**
 * 解析分隔符输出（24小时格式）
 * 格式：
 * |hour=N|
 * |duration=D|
 * |activity=类型|
 * |label=名称|
 * |desc=描述|
 * |location=地点ID|地点名称|
 */
function parseScheduleDelimiterOutput(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  // 按 || 分割活动区块
  const blocks = raw.split(/^\s*\|\|\s*$/m).filter(Boolean)

  // 用Map跟踪已填充的小时 {hour: entry}
  const hourMap = new Map()

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)

    const hourMatch = lines.find(l => l.startsWith('|hour='))
    const durationMatch = lines.find(l => l.startsWith('|duration='))
    const activityMatch = lines.find(l => l.startsWith('|activity='))
    const labelMatch = lines.find(l => l.startsWith('|label='))
    const descMatch = lines.find(l => l.startsWith('|desc='))
    const locationMatch = lines.find(l => l.startsWith('|location='))

    if (!hourMatch) continue

    const startHour = parseInt(extractValue(hourMatch, 'hour='), 10)
    if (!Number.isFinite(startHour) || startHour < 0 || startHour > 23) continue

    const duration = Math.max(1, Math.min(24, parseInt(extractValue(durationMatch, 'duration='), 10) || 1))
    const activityType = extractValue(activityMatch, 'activity=') || 'leisure'
    const activityLabel = extractValue(labelMatch, 'label=') || ''
    const description = extractValue(descMatch, 'desc=') || ''
    const locationInfo = extractLocation(locationMatch)

    const blockId = `block_${startHour}_${Date.now()}`
    const isLocked = activityType === 'sleep' || activityType === 'mission'

    // 展开为duration个hour条目
    for (let i = 0; i < duration; i++) {
      const hour = (startHour + i) % 24
      if (hourMap.has(hour)) continue // 不覆盖已有条目

      hourMap.set(hour, {
        hour,
        plannedActivity: {
          activityType,
          activityLabel: activityLabel || getDefaultLabel(activityType),
          description: i === 0 ? description : '',
          locationId: locationInfo.id,
          locationName: locationInfo.name,
          blockId,
          isLocked,
        },
        executed: null,
        isCompleted: false,
        isCurrent: false,
      })
    }
  }

  // 填充未覆盖的小时为默认leisure
  for (let hour = 0; hour < 24; hour++) {
    if (!hourMap.has(hour)) {
      hourMap.set(hour, {
        hour,
        plannedActivity: {
          activityType: 'leisure',
          activityLabel: '空闲',
          description: '暂无安排',
          locationId: '',
          locationName: '',
          blockId: `block_default_${hour}`,
          isLocked: false,
        },
        executed: null,
        isCompleted: false,
        isCurrent: false,
      })
    }
  }

  // 转为数组并按hour排序
  const hourEntries = Array.from(hourMap.values()).sort((a, b) => a.hour - b.hour)

  return {
    version: 2,
    hourEntries,
    generatedAt: new Date().toISOString(),
    hasCustomOverride: false,
  }
}

/**
 * 获取活动类型的默认标签
 */
function getDefaultLabel(activityType) {
  const labels = {
    sleep: '睡觉', meal: '用餐', hygiene: '洗漱',
    work: '工作', study: '学习', class: '上课',
    training: '训练', social: '社交', leisure: '休闲',
    hobby: '爱好', mission: '任务', appointment: '约会',
    dorm_visit: '来访寝室',
  }
  return labels[activityType] || '活动'
}

/**
 * 提取分隔符值
 */
function extractValue(line, prefix) {
  if (!line) return ''
  const start = line.indexOf(prefix)
  if (start < 0) return ''
  const value = line.slice(start + prefix.length).replace(/\|$/, '').trim()
  return value
}

/**
 * 提取地点信息
 */
function extractLocation(locationMatch) {
  if (!locationMatch) return { id: '', name: '' }
  const start = locationMatch.indexOf('|location=')
  if (start < 0) return { id: '', name: '' }
  const content = locationMatch.slice(start + 10).replace(/\|$/, '').trim()

  // 格式: locationId|locationName
  const parts = content.split('|').map(p => p.trim())
  if (parts.length >= 2) {
    return { id: parts[0], name: parts[1] }
  }
  if (parts.length === 1 && parts[0]) {
    return { id: parts[0].toLowerCase().replace(/\s+/g, '_'), name: parts[0] }
  }
  return { id: '', name: '' }
}
