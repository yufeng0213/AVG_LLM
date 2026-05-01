// 小人心情系统引擎 - 类似 Rimworld 的心情条目系统

import {
  MOOD_BASE_VALUE,
  MOOD_MIN_VALUE,
  MOOD_MAX_VALUE,
  MOOD_THRESHOLD_VERY_HAPPY,
  MOOD_THRESHOLD_HAPPY,
  MOOD_THRESHOLD_NORMAL,
  MOOD_THRESHOLD_UNHAPPY,
  MOOD_THRESHOLD_BREAKDOWN,
  MOOD_THOUGHT_TYPE_ENVIRONMENT,
  MOOD_THOUGHT_TYPE_NEED,
  MOOD_THOUGHT_TYPE_SOCIAL,
  MOOD_THOUGHT_TYPE_WORK,
  MOOD_THOUGHT_TYPE_EVENT,
  NEED_MOOD_MAPPING,
  ENVIRONMENT_MOOD_FACTORS,
  EVENT_MOOD_TEMPLATES,
  MOOD_EFFECT_CONFIG,
} from '../../config/constants.js'

export const createPawnMoodEngine = (deps = {}) => {
  // ========== 心情计算 ==========

  /**
   * 计算小人当前心情值
   * @param {Object} pawn - 小人实例
   * @returns {number} 心情值 (0-100)
   */
  const calculateMoodValue = (pawn) => {
    if (!pawn) return MOOD_BASE_VALUE

    const thoughts = pawn.moodThoughts || []
    let totalModifier = 0

    for (const thought of thoughts) {
      totalModifier += thought.moodModifier || 0
    }

    const moodValue = MOOD_BASE_VALUE + totalModifier
    return Math.max(MOOD_MIN_VALUE, Math.min(MOOD_MAX_VALUE, moodValue))
  }

  /**
   * 获取心情分解信息
   * @param {Object} pawn - 小人实例
   * @returns {Object} { positive, negative, total }
   */
  const getMoodBreakdown = (pawn) => {
    const thoughts = pawn?.moodThoughts || []
    let positive = 0
    let negative = 0

    for (const thought of thoughts) {
      const mod = thought.moodModifier || 0
      if (mod > 0) positive += mod
      else if (mod < 0) negative += Math.abs(mod)
    }

    return {
      positive,
      negative,
      total: positive - negative,
    }
  }

  /**
   * 获取心情状态等级
   * @param {number} moodValue - 心情值
   * @returns {string} 'veryHappy' | 'happy' | 'normal' | 'unhappy' | 'breakdown'
   */
  const getMoodState = (moodValue) => {
    if (moodValue >= MOOD_THRESHOLD_VERY_HAPPY) return 'veryHappy'
    if (moodValue >= MOOD_THRESHOLD_HAPPY) return 'happy'
    if (moodValue >= MOOD_THRESHOLD_NORMAL) return 'normal'
    if (moodValue >= MOOD_THRESHOLD_UNHAPPY) return 'unhappy'
    return 'breakdown'
  }

  /**
   * 获取心情效果配置
   * @param {number} moodValue - 心情值
   * @returns {Object} 效果配置
   */
  const getMoodEffects = (moodValue) => {
    const state = getMoodState(moodValue)
    return MOOD_EFFECT_CONFIG[state] || MOOD_EFFECT_CONFIG.normal
  }

  // ========== 心情条目管理 ==========

  /**
   * 添加心情条目
   * @param {Object} pawn - 小人实例
   * @param {Object} thoughtData - 条目数据
   * @returns {Object} 创建的条目
   */
  const addMoodThought = (pawn, thoughtData) => {
    if (!pawn || !thoughtData) return null

    const thought = {
      id: thoughtData.id || `thought-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: thoughtData.type || MOOD_THOUGHT_TYPE_EVENT,
      label: thoughtData.label || '未知心情',
      moodModifier: thoughtData.moodModifier || 0,
      source: thoughtData.source || 'unknown',
      decayRate: thoughtData.decayRate || 0,
      duration: thoughtData.duration || null,
      addedAt: Date.now(),
    }

    // 检查是否已存在相同来源的条目
    const existingIndex = pawn.moodThoughts?.findIndex(t => t.source === thought.source)
    if (existingIndex >= 0 && thought.type !== MOOD_THOUGHT_TYPE_EVENT) {
      // 非事件类条目，替换旧的
      pawn.moodThoughts[existingIndex] = thought
    } else {
      // 新增条目
      if (!pawn.moodThoughts) pawn.moodThoughts = []
      pawn.moodThoughts.push(thought)
    }

    // 更新心情值
    pawn.mood = pawn.mood || { value: MOOD_BASE_VALUE }
    pawn.mood.value = calculateMoodValue(pawn)
    pawn.mood.breakdown = getMoodBreakdown(pawn)

    return thought
  }

  /**
   * 移除心情条目
   * @param {Object} pawn - 小人实例
   * @param {string} thoughtId - 条目ID
   * @returns {boolean} 是否成功移除
   */
  const removeMoodThought = (pawn, thoughtId) => {
    if (!pawn || !pawn.moodThoughts) return false

    const index = pawn.moodThoughts.findIndex(t => t.id === thoughtId)
    if (index < 0) return false

    pawn.moodThoughts.splice(index, 1)

    // 更新心情值
    pawn.mood.value = calculateMoodValue(pawn)
    pawn.mood.breakdown = getMoodBreakdown(pawn)

    return true
  }

  /**
   * 移除指定来源的心情条目
   * @param {Object} pawn - 小人实例
   * @param {string} source - 来源标识
   * @returns {boolean} 是否成功移除
   */
  const removeMoodThoughtBySource = (pawn, source) => {
    if (!pawn || !pawn.moodThoughts) return false

    const index = pawn.moodThoughts.findIndex(t => t.source === source)
    if (index < 0) return false

    pawn.moodThoughts.splice(index, 1)

    pawn.mood.value = calculateMoodValue(pawn)
    pawn.mood.breakdown = getMoodBreakdown(pawn)

    return true
  }

  /**
   * 更新心情条目的modifier值
   * @param {Object} pawn - 小人实例
   * @param {string} source - 来源标识
   * @param {number} newModifier - 新的modifier值
   * @returns {boolean} 是否成功更新
   */
  const updateMoodThoughtModifier = (pawn, source, newModifier) => {
    if (!pawn || !pawn.moodThoughts) return false

    const thought = pawn.moodThoughts.find(t => t.source === source)
    if (!thought) return false

    thought.moodModifier = newModifier

    // 如果modifier归零，移除条目（非持久类）
    if (newModifier === 0 && thought.decayRate >= 0) {
      return removeMoodThoughtBySource(pawn, source)
    }

    pawn.mood.value = calculateMoodValue(pawn)
    pawn.mood.breakdown = getMoodBreakdown(pawn)

    return true
  }

  // ========== 心情衰减 ==========

  /**
   * 衰减临时心情条目
   * @param {Object} pawn - 小人实例
   * @param {number} deltaTime - 时间增量（毫秒）
   */
  const decayMoodThoughts = (pawn, deltaTime = 1000) => {
    if (!pawn || !pawn.moodThoughts) return

    const now = Date.now()
    const toRemove = []

    for (const thought of pawn.moodThoughts) {
      // 只衰减有decayRate的条目
      if (thought.decayRate > 0) {
        // 时间衰减
        thought.moodModifier -= thought.decayRate * (deltaTime / 1000)

        // 持续时间衰减
        if (thought.duration && thought.addedAt) {
          if (now - thought.addedAt > thought.duration) {
            toRemove.push(thought.id)
            continue
          }
        }

        // modifier归零时移除
        if (thought.moodModifier <= 0) {
          toRemove.push(thought.id)
        }
      }
    }

    // 批量移除
    for (const id of toRemove) {
      removeMoodThought(pawn, id)
    }

    // 更新心情值
    pawn.mood.value = calculateMoodValue(pawn)
    pawn.mood.breakdown = getMoodBreakdown(pawn)
  }

  // ========== 需求→心情映射 ==========

  /**
   * 根据需求值更新心情条目
   * @param {Object} pawn - 小人实例
   */
  const updateNeedsMoodThoughts = (pawn) => {
    if (!pawn || !pawn.needs) return

    for (const [needType, mappingList] of Object.entries(NEED_MOOD_MAPPING)) {
      const needValue = pawn.needs[needType]?.value || 50

      // 找到对应的映射
      let matchedMapping = null
      for (const mapping of mappingList) {
        if (needValue <= mapping.max) {
          matchedMapping = mapping
          break
        }
      }

      if (!matchedMapping || matchedMapping.modifier === 0) {
        // 移除该需求的心情条目（如果存在）
        removeMoodThoughtBySource(pawn, `need_${needType}`)
        continue
      }

      // 添加或更新心情条目
      addMoodThought(pawn, {
        type: MOOD_THOUGHT_TYPE_NEED,
        label: matchedMapping.label,
        moodModifier: matchedMapping.modifier,
        source: `need_${needType}`,
        decayRate: 0, // 需求类不衰减，随需求值更新
        duration: null,
      })
    }
  }

  // ========== 环境→心情映射 ==========

  /**
   * 根据房间环境更新心情条目
   * @param {Object} pawn - 小人实例
   * @param {Object} room - 房间状态
   */
  const updateEnvironmentMoodThoughts = (pawn, room) => {
    if (!pawn || !room) return

    // 1. 计算拥挤度（小人密度）
    const pawnDensity = room.pawns?.length ? room.pawns.length / (room.width * room.height) : 0
    if (pawnDensity > ENVIRONMENT_MOOD_FACTORS.crowding.threshold) {
      addMoodThought(pawn, {
        type: MOOD_THOUGHT_TYPE_ENVIRONMENT,
        label: ENVIRONMENT_MOOD_FACTORS.crowding.label,
        moodModifier: ENVIRONMENT_MOOD_FACTORS.crowding.modifier,
        source: 'env_crowding',
        decayRate: 0,
        duration: null,
      })
    } else {
      removeMoodThoughtBySource(pawn, 'env_crowding')
    }

    // 2. 计算光照
    const lightLevel = room.lightLevel || 1.0
    if (lightLevel < ENVIRONMENT_MOOD_FACTORS.dark.threshold) {
      addMoodThought(pawn, {
        type: MOOD_THOUGHT_TYPE_ENVIRONMENT,
        label: ENVIRONMENT_MOOD_FACTORS.dark.label,
        moodModifier: ENVIRONMENT_MOOD_FACTORS.dark.modifier,
        source: 'env_dark',
        decayRate: 0,
        duration: null,
      })
    } else {
      removeMoodThoughtBySource(pawn, 'env_dark')
    }

    // 3. 计算装饰比例
    const decorCount = room.furniture?.filter(f => f.kind === 'decor').length || 0
    const totalFurniture = room.furniture?.length || 1
    const decorRatio = decorCount / totalFurniture
    if (decorRatio >= ENVIRONMENT_MOOD_FACTORS.beautiful.threshold) {
      addMoodThought(pawn, {
        type: MOOD_THOUGHT_TYPE_ENVIRONMENT,
        label: ENVIRONMENT_MOOD_FACTORS.beautiful.label,
        moodModifier: ENVIRONMENT_MOOD_FACTORS.beautiful.modifier,
        source: 'env_beautiful',
        decayRate: 0,
        duration: null,
      })
    } else {
      removeMoodThoughtBySource(pawn, 'env_beautiful')
    }

    // 4. 综合舒适度（基于comfort需求平均值）
    const avgComfort = pawn.needs?.comfort?.value || 50
    if (avgComfort >= ENVIRONMENT_MOOD_FACTORS.comfortable.threshold * 100) {
      addMoodThought(pawn, {
        type: MOOD_THOUGHT_TYPE_ENVIRONMENT,
        label: ENVIRONMENT_MOOD_FACTORS.comfortable.label,
        moodModifier: ENVIRONMENT_MOOD_FACTORS.comfortable.modifier,
        source: 'env_comfortable',
        decayRate: 0,
        duration: null,
      })
    } else {
      removeMoodThoughtBySource(pawn, 'env_comfortable')
    }

    // 更新心情值
    pawn.mood.value = calculateMoodValue(pawn)
    pawn.mood.breakdown = getMoodBreakdown(pawn)
  }

  // ========== 事件类心情 ==========

  /**
   * 添加事件类心情条目（使用模板）
   * @param {Object} pawn - 小人实例
   * @param {string} eventKey - 事件模板键
   * @param {Object} overrides - 覆盖参数
   */
  const addEventMoodThought = (pawn, eventKey, overrides = {}) => {
    const template = EVENT_MOOD_TEMPLATES[eventKey]
    if (!template) return null

    return addMoodThought(pawn, {
      type: MOOD_THOUGHT_TYPE_EVENT,
      label: overrides.label || template.label,
      moodModifier: overrides.moodModifier || template.modifier,
      source: `event_${eventKey}_${Date.now().toString(36)}`,
      decayRate: overrides.decayRate || (template.modifier > 0 ? 0.02 : 0.015), // 正面衰减慢，负面衰减稍快
      duration: overrides.duration || template.duration,
    })
  }

  // ========== 批量更新 ==========

  /**
   * 更新小人所有心情状态
   * @param {Object} pawn - 小人实例
   * @param {Object} room - 房间状态
   * @param {number} deltaTime - 时间增量
   */
  const updateAllMood = (pawn, room, deltaTime = 1000) => {
    // 1. 更新需求类
    updateNeedsMoodThoughts(pawn)

    // 2. 更新环境类
    updateEnvironmentMoodThoughts(pawn, room)

    // 3. 衰减临时条目
    decayMoodThoughts(pawn, deltaTime)

    // 4. 最终计算
    pawn.mood.value = calculateMoodValue(pawn)
    pawn.mood.breakdown = getMoodBreakdown(pawn)
    pawn.mood.state = getMoodState(pawn.mood.value)
    pawn.mood.effects = getMoodEffects(pawn.mood.value)
  }

  // ========== 初始化 ==========

  /**
   * 初始化小人心情状态，并随机生成一些心情条目
   * @param {Object} pawn - 小人实例
   */
  const initializeMood = (pawn) => {
    if (!pawn) return

    pawn.mood = {
      value: MOOD_BASE_VALUE,
      breakdown: { positive: 0, negative: 0, total: 0 },
      state: 'normal',
      effects: MOOD_EFFECT_CONFIG.normal,
    }

    pawn.moodThoughts = []

    // 随机生成初始心情条目
    generateRandomMoodThoughts(pawn)
  }

  /**
   * 为小人随机生成一些初始心情条目
   * @param {Object} pawn - 小人实例
   */
  const generateRandomMoodThoughts = (pawn) => {
    if (!pawn || !pawn.needs) return

    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
    const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)]

    // 1. 根据需求状态生成心情条目
    const needTypes = ['hunger', 'rest', 'comfort', 'joy', 'social', 'work_satisfaction']
    const needLabels = {
      hunger: '饮食',
      rest: '休息',
      comfort: '舒适',
      joy: '娱乐',
      social: '社交',
      work_satisfaction: '工作',
    }

    for (const needType of needTypes) {
      // 随机决定是否生成此需求的心情条目（50%概率）
      if (Math.random() > 0.5) continue

      const needValue = pawn.needs[needType]?.value ?? randomInt(30, 90)
      const mapping = NEED_MOOD_MAPPING[needType]
      if (!mapping) continue

      // 找到对应的心情条目
      const moodEntry = mapping.find(m => needValue <= m.max)
      if (!moodEntry || moodEntry.modifier === 0) continue

      // 添加心情条目
      pawn.moodThoughts.push({
        id: `thought-${needType}-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
        type: MOOD_THOUGHT_TYPE_NEED,
        source: needType,
        label: `${needLabels[needType]}: ${moodEntry.label}`,
        moodModifier: moodEntry.modifier,
        duration: randomInt(200, 600),  // 随机持续时间（秒）
        createdAt: Date.now(),
      })
    }

    // 2. 随机添加环境心情条目（30%概率）
    const envFactors = ['beautiful', 'comfortable', 'dark']
    const envLabels = {
      beautiful: '美观的房间布置',
      comfortable: '舒适的居住环境',
      dark: '光线稍暗',
    }

    for (const factor of envFactors) {
      if (Math.random() > 0.3) continue

      const factorConfig = ENVIRONMENT_MOOD_FACTORS[factor]
      if (!factorConfig) continue

      // 随机正或负
      const isPositive = factor === 'beautiful' || factor === 'comfortable'
      const modifier = isPositive ? Math.abs(factorConfig.modifier) : factorConfig.modifier

      pawn.moodThoughts.push({
        id: `thought-env-${factor}-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
        type: MOOD_THOUGHT_TYPE_ENVIRONMENT,
        source: `env_${factor}`,
        label: envLabels[factor] || factorConfig.label,
        moodModifier: modifier,
        duration: randomInt(300, 800),
        createdAt: Date.now(),
      })
    }

    // 3. 随机添加事件心情条目（40%概率）
    const eventTypes = ['good_sleep', 'social_chat', 'work_complete', 'ate_good', 'new_pawn']
    const positiveEvents = ['good_sleep', 'social_chat', 'work_complete', 'ate_good', 'new_pawn']
    const negativeEvents = ['bad_sleep', 'social_insult', 'work_fail', 'ate_bad']

    // 随机选择1-2个事件
    const eventCount = randomInt(1, 2)
    const allEvents = Math.random() > 0.3 ? positiveEvents : negativeEvents

    for (let i = 0; i < eventCount; i++) {
      const eventType = randomChoice(allEvents)
      const eventTemplate = EVENT_MOOD_TEMPLATES[eventType]
      if (!eventTemplate) continue

      pawn.moodThoughts.push({
        id: `thought-event-${eventType}-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
        type: MOOD_THOUGHT_TYPE_EVENT,
        source: `event_${eventType}`,
        label: eventTemplate.label,
        moodModifier: eventTemplate.modifier,
        duration: eventTemplate.duration + randomInt(-50, 50),
        createdAt: Date.now(),
      })
    }

    // 重新计算心情值
    pawn.mood.value = calculateMoodValue(pawn)
    pawn.mood.breakdown = getMoodBreakdown(pawn)
    pawn.mood.state = getMoodState(pawn.mood.value)
    pawn.mood.effects = getMoodEffects(pawn.mood.value)
  }

  // ========== 导出 ==========

  return {
    // 心情计算
    calculateMoodValue,
    getMoodBreakdown,
    getMoodState,
    getMoodEffects,

    // 条目管理
    addMoodThought,
    removeMoodThought,
    removeMoodThoughtBySource,
    updateMoodThoughtModifier,

    // 衰减
    decayMoodThoughts,

    // 需求/环境映射
    updateNeedsMoodThoughts,
    updateEnvironmentMoodThoughts,

    // 事件
    addEventMoodThought,

    // 批量更新
    updateAllMood,

    // 初始化
    initializeMood,
    generateRandomMoodThoughts,

    // 常量导出
    MOOD_THRESHOLD_VERY_HAPPY,
    MOOD_THRESHOLD_HAPPY,
    MOOD_THRESHOLD_NORMAL,
    MOOD_THRESHOLD_UNHAPPY,
    MOOD_THRESHOLD_BREAKDOWN,
  }
}

export default createPawnMoodEngine