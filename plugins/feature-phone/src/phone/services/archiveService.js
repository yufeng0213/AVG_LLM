/**
 * archiveService.js - 角色百科档案馆 CRUD
 * 存储: kvStorage('browser_archive_v1')
 */
import { kvStorage } from '../../../../../src/storage/index.js'

const ARCHIVE_KEY = 'browser_archive_v1'

const CATEGORY_LABELS = {
  knowledge: '知识',
  secret: '秘密',
  clue: '线索',
  trivia: '趣闻',
  legend: '传说',
  relationship: '人物关系',
  worldview: '世界观',
}

const RARITY_CONFIG = {
  common:      { label: '普通',     color: '#95a5a6' },
  uncommon:    { label: '少见',     color: '#2ecc71' },
  rare:        { label: '稀有',     color: '#3498db' },
  epic:        { label: '史诗',     color: '#9b59b6' },
  legendary:   { label: '传说',     color: '#f39c12' },
}

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }

let _archive = null

async function load() {
  _archive = await kvStorage.get(ARCHIVE_KEY) || { items: [], totalCount: 0 }
  return _archive
}

async function save() {
  _archive.totalCount = _archive.items.length
  await kvStorage.set(ARCHIVE_KEY, _archive)
}

export async function addArchiveCard(cardData) {
  const archive = await load()
  const card = {
    id: `arch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: cardData.title || '未命名档案',
    sourceUrl: cardData.sourceUrl || '',
    excerpt: (cardData.excerpt || '').substring(0, 2000),
    category: cardData.category || 'knowledge',
    tags: (cardData.tags || []).slice(0, 4),
    rarity: cardData.rarity || 'common',
    summary: cardData.summary || '',
    sharedBy: 'player',
    sharedWithChar: cardData.sharedWithChar || '',
    createdAt: new Date().toISOString(),
    isFavorite: false,
    notes: '',
  }
  archive.items.unshift(card)
  await save()
  return { success: true, cardId: card.id, card }
}

export async function getArchive() {
  const archive = await load()
  const stats = { byRarity: {}, byCategory: {} }
  for (const item of archive.items) {
    stats.byRarity[item.rarity] = (stats.byRarity[item.rarity] || 0) + 1
    stats.byCategory[item.category] = (stats.byCategory[item.category] || 0) + 1
  }
  return { items: archive.items, totalCount: archive.totalCount, stats }
}

export async function deleteArchiveCard(cardId) {
  const archive = await load()
  archive.items = archive.items.filter(c => c.id !== cardId)
  await save()
  return { success: true }
}

export async function updateArchiveCard(cardId, updates) {
  const archive = await load()
  const idx = archive.items.findIndex(c => c.id === cardId)
  if (idx === -1) return { success: false }
  Object.assign(archive.items[idx], updates)
  await save()
  return { success: true }
}

export async function filterArchive(filters = {}) {
  const archive = await load()
  let result = [...archive.items]

  if (filters.category) {
    result = result.filter(c => c.category === filters.category)
  }
  if (filters.rarity) {
    result = result.filter(c => c.rarity === filters.rarity)
  }
  if (filters.favoriteOnly) {
    result = result.filter(c => c.isFavorite)
  }
  if (filters.search) {
    const q = filters.search.toLowerCase()
    result = result.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.summary || '').toLowerCase().includes(q) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q))
    )
  }

  // 按稀有度+时间排序
  result.sort((a, b) => {
    const rDiff = (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0)
    if (rDiff !== 0) return rDiff
    return new Date(b.createdAt) - new Date(a.createdAt)
  })

  return result
}

export async function getArchiveStats() {
  const archive = await load()
  const stats = { byRarity: {}, byCategory: {}, totalCount: archive.items.length }
  for (const item of archive.items) {
    stats.byRarity[item.rarity] = (stats.byRarity[item.rarity] || 0) + 1
    stats.byCategory[item.category] = (stats.byCategory[item.category] || 0) + 1
  }
  return stats
}

export async function isCardCollected(url) {
  if (!url) return false
  const archive = await load()
  return archive.items.some(c => c.sourceUrl === url)
}

export async function clearArchive() {
  _archive = { items: [], totalCount: 0 }
  await kvStorage.set(ARCHIVE_KEY, _archive)
}

export { CATEGORY_LABELS, RARITY_CONFIG }
