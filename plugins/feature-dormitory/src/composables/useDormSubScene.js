/**
 * 寝室二级场景 Composable
 * 管理 SubScene 场景库、场景切换、场景互动、设施升级的所有逻辑
 *
 * @param {object} deps - 依赖项
 * @param {import('vue').Ref} deps.selectedCharacter - 当前选中的角色 ref
 * @param {import('vue').Ref} deps.selectedDormState - 寝室状态 ref
 * @param {import('vue').Ref} deps.selectedSubSceneId - 当前选中场景ID ref
 * @param {import('vue').Ref} deps.selectedSubSceneActivityId - 当前选中活动ID ref
 * @param {import('vue').Ref} deps.actionFeedback - 操作反馈 ref
 * @param {import('vue').Ref} deps.activeDormEvent - 当前活动事件 ref
 * @param {import('vue').Ref} deps.dormRuntimeMap - 寝室运行时映射 ref
 * @param {import('vue').Ref} deps.selectedDormRuntimeKey - 当前运行时键 ref
 * @param {Function} deps.updateSelectedDormState - 更新寝室状态的函数
 * @param {Function} deps.clearDormEvent - 清除当前事件的函数
 * @param {Function} deps.applyDormAction - 应用寝室行动的函数
 * @param {Function} deps.ensureActionTimeAvailable - 检查时间槽是否可用的函数
 * @param {Function} deps.buildFacilityBoostedAction - 构建设施加成行动的函数
 * @param {Function} deps.renderTemplate - 渲染模板字符串的函数
 * @param {Function} deps.clampInt - 限制整数范围的函数
 * @param {Function} deps.normalizeFacilityLevelMap - 规范化设施等级映射的函数
 * @param {Function} deps.normalizeCounterMap - 规范化计数器映射的函数
 * @param {Function} deps.appendJournal - 追加日志的函数
 * @param {Function} deps.getDormRelationshipStageLabel - 获取关系阶段标签的函数
 * @param {Function} deps.resolveDormRelationshipStageByAffection - 根据好感度解析关系阶段
 * @param {Function} deps.normalizeDormRelationshipStage - 规范化关系阶段的函数
 * @param {number} deps.DORM_AFFECTION_MIN - 好感度最小值
 * @param {number} deps.DORM_AFFECTION_MAX - 好感度最大值
 * @param {number} deps.DORM_ENERGY_MIN - 体力最小值
 * @param {number} deps.DORM_ENERGY_MAX - 体力最大值
 * @param {number} deps.DORM_JOURNAL_LIMIT - 日志数量限制
 * @param {Function} deps.showStageUpgradeToast - 显示阶段升级提示的函数
 */

import { computed, watch } from 'vue'

// ==================== 常量 ====================

const DORM_SCENE_FACILITY_MIN_LEVEL = 1
const DORM_SCENE_FACILITY_MAX_LEVEL = 5
const DORM_SCENE_FACILITY_BONUS_STEP = 0.12
const DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST = 12

// ==================== 基础子场景 ====================

const DORM_BASE_SUB_SCENE = {
  id: 'shared-living-zone',
  name: '共享生活区',
  subtitle: '通用',
  ambience: '{char}把常用物品都摆在触手可及的位置，整个寝室看起来很有生活感。',
  decor: ['软垫沙发', '小夜灯', '共享置物架'],
  activityPool: [
    {
      id: 'shared-snack',
      label: '一起加餐',
      affectionDelta: 3,
      energyDelta: 7,
      mood: '满足',
      journalText: '你和{char}在共享生活区吃了点夜宵。',
      feedbackText: '你们都恢复了一些状态。',
    },
    {
      id: 'shared-cleanup',
      label: '整理收纳',
      affectionDelta: 2,
      energyDelta: -3,
      mood: '清爽',
      journalText: '你和{char}把生活区收拾得井井有条。',
      feedbackText: '寝室环境变得更舒适了。',
    },
  ],
}

// ==================== 子场景库 ====================

const DORM_SUB_SCENE_LIBRARY = [
  {
    id: 'strategy-desk',
    name: '策略书桌',
    subtitle: '推演',
    ambience: '{char}的桌面铺满计划便签，连杯垫都按用途分好了。',
    decor: ['战术板', '计划便签', '计时器'],
    activityPool: [
      {
        id: 'plan-session',
        label: '共同排计划',
        affectionDelta: 4,
        energyDelta: -5,
        mood: '专注',
        journalText: '你和{char}在策略书桌前完成了下一周计划。',
        feedbackText: '配合变得更默契了。',
      },
      {
        id: 'data-review',
        label: '复盘记录',
        affectionDelta: 3,
        energyDelta: -4,
        mood: '冷静',
        journalText: '你和{char}复盘了最近的行动记录。',
        feedbackText: '很多细节被重新理顺。',
      },
    ],
  },
  {
    id: 'sun-balcony',
    name: '阳台温室',
    subtitle: '疗愈',
    ambience: '阳台上养着几盆耐心照料的植物，{char}总会在这里放慢节奏。',
    decor: ['绿植架', '折叠躺椅', '香薰灯'],
    activityPool: [
      {
        id: 'water-plants',
        label: '一起浇花',
        affectionDelta: 5,
        energyDelta: 8,
        mood: '治愈',
        journalText: '你和{char}在阳台温室给植物浇了水。',
        feedbackText: '空气都变得柔和了。',
      },
      {
        id: 'tea-break',
        label: '安静喝茶',
        affectionDelta: 4,
        energyDelta: 10,
        mood: '平和',
        journalText: '你和{char}在阳台边喝茶边发呆。',
        feedbackText: '你们都放松下来。',
      },
    ],
  },
  {
    id: 'music-corner',
    name: '留声角',
    subtitle: '创作',
    ambience: '{char}把耳机和乐谱摆得很随性，灵感常常在这里冒出来。',
    decor: ['复古唱机', '便携键盘', '灵感手账'],
    activityPool: [
      {
        id: 'jam',
        label: '即兴合奏',
        affectionDelta: 6,
        energyDelta: -6,
        mood: '兴奋',
        journalText: '你和{char}在留声角来了一段即兴合奏。',
        feedbackText: '现场气氛非常上头。',
      },
      {
        id: 'lyrics',
        label: '写一段歌词',
        affectionDelta: 5,
        energyDelta: -4,
        mood: '投入',
        journalText: '你和{char}一起写下了一段歌词。',
        feedbackText: '灵感状态很好。',
      },
    ],
  },
  {
    id: 'training-zone',
    name: '体能区',
    subtitle: '行动',
    ambience: '靠墙的训练器材被擦得发亮，{char}随时都能开练。',
    decor: ['拉伸垫', '壶铃', '计步屏'],
    activityPool: [
      {
        id: 'quick-train',
        label: '十分钟训练',
        affectionDelta: 4,
        energyDelta: -8,
        mood: '燃',
        journalText: '你和{char}在体能区完成了一组训练。',
        feedbackText: '状态被点燃了。',
      },
      {
        id: 'stretch',
        label: '拉伸放松',
        affectionDelta: 3,
        energyDelta: 9,
        mood: '舒展',
        journalText: '你和{char}做了完整的拉伸。',
        feedbackText: '身体轻松了很多。',
      },
    ],
  },
  {
    id: 'tea-salon',
    name: '会客茶座',
    subtitle: '社交',
    ambience: '{char}把茶具和杯垫准备得很齐全，这里总有聊不完的话题。',
    decor: ['圆桌', '双人茶具', '留言便签墙'],
    activityPool: [
      {
        id: 'long-chat',
        label: '深聊近况',
        affectionDelta: 6,
        energyDelta: -5,
        mood: '亲近',
        journalText: '你和{char}在会客茶座聊了很久。',
        feedbackText: '关系明显更近一步。',
      },
      {
        id: 'share-story',
        label: '交换故事',
        affectionDelta: 5,
        energyDelta: -3,
        mood: '温暖',
        journalText: '你和{char}交换了各自的旧故事。',
        feedbackText: '你们更懂彼此了。',
      },
    ],
  },
  {
    id: 'craft-workbench',
    name: '手作工坊',
    subtitle: '手工',
    ambience: '工具墙挂得整整齐齐，{char}会在这里把想法做成实体。',
    decor: ['工具墙', '零件盒', '防割桌垫'],
    activityPool: [
      {
        id: 'build-gift',
        label: '制作小礼物',
        affectionDelta: 7,
        energyDelta: -7,
        mood: '成就',
        journalText: '你和{char}在手作工坊完成了一份小礼物。',
        feedbackText: '这份心意很有分量。',
      },
      {
        id: 'repair-item',
        label: '修理物件',
        affectionDelta: 4,
        energyDelta: -5,
        mood: '踏实',
        journalText: '你和{char}修好了一个坏掉的小物件。',
        feedbackText: '动手之后特别有成就感。',
      },
    ],
  },
]

// ==================== 场景事件池 ====================

const DORM_SUB_SCENE_EVENT_LIBRARY = {
  'shared-living-zone': [
    {
      id: 'shared-midnight-guest',
      title: '午夜访客',
      description: '共享生活区忽然传来敲门声，{char}看向你示意要不要开门。',
      options: [
        { id: 'open', label: '一起开门看看', affectionDelta: 5, energyDelta: -4, mood: '紧张', message: '你和{char}一起确认了来人身份。' },
        { id: 'ignore', label: '先不开门', affectionDelta: 3, energyDelta: 5, mood: '安心', message: '你和{char}决定先观察，避免冒险。' },
      ],
    },
  ],
  'strategy-desk': [
    {
      id: 'strategy-overlap',
      title: '计划重叠',
      description: '{char}发现两份任务时间冲突，你们需要在策略书桌上快速重排优先级。',
      options: [
        { id: 'strict', label: '按优先级硬切', affectionDelta: 6, energyDelta: -7, mood: '果断', message: '你们快速完成了重排，效率很高。' },
        { id: 'smooth', label: '温和协调过渡', affectionDelta: 5, energyDelta: -4, mood: '稳妥', message: '你和{char}保留了主要安排，节奏更平稳。' },
      ],
    },
  ],
  'sun-balcony': [
    {
      id: 'balcony-rainbow',
      title: '雨后微光',
      description: '阳台温室刚下过雨，{char}指着叶片上的水珠让你靠近看看。',
      options: [
        { id: 'photo', label: '拍照留念', affectionDelta: 5, energyDelta: 7, mood: '惬意', message: '你和{char}拍下了雨后最亮的那一刻。' },
        { id: 'repot', label: '趁机换盆', affectionDelta: 4, energyDelta: -3, mood: '专注', message: '你们一起给植物换了更合适的花盆。' },
      ],
    },
  ],
  'music-corner': [
    {
      id: 'music-melody',
      title: '旋律卡壳',
      description: '留声角的旋律进行到副歌突然卡住，{char}把选择权交给你。',
      options: [
        { id: 'high-note', label: '改成高音推进', affectionDelta: 7, energyDelta: -6, mood: '激昂', message: '你和{char}把副歌推向了更高的情绪。' },
        { id: 'soft-note', label: '改成轻声段落', affectionDelta: 5, energyDelta: -3, mood: '沉浸', message: '你们把旋律改得更耐听，也更贴近心情。' },
      ],
    },
  ],
  'training-zone': [
    {
      id: 'training-challenge',
      title: '加练挑战',
      description: '体能区计时器突然亮起挑战模式，{char}问你要不要冲一把。',
      options: [
        { id: 'push', label: '全力冲刺', affectionDelta: 6, energyDelta: -10, mood: '热血', message: '你和{char}咬牙完成了高强度挑战。' },
        { id: 'steady', label: '控制节奏', affectionDelta: 4, energyDelta: -4, mood: '稳定', message: '你们保持了稳定输出，节奏非常均匀。' },
      ],
    },
  ],
  'tea-salon': [
    {
      id: 'tea-salon-topic',
      title: '话题岔路',
      description: '会客茶座里，{char}突然问起一个有些敏感的话题。',
      options: [
        { id: 'honest', label: '直接坦白', affectionDelta: 8, energyDelta: -5, mood: '信任', message: '你和{char}坦诚交换了彼此的真实想法。' },
        { id: 'gentle', label: '慢慢试探', affectionDelta: 5, energyDelta: -2, mood: '温和', message: '你选择了更轻缓的节奏，让对话更舒适。' },
      ],
    },
  ],
  'craft-workbench': [
    {
      id: 'workbench-part',
      title: '关键零件',
      description: '手作工坊里少了一个关键零件，{char}看向你等待决定。',
      options: [
        { id: 'improvise', label: '现场改造替代', affectionDelta: 7, energyDelta: -8, mood: '兴奋', message: '你和{char}靠临场发挥把方案做成了。' },
        { id: 'pause', label: '暂停并优化图纸', affectionDelta: 4, energyDelta: -2, mood: '踏实', message: '你们先优化了图纸，后续执行更稳。' },
      ],
    },
  ],
}

// ==================== 模块级工具函数 ====================

function hashString(value) {
  const source = String(value || '')
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * 获取场景的事件池
 */
function getSceneEventPool(sceneId) {
  const key = String(sceneId || '').trim()
  if (!key) return []
  const pool = DORM_SUB_SCENE_EVENT_LIBRARY[key]
  return Array.isArray(pool) ? pool : []
}

/**
 * 根据设施等级计算加成百分比
 */
function getFacilityBonusPercentByLevel(level) {
  const safeLevel = Math.max(DORM_SCENE_FACILITY_MIN_LEVEL, Math.min(DORM_SCENE_FACILITY_MAX_LEVEL, level || DORM_SCENE_FACILITY_MIN_LEVEL))
  return Math.round((safeLevel - 1) * DORM_SCENE_FACILITY_BONUS_STEP * 100)
}

/**
 * 将设施加成应用到行动数值
 */
function applyFacilityBonusDelta(delta, level) {
  if (delta <= 0) return delta
  const ratio = 1 + (Math.max(DORM_SCENE_FACILITY_MIN_LEVEL, Math.min(DORM_SCENE_FACILITY_MAX_LEVEL, level || DORM_SCENE_FACILITY_MIN_LEVEL)) - 1) * DORM_SCENE_FACILITY_BONUS_STEP
  return Math.round(delta * ratio)
}

/**
 * 为角色构建个性化子场景列表
 */
function buildDormSubScenesForCharacter(character, label = '') {
  const seed = `${String(character?.id || '')}:${String(label || '')}`

  const ranked = DORM_SUB_SCENE_LIBRARY
    .map((scene) => {
      const tieBreaker = (hashString(`${seed}:${scene.id}`) % 1000) / 100000
      return { ...scene, matchScore: 1 + tieBreaker }
    })
    .sort((left, right) => right.matchScore - left.matchScore)

  const personalized = ranked.slice(0, 4)
  return [DORM_BASE_SUB_SCENE, ...personalized]
}

// ==================== Composable ====================

export function useDormSubScene(deps) {
  // 计算属性
  const generatedDormSubScenes = computed(() => {
    if (!deps.selectedCharacter.value) return []
    return buildDormSubScenesForCharacter(deps.selectedCharacter.value.raw, deps.selectedCharacter.value.label)
  })

  const activeDormSubScene = computed(() => {
    if (generatedDormSubScenes.value.length <= 0) return null
    return generatedDormSubScenes.value.find((scene) => scene.id === deps.selectedSubSceneId.value) || generatedDormSubScenes.value[0]
  })

  const activeDormSubSceneActivityOptions = computed(() => {
    const pool = Array.isArray(activeDormSubScene.value?.activityPool) ? activeDormSubScene.value.activityPool : []
    return pool.map((activity, index) => ({
      ...activity,
      id: String(activity?.id || `scene_activity_${index + 1}`).trim() || `scene_activity_${index + 1}`,
      label: String(activity?.label || `场景互动 ${index + 1}`).trim() || `场景互动 ${index + 1}`,
    }))
  })

  const selectedDormSubSceneActivity = computed(() => {
    const source = activeDormSubSceneActivityOptions.value
    if (source.length <= 0) return null
    const selectedId = String(deps.selectedSubSceneActivityId.value || '').trim()
    return source.find((activity) => activity.id === selectedId) || source[0]
  })

  const activeDormSubSceneVisitCount = computed(() => {
    const sceneId = String(activeDormSubScene.value?.id || '').trim()
    if (!sceneId) return 0
    return deps.clampInt(deps.selectedDormState.value.sceneVisitMap?.[sceneId], 0, 9999, 0)
  })

  const activeDormSubSceneFacilityLevel = computed(() => {
    const sceneId = activeDormSubScene.value?.id
    const levels = deps.selectedDormState.value.sceneFacilityLevels || {}
    const key = String(sceneId || '').trim()
    return deps.clampInt(levels[key], DORM_SCENE_FACILITY_MIN_LEVEL, DORM_SCENE_FACILITY_MAX_LEVEL, DORM_SCENE_FACILITY_MIN_LEVEL)
  })

  const activeDormSubSceneFacilityBonusPercent = computed(() => {
    return getFacilityBonusPercentByLevel(activeDormSubSceneFacilityLevel.value)
  })

  const remainingDormActionSlots = computed(() => {
    const DORM_TIME_SLOT_COUNT = 3
    const used = deps.clampInt(deps.selectedDormState.value.timeSlotIndex, 0, DORM_TIME_SLOT_COUNT, 0)
    return Math.max(0, DORM_TIME_SLOT_COUNT - used)
  })

  const canUpgradeActiveSceneFacility = computed(() => {
    if (!activeDormSubScene.value) return false
    if (activeDormSubSceneFacilityLevel.value >= DORM_SCENE_FACILITY_MAX_LEVEL) return false
    return true
  })

  const activeSceneUpgradeButtonText = computed(() => {
    if (activeDormSubSceneFacilityLevel.value >= DORM_SCENE_FACILITY_MAX_LEVEL) return '设施已满级'
    if (deps.selectedDormState.value.energy < DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST) return `体力不足（需 ${DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST}）`
    return `升级设施（消耗 ${DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST} 体力）`
  })

  // 方法
  function updateDormSubSceneState(sceneId, { countVisit = false, appendSceneJournal = false } = {}) {
    const safeSceneId = String(sceneId || '').trim()
    if (!safeSceneId) return

    deps.updateSelectedDormState((previous) => {
      const nextSceneVisitMap = deps.normalizeCounterMap(previous.sceneVisitMap, 32)
      if (countVisit) {
        nextSceneVisitMap[safeSceneId] = deps.clampInt((nextSceneVisitMap[safeSceneId] || 0) + 1, 0, 9999, 0)
      }

      const selectedScene = generatedDormSubScenes.value.find((item) => item.id === safeSceneId)
      const sceneJournal = appendSceneJournal && selectedScene
        ? deps.appendJournal(
            previous.journal,
            deps.renderTemplate(`你和{char}来到${selectedScene.name}。`, deps.selectedCharacter.value?.label),
            'scene',
          )
        : previous.journal

      return {
        ...previous,
        preferredSceneId: safeSceneId,
        sceneVisitMap: nextSceneVisitMap,
        journal: sceneJournal,
      }
    })
  }

  function handleSelectDormSubScene(sceneId) {
    const nextId = String(sceneId || '').trim()
    if (!nextId) return

    const selectedScene = generatedDormSubScenes.value.find((item) => item.id === nextId)
    if (!selectedScene) return

    const changed = deps.selectedSubSceneId.value !== nextId
    deps.selectedSubSceneId.value = nextId
    if (!changed) return

    updateDormSubSceneState(nextId, { countVisit: true, appendSceneJournal: true })
    deps.clearDormEvent()
    deps.actionFeedback.value = `已切换到二级场景：${selectedScene.name}`
  }

  function handleDormSubSceneSelectChange(event) {
    const nextId = String(event?.target?.value || '').trim()
    if (!nextId) return
    handleSelectDormSubScene(nextId)
  }

  function handleUpgradeActiveSceneFacility() {
    if (!activeDormSubScene.value) return
    if (!deps.ensureActionTimeAvailable('升级设施')) return

    const scene = activeDormSubScene.value
    const currentLevel = activeDormSubSceneFacilityLevel.value
    if (currentLevel >= DORM_SCENE_FACILITY_MAX_LEVEL) {
      deps.actionFeedback.value = `${scene.name} 的设施已满级。`
      return
    }

    if (deps.selectedDormState.value.energy < DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST) {
      deps.actionFeedback.value = `体力不足，升级需要 ${DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST} 点体力。`
      return
    }

    const nextLevel = currentLevel + 1
    const charName = deps.selectedCharacter.value?.label || '角色'
    let progressOutcome = {
      consumedSlot: false,
      remainingSlots: remainingDormActionSlots.value,
      completedWishLabels: [],
    }
    let stageOutcome = {
      changed: false,
      previousStage: '',
      nextStage: '',
    }
    deps.updateSelectedDormState((previous) => {
      const previousStage = deps.normalizeDormRelationshipStage(previous.relationshipStage, previous.affection)
      const nextFacilityLevels = deps.normalizeFacilityLevelMap(previous.sceneFacilityLevels, 32)
      nextFacilityLevels[scene.id] = deps.clampInt(
        nextLevel,
        DORM_SCENE_FACILITY_MIN_LEVEL,
        DORM_SCENE_FACILITY_MAX_LEVEL,
        DORM_SCENE_FACILITY_MIN_LEVEL,
      )

      const baseNext = {
        ...previous,
        energy: deps.clampInt(
          previous.energy - DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST,
          deps.DORM_ENERGY_MIN,
          deps.DORM_ENERGY_MAX,
          previous.energy,
        ),
        mood: '期待',
        facilityUpgradeCount: deps.clampInt(previous.facilityUpgradeCount + 1, 0, 9999, previous.facilityUpgradeCount),
        sceneFacilityLevels: nextFacilityLevels,
        journal: deps.appendJournal(
          previous.journal,
          deps.renderTemplate(`你将${scene.name}的设施升级到了 Lv${nextLevel}。`, charName),
          'upgrade',
        ),
      }

      const progressed = applyDailyProgressToState(baseNext, {
        consumeTimeSlot: true,
        wishType: 'upgrade',
        charLabel: charName,
      })
      progressOutcome = {
        consumedSlot: progressed.consumedSlot,
        remainingSlots: progressed.remainingSlots,
        completedWishLabels: progressed.completedWishLabels,
      }
      const progressedState = { ...progressed.state }
      const nextStage = deps.resolveDormRelationshipStageByAffection(progressedState.affection)
      progressedState.relationshipStage = nextStage
      if (nextStage !== previousStage) {
        stageOutcome = {
          changed: true,
          previousStage,
          nextStage,
        }
        progressedState.journal = deps.appendJournal(
          progressedState.journal,
          deps.renderTemplate(`关系阶段提升为「${deps.getDormRelationshipStageLabel(nextStage)}」。`, charName),
          'stage',
        )
      }
      return progressedState
    })

    deps.clearDormEvent()
    let feedback = `${scene.name} 设施已升级到 Lv${nextLevel}，场景收益提升至 +${getFacilityBonusPercentByLevel(nextLevel)}%。`
    if (progressOutcome.completedWishLabels.length > 0) {
      feedback = `${feedback} 已完成心愿：${progressOutcome.completedWishLabels.join('、')}。`
    }
    if (stageOutcome.changed) {
      const stageText = `关系阶段提升：${deps.getDormRelationshipStageLabel(stageOutcome.previousStage)} -> ${deps.getDormRelationshipStageLabel(stageOutcome.nextStage)}。`
      feedback = `${feedback} ${stageText}`.trim()
      deps.showStageUpgradeToast(stageOutcome)
    }
    if (progressOutcome.consumedSlot && progressOutcome.remainingSlots <= 0) {
      feedback = `${feedback} 今日时段已结束，可进入下一天。`
    }
    deps.actionFeedback.value = feedback
  }

  function handleDormSubSceneAction(activity) {
    if (!activity || !activeDormSubScene.value) return
    if (!deps.ensureActionTimeAvailable('场景互动')) return

    const scene = activeDormSubScene.value
    const charName = deps.selectedCharacter.value?.label || '角色'
    const boosted = deps.buildFacilityBoostedAction(
      {
        affectionDelta: Number(activity.affectionDelta) || 0,
        energyDelta: Number(activity.energyDelta) || 0,
      },
      activeDormSubSceneFacilityLevel.value,
      true,
    )
    const boostSuffix = boosted.hasBoost ? `（${scene.name}设施加成）` : ''

    updateDormSubSceneState(scene.id, { countVisit: true, appendSceneJournal: false })

    deps.applyDormAction({
      affectionDelta: boosted.affectionDelta,
      energyDelta: boosted.energyDelta,
      mood: String(activity.mood || '放松').trim(),
      journalText: deps.renderTemplate(activity.journalText || '你在场景中进行了互动。', charName),
      feedbackText: `${activity.feedbackText || '场景互动完成。'}${boostSuffix}`,
      countKey: 'sceneCount',
      type: 'scene',
      consumeTimeSlot: true,
      wishType: 'scene',
    })
  }

  function handleDormSubSceneActivitySelectChange(event) {
    const nextId = String(event?.target?.value || '').trim()
    if (!nextId) return

    const exists = activeDormSubSceneActivityOptions.value.some((activity) => activity.id === nextId)
    if (!exists) return

    deps.selectedSubSceneActivityId.value = nextId
  }

  function handleRunDormSubSceneActivity() {
    const selectedActivity = selectedDormSubSceneActivity.value
    if (!selectedActivity) return
    handleDormSubSceneAction(selectedActivity)
  }

  // 内部辅助函数：应用每日进度到状态
  function applyDailyProgressToState(state, { consumeTimeSlot = false, wishType = '', charLabel = '角色' } = {}) {
    const DORM_TIME_SLOT_COUNT = 3
    let consumedSlot = false
    let remainingSlots = deps.clampInt(DORM_TIME_SLOT_COUNT - state.timeSlotIndex, 0, DORM_TIME_SLOT_COUNT, DORM_TIME_SLOT_COUNT)
    const completedWishLabels = []

    if (consumeTimeSlot) {
      const nextIndex = deps.clampInt(state.timeSlotIndex + 1, 0, DORM_TIME_SLOT_COUNT, 0)
      state = { ...state, timeSlotIndex: nextIndex }
      consumedSlot = true
      remainingSlots = deps.clampInt(DORM_TIME_SLOT_COUNT - nextIndex, 0, DORM_TIME_SLOT_COUNT, 0)
    }

    const safeType = String(wishType || '').trim()
    if (safeType && Array.isArray(state.todayWishes) && state.todayWishes.length > 0) {
      let rewardAffection = 0
      let rewardEnergy = 0
      const labels = []

      const updatedWishes = state.todayWishes.map((wish) => {
        if (wish.type !== safeType || wish.completed) return wish
        const nextProgress = deps.clampInt(wish.progress + 1, 0, wish.target, wish.progress)
        const completed = nextProgress >= wish.target
        if (completed) {
          rewardAffection += wish.rewardAffection || 0
          rewardEnergy += wish.rewardEnergy || 0
          labels.push(wish.label)
        }
        return { ...wish, progress: nextProgress, completed }
      })

      state = {
        ...state,
        todayWishes: updatedWishes,
        affection: deps.clampInt(state.affection + rewardAffection, deps.DORM_AFFECTION_MIN, deps.DORM_AFFECTION_MAX, state.affection),
        energy: deps.clampInt(state.energy + rewardEnergy, deps.DORM_ENERGY_MIN, deps.DORM_ENERGY_MAX, state.energy),
      }
      completedWishLabels.push(...labels)
    }

    return { state, consumedSlot, remainingSlots, completedWishLabels }
  }

  return {
    // 计算属性
    generatedDormSubScenes,
    activeDormSubScene,
    activeDormSubSceneActivityOptions,
    selectedDormSubSceneActivity,
    activeDormSubSceneVisitCount,
    activeDormSubSceneFacilityLevel,
    activeDormSubSceneFacilityBonusPercent,
    canUpgradeActiveSceneFacility,
    activeSceneUpgradeButtonText,
    remainingDormActionSlots,
    // 方法
    handleSelectDormSubScene,
    handleDormSubSceneSelectChange,
    handleUpgradeActiveSceneFacility,
    handleDormSubSceneAction,
    handleDormSubSceneActivitySelectChange,
    handleRunDormSubSceneActivity,
    updateDormSubSceneState,
    // 内部工具（供 triggerDormEvent 等外部调用）
    getSceneEventPool,
    getFacilityBonusPercentByLevel,
    // 常量
    DORM_SUB_SCENE_LIBRARY,
    DORM_BASE_SUB_SCENE,
    DORM_SUB_SCENE_EVENT_LIBRARY,
    DORM_SCENE_FACILITY_MIN_LEVEL,
    DORM_SCENE_FACILITY_MAX_LEVEL,
    DORM_SCENE_FACILITY_BONUS_STEP,
    DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST,
  }
}
