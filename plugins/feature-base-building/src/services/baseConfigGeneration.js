import { callChatCompletion, getValidatedActiveConfig } from '../../../../src/llm/llmService.core.js'

async function callLLMForConfig(prompt, systemPrompt) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    throw new Error(validated.error)
  }
  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt,
    userPrompt: prompt,
    temperature: 0.7,
    maxTokens: 2000,
  })
  return result?.content || result?.text || ''
}

const BUILD_CONFIG_SYSTEM_PROMPT = `你是"AVG 基地配置设计师"。
根据世界书背景，设计基地的资源分类和设施系统。

输出格式为紧凑XML，不要多余文字。

资源要求：
- 5大分类固定：食物/材料/能源/医疗/科技
- 每分类2-3种具体资源，贴合世界书背景
- 每个资源: id, name, icon(emoji), baseValue(1-50), rarity(common/uncommon/rare)

设施要求：
- 5大分类固定：住所/生产/防御/研究/医疗
- 每分类2种具体设施，贴合世界书背景
- 每个设施: id, name, icon(emoji), produces(产出资源分类), output(资源id:数量), level(1), upgradeCost(升级所需资源列表: resourceId:count)

XML根元素: <base-config>
子元素: <resource-category key="食物" label="食物">
  <resource id="xxx" name="xxx" icon="x" baseValue="10" rarity="common"/>
子元素: <facility-category key="生产" label="生产">
  <facility id="xxx" name="xxx" icon="x" produces="食物" output="res_id:3" level="1" upgradeCost="mat:10,energy:5"/>`

function parseXmlConfig(xml) {
  const config = {
    version: 1,
    generatedAt: Date.now(),
    resourceCategories: [],
    facilityCategories: [],
  }

  const catRegex = /<resource-category[^>]*key="([^"]*)"[^>]*label="([^"]*)"[^>]*>([\s\S]*?)<\/resource-category>/g
  let match
  while ((match = catRegex.exec(xml)) !== null) {
    const [, key, label, content] = match
    const resources = []
    const resRegex = /<resource\s+([^\/]*)\/>/g
    let resMatch
    while ((resMatch = resRegex.exec(content)) !== null) {
      const attrs = resMatch[1]
      const getAttr = (name) => {
        const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(attrs)
        return m ? m[1] : ''
      }
      resources.push({
        id: getAttr('id'),
        name: getAttr('name'),
        icon: getAttr('icon'),
        baseValue: parseInt(getAttr('baseValue'), 10) || 10,
        rarity: getAttr('rarity') || 'common',
      })
    }
    if (resources.length > 0) {
      config.resourceCategories.push({ key, label, resources })
    }
  }

  const facCatRegex = /<facility-category[^>]*key="([^"]*)"[^>]*label="([^"]*)"[^>]*>([\s\S]*?)<\/facility-category>/g
  while ((match = facCatRegex.exec(xml)) !== null) {
    const [, key, label, content] = match
    const facilities = []
    const facRegex = /<facility\s+([^\/]*)\/>/g
    let facMatch
    while ((facMatch = facRegex.exec(content)) !== null) {
      const attrs = facMatch[1]
      const getAttr = (name) => {
        const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(attrs)
        return m ? m[1] : ''
      }
      const rawCost = getAttr('upgradeCost')
      const upgradeCost = {}
      if (rawCost) {
        rawCost.split(',').forEach((pair) => {
          const [resId, count] = pair.split(':').map(s => s.trim())
          if (resId && count) upgradeCost[resId] = parseInt(count, 10) || 0
        })
      }
      facilities.push({
        id: getAttr('id'),
        name: getAttr('name'),
        icon: getAttr('icon'),
        produces: getAttr('produces'),
        output: getAttr('output'),
        level: parseInt(getAttr('level'), 10) || 1,
        upgradeCost,
      })
    }
    if (facilities.length > 0) {
      config.facilityCategories.push({ key, label, facilities })
    }
  }

  return config
}

function getFallbackConfig() {
  return {
    version: 1,
    generatedAt: Date.now(),
    resourceCategories: [
      { key: 'food', label: '食物', resources: [
        { id: 'canned_food', name: '罐头食品', icon: '🥫', baseValue: 10, rarity: 'common' },
        { id: 'purified_water', name: '净化水', icon: '💧', baseValue: 8, rarity: 'common' },
      ]},
      { key: 'materials', label: '材料', resources: [
        { id: 'scrap_iron', name: '废铁', icon: '🔩', baseValue: 5, rarity: 'common' },
        { id: 'wood_plank', name: '木板', icon: '🪵', baseValue: 4, rarity: 'common' },
      ]},
      { key: 'energy', label: '能源', resources: [
        { id: 'fuel', name: '燃料', icon: '⛽', baseValue: 15, rarity: 'common' },
        { id: 'battery', name: '电池', icon: '🔋', baseValue: 12, rarity: 'uncommon' },
      ]},
      { key: 'medical', label: '医疗', resources: [
        { id: 'bandage', name: '绷带', icon: '🩹', baseValue: 8, rarity: 'common' },
        { id: 'antibiotics', name: '抗生素', icon: '💊', baseValue: 20, rarity: 'uncommon' },
      ]},
      { key: 'tech', label: '科技', resources: [
        { id: 'circuit_board', name: '电路板', icon: '🔌', baseValue: 25, rarity: 'rare' },
        { id: 'sensor_module', name: '传感器模块', icon: '📡', baseValue: 18, rarity: 'uncommon' },
      ]},
    ],
    facilityCategories: [
      { key: 'shelter', label: '住所', facilities: [
        { id: 'bunker', name: '防空洞', icon: '🏚️', produces: 'storage', output: 'capacity:50', level: 1, upgradeCost: { scrap_iron: 20, wood_plank: 10 } },
        { id: 'container_house', name: '集装箱房', icon: '📦', produces: 'storage', output: 'capacity:30', level: 1, upgradeCost: { scrap_iron: 15 } },
      ]},
      { key: 'production', label: '生产', facilities: [
        { id: 'scrap_yard', name: '废铁回收站', icon: '⚙️', produces: 'materials', output: 'scrap_iron:3', level: 1, upgradeCost: { scrap_iron: 10, fuel: 5 } },
        { id: 'water_purifier', name: '净水站', icon: '💧', produces: 'food', output: 'purified_water:2', level: 1, upgradeCost: { scrap_iron: 8, circuit_board: 1 } },
      ]},
      { key: 'defense', label: '防御', facilities: [
        { id: 'watchtower', name: '瞭望塔', icon: '🗼', produces: 'security', output: 'defense:5', level: 1, upgradeCost: { wood_plank: 15, scrap_iron: 10 } },
        { id: 'wire_fence', name: '铁丝网墙', icon: '🔗', produces: 'security', output: 'defense:3', level: 1, upgradeCost: { scrap_iron: 12 } },
      ]},
      { key: 'research', label: '研究', facilities: [
        { id: 'lab', name: '临时实验室', icon: '🔬', produces: 'tech', output: 'circuit_board:1', level: 1, upgradeCost: { scrap_iron: 20, battery: 5 } },
        { id: 'archive', name: '档案室', icon: '📚', produces: 'tech', output: 'sensor_module:1', level: 1, upgradeCost: { wood_plank: 10, battery: 3 } },
      ]},
      { key: 'medical', label: '医疗', facilities: [
        { id: 'med_station', name: '临时医疗站', icon: '🏥', produces: 'medical', output: 'bandage:2', level: 1, upgradeCost: { wood_plank: 8, battery: 2 } },
        { id: 'pharmacy', name: '药房', icon: '💊', produces: 'medical', output: 'antibiotics:1', level: 1, upgradeCost: { scrap_iron: 15, circuit_board: 2 } },
      ]},
    ],
  }
}

export async function generateBaseConfig({ worldBook, userProfile }) {
  console.log('[base-building] Generating base config via LLM...')
  const era = worldBook?.era || worldBook?.summary?.slice(0, 100) || '末日废土'
  const conflict = worldBook?.coreConflict || worldBook?.title || '生存'

  const prompt = `世界书: ${worldBook?.title || '未知'}, 时代背景: ${era}, 核心冲突: ${conflict}
用户角色: ${userProfile?.name || '幸存者'}
请根据以上背景生成基地资源配置。`

  try {
    const content = await callLLMForConfig(prompt, BUILD_CONFIG_SYSTEM_PROMPT)
    if (!content || !content.includes('<base-config')) {
      console.warn('[base-building] LLM response invalid, using fallback')
      return getFallbackConfig()
    }

    const config = parseXmlConfig(content)
    if (config.resourceCategories.length === 0 || config.facilityCategories.length === 0) {
      console.warn('[base-building] Parsed config empty, using fallback')
      return getFallbackConfig()
    }

    console.log('[base-building] LLM config generated successfully')
    return config
  } catch (error) {
    if (error.message && error.message.includes('未配置')) {
      console.warn('[base-building] No API config, using fallback')
    } else {
      console.error('[base-building] LLM generation failed, using fallback:', error)
    }
    return getFallbackConfig()
  }
}
