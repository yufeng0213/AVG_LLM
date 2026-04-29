/**
 * app_config 表仓库 — 统一 KV 操作
 */
import { isSQLiteAvailable, query, exec } from '../connection.js'

export const appConfigRepo = {
  async get(key, defaultValue = null) {
    if (!isSQLiteAvailable()) return defaultValue
    try {
      const rows = await query('SELECT value FROM app_config WHERE key = ?', [key])
      if (rows.length === 0) return defaultValue
      try { return JSON.parse(rows[0].value) } catch { return defaultValue }
    } catch {
      return defaultValue
    }
  },

  async set(key, value) {
    if (!isSQLiteAvailable()) return
    await exec(
      'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)',
      [key, JSON.stringify(value)]
    )
  },

  async remove(key) {
    if (!isSQLiteAvailable()) return
    await exec('DELETE FROM app_config WHERE key = ?', [key])
  },
}
