/**
 * 世界书数据访问层
 * 所有 SQL 操作集中在此，唯一允许直接调用 query/exec 的地方
 * 所有函数可选传入 conn 参数以在事务中执行
 */
import { query, exec, getDB } from '../connection.js'

// ============================================================
// 事务内查询/写入辅助
// ============================================================

async function _q(conn, sql, values = []) {
  if (conn) {
    const r = await conn.query(sql, values)
    return r.values || []
  }
  return query(sql, values)
}

async function _e(conn, sql, values = []) {
  if (conn) return conn.run(sql, values)
  return exec(sql, values)
}

function _run(conn) {
  return conn || getDB()
}

// ============================================================
// Row → Object 转换
// ============================================================

function safeJsonParse(str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

function extractFileName(path) {
  if (!path) return ''
  return path.split('/').pop() || path
}

export function rowToWorldBook(row) {
  return {
    id: row.id, title: row.title, summary: row.summary,
    isDefault: !!row.is_default, tags: safeJsonParse(row.tags, []),
    defaultNarratorId: row.default_narrator_id,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function entriesRowToEntries(row) {
  return {
    overview: row.overview || '', era: row.era || '',
    regions: row.regions || '', forces: row.forces || '',
    rules: row.rules || '', culture: row.culture || '',
    conflict: row.conflict || '', secrets: row.secrets || '',
    storyHook: row.story_hook || '',
  }
}

function profileRowToUserProfile(row) {
  return {
    name: row.name || '', nickname: row.nickname || '',
    appearance: row.appearance || '', identity: row.identity || '',
    background: row.background || '', portraits: [],
  }
}

function displayRowToDisplaySettings(row) {
  return {
    portraitStyle: row.portrait_style || 'card',
    cardBorderList: [],
    activeCardBorderId: row.active_card_border_id || '',
  }
}

function characterRowToCharacter(row) {
  return {
    id: row.id, name: row.name, nickname: row.nickname || '',
    appearance: row.appearance || '', identity: row.identity || '',
    background: row.background || '', notes: row.notes || '',
    birthday: row.birthday || '', smsAvatar: row.sms_avatar_path,
    smsBg: row.sms_bg_path, smsStickers: {},
    personalityProfile: {
      mbti: row.mbti || '',
      behaviorTags: safeJsonParse(row.behavior_tags, []),
      cognitiveDimensions: {
        Se: row.dim_se ?? 50, Si: row.dim_si ?? 50,
        Ne: row.dim_ne ?? 50, Ni: row.dim_ni ?? 50,
        Te: row.dim_te ?? 50, Ti: row.dim_ti ?? 50,
        Fe: row.dim_fe ?? 50, Fi: row.dim_fi ?? 50,
      },
    },
    relationshipBase: { favor: row.favor ?? 50, trust: row.trust ?? 50, stance: row.stance ?? 0 },
    voiceConfig: {
      enabled: !!row.voice_enabled, voiceId: row.voice_id || '',
      speed: row.voice_speed ?? 1.0, vol: row.voice_vol ?? 1.0,
      pitch: row.voice_pitch ?? 0.0, emotion: row.voice_emotion || '',
      sampleRate: row.voice_sample_rate ?? 32000, bitrate: row.voice_bitrate ?? 128000,
      format: row.voice_format || 'mp3', channel: row.voice_channel ?? 1,
      pronunciationTone: safeJsonParse(row.voice_pronunciation_tone, []),
      subtitleEnable: !!row.voice_subtitle_enable,
    },
    portraits: [], createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function buildRelationshipsMap(rows) {
  const result = {}
  for (const r of rows) {
    if (!result[r.from_id]) result[r.from_id] = {}
    result[r.from_id][r.to_id] = {
      score: r.score, description: r.description || '', updatedAt: r.updated_at,
    }
  }
  return result
}

// ============================================================
// 读取操作
// ============================================================

/**
 * 加载完整世界书
 */
export async function loadBookFull(bookId, conn) {
  const [bookRow] = await _q(conn, 'SELECT * FROM world_books WHERE id = ?', [bookId])
  if (!bookRow) return null

  const book = rowToWorldBook(bookRow)

  const [entries] = await _q(conn, 'SELECT * FROM world_book_entries WHERE world_book_id = ?', [bookId])
  if (entries) book.entries = entriesRowToEntries(entries)

  const [profile] = await _q(conn, 'SELECT * FROM world_book_user_profiles WHERE world_book_id = ?', [bookId])
  if (profile) book.userProfile = profileRowToUserProfile(profile)

  const [display] = await _q(conn, 'SELECT * FROM world_book_display_settings WHERE world_book_id = ?', [bookId])
  if (display) book.displaySettings = displayRowToDisplaySettings(display)

  const [config] = await _q(conn, 'SELECT * FROM world_book_config WHERE world_book_id = ?', [bookId])
  if (config) {
    book.openingDialogueMode = config.opening_dialogue_mode || 'auto'
    book.openingDialogue = safeJsonParse(config.opening_dialogue, [])
  }

  const portraits = await _q(conn, 'SELECT * FROM world_book_portraits WHERE world_book_id = ?', [bookId])
  book.userProfile.portraits = portraits.map(p => ({
    id: p.id, label: '', emotion: 'default',
    filePath: p.file_path, fileName: extractFileName(p.file_path), addedAt: p.added_at,
  }))

  const chars = await _q(conn, 'SELECT * FROM characters WHERE world_book_id = ?', [bookId])
  book.characters = chars.map(c => characterRowToCharacter(c))

  if (chars.length > 0) {
    const charIds = chars.map(c => c.id)
    const allPortraits = await _q(conn,
      'SELECT * FROM character_portraits WHERE character_id IN (' + charIds.map(() => '?').join(',') + ')',
      charIds
    )
    const portraitMap = {}
    for (const p of allPortraits) {
      if (!portraitMap[p.character_id]) portraitMap[p.character_id] = []
      portraitMap[p.character_id].push({
        id: p.id, label: p.label, emotion: p.emotion,
        filePath: p.file_path, fileName: extractFileName(p.file_path), addedAt: p.added_at,
      })
    }
    for (const char of book.characters) {
      char.portraits = portraitMap[char.id] || []
    }
  }

  const scenes = await _q(conn, 'SELECT * FROM scenes WHERE world_book_id = ?', [bookId])
  book.scenes = scenes.map(s => ({
    id: s.id, name: s.name, background: s.background_path,
    description: s.description, createdAt: s.created_at,
  }))

  const bgAssets = await _q(conn, 'SELECT * FROM background_assets WHERE world_book_id = ?', [bookId])
  book.backgroundAssets = bgAssets.map(a => ({ id: a.id, name: a.name, path: a.path, label: a.label }))

  const borders = await _q(conn, 'SELECT * FROM card_borders WHERE world_book_id = ?', [bookId])
  book.displaySettings.cardBorderList = borders.map(b => ({
    id: b.id, name: b.name, filePath: b.file_path,
    fileName: extractFileName(b.file_path),
    cropRect: { x: b.crop_x, y: b.crop_y, w: b.crop_w, h: b.crop_h },
    addedAt: b.added_at,
  }))

  const rels = await _q(conn, 'SELECT * FROM relationships WHERE world_book_id = ?', [bookId])
  book.relationships = buildRelationshipsMap(rels)

  const stickers = await _q(conn, 'SELECT description, file_path FROM sms_stickers WHERE world_book_id = ?', [bookId])
  const stickerMap = {}
  for (const s of stickers) stickerMap[s.description] = s.file_path
  for (const char of book.characters) char.smsStickers = { ...stickerMap }

  book.directorEvents = config ? safeJsonParse(config.director_events, []) : []

  return book
}

/**
 * 批量加载所有世界书完整数据
 */
export async function loadAllBooksFull(conn) {
  const books = await _q(conn, 'SELECT * FROM world_books ORDER BY is_default DESC, created_at')
  if (books.length === 0) return []

  const bookIds = books.map(b => b.id)
  const in_ = '(' + bookIds.map(() => '?').join(',') + ')'

  const entries = await _q(conn, 'SELECT * FROM world_book_entries WHERE world_book_id IN ' + in_, bookIds)
  const profiles = await _q(conn, 'SELECT * FROM world_book_user_profiles WHERE world_book_id IN ' + in_, bookIds)
  const displays = await _q(conn, 'SELECT * FROM world_book_display_settings WHERE world_book_id IN ' + in_, bookIds)
  const configs = await _q(conn, 'SELECT * FROM world_book_config WHERE world_book_id IN ' + in_, bookIds)
  const userPortraits = await _q(conn, 'SELECT * FROM world_book_portraits WHERE world_book_id IN ' + in_, bookIds)
  const chars = await _q(conn, 'SELECT * FROM characters WHERE world_book_id IN ' + in_, bookIds)

  const charIds = chars.map(c => c.id)
  const charIn = charIds.length > 0 ? '(' + charIds.map(() => '?').join(',') + ')' : '(null)'
  const charPortraits = charIds.length > 0
    ? await _q(conn, 'SELECT * FROM character_portraits WHERE character_id IN ' + charIn, charIds)
    : []

  const scenes = await _q(conn, 'SELECT * FROM scenes WHERE world_book_id IN ' + in_, bookIds)
  const bgAssets = await _q(conn, 'SELECT * FROM background_assets WHERE world_book_id IN ' + in_, bookIds)
  const borders = await _q(conn, 'SELECT * FROM card_borders WHERE world_book_id IN ' + in_, bookIds)
  const rels = await _q(conn, 'SELECT * FROM relationships WHERE world_book_id IN ' + in_, bookIds)
  const stickers = await _q(conn, 'SELECT description, file_path, world_book_id FROM sms_stickers WHERE world_book_id IN ' + in_, bookIds)

  const indexBy = (rows, key) => {
    const map = {}
    for (const r of rows) { if (!map[r[key]]) map[r[key]] = []; map[r[key]].push(r) }
    return map
  }
  const firstBy = (rows, key) => {
    const map = {}
    for (const r of rows) map[r[key]] = r
    return map
  }

  const entryMap = firstBy(entries, 'world_book_id')
  const profileMap = firstBy(profiles, 'world_book_id')
  const displayMap = firstBy(displays, 'world_book_id')
  const configMap = firstBy(configs, 'world_book_id')
  const userPortraitMap = indexBy(userPortraits, 'world_book_id')
  const charMap = indexBy(chars, 'world_book_id')
  const charPortraitMap = indexBy(charPortraits, 'character_id')
  const sceneMap = indexBy(scenes, 'world_book_id')
  const bgMap = indexBy(bgAssets, 'world_book_id')
  const borderMap = indexBy(borders, 'world_book_id')
  const relMap = indexBy(rels, 'world_book_id')
  const stickerMapByBook = indexBy(stickers, 'world_book_id')

  return books.map(bookRow => {
    const id = bookRow.id
    const book = rowToWorldBook(bookRow)

    const e = entryMap[id]
    if (e && Array.isArray(e)) book.entries = entriesRowToEntries(e[0])
    else if (e) book.entries = entriesRowToEntries(e)

    const p = profileMap[id]
    if (p && Array.isArray(p)) book.userProfile = profileRowToUserProfile(p[0])
    else if (p) book.userProfile = profileRowToUserProfile(p)

    const d = displayMap[id]
    if (d && Array.isArray(d)) book.displaySettings = displayRowToDisplaySettings(d[0])
    else if (d) book.displaySettings = displayRowToDisplaySettings(d)

    const c = configMap[id]
    if (c && Array.isArray(c)) {
      book.openingDialogueMode = c[0].opening_dialogue_mode || 'auto'
      book.openingDialogue = safeJsonParse(c[0].opening_dialogue, [])
      book.directorEvents = safeJsonParse(c[0].director_events, [])
    } else if (c) {
      book.openingDialogueMode = c.opening_dialogue_mode || 'auto'
      book.openingDialogue = safeJsonParse(c.opening_dialogue, [])
      book.directorEvents = safeJsonParse(c.director_events, [])
    }

    book.userProfile.portraits = (userPortraitMap[id] || []).map(p => ({
      id: p.id, label: '', emotion: 'default',
      filePath: p.file_path, fileName: extractFileName(p.file_path), addedAt: p.added_at,
    }))

    const bookChars = charMap[id] || []
    book.characters = bookChars.map(c => characterRowToCharacter(c))
    for (const char of book.characters) {
      char.portraits = (charPortraitMap[char.id] || []).map(p => ({
        id: p.id, label: p.label, emotion: p.emotion,
        filePath: p.file_path, fileName: extractFileName(p.file_path), addedAt: p.added_at,
      }))
    }

    book.scenes = (sceneMap[id] || []).map(s => ({
      id: s.id, name: s.name, background: s.background_path,
      description: s.description, createdAt: s.created_at,
    }))
    book.backgroundAssets = (bgMap[id] || []).map(a => ({ id: a.id, name: a.name, path: a.path, label: a.label }))
    book.displaySettings.cardBorderList = (borderMap[id] || []).map(b => ({
      id: b.id, name: b.name, filePath: b.file_path,
      fileName: extractFileName(b.file_path),
      cropRect: { x: b.crop_x, y: b.crop_y, w: b.crop_w, h: b.crop_h },
      addedAt: b.added_at,
    }))
    book.relationships = buildRelationshipsMap(relMap[id] || [])

    const bookStickers = stickerMapByBook[id] || []
    const stickerData = {}
    for (const s of bookStickers) stickerData[s.description] = s.file_path
    for (const char of book.characters) char.smsStickers = { ...stickerData }

    return book
  })
}

// ============================================================
// 写入操作
// 可选传入 statements 数组 — 收集 {statement, values} 用于 batchExecute
// 不传 statements 时直接执行（旧版兼容）
// ============================================================

function _add(stmts, sql, values = []) {
  stmts.push({ statement: sql, values })
}

/**
 * 写入/更新单本世界书
 * @param {Object} book
 * @param {Array} [statements] — 若传入则收集语句，不直接执行
 * @param {Object} [conn] — 若不传入 statements 则直接执行
 */
export async function insertBook(book, conn, statements) {
  const isCollect = Array.isArray(statements)
  const e = (sql, values) => isCollect ? _add(statements, sql, values) : _e(conn, sql, values)

  await e(
    `INSERT OR REPLACE INTO world_books (id, title, summary, is_default, tags, default_narrator_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [book.id, book.title, book.summary || '', book.isDefault ? 1 : 0,
     JSON.stringify(book.tags || []), book.defaultNarratorId || '',
     book.createdAt, book.updatedAt]
  )

  if (book.entries) {
    await e(
      `INSERT OR REPLACE INTO world_book_entries (world_book_id, overview, era, regions, forces, rules, culture, conflict, secrets, story_hook)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [book.id, book.entries.overview || '', book.entries.era || '',
       book.entries.regions || '', book.entries.forces || '', book.entries.rules || '',
       book.entries.culture || '', book.entries.conflict || '', book.entries.secrets || '',
       book.entries.storyHook || '']
    )
  }

  if (book.userProfile) {
    await e(
      `INSERT OR REPLACE INTO world_book_user_profiles (world_book_id, name, nickname, appearance, identity, background)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [book.id, book.userProfile.name || '', book.userProfile.nickname || '',
       book.userProfile.appearance || '', book.userProfile.identity || '',
       book.userProfile.background || '']
    )
    for (const p of (book.userProfile.portraits || [])) {
      await e(
        `INSERT OR REPLACE INTO world_book_portraits (id, world_book_id, file_path, added_at) VALUES (?, ?, ?, ?)`,
        [p.id, book.id, p.filePath || '', p.addedAt || new Date().toISOString()]
      )
    }
  }

  if (book.displaySettings) {
    await e(
      `INSERT OR REPLACE INTO world_book_display_settings (world_book_id, portrait_style, active_card_border_id)
       VALUES (?, ?, ?)`,
      [book.id, book.displaySettings.portraitStyle || 'card', book.displaySettings.activeCardBorderId || '']
    )
    for (const b of (book.displaySettings.cardBorderList || [])) {
      await e(
        `INSERT OR REPLACE INTO card_borders (id, world_book_id, name, file_path, crop_x, crop_y, crop_w, crop_h, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.id, book.id, b.name || '', b.filePath || '',
         b.cropRect?.x ?? 0, b.cropRect?.y ?? 0, b.cropRect?.w ?? 0, b.cropRect?.h ?? 0,
         b.addedAt || new Date().toISOString()]
      )
    }
  }

  await e(
    `INSERT OR REPLACE INTO world_book_config (world_book_id, opening_dialogue_mode, opening_dialogue, director_events)
     VALUES (?, ?, ?, ?)`,
    [book.id, book.openingDialogueMode || 'auto',
     JSON.stringify(book.openingDialogue || []),
     JSON.stringify(book.directorEvents || [])]
  )

  for (const c of (book.characters || [])) {
    const charVals = [
      c.id, book.id, c.name, c.nickname || '', c.appearance || '',
      c.identity || '', c.background || '', c.notes || '',
      c.birthday || '', c.smsAvatar || null, c.smsBg || null,
      c.personalityProfile?.mbti || '',
      JSON.stringify(c.personalityProfile?.behaviorTags || []),
      c.personalityProfile?.cognitiveDimensions?.Se ?? 50,
      c.personalityProfile?.cognitiveDimensions?.Si ?? 50,
      c.personalityProfile?.cognitiveDimensions?.Ne ?? 50,
      c.personalityProfile?.cognitiveDimensions?.Ni ?? 50,
      c.personalityProfile?.cognitiveDimensions?.Te ?? 50,
      c.personalityProfile?.cognitiveDimensions?.Ti ?? 50,
      c.personalityProfile?.cognitiveDimensions?.Fe ?? 50,
      c.personalityProfile?.cognitiveDimensions?.Fi ?? 50,
      c.relationshipBase?.favor ?? 50,
      c.relationshipBase?.trust ?? 50,
      c.relationshipBase?.stance ?? 0,
      c.voiceConfig?.enabled ? 1 : 0, c.voiceConfig?.voiceId || '',
      c.voiceConfig?.speed ?? 1.0, c.voiceConfig?.vol ?? 1.0,
      c.voiceConfig?.pitch ?? 0.0, c.voiceConfig?.emotion || '',
      c.voiceConfig?.sampleRate ?? 32000, c.voiceConfig?.bitrate ?? 128000,
      c.voiceConfig?.format || 'mp3', c.voiceConfig?.channel ?? 1,
      JSON.stringify(c.voiceConfig?.pronunciationTone || []),
      c.voiceConfig?.subtitleEnable ? 1 : 0,
      c.createdAt, c.updatedAt,
    ]
    console.log('[worldBook] character values count:', charVals.length, 'for char:', c.name, c.id)
    charVals.forEach((v, i) => {
      const preview = typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '...' : v
      console.log(`  [${i}]`, typeof v, preview)
    })

    await e(
      `INSERT OR REPLACE INTO characters (
        id, world_book_id, name, nickname, appearance, identity, background, notes,
        birthday, sms_avatar_path, sms_bg_path, mbti, behavior_tags,
        dim_se, dim_si, dim_ne, dim_ni, dim_te, dim_ti, dim_fe, dim_fi,
        favor, trust, stance,
        voice_enabled, voice_id, voice_speed, voice_vol, voice_pitch, voice_emotion,
        voice_sample_rate, voice_bitrate, voice_format, voice_channel,
        voice_pronunciation_tone, voice_subtitle_enable, created_at, updated_at
      ) VALUES (${Array(38).fill('?').join(',')})`,
      charVals
    )
    for (const p of (c.portraits || [])) {
      await e(
        `INSERT OR REPLACE INTO character_portraits (id, character_id, label, emotion, file_path, added_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [p.id, c.id, p.label || '', p.emotion || 'default',
         p.filePath || '', p.addedAt || new Date().toISOString()]
      )
    }
  }

  for (const s of (book.scenes || [])) {
    await e(
      `INSERT OR REPLACE INTO scenes (id, world_book_id, name, background_path, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [s.id, book.id, s.name, s.background || '', s.description || '', s.createdAt]
    )
  }

  for (const a of (book.backgroundAssets || [])) {
    await e(
      `INSERT OR REPLACE INTO background_assets (id, world_book_id, name, path, label)
       VALUES (?, ?, ?, ?, ?)`,
      [a.id, book.id, a.name, a.path, a.label || '']
    )
  }

  if (book.relationships) {
    for (const [fromId, targets] of Object.entries(book.relationships)) {
      for (const [toId, rel] of Object.entries(targets)) {
        await e(
          `INSERT OR REPLACE INTO relationships (world_book_id, from_id, to_id, score, description, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [book.id, fromId, toId, rel.score ?? 0, rel.description || '', rel.updatedAt || new Date().toISOString()]
        )
      }
    }
  }
}

/**
 * 清空世界书相关表（不影响存档、叙事者等独立用户数据）
 * @param {Object} [conn] — 若不传入 statements 则直接执行
 * @param {Array} [statements] — 若传入则收集语句，不直接执行
 */
export async function clearWorldBookTables(conn, statements) {
  const isCollect = Array.isArray(statements)
  const e = (sql) => isCollect ? _add(statements, sql) : _e(conn, sql)

  // 只清空与世界书相关的表
  for (const table of [
    // 世界书核心表
    'world_books', 'world_book_entries', 'world_book_user_profiles',
    'world_book_portraits', 'world_book_display_settings', 'world_book_config',
    // 角色
    'characters', 'character_portraits',
    // 场景和资源
    'scenes', 'background_assets', 'card_borders', 'sms_stickers',
    // 关系系统（依赖世界书的角色）
    'relationships', 'relationship_runtime', 'relationship_history', 'relationship_triggered_events',
    // 记忆系统（依赖世界书）
    'memory_events', 'memory_character_memories', 'memory_world_flags', 'memory_milestones',
    'memory_extraction_config',
    // 其他依赖世界书的数据
    'exposure_data', 'evolution_logs', 'dialogue_archive', 'story_ticket_archives',
    'npc_sms_threads', 'activity_story_saves',
    // Reader 数据（依赖世界书的 story）
    'reader_stories', 'reader_chapters', 'reader_story_memories', 'reader_settings',
    // 角色状态和日程
    'character_states', 'character_schedules', 'schedule_config',
    'daily_checkin_records', 'daily_checkin_month_stats', 'checkin7_state',
    'task_board', 'task_execution_sessions', 'task_execution_history',
  ]) {
    await e(`DELETE FROM ${table}`)
  }
}

/**
 * 清空所有表（危险操作，仅用于完全重置）
 * @param {Object} [conn] — 若不传入 statements 则直接执行
 * @param {Array} [statements] — 若传入则收集语句，不直接执行
 */
export async function clearAllTables(conn, statements) {
  const isCollect = Array.isArray(statements)
  const e = (sql) => isCollect ? _add(statements, sql) : _e(conn, sql)

  for (const table of [
    'api_configs', 'custom_themes', 'activity_imported', 'activity_enabled',
    'main_story_saves', 'backup_slots', 'save_slots',
    'exposure_data', 'evolution_logs', 'dialogue_archive',
    'story_ticket_archives', 'activity_story_saves', 'npc_sms_threads',
    'card_collection', 'narrator_profiles', 'app_config',
    'relationship_triggered_events', 'relationship_history', 'relationship_runtime',
    'memory_extraction_config', 'memory_milestones', 'memory_world_flags',
    'memory_character_memories', 'memory_events',
    'relationships', 'sms_stickers', 'card_borders', 'background_assets',
    'scenes', 'character_portraits', 'characters', 'world_book_portraits',
    'world_book_user_profiles', 'world_book_entries', 'world_book_display_settings',
    'world_book_config', 'world_books',
    'reader_story_memories', 'reader_chapters', 'reader_stories', 'reader_settings',
  ]) {
    await e(`DELETE FROM ${table}`)
  }
}
