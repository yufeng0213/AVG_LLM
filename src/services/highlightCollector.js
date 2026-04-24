/**
 * 名场面收集服务
 * 从对话行和世界记忆事件中提取"名场面"，生成收藏卡片
 */
import { saveCardToCollection } from '../cards/cardCollectionService.js'

const STORAGE_KEY = 'avg_llm_highlight_collector_config_v1'

let _lastProcessedLineCount = 0
let _lastEventCount = 0

/**
 * 加载配置
 */
async function loadConfig() {
  const defaults = {
    minHighlightLength: 15,
    minEmotionalImpact: 70,
    enabled: true,
  }
  try {
    const stored = await (await import('../storage/index.js')).kvStorage.get(STORAGE_KEY)
    if (stored && typeof stored === 'object') return { ...defaults, ...stored }
  } catch {}
  return defaults
}

/**
 * 判定稀有度（基于情感影响）
 */
function impactToRarity(impact) {
  if (impact >= 95) return { rarity: 'epic', rarityName: '史诗', rarityColor: '#f39c12' }
  if (impact >= 85) return { rarity: 'rare', rarityName: '稀有', rarityColor: '#9b59b6' }
  if (impact >= 70) return { rarity: 'uncommon', rarityName: '优秀', rarityColor: '#3498db' }
  return { rarity: 'common', rarityName: '普通', rarityColor: '#95a5a6' }
}

/**
 * 处理新对话，提取高亮内容
 * @param {Object} deps
 * @param {Array} deps.newDialogue — 新的对话行数组
 * @param {Array} deps.newEvents — 新的世界记忆事件
 * @param {string} deps.worldBookId
 * @returns {Promise<Array>} 收集的卡片
 */
export async function processNewDialogue(deps) {
  const { newDialogue = [], newEvents = [], worldBookId } = deps
  const config = await loadConfig()
  if (!config.enabled) return []

  const collected = []

  // 1. 从对话行提取高亮
  for (const line of newDialogue) {
    if (line.highlight && line.text && line.text.length >= config.minHighlightLength) {
      const card = {
        collectionId: `moment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        cardTemplateId: 'moment_quote',
        cardName: '名场面',
        category: 'moment',
        categoryName: '名场面',
        categoryIcon: '✨',
        ...impactToRarity(line.highlightImpact || 70),
        content: {
          quote: line.text,
          speaker: line.speaker || '旁白',
          emotion: line.emotion || '',
          storyTime: line.storyTime || '',
          context: line.text.slice(0, 50) + (line.text.length > 50 ? '...' : ''),
        },
        createdAt: new Date().toISOString(),
        isFavorite: false,
        tags: ['highlight', line.speaker || '旁白'],
      }
      collected.push(card)
    }
  }

  // 2. 从世界记忆事件提取
  for (const evt of newEvents) {
    const isMilestone = evt.type === 'milestone' || evt.type === 'bond_event'
    const highImpact = evt.emotionalImpact >= config.minEmotionalImpact

    if (isMilestone || highImpact) {
      const impact = isMilestone ? Math.max(evt.emotionalImpact, 80) : evt.emotionalImpact
      const card = {
        collectionId: `moment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        cardTemplateId: 'moment_event',
        cardName: '重要事件',
        category: 'moment',
        categoryName: '名场面',
        categoryIcon: '✨',
        ...impactToRarity(impact),
        content: {
          quote: evt.summary || '',
          speaker: (evt.participants || []).join('、'),
          emotion: '',
          storyTime: new Date(evt.createdAt).toLocaleDateString(),
          context: evt.type,
        },
        createdAt: new Date().toISOString(),
        isFavorite: false,
        tags: ['event', evt.type],
      }
      collected.push(card)
    }
  }

  // 3. 保存卡片
  for (const card of collected) {
    try {
      await saveCardToCollection(card, card.content, {
        gameTime: card.content.storyTime,
        sceneName: '',
      })
    } catch (e) {
      console.warn('[HighlightCollector] save card failed:', e.message)
    }
  }

  if (collected.length > 0) {
    console.log(`[HighlightCollector] collected ${collected.length} moments`)
  }

  return collected
}

/**
 * 重置追踪（用于新游戏）
 */
export function resetHighlightCollector() {
  _lastProcessedLineCount = 0
  _lastEventCount = 0
}
