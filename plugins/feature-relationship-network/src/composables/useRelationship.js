import { getRelationshipLevel } from '../../../../src/relationship/relationshipLevels.js'

/**
 * 旧版 LLM 静态评分映射（0-1000）— 保留兼容
 */
export function scoreToColor(score) {
  if (score <= 200) return '#ff3b30'
  if (score <= 400) return '#ff9500'
  if (score <= 600) return '#ffcc00'
  if (score <= 800) return '#34c759'
  return '#30d158'
}

export function scoreToTier(score) {
  if (score <= 200) return '敌对'
  if (score <= 400) return '疏远'
  if (score <= 600) return '普通'
  if (score <= 800) return '亲近'
  if (score <= 950) return '亲密'
  return '挚友'
}

export function scoreToWidth(score) {
  return 1 + (score / 1000) * 4
}

export function scoreToOpacity(score) {
  if (score < 100) return 0
  return 0.3 + (score / 1000) * 0.7
}

/**
 * 运行时关系映射（favor/trust/stance -100~100）
 */

// favor → 颜色
export function favorToColor(favor) {
  return getRelationshipLevel(favor).color
}

// favor → 等级信息
export function favorToLevel(favor) {
  return getRelationshipLevel(favor)
}

// trust → 线宽 (1~5px)
export function trustToWidth(trust) {
  return 1 + ((trust + 100) / 200) * 4
}

// stance → 线条虚线样式
export function stanceToDasharray(stance) {
  if (stance < -30) return '8,4'
  if (stance > 30) return ''
  return '4,4'
}
