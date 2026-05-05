/**
 * achievementService.js - 百科档案馆成就系统
 * 存储: kvStorage('browser_achievements_v1')
 *
 * 成就列表:
 *   ach_first_share    - 第一次分享
 *   ach_first_archive  - 第一张档案
 *   ach_first_rare     - 首次发现稀有+
 *   ach_5_archives     - 5张档案
 *   ach_10_archives    - 10张档案
 *   ach_25_archives    - 25张档案
 *   ach_5_knowledge    - 5张知识类
 *   ach_3_secrets      - 3张秘密类
 *   ach_3_legends      - 3张传说类
 *   ach_10_shares      - 分享10次
 *   ach_all_categories - 7个类别各至少1张
 */
import { kvStorage } from '../../../../../src/storage/index.js'

const ACHIEVEMENTS_KEY = 'browser_achievements_v1'

const ACHIEVEMENT_DEFS = [
  { id: 'ach_first_share',   name: '初次分享',       description: '第一次把发现分享给角色',              icon: '🤝',   target: 1,  type: 'share' },
  { id: 'ach_first_archive', name: '首张档案',       description: '成功创建第一张百科档案卡片',        icon: '📋',   target: 1,  type: 'archive' },
  { id: 'ach_first_rare',    name: '稀有发现',       description: '首次发现稀有或以上级别的档案',      icon: '💎',   target: 1,  type: 'rare' },
  { id: 'ach_5_archives',    name: '小收藏家',       description: '收集5张档案卡片',                  icon: '📚',   target: 5,  type: 'archive' },
  { id: 'ach_10_archives',   name: '档案达人',       description: '收集10张档案卡片',                 icon: '📖',   target: 10, type: 'archive' },
  { id: 'ach_25_archives',   name: '百科馆长',       description: '收集25张档案卡片',                 icon: '🏛️',  target: 25, type: 'archive' },
  { id: 'ach_5_knowledge',   name: '知识渊博',       description: '收集5张知识类档案',                icon: '🧠',   target: 5,  type: 'category_knowledge' },
  { id: 'ach_3_secrets',     name: '秘密猎手',       description: '收集3张秘密类档案',                icon: '🔍',   target: 3,  type: 'category_secret' },
  { id: 'ach_3_legends',     name: '传说收集者',     description: '收集3张传说类档案',                icon: '🏆',   target: 3,  type: 'category_legend' },
  { id: 'ach_10_shares',     name: '分享狂人',       description: '分享10次网页内容给角色',           icon: '🔄',   target: 10, type: 'share' },
  { id: 'ach_all_categories',name: '全知全能',       description: '收集全部7个类别的档案卡片',        icon: '🌟',   target: 7,  type: 'all_categories' },
]

let _achievements = null

async function load() {
  _achievements = await kvStorage.get(ACHIEVEMENTS_KEY) || null
  if (!_achievements) {
    _achievements = ACHIEVEMENT_DEFS.map(def => ({
      ...def,
      unlocked: false,
      unlockedAt: null,
      progress: 0,
    }))
  }
  return _achievements
}

async function save() {
  await kvStorage.set(ACHIEVEMENTS_KEY, _achievements)
}

/**
 * 检查成就并标记新解锁的
 * @param {Object} archiveStats - 档案馆统计 { byRarity, byCategory, totalCount }
 * @param {number} shareCount - 总分享次数
 * @returns {Array} 新解锁的成就列表
 */
export async function checkAchievements(archiveStats = {}, shareCount = 0) {
  const achievements = await load()
  const newlyUnlocked = []

  for (const ach of achievements) {
    if (ach.unlocked) continue

    let progress = 0

    switch (ach.type) {
      case 'share':
        progress = shareCount
        break
      case 'archive':
        progress = archiveStats.totalCount || 0
        break
      case 'rare':
        progress = (archiveStats.byRarity?.rare || 0) +
                   (archiveStats.byRarity?.epic || 0) +
                   (archiveStats.byRarity?.legendary || 0)
        break
      case 'category_knowledge':
        progress = archiveStats.byCategory?.knowledge || 0
        break
      case 'category_secret':
        progress = archiveStats.byCategory?.secret || 0
        break
      case 'category_legend':
        progress = archiveStats.byCategory?.legend || 0
        break
      case 'all_categories': {
        const cats = ['knowledge', 'secret', 'clue', 'trivia', 'legend', 'relationship', 'worldview']
        progress = cats.filter(c => (archiveStats.byCategory?.[c] || 0) > 0).length
        break
      }
    }

    ach.progress = progress
    if (progress >= ach.target) {
      ach.unlocked = true
      ach.unlockedAt = new Date().toISOString()
      newlyUnlocked.push({ ...ach })
    }
  }

  if (newlyUnlocked.length > 0) {
    await save()
  }

  return newlyUnlocked
}

export async function getAchievements() {
  return await load()
}

export async function getAchievementStats() {
  const achievements = await load()
  const unlocked = achievements.filter(a => a.unlocked).length
  const total = achievements.length
  return { unlocked, total, achievements }
}

export async function resetAchievements() {
  _achievements = null
  await kvStorage.remove(ACHIEVEMENTS_KEY)
}
