/**
 * 存储清理迁移：清除 localStorage 中累积的 base64 图片数据
 * 这些图片已迁移到 Capacitor Filesystem，localStorage 中只需保留元数据
 *
 * 解决 Android OOM 问题：Capacitor Bridge 在 JS→Native 传递数据时
 * 会复制整个 localStorage 内容，base64 图片导致内存爆炸
 */

import { isNative } from '../utils/platform.js'

const AVATAR_KEY = 'dormitory:avatars'
const FRAME_KEY = 'dormitory:avatarFrames'
const BACKGROUND_KEY = 'mobile_background_assets'

/**
 * 清理单个 localStorage key 中的 base64 数据
 * 保留元数据（id、name、createdAt 等），移除 dataUrl
 */
function cleanKey(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { cleaned: false, reason: 'no data' }

    const data = JSON.parse(raw)
    let changed = false

    if (storageKey === AVATAR_KEY) {
      // 清理头像：移除每个头像的 dataUrl
      if (data.avatars && Array.isArray(data.avatars)) {
        for (const avatar of data.avatars) {
          if (avatar.dataUrl && typeof avatar.dataUrl === 'string' && avatar.dataUrl.startsWith('data:')) {
            delete avatar.dataUrl
            changed = true
          }
        }
      }
      // 移除 activeAvatarDataUrl（原生环境不需要，通过文件系统重新加载）
      if (data.activeAvatarDataUrl && data.activeAvatarDataUrl.startsWith('data:')) {
        delete data.activeAvatarDataUrl
        changed = true
      }
    } else if (storageKey === FRAME_KEY) {
      // 清理头像框：移除每个框的 dataUrl
      if (data.frames && Array.isArray(data.frames)) {
        for (const frame of data.frames) {
          if (frame.dataUrl && typeof frame.dataUrl === 'string' && frame.dataUrl.startsWith('data:')) {
            delete frame.dataUrl
            changed = true
          }
        }
      }
    } else if (storageKey === BACKGROUND_KEY) {
      // 清理背景图片：移除 path 中的 dataUrl
      if (data.files && Array.isArray(data.files)) {
        for (const file of data.files) {
          if (file.path && typeof file.path === 'string' && file.path.startsWith('data:')) {
            // 用文件 ID 作为路径标识，实际图片从文件系统读取
            file.path = file.id ? `file:${file.id}` : ''
            changed = true
          }
        }
      }
    }

    if (changed) {
      localStorage.setItem(storageKey, JSON.stringify(data))
      return { cleaned: true }
    }

    return { cleaned: false, reason: 'no base64 data' }
  } catch (e) {
    console.warn(`[StorageMigration] Failed to clean ${storageKey}:`, e)
    return { cleaned: false, error: e.message }
  }
}

/**
 * 执行存储清理迁移
 * 应在应用启动早期调用（在任何 Capacitor 操作之前）
 */
export function runStorageMigration() {
  if (!isNative()) {
    console.log('[StorageMigration] Not native environment, skipping')
    return { ok: true, skipped: true }
  }

  try {
    const results = {
      ok: true,
      avatars: cleanKey(AVATAR_KEY),
      frames: cleanKey(FRAME_KEY),
      backgrounds: cleanKey(BACKGROUND_KEY),
    }

    const cleanedCount = [results.avatars, results.frames, results.backgrounds]
      .filter(r => r.cleaned).length

    if (cleanedCount > 0) {
      console.log(`[StorageMigration] Cleaned ${cleanedCount} storage keys`)
      // 标记迁移已完成，避免每次启动都检查
      localStorage.setItem('avg_llm_storage_migration_v2_done', 'done')
    } else {
      // 没有旧数据，直接标记
      localStorage.setItem('avg_llm_storage_migration_v2_done', 'done')
      console.log('[StorageMigration] No legacy base64 data found')
    }

    return results
  } catch (e) {
    console.error('[StorageMigration] Migration failed:', e)
    return { ok: false, error: e.message }
  }
}
