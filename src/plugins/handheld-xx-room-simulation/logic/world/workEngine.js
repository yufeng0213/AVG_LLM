// 工作系统 - 工作产出、任务定义

import { createItemEngine, ITEM_TYPE_FOOD, ITEM_TYPE_MATERIAL, ITEM_TYPE_PRODUCT } from './itemEngine.js'

// 工作类型定义
export const WORK_TYPE_CRAFTING = 'crafting'
export const WORK_TYPE_COOKING = 'cooking'
export const WORK_TYPE_CLEANING = 'cleaning'
export const WORK_TYPE_RESEARCH = 'research'
export const WORK_TYPE_SOCIAL = 'social'

// 工作配置
const WORK_CONFIG = {
  crafting: {
    name: '制作',
    description: '制造基础材料和工艺品',
    baseDuration: 120,
    outputType: ITEM_TYPE_MATERIAL,
    outputTemplates: ['material-basic', 'material-refined'],
    skillType: 'crafting',
    expReward: 10,
  },
  cooking: {
    name: '烹饪',
    description: '制作食物',
    baseDuration: 180,
    outputType: ITEM_TYPE_FOOD,
    outputTemplates: ['food-simple', 'food-good'],
    skillType: 'cooking',
    expReward: 12,
  },
  cleaning: {
    name: '清洁',
    description: '打扫房间',
    baseDuration: 60,
    outputType: null,
    outputTemplates: [],
    skillType: 'cleaning',
    expReward: 5,
  },
  research: {
    name: '研究',
    description: '学习和研究',
    baseDuration: 240,
    outputType: ITEM_TYPE_PRODUCT,
    outputTemplates: ['product-craft'],
    skillType: 'social',
    expReward: 15,
  },
  social: {
    name: '社交',
    description: '与他人交流',
    baseDuration: 90,
    outputType: null,
    outputTemplates: [],
    skillType: 'social',
    expReward: 8,
  },
}

export const createWorkEngine = (deps = {}) => {
  const itemEngine = deps.itemEngine || createItemEngine()

  // 获取工作配置
  const getWorkConfig = (workType) => {
    return WORK_CONFIG[workType] || WORK_CONFIG.crafting
  }

  // 计算工作持续时间（基于技能等级）
  const calculateWorkDuration = (workType, skillLevel) => {
    const config = getWorkConfig(workType)
    const level = Math.max(1, Math.min(20, Number(skillLevel) || 1))
    // 技能越高，速度越快
    const speedMultiplier = 1 - (level - 1) * 0.03
    return Math.round(config.baseDuration * Math.max(0.5, speedMultiplier))
  }

  // 计算工作产出质量（基于技能等级）
  const calculateOutputQuality = (workType, skillLevel) => {
    const config = getWorkConfig(workType)
    const level = Math.max(1, Math.min(20, Number(skillLevel) || 1))

    // 技能等级决定产出质量
    if (level >= 15) return 3
    if (level >= 10) return 2
    return 1
  }

  // 执行工作并生成产出
  const executeWork = (pawn, workType, state) => {
    const config = getWorkConfig(workType)
    const skill = pawn?.skills?.[config.skillType]
    const skillLevel = skill?.level || 1

    // 添加技能经验
    if (skill) {
      skill.exp += config.expReward
      // 检查升级
      const expNeeded = skill.level * 50
      if (skill.exp >= expNeeded && skill.level < 20) {
        skill.level += 1
        skill.exp -= expNeeded
      }
    }

    // 生成产出物品
    if (config.outputType && config.outputTemplates.length > 0) {
      const quality = calculateOutputQuality(workType, skillLevel)
      const templateId = config.outputTemplates.find(t => {
        const template = itemEngine.ITEM_TEMPLATES[config.outputType]?.find(i => i.id === t)
        return template?.quality === quality
      }) || config.outputTemplates[0]

      const item = itemEngine.createItem(templateId, config.outputType, 1)

      // 添加到库存
      if (config.outputType === ITEM_TYPE_FOOD) {
        state.items.foods.push(item)
      } else if (config.outputType === ITEM_TYPE_MATERIAL) {
        state.items.materials.push(item)
      } else if (config.outputType === ITEM_TYPE_PRODUCT) {
        state.items.products.push(item)
      }

      return { success: true, item, expGain: config.expReward }
    }

    return { success: true, item: null, expGain: config.expReward }
  }

  // 获取可用工作列表
  const getAvailableWorkTypes = () => {
    return Object.keys(WORK_CONFIG)
  }

  // 获取工作名称
  const getWorkName = (workType) => {
    return WORK_CONFIG[workType]?.name || '未知工作'
  }

  // 获取工作描述
  const getWorkDescription = (workType) => {
    return WORK_CONFIG[workType]?.description || ''
  }

  // 检查小人是否有执行工作的技能
  const canPawnDoWork = (pawn, workType) => {
    const config = getWorkConfig(workType)
    return pawn?.skills?.[config.skillType]?.level >= 1
  }

  // 获取工作优先级建议（基于小人状态）
  const suggestWorkPriority = (pawn, state) => {
    // 食物不足时优先烹饪
    const foodCount = itemEngine.getItemCountByType(state?.items?.foods || [], ITEM_TYPE_FOOD)
    if (foodCount < 3 && canPawnDoWork(pawn, WORK_TYPE_COOKING)) {
      return WORK_TYPE_COOKING
    }

    // 材料不足时优先制作
    const materialCount = itemEngine.getItemCountByType(state?.items?.materials || [], ITEM_TYPE_MATERIAL)
    if (materialCount < 5 && canPawnDoWork(pawn, WORK_TYPE_CRAFTING)) {
      return WORK_TYPE_CRAFTING
    }

    // 默认根据最高技能选择
    const skills = pawn?.skills || {}
    let bestSkill = null
    let bestLevel = 0

    for (const [skillType, skillData] of Object.entries(skills)) {
      if (skillData.level > bestLevel) {
        bestLevel = skillData.level
        bestSkill = skillType
      }
    }

    // 找到匹配的工作
    for (const [workType, config] of Object.entries(WORK_CONFIG)) {
      if (config.skillType === bestSkill) {
        return workType
      }
    }

    return WORK_TYPE_CRAFTING
  }

  return {
    getWorkConfig,
    calculateWorkDuration,
    calculateOutputQuality,
    executeWork,
    getAvailableWorkTypes,
    getWorkName,
    getWorkDescription,
    canPawnDoWork,
    suggestWorkPriority,
    WORK_CONFIG,
  }
}

export default createWorkEngine