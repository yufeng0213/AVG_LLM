const fallbackTrimText = (value, maxLen = 80) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLen)

const fallbackClampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export const buildWorldBookSummary = (book, options = {}) => {
  const {
    trimText = fallbackTrimText,
  } = options || {}
  const entries = book?.entries && typeof book.entries === 'object' ? book.entries : {}
  const parts = [
    trimText(book?.summary, 80),
    trimText(entries.overview, 70),
    trimText(entries.conflict, 70),
    trimText(entries.rules, 70),
  ].filter(Boolean)
  return parts.join('；').slice(0, 260)
}

export const resolveWorldBookCharacterRole = (character, options = {}) => {
  const {
    trimText = fallbackTrimText,
  } = options || {}
  return (
    trimText(character?.identity, 20) ||
    trimText(character?.nickname, 20) ||
    trimText(character?.notes, 20) ||
    '冒险者'
  )
}

export const buildAppearanceHint = (character, fallbackText = '', options = {}) => {
  const {
    trimText = fallbackTrimText,
  } = options || {}
  const parts = [
    trimText(character?.appearance, 72),
    trimText(character?.identity, 40),
    trimText(character?.notes, 72),
    trimText(character?.background, 72),
    trimText(fallbackText, 64),
  ].filter(Boolean)
  return parts.join('；').slice(0, 220)
}

export const extractWorldBookCharacters = (book, options = {}) => {
  const {
    trimText = fallbackTrimText,
    resolveClassicRole = null,
    maxTeammateCount = 240,
  } = options || {}

  const result = []
  const pushItem = (idRaw, nameRaw, roleRaw, hintRaw) => {
    const name = trimText(nameRaw, 24)
    if (!name) return
    const id = trimText(idRaw, 64) || `world-char-${result.length + 1}`
    if (result.some((item) => item.id === id || item.name === name)) return
    const roleInput = trimText(roleRaw, 24)
    const resolvedRole = typeof resolveClassicRole === 'function'
      ? resolveClassicRole(roleInput, result.length, hintRaw)
      : (roleInput || '冒险者')
    result.push({
      id,
      name,
      role: resolvedRole,
      hint: trimText(hintRaw, 220),
    })
  }

  pushItem(
    'world-user-profile',
    book?.userProfile?.name || book?.userProfile?.nickname || '你',
    book?.userProfile?.identity || '冒险者',
    buildAppearanceHint(book?.userProfile, book?.summary, { trimText }),
  )

  const characters = Array.isArray(book?.characters) ? book.characters : []
  if (characters.length > 0) {
    for (const item of characters) {
      pushItem(
        item?.id,
        item?.name || item?.nickname,
        resolveWorldBookCharacterRole(item, { trimText }),
        buildAppearanceHint(item, '', { trimText }),
      )
      if (result.length >= maxTeammateCount) break
    }
  }
  return result
}

export const loadActiveWorldBookSnapshot = async (options = {}) => {
  const {
    externalBook = null,
    loadWorldBooks = null,
    getActiveWorldBookId = null,
    trimText = fallbackTrimText,
    resolveClassicRole = null,
    maxTeammateCount = 240,
    logger = console,
  } = options || {}

  try {
    const sourceBook = externalBook && typeof externalBook === 'object' ? externalBook : null
    if (sourceBook) {
      return {
        worldBookId: trimText(sourceBook?.id, 120) || 'default_world_book',
        worldTitle: trimText(sourceBook?.title, 36),
        worldSummary: buildWorldBookSummary(sourceBook, { trimText }),
        characters: extractWorldBookCharacters(sourceBook, {
          trimText,
          resolveClassicRole,
          maxTeammateCount,
        }),
      }
    }

    const booksPromise = typeof loadWorldBooks === 'function' ? loadWorldBooks() : Promise.resolve([])
    const activeIdPromise = typeof getActiveWorldBookId === 'function' ? getActiveWorldBookId() : Promise.resolve('')
    const [books, activeId] = await Promise.all([booksPromise, activeIdPromise])
    const list = Array.isArray(books) ? books : []
    const activeBook = list.find((book) => book?.id === activeId) || list[0] || null
    return {
      worldBookId: trimText(activeBook?.id, 120) || 'default_world_book',
      worldTitle: trimText(activeBook?.title, 36),
      worldSummary: buildWorldBookSummary(activeBook, { trimText }),
      characters: extractWorldBookCharacters(activeBook, {
        trimText,
        resolveClassicRole,
        maxTeammateCount,
      }),
    }
  } catch (error) {
    if (logger && typeof logger.error === 'function') {
      logger.error('[xx-dungeon] worldbook snapshot failed:', error)
    }
    return {
      worldBookId: '',
      worldTitle: '',
      worldSummary: '',
      characters: [],
    }
  }
}

export const buildWorldBookCharacterSignature = (characters, options = {}) => {
  const {
    trimText = fallbackTrimText,
    hintLimit = 120,
    maxLength = 4000,
  } = options || {}
  const list = Array.isArray(characters) ? characters : []
  return list
    .map((item) => `${item.id}#${item.name}#${item.role}#${trimText(item.hint, hintLimit)}`)
    .join('|')
    .slice(0, maxLength)
}

export const buildWorldBookTeammates = (characters, previousTeammates = [], options = {}) => {
  const {
    normalizeTeammate = null,
    resolveClassicRole = null,
    clampInt = fallbackClampInt,
    maxTeammateCount = 240,
    buildDefaultTeammates = null,
  } = options || {}

  const source = Array.isArray(characters) ? characters : []
  const prevSource = Array.isArray(previousTeammates) ? previousTeammates : []
  const normalize = typeof normalizeTeammate === 'function'
    ? normalizeTeammate
    : ((item) => item)

  if (source.length === 0) {
    const fallback = prevSource
      .map((item, index) => normalize(item, index))
      .filter(Boolean)
    if (fallback.length > 0) return fallback.slice(0, maxTeammateCount)
    if (typeof buildDefaultTeammates === 'function') {
      const defaults = Array.isArray(buildDefaultTeammates()) ? buildDefaultTeammates() : []
      return defaults
        .map((item, index) => normalize(item, index))
        .filter(Boolean)
        .slice(0, maxTeammateCount)
    }
    return []
  }

  const prevList = prevSource
    .map((item, index) => normalize(item, index))
    .filter(Boolean)

  return source
    .map((item, index) => {
      const matched = prevList.find((teammate) => teammate.worldCharacterId === item.id || teammate.name === item.name)
      const rarity = 'R'
      const basePower = index < 1 ? 72 : index < 3 ? 56 : 40
      const power = clampInt(matched?.power, 1, 9999, basePower + index * 2)
      const roleInput = matched?.role || item.role
      const role = typeof resolveClassicRole === 'function'
        ? resolveClassicRole(roleInput, index, item.hint)
        : (roleInput || '冒险者')
      return normalize({
        id: matched?.id || `tm-world-${item.id || index + 1}`,
        worldCharacterId: item.id,
        name: item.name,
        role,
        rarity,
        power,
      }, index)
    })
    .filter(Boolean)
    .slice(0, maxTeammateCount)
}
