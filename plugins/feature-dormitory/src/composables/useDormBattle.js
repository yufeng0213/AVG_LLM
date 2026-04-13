/**
 * 战斗核心逻辑 Composable
 * 管理战斗状态、回合管理、伤害计算、波次切换、敌方 AI
 */

import { ref, reactive, computed } from 'vue'
import { addToBattleBackpack } from '../services/battleBackpackService.js'

const BATTLE_SESSION_KEY = 'avg_llm_battle_session_v1'
const BATTLE_HISTORY_KEY = 'avg_llm_battle_history_v1'

// ==================== 工具函数 ====================

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
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
 * @param {Object} attacker - 攻击方
 * @param {Object} defender - 防御方
 * @param {Object} skill - 使用的技能
 * @returns {Object} { totalDamage, isCrit, hits: [{damage, isCrit}] }
 */
export function calculateDamage(attacker, defender, skill) {
  const hits = []
  const hitCount = skill.hitCount || 1

  for (let i = 0; i < hitCount; i++) {
    const baseDamage = attacker.attack * skill.damageMultiplier
    const defenseReduction = baseDamage * (100 / (100 + defender.defense))

    const elementMult = getElementMultiplier(skill.damageType, 'physical')
    // 检查防御方是否有元素相关 debuff 影响

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
 * @param {Object} character - 角色
 * @returns {Array} 本回合的 debuff 伤害记录
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
 * @param {Object} enemy - 敌方角色
 * @param {Array} playerTeam - 我方队伍
 * @returns {Object|null} { target, skill }
 */
export function enemyAiChoose(enemy, playerTeam) {
  const aliveTargets = playerTeam.filter(c => c.isAlive)
  if (aliveTargets.length === 0) {
    console.warn('[enemyAiChoose] 没有存活目标, playerTeam:', playerTeam?.length, 'teamMembers:', playerTeam?.map(m => ({ name: m.name, isAlive: m.isAlive })))
    return null
  }

  // 优先攻击最低 HP 的目标
  const target = aliveTargets.sort((a, b) => a.hp - b.hp)[0]

  // 确保 skills 存在
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

// ==================== 行动顺序 ====================

/**
 * 根据速度生成行动顺序
 * @param {Array} allCharacters - 所有存活角色
 * @returns {Array} 角色 ID 列表
 */
export function generateTurnOrder(allCharacters) {
  const alive = allCharacters.filter(c => c.isAlive)
  // 按速度降序排列，速度相同随机
  return alive
    .sort((a, b) => {
      const speedDiff = b.speed - a.speed
      if (speedDiff !== 0) return speedDiff
      return Math.random() - 0.5
    })
    .map(c => c.id)
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
      buffs: [],
      debuffs: [],
    })),
    battleBackpack: [],
    turnOrder: [],
    currentTurnIndex: 0,
    isPlayerChoosing: false,
    pendingAction: null, // { type: 'skill'|'item', source, skill/item, targetMode }
    waveDropHistory: [],
    battleLog: [],
    status: 'battle', // 'generating' | 'battle' | 'wave_clear' | 'victory' | 'defeat'
    currentWaveStory: battleData.waves[0]?.backgroundStory || '',
    createdAt: Date.now(),
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
    // 保留最近 50 条记录
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

  const isMyTurn = computed(() => {
    if (session.status !== 'battle' || !session.turnOrder.length) return false
    const currentId = session.turnOrder[session.currentTurnIndex]
    const member = session.teamMembers?.find(m => m.id === currentId)
    return !!member
  })

  // ==================== 战斗操作 ====================

  /**
   * 开始新波次
   */
  function startWave() {
    const wave = currentWaveData.value
    if (!wave) return

    // 确保敌方角色状态初始化
    wave.enemies.forEach(e => {
      e.isAlive = true
      e.isHighlighted = false
    })

    session.status = 'battle'
    session.currentWaveStory = wave.backgroundStory || ''
    session.battleLog.push(`━━━ 第 ${session.currentWave + 1} 场战斗开始 ━━━`)
    session.battleLog.push(wave.backgroundStory || '战斗开始了...')

    // 生成行动顺序
    const allChars = [...session.teamMembers, ...wave.enemies]
    session.turnOrder = generateTurnOrder(allChars)
    session.currentTurnIndex = 0
    session.isPlayerChoosing = false

    saveBattleSession(session)
  }

  /**
   * 推进到下一个行动
   */
  function nextTurn() {
    if (session.status !== 'battle') return

    // 推进索引
    session.currentTurnIndex++

    // 检查是否所有角色都行动完毕
    if (session.currentTurnIndex >= session.turnOrder.length) {
      // 减少所有技能冷却
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

      // 重新生成行动顺序
      const allAlive = [...session.teamMembers, ...(currentWaveEnemies.value || [])].filter(c => c.isAlive)
      session.turnOrder = generateTurnOrder(allAlive)
      session.currentTurnIndex = 0
    }

    // 跳过已死亡角色的回合
    while (
      session.currentTurnIndex < session.turnOrder.length &&
      !getCurrentActor()
    ) {
      session.currentTurnIndex++
    }

    // 检查战斗是否结束
    checkBattleEnd()

    // 如果当前是我方角色回合，等待玩家选择
    if (session.status === 'battle' && isMyTurn.value) {
      const currentMember = getCurrentActor()
      if (currentMember) {
        session.isPlayerChoosing = true
        session.pendingAction = null
      }
    } else if (session.status === 'battle') {
      // 敌方回合，自动执行
      session.isPlayerChoosing = false
    }

    saveBattleSession(session)
  }

  /**
   * 获取当前行动的角色
   */
  function getCurrentActor() {
    if (!session.turnOrder.length) return null
    const currentId = session.turnOrder[session.currentTurnIndex]
    // 先在我方队伍中查找
    const member = session.teamMembers?.find(m => m.id === currentId)
    if (member) return member
    // 再在敌方中查找
    const enemy = currentWaveEnemies.value?.find(e => e.id === currentId)
    return enemy || null
  }

  /**
   * 检查战斗是否结束
   */
  function checkBattleEnd() {
    // 检查我方是否全灭
    const aliveMembers = (session.teamMembers || []).filter(m => m.isAlive)
    if (aliveMembers.length === 0) {
      session.status = 'defeat'
      session.battleLog.push('━━━ 队伍全灭，战斗失败 ━━━')
      saveBattleSession(session)
      archiveBattle(session)
      clearBattleSession()
      return
    }

    // 检查敌方是否全灭
    const aliveEnm = (currentWaveEnemies.value || []).filter(e => e.isAlive)
    if (aliveEnm.length === 0) {
      // 当前波次胜利
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

    // 收集掉落道具
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

    // 检查是否还有下一波
    if (session.currentWave >= 2) {
      // 三场全部胜利
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
    startWave()
  }

  /**
   * 玩家跳过当前回合
   */
  function skipTurn() {
    if (!isMyTurn.value) return
    const actor = getCurrentActor()
    if (!actor) return
    session.battleLog.push(`${actor.name} 跳过了回合`)
    session.isPlayerChoosing = false
    session.pendingAction = null
    saveBattleSession(session)
    nextTurn()
  }

  /**
   * 玩家选择技能并执行
   * @param {Object} skill - 选择的技能
   */
  function selectSkill(skill) {
    if (!isMyTurn.value) return

    const actor = getCurrentActor()
    if (!actor) return

    // 检查冷却
    if ((skill.currentCooldown || 0) > 0) return

    // 检查技能类型
    if (skill.type === 'heal') {
      executeHeal(actor, skill)
      return
    }

    // 非指向性技能（全体/随机/前排/后排）直接执行，不需要选择目标
    const autoTargetModes = ['all', 'random', 'front', 'back']
    if (autoTargetModes.includes(skill.targetMode)) {
      executeAutoSkill(actor, skill)
      return
    }

    // 单体攻击技能需要选择目标
    session.pendingAction = { type: 'skill', skill }
    session.isPlayerChoosing = false

    saveBattleSession(session)
  }

  /**
   * 执行非指向性技能（全体/随机等）
   */
  function executeAutoSkill(actor, skill) {
    const targets = currentWaveEnemies.value.filter(e => e.isAlive)
    if (targets.length === 0) {
      session.battleLog.push(`${actor.name} 使用了 [${skill.name}]，但没有可用目标`)
      nextTurn()
      return
    }

    if (skill.targetMode === 'all') {
      // 对全体敌人造成伤害
      let totalAllDmg = 0
      targets.forEach(target => {
        const { totalDamage, isCrit } = calculateDamage(actor, target, skill)
        target.hp = Math.max(0, target.hp - totalDamage)
        const critText = isCrit ? ' 💥暴击！' : ''
        session.battleLog.push(`${actor.name} 使用 [${skill.name}] 对 ${target.name} 造成 ${totalDamage} 点伤害${critText}`)
        totalAllDmg += totalDamage
        // 处理附加效果
        if (skill.effects?.length > 0) {
          applySkillEffects(actor, target, skill)
        }
      })
    } else if (skill.targetMode === 'random') {
      // 随机攻击 hitCount 个敌人（可重复）
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
      // front/back 简化处理：攻击第一个存活敌人
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

    saveBattleSession(session)
    checkBattleEnd()
    if (session.status === 'battle') nextTurn()
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
   * 玩家选择目标
   * @param {string} targetId - 目标 ID
   */
  function selectTarget(targetId) {
    if (!session.pendingAction) return

    const actor = getCurrentActor()
    if (!actor) return

    const { type, skill, item } = session.pendingAction

    if (type === 'skill') {
      const target = currentWaveEnemies.value.find(e => e.id === targetId)
      if (!target || !target.isAlive) return

      executeAttack(actor, target, skill)
    } else if (type === 'item') {
      handleItemUse(actor, targetId, item)
    }

    session.pendingAction = null
    nextTurn()
  }

  /**
   * 对自己方角色使用治疗/增益技能
   * @param {Object} actor - 施法者
   * @param {Object} skill - 技能
   */
  function executeHeal(actor, skill) {
    const targets = session.teamMembers.filter(m => m.isAlive)

    if (skill.targetMode === 'all') {
      // 治疗全体
      targets.forEach(target => {
        const healValue = Math.round(skill.damageMultiplier * actor.attack)
        const actualHeal = calculateHeal(actor, target, healValue)
        target.hp = Math.min(target.maxHp, target.hp + actualHeal)
        session.battleLog.push(`${actor.name} 使用 [${skill.name}] 为 ${target.name} 恢复了 ${actualHeal} 点生命值！`)
      })
    } else if (skill.targetMode === 'self') {
      const healAmount = calculateHeal(actor, actor, skill.damageMultiplier * actor.attack)
      actor.hp = Math.min(actor.maxHp, actor.hp + healAmount)
      session.battleLog.push(`${actor.name} 使用 [${skill.name}] 恢复了 ${healAmount} 点生命值！`)
    } else {
      // 治疗当前 HP 百分比最低的队友
      const target = targets.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]
      if (target) {
        const healValue = Math.round(skill.damageMultiplier * actor.attack)
        const actualHeal = calculateHeal(actor, target, healValue)
        target.hp = Math.min(target.maxHp, target.hp + actualHeal)
        session.battleLog.push(`${actor.name} 使用 [${skill.name}] 为 ${target.name} 恢复了 ${actualHeal} 点生命值！`)
      }
    }

    if (skill.cooldown > 0) {
      skill.currentCooldown = skill.cooldown
    }

    session.isPlayerChoosing = false
    saveBattleSession(session)
    nextTurn()
  }

  /**
   * 执行攻击
   * @param {Object} attacker - 攻击方
   * @param {Object} defender - 防御方
   * @param {Object} skill - 技能
   */
  function executeAttack(attacker, defender, skill) {
    // 高亮攻击方
    attacker.isHighlighted = true

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

    // 设置冷却
    if (skill.cooldown > 0) {
      skill.currentCooldown = skill.cooldown
    }

    // 检查是否死亡
    if (defender.hp <= 0) {
      defender.isAlive = false
      defender.isHighlighted = false
      session.battleLog.push(`${defender.name} 被击败了！`)
    }

    // 取消高亮
    setTimeout(() => {
      attacker.isHighlighted = false
    }, 800)

    saveBattleSession(session)
    checkBattleEnd()
  }

  /**
   * 执行敌方 AI 回合
   */
  function executeEnemyTurn(enemy) {
    if (!enemy || !enemy.isAlive) return
    if (!enemy.skills || enemy.skills.length === 0) {
      session.battleLog.push(`${enemy.name} 没有可用技能，跳过`)
      nextTurn()
      return
    }

    const choice = enemyAiChoose(enemy, session.teamMembers)
    if (!choice || !choice.target || !choice.skill) {
      session.battleLog.push(`${enemy.name} 无法行动`)
      nextTurn()
      return
    }

    enemy.isHighlighted = true
    executeAttack(enemy, choice.target, choice.skill)

    setTimeout(() => {
      enemy.isHighlighted = false
    }, 800)
  }

  /**
   * 使用背包道具
   * @param {Object} item - 道具
   */
  function useBattleItem(item) {
    if (!isMyTurn.value) return

    const actor = getCurrentActor()
    if (!actor) return

    if (item.effectType === 'heal') {
      // 直接对自己使用
      const healAmount = item.value
      actor.hp = Math.min(actor.maxHp, actor.hp + healAmount)
      session.battleLog.push(`${actor.name} 使用了 ${item.icon} ${item.name}，恢复了 ${healAmount} 点生命值！`)
      session.isPlayerChoosing = false
      saveBattleSession(session)
      nextTurn()
      return
    }

    if (item.effectType === 'damage') {
      session.pendingAction = { type: 'item', item }
      session.isPlayerChoosing = false
      saveBattleSession(session)
      return
    }

    if (item.effectType === 'debuff_cleanse') {
      actor.debuffs = []
      session.battleLog.push(`${actor.name} 使用了 ${item.icon} ${item.name}，清除了所有负面状态！`)
      session.isPlayerChoosing = false
      saveBattleSession(session)
      nextTurn()
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
      session.isPlayerChoosing = false
      saveBattleSession(session)
      nextTurn()
      return
    }
  }

  /**
   * 处理道具对敌人使用
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
    }
  }

  /**
   * 获取可用的目标列表（根据当前 pending action）
   */
  function getAvailableTargets() {
    if (!session.pendingAction) return []

    const { type, skill, item } = session.pendingAction

    if (type === 'skill') {
      // 攻击类技能的目标是敌方
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

  return {
    // 状态
    session,
    isLoading,
    generatingProgress,

    // 计算属性
    currentWaveData,
    currentWaveEnemies,
    aliveEnemies,
    aliveTeammates,
    isBattleOver,
    isWaveComplete,
    isMyTurn,

    // 方法
    startWave,
    nextTurn,
    skipTurn,
    getCurrentActor,
    startNextWave,
    selectSkill,
    selectTarget,
    useBattleItem,
    getAvailableTargets,
    getAllyTargets,
    executeEnemyTurn,
    executeAttack,
    saveBattleSession,
    loadBattleSession,
    clearBattleSession,
    createBattleSession,
    calculateDamage,
  }
}
