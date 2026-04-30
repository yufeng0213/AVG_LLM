// 模拟主循环运行时 - tick 管理、帧率控制

import {
  TIME_TICK_INTERVAL_MS,
  NEED_DECAY_INTERVAL_MS,
  TIME_HOURS_PER_DAY,
  TIME_DAY_START_HOUR,
  TIME_NIGHT_START_HOUR,
} from '../../config/constants.js'

// 时间阶段
const TIME_PHASE_MORNING = 'morning'
const TIME_PHASE_AFTERNOON = 'afternoon'
const TIME_PHASE_EVENING = 'evening'
const TIME_PHASE_NIGHT = 'night'

// 每小时的 tick 数
const TICKS_PER_HOUR = 60

export const createSimulationLoopRuntime = (deps = {}) => {
  const {
    onTick = null,
    onNeedsDecay = null,
    onHourChange = null,
    onDayChange = null,
    logger = console,
  } = deps

  let loopId = null
  let decayLoopId = null
  let tickCount = 0

  // 启动模拟循环
  const startLoop = (state) => {
    if (loopId) {
      logger.warn('[room-sim] simulation loop already running')
      return
    }

    loopId = setInterval(() => {
      if (state?.time?.isPaused) return
      runTick(state)
    }, TIME_TICK_INTERVAL_MS)

    decayLoopId = setInterval(() => {
      if (state?.time?.isPaused) return
      runNeedsDecay(state)
    }, NEED_DECAY_INTERVAL_MS)

    logger.info('[room-sim] simulation loop started')
  }

  // 停止模拟循环
  const stopLoop = () => {
    if (loopId) {
      clearInterval(loopId)
      loopId = null
    }
    if (decayLoopId) {
      clearInterval(decayLoopId)
      decayLoopId = null
    }
    logger.info('[room-sim] simulation loop stopped')
  }

  // 执行一个 tick
  const runTick = (state) => {
    if (!state) return

    tickCount += 1
    state.time.tick += 1

    // 更新时间
    if (state.time.tick % TICKS_PER_HOUR === 0) {
      updateTime(state)
    }

    // 更新小人
    updatePawns(state)

    // 调用外部回调
    if (typeof onTick === 'function') {
      onTick(state)
    }
  }

  // 执行需求衰减
  const runNeedsDecay = (state) => {
    if (!state?.pawns) return

    for (const pawn of state.pawns) {
      decayPawnNeeds(pawn)
    }

    // 调用外部回调
    if (typeof onNeedsDecay === 'function') {
      onNeedsDecay(state)
    }
  }

  // 更新时间
  const updateTime = (state) => {
    const prevHour = state.time.hourOfDay
    state.time.hourOfDay = (state.time.hourOfDay + 1) % TIME_HOURS_PER_DAY

    // 检测新的一天
    if (state.time.hourOfDay === 0) {
      state.time.dayCount += 1
      if (typeof onDayChange === 'function') {
        onDayChange(state.time.dayCount, state)
      }
    }

    // 更新时间阶段
    updateTimePhase(state)

    // 调用小时变化回调
    if (typeof onHourChange === 'function') {
      onHourChange(state.time.hourOfDay, prevHour, state)
    }
  }

  // 更新时间阶段
  const updateTimePhase = (state) => {
    const hour = state.time.hourOfDay

    if (hour >= TIME_DAY_START_HOUR && hour < 12) {
      state.time.dayPhase = TIME_PHASE_MORNING
      state.time.lightModifier = 1.0
    } else if (hour >= 12 && hour < TIME_NIGHT_START_HOUR) {
      state.time.dayPhase = TIME_PHASE_AFTERNOON
      state.time.lightModifier = 0.9
    } else if (hour >= TIME_NIGHT_START_HOUR && hour < 22) {
      state.time.dayPhase = TIME_PHASE_EVENING
      state.time.lightModifier = 0.6
    } else {
      state.time.dayPhase = TIME_PHASE_NIGHT
      state.time.lightModifier = 0.4
    }
  }

  // 更新所有小人
  const updatePawns = (state) => {
    if (!state?.pawns) return

    for (const pawn of state.pawns) {
      updatePawn(pawn, state)
    }
  }

  // 更新单个小人
  const updatePawn = (pawn, state) => {
    if (!pawn) return

    // 执行移动
    if (pawn.moving && pawn.path.length > 0) {
      executeMovement(pawn, state)
    }
    // 执行活动
    else if (pawn.currentActivity !== 'idle' && pawn.currentActivity !== 'moving') {
      executeActivity(pawn, state)
    }
  }

  // 执行移动
  const executeMovement = (pawn, state) => {
    if (pawn.pathIndex >= pawn.path.length) {
      // 到达目的地
      pawn.moving = false
      pawn.path = []
      pawn.pathIndex = 0
      pawn.sprite.action = 'idle'

      // 开始交互
      if (pawn.targetFurniture) {
        startPawnInteraction(pawn, state)
      }
      return
    }

    // 移动一格
    const nextPos = pawn.path[pawn.pathIndex]
    pawn.position = { x: nextPos.x, y: nextPos.y }
    pawn.pathIndex += 1
    pawn.sprite.action = 'walk'

    // 更新朝向
    if (pawn.pathIndex < pawn.path.length) {
      const next = pawn.path[pawn.pathIndex]
      if (next.x > pawn.position.x) pawn.sprite.facing = 'right'
      else if (next.x < pawn.position.x) pawn.sprite.facing = 'left'
    }
  }

  // 开始小人交互
  const startPawnInteraction = (pawn, state) => {
    const furniture = state?.room?.furniture?.find(f => f.id === pawn.targetFurniture)
    if (!furniture) {
      pawn.currentActivity = 'idle'
      pawn.targetFurniture = null
      return
    }

    pawn.activityStartTime = Date.now()

    switch (furniture.interactionType) {
      case 'sleep':
        pawn.currentActivity = 'sleeping'
        pawn.sprite.action = 'sleep'
        break
      case 'eat':
        pawn.currentActivity = 'eating'
        pawn.sprite.action = 'eat'
        break
      case 'work':
        pawn.currentActivity = 'working'
        pawn.sprite.action = 'work'
        break
      case 'social':
        pawn.currentActivity = 'socializing'
        pawn.sprite.action = 'talk'
        break
      default:
        pawn.currentActivity = 'idle'
        pawn.sprite.action = 'idle'
    }
  }

  // 执行活动
  const executeActivity = (pawn, state) => {
    const elapsed = Date.now() - pawn.activityStartTime

    switch (pawn.currentActivity) {
      case 'sleeping':
        // 睡眠持续恢复
        recoverNeed(pawn, 'rest', 0.5)
        recoverNeed(pawn, 'comfort', 0.1)
        break
      case 'eating':
        recoverNeed(pawn, 'hunger', 0.8)
        if (elapsed > 3000) completePawnActivity(pawn, state)
        break
      case 'working':
        recoverNeed(pawn, 'work_satisfaction', 0.2)
        if (elapsed > 5000) completePawnActivity(pawn, state)
        break
      case 'socializing':
        recoverNeed(pawn, 'social', 0.5)
        recoverNeed(pawn, 'joy', 0.3)
        if (elapsed > 4000) completePawnActivity(pawn, state)
        break
    }
  }

  // 衰减小人需求
  const decayPawnNeeds = (pawn) => {
    if (!pawn?.needs) return

    for (const [_, needData] of Object.entries(pawn.needs)) {
      needData.value = Math.max(0, needData.value - needData.decayRate)
    }
  }

  // 恢复需求
  const recoverNeed = (pawn, needType, amount) => {
    if (!pawn?.needs?.[needType]) return
    pawn.needs[needType].value = Math.min(100, pawn.needs[needType].value + amount)
  }

  // 完成小人活动
  const completePawnActivity = (pawn, state) => {
    const furniture = state?.room?.furniture?.find(f => f.id === pawn.targetFurniture)

    // 最终需求恢复
    if (furniture?.needsSatisfied) {
      for (const [need, rate] of Object.entries(furniture.needsSatisfied)) {
        recoverNeed(pawn, need, rate * 15)
      }
    }

    // 重置状态
    pawn.currentActivity = 'idle'
    pawn.targetFurniture = null
    pawn.sprite.action = 'idle'
    pawn.activityStartTime = 0
  }

  // 检查循环是否运行中
  const isRunning = () => loopId !== null

  // 获取当前 tick 数
  const getTickCount = () => tickCount

  return {
    startLoop,
    stopLoop,
    runTick,
    runNeedsDecay,
    updateTime,
    updateTimePhase,
    updatePawns,
    updatePawn,
    executeMovement,
    executeActivity,
    decayPawnNeeds,
    recoverNeed,
    completePawnActivity,
    isRunning,
    getTickCount,
  }
}

export default createSimulationLoopRuntime