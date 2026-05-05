// 自由活动引擎 - 小人空闲时的活动行为

import {
  IDLE_ACTION_COOLDOWN_MS,
  RANDOM_WALK_CHANCE,
  INTERACTION_CHANCE,
  SOCIAL_CHANCE,
  FURNITURE_MOOD_BOOST,
} from '../../config/constants.js'

export const createFreeActivityEngine = (deps = {}) => {
  const { pathfindEngine, moodEngine, addLog, recordPawnEvent } = deps

  /**
   * 选择空闲活动类型
   */
  const selectIdleAction = (pawn, room, otherPawns) => {
    const preferences = pawn.preferredActivities || []
    const furniture = room?.furniture || []

    // 构建可选活动列表
    const availableActions = []

    // 随机漫步（总是可用）
    if (Math.random() < RANDOM_WALK_CHANCE) {
      availableActions.push({ type: 'walk', priority: 1 })
    }

    // 主动互动（有可交互家具）
    const interactable = furniture.filter(f =>
      f.interactable &&
      f.kind !== 'storage' &&
      f.kind !== 'vending'
    )
    if (interactable.length > 0 && Math.random() < INTERACTION_CHANCE) {
      availableActions.push({ type: 'interact', priority: 2 })
    }

    // 社交（有其他空闲小人）
    const idlePawns = otherPawns.filter(p =>
      p.id !== pawn.id &&
      !p.moving &&
      p.currentActivity === 'idle'
    )
    if (idlePawns.length > 0 && Math.random() < SOCIAL_CHANCE) {
      availableActions.push({ type: 'socialize', priority: 3 })
    }

    // 根据偏好加权
    for (const action of availableActions) {
      if (action.type === 'walk' && preferences.includes('explore')) action.priority += 2
      if (action.type === 'socialize' && preferences.includes('social')) action.priority += 2
      if (action.type === 'interact' && preferences.includes('work')) action.priority += 2
      if (action.type === 'interact' && preferences.includes('relax')) action.priority += 1
    }

    // 选择最高优先级
    if (availableActions.length === 0) return null
    availableActions.sort((a, b) => b.priority - a.priority)
    return availableActions[0]
  }

  /**
   * 随机漫步
   */
  const executeRandomWalk = (pawn, room, tiles, width, height) => {
    const w = width || 24
    const h = height || 16
    const t = tiles || []

    // 随机选择可达位置（尝试5次）
    for (let i = 0; i < 5; i++) {
      const targetX = Math.floor(Math.random() * (w - 2)) + 1
      const targetY = Math.floor(Math.random() * (h - 2)) + 1

      // 检查是否可通行
      const tile = t.find(tile => tile.x === targetX && tile.y === targetY)
      if (!tile || !tile.passable) continue

      // 计算路径（将小人位置取整为格子坐标）
      const startGridX = Math.floor(pawn.position.x)
      const startGridY = Math.floor(pawn.position.y)
      const path = pathfindEngine?.findPath(
        { x: startGridX, y: startGridY },
        { x: targetX, y: targetY },
        t,
        w,
        h
      )

      if (path && path.length > 0) {
        pawn.path = path
        pawn.pathIndex = 0
        pawn.moving = true
        pawn.currentActivity = 'walking'
        pawn.sprite.action = 'walk'

        if (path[0].x > pawn.position.x) pawn.sprite.facing = 'right'
        else if (path[0].x < pawn.position.x) pawn.sprite.facing = 'left'

        addLog?.(`${pawn.name} 开始闲逛`)
        return { executed: true }
      }
    }

    return { executed: false }
  }

  /**
   * 主动互动（去家具）
   */
  const executeInteraction = (pawn, room, tiles, width, height) => {
    const furniture = room?.furniture || []
    const interactable = furniture.filter(f =>
      f.interactable &&
      f.kind !== 'storage' &&
      f.kind !== 'vending'
    )

    if (interactable.length === 0) return { executed: false }

    // 随机选择一个家具
    const target = interactable[Math.floor(Math.random() * interactable.length)]

    // 计算路径（将小人位置取整为格子坐标）
    const startGridX = Math.floor(pawn.position.x)
    const startGridY = Math.floor(pawn.position.y)
    const path = pathfindEngine?.findPath(
      { x: startGridX, y: startGridY },
      { x: target.x, y: target.y },
      tiles,
      width,
      height
    )

    if (path && path.length > 0) {
      pawn.path = path
      pawn.pathIndex = 0
      pawn.moving = true
      pawn.targetFurniture = target.id
      pawn.currentActivity = 'idle_interaction'
      pawn.activityStartTime = Date.now()
      pawn.sprite.action = 'walk'

      if (path[0].x > pawn.position.x) pawn.sprite.facing = 'right'
      else if (path[0].x < pawn.position.x) pawn.sprite.facing = 'left'

      addLog?.(`${pawn.name} 去看看${target.name}`)
      return { executed: true }
    }

    return { executed: false }
  }

  /**
   * 社交（找其他小人）
   */
  const executeSocialize = (pawn, room, otherPawns, tiles, width, height) => {
    const idlePawns = otherPawns.filter(p =>
      p.id !== pawn.id &&
      !p.moving &&
      p.currentActivity === 'idle'
    )

    if (idlePawns.length === 0) return { executed: false }

    // 随机选择一个小人
    const target = idlePawns[Math.floor(Math.random() * idlePawns.length)]

    // 计算路径到目标小人位置（将小人位置取整为格子坐标）
    const startGridX = Math.floor(pawn.position.x)
    const startGridY = Math.floor(pawn.position.y)
    const targetGridX = Math.floor(target.position.x)
    const targetGridY = Math.floor(target.position.y)
    const path = pathfindEngine?.findPath(
      { x: startGridX, y: startGridY },
      { x: targetGridX, y: targetGridY },
      tiles,
      width,
      height
    )

    if (path && path.length > 0) {
      pawn.path = path
      pawn.pathIndex = 0
      pawn.moving = true
      pawn.targetPawn = target.id
      pawn.currentActivity = 'approaching_social'
      pawn.sprite.action = 'walk'

      if (path[0].x > pawn.position.x) pawn.sprite.facing = 'right'
      else if (path[0].x < pawn.position.x) pawn.sprite.facing = 'left'

      addLog?.(`${pawn.name} 想和${target.name}聊天`)
      return { executed: true }
    }

    return { executed: false }
  }

  /**
   * 执行活动
   */
  const executeAction = (pawn, room, action, otherPawns, tiles, width, height) => {
    switch (action.type) {
      case 'walk':
        return executeRandomWalk(pawn, room, tiles, width, height)
      case 'interact':
        return executeInteraction(pawn, room, tiles, width, height)
      case 'socialize':
        return executeSocialize(pawn, room, otherPawns, tiles, width, height)
      default:
        return { executed: false }
    }
  }

  /**
   * 检查并执行空闲活动
   */
  const checkIdleAction = (pawn, room, otherPawns, tiles, width, height) => {
    // 有紧急需求时不执行空闲活动
    const needs = pawn.needs || {}
    for (const [key, need] of Object.entries(needs)) {
      if (need.value <= need.threshold) return false
    }

    // 冷却时间检查
    const now = Date.now()
    if (pawn.activityCooldown && now < pawn.activityCooldown) return false

    // 根据角色偏好和概率选择活动
    const action = selectIdleAction(pawn, room, otherPawns)
    if (!action) return false

    // 执行活动
    const result = executeAction(pawn, room, action, otherPawns, tiles, width, height)
    if (result.executed) {
      pawn.activityCooldown = now + IDLE_ACTION_COOLDOWN_MS
    }

    return result.executed
  }

  return {
    checkIdleAction,
    selectIdleAction,
    executeAction,
    executeRandomWalk,
    executeInteraction,
    executeSocialize,
  }
}

export default createFreeActivityEngine