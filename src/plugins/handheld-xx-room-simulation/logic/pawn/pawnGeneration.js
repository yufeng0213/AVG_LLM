// 小人生成 - LLM + 本地 fallback

import { createPawnEngine } from './pawnEngine.js'

const DEFAULT_PAWN_NAMES = ['艾诺', '米拉', '托比', '莎米', '莱恩', '琳娜', '卡尔', '菲菲']
const DEFAULT_PAWN_ROLES = ['工匠', '厨师', '学者', '护士', '农夫', '矿工', '商人', '艺术家']

export const createPawnGeneration = (deps = {}) => {
  const pawnEngine = deps.pawnEngine || createPawnEngine()

  // 生成默认小人列表
  const generateDefaultPawns = (count = 1) => {
    const pawns = []
    for (let i = 0; i < Math.min(count, 8); i++) {
      pawns.push(pawnEngine.createDefaultPawn(i, DEFAULT_PAWN_ROLES[i % DEFAULT_PAWN_ROLES.length]))
    }
    return pawns
  }

  // 从 WorldBook 角色生成小人
  const generatePawnsFromWorldBook = (worldBook, count = 3) => {
    if (!worldBook?.characters || !Array.isArray(worldBook.characters)) {
      return generateDefaultPawns(count)
    }

    const characters = worldBook.characters.slice(0, Math.min(count, 8))
    const pawns = characters.map((char, i) => {
      const pawn = pawnEngine.createDefaultPawn(i, inferRoleFromCharacter(char))
      pawn.name = char.name || pawn.name
      pawn.worldCharacterId = char.id || ''
      // 根据角色特征调整技能
      adjustSkillsByCharacter(pawn, char)
      return pawn
    })

    return pawns.length > 0 ? pawns : generateDefaultPawns(count)
  }

  // 从角色推断职业
  const inferRoleFromCharacter = (char) => {
    const desc = String(char?.description || char?.role || '').toLowerCase()

    if (desc.includes('厨师') || desc.includes('cook') || desc.includes('烹饪')) return '厨师'
    if (desc.includes('学者') || desc.includes('scholar') || desc.includes('研究')) return '学者'
    if (desc.includes('护士') || desc.includes('nurse') || desc.includes('医疗')) return '护士'
    if (desc.includes('农夫') || desc.includes('farmer') || desc.includes('种植')) return '农夫'
    if (desc.includes('矿工') || desc.includes('miner') || desc.includes('采矿')) return '矿工'
    if (desc.includes('商人') || desc.includes('merchant') || desc.includes('贸易')) return '商人'
    if (desc.includes('艺术家') || desc.includes('artist') || desc.includes('创作')) return '艺术家'

    return '工匠' // 默认
  }

  // 根据角色特征调整技能
  const adjustSkillsByCharacter = (pawn, char) => {
    const role = pawn.role

    switch (role) {
      case '厨师':
        pawn.skills.cooking.level = 3
        break
      case '学者':
        pawn.skills.social.level = 3
        break
      case '工匠':
        pawn.skills.crafting.level = 3
        break
      case '护士':
        pawn.skills.crafting.level = 2
        pawn.skills.social.level = 2
        break
    }
  }

  // LLM 生成小人（带 fallback）
  const generatePawnsWithFallback = async (options = {}) => {
    const {
      requestPawns = null,
      worldBook = null,
      count = 3,
      logger = console,
    } = options

    let pawns = []
    let usedLLM = false

    // 尝试 LLM 生成
    if (typeof requestPawns === 'function') {
      try {
        const llmResult = await requestPawns({
          worldTitle: worldBook?.title || '',
          worldSummary: worldBook?.summary || '',
          count,
        })

        if (llmResult?.success && Array.isArray(llmResult.pawns) && llmResult.pawns.length > 0) {
          pawns = llmResult.pawns.map((p, i) => pawnEngine.normalizePawn(p, i))
          usedLLM = true
        }
      } catch (e) {
        logger.warn('[room-sim] LLM pawn generation failed, fallback to local:', e)
      }
    }

    // Fallback 到本地生成
    if (!usedLLM) {
      if (worldBook?.characters) {
        pawns = generatePawnsFromWorldBook(worldBook, count)
      } else {
        pawns = generateDefaultPawns(count)
      }
    }

    return { pawns, usedLLM }
  }

  return {
    generateDefaultPawns,
    generatePawnsFromWorldBook,
    inferRoleFromCharacter,
    adjustSkillsByCharacter,
    generatePawnsWithFallback,
  }
}

export default createPawnGeneration