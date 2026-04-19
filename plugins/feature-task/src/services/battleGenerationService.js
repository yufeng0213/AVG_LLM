/**
 * 战斗生成服务
 * 负责通过 LLM 生成战斗数据（敌人、队友属性、技能、背景剧情、掉落道具）
 * 使用紧凑键值格式替代 JSON，减少 50-60% token 消耗
 */

import { callChatCompletion, getValidatedActiveConfig } from '../../../../src/llm/llmService.core.js'
import { resolvePrompt } from '../../../../src/llm/promptRegistry.js'

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

  // 构建队员摘要
  const teamSummary = selectedCharacters.map((char, index) => {
    const personality = char.personalityProfile || {}
    const dimensions = personality.cognitiveDimensions || {}
    const dimText = Object.entries(dimensions)
      .map(([k, v]) => `${k}:${v}`)
      .slice(0, 4)
      .join('|')
    return `${index + 1}. ${char.name}（${char.identity || '未知身份'}）${personality.mbti ? 'MBTI:' + personality.mbti : ''} ${dimText}`
  }).join('\n')

  const systemPrompt = await resolvePrompt('task:battle')

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

队员列表：
${teamSummary || '无额外队员'}

请按上述紧凑格式生成战斗数据。`

  try {
    console.log('[BattleGen] 开始调用 LLM, maxTokens=4000, timeout=300s')
    const result = await callChatCompletion({
      config: validation.config,
      systemPrompt,
      userPrompt,
      temperature: 0.85,
      maxTokens: 4000,
      timeout: 300000, // 5 分钟超时，适配大量 token 生成
    })
    console.log('[BattleGen] LLM 返回, success:', result.success, 'data长度:', result.data?.length || 0)

    if (!result.success) {
      console.error('[BattleGen] LLM 返回失败:', result.error)
      throw new Error(result.error || 'LLM调用失败')
    }

    const content = result.data || ''
    console.log('[BattleGen] LLM 返回内容(前500字):', content.substring(0, 500))

    // 下载原始文本到本地方便调试
    try {
      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `battle_gen_${Date.now()}.txt`
      a.click()
      URL.revokeObjectURL(url)
      console.log('[BattleGen] 已自动下载 battle_gen_*.txt 调试文件')
    } catch (dlErr) {
      console.warn('[BattleGen] 下载失败:', dlErr.message)
    }

    const parsed = parseCompactFormat(content)
    console.log('[BattleGen] 解析结果:', parsed ? '成功' : '失败')

    if (!parsed) {
      console.error('[BattleGen] 解析失败, 原始内容:', content.substring(0, 1000))
      throw new Error('战斗数据解析失败')
    }

    return { success: true, data: parsed, rawResponse: content }
  } catch (error) {
    console.error('[BattleGen] 异常:', error.message)
    return { success: false, error: error.message, data: null }
  }
}

// ==================== 紧凑格式解析器 ====================

const parseCompactFormat = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  // 尝试从 markdown 代码块中提取
  const fencedMatch = raw.match(/```(?:\w+)?\s*([\s\S]*?)```/i)
  const content = fencedMatch?.[1]?.trim() || raw

  const battleData = {
    teamMembers: [],
    waves: [],
    globalStoryContext: '',
  }

  let currentTeamMember = null
  let currentEnemy = null
  let currentWave = null
  let currentSkill = null

  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // 解析队伍成员 [T:name|isPlayer|hp|maxHp|at|df|sp|cr|cd|pos]
    const teamMatch = line.match(/^\[T:(.+?)\|(\d)\|(\d+)\|(\d+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|(\d+)\]/)
    if (teamMatch) {
      if (currentTeamMember) battleData.teamMembers.push(currentTeamMember)
      currentTeamMember = {
        id: `member_${battleData.teamMembers.length}`,
        name: teamMatch[1],
        portrait: '',
        isPlayer: teamMatch[2] === '1',
        hp: parseInt(teamMatch[3]),
        maxHp: parseInt(teamMatch[4]),
        attack: parseFloat(teamMatch[5]),
        defense: parseFloat(teamMatch[6]),
        speed: parseFloat(teamMatch[7]),
        critRate: parseFloat(teamMatch[8]),
        critDmg: parseFloat(teamMatch[9]),
        position: parseInt(teamMatch[10]),
        skills: [],
      }
      currentEnemy = null
      currentSkill = null
      continue
    }

    // 解析技能 <S:id|name|icon|type|target|dmgType|multiplier|cooldown|hitCount|description>
    const skillMatch = line.match(/^<S:(.+?)\|(.+?)\|(.+?)\|(.+?)\|(.+?)\|(.+?)\|([\d.]+)\|(\d+)\|(\d+)\|(.+?)>/)
    if (skillMatch) {
      currentSkill = {
        id: skillMatch[1],
        name: skillMatch[2],
        icon: skillMatch[3],
        type: skillMatch[4],
        targetMode: skillMatch[5],
        damageType: skillMatch[6] === 'none' ? '' : skillMatch[6],
        damageMultiplier: parseFloat(skillMatch[7]),
        cooldown: parseInt(skillMatch[8]),
        hitCount: parseInt(skillMatch[9]),
        description: skillMatch[10],
        effects: [],
      }
      if (currentTeamMember) {
        currentTeamMember.skills.push(currentSkill)
      } else if (currentEnemy) {
        currentEnemy.skills.push(currentSkill)
      }
      continue
    }

    // 解析技能特效 fx:type@chance@duration@value,...
    const fxMatch = line.match(/^fx:(.+)$/)
    if (fxMatch && currentSkill) {
      const fxStr = fxMatch[1].trim()
      if (fxStr && fxStr !== 'none') {
        currentSkill.effects = fxStr.split(',').map(fx => {
          const parts = fx.split('@')
          return {
            type: parts[0]?.trim() || '',
            chance: parseFloat(parts[1] || 1.0),
            duration: parseInt(parts[2] || 1),
            value: parseFloat(parts[3] || 0),
          }
        })
      }
      continue
    }

    // 解析波次 [W:waveIndex|isBoss]
    const waveMatch = line.match(/^\[W:(\d+)\|(\d+)\]/)
    if (waveMatch) {
      // 保存上一个波次
      if (currentWave && currentEnemy) {
        currentWave.enemies.push(currentEnemy)
        currentEnemy = null
      }
      if (currentWave) battleData.waves.push(currentWave)

      currentWave = {
        waveIndex: parseInt(waveMatch[1]),
        isBossWave: waveMatch[2] === '1',
        enemies: [],
        backgroundStory: '',
        dropTable: [],
      }
      currentSkill = null
      continue
    }

    // 解析背景剧情 story:xxx
    const storyMatch = line.match(/^story:(.+)$/)
    if (storyMatch && currentWave) {
      currentWave.backgroundStory = storyMatch[1].trim()
      continue
    }

    // 解析敌人 [E:name|hp|maxHp|at|df|sp|cr|cd|pos]
    const enemyMatch = line.match(/^\[E:(.+?)\|(\d+)\|(\d+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|(\d+)\]/)
    if (enemyMatch && currentWave) {
      if (currentEnemy) currentWave.enemies.push(currentEnemy)
      currentEnemy = {
        id: `enemy_${currentWave.waveIndex}_${currentWave.enemies.length}`,
        name: enemyMatch[1],
        portrait: '',
        isPlayer: false,
        hp: parseInt(enemyMatch[2]),
        maxHp: parseInt(enemyMatch[3]),
        attack: parseFloat(enemyMatch[4]),
        defense: parseFloat(enemyMatch[5]),
        speed: parseFloat(enemyMatch[6]),
        critRate: parseFloat(enemyMatch[7]),
        critDmg: parseFloat(enemyMatch[8]),
        position: parseInt(enemyMatch[9]),
        skills: [],
      }
      currentSkill = null
      continue
    }

    // 解析掉落 [D:id|name|icon|category|effectType|value|dmgType|targetMode|usageCount|description]
    const dropMatch = line.match(/^\[D:(.+?)\|(.+?)\|(.+?)\|(.+?)\|(.+?)\|([\d.]+)\|(.+?)\|(.+?)\|(\d+)\|(.+?)\]/)
    if (dropMatch && currentWave) {
      currentWave.dropTable.push({
        id: dropMatch[1],
        name: dropMatch[2],
        icon: dropMatch[3],
        description: dropMatch[10],
        category: dropMatch[4],
        effectType: dropMatch[5],
        value: parseFloat(dropMatch[6]),
        damageType: dropMatch[7] === '_' ? '' : dropMatch[7],
        targetMode: dropMatch[8],
        usageCount: parseInt(dropMatch[9]),
      })
      continue
    }

    // 解析全局故事 [G:text...]
    const globalMatch = line.match(/^\[G:(.+)\]/)
    if (globalMatch) {
      battleData.globalStoryContext = globalMatch[1]
      continue
    }
  }

  // 收尾：保存最后一个对象
  if (currentEnemy && currentWave) {
    currentWave.enemies.push(currentEnemy)
  }
  if (currentWave) battleData.waves.push(currentWave)
  if (currentTeamMember) battleData.teamMembers.push(currentTeamMember)

  // 校验基本结构
  if (battleData.teamMembers.length === 0 && battleData.waves.length === 0) {
    console.warn('[BattleGen] 解析结果为空，内容长度:', content.length)
    return null
  }

  console.log(`[BattleGen] 解析完成: ${battleData.teamMembers.length} 队员, ${battleData.waves.length} 波次, 故事长度: ${battleData.globalStoryContext.length}`)
  return battleData
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

  // 校验 teamMembers
  if (!Array.isArray(data.teamMembers) || data.teamMembers.length === 0) {
    errors.push('缺少队伍成员 (teamMembers)')
  } else {
    data.teamMembers.forEach((member, i) => {
      if (!member.name) errors.push(`队员[${i}]缺少 name`)
      if (!member.maxHp) errors.push(`队员[${i}]缺少 maxHp`)
      if (!member.skills || member.skills.length === 0) errors.push(`队员[${i}]缺少 skills`)
    })
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
