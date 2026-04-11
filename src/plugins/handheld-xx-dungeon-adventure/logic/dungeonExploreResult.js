const EVENT_TYPES = new Set(['battle', 'boss', 'treasure', 'rest', 'trap'])

const fallbackClampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const fallbackRandomInt = (min, max) => {
  const nMin = Math.min(min, max)
  const nMax = Math.max(min, max)
  return Math.floor(Math.random() * (nMax - nMin + 1)) + nMin
}

const fallbackMergeBackpackItems = (baseList, incomingList) => {
  const base = Array.isArray(baseList) ? baseList : []
  const incoming = Array.isArray(incomingList) ? incomingList : []
  return [...base, ...incoming]
}

const fallbackFormatEnemyDropText = (drops) => {
  const list = Array.isArray(drops) ? drops : []
  if (list.length <= 0) return ''
  return list.map((item) => String(item?.name || '掉落')).join('、')
}

export const applyExploreResultToState = (targetState, scene, options = {}) => {
  const {
    normalizeState = null,
    createEnemyByFloor = null,
    calcTotalPower = null,
    randomInt = fallbackRandomInt,
    clampInt = fallbackClampInt,
    promoteByExp = null,
    drawEquipmentOne = null,
    maxEquipmentCount = 360,
    rollDungeonResourceDrops = null,
    mergeBackpackItems = fallbackMergeBackpackItems,
    formatEnemyDropText = fallbackFormatEnemyDropText,
    randomFn = Math.random,
  } = options || {}

  if (typeof normalizeState !== 'function') {
    throw new Error('applyExploreResultToState requires normalizeState')
  }

  const next = normalizeState(targetState)
  const rawEventType = String(scene?.eventType || '').trim().toLowerCase()
  const eventType = EVENT_TYPES.has(rawEventType) ? rawEventType : 'battle'
  next.lastScene = scene?.title || scene?.description || '地下城深处'

  if (eventType === 'battle' || eventType === 'boss') {
    const enemy = scene?.enemy || (typeof createEnemyByFloor === 'function'
      ? createEnemyByFloor(next.floor, eventType === 'boss')
      : { name: '地下城魔物', hp: 120, attack: 20, rewardCoins: 90, rewardGems: 26 })
    const power = typeof calcTotalPower === 'function' ? calcTotalPower(next) : 0
    const playerPower = power + Math.floor(next.hp * 0.08)
    const playerRoll = playerPower + randomInt(12, 52)
    const enemyRoll = enemy.attack + enemy.hp * 0.16 + randomInt(8, 48)
    const victory = playerRoll >= enemyRoll

    if (victory) {
      const rewardCoins = clampInt(enemy.rewardCoins, 1, 999999, 60)
      const rewardGems = clampInt(enemy.rewardGems, 1, 999999, 20)
      const rewardExp = Math.max(22, Math.round(enemy.attack * 1.2 + enemy.hp * 0.08))
      next.coins += rewardCoins
      next.gems += rewardGems
      next.exp += rewardExp
      const levelUps = typeof promoteByExp === 'function' ? promoteByExp(next) : 0
      next.floor += 1
      next.hp = Math.min(next.maxHp, next.hp + randomInt(6, 16))

      const rewardLogs = [
        `${eventType === 'boss' ? '首领' : '敌人'} ${enemy.name} 被击败。`,
        `获得 +${rewardCoins} 金币 / +${rewardGems} 星钻 / +${rewardExp} EXP。`,
      ]
      if (levelUps > 0) {
        rewardLogs.push(`队伍等级提升 ${levelUps} 级，当前 Lv.${next.level}。`)
      }

      const loot = scene?.loot || (randomFn() < (eventType === 'boss' ? 0.66 : 0.28)
        ? drawEquipmentOne?.(next.equipmentPity, false)?.equipment
        : null)
      if (loot) {
        next.equipments = [...next.equipments, loot].slice(-maxEquipmentCount)
        rewardLogs.push(`获得战利品：${loot.name}(${loot.rarity})。`)
      }

      const extraDrops = typeof rollDungeonResourceDrops === 'function'
        ? rollDungeonResourceDrops(next.floor, { source: eventType === 'boss' ? 'boss' : 'monster' })
        : []
      if (extraDrops.length > 0) {
        next.backpackItems = mergeBackpackItems(next.backpackItems, extraDrops)
        rewardLogs.push(`额外掉落：${formatEnemyDropText(extraDrops)}。`)
      }

      return {
        state: normalizeState(next),
        logs: [scene?.description, ...rewardLogs],
      }
    }

    const damage = Math.max(18, Math.round(enemy.attack * 0.7 + randomInt(10, 28)))
    next.hp = Math.max(0, next.hp - damage)
    const logs = [
      scene?.description,
      `遭遇 ${enemy.name} 失利，受到 ${damage} 点伤害。`,
    ]
    if (next.hp <= 0) {
      const coinLoss = Math.min(next.coins, Math.round(next.coins * 0.3))
      const gemLoss = Math.min(next.gems, Math.round(next.gems * 0.15))
      next.coins -= coinLoss
      next.gems -= gemLoss
      next.hp = 0
      logs.push('💀 队伍全军覆没！')
      logs.push(`损失 ${coinLoss} 金币和 ${gemLoss} 星钻，倒在当前层。`)
    }
    return {
      state: normalizeState(next),
      logs,
    }
  }

  if (eventType === 'rest') {
    const heal = Math.max(14, Math.round(next.maxHp * 0.25))
    next.hp = Math.min(next.maxHp, next.hp + heal)
    next.exp += randomInt(8, 22)
    if (typeof promoteByExp === 'function') {
      promoteByExp(next)
    }
    return {
      state: normalizeState(next),
      logs: [scene?.description, `队伍休整完成，恢复 ${heal} 点生命。`],
    }
  }

  if (eventType === 'treasure') {
    const gainCoins = randomInt(70, 190) + next.floor * 5
    const gainGems = randomInt(18, 44) + Math.floor(next.floor * 0.6)
    next.coins += gainCoins
    next.gems += gainGems
    const loot = scene?.loot || (randomFn() < 0.46 ? drawEquipmentOne?.(next.equipmentPity, true)?.equipment : null)
    const logs = [
      scene?.description,
      `宝箱开启：+${gainCoins} 金币 / +${gainGems} 星钻。`,
    ]
    if (loot) {
      next.equipments = [...next.equipments, loot].slice(-maxEquipmentCount)
      logs.push(`额外获得：${loot.name}(${loot.rarity})。`)
    }
    const treasureDrops = typeof rollDungeonResourceDrops === 'function'
      ? rollDungeonResourceDrops(next.floor, { source: 'treasure', guaranteedCount: 2 })
      : []
    if (treasureDrops.length > 0) {
      next.backpackItems = mergeBackpackItems(next.backpackItems, treasureDrops)
      logs.push(`宝箱掉落：${formatEnemyDropText(treasureDrops)}。`)
    }
    return {
      state: normalizeState(next),
      logs,
    }
  }

  const trapDamage = Math.max(12, Math.round(next.maxHp * 0.18) + randomInt(0, 12))
  const gemLoss = Math.min(next.gems, randomInt(6, 18))
  next.hp = Math.max(0, next.hp - trapDamage)
  next.gems -= gemLoss
  const logs = [scene?.description, `触发陷阱，损失 ${trapDamage} HP 与 ${gemLoss} 星钻。`]

  if (next.hp <= 0) {
    const coinLoss = Math.min(next.coins, Math.round(next.coins * 0.3))
    const extraGemLoss = Math.min(next.gems, Math.round(next.gems * 0.15))
    next.coins -= coinLoss
    next.gems -= extraGemLoss
    next.hp = 0
    logs.push('💀 队伍全军覆没！')
    logs.push(`损失 ${coinLoss} 金币和 ${gemLoss + extraGemLoss} 星钻，倒在当前层。`)
  }

  return {
    state: normalizeState(next),
    logs,
  }
}
