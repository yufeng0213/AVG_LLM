// 小人引擎 - 数据结构、规范化、克隆

import {
  NEED_MAX_VALUE,
  NEED_DEFAULT_CONFIG,
  SKILL_MAX_LEVEL,
  MAX_PAWN_COUNT,
  ROOM_DEFAULT_WIDTH,
  ROOM_DEFAULT_HEIGHT,
} from '../../config/constants.js'

const fallbackMakeId = (prefix = 'pawn') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const fallbackClampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export const createPawnEngine = (deps = {}) => {
  const makeId = typeof deps.makeId === 'function' ? deps.makeId : fallbackMakeId
  const clampInt = typeof deps.clampInt === 'function' ? deps.clampInt : fallbackClampInt

  // 创建默认需求
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

  // 创建默认技能
  const createDefaultSkills = () => ({
    crafting: { level: 1, exp: 0, maxLevel: SKILL_MAX_LEVEL },
    cooking: { level: 1, exp: 0, maxLevel: SKILL_MAX_LEVEL },
    social: { level: 1, exp: 0, maxLevel: SKILL_MAX_LEVEL },
    cleaning: { level: 1, exp: 0, maxLevel: SKILL_MAX_LEVEL },
  })

  // 创建默认精灵配置
  const createDefaultSprite = (index = 0) => {
    const styles = ['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist', 'worker', 'cook']
    const palettes = ['ember', 'forest', 'sky', 'violet', 'sand', 'iron', 'copper', 'silver']
    return {
      style: styles[index % styles.length],
      palette: palettes[index % palettes.length],
      action: 'idle',
      facing: 'right',
      outfit: null, // 部件化换装: { hair, eyes, top, bottom, accessory } 或 null 使用旧版 style
    }
  }

  // 创建默认小人
  const createDefaultPawn = (index = 0, roleHint = '') => {
    const roles = ['工匠', '厨师', '学者', '护士', '农夫', '矿工', '商人', '艺术家']
    const names = ['艾诺', '米拉', '托比', '莎米', '莱恩', '琳娜', '卡尔', '菲菲']

    const role = roleHint || roles[index % roles.length]
    const name = names[index % names.length]

    return {
      id: makeId('pawn'),
      name,
      role,
      worldCharacterId: '',
      position: {
        x: Math.floor(ROOM_DEFAULT_WIDTH / 2) + (index % 4) - 2,
        y: Math.floor(ROOM_DEFAULT_HEIGHT / 2),
      },
      targetPosition: null,
      path: [],
      pathIndex: 0,
      moving: false,
      speed: 1.0,
      needs: createDefaultNeeds(),
      skills: createDefaultSkills(),
      currentActivity: 'idle',
      currentTask: null,
      targetFurniture: null,
      activityStartTime: 0,
      taskQueue: [],
      assignedWork: null,
      sprite: createDefaultSprite(index),
      lastDialogue: '',
      dialogueCooldown: 0,
      updatedAt: Date.now(),
    }
  }

  // 规范化小人数据
  const normalizePawn = (raw, index = 0) => {
    if (!raw || typeof raw !== 'object') return createDefaultPawn(index)

    const defaultPawn = createDefaultPawn(index)

    return {
      id: String(raw.id || defaultPawn.id).slice(0, 48),
      name: String(raw.name || defaultPawn.name).slice(0, 20),
      role: String(raw.role || defaultPawn.role).slice(0, 16),
      worldCharacterId: String(raw.worldCharacterId || ''),
      position: normalizePosition(raw.position) || defaultPawn.position,
      targetPosition: raw.targetPosition ? normalizePosition(raw.targetPosition) : null,
      path: Array.isArray(raw.path) ? raw.path.slice(0, 128) : [],
      pathIndex: clampInt(raw.pathIndex, 0, 127, 0),
      moving: Boolean(raw.moving),
      speed: Math.max(0.5, Math.min(2, Number(raw.speed) || 1)),
      needs: normalizeNeeds(raw.needs) || defaultPawn.needs,
      skills: normalizeSkills(raw.skills) || defaultPawn.skills,
      currentActivity: normalizeActivity(raw.currentActivity),
      currentTask: raw.currentTask || null,
      targetFurniture: raw.targetFurniture || null,
      activityStartTime: Number(raw.activityStartTime) || 0,
      taskQueue: Array.isArray(raw.taskQueue) ? raw.taskQueue.slice(0, 10) : [],
      assignedWork: raw.assignedWork || null,
      sprite: normalizeSprite(raw.sprite) || defaultPawn.sprite,
      lastDialogue: String(raw.lastDialogue || '').slice(0, 200),
      dialogueCooldown: clampInt(raw.dialogueCooldown, 0, 60000, 0),
      updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    }
  }

  // 规范化位置
  const normalizePosition = (raw) => {
    if (!raw || typeof raw !== 'object') return null
    const x = Number(raw.x)
    const y = Number(raw.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return {
      x: clampInt(x, 0, ROOM_DEFAULT_WIDTH - 1, Math.floor(ROOM_DEFAULT_WIDTH / 2)),
      y: clampInt(y, 0, ROOM_DEFAULT_HEIGHT - 1, Math.floor(ROOM_DEFAULT_HEIGHT / 2)),
    }
  }

  // 规范化需求
  const normalizeNeeds = (raw) => {
    if (!raw || typeof raw !== 'object') return null
    const needs = {}
    for (const [key, config] of Object.entries(NEED_DEFAULT_CONFIG)) {
      const rawNeed = raw[key] || {}
      needs[key] = {
        value: clampInt(rawNeed.value, 0, NEED_MAX_VALUE, NEED_MAX_VALUE),
        decayRate: Number(rawNeed.decayRate) || config.decayRate,
        threshold: Number(rawNeed.threshold) || config.threshold,
        critical: Number(rawNeed.critical) || config.critical,
      }
    }
    return needs
  }

  // 规范化技能
  const normalizeSkills = (raw) => {
    if (!raw || typeof raw !== 'object') return null
    return {
      crafting: normalizeSkill(raw.crafting),
      cooking: normalizeSkill(raw.cooking),
      social: normalizeSkill(raw.social),
      cleaning: normalizeSkill(raw.cleaning),
    }
  }

  // 规范化单个技能
  const normalizeSkill = (raw) => ({
    level: clampInt(raw?.level, 1, SKILL_MAX_LEVEL, 1),
    exp: Math.max(0, Number(raw?.exp) || 0),
    maxLevel: SKILL_MAX_LEVEL,
  })

  // 规范化活动状态
  const normalizeActivity = (raw) => {
    const valid = ['idle', 'moving', 'working', 'sleeping', 'eating', 'socializing']
    const activity = String(raw || 'idle').toLowerCase()
    return valid.includes(activity) ? activity : 'idle'
  }

  // 规范化精灵配置
  const normalizeSprite = (raw) => {
    if (!raw || typeof raw !== 'object') return null
    const styles = ['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist', 'worker', 'cook', 'scholar', 'nurse']
    const actions = ['idle', 'walk', 'work', 'sleep', 'eat', 'talk', 'read', 'carry']
    const facings = ['left', 'right', 'front', 'back']

    let outfit = null
    if (raw.outfit && typeof raw.outfit === 'object') {
      outfit = {
        hair: String(raw.outfit.hair || 'short').slice(0, 20),
        eyes: String(raw.outfit.eyes || 'normal').slice(0, 20),
        top: String(raw.outfit.top || 'robe').slice(0, 20),
        bottom: String(raw.outfit.bottom || 'boots').slice(0, 20),
        accessory: String(raw.outfit.accessory || 'none').slice(0, 20),
      }
    }

    return {
      style: styles.includes(raw.style) ? raw.style : 'knight',
      palette: String(raw.palette || 'ember').slice(0, 16),
      action: actions.includes(raw.action) ? raw.action : 'idle',
      facing: facings.includes(raw.facing) ? raw.facing : 'right',
      outfit,
    }
  }

  // 规范化小人列表
  const normalizePawnList = (rawList) => {
    if (!Array.isArray(rawList) || rawList.length < 1) {
      return [createDefaultPawn(0)]
    }
    return rawList.slice(0, MAX_PAWN_COUNT).map((p, i) => normalizePawn(p, i))
  }

  // 克隆小人状态
  const clonePawnState = (pawn) => {
    if (!pawn || typeof pawn !== 'object') return createDefaultPawn(0)
    return {
      ...pawn,
      position: { ...pawn.position },
      targetPosition: pawn.targetPosition ? { ...pawn.targetPosition } : null,
      path: pawn.path.slice(),
      needs: { ...pawn.needs },
      skills: { ...pawn.skills },
      sprite: { ...pawn.sprite, outfit: pawn.sprite?.outfit ? { ...pawn.sprite.outfit } : null },
      taskQueue: pawn.taskQueue.slice(),
    }
  }

  // 计算小人综合评分
  const calcPawnTotalScore = (pawn) => {
    const needsScore = Object.values(pawn?.needs || {})
      .reduce((sum, n) => sum + (n.value || 0), 0) / Object.keys(NEED_DEFAULT_CONFIG).length
    const skillsScore = Object.values(pawn?.skills || {})
      .reduce((sum, s) => sum + (s.level || 1), 0) / 4
    return Math.round(needsScore + skillsScore * 5)
  }

  // 添加技能经验
  const addSkillExp = (pawn, skillType, amount) => {
    const skill = pawn?.skills?.[skillType]
    if (!skill) return pawn

    skill.exp += amount
    // 检查升级
    const expNeeded = skill.level * 50
    if (skill.exp >= expNeeded && skill.level < SKILL_MAX_LEVEL) {
      skill.level += 1
      skill.exp = skill.exp - expNeeded
    }

    return pawn
  }

  return {
    createDefaultPawn,
    createDefaultNeeds,
    createDefaultSkills,
    createDefaultSprite,
    normalizePawn,
    normalizePawnList,
    normalizePosition,
    normalizeNeeds,
    normalizeSkills,
    normalizeActivity,
    normalizeSprite,
    clonePawnState,
    calcPawnTotalScore,
    addSkillExp,
  }
}

export default createPawnEngine