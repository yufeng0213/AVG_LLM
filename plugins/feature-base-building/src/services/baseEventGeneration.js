import { callChatCompletion, getValidatedActiveConfig } from '../../../../src/llm/llmService.core.js'

async function callLLMForEvent(prompt, systemPrompt) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    throw new Error(validated.error)
  }
  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt,
    userPrompt: prompt,
    temperature: 0.8,
    maxTokens: 800,
  })
  return result?.content || result?.text || ''
}

const EVENT_GENERATION_PROMPT = `你是末日基地随机事件生成器。
生成一个JSON事件（不要markdown代码块，纯JSON）。

事件类型从以下随机选一种：袭击/难民/发现/灾害/内乱

JSON格式:
{
  "id": "event_xxx",
  "type": "袭击",
  "title": "事件标题(10字内)",
  "description": "事件描述(50字内)",
  "options": [
    {"id":"opt_a","text":"选项A文字","cost":{"资源id":数量},"outcome":"结果描述","effects":{"资源id":增减值}},
    {"id":"opt_b","text":"选项B文字","cost":{},"outcome":"结果描述","effects":{"资源id":增减值}}
  ]
}
要求2-3个选项，至少一个有代价但有收益，一个无代价但收益小。`

const FALLBACK_EVENTS = [
  {
    id: 'fallback_raid',
    type: '袭击',
    title: '拾荒者袭击',
    description: '一群拾荒者试图抢夺基地资源！',
    options: [
      { id: 'opt_a', text: '组织防御', cost: { fuel: 2 }, outcome: '成功击退拾荒者，缴获一些物资', effects: { scrap_iron: 5, canned_food: 3 } },
      { id: 'opt_b', text: '交出部分资源', cost: {}, outcome: '拾荒者拿走了罐头后离开了', effects: { canned_food: -5 } },
    ],
  },
  {
    id: 'fallback_refugee',
    type: '难民',
    title: '流浪者求援',
    description: '几个饥饿的流浪者来到基地门口寻求庇护。',
    options: [
      { id: 'opt_a', text: '收留他们', cost: { purified_water: 3, canned_food: 3 }, outcome: '新成员加入，基地人手增加了', effects: { bandage: 2 } },
      { id: 'opt_b', text: '给予食物后劝离', cost: { canned_food: 2 }, outcome: '流浪者感谢后离开了', effects: {} },
    ],
  },
  {
    id: 'fallback_discovery',
    type: '发现',
    title: '废弃仓库',
    description: '侦察队在附近发现了一座废弃仓库。',
    options: [
      { id: 'opt_a', text: '派人搜索', cost: { fuel: 1 }, outcome: '找到了有用的零件和材料', effects: { scrap_iron: 8, circuit_board: 1 } },
      { id: 'opt_b', text: '标记后离开', cost: {}, outcome: '安全起见暂时没有探索', effects: {} },
    ],
  },
  {
    id: 'fallback_disaster',
    type: '灾害',
    title: '酸雨来袭',
    description: '一场突如其来的酸雨威胁着基地设施。',
    options: [
      { id: 'opt_a', text: '紧急加固', cost: { wood_plank: 5, scrap_iron: 3 }, outcome: '设施得到保护，损失很小', effects: {} },
      { id: 'opt_b', text: '不做处理', cost: {}, outcome: '部分设施受到酸雨腐蚀', effects: { scrap_iron: -3 } },
    ],
  },
]

function parseJsonEvent(text) {
  try {
    // Try direct parse
    return JSON.parse(text)
  } catch {
    // Try extracting JSON from markdown code block
    const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (blockMatch) {
      try { return JSON.parse(blockMatch[1].trim()) } catch {}
    }
    // Try finding JSON object
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try { return JSON.parse(objMatch[0]) } catch {}
    }
  }
  return null
}

function getFallbackEvent(state) {
  const idx = state.day % FALLBACK_EVENTS.length
  const base = FALLBACK_EVENTS[idx]
  return {
    ...base,
    id: `${base.id}_${Date.now()}`,
  }
}

export async function generateRandomEvent({ worldBook, state, config }) {
  console.log('[base-building] Generating random event via LLM...')
  const day = state?.day || 1
  const resources = state?.resources || {}
  const resourceSummary = Object.entries(resources)
    .filter(([, v]) => v.current > 0)
    .map(([id, v]) => `${id}:${v.current}`)
    .join(', ') || '无'

  const prompt = `基地状态: 第${day}天
当前资源: ${resourceSummary}
世界背景: ${worldBook?.title || '末日废土'}

请生成一个适合的随机事件。`

  try {
    const content = await callLLMForEvent(prompt, EVENT_GENERATION_PROMPT)
    if (!content) {
      console.warn('[base-building] LLM event empty, using fallback')
      return getFallbackEvent(state)
    }

    const event = parseJsonEvent(content)
    if (!event || !event.options || event.options.length === 0) {
      console.warn('[base-building] LLM event invalid, using fallback')
      return getFallbackEvent(state)
    }

    event.id = `llm_event_${Date.now()}`
    return event
  } catch (error) {
    if (error.message && error.message.includes('未配置')) {
      console.warn('[base-building] No API config for event, using fallback')
    } else {
      console.error('[base-building] LLM event generation failed, using fallback:', error)
    }
    return getFallbackEvent(state)
  }
}

export { FALLBACK_EVENTS, getFallbackEvent }
