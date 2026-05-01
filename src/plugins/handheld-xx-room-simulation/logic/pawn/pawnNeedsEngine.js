// 小人需求系统 - 衰减、恢复、评估

import {
  NEED_MAX_VALUE,
  NEED_MIN_VALUE,
  NEED_DEFAULT_CONFIG,
} from '../../config/constants.js'

export const createPawnNeedsEngine = (deps = {}) => {
  // 获取最紧急的需求
  const getMostUrgentNeed = (pawn) => {
    const needs = pawn?.needs || {}
    let urgentNeed = null
    let lowestValue = NEED_MAX_VALUE

    for (const [needName, needData] of Object.entries(needs)) {
      if (needData.value < lowestValue) {
        lowestValue = needData.value
        urgentNeed = {
          name: needName,
          value: needData.value,
          threshold: needData.threshold,
          critical: needData.critical,
          isCritical: needData.value <= needData.critical,
          isWarning: needData.value <= needData.threshold,
        }
      }
    }

    return urgentNeed
  }

  // 衰减需求值
  const decayNeeds = (pawn, deltaTimeMs) => {
    if (!pawn?.needs) return pawn

    const deltaTicks = deltaTimeMs / 1000 // 转换为秒

    for (const [needName, needData] of Object.entries(pawn.needs)) {
      const config = NEED_DEFAULT_CONFIG[needName] || { decayRate: 0.01 }
      const decayRate = needData.decayRate || config.decayRate
      const decay = decayRate * deltaTicks

      needData.value = Math.max(NEED_MIN_VALUE, needData.value - decay)
    }

    return pawn
  }

  // 恢复需求值
  const recoverNeed = (pawn, needName, amount) => {
    if (!pawn?.needs?.[needName]) return pawn

    const needData = pawn.needs[needName]
    needData.value = Math.min(NEED_MAX_VALUE, needData.value + amount)

    return pawn
  }

  // 批量恢复需求
  const recoverNeeds = (pawn, needsMap) => {
    if (!pawn?.needs || !needsMap) return pawn

    for (const [needName, amount] of Object.entries(needsMap)) {
      recoverNeed(pawn, needName, amount)
    }

    return pawn
  }

  // 评估所有需求状态
  const evaluateNeedsState = (pawn) => {
    const needs = pawn?.needs || {}
    const evaluations = {}

    for (const [needName, needData] of Object.entries(needs)) {
      const config = NEED_DEFAULT_CONFIG[needName] || { threshold: 30, critical: 10 }
      const threshold = needData.threshold || config.threshold
      const critical = needData.critical || config.critical

      const ratio = needData.value / NEED_MAX_VALUE
      const urgency = calculateUrgency(needData.value, threshold, critical)

      evaluations[needName] = {
        value: needData.value,
        ratio,
        urgency,
        isCritical: needData.value <= critical,
        isWarning: needData.value <= threshold,
        threshold,
        critical,
      }
    }

    return evaluations
  }

  // 计算需求紧急度（用于 AI 优先级）
  const calculateUrgency = (value, threshold, critical) => {
    if (value <= critical) return 10  // 最高紧急度
    if (value <= threshold) return 5 + (threshold - value) / threshold * 5
    return Math.max(0, (NEED_MAX_VALUE - value) / NEED_MAX_VALUE * 5)
  }

  // 获取需要满足的需求列表（按紧急度排序）
  const getNeedsToSatisfy = (pawn) => {
    const evaluations = evaluateNeedsState(pawn)
    const needsList = Object.entries(evaluations)
      .filter(([_, ev]) => ev.isWarning || ev.isCritical)
      .map(([name, ev]) => ({
        name,
        ...ev,
      }))
      .sort((a, b) => b.urgency - a.urgency)

    return needsList
  }

  // 计算整体幸福感/心情值
  const calculateMoodScore = (pawn) => {
    const needs = pawn?.needs || {}
    let totalScore = 0
    let count = 0

    for (const [_, needData] of Object.entries(needs)) {
      totalScore += needData.value
      count += 1
    }

    return count > 0 ? totalScore / count : NEED_MAX_VALUE
  }

  // 判断小人是否处于不良状态
  const isInBadState = (pawn) => {
    const urgentNeed = getMostUrgentNeed(pawn)
    return urgentNeed?.isCritical || false
  }

  // 创建默认需求值
  const createDefaultNeeds = () => {
    const needs = {}
    for (const [key, config] of Object.entries(NEED_DEFAULT_CONFIG)) {
      needs[key] = {
        value: NEED_MAX_VALUE,
        decayRate: config.decayRate,
        threshold: config.threshold,
        critical: config.critical,
      }
    }
    return needs
  }

  return {
    getMostUrgentNeed,
    decayNeeds,
    recoverNeed,
    recoverNeeds,
    evaluateNeedsState,
    calculateUrgency,
    getNeedsToSatisfy,
    calculateMoodScore,
    isInBadState,
    createDefaultNeeds,
  }
}

export default createPawnNeedsEngine