/**
 * SQLite 连接管理 — Android 端
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
  speech_style TEXT DEFAULT '',
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

-- ============================================================
-- Reader 书城（小说、章节、设置、记忆）
-- ============================================================
CREATE TABLE IF NOT EXISTS reader_stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  world_book_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reader_chapters (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES reader_stories(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  card_html TEXT DEFAULT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  last_read_page INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(story_id, chapter_index)
);

CREATE TABLE IF NOT EXISTS reader_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reader_story_memories (
  story_id TEXT PRIMARY KEY REFERENCES reader_stories(id) ON DELETE CASCADE,
  memories TEXT NOT NULL DEFAULT '',
  last_extracted_at TEXT NOT NULL DEFAULT '',
  chapter_count INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 角色状态（feature-character-state）
-- ============================================================
CREATE TABLE IF NOT EXISTS character_states (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  state_data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(world_book_id, character_id)
);

-- ============================================================
-- 日历签到（feature-checkin）
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_checkin_records (
  world_book_id TEXT NOT NULL,
  date_str TEXT NOT NULL,
  record_data TEXT NOT NULL,
  PRIMARY KEY (world_book_id, date_str)
);

CREATE TABLE IF NOT EXISTS daily_checkin_month_stats (
  world_book_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  checked_days INTEGER DEFAULT 0,
  month_bonus_claimed INTEGER DEFAULT 0,
  PRIMARY KEY (world_book_id, month_key)
);

CREATE TABLE IF NOT EXISTS checkin7_state (
  world_book_id TEXT PRIMARY KEY,
  streak_days INTEGER DEFAULT 0,
  last_signin_date TEXT DEFAULT '',
  today_checked INTEGER DEFAULT 0,
  today_reward TEXT DEFAULT '',
  items TEXT DEFAULT '{}',
  theme_fragments INTEGER DEFAULT 0
);

-- ============================================================
-- 角色日程（feature-character-schedule）
-- ============================================================
CREATE TABLE IF NOT EXISTS character_schedules (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  schedule_date TEXT NOT NULL,
  schedule_data TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  has_custom_override INTEGER DEFAULT 0,
  UNIQUE(world_book_id, character_id, schedule_date)
);

CREATE TABLE IF NOT EXISTS schedule_config (
  key TEXT PRIMARY KEY,
  config_data TEXT NOT NULL
);

-- ============================================================
-- 任务板（feature-task-board）
-- ============================================================
CREATE TABLE IF NOT EXISTS task_board (
  world_book_id TEXT PRIMARY KEY,
  tasks_data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_execution_sessions (
  task_id TEXT PRIMARY KEY,
  session_data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_execution_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  session_data TEXT NOT NULL,
  archived_at TEXT NOT NULL
);

-- ============================================================
-- 待办事项（feature-todo）
-- ============================================================
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'other',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  due_date TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  completed_at TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  reminder INTEGER DEFAULT 1
);

-- ============================================================
-- 冰箱物品（feature-dormitory）
-- ============================================================
CREATE TABLE IF NOT EXISTS fridge_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  quantity INTEGER DEFAULT 1,
  unit TEXT DEFAULT '个',
  purchase_date TEXT NOT NULL,
  expiry_date TEXT DEFAULT '',
  price INTEGER DEFAULT 0,
  source TEXT DEFAULT '',
  remaining INTEGER DEFAULT 1,
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS fridge_purchases (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  source TEXT DEFAULT '',
  items TEXT NOT NULL,
  total INTEGER DEFAULT 0,
  note TEXT DEFAULT ''
);

-- ============================================================
-- 抽卡碎片与统计（feature-game/gacha）
-- ============================================================
CREATE TABLE IF NOT EXISTS gacha_fragments (
  key TEXT PRIMARY KEY,
  story_fragment INTEGER DEFAULT 0,
  cg_fragment INTEGER DEFAULT 0,
  clothes_fragment INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gacha_stats (
  key TEXT PRIMARY KEY,
  total_pulls INTEGER DEFAULT 0,
  pulls_since_sr INTEGER DEFAULT 0,
  pulls_since_ssr INTEGER DEFAULT 0,
  luck_value INTEGER DEFAULT 0,
  total_cost INTEGER DEFAULT 0,
  sr_boost_active INTEGER DEFAULT 0,
  is_first_multi INTEGER DEFAULT 1
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

CREATE INDEX IF NOT EXISTS idx_reader_chapters_story ON reader_chapters(story_id);
CREATE INDEX IF NOT EXISTS idx_reader_chapters_story_index ON reader_chapters(story_id, chapter_index);

-- 新增表索引
CREATE INDEX IF NOT EXISTS idx_character_states_book ON character_states(world_book_id);
CREATE INDEX IF NOT EXISTS idx_daily_checkin_records_book ON daily_checkin_records(world_book_id);
CREATE INDEX IF NOT EXISTS idx_daily_checkin_month_stats_book ON daily_checkin_month_stats(world_book_id);
CREATE INDEX IF NOT EXISTS idx_schedules_book ON character_schedules(world_book_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON character_schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_task_board_world ON task_board(world_book_id);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_execution_history(task_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_fridge_items_remaining ON fridge_items(remaining);
CREATE INDEX IF NOT EXISTS idx_fridge_purchases_date ON fridge_purchases(date);

-- ============================================================
-- 房间模拟（handheld-xx-room-simulation）
-- ============================================================
CREATE TABLE IF NOT EXISTS room_sim_states (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  state_data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(world_book_id, character_id)
);

CREATE TABLE IF NOT EXISTS room_sim_furniture_library (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  furniture_data TEXT NOT NULL,
  name TEXT NOT NULL,
  width INTEGER NOT NULL DEFAULT 1,
  height INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(world_book_id, character_id, id)
);

CREATE TABLE IF NOT EXISTS room_sim_pawn_sprites (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  pawn_id TEXT NOT NULL,
  sprite_front TEXT DEFAULT '',
  sprite_back TEXT DEFAULT '',
  sprite_left TEXT DEFAULT '',
  sprite_right TEXT DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(world_book_id, character_id, pawn_id)
);

CREATE INDEX IF NOT EXISTS idx_room_sim_states_book ON room_sim_states(world_book_id);
CREATE INDEX IF NOT EXISTS idx_room_sim_furniture_book ON room_sim_furniture_library(world_book_id);
CREATE INDEX IF NOT EXISTS idx_room_sim_sprites_book ON room_sim_pawn_sprites(world_book_id);
`

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
 * 执行查询，返回行数组
 */
export async function query(sql, values = []) {
  const conn = getDB()
  const result = await conn.query(sql, values)
  return result.values || []
}

/**
 * 批量执行 SQL 语句集合，使用 executeSet 在单次 Native 调用中完成
 * executeSet 内部自动包装事务，避免 Android 端多次桥接导致事务上下文丢失
 * @param {Array<{statement: string, values?: Array}>} statements
 */
export async function batchExecute(statements) {
  const conn = getDB()
  await conn.executeSet(statements, true)
}

/**
 * 在事务中执行一组操作（基于 executeSet）
 * 回调函数应收集 {statement, values} 对象并返回数组
 * @param {(Array) => Array} fn — 接收 statements 数组，返回修改后的数组
 */
export async function transaction(fn) {
  const statements = []
  const result = fn(statements)
  if (statements.length > 0) {
    await batchExecute(statements)
  }
  return result
}

/**
 * 建表（启动时调用）
 */
export async function createTables() {
  const conn = getDB()
  await conn.execute(CREATE_TABLES_SQL)
  await conn.execute(CREATE_INDEXES_SQL)

  // 迁移：为 reader_stories 表添加 source_type 字段
  try {
    const tableInfo = await query('PRAGMA table_info(reader_stories)')
    const columns = tableInfo.map(r => r.name)
    if (!columns.includes('source_type')) {
      await exec(`ALTER TABLE reader_stories ADD COLUMN source_type TEXT NOT NULL DEFAULT 'llm'`)
    }
    if (!columns.includes('worldview')) {
      await exec(`ALTER TABLE reader_stories ADD COLUMN worldview TEXT NOT NULL DEFAULT ''`)
    }
  } catch (e) {
    console.warn('[DB] Migration for reader_stories source_type failed:', e.message)
  }

  // 迁移：为 world_book_config 表添加默认背景字段
  try {
    // 检查列是否存在
    const tableInfo = await query('PRAGMA table_info(world_book_config)')
    const columns = tableInfo.map(r => r.name)

    if (!columns.includes('default_background_path')) {
      await exec('ALTER TABLE world_book_config ADD COLUMN default_background_path TEXT DEFAULT ""')
    }
    if (!columns.includes('default_background_name')) {
      await exec('ALTER TABLE world_book_config ADD COLUMN default_background_name TEXT DEFAULT "默认背景"')
    }
  } catch (e) {
    console.warn('[DB] Migration for world_book_config failed:', e.message)
  }
}
