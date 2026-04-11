<script setup>
import { onMounted, ref, computed } from 'vue'
import {
  getSaveList,
  loadGame,
  deleteSave,
  getBackupList,
  loadBackup,
  deleteBackup,
  formatTimestamp,
  formatPlayTime,
} from '../../../src/save/saveManager'
import { isAndroid } from '../../../src/utils/platform.js'

const emit = defineEmits(['back', 'load-save', 'load-backup'])

// 存档列表
const saves = ref([])
const backups = ref([])
const isLoading = ref(false)
const activeTab = ref('saves') // 'saves' | 'backups'
const selectedSlot = ref(null)
const showDeleteConfirm = ref(false)
const deleteTarget = ref(null) // { type: 'save' | 'backup', id: string }
const loadError = ref(null)
const isAndroidPlatform = isAndroid()

// 加载存档列表
const loadSaveList = async () => {
  isLoading.value = true
  try {
    saves.value = await getSaveList()
  } catch (error) {
    console.error('加载存档列表失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 加载备份列表
const loadBackupList = async () => {
  isLoading.value = true
  try {
    backups.value = await getBackupList()
  } catch (error) {
    console.error('加载备份列表失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 初始化加载
onMounted(async () => {
  await loadSaveList()
  await loadBackupList()
})

// 切换标签页
const switchTab = (tab) => {
  activeTab.value = tab
  selectedSlot.value = null
  loadError.value = null
}

// 选择存档/备份
const selectSlot = (slot) => {
  selectedSlot.value = slot
  loadError.value = null
}

// 加载存档
const handleLoadSave = async (saveId) => {
  isLoading.value = true
  loadError.value = null
  
  try {
    const result = await loadGame(saveId)
    if (result.success) {
      emit('load-save', result.data)
    } else {
      loadError.value = result.error || '加载存档失败'
    }
  } catch (error) {
    loadError.value = error.message || '加载存档失败'
  } finally {
    isLoading.value = false
  }
}

// 加载备份
const handleLoadBackup = async (backupId) => {
  isLoading.value = true
  loadError.value = null
  
  try {
    const result = await loadBackup(backupId)
    if (result.success) {
      emit('load-backup', result.data)
    } else {
      loadError.value = result.error || '加载备份失败'
    }
  } catch (error) {
    loadError.value = error.message || '加载备份失败'
  } finally {
    isLoading.value = false
  }
}

// 显示删除确认
const showDeleteDialog = (type, id) => {
  const normalizedType = type === 'saves' ? 'save' : type === 'backups' ? 'backup' : type
  deleteTarget.value = { type: normalizedType, id }
  showDeleteConfirm.value = true
}

// 确认删除
const confirmDelete = async () => {
  if (!deleteTarget.value) return
  
  isLoading.value = true
  loadError.value = null
  
  try {
    if (deleteTarget.value.type === 'save') {
      const result = await deleteSave(deleteTarget.value.id)
      if (result.success) {
        await loadSaveList()
        if (selectedSlot.value?.id === deleteTarget.value.id) {
          selectedSlot.value = null
        }
      } else {
        loadError.value = result.error || '删除存档失败'
      }
    } else {
      const result = await deleteBackup(deleteTarget.value.id)
      if (result.success) {
        await loadBackupList()
        if (selectedSlot.value?.id === deleteTarget.value.id) {
          selectedSlot.value = null
        }
      } else {
        loadError.value = result.error || '删除备份失败'
      }
    }
  } catch (error) {
    console.error('删除失败:', error)
    loadError.value = error.message || '删除失败'
  } finally {
    isLoading.value = false
    showDeleteConfirm.value = false
    deleteTarget.value = null
  }
}

// 取消删除
const cancelDelete = () => {
  showDeleteConfirm.value = false
  deleteTarget.value = null
}

// 返回主菜单
const handleBack = () => {
  emit('back')
}

// 当前显示的列表
const currentList = computed(() => {
  return activeTab.value === 'saves' ? saves.value : backups.value
})

// 是否有存档/备份
const hasItems = computed(() => {
  return activeTab.value === 'saves' ? saves.value.length > 0 : backups.value.length > 0
})

const DEFAULT_QUICK_SAVE_SLOT_ID = 'save_quick_default'

// 获取存档/备份的显示名称
const getSlotName = (slot) => {
  if (activeTab.value === 'saves') {
    return slot.metadata?.chapter || '未知章节'
  }
  return slot.name || '未命名备份'
}

const getSlotTypeLabel = (slot) => {
  if (activeTab.value === 'saves') {
    return slot?.id === DEFAULT_QUICK_SAVE_SLOT_ID ? '快速存档' : '手动存档'
  }
  return '历史备份'
}

const getSlotPreview = (slot) => {
  if (activeTab.value === 'saves') {
    const preview = String(slot?.metadata?.preview || '').trim()
    return preview || '该存档暂无剧情预览'
  }
  const messageCount = Number(slot?.messageCount || 0)
  return `包含 ${messageCount} 条历史消息记录`
}

const getSlotMetaInfo = (slot) => {
  if (activeTab.value === 'saves') {
    const playTime = Number(slot?.metadata?.playTime || 0)
    return `游戏时长：${formatPlayTime(playTime)}`
  }
  const messageCount = Number(slot?.messageCount || 0)
  return `消息条数：${messageCount}`
}
</script>

<template>
  <main class="save-load-screen" :class="{ 'platform-android': isAndroidPlatform, 'android-portrait': isAndroidPlatform }">
    <!-- 顶部标题区域 -->
    <header class="screen-header">
      <div class="header-left">
        <button class="back-button" @click="handleBack" :disabled="isLoading">
          <span class="back-icon">←</span>
        </button>
        <h1 class="screen-title">存档管理</h1>
      </div>
    </header>

    <!-- 标签页切换 -->
    <nav class="tab-switcher" aria-label="存档类型切换">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'saves' }"
        @click="switchTab('saves')"
        :disabled="isLoading"
      >
        <span class="tab-label">游戏存档</span>
        <span class="tab-count">{{ saves.length }}</span>
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'backups' }"
        @click="switchTab('backups')"
        :disabled="isLoading"
      >
        <span class="tab-label">历史备份</span>
        <span class="tab-count">{{ backups.length }}</span>
      </button>
    </nav>

    <!-- 错误提示 -->
    <div v-if="loadError" class="error-message" role="alert">
      <span class="error-text">{{ loadError }}</span>
      <button class="error-dismiss" @click="loadError = null">×</button>
    </div>

    <!-- 存档/备份列表 -->
    <section class="slot-list-container">
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p class="loading-text">加载中...</p>
      </div>

      <div v-else-if="!hasItems" class="empty-state">
        <p class="empty-text">
          {{ activeTab === 'saves' ? '暂无存档，开始新游戏吧！' : '暂无历史备份' }}
        </p>
      </div>

      <div v-else class="slot-list">
        <button
          v-for="slot in currentList"
          :key="slot.id"
          type="button"
          class="slot-item"
          :class="{
            selected: selectedSlot?.id === slot.id,
            'is-quick-save': activeTab === 'saves' && slot.id === DEFAULT_QUICK_SAVE_SLOT_ID,
          }"
          @click="selectSlot(slot)"
        >
          <div class="slot-info">
            <div class="slot-header">
              <span class="slot-type">{{ getSlotTypeLabel(slot) }}</span>
              <span class="slot-time">{{ formatTimestamp(slot.timestamp) }}</span>
            </div>
            <h3 class="slot-name">{{ getSlotName(slot) }}</h3>
            <p class="slot-preview">{{ getSlotPreview(slot) }}</p>
          </div>
          <div class="slot-actions">
            <button
              type="button"
              class="slot-action-btn load"
              @click.stop="activeTab === 'saves' ? handleLoadSave(slot.id) : handleLoadBackup(slot.id)"
              :disabled="isLoading"
            >
              加载
            </button>
            <button
              type="button"
              class="slot-action-btn delete"
              @click.stop="showDeleteDialog(activeTab, slot.id)"
              :disabled="isLoading"
            >
              删除
            </button>
          </div>
        </button>
      </div>
    </section>

    <!-- 删除确认对话框 -->
    <div v-if="showDeleteConfirm" class="dialog-overlay" @click.self="cancelDelete">
      <div class="confirm-dialog">
        <h3 class="dialog-title">确认删除</h3>
        <p class="dialog-message">
          {{ deleteTarget?.type === 'save' ? '确定要删除此存档吗？此操作不可撤销。' : '确定要删除此备份吗？此操作不可撤销。' }}
        </p>
        <div class="dialog-actions">
          <button type="button" class="dialog-btn cancel" @click="cancelDelete">取消</button>
          <button type="button" class="dialog-btn confirm" @click="confirmDelete" :disabled="isLoading">确认删除</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped src="./SaveLoadScreen.css"></style>
