/**
 * SQLite 数据库层 — Android 端
 * Web 端自动回退到 localStorage
 */
import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'

let db = null

// --- 连接管理 ---

export async function openDatabase() {
  if (!Capacitor.isNativePlatform()) {
    return false
  }
  try {
    const sqliteConnection = new SQLiteConnection(CapacitorSQLite)
    db = await sqliteConnection.createConnection('avg_llm', false, '', 1, false)
    await db.open()
    return true
  } catch (e) {
    console.error('[db] Failed to open SQLite:', e.message)
    return false
  }
}

export function getDB() {
  if (!db) throw new Error('[db] Database not initialized. Call openDatabase() first.')
  return db
}

export function isSQLiteAvailable() {
  return db !== null
}

// --- 建表 DDL ---

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS world_books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  default_narrator_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_book_entries (
  world_book_id TEXT PRIMARY KEY REFERENCES world_books(id) ON DELETE CASCADE,
  overview TEXT DEFAULT '', era TEXT DEFAULT '', regions TEXT DEFAULT '',
  forces TEXT DEFAULT '', rules TEXT DEFAULT '', culture TEXT DEFAULT '',
  conflict TEXT DEFAULT '', secrets TEXT DEFAULT '', story_hook TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS world_book_user_profiles (
  world_book_id TEXT PRIMARY KEY REFERENCES world_books(id) ON DELETE CASCADE,
  name TEXT DEFAULT '', nickname TEXT DEFAULT '', appearance TEXT DEFAULT '',
  identity TEXT DEFAULT '', background TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS world_book_portraits (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  name TEXT NOT NULL, nickname TEXT DEFAULT '', appearance TEXT DEFAULT '',
  identity TEXT DEFAULT '', background TEXT DEFAULT '', notes TEXT DEFAULT '',
  birthday TEXT DEFAULT '', sms_avatar_path TEXT, sms_bg_path TEXT,
  mbti TEXT DEFAULT '', behavior_tags TEXT DEFAULT '[]',
  dim_se INTEGER DEFAULT 50, dim_si INTEGER DEFAULT 50, dim_ne INTEGER DEFAULT 50,
  dim_ni INTEGER DEFAULT 50, dim_te INTEGER DEFAULT 50, dim_ti INTEGER DEFAULT 50,
  dim_fe INTEGER DEFAULT 50, dim_fi INTEGER DEFAULT 50,
  favor INTEGER DEFAULT 50, trust INTEGER DEFAULT 50, stance INTEGER DEFAULT 0,
  voice_enabled INTEGER DEFAULT 0, voice_id TEXT DEFAULT '',
  voice_speed REAL DEFAULT 1.0, voice_vol REAL DEFAULT 1.0,
  voice_pitch REAL DEFAULT 0.0, voice_emotion TEXT DEFAULT '',
  voice_sample_rate INTEGER DEFAULT 32000, voice_bitrate INTEGER DEFAULT 128000,
  voice_format TEXT DEFAULT 'mp3', voice_channel INTEGER DEFAULT 1,
  voice_pronunciation_tone TEXT DEFAULT '[]',
  voice_subtitle_enable INTEGER DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_portraits (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  label TEXT DEFAULT '', emotion TEXT DEFAULT 'default',
  file_path TEXT NOT NULL, added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  name TEXT NOT NULL, background_path TEXT DEFAULT '',
  description TEXT DEFAULT '', created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS background_assets (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  name TEXT NOT NULL, path TEXT NOT NULL, label TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS world_book_display_settings (
  world_book_id TEXT PRIMARY KEY REFERENCES world_books(id) ON DELETE CASCADE,
  portrait_style TEXT DEFAULT 'card', active_card_border_id TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS card_borders (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  name TEXT DEFAULT '', file_path TEXT NOT NULL,
  crop_x INTEGER DEFAULT 0, crop_y INTEGER DEFAULT 0,
  crop_w INTEGER DEFAULT 0, crop_h INTEGER DEFAULT 0, added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_stickers (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  description TEXT NOT NULL, file_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_book_config (
  world_book_id TEXT PRIMARY KEY REFERENCES world_books(id) ON DELETE CASCADE,
  opening_dialogue_mode TEXT DEFAULT 'auto',
  opening_dialogue TEXT DEFAULT '[]',
  director_events TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL, to_id TEXT NOT NULL,
  score INTEGER DEFAULT 0, description TEXT DEFAULT '', updated_at TEXT NOT NULL,
  UNIQUE(world_book_id, from_id, to_id)
);

CREATE TABLE IF NOT EXISTS memory_events (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  event_data TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  event_type TEXT DEFAULT '',
  emotional_impact REAL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_character_memories (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  memory_data TEXT NOT NULL,
  about TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_world_flags (
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  flag_name TEXT NOT NULL,
  flag_value TEXT,
  PRIMARY KEY (world_book_id, flag_name)
);

CREATE TABLE IF NOT EXISTS memory_milestones (
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  milestone_name TEXT NOT NULL,
  PRIMARY KEY (world_book_id, milestone_name)
);

CREATE TABLE IF NOT EXISTS memory_extraction_config (
  key TEXT PRIMARY KEY,
  config_data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationship_runtime (
  character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  world_book_id TEXT NOT NULL,
  favor INTEGER DEFAULT 0,
  trust INTEGER DEFAULT 0,
  stance INTEGER DEFAULT 0,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS relationship_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  history_data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationship_triggered_events (
  world_book_id TEXT NOT NULL REFERENCES world_books(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  PRIMARY KEY (world_book_id, event_id)
);

-- ============================================================
-- 应用配置 (统一 KV 表，替代所有单配置模块)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================
-- 旁白系统
-- ============================================================
CREATE TABLE IF NOT EXISTS narrator_profiles (
  id TEXT PRIMARY KEY,
  profile_data TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============================================================
-- 卡牌收藏
-- ============================================================
CREATE TABLE IF NOT EXISTS card_collection (
  collection_id TEXT PRIMARY KEY,
  card_template_id TEXT NOT NULL,
  card_name TEXT,
  category TEXT,
  category_name TEXT,
  category_icon TEXT,
  rarity TEXT,
  rarity_name TEXT,
  rarity_color TEXT,
  content TEXT,
  template_html TEXT,
  created_at TEXT,
  game_time TEXT,
  scene_name TEXT,
  tags TEXT DEFAULT '[]',
  is_favorite INTEGER DEFAULT 0,
  notes TEXT,
  collection_data TEXT
);

-- ============================================================
-- NPC 短信对话
-- ============================================================
CREATE TABLE IF NOT EXISTS npc_sms_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_book_id TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  thread_data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(world_book_id, thread_key, created_at)
);

-- ============================================================
-- 活动故事存档
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_story_saves (
  activity_id TEXT PRIMARY KEY,
  save_data TEXT NOT NULL
);

-- ============================================================
-- 故事票据归档
-- ============================================================
CREATE TABLE IF NOT EXISTS story_ticket_archives (
  id TEXT PRIMARY KEY,
  title TEXT,
  target_character TEXT,
  theme TEXT,
  world_book_id TEXT,
  dialogues TEXT DEFAULT '[]',
  raw_content TEXT,
  word_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- ============================================================
-- 对话归档
-- ============================================================
CREATE TABLE IF NOT EXISTS dialogue_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  speaker TEXT,
  text_preview TEXT,
  full_text TEXT,
  timestamp TEXT NOT NULL,
  world_book_id TEXT,
  character_id TEXT
);

-- ============================================================
-- 世界演化日志
-- ============================================================
CREATE TABLE IF NOT EXISTS evolution_logs (
  id TEXT PRIMARY KEY,
  log_data TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  event_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- ============================================================
-- 角色曝光追踪
-- ============================================================
CREATE TABLE IF NOT EXISTS exposure_data (
  world_book_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  exposure_data TEXT NOT NULL,
  PRIMARY KEY (world_book_id, character_id)
);

-- ============================================================
-- 存档系统
-- ============================================================
CREATE TABLE IF NOT EXISTS save_slots (
  id TEXT PRIMARY KEY,
  save_data TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  chapter TEXT,
  scene TEXT,
  play_time TEXT,
  preview TEXT
);

CREATE TABLE IF NOT EXISTS backup_slots (
  id TEXT PRIMARY KEY,
  backup_data TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  name TEXT,
  message_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS main_story_saves (
  world_book_id TEXT PRIMARY KEY,
  save_slot_id TEXT NOT NULL
);

-- ============================================================
-- 活动条目
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_enabled (
  activity_id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS activity_imported (
  id TEXT PRIMARY KEY,
  activity_data TEXT NOT NULL
);

-- ============================================================
-- 自定义主题
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_themes (
  id TEXT PRIMARY KEY,
  theme_data TEXT NOT NULL
);

-- ============================================================
-- LLM API 配置
-- ============================================================
CREATE TABLE IF NOT EXISTS api_configs (
  id TEXT PRIMARY KEY,
  config_data TEXT NOT NULL,
  label TEXT,
  is_active INTEGER DEFAULT 0
);
`

const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_characters_book ON characters(world_book_id);
CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(world_book_id, name);
CREATE INDEX IF NOT EXISTS idx_user_portraits_book ON world_book_portraits(world_book_id);
CREATE INDEX IF NOT EXISTS idx_portraits_character ON character_portraits(character_id);
CREATE INDEX IF NOT EXISTS idx_scenes_book ON scenes(world_book_id);
CREATE INDEX IF NOT EXISTS idx_bg_assets_book ON background_assets(world_book_id);
CREATE INDEX IF NOT EXISTS idx_card_borders_book ON card_borders(world_book_id);
CREATE INDEX IF NOT EXISTS idx_sms_stickers_book ON sms_stickers(world_book_id);
CREATE INDEX IF NOT EXISTS idx_relationships_book ON relationships(world_book_id);

CREATE INDEX IF NOT EXISTS idx_memory_events_book ON memory_events(world_book_id);
CREATE INDEX IF NOT EXISTS idx_memory_events_status ON memory_events(world_book_id, status);
CREATE INDEX IF NOT EXISTS idx_memory_char_memories ON memory_character_memories(world_book_id, character_id);
CREATE INDEX IF NOT EXISTS idx_memory_flags_book ON memory_world_flags(world_book_id);
CREATE INDEX IF NOT EXISTS idx_memory_milestones_book ON memory_milestones(world_book_id);
CREATE INDEX IF NOT EXISTS idx_rel_runtime_book ON relationship_runtime(world_book_id);
CREATE INDEX IF NOT EXISTS idx_rel_history_book ON relationship_history(world_book_id);

CREATE INDEX IF NOT EXISTS idx_narrator_default ON narrator_profiles(is_default);
CREATE INDEX IF NOT EXISTS idx_card_collection_template ON card_collection(card_template_id);
CREATE INDEX IF NOT EXISTS idx_card_collection_rarity ON card_collection(rarity);
CREATE INDEX IF NOT EXISTS idx_npc_sms_threads_key ON npc_sms_threads(world_book_id, thread_key);
CREATE INDEX IF NOT EXISTS idx_story_archives_world ON story_ticket_archives(world_book_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_archive_world ON dialogue_archive(world_book_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_archive_ts ON dialogue_archive(timestamp);
CREATE INDEX IF NOT EXISTS idx_evolution_logs_ts ON evolution_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_exposure_world ON exposure_data(world_book_id);
CREATE INDEX IF NOT EXISTS idx_save_slots_ts ON save_slots(timestamp);
CREATE INDEX IF NOT EXISTS idx_backup_slots_ts ON backup_slots(timestamp);
CREATE INDEX IF NOT EXISTS idx_api_active ON api_configs(is_active);
`

export async function createTables() {
  const conn = getDB()
  await conn.execute(CREATE_TABLES_SQL)
  await conn.execute(CREATE_INDEXES_SQL)
}

// --- 查询辅助函数 ---

/**
 * 执行一条 SQL（INSERT/UPDATE/DELETE），返回结果
 */
export async function exec(sql, values = []) {
  const conn = getDB()
  const result = await conn.run(sql, values)
  return result
}

/**
 * 批量执行 SQL（多语句，用分号分隔）
 */
export async function execBatch(sql) {
  const conn = getDB()
  return conn.execute(sql)
}

/**
 * 执行查询，返回行数组
 */
export async function query(sql, values = []) {
  const conn = getDB()
  const result = await conn.query(sql, values)
  return result.values || []
}

/**
 * 在事务中执行一组操作
 */
export async function transaction(fn) {
  const conn = getDB()
  await conn.run('BEGIN TRANSACTION')
  try {
    const result = await fn()
    await conn.run('COMMIT')
    return result
  } catch (e) {
    await conn.run('ROLLBACK')
    throw e
  }
}

// --- 数据组装工厂 ---

/**
 * 加载所有关联数据，组装完整世界书对象
 * 返回格式兼容原有 normalizeWorldBook 的结构
 */
export async function loadBookFull(bookId) {
  // 主表
  const [bookRow] = await query('SELECT * FROM world_books WHERE id = ?', [bookId])
  if (!bookRow) return null

  const book = rowToWorldBook(bookRow)

  // 1:1 子表
  const [entries] = await query('SELECT * FROM world_book_entries WHERE world_book_id = ?', [bookId])
  if (entries) book.entries = entriesRowToEntries(entries)

  const [profile] = await query('SELECT * FROM world_book_user_profiles WHERE world_book_id = ?', [bookId])
  if (profile) book.userProfile = profileRowToUserProfile(profile)

  const [display] = await query('SELECT * FROM world_book_display_settings WHERE world_book_id = ?', [bookId])
  if (display) book.displaySettings = displayRowToDisplaySettings(display)

  const [config] = await query('SELECT * FROM world_book_config WHERE world_book_id = ?', [bookId])
  if (config) {
    book.openingDialogueMode = config.opening_dialogue_mode || 'auto'
    book.openingDialogue = safeJsonParse(config.opening_dialogue, [])
  }

  // 1对多子表
  const portraits = await query('SELECT * FROM world_book_portraits WHERE world_book_id = ?', [bookId])
  book.userProfile.portraits = portraits.map(p => ({
    id: p.id,
    label: '',
    emotion: 'default',
    filePath: p.file_path,
    fileName: extractFileName(p.file_path),
    addedAt: p.added_at,
  }))

  const chars = await query('SELECT * FROM characters WHERE world_book_id = ?', [bookId])
  book.characters = chars.map(c => characterRowToCharacter(c))

  // 角色立绘
  if (chars.length > 0) {
    const charIds = chars.map(c => c.id)
    const allPortraits = await query(
      'SELECT * FROM character_portraits WHERE character_id IN (' + charIds.map(() => '?').join(',') + ')',
      charIds
    )
    const portraitMap = {}
    for (const p of allPortraits) {
      if (!portraitMap[p.character_id]) portraitMap[p.character_id] = []
      portraitMap[p.character_id].push({
        id: p.id,
        label: p.label,
        emotion: p.emotion,
        filePath: p.file_path,
        fileName: extractFileName(p.file_path),
        addedAt: p.added_at,
      })
    }
    for (const char of book.characters) {
      char.portraits = portraitMap[char.id] || []
    }
  }

  const scenes = await query('SELECT * FROM scenes WHERE world_book_id = ?', [bookId])
  book.scenes = scenes.map(s => ({
    id: s.id,
    name: s.name,
    background: s.background_path,
    description: s.description,
    createdAt: s.created_at,
  }))

  const bgAssets = await query('SELECT * FROM background_assets WHERE world_book_id = ?', [bookId])
  book.backgroundAssets = bgAssets.map(a => ({
    id: a.id,
    name: a.name,
    path: a.path,
    label: a.label,
  }))

  const borders = await query('SELECT * FROM card_borders WHERE world_book_id = ?', [bookId])
  book.displaySettings.cardBorderList = borders.map(b => ({
    id: b.id,
    name: b.name,
    filePath: b.file_path,
    fileName: extractFileName(b.file_path),
    cropRect: { x: b.crop_x, y: b.crop_y, w: b.crop_w, h: b.crop_h },
    addedAt: b.added_at,
  }))

  const rels = await query('SELECT * FROM relationships WHERE world_book_id = ?', [bookId])
  book.relationships = buildRelationshipsMap(rels)

  // 短信表情包（共享，附加到每个角色）
  const stickers = await query('SELECT description, file_path FROM sms_stickers WHERE world_book_id = ?', [bookId])
  const stickerMap = {}
  for (const s of stickers) { stickerMap[s.description] = s.file_path }
  for (const char of book.characters) {
    char.smsStickers = { ...stickerMap }
  }

  // 导演事件
  if (config) {
    book.directorEvents = safeJsonParse(config.director_events, [])
  } else {
    book.directorEvents = []
  }

  return book
}

/**
 * 批量加载所有世界书的完整数据
 */
export async function loadAllBooksFull() {
  const books = await query('SELECT * FROM world_books ORDER BY is_default DESC, created_at')
  if (books.length === 0) return []

  const bookIds = books.map(b => b.id)

  // 批量查所有关联数据
  const entries = await query('SELECT * FROM world_book_entries WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)
  const profiles = await query('SELECT * FROM world_book_user_profiles WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)
  const displays = await query('SELECT * FROM world_book_display_settings WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)
  const configs = await query('SELECT * FROM world_book_config WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)
  const userPortraits = await query('SELECT * FROM world_book_portraits WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)
  const chars = await query('SELECT * FROM characters WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)
  const charPortraits = await query('SELECT * FROM character_portraits WHERE character_id IN (' + chars.map(c => '?').join(',') + ')', chars.map(c => c.id))
  const scenes = await query('SELECT * FROM scenes WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)
  const bgAssets = await query('SELECT * FROM background_assets WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)
  const borders = await query('SELECT * FROM card_borders WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)
  const rels = await query('SELECT * FROM relationships WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)
  const stickers = await query('SELECT description, file_path, world_book_id FROM sms_stickers WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')', bookIds)

  // 建索引
  const indexBy = (rows, key) => {
    const map = {}
    for (const r of rows) {
      if (!map[r[key]]) map[r[key]] = []
      map[r[key]].push(r)
    }
    return map
  }
  const firstBy = (rows, key) => {
    const map = {}
    for (const r of rows) { map[r[key]] = r }
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

    // 1:1
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

    // 用户档案立绘
    const up = userPortraitMap[id] || []
    book.userProfile.portraits = up.map(p => ({
      id: p.id, label: '', emotion: 'default',
      filePath: p.file_path, fileName: extractFileName(p.file_path), addedAt: p.added_at,
    }))

    // 角色
    const bookChars = charMap[id] || []
    book.characters = bookChars.map(c => characterRowToCharacter(c))

    // 角色立绘
    for (const char of book.characters) {
      char.portraits = (charPortraitMap[char.id] || []).map(p => ({
        id: p.id, label: p.label, emotion: p.emotion,
        filePath: p.file_path, fileName: extractFileName(p.file_path), addedAt: p.added_at,
      }))
    }

    // 场景
    book.scenes = (sceneMap[id] || []).map(s => ({
      id: s.id, name: s.name, background: s.background_path,
      description: s.description, createdAt: s.created_at,
    }))

    // 背景资源
    book.backgroundAssets = (bgMap[id] || []).map(a => ({
      id: a.id, name: a.name, path: a.path, label: a.label,
    }))

    // 卡牌边框
    book.displaySettings.cardBorderList = (borderMap[id] || []).map(b => ({
      id: b.id, name: b.name, filePath: b.file_path,
      fileName: extractFileName(b.file_path),
      cropRect: { x: b.crop_x, y: b.crop_y, w: b.crop_w, h: b.crop_h },
      addedAt: b.added_at,
    }))

    // 关系
    book.relationships = buildRelationshipsMap(relMap[id] || [])

    // 短信表情包
    const bookStickers = stickerMapByBook[id] || []
    const stickerData = {}
    for (const s of bookStickers) { stickerData[s.description] = s.file_path }
    for (const char of book.characters) { char.smsStickers = { ...stickerData } }

    return book
  })
}

// --- Row → Object 转换 ---

function rowToWorldBook(row) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    isDefault: !!row.is_default,
    tags: safeJsonParse(row.tags, []),
    defaultNarratorId: row.default_narrator_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function entriesRowToEntries(row) {
  return {
    overview: row.overview || '',
    era: row.era || '',
    regions: row.regions || '',
    forces: row.forces || '',
    rules: row.rules || '',
    culture: row.culture || '',
    conflict: row.conflict || '',
    secrets: row.secrets || '',
    storyHook: row.story_hook || '',
  }
}

function profileRowToUserProfile(row) {
  return {
    name: row.name || '',
    nickname: row.nickname || '',
    appearance: row.appearance || '',
    identity: row.identity || '',
    background: row.background || '',
    portraits: [], // filled separately
  }
}

function displayRowToDisplaySettings(row) {
  return {
    portraitStyle: row.portrait_style || 'card',
    cardBorderList: [], // filled separately
    activeCardBorderId: row.active_card_border_id || '',
  }
}

function characterRowToCharacter(row) {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname || '',
    appearance: row.appearance || '',
    identity: row.identity || '',
    background: row.background || '',
    notes: row.notes || '',
    birthday: row.birthday || '',
    smsAvatar: row.sms_avatar_path,
    smsBg: row.sms_bg_path,
    smsStickers: {}, // filled separately
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
    relationshipBase: {
      favor: row.favor ?? 50,
      trust: row.trust ?? 50,
      stance: row.stance ?? 0,
    },
    voiceConfig: {
      enabled: !!row.voice_enabled,
      voiceId: row.voice_id || '',
      speed: row.voice_speed ?? 1.0,
      vol: row.voice_vol ?? 1.0,
      pitch: row.voice_pitch ?? 0.0,
      emotion: row.voice_emotion || '',
      sampleRate: row.voice_sample_rate ?? 32000,
      bitrate: row.voice_bitrate ?? 128000,
      format: row.voice_format || 'mp3',
      channel: row.voice_channel ?? 1,
      pronunciationTone: safeJsonParse(row.voice_pronunciation_tone, []),
      subtitleEnable: !!row.voice_subtitle_enable,
    },
    portraits: [], // filled separately
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildRelationshipsMap(rows) {
  const result = {}
  for (const r of rows) {
    if (!result[r.from_id]) result[r.from_id] = {}
    result[r.from_id][r.to_id] = {
      score: r.score,
      description: r.description || '',
      updatedAt: r.updated_at,
    }
  }
  return result
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

function extractFileName(path) {
  if (!path) return ''
  return path.split('/').pop() || path
}

// --- 数据写入工厂 ---

/**
 * 将完整的世界书对象写入数据库（单本）
 * 用于事务内的 INSERT
 */
export async function insertBook(book) {
  // 主表
  await exec(
    `INSERT OR REPLACE INTO world_books (id, title, summary, is_default, tags, default_narrator_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [book.id, book.title, book.summary || '', book.isDefault ? 1 : 0,
     JSON.stringify(book.tags || []), book.defaultNarratorId || '',
     book.createdAt, book.updatedAt]
  )

  // entries
  if (book.entries) {
    await exec(
      `INSERT OR REPLACE INTO world_book_entries (world_book_id, overview, era, regions, forces, rules, culture, conflict, secrets, story_hook)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [book.id, book.entries.overview || '', book.entries.era || '',
       book.entries.regions || '', book.entries.forces || '', book.entries.rules || '',
       book.entries.culture || '', book.entries.conflict || '', book.entries.secrets || '',
       book.entries.storyHook || '']
    )
  }

  // user profile
  if (book.userProfile) {
    await exec(
      `INSERT OR REPLACE INTO world_book_user_profiles (world_book_id, name, nickname, appearance, identity, background)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [book.id, book.userProfile.name || '', book.userProfile.nickname || '',
       book.userProfile.appearance || '', book.userProfile.identity || '',
       book.userProfile.background || '']
    )
    // user portraits
    if (book.userProfile.portraits) {
      for (const p of book.userProfile.portraits) {
        await exec(
          `INSERT OR REPLACE INTO world_book_portraits (id, world_book_id, file_path, added_at) VALUES (?, ?, ?, ?)`,
          [p.id, book.id, p.filePath || '', p.addedAt || new Date().toISOString()]
        )
      }
    }
  }

  // display settings
  if (book.displaySettings) {
    await exec(
      `INSERT OR REPLACE INTO world_book_display_settings (world_book_id, portrait_style, active_card_border_id)
       VALUES (?, ?, ?)`,
      [book.id, book.displaySettings.portraitStyle || 'card',
       book.displaySettings.activeCardBorderId || '']
    )
    // card borders
    if (book.displaySettings.cardBorderList) {
      for (const b of book.displaySettings.cardBorderList) {
        await exec(
          `INSERT OR REPLACE INTO card_borders (id, world_book_id, name, file_path, crop_x, crop_y, crop_w, crop_h, added_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [b.id, book.id, b.name || '', b.filePath || '',
           b.cropRect?.x ?? 0, b.cropRect?.y ?? 0, b.cropRect?.w ?? 0, b.cropRect?.h ?? 0,
           b.addedAt || new Date().toISOString()]
        )
      }
    }
  }

  // config
  await exec(
    `INSERT OR REPLACE INTO world_book_config (world_book_id, opening_dialogue_mode, opening_dialogue, director_events)
     VALUES (?, ?, ?, ?)`,
    [book.id, book.openingDialogueMode || 'auto',
     JSON.stringify(book.openingDialogue || []),
     JSON.stringify(book.directorEvents || [])]
  )

  // characters
  if (book.characters) {
    for (const c of book.characters) {
      await exec(
        `INSERT OR REPLACE INTO characters (
          id, world_book_id, name, nickname, appearance, identity, background, notes,
          birthday, sms_avatar_path, sms_bg_path, mbti, behavior_tags,
          dim_se, dim_si, dim_ne, dim_ni, dim_te, dim_ti, dim_fe, dim_fi,
          favor, trust, stance,
          voice_enabled, voice_id, voice_speed, voice_vol, voice_pitch, voice_emotion,
          voice_sample_rate, voice_bitrate, voice_format, voice_channel,
          voice_pronunciation_tone, voice_subtitle_enable,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
          c.voiceConfig?.enabled ? 1 : 0,
          c.voiceConfig?.voiceId || '',
          c.voiceConfig?.speed ?? 1.0,
          c.voiceConfig?.vol ?? 1.0,
          c.voiceConfig?.pitch ?? 0.0,
          c.voiceConfig?.emotion || '',
          c.voiceConfig?.sampleRate ?? 32000,
          c.voiceConfig?.bitrate ?? 128000,
          c.voiceConfig?.format || 'mp3',
          c.voiceConfig?.channel ?? 1,
          JSON.stringify(c.voiceConfig?.pronunciationTone || []),
          c.voiceConfig?.subtitleEnable ? 1 : 0,
          c.createdAt, c.updatedAt,
        ]
      )
      // character portraits
      if (c.portraits) {
        for (const p of c.portraits) {
          await exec(
            `INSERT OR REPLACE INTO character_portraits (id, character_id, label, emotion, file_path, added_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [p.id, c.id, p.label || '', p.emotion || 'default',
             p.filePath || '', p.addedAt || new Date().toISOString()]
          )
        }
      }
    }
  }

  // scenes
  if (book.scenes) {
    for (const s of book.scenes) {
      await exec(
        `INSERT OR REPLACE INTO scenes (id, world_book_id, name, background_path, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [s.id, book.id, s.name, s.background || '', s.description || '', s.createdAt]
      )
    }
  }

  // background assets
  if (book.backgroundAssets) {
    for (const a of book.backgroundAssets) {
      await exec(
        `INSERT OR REPLACE INTO background_assets (id, world_book_id, name, path, label)
         VALUES (?, ?, ?, ?, ?)`,
        [a.id, book.id, a.name, a.path, a.label || '']
      )
    }
  }

  // relationships
  if (book.relationships) {
    for (const [fromId, targets] of Object.entries(book.relationships)) {
      for (const [toId, rel] of Object.entries(targets)) {
        await exec(
          `INSERT OR REPLACE INTO relationships (world_book_id, from_id, to_id, score, description, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [book.id, fromId, toId, rel.score ?? 0, rel.description || '', rel.updatedAt || new Date().toISOString()]
        )
      }
    }
  }
}

// --- 清空所有表 ---

const ALL_TABLES = [
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
]

export async function clearAllTables() {
  for (const table of ALL_TABLES) {
    await exec(`DELETE FROM ${table}`)
  }
}

// --- app_config KV 辅助 ---

export async function getConfig(key, defaultValue = null) {
  const rows = await query('SELECT value FROM app_config WHERE key = ?', [key])
  if (rows.length === 0) return defaultValue
  try { return JSON.parse(rows[0].value) } catch { return defaultValue }
}

export async function setConfig(key, value) {
  await exec(
    'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)',
    [key, JSON.stringify(value)]
  )
}

export async function removeConfig(key) {
  await exec('DELETE FROM app_config WHERE key = ?', [key])
}
