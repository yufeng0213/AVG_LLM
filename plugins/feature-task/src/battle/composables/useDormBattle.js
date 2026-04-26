/**
 * 战斗核心逻辑 Composable
 * 管理战斗状态、回合管理、伤害计算、波次切换、敌方 AI
 * 新流程：玩家阶段自由选角出招 → 全部行动完 → 敌方阶段全体自动攻击 → 循环
 */

import { ref, reactive, computed } from 'vue'
import { addToBattleBackpack } from '../services/battleBackpackService.js'

const BATTLE_SESSION_KEY = 'avg_llm_battle_session_v1'
const BATTLE_HISTORY_KEY = 'avg_llm_battle_history_v1'

// ==================== 工具函数 ====================

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// 命中音效（全局复用单个 Audio 实例）
let hitAudio = null
function playHitSound() {
  if (!hitAudio) {
    hitAudio = new Audio('/data/audio/sword-hit.mp3')
    hitAudio.volume = 0.3
  }
  hitAudio.currentTime = 0
  hitAudio.play().catch(() => {})
}

// 受伤音效
let injuryAudio = null
function playInjurySound() {
  if (!injuryAudio) {
    injuryAudio = new Audio('/data/audio/sword-injury.mp3')
    injuryAudio.volume = 0.3
  }
  injuryAudio.currentTime = 0
  injuryAudio.play().catch(() => {})
}

// ==================== 元素克制 ====================

const ELEMENT_ADVANTAGE = {
  fire: 'ice',
  ice: 'fire',
  lightning: 'water',
  dark: 'light',
}

function getElementMultiplier(attackerType, defenderType) {
  if (ELEMENT_ADVANTAGE[attackerType] === defenderType) return 1.5
  if (ELEMENT_ADVANTAGE[defenderType] === attackerType) return 0.67
  return 1.0
}

// ==================== 伤害计算 ====================

/**
 * 计算技能伤害
 */
export function calculateDamage(attacker, defender, skill) {
  const hits = []
  const hitCount = skill.hitCount || 1

  for (let i = 0; i < hitCount; i++) {
    const baseDamage = attacker.attack * skill.damageMultiplier
    const defenseReduction = baseDamage * (100 / (100 + defender.defense))

    const elementMult = getElementMultiplier(skill.damageType, 'physical')
    const isCrit = Math.random() < attacker.critRate
    const critMult = isCrit ? attacker.critDmg : 1.0

    let finalDamage = Math.max(1, Math.round(defenseReduction * elementMult * critMult))
    hits.push({ damage: finalDamage, isCrit })
  }

  const totalDamage = hits.reduce((sum, h) => sum + h.damage, 0)
  return { totalDamage, isCrit: hits.some(h => h.isCrit), hits }
}

/**
 * 计算治疗效果
 */
export function calculateHeal(healer, target, value) {
  const actualHeal = Math.min(value, target.maxHp - target.hp)
  return Math.max(0, actualHeal)
}

/**
 * 处理 debuff 持续伤害
 */
export function tickDebuffs(character) {
  const records = []

  character.debuffs = (character.debuffs || []).filter(debuff => {
    if (debuff.duration <= 0) return false

    let damage = 0
    if (['poison', 'burn', 'bleed'].includes(debuff.type)) {
      const stacks = debuff.stackable ? (debuff.stacks || 1) : 1
      damage = Math.max(1, Math.round(debuff.valuePerTick * stacks * (1 - character.defense / 200)))
    }

    if (damage > 0) {
      character.hp = Math.max(0, character.hp - damage)
      records.push({
        targetId: character.id,
        targetName: character.name,
        type: debuff.type,
        damage,
      })
    }

    debuff.duration--
    return debuff.duration > 0
  })

  return records
}

// ==================== 敌方 AI ====================

/**
 * 敌方 AI 选择目标和技能
 */
export function enemyAiChoose(enemy, playerTeam) {
  const aliveTargets = playerTeam.filter(c => c.isAlive)
  if (aliveTargets.length === 0) {
    console.warn('[enemyAiChoose] 没有存活目标')
    return null
  }

  // 优先攻击最低 HP 的目标
  const target = aliveTargets.sort((a, b) => a.hp - b.hp)[0]

  const skills = enemy.skills || []
  const availableSkills = skills.filter(s => (s.currentCooldown || 0) <= 0)
  let skill = skills[0] || null

  if (availableSkills.length > 1 && Math.random() < 0.3) {
    const specialSkills = availableSkills.filter(s => s.damageMultiplier > 1)
    if (specialSkills.length > 0) {
      skill = specialSkills[Math.floor(Math.random() * specialSkills.length)]
    } else {
      skill = availableSkills[Math.floor(Math.random() * availableSkills.length)]
    }
  }

  return { target, skill }
}

// ==================== 战斗状态管理 ====================

/**
 * 创建战斗会话
 */
export function createBattleSession({ taskId, boardId, battleData }) {
  const session = {
    taskId,
    boardId,
    battleData,
    currentWave: 0,
    teamMembers: battleData.teamMembers.map(m => ({
      ...m,
      isAlive: true,
      isHighlighted: false,
      hasActed: false,
      buffs: [],
      debuffs: [],
    })),
    battleBackpack: [],
    phase: 'player', // 'player' | 'enemy'
    selectedPlayerId: null, // 当前选中的己方角色 ID
    pendingAction: null, // { type: 'skill'|'item', source, skill/item }
    pendingItem: null, // 待使用的道具（等待选择己方目标）
    waveDropHistory: [],
    battleLog: [],
    status: 'battle', // 'battle' | 'wave_clear' | 'victory' | 'defeat'
    currentWaveStory: battleData.waves[0]?.backgroundStory || '',
    createdAt: Date.now(),
    roundNumber: 1,
  }

  // 初始化冷却
  session.teamMembers.forEach(member => {
    member.skills.forEach(skill => {
      skill.currentCooldown = 0
    })
  })

  // 初始化敌方冷却
  battleData.waves.forEach(wave => {
    wave.enemies.forEach(enemy => {
      enemy.isAlive = true
      enemy.isHighlighted = false
      enemy.buffs = []
      enemy.debuffs = []
      enemy.skills.forEach(skill => {
        skill.currentCooldown = 0
      })
    })
  })

  saveBattleSession(session)
  return session
}

/**
 * 保存战斗会话到 localStorage
 */
export function saveBattleSession(session) {
  try {
    window.localStorage.setItem(BATTLE_SESSION_KEY, JSON.stringify(session))
  } catch {
    // ignore
  }
}

/**
 * 加载战斗会话
 */
export function loadBattleSession() {
  try {
    const raw = window.localStorage.getItem(BATTLE_SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return null
}

/**
 * 清除战斗会话
 */
export function clearBattleSession() {
  try {
    window.localStorage.removeItem(BATTLE_SESSION_KEY)
  } catch {
    // ignore
  }
}

/**
 * 归档战斗历史
 */
export function archiveBattle(session) {
  try {
    const raw = window.localStorage.getItem(BATTLE_HISTORY_KEY)
    const history = raw ? JSON.parse(raw) : []
    history.push({
      taskId: session.taskId,
      status: session.status,
      waves: session.currentWave + 1,
      createdAt: session.createdAt,
      completedAt: Date.now(),
    })
    if (history.length > 50) history.splice(0, history.length - 50)
    window.localStorage.setItem(BATTLE_HISTORY_KEY, JSON.stringify(history))
  } catch {
    // ignore
  }
}

// ==================== Vue Composable ====================

export function useDormBattle() {
  const session = reactive({})
  const isLoading = ref(false)
  const generatingProgress = ref(0)
  const onAnimationTrigger = ref(null)

  const currentWaveData = computed(() => {
    if (!session.battleData || session.currentWave == null) return null
    return session.battleData.waves[session.currentWave]
  })

  const currentWaveEnemies = computed(() => {
    if (!currentWaveData.value) return []
    return currentWaveData.value.enemies || []
  })

  const aliveEnemies = computed(() => {
    return currentWaveEnemies.value.filter(e => e.isAlive)
  })

  const aliveTeammates = computed(() => {
    return (session.teamMembers || []).filter(m => m.isAlive)
  })

  const isBattleOver = computed(() => {
    return session.status === 'victory' || session.status === 'defeat'
  })

  const isWaveComplete = computed(() => {
    return session.status === 'wave_clear'
  })

  /** 当前是否为敌方阶段（自动执行中） */
  const isEnemyPhase = computed(() => {
    return session.phase === 'enemy'
  })

  /** 当前回合是否全部行动完毕（可以显示回合结束按钮） */
  const isAllPlayersActed = computed(() => {
    if (!session.teamMembers || session.phase !== 'player') return false
    const aliveMembers = session.teamMembers.filter(m => m.isAlive)
    return aliveMembers.every(m => m.hasActed)
  })

  /** 剩余未行动的己方角色数量 */
  const remainingPlayerCount = computed(() => {
    if (!session.teamMembers || session.phase !== 'player') return 0
    const aliveMembers = session.teamMembers.filter(m => m.isAlive)
    return aliveMembers.filter(m => !m.hasActed).length
  })

  // ==================== 战斗操作 ====================

  /**
   * 开始新波次
   */
  function startWave() {
    const wave = currentWaveData.value
    console.log('[useDormBattle] startWave 调用, currentWave:', session.currentWave, 'wave:', wave)
    if (!wave) {
      console.error('[useDormBattle] startWave: wave 为 null, battleData:', session.battleData)
      return
    }

    // 确保敌方角色状态初始化
    wave.enemies.forEach(e => {
      e.isAlive = true
      e.isHighlighted = false
      e.hasActed = false
    })

    // 重置己方行动状态
    session.teamMembers.forEach(m => {
      m.hasActed = false
    })

    session.phase = 'player'
    session.selectedPlayerId = null
    session.pendingAction = null
    session.status = 'battle'
    session.currentWaveStory = wave.backgroundStory || ''
    session.battleLog.push(`━━━ 第 ${session.currentWave + 1} 场战斗开始 ━━━`)
    session.battleLog.push(wave.backgroundStory || '战斗开始了...')

    saveBattleSession(session)
  }

  /**
   * 玩家点击己方角色卡片 — 选中该角色准备出招
   */
  function selectPlayerCharacter(charId) {
    if (session.phase !== 'player') return
    if (session.status !== 'battle') return

    // 如果有待处理的道具（己方目标），则执行道具效果
    if (session.pendingItem) {
      const item = session.pendingItem
      const target = session.teamMembers?.find(m => m.id === charId)
      if (!target || !target.isAlive) return

      executeItemOnAlly(charId, item)
      session.pendingItem = null
      session.selectedPlayerId = null
      saveBattleSession(session)
      checkBattleEnd()
      return
    }

    const member = session.teamMembers?.find(m => m.id === charId)
    if (!member || !member.isAlive || member.hasActed) return

    session.selectedPlayerId = charId
    session.pendingAction = null

    saveBattleSession(session)
  }

  /**
   * 取消选中己方角色
   */
  function deselectPlayerCharacter() {
    session.selectedPlayerId = null
    session.pendingAction = null
    session.pendingItem = null
    saveBattleSession(session)
  }

  /**
   * 当前选中的角色跳过本回合
   */
  function skipPlayerTurn() {
    if (session.phase !== 'player') return
    if (!session.selectedPlayerId) return

    const member = session.teamMembers?.find(m => m.id === session.selectedPlayerId)
    if (!member || member.hasActed) return

    member.hasActed = true
    session.battleLog.push(`${member.name} 跳过了本回合`)
    session.selectedPlayerId = null
    session.pendingAction = null
    session.pendingItem = null

    saveBattleSession(session)
    checkBattleEnd()
  }

  /**
   * 所有己方角色行动完毕 → 进入敌方阶段
   */
  function endRound() {
    if (session.phase !== 'player') return

    session.pendingItem = null

    // 扣减所有技能冷却
    const allChars = [...session.teamMembers, ...(currentWaveEnemies.value || [])]
    allChars.forEach(char => {
      char.skills.forEach(skill => {
        if (skill.currentCooldown > 0) {
          skill.currentCooldown--
        }
      })
      // 处理 debuff tick
      const debuffRecords = tickDebuffs(char)
      debuffRecords.forEach(rec => {
        session.battleLog.push(`${rec.targetName} 受到 [${rec.type}] 伤害 ${rec.damage} 点`)
      })
    })

    session.roundNumber++
    session.phase = 'enemy'
    session.selectedPlayerId = null
    session.pendingAction = null
    session.pendingItem = null

    session.battleLog.push(`━━━ 第 ${session.roundNumber} 回合 · 敌方行动 ━━━`)

    saveBattleSession(session)

    // 敌方全部自动攻击
    executeAllEnemies()
  }

  /**
   * 依次执行所有存活的敌方角色攻击
   */
  function executeAllEnemies() {
    const enemies = (currentWaveEnemies.value || []).filter(e => e.isAlive)
    if (enemies.length === 0) {
      // 敌方全灭，直接回玩家阶段
      _backToPlayerPhase()
      return
    }

    let delay = 0
    enemies.forEach((enemy, index) => {
      setTimeout(() => {
        if (session.status !== 'battle') return
        _executeSingleEnemy(enemy, () => {
          if (index === enemies.length - 1 || !currentWaveEnemies.value.some(e => e.isAlive)) {
            // 最后一个敌人执行完，回到玩家阶段
            setTimeout(() => _backToPlayerPhase(), 500)
          }
        })
      }, delay)
      delay += 800
    })
  }

  /**
   * 执行单个敌方角色攻击
   */
  function _executeSingleEnemy(enemy, callback) {
    if (!enemy || !enemy.isAlive) {
      callback?.()
      return
    }

    if (!enemy.skills || enemy.skills.length === 0) {
      session.battleLog.push(`${enemy.name} 没有可用技能`)
      callback?.()
      return
    }

    const choice = enemyAiChoose(enemy, session.teamMembers)
    if (!choice || !choice.target || !choice.skill) {
      session.battleLog.push(`${enemy.name} 无法行动`)
      callback?.()
      return
    }

    enemy.isHighlighted = true
    if (onAnimationTrigger.value) {
      onAnimationTrigger.value.triggerAttack?.(enemy.id)
      setTimeout(() => {
        onAnimationTrigger.value.triggerHit?.(choice.target.id)
      }, 200)
    }

    const { totalDamage, isCrit, hits } = calculateDamage(enemy, choice.target, choice.skill)
    choice.target.hp = Math.max(0, choice.target.hp - totalDamage)

    const critText = isCrit ? ' 💥暴击！' : ''
    session.battleLog.push(`${enemy.name} 使用 [${choice.skill.name}] 对 ${choice.target.name} 造成 ${totalDamage} 点伤害${critText}`)

    if (choice.skill.effects?.length > 0) {
      applySkillEffects(enemy, choice.target, choice.skill)
    }

    if (choice.skill.cooldown > 0) {
      choice.skill.currentCooldown = choice.skill.cooldown
    }

    if (choice.target.hp <= 0) {
      choice.target.isAlive = false
      choice.target.hasActed = true
      session.battleLog.push(`${choice.target.name} 被击败了！`)
    }

    setTimeout(() => { enemy.isHighlighted = false }, 800)

    saveBattleSession(session)
    checkBattleEnd()

    if (session.status === 'battle') {
      callback?.()
    }
  }

  /**
   * 敌方阶段结束，回到玩家阶段
   */
  function _backToPlayerPhase() {
    if (session.status !== 'battle') return

    // 重置己方行动状态
    session.teamMembers.forEach(m => {
      m.hasActed = false
    })

    session.phase = 'player'
    session.selectedPlayerId = null
    session.pendingAction = null

    session.battleLog.push(`━━━ 第 ${session.roundNumber} 回合 · 玩家行动 ━━━`)

    saveBattleSession(session)
  }

  /**
   * 检查战斗是否结束
   */
  function checkBattleEnd() {
    const aliveMembers = (session.teamMembers || []).filter(m => m.isAlive)
    if (aliveMembers.length === 0) {
      session.status = 'defeat'
      session.battleLog.push('━━━ 队伍全灭，战斗失败 ━━━')
      saveBattleSession(session)
      archiveBattle(session)
      clearBattleSession()
      return
    }

    const aliveEnm = (currentWaveEnemies.value || []).filter(e => e.isAlive)
    if (aliveEnm.length === 0) {
      handleWaveVictory()
      return
    }
  }

  /**
   * 处理波次胜利
   */
  function handleWaveVictory() {
    session.status = 'wave_clear'
    session.battleLog.push('━━━ 战斗胜利！━━━')

    const wave = currentWaveData.value
    if (wave?.dropTable && wave.dropTable.length > 0) {
      const drops = wave.dropTable.map(item => ({
        ...item,
        id: `${item.id}_${Date.now()}_${randomInt(100, 999)}`,
      }))
      session.battleBackpack.push(...drops)
      addToBattleBackpack(drops)
      session.waveDropHistory.push(...drops)

      drops.forEach(drop => {
        session.battleLog.push(`获得掉落：${drop.icon} ${drop.name}`)
      })
    }

    if (session.currentWave >= 2) {
      session.status = 'victory'
      session.battleLog.push('━━━ 恭喜！全部三场战斗胜利！━━━')
      archiveBattle(session)
      clearBattleSession()
    }

    saveBattleSession(session)
  }

  /**
   * 进入下一场战斗
   */
  function startNextWave() {
    if (session.currentWave >= 2) return

    session.currentWave++
    session.battleLog = []
    session.roundNumber = 1
    startWave()
  }

  /**
   * 玩家选择技能
   */
  function selectSkill(skill) {
    if (session.phase !== 'player') return
    if (!session.selectedPlayerId) return

    const actor = session.teamMembers?.find(m => m.id === session.selectedPlayerId)
    if (!actor || !actor.isAlive) return

    // 检查冷却
    if ((skill.currentCooldown || 0) > 0) return

    // 治疗类技能
    if (skill.type === 'heal') {
      executeHeal(actor, skill)
      return
    }

    // 非指向性技能（全体/随机/前排/后排）直接执行
    const autoTargetModes = ['all', 'random', 'front', 'back', 'self']
    if (autoTargetModes.includes(skill.targetMode)) {
      executeAutoSkill(actor, skill)
      return
    }

    // 单体攻击技能需要选择目标
    session.pendingAction = { type: 'skill', skill }

    saveBattleSession(session)
  }

  /**
   * 执行非指向性技能（全体/随机等）
   */
  function executeAutoSkill(actor, skill) {
    const targets = currentWaveEnemies.value.filter(e => e.isAlive)
    if (targets.length === 0) {
      session.battleLog.push(`${actor.name} 使用了 [${skill.name}]，但没有可用目标`)
      _markActed(actor)
      return
    }

    if (skill.targetMode === 'all') {
      targets.forEach(target => {
        const { totalDamage, isCrit } = calculateDamage(actor, target, skill)
        target.hp = Math.max(0, target.hp - totalDamage)
        const critText = isCrit ? ' 💥暴击！' : ''
        session.battleLog.push(`${actor.name} 使用 [${skill.name}] 对 ${target.name} 造成 ${totalDamage} 点伤害${critText}`)
        if (skill.effects?.length > 0) {
          applySkillEffects(actor, target, skill)
        }
      })
    } else if (skill.targetMode === 'random') {
      const hitCount = skill.hitCount || 1
      for (let i = 0; i < hitCount; i++) {
        const target = targets[Math.floor(Math.random() * targets.length)]
        if (target && target.isAlive) {
          const { totalDamage, isCrit } = calculateDamage(actor, target, skill)
          target.hp = Math.max(0, target.hp - totalDamage)
          const critText = isCrit ? ' 💥暴击！' : ''
          session.battleLog.push(`${actor.name} 使用 [${skill.name}] 对 ${target.name} 造成 ${totalDamage} 点伤害${critText}`)
          if (skill.effects?.length > 0) {
            applySkillEffects(actor, target, skill)
          }
        }
      }
    } else {
      const target = targets[0]
      const { totalDamage, isCrit } = calculateDamage(actor, target, skill)
      target.hp = Math.max(0, target.hp - totalDamage)
      const critText = isCrit ? ' 💥暴击！' : ''
      session.battleLog.push(`${actor.name} 使用 [${skill.name}] 对 ${target.name} 造成 ${totalDamage} 点伤害${critText}`)
      if (skill.effects?.length > 0) {
        applySkillEffects(actor, target, skill)
      }
    }

    // 设置冷却
    if (skill.cooldown > 0) {
      skill.currentCooldown = skill.cooldown
    }

    actor.isHighlighted = true
    setTimeout(() => { actor.isHighlighted = false }, 800)

    _markActed(actor)
    saveBattleSession(session)
    checkBattleEnd()
  }

  /**
   * 处理技能附加效果
   */
  function applySkillEffects(attacker, defender, skill) {
    skill.effects.forEach(effect => {
      if (Math.random() < (effect.chance || 1.0)) {
        const debuff = { ...effect, source: attacker.id, isBuff: false }
        defender.debuffs = defender.debuffs || []
        const existing = defender.debuffs.find(d => d.type === effect.type)
        if (existing) {
          existing.duration = effect.duration
        } else {
          defender.debuffs.push({ ...debuff })
        }
        if (effect.type) {
          session.battleLog.push(`  → ${defender.name} 受到 [${effect.type}] 效果影响`)
        }
      }
    })
  }

  /**
   * 玩家选择攻击目标
   */
  function selectTarget(targetId) {
    if (!session.pendingAction) return
    if (!session.selectedPlayerId) return

    const actor = session.teamMembers?.find(m => m.id === session.selectedPlayerId)
    if (!actor) return

    const { type, skill, item } = session.pendingAction

    if (type === 'skill') {
      const target = currentWaveEnemies.value.find(e => e.id === targetId)
      if (!target || !target.isAlive) return

      executeAttack(actor, target, skill)
    } else if (type === 'item') {
      // 伤害类道具对敌人使用
      const target = currentWaveEnemies.value.find(e => e.id === targetId && e.isAlive)
      if (!target) return
      handleItemUse(actor, targetId, item)

      // 消耗道具
      if (item.usageCount > 1) {
        item.usageCount--
      } else {
        const idx = session.battleBackpack?.findIndex(i => i.id === item.id)
        if (idx >= 0) session.battleBackpack.splice(idx, 1)
      }

      _markActed(actor)
      session.pendingAction = null
      saveBattleSession(session)
      checkBattleEnd()
      return
    }

    session.pendingAction = null
    _markActed(actor)
    saveBattleSession(session)
    checkBattleEnd()
  }

  /**
   * 对自己方角色使用治疗/增益技能
   */
  function executeHeal(actor, skill) {
    const targets = session.teamMembers.filter(m => m.isAlive)

    const calcHealValue = (caster, target) => {
      const mult = skill.damageMultiplier || 0
      const baseHeal = mult > 0
        ? Math.round(mult * (caster.attack || 0))
        : Math.round((caster.maxHp || 100) * 0.1)
      return Math.max(1, baseHeal)
    }

    if (skill.targetMode === 'all') {
      targets.forEach(target => {
        const healValue = calcHealValue(actor, target)
        const actualHeal = calculateHeal(actor, target, healValue)
        target.hp = Math.min(target.maxHp, target.hp + actualHeal)
        session.battleLog.push(`${actor.name} 使用 [${skill.name}] 为 ${target.name} 恢复了 ${actualHeal} 点生命值！`)
      })
    } else if (skill.targetMode === 'self') {
      const healAmount = calcHealValue(actor, actor)
      actor.hp = Math.min(actor.maxHp, actor.hp + healAmount)
      session.battleLog.push(`${actor.name} 使用 [${skill.name}] 恢复了 ${healAmount} 点生命值！`)
    } else {
      const target = targets.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]
      if (target) {
        const healValue = calcHealValue(actor, target)
        const actualHeal = calculateHeal(actor, target, healValue)
        target.hp = Math.min(target.maxHp, target.hp + actualHeal)
        session.battleLog.push(`${actor.name} 使用 [${skill.name}] 为 ${target.name} 恢复了 ${actualHeal} 点生命值！`)
      }
    }

    if (skill.cooldown > 0) {
      skill.currentCooldown = skill.cooldown
    }

    _markActed(actor)
    saveBattleSession(session)
    checkBattleEnd()
  }

  /**
   * 执行攻击
   */
  function executeAttack(attacker, defender, skill) {
    attacker.isHighlighted = true

    // 触发动画回调
    if (onAnimationTrigger.value) {
      onAnimationTrigger.value.triggerAttack?.(attacker.id)
      setTimeout(() => {
        onAnimationTrigger.value.triggerHit?.(defender.id)
      }, 200)
    }

    // 播放命中音效
    playHitSound()

    // 受伤音效（仅己方队伍受伤时播放）
    if (session.teamMembers?.find(m => m.id === defender.id)) {
      playInjurySound()
    }

    const { totalDamage, isCrit, hits } = calculateDamage(attacker, defender, skill)
    defender.hp = Math.max(0, defender.hp - totalDamage)

    const critText = isCrit ? ' 💥暴击！' : ''
    if (hits.length > 1) {
      session.battleLog.push(`${attacker.name} 使用 [${skill.name}] 对 ${defender.name} 造成 ${totalDamage} 点伤害（${hits.length}段）${critText}`)
    } else {
      session.battleLog.push(`${attacker.name} 使用 [${skill.name}] 对 ${defender.name} 造成 ${totalDamage} 点伤害${critText}`)
    }

    // 处理技能附加效果
    if (skill.effects && skill.effects.length > 0) {
      skill.effects.forEach(effect => {
        const debuff = {
          ...effect,
          source: attacker.id,
          isBuff: false,
        }
        defender.debuffs = defender.debuffs || []
        if (effect.stackable) {
          const existing = defender.debuffs.find(d => d.type === effect.type)
          if (existing) {
            existing.stacks = (existing.stacks || 1) + 1
            existing.duration = effect.duration
          } else {
            defender.debuffs.push({ ...debuff, stacks: 1 })
          }
        } else {
          defender.debuffs.push(debuff)
        }
        session.battleLog.push(`${defender.name} 受到 [${effect.name}] 影响！`)
      })
    }

    if (skill.cooldown > 0) {
      skill.currentCooldown = skill.cooldown
    }

    if (defender.hp <= 0) {
      defender.isAlive = false
      defender.isHighlighted = false
      session.battleLog.push(`${defender.name} 被击败了！`)
    }

    setTimeout(() => { attacker.isHighlighted = false }, 800)

    saveBattleSession(session)
    checkBattleEnd()
  }

  /**
   * 使用背包道具（旧接口，已废弃）
   */
  function useBattleItem(item) {
    if (session.phase !== 'player') return
    if (!session.selectedPlayerId) return

    const actor = session.teamMembers?.find(m => m.id === session.selectedPlayerId)
    if (!actor || !actor.isAlive) return

    if (item.effectType === 'heal') {
      const healAmount = item.value
      actor.hp = Math.min(actor.maxHp, actor.hp + healAmount)
      session.battleLog.push(`${actor.name} 使用了 ${item.icon} ${item.name}，恢复了 ${healAmount} 点生命值！`)
      _markActed(actor)
      saveBattleSession(session)
      checkBattleEnd()
      return
    }

    if (item.effectType === 'damage') {
      session.pendingAction = { type: 'item', item }
      saveBattleSession(session)
      return
    }

    if (item.effectType === 'debuff_cleanse') {
      actor.debuffs = []
      session.battleLog.push(`${actor.name} 使用了 ${item.icon} ${item.name}，清除了所有负面状态！`)
      _markActed(actor)
      saveBattleSession(session)
      checkBattleEnd()
      return
    }

    if (item.effectType === 'attackUp' || item.effectType === 'defenseUp') {
      const buffType = item.effectType === 'attackUp' ? 'attackUp' : 'defenseUp'
      actor.buffs = actor.buffs || []
      actor.buffs.push({
        type: buffType,
        name: item.effectType === 'attackUp' ? '攻击提升' : '防御提升',
        valuePerTick: item.value,
        duration: item.duration || 3,
        isBuff: true,
        stackable: false,
      })
      session.battleLog.push(`${actor.name} 使用了 ${item.icon} ${item.name}，${item.effectType === 'attackUp' ? '攻击力' : '防御力'}提升！`)
      _markActed(actor)
      saveBattleSession(session)
      checkBattleEnd()
      return
    }
  }

  /**
   * 道具对己方角色生效
   */
  function executeItemOnAlly(targetId, item) {
    const target = session.teamMembers?.find(m => m.id === targetId)
    if (!target || !target.isAlive) return

    if (item.effectType === 'heal') {
      const healAmount = item.value
      target.hp = Math.min(target.maxHp, target.hp + healAmount)
      session.battleLog.push(`${target.name} 使用了 ${item.icon} ${item.name}，恢复了 ${healAmount} 点生命值！`)
      _markActed(target)
    } else if (item.effectType === 'debuff_cleanse') {
      target.debuffs = []
      session.battleLog.push(`${target.name} 使用了 ${item.icon} ${item.name}，清除了所有负面状态！`)
      _markActed(target)
    } else if (item.effectType === 'attackUp' || item.effectType === 'defenseUp') {
      const buffType = item.effectType
      target.buffs = target.buffs || []
      target.buffs.push({
        type: buffType,
        name: item.effectType === 'attackUp' ? '攻击提升' : '防御提升',
        valuePerTick: item.value,
        duration: item.duration || 3,
        isBuff: true,
        stackable: false,
      })
      session.battleLog.push(`${target.name} 使用了 ${item.icon} ${item.name}，${item.effectType === 'attackUp' ? '攻击力' : '防御力'}提升！`)
      _markActed(target)
    }

    // 消耗次数
    if (item.usageCount > 1) {
      item.usageCount--
    } else {
      const idx = session.battleBackpack?.findIndex(i => i.id === item.id)
      if (idx >= 0) session.battleBackpack.splice(idx, 1)
    }

    saveBattleSession(session)
    checkBattleEnd()
  }

  /**
   * 道具对敌人使用
   */
  function handleItemUse(actor, targetId, item) {
    if (item.effectType === 'damage') {
      const target = currentWaveEnemies.value.find(e => e.id === targetId && e.isAlive)
      if (!target) return

      const elementMult = getElementMultiplier(item.damageType || 'physical', 'physical')
      const damage = Math.max(1, Math.round(item.value * elementMult))
      target.hp = Math.max(0, target.hp - damage)

      session.battleLog.push(`${actor.name} 对 ${target.name} 使用了 ${item.icon} ${item.name}，造成 ${damage} 点伤害！`)

      if (target.hp <= 0) {
        target.isAlive = false
        session.battleLog.push(`${target.name} 被击败了！`)
      }

      // 消耗次数
      if (item.usageCount > 1) {
        item.usageCount--
      } else {
        const idx = session.battleBackpack?.findIndex(i => i.id === item.id)
        if (idx >= 0) session.battleBackpack.splice(idx, 1)
      }
    }
  }

  /**
   * 获取可用的目标列表
   */
  function getAvailableTargets() {
    if (!session.pendingAction) return []

    const { type, skill, item } = session.pendingAction

    if (type === 'skill') {
      return currentWaveEnemies.value.filter(e => e.isAlive)
    }

    if (type === 'item') {
      if (item.effectType === 'damage') {
        return currentWaveEnemies.value.filter(e => e.isAlive)
      }
    }

    return []
  }

  /**
   * 获取可用的队友目标（治疗/增益）
   */
  function getAllyTargets() {
    if (!session.pendingAction) return []
    const { skill } = session.pendingAction
    if (skill?.type === 'heal' || skill?.type === 'support') {
      return session.teamMembers.filter(m => m.isAlive)
    }
    return []
  }

  /**
   * 标记角色本回合已行动
   */
  function _markActed(character) {
    const member = session.teamMembers?.find(m => m.id === character.id)
    if (member) {
      member.hasActed = true
    }
    session.selectedPlayerId = null
    session.pendingAction = null
  }

  return {
    // 状态
    session,
    isLoading,
    generatingProgress,
    onAnimationTrigger,

    // 计算属性
    currentWaveData,
    currentWaveEnemies,
    aliveEnemies,
    aliveTeammates,
    isBattleOver,
    isWaveComplete,
    isEnemyPhase,
    isAllPlayersActed,
    remainingPlayerCount,

    // 方法
    startWave,
    selectPlayerCharacter,
    deselectPlayerCharacter,
    skipPlayerTurn,
    endRound,
    startNextWave,
    selectSkill,
    selectTarget,
    useBattleItem,
    getAvailableTargets,
    getAllyTargets,
    executeAttack,
    saveBattleSession,
    loadBattleSession,
    clearBattleSession,
    createBattleSession,
    calculateDamage,
  }
}
