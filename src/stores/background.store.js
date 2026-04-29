/**
 * 背景状态管理 — Pinia Store
 * 替换原 src/background/backgroundStore.js
 * 文件操作委托给 src/background/fileOps.js
 */

import { defineStore } from 'pinia'
import { isSQLiteAvailable } from '../db/connection.js'
import { appConfigRepo } from '../db/repos/appConfig.repo.js'
import { kvStorage } from '../storage/index.js'
import {
  isNative,
  isElectronEnv,
  isDataImageUrl,
  isImageFile,
  isHttpImageUrl,
  findBackgroundFile,
  findDefaultBackground,
  loadBackgroundFileUrl,
  importFilesToNative,
  importFilesAsDataUrls,
  normalizeWorldBookBackgroundAsset,
  normalizeBackgroundEntry,
} from '../background/fileOps.js'

const MOBILE_BACKGROUND_STORAGE_KEY = 'mobile_background_assets'
const DEFAULT_BACKGROUND = null

export const useBackgroundStore = defineStore('background', {
  state: () => ({
    backgroundFolderPath: null,
    backgroundList: [],
    currentScene: null,
    currentBackgroundUrl: null,
  }),

  getters: {
    backgroundStyle: (s) => {
      if (!s.currentBackgroundUrl) return {}
      return {
        backgroundImage: `url(${s.currentBackgroundUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    },
  },

  actions: {
    createEmptyScene() {
      return { id: `scene_${Date.now()}`, name: '', background: '', description: '' }
    },

    normalizeScene(rawScene) {
      if (!rawScene || typeof rawScene !== 'object') return null
      return {
        id: String(rawScene.id || `scene_${Date.now()}`),
        name: String(rawScene.name || ''),
        background: String(rawScene.background || ''),
        description: String(rawScene.description || ''),
      }
    },

    normalizeScenes(rawScenes) {
      if (!Array.isArray(rawScenes)) return []
      return rawScenes.map(this.normalizeScene).filter(Boolean)
    },

    async loadBackgroundFiles(files, sourceLabel = '移动端背景导入') {
      if (!Array.isArray(files) || files.length === 0) {
        return { success: false, canceled: true, error: 'NO_FILES' }
      }
      const imageFiles = files.filter(isImageFile)
      if (imageFiles.length === 0) {
        return { success: false, error: 'NO_IMAGE_FILES' }
      }

      const idCounter = new Map()
      const loadedFiles = isNative()
        ? await importFilesToNative(imageFiles, idCounter)
        : await importFilesAsDataUrls(imageFiles, idCounter)

      this.backgroundFolderPath = String(sourceLabel || '移动端背景导入')
      this.backgroundList = loadedFiles
      await this._loadDefaultBackground()
      await this._saveMobileBackgrounds()

      return { success: true, path: this.backgroundFolderPath, files: loadedFiles }
    },

    async applyWorldBookBackgroundAssets(assets, sourceLabel = '世界书背景') {
      if (!Array.isArray(assets) || assets.length === 0) {
        return { success: false, error: 'NO_WORLD_BOOK_BACKGROUND_ASSETS' }
      }

      const normalized = assets
        .map((item, index) => normalizeWorldBookBackgroundAsset(item, index))
        .filter(Boolean)

      if (normalized.length === 0) {
        return { success: false, error: 'INVALID_WORLD_BOOK_BACKGROUND_ASSETS' }
      }

      this.backgroundFolderPath = String(sourceLabel || '世界书背景')
      this.backgroundList = normalized
      await this._loadDefaultBackground()

      return { success: true, path: this.backgroundFolderPath, files: normalized }
    },

    async loadBackgroundFolder(folderPath = null) {
      if (!isElectronEnv()) {
        const restored = await this._restoreMobileBackgrounds()
        if (restored.success) return restored
        console.warn('背景 API 不可用，且未找到移动端已导入背景')
        return { success: false, error: 'NOT_ELECTRON_ENV' }
      }

      try {
        const result = await window.avgLLM.background.scanFolder(folderPath)
        if (result.success) {
          this.backgroundFolderPath = result.path
          this.backgroundList = result.files.map(file => ({
            id: `bg_${file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
            name: file.name,
            path: file.path,
            label: file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
          }))
          await this._loadDefaultBackground()
        }
        return result
      } catch (error) {
        console.error('加载背景文件夹失败:', error)
        return { success: false, error: error.message }
      }
    },

    async switchBackground(scene) {
      if (!scene?.background) {
        await this._loadDefaultBackground()
        this.currentScene = null
        return { success: true }
      }

      const backgroundFile = findBackgroundFile(this.backgroundList, scene.background)
      if (!backgroundFile) {
        console.warn(`背景文件未找到: ${scene.background}，尝试使用默认背景`)
        await this._loadDefaultBackground()
        this.currentScene = scene
        return { success: false, error: 'BACKGROUND_NOT_FOUND' }
      }

      const url = await loadBackgroundFileUrl(backgroundFile, backgroundCache)
      if (url) {
        this.currentBackgroundUrl = url
        this.currentScene = scene
        return { success: true }
      }

      await this._loadDefaultBackground()
      return { success: false, error: '读取背景失败' }
    },

    clearBackgroundCache() {
      backgroundCache.clear()
    },

    // === 内部方法 ===

    async _saveMobileBackgrounds() {
      try {
        const files = this.backgroundList
          .map((item, index) => normalizeBackgroundEntry(item, index))
          .filter(Boolean)
          .map((item) => {
            const isDataUrl = isDataImageUrl(item.path)
            return {
              id: item.id, name: item.name,
              path: isNative() && isDataUrl ? `file:${item.id}` : item.path,
              label: item.label,
            }
          })

        const payload = {
          path: String(this.backgroundFolderPath || '移动端背景导入'),
          files, updatedAt: new Date().toISOString(),
        }

        if (isSQLiteAvailable()) {
          await appConfigRepo.set(MOBILE_BACKGROUND_STORAGE_KEY, payload)
        } else {
          await kvStorage.set(MOBILE_BACKGROUND_STORAGE_KEY, payload)
        }
      } catch (error) {
        console.warn('保存移动端背景列表失败:', error)
      }
    },

    async _restoreMobileBackgrounds() {
      try {
        let saved
        if (isSQLiteAvailable()) {
          saved = await appConfigRepo.get(MOBILE_BACKGROUND_STORAGE_KEY)
        } else {
          saved = await kvStorage.get(MOBILE_BACKGROUND_STORAGE_KEY)
        }
        if (!saved || !Array.isArray(saved.files) || saved.files.length === 0) {
          return { success: false, error: 'NO_MOBILE_BACKGROUNDS' }
        }

        const normalized = saved.files
          .map((item, index) => normalizeBackgroundEntry(item, index))
          .filter(Boolean)

        if (normalized.length === 0) {
          return { success: false, error: 'INVALID_MOBILE_BACKGROUNDS' }
        }

        this.backgroundFolderPath = String(saved.path || '移动端背景导入')
        this.backgroundList = normalized
        await this._loadDefaultBackground()

        return { success: true, path: this.backgroundFolderPath, files: normalized }
      } catch (error) {
        console.warn('恢复移动端背景列表失败:', error)
        return { success: false, error: error?.message || 'RESTORE_MOBILE_BACKGROUNDS_FAILED' }
      }
    },

    async _loadDefaultBackground() {
      const defaultFile = findDefaultBackground(this.backgroundList)
      if (!defaultFile) {
        this.currentBackgroundUrl = DEFAULT_BACKGROUND
        return
      }

      const url = await loadBackgroundFileUrl(defaultFile, backgroundCache)
      if (url) {
        this.currentBackgroundUrl = url
      } else {
        this.currentBackgroundUrl = DEFAULT_BACKGROUND
      }
    },
  },
})

// 背景图片缓存（非响应式，作为 actions 内部使用）
const backgroundCache = new Map()
