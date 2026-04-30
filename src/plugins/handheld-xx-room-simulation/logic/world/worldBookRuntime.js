// WorldBook 集成 - 角色提取、世界信息

import { createPawnGeneration } from '../pawn/pawnGeneration.js'
import { createRoomGeneration } from '../room/roomGeneration.js'

export const createWorldBookRuntime = (deps = {}) => {
  const pawnGeneration = deps.pawnGeneration || createPawnGeneration()
  const roomGeneration = deps.roomGeneration || createRoomGeneration()

  // 加载 WorldBook 快照
  const loadWorldBookSnapshot = async (options = {}) => {
    const {
      worldBook = null,
      loadWorldBooks = null,
      worldBookId = '',
    } = options

    if (worldBook && typeof worldBook === 'object') {
      return {
        worldTitle: worldBook.title || '未知世界',
        worldSummary: worldBook.summary || '',
        characters: worldBook.characters || [],
      }
    }

    // 尝试从存储加载
    if (typeof loadWorldBooks === 'function') {
      try {
        const books = await loadWorldBooks()
        if (Array.isArray(books) && books.length > 0) {
          const book = worldBookId
            ? books.find(b => b.id === worldBookId)
            : books[0]
          if (book) {
            return {
              worldTitle: book.title || '未知世界',
              worldSummary: book.summary || '',
              characters: book.characters || [],
            }
          }
        }
      } catch (e) {
        console.warn('[room-sim] Failed to load WorldBook:', e)
      }
    }

    return {
      worldTitle: '默认世界',
      worldSummary: '',
      characters: [],
    }
  }

  // 从 WorldBook 生成小人
  const generatePawnsFromWorldBook = (snapshot, count = 3) => {
    return pawnGeneration.generatePawnsFromWorldBook(
      { characters: snapshot?.characters || [], title: snapshot?.worldTitle, summary: snapshot?.worldSummary },
      count
    )
  }

  // 从 WorldBook 推断房间主题
  const inferRoomThemeFromWorldBook = (snapshot) => {
    return roomGeneration.inferThemeFromWorldBook({
      title: snapshot?.worldTitle,
      summary: snapshot?.worldSummary,
    })
  }

  // 构建角色签名（用于状态变化检测）
  const buildCharacterSignature = (characters) => {
    if (!Array.isArray(characters)) return ''

    const names = characters
      .map(c => c?.name || '')
      .filter(n => n.length > 0)
      .sort()
      .join('|')

    return names.slice(0, 200)
  }

  // 检查角色签名是否变化
  const hasCharacterSignatureChanged = (oldSignature, characters) => {
    const newSignature = buildCharacterSignature(characters)
    return oldSignature !== newSignature
  }

  return {
    loadWorldBookSnapshot,
    generatePawnsFromWorldBook,
    inferRoomThemeFromWorldBook,
    buildCharacterSignature,
    hasCharacterSignatureChanged,
  }
}

export default createWorldBookRuntime