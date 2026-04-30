// 小人 AI 决策系统 - 需求评估 → 目标选择 → 任务执行

import { createPawnNeedsEngine } from './pawnNeedsEngine.js'
import { createPawnPathfindEngine } from './pawnPathfind.js'
import {
  NEED_DEFAULT_CONFIG,
  PAWN_ACTIVITY_IDLE,
  PAWN_ACTIVITY_MOVING,
  PAWN_ACTIVITY_WORKING,
  PAWN_ACTIVITY_SLEEPING,
  PAWN_ACTIVITY_EATING,
  PAWN_ACTIVITY_SOCIALIZING,
} from '../../config/constants.js'

// 需求类型到交互类型的映射
const NEED_TO_INTERACTION_MAP = {
  hunger: 'eat',
  rest: 'sleep',
  comfort: 'idle',
  joy: 'social',
  social: 'social',
  work_satisfaction: 'work',
}

// 需求优先级
const NEED_PRIORITY_ORDER = ['hunger', 'rest', 'joy', 'social', 'comfort', 'work_satisfaction']

export const createPawnAiEngine = (deps = {}) => {
  const needsEngine = deps.needsEngine || createPawnNeedsEngine()
  const pathfindEngine = deps.pathfindEngine || createPawnPathfindEngine()

  // AI 决策流程
  const runPawnDecision = (pawn, roomState, globalState) => {
    if (!pawn || !roomState) return pawn

    // 如果正在执行活动，不要打断
    if (pawn.currentActivity !== PAWN_ACTIVITY_IDLE && pawn.currentActivity !== PAWN_ACTIVITY_MOVING) {
      return pawn
    }

    // 如果正在移动，等待到达
    if (pawn.moving && pawn.path.length > 0) {
      return pawn
    }

    // 1. 评估需求状态
    const needsEval = needsEngine.evaluateNeedsState(pawn)

    // 2. 选择目标行为
    const decision = selectTargetBehavior(pawn, needsEval, roomState, globalState)

    // 3. 执行决策
    if (decision) {
      executeDecision(pawn, decision, roomState)
    }

    return pawn
  }

  // 选择目标行为
  const selectTargetBehavior = (pawn, needsEval, roomState, globalState) => {
    // 按优先级排序需求
    const sortedNeeds = NEED_PRIORITY_ORDER
      .map(name => ({ name, ...needsEval[name] }))
      .filter(n => n.isWarning || n.isCritical)
      .sort((a, b) => {
        // 临界需求最高优先级
        if (a.isCritical && !b.isCritical) return -1
        if (!a.isCritical && b.isCritical) return 1
        // 按紧急度排序
        return b.urgency - a.urgency
      })

    // 如果有紧急需求
    if (sortedNeeds.length > 0) {
      const topNeed = sortedNeeds[0]
      const furniture = findFurnitureForNeed(topNeed.name, roomState)

      if (furniture) {
        return {
          type: 'satisfy_need',
          needType: topNeed.name,
          target: furniture,
          priority: topNeed.isCritical ? 100 : 50,
        }
      }
    }

    // 检查是否有分配的任务
    if (pawn.assignedWork || pawn.taskQueue.length > 0) {
      const task = pawn.taskQueue[0] || pawn.assignedWork
      if (task) {
        const workFurniture = findFurnitureForWork(task.workType, roomState)
        if (workFurniture) {
          return {
            type: 'execute_task',
            task,
            target: workFurniture,
            priority: 30,
          }
        }
      }
    }

    // 检查是否有空闲工作
    const availableWork = findAvailableWork(roomState, pawn)
    if (availableWork) {
      return {
        type: 'work',
        target: availableWork,
        priority: 20,
      }
    }

    // 默认：休闲或闲逛
    return {
      type: 'idle',
      priority: 0,
    }
  }

  // 执行决策
  const executeDecision = (pawn, decision, roomState) => {
    switch (decision.type) {
      case 'satisfy_need':
        executeSatisfyNeed(pawn, decision, roomState)
        break
      case 'execute_task':
        executeTask(pawn, decision, roomState)
        break
      case 'work':
        executeWork(pawn, decision, roomState)
        break
      case 'idle':
        executeIdle(pawn, roomState)
        break
    }
  }

  // 执行满足需求
  const executeSatisfyNeed = (pawn, decision, roomState) => {
    const target = decision.target
    if (!target) return

    // 计算路径
    const targetPos = { x: target.x, y: target.y }
    const path = pathfindEngine.findPath(
      pawn.position,
      targetPos,
      roomState.tiles,
      roomState.width,
      roomState.height
    )

    if (path && path.length > 0) {
      pawn.path = path
      pawn.pathIndex = 0
      pawn.moving = true
      pawn.targetFurniture = target.id
      pawn.currentActivity = PAWN_ACTIVITY_MOVING
      pawn.sprite.action = 'walk'

      // 设置朝向
      const firstStep = path[0]
      if (firstStep.x > pawn.position.x) pawn.sprite.facing = 'right'
      else if (firstStep.x < pawn.position.x) pawn.sprite.facing = 'left'
    }
  }

  // 执行任务
  const executeTask = (pawn, decision, roomState) => {
    const target = decision.target
    if (!target) return

    const targetPos = { x: target.x, y: target.y }
    const path = pathfindEngine.findPath(
      pawn.position,
      targetPos,
      roomState.tiles,
      roomState.width,
      roomState.height
    )

    if (path && path.length > 0) {
      pawn.path = path
      pawn.pathIndex = 0
      pawn.moving = true
      pawn.targetFurniture = target.id
      pawn.currentActivity = PAWN_ACTIVITY_MOVING
      pawn.assignedWork = decision.task
      pawn.sprite.action = 'walk'
    }
  }

  // 执行工作
  const executeWork = (pawn, decision, roomState) => {
    const target = decision.target
    if (!target) return

    const targetPos = { x: target.x, y: target.y }
    const path = pathfindEngine.findPath(
      pawn.position,
      targetPos,
      roomState.tiles,
      roomState.width,
      roomState.height
    )

    if (path && path.length > 0) {
      pawn.path = path
      pawn.pathIndex = 0
      pawn.moving = true
      pawn.targetFurniture = target.id
      pawn.currentActivity = PAWN_ACTIVITY_MOVING
      pawn.sprite.action = 'walk'
    }
  }

  // 执行空闲
  const executeIdle = (pawn, roomState) => {
    pawn.currentActivity = PAWN_ACTIVITY_IDLE
    pawn.sprite.action = 'idle'

    // 周期性闲逛
    if (Math.random() < 0.02) {
      const randomTarget = findRandomWalkablePosition(roomState)
      if (randomTarget) {
        const path = pathfindEngine.findPath(
          pawn.position,
          randomTarget,
          roomState.tiles,
          roomState.width,
          roomState.height
        )
        if (path && path.length > 0) {
          pawn.path = path
          pawn.pathIndex = 0
          pawn.moving = true
          pawn.currentActivity = PAWN_ACTIVITY_MOVING
          pawn.sprite.action = 'walk'
        }
      }
    }
  }

  // 找到能满足需求的家具
  const findFurnitureForNeed = (needType, roomState) => {
    const furniture = roomState?.furniture || []
    const candidates = furniture.filter(f =>
      f.needsSatisfied && f.needsSatisfied[needType] > 0 && f.interactable
    )

    if (candidates.length === 0) return null

    // 选择第一个可用的家具
    return candidates[0]
  }

  // 找到能执行工作的家具
  const findFurnitureForWork = (workType, roomState) => {
    const furniture = roomState?.furniture || []
    return furniture.find(f =>
      f.workType === workType && f.interactable
    ) || null
  }

  // 找到可用的工作
  const findAvailableWork = (roomState, pawn) => {
    const furniture = roomState?.furniture || []
    const workFurniture = furniture.filter(f =>
      f.workType && f.interactable
    )

    if (workFurniture.length === 0) return null

    // 选择技能匹配的工作
    for (const f of workFurniture) {
      if (f.workType === 'crafting' && pawn.skills.crafting.level >= 1) return f
      if (f.workType === 'cooking' && pawn.skills.cooking.level >= 1) return f
    }

    return workFurniture[0]
  }

  // 找到随机可通行位置
  const findRandomWalkablePosition = (roomState) => {
    const passableTiles = roomState?.tiles?.filter(t => t.passable) || []
    if (passableTiles.length === 0) return null

    const randomIndex = Math.floor(Math.random() * passableTiles.length)
    return {
      x: passableTiles[randomIndex].x,
      y: passableTiles[randomIndex].y,
    }
  }

  // 到达目标后开始交互
  const startInteractionAtTarget = (pawn, roomState) => {
    const furniture = roomState?.furniture?.find(f => f.id === pawn.targetFurniture)
    if (!furniture) {
      pawn.currentActivity = PAWN_ACTIVITY_IDLE
      pawn.targetFurniture = null
      pawn.sprite.action = 'idle'
      return
    }

    pawn.activityStartTime = Date.now()

    // 根据交互类型设置活动状态
    switch (furniture.interactionType) {
      case 'sleep':
        pawn.currentActivity = PAWN_ACTIVITY_SLEEPING
        pawn.sprite.action = 'sleep'
        break
      case 'eat':
        pawn.currentActivity = PAWN_ACTIVITY_EATING
        pawn.sprite.action = 'eat'
        break
      case 'work':
        pawn.currentActivity = PAWN_ACTIVITY_WORKING
        pawn.sprite.action = 'work'
        break
      case 'social':
        pawn.currentActivity = PAWN_ACTIVITY_SOCIALIZING
        pawn.sprite.action = 'talk'
        break
      default:
        pawn.currentActivity = PAWN_ACTIVITY_IDLE
        pawn.sprite.action = 'idle'
    }
  }

  // 完成交互
  const completeInteraction = (pawn, roomState, needsEngine) => {
    const furniture = roomState?.furniture?.find(f => f.id === pawn.targetFurniture)

    // 恢复需求
    if (furniture?.needsSatisfied) {
      for (const [need, rate] of Object.entries(furniture.needsSatisfied)) {
        needsEngine.recoverNeed(pawn, need, rate * 20)
      }
    }

    // 添加技能经验（工作类）
    if (furniture?.workType && pawn.currentActivity === PAWN_ACTIVITY_WORKING) {
      addSkillExpForWork(pawn, furniture.workType)
    }

    // 重置状态
    pawn.currentActivity = PAWN_ACTIVITY_IDLE
    pawn.targetFurniture = null
    pawn.assignedWork = null
    pawn.sprite.action = 'idle'
    pawn.activityStartTime = 0
  }

  // 根据工作添加技能经验
  const addSkillExpForWork = (pawn, workType) => {
    const skill = pawn?.skills
    if (!skill) return

    switch (workType) {
      case 'crafting':
        skill.crafting.exp += 10
        break
      case 'cooking':
        skill.cooking.exp += 10
        break
      case 'research':
        skill.social.exp += 5
        break
      case 'cleaning':
        skill.cleaning.exp += 8
        break
    }
  }

  return {
    runPawnDecision,
    selectTargetBehavior,
    executeDecision,
    findFurnitureForNeed,
    findFurnitureForWork,
    findAvailableWork,
    findRandomWalkablePosition,
    startInteractionAtTarget,
    completeInteraction,
  }
}

export default createPawnAiEngine