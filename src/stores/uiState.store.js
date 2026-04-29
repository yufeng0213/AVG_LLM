/**
 * UI 路由、弹窗、缩放状态
 * 从 App.vue 的 30+ 个 ref 提取
 */

import { defineStore } from 'pinia'
import { getPlatform, isAndroid, isMobileDevice } from '../utils/platform.js'
import { loadWorldBooks, getActiveWorldBookTags, getActiveWorldBookId, setActiveWorldBookId } from '../worldbook/worldBookStore.js'
import { getMainStorySaveSlot, loadGame } from '../save/saveManager.js'
import { setActiveNarratorId, getActiveNarratorId } from '../narrator/narratorStore.js'

const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080
const ANDROID_DESIGN_WIDTH = 1080
const ANDROID_DESIGN_HEIGHT = 1920

const FULLSCREEN_SCREENS = new Set([
  'world-memory', 'world-map', 'dreams', 'timeline', 'evolution-log',
  'game', 'face-to-face', 'trpg',
])

export const useUiState = defineStore('uiState', {
  state: () => ({
    // 导航
    currentScreen: 'world-hub',
    activeWorldBookId: 'default_world_book',
    activeNarratorId: null,
    editingWorldBookId: '',
    // 存档数据
    loadedSaveData: null,
    // 弹窗/面板
    isMailboxOpen: false,
    isCheckInOpen: false,
    isCheckIn7Open: false,
    isAvatarSettingsOpen: false,
    showMainStorySelector: false,
    showDebugBaseBuilding: false,
    // UI
    uiScale: 1,
    containerStyle: {},
    isMusicPlayerOpen: true,
    // 临时数据
    mainStoryBooks: [],
    mainStoryLoading: false,
  }),

  getters: {
    isFullScreen: (s) => FULLSCREEN_SCREENS.has(s.currentScreen),
    isAndroidPlatform: () => isAndroid(),
    platform: () => getPlatform(),
    isMobile: () => isMobileDevice(),
  },

  actions: {
    // === 导航 ===

    navigateTo(screen) {
      const next = String(screen || '').trim()
      if (!next || next === 'mascot') return
      this.currentScreen = next
    },

    openWorldBookEditor(bookId) {
      this.editingWorldBookId = String(bookId || '')
      this.currentScreen = 'worldbook-editor'
    },

    async openNewGame(payload) {
      const worldBookId = typeof payload === 'object' && payload
        ? payload.worldBookId
        : payload
      const narratorId = typeof payload === 'object' && payload
        ? payload.narratorId
        : undefined

      this.loadedSaveData = null
      await this.setActiveWorldBook(worldBookId || 'default_world_book')
      // 只有明确传入了 narratorId 才覆盖，否则保留全局激活的叙事者
      if (narratorId !== undefined) {
        await this.setActiveNarrator(narratorId)
      }
      this.currentScreen = 'game'
    },

    async openMainStory(payload) {
      if (payload?.worldBookId) {
        const targetWorldBookId = payload.worldBookId

        // 进入主线前从 SQLite 重载（NarratorManagerScreen 直接写 SQLite，不走 Pinia）
        await this.loadActiveNarratorId()
        const activeId = this.activeNarratorId || null
        console.log('[UiState] openMainStory === START ===')
        console.log('[UiState] openMainStory - activeNarratorId from SQLite:', activeId)
        console.log('[UiState] openMainStory - worldBookId:', targetWorldBookId)

        const slotId = await getMainStorySaveSlot(targetWorldBookId)
        console.log('[UiState] openMainStory - slotId:', slotId || 'none')

        if (slotId) {
          const result = await loadGame(slotId)
          if (result?.success && result.data) {
            const saveWorldBookId = result.data.game?.worldBookId
            const saveNarratorId = result.data.game?.narratorId
            console.log('[UiState] openMainStory - save found, saveNarratorId:', saveNarratorId || 'none')
            if (saveWorldBookId !== targetWorldBookId) {
              console.warn(`[MainStory] 存档 worldBookId(${saveWorldBookId}) 与请求(${targetWorldBookId}) 不一致`)
              this.loadedSaveData = null
              await this.setActiveWorldBook(targetWorldBookId)
              if (activeId) {
                console.log('[UiState] openMainStory - using active narrator (wb mismatch):', activeId)
                await this.setActiveNarrator(activeId)
              }
              this.currentScreen = 'game'
              return
            }
            // 有存档：加载存档数据，但叙事者用用户当前激活的（不用存档里的旧值）
            this.loadedSaveData = result.data
            await this.setActiveWorldBook(targetWorldBookId)
            if (activeId) {
              console.log('[UiState] openMainStory - using active narrator (ignoring save narrator):', activeId)
              await this.setActiveNarrator(activeId)
            } else {
              // 用户没有激活自定义叙事者，才用存档里的
              if (saveNarratorId) {
                console.log('[UiState] openMainStory - no active, using save narrator:', saveNarratorId)
                await this.setActiveNarrator(saveNarratorId)
              } else {
                console.log('[UiState] openMainStory - using DEFAULT narrator (no active, no save narrator)')
              }
            }
            this.currentScreen = 'game'
            return
          }
        }
        // 无存档
        this.loadedSaveData = null
        await this.setActiveWorldBook(targetWorldBookId)
        if (activeId) {
          console.log('[UiState] openMainStory (no save) - using active narrator:', activeId)
          await this.setActiveNarrator(activeId)
        } else {
          console.log('[UiState] openMainStory (no save) - using DEFAULT narrator (no active)')
        }
        this.currentScreen = 'game'
        return
      }

      this.mainStoryLoading = true
      this.showMainStorySelector = true
      try {
        this.mainStoryBooks = await loadWorldBooks()
      } catch (e) {
        console.error('Failed to load world books for main story:', e)
      } finally {
        this.mainStoryLoading = false
      }
    },

    closeMainStorySelector() {
      this.showMainStorySelector = false
    },

    async selectMainStoryBook(book) {
      this.closeMainStorySelector()
      const targetWorldBookId = book.id
      const narratorId = book.defaultNarratorId || null
      const slotId = await getMainStorySaveSlot(targetWorldBookId)
      if (slotId) {
        const result = await loadGame(slotId)
        if (result?.success && result.data) {
          const saveWorldBookId = result.data.game?.worldBookId
          if (saveWorldBookId !== targetWorldBookId) {
            this.loadedSaveData = null
            await this.setActiveWorldBook(targetWorldBookId)
            if (narratorId) {
              await this.setActiveNarrator(narratorId)
            }
            this.currentScreen = 'game'
            return
          }
          this.loadedSaveData = result.data
          await this.setActiveWorldBook(targetWorldBookId)
          const saveNarratorId = result.data.game?.narratorId
          if (saveNarratorId) {
            await this.setActiveNarrator(saveNarratorId)
          } else if (narratorId) {
            await this.setActiveNarrator(narratorId)
          }
          this.currentScreen = 'game'
          return
        }
      }
      // 无存档
      this.loadedSaveData = null
      await this.setActiveWorldBook(targetWorldBookId)
      if (narratorId) {
        await this.setActiveNarrator(narratorId)
      }
      this.currentScreen = 'game'
    },

    async openWorldBookEditor(bookId) {
      await this.setActiveWorldBook(bookId || 'default_world_book')
      this.currentScreen = 'worldbook-editor'
    },

    backToWorldBookShelf() {
      this.currentScreen = 'worldbook-shelf'
    },

    backToStart() {
      this.currentScreen = 'start'
    },

    backToWorldHub() {
      this.currentScreen = 'world-hub'
    },

    // === 面板 ===

    openMailbox() { this.isMailboxOpen = true },
    closeMailbox() { this.isMailboxOpen = false },
    openCheckIn() { this.isCheckInOpen = true },
    closeCheckIn() { this.isCheckInOpen = false },
    openCheckIn7() { this.isCheckIn7Open = true },
    closeCheckIn7() { this.isCheckIn7Open = false },
    openAvatarSettings() { this.isAvatarSettingsOpen = true },
    closeAvatarSettings() { this.isAvatarSettingsOpen = false },
    openDebugBaseBuilding() { this.showDebugBaseBuilding = true },
    closeDebugBaseBuilding() { this.showDebugBaseBuilding = false },

    // === UI 配置 ===

    updateUiScale() {
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight

      if (this.isAndroidPlatform) {
        const widthBasedScale = windowWidth / ANDROID_DESIGN_WIDTH
        this.uiScale = Math.max(0.3, Math.min(0.6, Number(widthBasedScale.toFixed(3))))
        this.containerStyle = {
          width: '100vw',
          minHeight: '100vh',
        }
      } else {
        const widthScale = windowWidth / DESIGN_WIDTH
        const heightScale = windowHeight / DESIGN_HEIGHT
        const nextScale = Math.min(widthScale, heightScale)
        this.uiScale = Math.max(0.67, Math.min(1.5, Number(nextScale.toFixed(3))))
        this.containerStyle = {}
      }
    },

    // === 数据加载 ===

    async loadActiveWorldBookTags() {
      try {
        // 这个数据需要由调用者处理，这里只提供工具方法
        return await getActiveWorldBookTags()
      } catch (e) {
        console.error('[UiState] Failed to load active world book tags:', e)
        return []
      }
    },

    async loadActiveWorldBookId() {
      try {
        const bookId = await getActiveWorldBookId()
        this.activeWorldBookId = bookId
      } catch (e) {
        console.error('[UiState] Failed to load active world book ID:', e)
        this.activeWorldBookId = 'default_world_book'
      }
    },

    /**
     * 设置并持久化叙事者ID
     * @param {string|null} narratorId
     */
    async setActiveNarrator(narratorId) {
      console.log('[UiState] setActiveNarrator called with:', narratorId || '(empty)')
      this.activeNarratorId = narratorId || null
      await setActiveNarratorId(narratorId || '')
      console.log('[UiState] setActiveNarrator - Pinia set to:', this.activeNarratorId)
    },

    /**
     * 设置并持久化世界书ID
     * @param {string} worldBookId
     */
    async setActiveWorldBook(worldBookId) {
      const id = worldBookId || 'default_world_book'
      console.log('[UiState] setActiveWorldBook called with:', id)
      this.activeWorldBookId = id
      await setActiveWorldBookId(id)
      console.log('[UiState] setActiveWorldBook - persisted to SQLite')
    },

    /**
     * 启动时加载上次选择的叙事者ID
     */
    async loadActiveNarratorId() {
      try {
        const id = await getActiveNarratorId()
        console.log('[UiState] loadActiveNarratorId - raw value from storage:', id || '(empty)')
        this.activeNarratorId = id || null
        console.log('[UiState] loadActiveNarratorId - Pinia set to:', this.activeNarratorId)
      } catch (e) {
        console.error('[UiState] Failed to load active narrator ID:', e)
      }
    },
  },

  // 不持久化：路由状态应该每次从默认值开始
  persist: false,
})
