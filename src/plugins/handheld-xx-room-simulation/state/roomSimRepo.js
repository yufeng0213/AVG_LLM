/**
 * 房间模拟 SQLite 存储层
 */
import { exec, query, transaction, batchExecute, isSQLiteAvailable } from '../../../db/connection.js'

const TABLE_NAME_STATES = 'room_sim_states'
const TABLE_NAME_FURNITURE = 'room_sim_furniture_library'
const TABLE_NAME_SPRITES = 'room_sim_pawn_sprites'

// 建表 SQL（会在 connection.js 的 createTables 中统一执行）
export const ROOM_SIM_CREATE_TABLES_SQL = `
-- 房间模拟状态（每个角色一个房间）
CREATE TABLE IF NOT EXISTS ${TABLE_NAME_STATES} (
  id TEXT PRIMARY KEY,
  world_book_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  state_data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(world_book_id, character_id)
);

-- 自定义家具库（每个角色的家具模板）
CREATE TABLE IF NOT EXISTS ${TABLE_NAME_FURNITURE} (
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

-- 小人精灵（每个角色的自定义精灵）
CREATE TABLE IF NOT EXISTS ${TABLE_NAME_SPRITES} (
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

CREATE INDEX IF NOT EXISTS idx_room_sim_states_book ON ${TABLE_NAME_STATES}(world_book_id);
CREATE INDEX IF NOT EXISTS idx_room_sim_furniture_book ON ${TABLE_NAME_FURNITURE}(world_book_id);
CREATE INDEX IF NOT EXISTS idx_room_sim_sprites_book ON ${TABLE_NAME_SPRITES}(world_book_id);
`

/**
 * 保存房间状态
 */
export async function saveRoomState(worldBookId, characterId, stateData) {
  if (!isSQLiteAvailable()) return false

  const id = `${worldBookId}-${characterId}`
  const updatedAt = new Date().toISOString()
  const stateJson = JSON.stringify(stateData)

  try {
    await exec(
      `INSERT OR REPLACE INTO ${TABLE_NAME_STATES} (id, world_book_id, character_id, state_data, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, worldBookId, characterId, stateJson, updatedAt]
    )
    return true
  } catch (e) {
    console.error('[roomSimRepo] saveRoomState error:', e)
    return false
  }
}

/**
 * 加载房间状态
 */
export async function loadRoomState(worldBookId, characterId) {
  if (!isSQLiteAvailable()) return null

  try {
    const rows = await query(
      `SELECT state_data FROM ${TABLE_NAME_STATES} WHERE world_book_id = ? AND character_id = ?`,
      [worldBookId, characterId]
    )
    if (rows.length > 0) {
      return JSON.parse(rows[0].state_data)
    }
    return null
  } catch (e) {
    console.error('[roomSimRepo] loadRoomState error:', e)
    return null
  }
}

/**
 * 保存自定义家具到家具库
 */
export async function saveFurnitureToLibrary(worldBookId, characterId, furniture) {
  if (!isSQLiteAvailable()) return false

  const createdAt = new Date().toISOString()
  const furnitureJson = JSON.stringify(furniture)

  try {
    await exec(
      `INSERT OR REPLACE INTO ${TABLE_NAME_FURNITURE} (id, world_book_id, character_id, furniture_data, name, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [furniture.id, worldBookId, characterId, furnitureJson, furniture.name, furniture.width || 1, furniture.height || 1, createdAt]
    )
    return true
  } catch (e) {
    console.error('[roomSimRepo] saveFurnitureToLibrary error:', e)
    return false
  }
}

/**
 * 批量保存家具库
 */
export async function saveFurnitureLibrary(worldBookId, characterId, furnitureList) {
  if (!isSQLiteAvailable() || !furnitureList.length) return false

  const createdAt = new Date().toISOString()
  const statements = furnitureList.map(f => ({
    statement: `INSERT OR REPLACE INTO ${TABLE_NAME_FURNITURE} (id, world_book_id, character_id, furniture_data, name, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [f.id, worldBookId, characterId, JSON.stringify(f), f.name, f.width || 1, f.height || 1, createdAt]
  }))

  try {
    await batchExecute(statements)
    return true
  } catch (e) {
    console.error('[roomSimRepo] saveFurnitureLibrary error:', e)
    return false
  }
}

/**
 * 加载家具库（按角色）
 */
export async function loadFurnitureLibrary(worldBookId, characterId) {
  if (!isSQLiteAvailable()) return []

  try {
    const rows = await query(
      `SELECT furniture_data FROM ${TABLE_NAME_FURNITURE} WHERE world_book_id = ? AND character_id = ?`,
      [worldBookId, characterId]
    )
    return rows.map(r => JSON.parse(r.furniture_data))
  } catch (e) {
    console.error('[roomSimRepo] loadFurnitureLibrary error:', e)
    return []
  }
}

// 世界书级别家具库的特殊 characterId
const WORLD_BOOK_FURNITURE_KEY = '__world_book__'

/**
 * 保存世界书级别家具库（所有角色共享）
 */
export async function saveWorldBookFurnitureLibrary(worldBookId, furnitureList) {
  if (!isSQLiteAvailable() || !furnitureList.length) return false

  // 先清除旧数据
  try {
    await exec(
      `DELETE FROM ${TABLE_NAME_FURNITURE} WHERE world_book_id = ? AND character_id = ?`,
      [worldBookId, WORLD_BOOK_FURNITURE_KEY]
    )
  } catch (e) {
    console.error('[roomSimRepo] clear old furniture library error:', e)
  }

  const createdAt = new Date().toISOString()
  const statements = furnitureList.map(f => ({
    statement: `INSERT INTO ${TABLE_NAME_FURNITURE} (id, world_book_id, character_id, furniture_data, name, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [f.id, worldBookId, WORLD_BOOK_FURNITURE_KEY, JSON.stringify(f), f.name, f.width || 1, f.height || 1, createdAt]
  }))

  try {
    await batchExecute(statements)
    console.log('[roomSimRepo] Saved world book furniture library:', worldBookId, 'count:', furnitureList.length)
    return true
  } catch (e) {
    console.error('[roomSimRepo] saveWorldBookFurnitureLibrary error:', e)
    return false
  }
}

/**
 * 加载世界书级别家具库（所有角色共享）
 */
export async function loadWorldBookFurnitureLibrary(worldBookId) {
  if (!isSQLiteAvailable()) return []

  try {
    const rows = await query(
      `SELECT furniture_data FROM ${TABLE_NAME_FURNITURE} WHERE world_book_id = ? AND character_id = ?`,
      [worldBookId, WORLD_BOOK_FURNITURE_KEY]
    )
    console.log('[roomSimRepo] Loaded world book furniture library:', worldBookId, 'count:', rows.length)
    return rows.map(r => JSON.parse(r.furniture_data))
  } catch (e) {
    console.error('[roomSimRepo] loadWorldBookFurnitureLibrary error:', e)
    return []
  }
}

/**
 * 删除家具库中的家具
 */
export async function deleteFurnitureFromLibrary(worldBookId, characterId, furnitureId) {
  if (!isSQLiteAvailable()) return false

  try {
    await exec(
      `DELETE FROM ${TABLE_NAME_FURNITURE} WHERE world_book_id = ? AND character_id = ? AND id = ?`,
      [worldBookId, characterId, furnitureId]
    )
    return true
  } catch (e) {
    console.error('[roomSimRepo] deleteFurnitureFromLibrary error:', e)
    return false
  }
}

/**
 * 保存小人精灵
 */
export async function savePawnSprites(worldBookId, characterId, pawnId, sprites) {
  if (!isSQLiteAvailable()) return false

  const updatedAt = new Date().toISOString()

  try {
    await exec(
      `INSERT OR REPLACE INTO ${TABLE_NAME_SPRITES} (id, world_book_id, character_id, pawn_id, sprite_front, sprite_back, sprite_left, sprite_right, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`${worldBookId}-${characterId}-${pawnId}`, worldBookId, characterId, pawnId,
       sprites.front || '', sprites.back || '', sprites.left || '', sprites.right || '', updatedAt]
    )
    return true
  } catch (e) {
    console.error('[roomSimRepo] savePawnSprites error:', e)
    return false
  }
}

/**
 * 加载小人精灵
 */
export async function loadPawnSprites(worldBookId, characterId, pawnId) {
  if (!isSQLiteAvailable()) return null

  try {
    const rows = await query(
      `SELECT sprite_front, sprite_back, sprite_left, sprite_right FROM ${TABLE_NAME_SPRITES} WHERE world_book_id = ? AND character_id = ? AND pawn_id = ?`,
      [worldBookId, characterId, pawnId]
    )
    if (rows.length > 0) {
      return {
        front: rows[0].sprite_front,
        back: rows[0].sprite_back,
        left: rows[0].sprite_left,
        right: rows[0].sprite_right,
      }
    }
    return null
  } catch (e) {
    console.error('[roomSimRepo] loadPawnSprites error:', e)
    return null
  }
}

/**
 * 加载角色的所有小人精灵
 */
export async function loadAllPawnSprites(worldBookId, characterId) {
  if (!isSQLiteAvailable()) return {}

  try {
    const rows = await query(
      `SELECT pawn_id, sprite_front, sprite_back, sprite_left, sprite_right FROM ${TABLE_NAME_SPRITES} WHERE world_book_id = ? AND character_id = ?`,
      [worldBookId, characterId]
    )
    const result = {}
    for (const row of rows) {
      result[row.pawn_id] = {
        front: row.sprite_front,
        back: row.sprite_back,
        left: row.sprite_left,
        right: row.sprite_right,
      }
    }
    return result
  } catch (e) {
    console.error('[roomSimRepo] loadAllPawnSprites error:', e)
    return {}
  }
}

/**
 * 清除角色的所有房间模拟数据
 */
export async function clearRoomSimData(worldBookId, characterId) {
  if (!isSQLiteAvailable()) return false

  try {
    await exec(`DELETE FROM ${TABLE_NAME_STATES} WHERE world_book_id = ? AND character_id = ?`, [worldBookId, characterId])
    await exec(`DELETE FROM ${TABLE_NAME_FURNITURE} WHERE world_book_id = ? AND character_id = ?`, [worldBookId, characterId])
    await exec(`DELETE FROM ${TABLE_NAME_SPRITES} WHERE world_book_id = ? AND character_id = ?`, [worldBookId, characterId])
    return true
  } catch (e) {
    console.error('[roomSimRepo] clearRoomSimData error:', e)
    return false
  }
}

/**
 * 检查 SQLite 是否可用
 */
export function isRoomSimSQLiteAvailable() {
  return isSQLiteAvailable()
}