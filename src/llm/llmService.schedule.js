/**
 * llmService.schedule.js - 角色日程生成服务
 * 提供24小时日程LLM生成函数
 */
import { getValidatedActiveConfig, callChatCompletion } from './llmService.core.js'
import { resolvePrompt } from './promptRegistry.js'

/**
 * 将LLM原始响应写入本地日志文件（调试用，每次覆盖上一次）
 * 使用 Capacitor Filesystem（Android）或 localStorage（Web）存储
 */
async function logLLMResponse(characterName, rawResponse, parseSuccess) {
  const timestamp = new Date().toISOString()
  const separator = '='.repeat(60)
  const entry = [
    separator,
    `[${timestamp}] 角色: ${characterName} | 解析${parseSuccess ? '成功' : '失败'}`,
    separator,
    rawResponse,
    '',
  ].join('\n')

  // 尝试 Capacitor Filesystem（Android 原生环境）
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    // 确保目录存在
    try {
      await Filesystem.mkdir({ path: 'debug', directory: Directory.Documents, recursive: true })
    } catch {}
    await Filesystem.writeFile({
      path: 'debug/schedule-llm-responses.log',
      data: entry,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    return
  } catch {
    // Capacitor 不可用，回退到 localStorage
  }

  // localStorage 回退（覆盖写入）
  try {
    localStorage.setItem('schedule_llm_debug_log', entry)
  } catch (e) {
    console.warn('[Schedule] 写入LLM响应日志失败:', e.message)
  }
}

/**
 * 剥离 <thinking>...</thinking> 标签及其内容
 */
function stripThinkingTags(content) {
  return content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()
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
  // 优先使用世界书中已有的地点，最多 8 个
  const sceneText = scenes.slice(0, 8).map(s => {
    const name = String(s?.name || '').trim()
    const desc = String(s?.description || '').trim()
    if (!name) return ''
    return desc ? `${name}（${desc.slice(0, 80)}）` : name
  }).filter(Boolean).join('\n- ')
  const sceneHint = sceneText ? `\n【已有地点】（请优先使用这些地点名称）\n- ${sceneText}` : ''

  // 寝室状态提示
  const dormHint = dormState
    ? `\n【当前关系】好感度:${dormState.affection}, 关系阶段:${dormState.relationshipStage || '陌生'}`
    : ''

  const userPrompt = [
    `【世界书】${worldTitle}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    eraText ? `【时代设定】${eraText}` : '',
    sceneHint,
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
    maxTokens: options.maxTokens ?? 2000,
    extraParams: options.extraParams,
  })

  if (!result.success) {
    // API调用失败也记录日志
    logLLMResponse(characterName, `API调用失败: ${result.error}`, false)
    return {
      success: false,
      error: result.error || '日程生成失败',
      schedule: null,
    }
  }

  // 剥离 <thinking>...</thinking> 标签后再解析
  const cleaned = stripThinkingTags(result.data)
  const parsed = parseScheduleXml(cleaned)
  const parseOk = !!(parsed && parsed.hourEntries && parsed.hourEntries.length >= 24)

  // 记录LLM原始响应到本地日志（包含解析结果）
  logLLMResponse(characterName, result.data, parseOk)

  if (!parseOk) {
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
 * 解析XML格式日程输出
 * 格式：
 * <schedule>
 *   <block hour="0" duration="6">
 *     <activity>sleep</activity>
 *     <label>睡觉</label>
 *     <desc>安静的睡眠</desc>
 *     <location id="home_bedroom">卧室</location>
 *   </block>
 * </schedule>
 */
function parseScheduleXml(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  // 提取 <block> 区块
  const blockRegex = /<block\s+hour="(\d+)"\s+duration="(\d+)"[^>]*>([\s\S]*?)<\/block>/gi
  const hourMap = new Map()

  let blockMatch
  while ((blockMatch = blockRegex.exec(raw)) !== null) {
    const startHour = parseInt(blockMatch[1], 10)
    const duration = parseInt(blockMatch[2], 10)
    const inner = blockMatch[3]

    if (!Number.isFinite(startHour) || startHour < 0 || startHour > 23) continue
    const dur = Math.max(1, Math.min(24, duration || 1))

    const activityType = extractXmlTag(inner, 'activity') || 'leisure'
    const activityLabel = extractXmlTag(inner, 'label') || ''
    const description = extractXmlTag(inner, 'desc') || ''
    const locationInfo = extractXmlLocation(inner)

    const blockId = `block_${startHour}_${Date.now()}`
    const isLocked = activityType === 'sleep' || activityType === 'mission'

    // 展开为duration个hour条目
    for (let i = 0; i < dur; i++) {
      const hour = (startHour + i) % 24
      if (hourMap.has(hour)) continue

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

  const hourEntries = Array.from(hourMap.values()).sort((a, b) => a.hour - b.hour)

  return {
    version: 2,
    hourEntries,
    generatedAt: new Date().toISOString(),
    hasCustomOverride: false,
  }
}

/**
 * 提取XML标签内容
 */
function extractXmlTag(content, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i')
  const match = content.match(regex)
  return match ? match[1].trim() : ''
}

/**
 * 提取地点信息 <location id="xxx">名称</location>
 */
function extractXmlLocation(content) {
  const regex = /<location\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/location>/i
  const match = content.match(regex)
  if (!match) return { id: '', name: '' }
  return { id: match[1].trim(), name: match[2].trim() }
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
