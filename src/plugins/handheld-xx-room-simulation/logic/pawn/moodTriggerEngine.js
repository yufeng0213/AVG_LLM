// 心情触发规则引擎 - 检测条件并自动添加/移除心情条目

import {
  TRIGGER_TYPES,
  CONDITION_OPERATORS,
  DEFAULT_MOOD_RULES,
  FURNITURE_MOOD_EFFECT_TEMPLATES,
  SOCIAL_MOOD_EFFECTS,
} from '../../config/moodRules.js'
import {
  MOOD_THOUGHT_TYPE_NEED,
  MOOD_THOUGHT_TYPE_ENVIRONMENT,
  MOOD_THOUGHT_TYPE_WORK,
  MOOD_THOUGHT_TYPE_EVENT,
  MOOD_THOUGHT_TYPE_SOCIAL,
} from '../../config/constants.js'

export const createMoodTriggerEngine = (deps = {}) => {
  const { moodEngine = null } = deps

  // 自定义规则存储
  let customRules = []
  let rulesEnabled = {}

  // ========== 规则管理 ==========

  /**
   * 获取所有规则（默认 + 自定义）
   */
  const getAllRules = () => {
    return [...DEFAULT_MOOD_RULES, ...customRules]
  }

  /**
   * 获取启用的规则
   */
  const getEnabledRules = () => {
    return getAllRules().filter(rule => rule.enabled && rulesEnabled[rule.id] !== false)
  }

  /**
   * 添加自定义规则
   */
  const addCustomRule = (rule) => {
    if (!rule || !rule.id) return null
    // 避免重复
    if (customRules.some(r => r.id === rule.id)) {
      return updateCustomRule(rule.id, rule)
    }
    customRules.push(rule)
    return rule
  }

  /**
   * 更新自定义规则
   */
  const updateCustomRule = (ruleId, updates) => {
    const index = customRules.findIndex(r => r.id === ruleId)
    if (index < 0) return null
    customRules[index] = { ...customRules[index], ...updates }
    return customRules[index]
  }

  /**
   * 删除自定义规则
   */
  const deleteCustomRule = (ruleId) => {
    const index = customRules.findIndex(r => r.id === ruleId)
    if (index < 0) return false
    customRules.splice(index, 1)
    return true
  }

  /**
   * 启用/禁用规则
   */
  const setRuleEnabled = (ruleId, enabled) => {
    rulesEnabled[ruleId] = enabled
  }

  /**
   * 清除所有自定义规则
   */
  const clearCustomRules = () => {
    customRules = []
  }

  // ========== 条件评估 ==========

  /**
   * 评估条件是否满足
   */
  const evaluateCondition = (condition, pawn, context = {}) => {
    if (!condition) return false

    const { needType, operator, value, timePhase, envType } = condition

    // 需求类条件
    if (needType) {
      const needValue = pawn?.needs?.[needType]?.value ?? 50
      return evaluateOperator(needValue, operator, value)
    }

    // 时间类条件
    if (timePhase) {
      const currentPhase = context.timePhase || 'morning'
      return currentPhase === timePhase
    }

    // 环境类条件
    if (envType) {
      const envValue = context[envType] ?? 1
      return evaluateOperator(envValue, operator, value)
    }

    return false
  }

  /**
   * 评估操作符
   */
  const evaluateOperator = (actual, operator, target) => {
    switch (operator) {
      case CONDITION_OPERATORS.LT: return actual < target
      case CONDITION_OPERATORS.LTE: return actual <= target
      case CONDITION_OPERATORS.GT: return actual > target
      case CONDITION_OPERATORS.GTE: return actual >= target
      case CONDITION_OPERATORS.EQ: return actual === target
      case CONDITION_OPERATORS.NEQ: return actual !== target
      default: return false
    }
  }

  // ========== 规则评估 ==========

  /**
   * 评估所有规则并更新心情条目
   */
  const evaluateRules = (pawn, context = {}) => {
    if (!pawn || !moodEngine) return

    const enabledRules = getEnabledRules()

    for (const rule of enabledRules) {
      const conditionMet = evaluateCondition(rule.condition, pawn, context)
      const hasThought = pawn.moodThoughts?.some(t => t.source === `rule:${rule.id}`)

      if (conditionMet && !hasThought) {
        // 条件满足且没有条目，添加
        addRuleThought(pawn, rule)
      } else if (!conditionMet && hasThought) {
        // 条件不满足且有条目，移除（仅限非永久条目）
        if (rule.moodEffect.duration !== -1) {
          moodEngine.removeMoodThoughtBySource(pawn, `rule:${rule.id}`)
        }
      }
    }

    // 重新计算心情值
    if (moodEngine.calculateMoodValue) {
      pawn.mood.value = moodEngine.calculateMoodValue(pawn)
      pawn.mood.breakdown = moodEngine.getMoodBreakdown(pawn)
      pawn.mood.state = moodEngine.getMoodState(pawn.mood.value)
    }
  }

  /**
   * 根据规则添加心情条目
   */
  const addRuleThought = (pawn, rule) => {
    if (!pawn || !rule || !moodEngine) return

    const thought = {
      id: `thought-rule-${rule.id}-${Date.now()}`,
      type: getThoughtTypeFromTrigger(rule.triggerType),
      source: `rule:${rule.id}`,
      ruleId: rule.id,
      label: rule.moodEffect.label,
      description: rule.moodEffect.description || '',
      moodModifier: rule.moodEffect.modifier,
      duration: rule.moodEffect.duration,
      icon: rule.moodEffect.icon || '',
      category: rule.moodEffect.category || 'neutral',
      createdAt: Date.now(),
    }

    moodEngine.addMoodThought(pawn, thought)
  }

  /**
   * 根据触发类型获取条目类型
   */
  const getThoughtTypeFromTrigger = (triggerType) => {
    switch (triggerType) {
      case TRIGGER_TYPES.NEED: return MOOD_THOUGHT_TYPE_NEED
      case TRIGGER_TYPES.ENVIRONMENT: return MOOD_THOUGHT_TYPE_ENVIRONMENT
      case TRIGGER_TYPES.WORK: return MOOD_THOUGHT_TYPE_WORK
      case TRIGGER_TYPES.SOCIAL: return MOOD_THOUGHT_TYPE_SOCIAL
      case TRIGGER_TYPES.TIME: return MOOD_THOUGHT_TYPE_ENVIRONMENT
      default: return MOOD_THOUGHT_TYPE_EVENT
    }
  }

  // ========== 家具心情效果 ==========

  /**
   * 应用手动心情效果（如交互、使用物品）
   */
  const applyMoodEffect = (pawn, effect, sourceId = '') => {
    if (!pawn || !effect || !moodEngine) return

    const thought = {
      id: `thought-effect-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: MOOD_THOUGHT_TYPE_EVENT,
      source: sourceId || `manual:${effect.label}`,
      label: effect.label,
      description: effect.description || '',
      moodModifier: effect.modifier,
      duration: effect.duration ?? 200,
      icon: effect.icon || '',
      category: effect.modifier > 0 ? 'positive' : 'negative',
      createdAt: Date.now(),
    }

    moodEngine.addMoodThought(pawn, thought)

    // 重新计算
    if (moodEngine.calculateMoodValue) {
      pawn.mood.value = moodEngine.calculateMoodValue(pawn)
      pawn.mood.breakdown = moodEngine.getMoodBreakdown(pawn)
      pawn.mood.state = moodEngine.getMoodState(pawn.mood.value)
    }

    return thought
  }

  /**
   * 应用家具交互心情效果
   */
  const applyFurnitureEffect = (pawn, furniture, interactionType) => {
    if (!pawn || !furniture) return

    // 检查家具是否有自定义心情效果
    if (furniture.moodEffects?.onInteract) {
      const effect = furniture.moodEffects.onInteract
      if (effect.interactionType === interactionType || !effect.interactionType) {
        return applyMoodEffect(pawn, effect, `furniture:${furniture.id}`)
      }
    }

    // 使用模板效果
    const kind = furniture.kind || 'decor'
    const templates = FURNITURE_MOOD_EFFECT_TEMPLATES[kind]
    if (!templates) return

    // 根据交互类型选择模板
    const templateKey = getTemplateKeyForInteraction(interactionType)
    const template = templates[templateKey]
    if (!template) return

    return applyMoodEffect(pawn, template, `furniture:${furniture.id}:${interactionType}`)
  }

  /**
   * 根据交互类型获取模板 key
   */
  const getTemplateKeyForInteraction = (interactionType) => {
    switch (interactionType) {
      case 'sleep': return 'good'
      case 'eat': return 'good'
      case 'work': return 'complete'
      case 'social': return 'chat'
      case 'play': return 'play'
      default: return 'good'
    }
  }

  /**
   * 应用社交心情效果
   */
  const applySocialEffect = (pawn, effectType, targetName = '') => {
    const template = SOCIAL_MOOD_EFFECTS[effectType]
    if (!template) return

    const effect = {
      ...template,
      label: targetName ? `${template.label}（${targetName}）` : template.label,
    }

    return applyMoodEffect(pawn, effect, `social:${effectType}`)
  }

  /**
   * 应用放置家具心情效果（装饰类）
   */
  const applyPlaceEffect = (pawn, furniture) => {
    if (!pawn || !furniture) return

    // 检查家具是否有放置心情效果
    if (furniture.moodEffects?.onPlace) {
      return applyMoodEffect(pawn, furniture.moodEffects.onPlace, `furniture-place:${furniture.id}`)
    }

    // 装饰类家具默认效果
    if (furniture.kind === 'decor') {
      const template = FURNITURE_MOOD_EFFECT_TEMPLATES.decor?.beautiful
      if (template) {
        return applyMoodEffect(pawn, {
          ...template,
          label: `${furniture.name}: ${template.label}`,
        }, `furniture-place:${furniture.id}`)
      }
    }
  }

  // ========== 导出 ==========

  return {
    // 规则管理
    getAllRules,
    getEnabledRules,
    addCustomRule,
    updateCustomRule,
    deleteCustomRule,
    setRuleEnabled,
    clearCustomRules,

    // 条件评估
    evaluateCondition,
    evaluateRules,

    // 效果应用
    applyMoodEffect,
    applyFurnitureEffect,
    applySocialEffect,
    applyPlaceEffect,

    // 常量
    TRIGGER_TYPES,
    CONDITION_OPERATORS,
    FURNITURE_MOOD_EFFECT_TEMPLATES,
    SOCIAL_MOOD_EFFECTS,
  }
}

export default createMoodTriggerEngine