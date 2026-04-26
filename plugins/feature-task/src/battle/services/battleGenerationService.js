/**
 * 战斗生成服务
 * 队伍和技能本地生成，LLM 只生成敌人 + 波次剧情 + 掉落
 */

import { callChatCompletion, getValidatedActiveConfig } from '../../../../../src/llm/llmService.core.js'
import { resolvePrompt } from '../../../../../src/llm/promptRegistry.js'

/**
 * 将 LLM 请求和响应写入本地调试文件
 * Web 环境用 localStorage，Android 环境用 Capacitor Filesystem
 */
async function saveBattleLlmDebug(userPrompt, systemPrompt, rawResponse, parseSuccess) {
  const timestamp = new Date().toISOString()
  const separator = '='.repeat(60)
  const entry = [
    separator,
    `[${timestamp}] 战斗生成 | 解析${parseSuccess ? '成功' : '失败'}`,
    separator,
    '',
    '--- SYSTEM PROMPT ---',
    systemPrompt,
    '',
    '--- USER PROMPT ---',
    userPrompt,
    '',
    '--- LLM RESPONSE ---',
    rawResponse,
    '',
  ].join('\n')

  // Web 浏览器直接用 localStorage
  if (typeof window !== 'undefined' && !window.Capacitor) {
    try {
      localStorage.setItem('battle_llm_debug_log', entry)
      console.log('[BattleGen] 调试日志已写入 localStorage')
      return
    } catch (e) {
      console.warn('[BattleGen] localStorage 写入失败:', e.message)
    }
  }

  // 尝试 Capacitor Filesystem（Android 原生环境）
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    try {
      await Filesystem.mkdir({ path: 'debug', directory: Directory.Documents, recursive: true })
    } catch {}
    const result = await Filesystem.writeFile({
      path: 'debug/battle-llm-responses.log',
      data: entry,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    if (result && result.uri) {
      console.log('[BattleGen] 调试日志已写入:', result.uri)
      return
    }
  } catch (e) {
    console.warn('[BattleGen] Capacitor Filesystem 写入失败:', e.message)
  }

  // localStorage 回退
  try {
    localStorage.setItem('battle_llm_debug_log', entry)
  } catch (e) {
    console.warn('[BattleGen] 写入调试日志失败:', e.message)
  }
}

// 默认玩家技能
const createPlayerSkills = () => [
  { id: 'player_atk', name: '普通攻击', icon: '⚔️', description: '基础物理攻击', type: 'attack', targetMode: 'single', damageType: 'physical', damageMultiplier: 1.0, hitCount: 1, cooldown: 0, effects: [] },
  { id: 'player_heavy', name: '重击', icon: '💥', description: '强力一击，造成1.5倍伤害', type: 'attack', targetMode: 'single', damageType: 'physical', damageMultiplier: 1.5, hitCount: 1, cooldown: 2, effects: [] },
]

// 为角色生成默认技能（根据性格随机 1-2 个特殊技能）
const createCharacterSkills = (char) => {
  const skillPool = [
    { id: `${char.id}_heal`, name: `${char.name}的治疗`, icon: '💚', type: 'heal', targetMode: 'self', damageType: '', damageMultiplier: 0, hitCount: 0, cooldown: 3, effects: [], description: '回复队友生命值' },
    { id: `${char.id}_shield`, name: `${char.name}的护盾`, icon: '🛡️', type: 'defense', targetMode: 'self', damageType: '', damageMultiplier: 0, hitCount: 0, cooldown: 3, effects: [], description: '为自己和队友提供护盾' },
    { id: `${char.id}_aoe`, name: `${char.name}的范围攻击`, icon: '🌪️', type: 'attack', targetMode: 'all_enemies', damageType: 'physical', damageMultiplier: 0.7, hitCount: 1, cooldown: 3, effects: [], description: '对全体敌人造成伤害' },
    { id: `${char.id}_fire`, name: `${char.name}的火焰`, icon: '🔥', type: 'attack', targetMode: 'single', damageType: 'fire', damageMultiplier: 1.3, hitCount: 1, cooldown: 2, effects: [], description: '火焰属性攻击' },
    { id: `${char.id}_ice`, name: `${char.name}的寒冰`, icon: '❄️', type: 'attack', targetMode: 'single', damageType: 'ice', damageMultiplier: 1.3, hitCount: 1, cooldown: 2, effects: [], description: '冰属性攻击' },
    { id: `${char.id}_lightning`, name: `${char.name}的雷电`, icon: '⚡', type: 'attack', targetMode: 'single', damageType: 'lightning', damageMultiplier: 1.3, hitCount: 1, cooldown: 2, effects: [], description: '雷属性攻击' },
    { id: `${char.id}_dark`, name: `${char.name}的暗影`, icon: '🌑', type: 'attack', targetMode: 'single', damageType: 'dark', damageMultiplier: 1.4, hitCount: 1, cooldown: 3, effects: [], description: '暗影属性攻击' },
    { id: `${char.id}_buff`, name: `${char.name}的鼓舞`, icon: '✨', type: 'support', targetMode: 'self', damageType: '', damageMultiplier: 0, hitCount: 0, cooldown: 3, effects: [], description: '提升全队攻击力' },
  ]
  // 随机选 1-2 个技能
  const count = Math.random() < 0.5 ? 1 : 2
  const shuffled = [...skillPool].sort(() => Math.random() - 0.5)
  const chosen = shuffled.slice(0, count).map(s => ({
    ...s,
    id: `${char.id || char.name}_${s.type}_${Math.random().toString(36).slice(2, 6)}`,
  }))
  return chosen
}

/**
 * 本地构建队伍数据
 */
const buildTeam = ({ selectedCharacters, userProfile }) => {
  const members = []

  // 玩家
  members.push({
    id: 'user_player',
    name: userProfile.name || '玩家',
    portrait: '',
    isPlayer: true,
    hp: 600, maxHp: 600, attack: 80, defense: 30, speed: 20,
    critRate: 0.1, critDmg: 1.5, position: 0,
    skills: createPlayerSkills(),
  })

  // 选中角色
  selectedCharacters.slice(0, 3).forEach((char, i) => {
    const personality = char.personalityProfile || {}
    const dimensions = personality.cognitiveDimensions || {}
    // 根据认知维度推算属性
    const atk = 65 + (dimensions.aggressiveness || 50) * 0.4
    const def = 20 + (dimensions.resilience || 50) * 0.3
    const spd = 12 + (dimensions.activityLevel || 50) * 0.2
    const extraSkills = createCharacterSkills(char)
    members.push({
      id: char.id || `char_${i}`,
      name: char.name || `队员${i + 1}`,
      portrait: char.portraits?.[0] || '',
      isPlayer: false,
      hp: 500 + i * 50, maxHp: 500 + i * 50,
      attack: Math.round(atk), defense: Math.round(def), speed: Math.round(spd),
      critRate: 0.1, critDmg: 1.5, position: i + 1,
      skills: [
        {
          id: `${char.id || char.name}_normal`,
          name: '普通攻击',
          icon: '⚔️',
          description: '基础攻击',
          type: 'attack',
          targetMode: 'single',
          damageType: 'physical',
          damageMultiplier: 1.0,
          hitCount: 1,
          cooldown: 0,
          effects: [],
        },
        ...extraSkills,
      ],
    })
  })

  return members
}

/**
 * 调用 LLM 生成完整战斗数据
 * @param {Object} params
 * @param {Object} params.task - 任务对象
 * @param {Array} params.selectedCharacters - 选中的队员列表（不含玩家）
 * @param {Object} params.worldBook - 世界书对象
 * @param {Object} params.userProfile - 玩家信息
 * @returns {Promise<Object>} 战斗数据
 */
export const generateBattleData = async ({ task, selectedCharacters, worldBook, userProfile }) => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) {
    throw new Error(validation.error || 'API配置无效')
  }

  // 本地构建队伍（不调用 LLM）
  const teamMembers = buildTeam({ selectedCharacters, userProfile })

  const userPrompt = `世界书标题：${worldBook?.title || '未命名'}
世界书概述：${worldBook?.summary || worldBook?.entries?.overview || '无'}
世界书细节：${worldBook?.entries?.conflict || worldBook?.entries?.secrets || '无'}

任务名称：${task?.name || '未知任务'}
任务类型：${task?.type || '未知'}
任务描述：${task?.description || '无'}

玩家信息：
名称：${userProfile?.name || '玩家'}
身份：${userProfile?.identity || '冒险者'}
外貌：${userProfile?.appearance || '无特殊描述'}
背景：${userProfile?.background || '无'}

队员列表（已本地生成，你不需要再生成）：
${teamMembers.map(m => `- ${m.name} (${m.isPlayer ? '玩家' : '队员'}) hp:${m.maxHp} atk:${m.attack} def:${m.defense} spd:${m.speed}`).join('\n')}

请只生成：
1. 三场战斗的敌人（每场3个以上，Boss战1个Boss+3个小怪）
2. 每场战斗的背景故事
3. 每场战斗的掉落物品
按上述紧凑格式生成战斗数据。`

  try {
    const systemPrompt = await resolvePrompt('task:battle')
    console.log('[BattleGen] 开始调用 LLM, maxTokens=20000, timeout=120s')
    const result = await callChatCompletion({
      config: validation.config,
      systemPrompt,
      userPrompt,
      temperature: 0.85,
      maxTokens: 20000,
      timeout: 120000,
    })
    console.log('[BattleGen] LLM 返回, success:', result.success, 'data长度:', result.data?.length || 0)

    if (!result.success) {
      console.error('[BattleGen] LLM 返回失败:', result.error)
      throw new Error(result.error || 'LLM调用失败')
    }

    const content = result.data || ''
    console.log('[BattleGen] LLM 返回内容(前500字):', content.substring(0, 500))

    const parsed = parseCompactFormat(content)
    console.log('[BattleGen] 解析结果:', parsed ? '成功' : '失败')

    if (!parsed) {
      console.error('[BattleGen] 解析失败, 原始内容:', content.substring(0, 1000))
      await saveBattleLlmDebug(userPrompt, systemPrompt, content, false)
      throw new Error('战斗数据解析失败')
    }

    // 合并本地队伍与 LLM 生成的敌人/剧情/掉落
    const merged = {
      teamMembers,
      waves: parsed.waves || [],
      globalStoryContext: parsed.globalStoryContext || '',
    }

    await saveBattleLlmDebug(userPrompt, systemPrompt, content, true)

    return { success: true, data: merged, rawResponse: content }
  } catch (error) {
    console.error('[BattleGen] 异常:', error.message)
    return { success: false, error: error.message, data: null }
  }
}

// ==================== XML 格式解析器 ====================

const parseCompactFormat = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  // 剥离 <thinking> 标签
  const withoutThinking = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')

  // 尝试从 markdown 代码块中提取
  const fencedMatch = withoutThinking.match(/```(?:xml)?\s*([\s\S]*?)```/i)
  const content = fencedMatch?.[1]?.trim() || withoutThinking

  if (!content.trim()) return null

  console.log('[BattleGen] 解析用内容长度:', content.length)
  console.log('[BattleGen] 内容前300字:', content.substring(0, 300))

  const battleData = {
    teamMembers: [],  // 队伍由调用方本地构建
    waves: [],
    globalStoryContext: '',
  }

  // 提取全局故事
  const gsMatch = content.match(/<global-story>([\s\S]*?)<\/global-story>/i)
  if (gsMatch) {
    battleData.globalStoryContext = gsMatch[1].trim()
    console.log('[BattleGen] 找到 global-story, 长度:', gsMatch[1].length)
  }

  // 队伍由调用方本地构建，不再从 LLM 输出解析

  // 解析波次
  const waveRegex = /<wave([\s\S]*?)>([\s\S]*?)<\/wave>/gi
  let waveMatch
  let waveIdx = 0
  while ((waveMatch = waveRegex.exec(content)) !== null) {
    const attrs = parseAttrs(waveMatch[1])
    const waveContent = waveMatch[2]
    console.log('[BattleGen] 找到波次 index:', attrs.index, 'is-boss:', attrs['is-boss'])

    const storyMatch = waveContent.match(/<story>([\s\S]*?)<\/story>/i)

    // 提取敌人
    const enemies = []
    const enemyRegex = /<enemy([\s\S]*?)>([\s\S]*?)<\/enemy>/gi
    let eMatch
    let eIdx = 0
    while ((eMatch = enemyRegex.exec(waveContent)) !== null) {
      const eAttrs = parseAttrs(eMatch[1])
      const eSkills = parseSkillsInBlock(eMatch[2])
      console.log('[BattleGen]   敌人:', eAttrs.name, '技能数:', eSkills.length)
      enemies.push({
        id: `enemy_${waveIdx}_${eIdx++}`,
        name: eAttrs.name || `敌人${eIdx}`,
        portrait: '',
        isPlayer: false,
        hp: parseInt(eAttrs.hp) || 200,
        maxHp: parseInt(eAttrs['max-hp']) || 200,
        attack: parseFloat(eAttrs.atk) || 30,
        defense: parseFloat(eAttrs.def) || 10,
        speed: parseFloat(eAttrs.spd) || 12,
        critRate: parseFloat(eAttrs.cr) || 0.05,
        critDmg: parseFloat(eAttrs.cd) || 1.5,
        position: parseInt(eAttrs.pos) || eIdx,
        skills: eSkills,
      })
    }

    // 提取掉落 — 兼容 <drop ...>desc</drop> 和 <drop .../>
    const drops = []
    const dropRegex = /<drop([\s\S]*?)(?:\/>|>([\s\S]*?)<\/drop>)/gi
    let dMatch
    let dIdx = 0
    while ((dMatch = dropRegex.exec(waveContent)) !== null) {
      const dAttrs = parseAttrs(dMatch[1])
      const dropDesc = (dMatch[2] || '').trim()
      drops.push({
        id: dAttrs.id || `drop_w${waveIdx}_${dIdx++}`,
        name: dAttrs.name || `道具${dIdx}`,
        icon: dAttrs.icon || '📦',
        description: dropDesc || dAttrs.name,
        category: dAttrs.cat || 'consumable',
        effectType: dAttrs.effect || 'heal',
        value: parseFloat(dAttrs.value) || 0,
        damageType: '',
        targetMode: dAttrs.target || 'self',
        usageCount: parseInt(dAttrs.uses) || 1,
      })
    }

    battleData.waves.push({
      waveIndex: parseInt(attrs.index) || waveIdx,
      isBossWave: attrs['is-boss'] === '1',
      enemies,
      backgroundStory: storyMatch ? storyMatch[1].trim() : '',
      dropTable: drops,
    })
    waveIdx++
  }

  // 限制每个角色最多 3 个技能
  battleData.waves.forEach(w => {
    w.enemies.forEach(e => {
      if (e.skills.length > 3) e.skills = e.skills.slice(0, 3)
    })
  })

  if (battleData.waves.length === 0) {
    console.warn('[BattleGen] 解析结果为空，内容长度:', content.length)
    console.warn('[BattleGen] 检查 XML 标签是否匹配')
    return null
  }

  console.log(`[BattleGen] 解析完成: ${battleData.waves.length} 波次, 故事长度: ${battleData.globalStoryContext.length}`)
  return battleData
}

/**
 * 解析 XML 属性字符串为键值对
 */
const parseAttrs = (str) => {
  const result = {}
  const regex = /([\w-]+)="([^"]*)"/g
  let match
  while ((match = regex.exec(str)) !== null) {
    result[match[1]] = match[2]
  }
  return result
}

/**
 * 从块内容中解析所有 <skill ...>text</skill>
 */
const parseSkillsInBlock = (content) => {
  const skills = []
  const skillRegex = /<skill([\s\S]*?)>([\s\S]*?)<\/skill>/gi
  let match
  while ((match = skillRegex.exec(content)) !== null) {
    const attrs = parseAttrs(match[1])
    const desc = match[2].trim()
    skills.push({
      id: attrs.id || `skill_${skills.length}`,
      name: attrs.name || '未知技能',
      icon: attrs.icon || '⚡',
      type: attrs.type || 'attack',
      targetMode: attrs.target || 'single',
      damageType: attrs.dmg === 'none' ? '' : (attrs.dmg || 'physical'),
      damageMultiplier: parseFloat(attrs.mult) || 1.0,
      cooldown: parseInt(attrs.cd) || 0,
      hitCount: parseInt(attrs.hits) || 1,
      description: desc,
      effects: [],
    })
  }
  return skills
}

/**
 * 校验战斗数据的完整性
 * @param {Object} data - 战斗数据
 * @returns {Object} { valid, errors }
 */
export const validateBattleData = (data) => {
  const errors = []

  if (!data) {
    return { valid: false, errors: ['战斗数据为空'] }
  }

  // 校验 waves
  if (!Array.isArray(data.waves) || data.waves.length < 3) {
    errors.push(`战斗波次 (waves) 不足 3 场，当前 ${data.waves?.length || 0}`)
  } else {
    data.waves.forEach((wave, i) => {
      if (!wave.enemies || wave.enemies.length < 3) {
        errors.push(`波次[${i}]敌人数量不足 3 个`)
      }
      if (i === 2 && !wave.isBossWave) {
        errors.push('波次[2]应为 Boss 战 (isBossWave: true)')
      }
      if (!wave.backgroundStory) {
        errors.push(`波次[${i}]缺少背景剧情`)
      }
    })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 生成默认战斗数据（LLM 失败时的 fallback）
 * @param {Object} params
 * @returns {Object} 默认战斗数据
 */
export const createDefaultBattleData = (params = {}) => {
  const { selectedCharacters = [], userProfile = {}, task = {} } = params

  const teamMembers = [
    {
      id: 'user_player',
      name: userProfile.name || '玩家',
      portrait: '',
      isPlayer: true,
      hp: 600,
      maxHp: 600,
      attack: 80,
      defense: 30,
      speed: 20,
      critRate: 0.1,
      critDmg: 1.5,
      position: 0,
      skills: [
        {
          id: 'skill_normal_atk',
          name: '普通攻击',
          icon: '⚔️',
          description: '基础物理攻击',
          type: 'attack',
          targetMode: 'single',
          damageType: 'physical',
          damageMultiplier: 1.0,
          hitCount: 1,
          cooldown: 0,
          effects: [],
        },
        {
          id: 'skill_heavy_strike',
          name: '重击',
          icon: '💥',
          description: '强力的物理攻击，造成1.5倍伤害',
          type: 'attack',
          targetMode: 'single',
          damageType: 'physical',
          damageMultiplier: 1.5,
          hitCount: 1,
          cooldown: 2,
          effects: [],
        },
      ],
    },
    ...selectedCharacters.slice(0, 3).map((char, i) => ({
      id: char.id || `char_${i}`,
      name: char.name || `队员${i + 1}`,
      portrait: char.portraits?.[0] || '',
      isPlayer: false,
      hp: 500,
      maxHp: 500,
      attack: 70,
      defense: 25,
      speed: 15 + i * 3,
      critRate: 0.1,
      critDmg: 1.5,
      position: i + 1,
      skills: [
        {
          id: `${char.id || char.name}_normal`,
          name: '普通攻击',
          icon: '⚔️',
          description: '基础攻击',
          type: 'attack',
          targetMode: 'single',
          damageType: 'physical',
          damageMultiplier: 1.0,
          hitCount: 1,
          cooldown: 0,
          effects: [],
        },
        {
          id: `${char.id || char.name}_special`,
          name: `${char.name}的特殊技能`,
          icon: '✨',
          description: '特殊技能',
          type: 'attack',
          targetMode: 'single',
          damageType: ['fire', 'ice', 'lightning', 'poison'][i % 4],
          damageMultiplier: 1.3,
          hitCount: 1,
          cooldown: 2,
          effects: [],
        },
      ],
    })),
  ]

  const defaultEnemies = [
    { name: '暗影狼', hp: 200, maxHp: 200, attack: 30, defense: 10, speed: 12 },
    { name: '腐化骷髅', hp: 250, maxHp: 250, attack: 35, defense: 15, speed: 8 },
    { name: '暗影猎手', hp: 180, maxHp: 180, attack: 45, defense: 8, speed: 18 },
  ]

  const defaultBoss = { name: '深渊领主', hp: 800, maxHp: 800, attack: 80, defense: 30, speed: 15 }

  const defaultDropItems = [
    {
      id: `drop_${Date.now()}_heal`,
      name: '生命药水',
      icon: '🧪',
      description: '恢复100点生命值',
      category: 'consumable',
      effectType: 'heal',
      value: 100,
      damageType: '',
      targetMode: 'self',
      usageCount: 1,
    },
    {
      id: `drop_${Date.now()}_bomb`,
      name: '火焰炸弹',
      icon: '💣',
      description: '对单个敌人造成120点火属性伤害',
      category: 'consumable',
      effectType: 'damage',
      value: 120,
      damageType: 'fire',
      targetMode: 'enemy_single',
      usageCount: 1,
    },
  ]

  const createEnemy = (base, index) => ({
    id: `enemy_${index}`,
    name: base.name,
    portrait: '',
    isPlayer: false,
    hp: base.hp,
    maxHp: base.maxHp,
    attack: base.attack,
    defense: base.defense,
    speed: base.speed,
    critRate: 0.05,
    critDmg: 1.5,
    position: index,
    skills: [
      {
        id: `enemy_${index}_atk`,
        name: '普通攻击',
        icon: '👊',
        description: '普通攻击',
        type: 'attack',
        targetMode: 'single',
        damageType: 'physical',
        damageMultiplier: 1.0,
        hitCount: 1,
        cooldown: 0,
        effects: [],
      },
    ],
  })

  const waves = [
    {
      waveIndex: 0,
      isBossWave: false,
      enemies: defaultEnemies.map((e, i) => createEnemy(e, i)),
      backgroundStory: `${task.name || '任务'}的前路被一群暗影生物挡住了。幽暗的通道中，几只暗影狼和腐化骷髅正在游荡，它们发现了你的队伍，发出低沉的嘶吼。`,
      dropTable: defaultDropItems.map(item => ({ ...item, id: `drop_w1_${item.effectType}_${Date.now()}` })),
    },
    {
      waveIndex: 1,
      isBossWave: false,
      enemies: [
        ...defaultEnemies.map((e, i) => createEnemy({ ...e, hp: e.hp + 80, attack: e.attack + 10 }, i + 3)),
      ],
      backgroundStory: '穿过第一道防线后，队伍遭遇了更强大的敌人。暗影猎手潜伏在暗处，伺机发动致命一击。',
      dropTable: defaultDropItems.map(item => ({ ...item, id: `drop_w2_${item.effectType}_${Date.now()}`, value: item.value + 20 })),
    },
    {
      waveIndex: 2,
      isBossWave: true,
      enemies: [
        createEnemy(defaultBoss, 6),
        ...defaultEnemies.map((e, i) => createEnemy({ ...e, hp: e.hp + 150, attack: e.attack + 20 }, i + 7)),
      ],
      backgroundStory: '深渊的尽头，深渊领主矗立在你面前。它是这片黑暗的主宰，手下无数暗影生物为其效命。最终决战，此刻降临。',
      dropTable: [
        ...defaultDropItems.map(item => ({ ...item, id: `drop_w3_${item.effectType}_${Date.now()}`, value: item.value + 40 })),
        {
          id: `drop_w3_antidote_${Date.now()}`,
          name: '万能解毒剂',
          icon: '💊',
          description: '清除自身所有负面状态',
          category: 'consumable',
          effectType: 'debuff_cleanse',
          value: 0,
          damageType: '',
          targetMode: 'self',
          usageCount: 1,
        },
      ],
    },
  ]

  return {
    success: true,
    data: {
      teamMembers,
      waves,
      globalStoryContext: `在${task.name || '这个任务'}中，你的队伍需要面对三波敌人的挑战。`,
    },
    rawResponse: '（默认数据）',
  }
}
