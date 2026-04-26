/**
 * 采集游戏核心逻辑 Composable
 * 三阶段：探索 → 小游戏 → 撤离
 */

import { ref, reactive, computed } from 'vue'
import { addToCollectBackpack } from '../services/collectBackpackService.js'

const COLLECT_SESSION_KEY = 'avg_llm_collect_session_v1'

function saveSession(session) {
  try {
    window.localStorage.setItem(COLLECT_SESSION_KEY, JSON.stringify(session))
  } catch {}
}

function loadSession() {
  try {
    const raw = window.localStorage.getItem(COLLECT_SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export function clearCollectSession() {
  try {
    window.localStorage.removeItem(COLLECT_SESSION_KEY)
  } catch {}
}

export function useCollectGame() {
  const session = reactive({})
  const isGenerating = ref(false)

  // ===== 计算属性 =====

  const phase = computed(() => session.phase || 'idle')
  const exploreCount = computed(() => session.exploreCount ?? 0)
  const collectedResources = computed(() => session.collectedResources || [])
  const totalPoints = computed(() => collectedResources.value.reduce((s, r) => s + (r.points || 0), 0))
  const miniGamesCompleted = computed(() => session.miniGamesCompleted?.length || 0)

  // ===== 核心方法 =====

  function createCollectSession({ taskId, collectData }) {
    Object.assign(session, {
      taskId,
      collectData,
      phase: 'intro', // intro → explore → miniGame → evacuate → settle → success → fail
      story: collectData.story || '',
      grid: collectData.grid || [],
      revealed: new Array(collectData.grid?.length || 25).fill(false),
      exploreCount: 8,
      maxExplore: 8,
      collectedResources: [],
      miniGamesCompleted: [],
      evacuationGrid: [],
      evacPosition: { row: 2, col: 0 },
      evacStepsLeft: 5,
      evacComplete: false,
      evacuatedResources: [],
      lostResources: [],
      penaltyCount: 0,
      trapHits: 0,
      status: 'playing', // playing | succeeded | failed
      log: [],
      createdAt: Date.now(),
    })

    generateEvacuationGrid()
    saveSession(session)
    return session
  }

  /**
   * 生成 3×3 撤离网格
   */
  function generateEvacuationGrid() {
    const GRID = 9
    const grid = new Array(GRID).fill('safe')
    const dangerCount = session.collectData?.evacuationDangerCount || 3
    const treasureCount = session.collectData?.evacuationTreasureCount || 1

    // 排除起点(8)和终点(0)
    const available = [1, 2, 3, 4, 5, 6, 7]
    const shuffled = available.sort(() => Math.random() - 0.5)

    for (let i = 0; i < dangerCount && i < shuffled.length; i++) {
      grid[shuffled[i]] = 'danger'
    }
    if (treasureCount > 0) {
      for (let i = dangerCount; i < dangerCount + treasureCount && i < shuffled.length; i++) {
        grid[shuffled[i]] = 'treasure'
      }
    }

    session.evacuationGrid = grid
  }

  /**
   * 开始探索（播放完开场故事后调用）
   */
  function startExplore() {
    if (session.status !== 'playing') return
    session.phase = 'explore'
    session.log.push('━━━ 探索开始 ━━━')
    saveSession(session)
  }

  /**
   * 翻开一个格子
   */
  function revealCell(index) {
    if (session.phase !== 'explore') return null
    if (session.exploreCount <= 0) return null
    if (session.revealed[index]) return null

    session.revealed[index] = true
    session.exploreCount--

    const cell = session.grid[index]
    if (!cell) return null

    let result = null

    switch (cell.type) {
      case 'resource':
        session.collectedResources.push({
          ...cell,
          id: `collect_${Date.now()}_${index}`,
        })
        session.log.push(`发现了 ${cell.icon} ${cell.name}！(+${cell.points}分)`)
        result = { type: 'resource', cell }
        break

      case 'trap':
        session.trapHits++
        if (cell.effect === 'explore_loss') {
          session.exploreCount = Math.max(0, session.exploreCount - cell.value)
          session.log.push(`踩到了 ${cell.icon} ${cell.name}！失去 ${cell.value} 次探索机会`)
        } else if (cell.effect === 'evacuation_penalty') {
          session.penaltyCount += cell.value
          session.log.push(`触发了 ${cell.icon} ${cell.name}！撤离风险增加`)
        }
        result = { type: 'trap', cell }
        break

      case 'obstacle':
        session.log.push(`遇到了 ${cell.icon} ${cell.name}，什么也没发生`)
        result = { type: 'obstacle', cell }
        break

      case 'event':
        result = { type: 'event' }
        break

      default:
        session.log.push(`这是一块空地...`)
        result = { type: 'empty' }
    }

    // 探索次数用尽，自动进入撤离
    if (session.exploreCount <= 0) {
      session.log.push('探索次数已用尽，必须撤离...')
      saveSession(session)
      setTimeout(() => startEvacuation(), 1500)
      return result
    }

    // 踩到特殊事件，触发小游戏
    if (result?.type === 'event') {
      saveSession(session)
      setTimeout(() => triggerMiniGame(), 800)
      return result
    }

    saveSession(session)
    return result
  }

  /**
   * 触发小游戏（随机选择一种）
   */
  function triggerMiniGame() {
    if (session.status !== 'playing') return

    const eventTypes = session.collectData?.eventTypes || ['reflex', 'memory', 'precision']
    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)]
    session.pendingMiniGame = type
    session.phase = 'miniGame'
    session.log.push(`━━━ 特殊事件！${getMiniGameName(type)} ━━━`)
    saveSession(session)
  }

  function getMiniGameName(type) {
    const names = { reflex: '⚡ 反应力测试', memory: '🧠 记忆翻牌', precision: '🎯 精准判定' }
    return names[type] || '❓ 未知事件'
  }

  /**
   * 小游戏完成回调
   */
  function completeMiniGame(success, bonus) {
    if (session.phase !== 'miniGame') return

    session.pendingMiniGame = null
    session.miniGamesCompleted.push({ type: session.pendingMiniGame, success })

    if (success) {
      if (bonus?.resource) {
        session.collectedResources.push(bonus.resource)
        session.log.push(`小游戏奖励：${bonus.resource.icon} ${bonus.resource.name}！`)
      }
      if (bonus?.extraExplores) {
        session.exploreCount += bonus.extraExplores
        session.log.push(`获得 ${bonus.extraExplores} 次额外探索机会！`)
      }
    } else {
      session.log.push('小游戏挑战失败...')
    }

    session.phase = 'explore'
    saveSession(session)
  }

  /**
   * 安全退出探索阶段
   */
  function safeExit() {
    if (session.phase !== 'explore') return
    session.log.push('决定安全撤离...')
    saveSession(session)
    setTimeout(() => startEvacuation(), 500)
  }

  /**
   * 开始撤离阶段
   */
  function startEvacuation() {
    if (session.status !== 'playing') return
    session.phase = 'evacuate'
    session.evacPosition = { row: 2, col: 0 }
    session.evacStepsLeft = 5
    session.evacComplete = false
    session.evacuatedResources = [...session.collectedResources]
    session.lostResources = []
    session.log.push('━━━ 撤离开始 ━━━')
    saveSession(session)
  }

  /**
   * 撤离移动
   */
  function moveEvacuation(row, col) {
    if (session.phase !== 'evacuate') return
    if (session.evacStepsLeft <= 0) return

    const { evacPosition } = session
    const dRow = Math.abs(row - evacPosition.row)
    const dCol = Math.abs(col - evacPosition.col)
    if (dRow + dCol !== 1) return // 只允许上下左右相邻

    session.evacStepsLeft--
    session.evacPosition = { row, col }

    const gridIndex = row * 3 + col
    const cellType = session.evacuationGrid[gridIndex]

    switch (cellType) {
      case 'danger':
        session.evacuationGrid[gridIndex] = 'revealed_danger'
        const lossCount = Math.min(1 + session.penaltyCount, session.evacuatedResources.length)
        if (lossCount > 0) {
          for (let i = 0; i < lossCount; i++) {
            const lost = session.evacuatedResources.pop()
            session.lostResources.push(lost)
          }
          session.log.push(`遭遇追兵！失去了 ${lossCount} 个资源...`)
        }
        break

      case 'treasure':
        session.evacuationGrid[gridIndex] = 'revealed_treasure'
        const bonusResource = {
          name: '意外发现',
          icon: ['💎', '✨', '🌟'][Math.floor(Math.random() * 3)],
          points: 150,
          rarity: 'rare',
          id: `collect_bonus_${Date.now()}`,
        }
        session.evacuatedResources.push(bonusResource)
        session.log.push(`发现隐藏宝藏！${bonusResource.icon} ${bonusResource.name}`)
        break

      default:
        session.evacuationGrid[gridIndex] = 'revealed_safe'
    }

    // 到达终点
    if (row === 0 && col === 2) {
      session.evacComplete = true
      session.log.push('成功撤离！')
      saveSession(session)
      setTimeout(() => settleResults(), 1000)
      return
    }

    // 步数用尽
    if (session.evacStepsLeft <= 0) {
      if (row === 0 && col === 2) {
        session.evacComplete = true
      } else {
        session.log.push('撤离失败，未能到达终点...')
        session.evacuatedResources = []
        session.lostResources = [...session.collectedResources]
      }
      saveSession(session)
      setTimeout(() => settleResults(), 1000)
      return
    }

    saveSession(session)
  }

  /**
   * 结算
   */
  function settleResults() {
    const totalResources = session.collectedResources.length
    const savedResources = session.evacuatedResources.length
    const miniGameSuccess = session.miniGamesCompleted.filter(m => m.success).length

    let rating = 'failure'
    let multiplier = 0

    if (savedResources === 0) {
      rating = 'failure'
      multiplier = 0
    } else if (totalResources > 0 && savedResources >= totalResources && miniGameSuccess > 0 && session.evacComplete) {
      rating = 'perfect'
      multiplier = 1.5
    } else if (totalResources > 0 && savedResources / totalResources >= 0.7 && session.evacComplete) {
      rating = 'excellent'
      multiplier = 1.0
    } else if (totalResources > 0 && savedResources / totalResources >= 0.4) {
      rating = 'normal'
      multiplier = 0.7
    } else {
      rating = 'barely'
      multiplier = 0.4
    }

    const totalPoints = session.evacuatedResources.reduce((s, r) => s + (r.points || 0), 0)
    const finalPoints = Math.round(totalPoints * multiplier)

    session.rating = rating
    session.multiplier = multiplier
    session.finalPoints = finalPoints
    session.savedResources = session.evacuatedResources
    session.phase = 'settle'

    // 将采集到的资源存入背包
    if (savedResources > 0) {
      addToCollectBackpack(session.evacuatedResources)
      session.status = 'succeeded'
    } else {
      session.status = 'failed'
    }

    saveSession(session)
  }

  /**
   * 重置（重试）
   */
  function reset() {
    clearCollectSession()
    Object.keys(session).forEach(key => delete session[key])
  }

  return {
    session,
    isGenerating,
    phase,
    exploreCount,
    collectedResources,
    totalPoints,
    miniGamesCompleted,
    createCollectSession,
    startExplore,
    revealCell,
    triggerMiniGame,
    completeMiniGame,
    safeExit,
    startEvacuation,
    moveEvacuation,
    settleResults,
    reset,
    saveSession,
    loadSession: loadSession,
    clearSession: clearCollectSession,
  }
}
