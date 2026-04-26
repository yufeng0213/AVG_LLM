import { ref, computed } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'
import { CHARACTER_CARD_DEFS, getRarityConfig } from '../services/cardData.js'

const TEAM_STORAGE_KEY = 'avg_llm_character_card_team_v1'

const MAX_TEAM_SIZE = 5

export function useTeamEdit() {
  const teamInstanceIds = ref([])
  const loaded = ref(false)

  async function load() {
    try {
      const saved = await kvStorage.get(TEAM_STORAGE_KEY)
      teamInstanceIds.value = Array.isArray(saved) ? saved : []
    } catch {
      teamInstanceIds.value = []
    }
    loaded.value = true
  }

  async function save() {
    await kvStorage.set(TEAM_STORAGE_KEY, teamInstanceIds.value.slice())
  }

  /**
   * 获取编队中实际存在的卡牌详情
   */
  function getTeamMembers(ownedCards) {
    return teamInstanceIds.value
      .map(id => {
        const card = ownedCards?.find(c => c.instanceId === id)
        if (!card) return null
        const def = CHARACTER_CARD_DEFS.find(d => d.id === card.cardId)
        if (!def) return null
        return { card, def }
      })
      .filter(Boolean)
  }

  /**
   * 添加卡牌到编队
   */
  async function addToTeam(instanceId) {
    if (teamInstanceIds.value.includes(instanceId)) {
      return { success: false, error: '已在队伍中' }
    }
    if (teamInstanceIds.value.length >= MAX_TEAM_SIZE) {
      return { success: false, error: `队伍已满（最多${MAX_TEAM_SIZE}人）` }
    }
    teamInstanceIds.value.push(instanceId)
    await save()
    return { success: true }
  }

  /**
   * 从编队移除卡牌
   */
  async function removeFromTeam(instanceId) {
    const idx = teamInstanceIds.value.indexOf(instanceId)
    if (idx < 0) return { success: false, error: '不在队伍中' }
    teamInstanceIds.value.splice(idx, 1)
    await save()
    return { success: true }
  }

  /**
   * 设置编队（批量替换）
   */
  async function setTeam(ids) {
    teamInstanceIds.value = ids.slice(0, MAX_TEAM_SIZE)
    await save()
    return { success: true }
  }

  /**
   * 清空编队
   */
  async function clearTeam() {
    teamInstanceIds.value = []
    await save()
  }

  const teamSize = computed(() => teamInstanceIds.value.length)
  const isFull = computed(() => teamInstanceIds.value.length >= MAX_TEAM_SIZE)

  // 将卡牌数据转换为战斗队形成员格式
  function toBattleMember(card, def, index) {
    const rarityCfg = getRarityConfig(def.rarity)
    const levelBonus = (card.level - 1) * 0.05
    const starBonus = (card.stars - 1) * 0.1
    const totalMultiplier = 1 + levelBonus + starBonus

    const stats = {
      attack: Math.round(def.baseStats.attack * totalMultiplier),
      defense: Math.round(def.baseStats.defense * totalMultiplier),
      charm: Math.round(def.baseStats.charm * totalMultiplier),
      luck: Math.round(def.baseStats.luck * totalMultiplier),
    }

    // 卡牌技能转为战斗技能
    const skills = def.skills.map(s => {
      const skillType = s.type === 'active' ? 'attack' : 'support'
      let damageMultiplier = 0
      let targetMode = 'self'
      let cooldown = s.cooldown || 3

      switch (s.effect) {
        case 'attack_boost':
        case 'charm_boost':
        case 'luck_boost':
          damageMultiplier = 1.0 + (s.value / 100)
          targetMode = 'self'
          break
        case 'defense_boost':
          damageMultiplier = 1.0 + (s.value / 100)
          targetMode = 'all_allies'
          break
        case 'all_stats_boost':
          damageMultiplier = 1.0 + (s.value / 100)
          targetMode = 'all_allies'
          break
        default:
          damageMultiplier = 1.2
          targetMode = 'single'
      }

      return {
        id: s.id,
        name: s.name,
        icon: skillType === 'attack' ? '⚔️' : '✨',
        description: `${s.effect} (+${s.value}%)`,
        type: skillType,
        targetMode,
        damageType: 'physical',
        damageMultiplier,
        hitCount: 1,
        cooldown,
        effects: [],
      }
    })

    // 基础技能：普通攻击
    skills.unshift({
      id: `basic_atk_${card.instanceId}`,
      name: '普通攻击',
      icon: '👊',
      description: '基础攻击',
      type: 'attack',
      targetMode: 'single',
      damageType: 'physical',
      damageMultiplier: 1.0,
      hitCount: 1,
      cooldown: 0,
      effects: [],
    })

    return {
      id: card.instanceId,
      name: `${def.characterName}·${def.name}`,
      portrait: '',
      isPlayer: false,
      hp: 100 + stats.attack * 2,
      maxHp: 100 + stats.attack * 2,
      attack: stats.attack,
      defense: stats.defense,
      speed: stats.luck + stats.charm,
      critRate: Math.min(50, stats.charm / 5),
      critDmg: 150 + stats.luck * 2,
      position: index + 1,
      cardId: card.cardId,
      cardLevel: card.level,
      cardStars: card.stars,
      skills,
    }
  }

  return {
    teamInstanceIds,
    teamSize,
    isFull,
    loaded,
    load,
    save,
    addToTeam,
    removeFromTeam,
    setTeam,
    clearTeam,
    getTeamMembers,
    toBattleMember,
    MAX_TEAM_SIZE,
  }
}
