/**
 * 活动入口状态
 * 替换原 src/features/useActivityEntry.js
 */

import { defineStore } from 'pinia'
import { isSQLiteAvailable, query } from '../db/connection.js'
import { loadCoverFile } from '../features/activityCover.js'

const ACTIVITIES_BASE = '/data/activities'

export const useActivityEntry = defineStore('activityEntry', {
  state: () => ({
    enabledCover: null,
    pendingActivityId: null,
    loaded: false,
  }),

  actions: {
    async load() {
      if (this.loaded) return this.enabledCover

      let enabledId
      if (isSQLiteAvailable()) {
        const rows = await query('SELECT activity_id FROM activity_enabled LIMIT 1')
        enabledId = rows[0]?.activity_id || null
      } else {
        const { kvStorage } = await import('../storage/index.js')
        enabledId = await kvStorage.get('avg_llm_enabled_activity_v1')
      }

      if (!enabledId || typeof enabledId !== 'string') {
        this.enabledCover = null
        this.loaded = true
        return this.enabledCover
      }

      // 内置活动
      try {
        const res = await fetch(`${ACTIVITIES_BASE}/${enabledId}/activity.json`)
        if (res.ok && !isHtmlResponse(res)) {
          const meta = await res.json()
          this.enabledCover = {
            id: enabledId,
            name: meta.name || enabledId,
            coverImage: meta.coverImage || null,
            coverGradient: meta.coverGradient || null,
            bannerIcon: meta.bannerIcon || '🎮',
          }
          this.loaded = true
          return this.enabledCover
        }
      } catch { /* ignore */ }

      // 内置活动兜底
      if (enabledId === 'summer_festival' || enabledId === 'summer_festival_2026') {
        this.enabledCover = {
          id: enabledId, name: '夏日祭限定活动',
          coverImage: null, coverGradient: ['#ff6b6b', '#feca57', '#ff9ff3'],
          bannerIcon: '🎆',
        }
        this.loaded = true
        return this.enabledCover
      }

      // 导入活动
      try {
        let imported
        if (isSQLiteAvailable()) {
          const rows = await query('SELECT activity_data FROM activity_imported')
          imported = rows.map(r => JSON.parse(r.activity_data))
        } else {
          const { kvStorage } = await import('../storage/index.js')
          imported = await kvStorage.get('avg_llm_imported_activities_v1')
        }
        if (Array.isArray(imported)) {
          const imp = imported.find(i => i.id === enabledId)
          if (imp && imp.json) {
            const coverUrl = imp.json.coverImage || await loadCoverFile(enabledId)
            this.enabledCover = {
              id: enabledId, name: imp.json.name || enabledId,
              coverImage: coverUrl,
              coverGradient: imp.json.coverGradient || null,
              bannerIcon: imp.json.bannerIcon || '📦',
            }
            this.loaded = true
            return this.enabledCover
          }
        }
      } catch { /* ignore */ }

      this.enabledCover = null
      this.loaded = true
      return this.enabledCover
    },

    reset() {
      this.loaded = false
      this.enabledCover = null
    },

    requestOpenActivity(activityId = null) {
      this.pendingActivityId = activityId
    },

    consumePendingActivityId() {
      const id = this.pendingActivityId
      if (id) this.pendingActivityId = null
      return id
    },
  },
})

function isHtmlResponse(res) {
  const ct = res.headers.get('content-type') || ''
  return ct.includes('text/html')
}
