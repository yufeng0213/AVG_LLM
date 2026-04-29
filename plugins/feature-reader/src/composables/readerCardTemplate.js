/**
 * readerCardTemplate.js - Reader 卡片模板加载器
 * 复用 cardService.js 的已有函数（支持外部导入卡片文件夹）。
 * 只增加 Reader 专属的渲染和解析函数。
 */

import { drawRandomCard } from '../../../../src/cards/cardService.js'

// 复用已有的渲染逻辑（与 cardExportService 一致：替换 {{key}} / {key} / %key%）
import { exportCardFromData } from '../../../../src/cards/cardExportService.js'

/**
 * 随机抽取一张卡片并加载其完整配置
 * @returns {Promise<Object|null>} { id, name, category, rarity, description, variables, templateHtml }
 */
export async function drawRandomCardTemplate() {
  const card = await drawRandomCard()
  if (!card) return null

  return {
    id: card.id,
    name: card.name,
    category: card.category || '',
    rarity: card.rarity || 'common',
    description: card.promptConfig?.description || card.preview || '',
    variables: card.promptConfig?.variables || {},
    templateHtml: card.templateHtml || null,
  }
}

/**
 * 将 LLM 返回的卡片数据渲染为 HTML（字符串替换占位符）
 * @param {Object} cardData - { templateHtml, content: { key: value } }
 * @returns {string} 渲染后的 HTML
 */
export function renderCardHtml(cardData) {
  if (!cardData?.templateHtml) return ''
  let html = cardData.templateHtml
  const content = cardData.content || {}
  for (const [key, value] of Object.entries(content)) {
    const str = String(value ?? '')
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), str)
    html = html.replace(new RegExp(`\\{${key}\\}`, 'g'), str)
    html = html.replace(new RegExp(`%${key}%`, 'g'), str)
  }
  return html
}

/**
 * 从 LLM 原始输出中提取卡片数据
 * 支持两种格式：
 * 1. JSON 块：```json { "cardType": "xxx", "content": {...} } ```
 * 2. 标记：{{card:type=xxx|field1=val1|field2=val2}}
 * @param {string} rawText
 * @returns {{ cardType: string, content: Object } | null}
 */
export function extractCardDataFromOutput(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return null

  // 格式 1：JSON 代码块
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim())
      if (parsed.cardType && parsed.content) {
        return { cardType: parsed.cardType, content: parsed.content }
      }
      if (parsed.type && parsed.content) {
        return { cardType: parsed.type, content: parsed.content }
      }
    } catch {
      // fall through
    }
  }

  // 格式 2：单个 JSON 对象（不带代码块）
  const jsonMatch = text.match(/\{[\s\S]*"cardType"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.cardType && parsed.content) {
        return { cardType: parsed.cardType, content: parsed.content }
      }
      if (parsed.type && parsed.content) {
        return { cardType: parsed.type, content: parsed.content }
      }
    } catch {
      // fall through
    }
  }

  // 格式 3：标记 {{card:type=xxx|field1=val1}}
  const markerMatch = text.match(/\{\{card:type=([^|}]+)([^}]+)?\}\}/)
  if (markerMatch) {
    const cardType = markerMatch[1].trim()
    const fieldsStr = markerMatch[2] || ''
    const content = {}
    if (fieldsStr) {
      for (const part of fieldsStr.split('|')) {
        const eqIdx = part.indexOf('=')
        if (eqIdx > 0) {
          content[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim()
        }
      }
    }
    return { cardType, content }
  }

  return null
}

export default {
  drawRandomCardTemplate,
  renderCardHtml,
  extractCardDataFromOutput,
}
