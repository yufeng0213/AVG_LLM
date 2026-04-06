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
} from '../save/saveManager'

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
  // 确保 type 是 'saves' 或 'backups'，转换为 'save' 或 'backup'
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
        // 重新加载存档列表以确保数据同步
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
        // 重新加载备份列表以确保数据同步
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

// 获取存档/备份的显示名称
const getSlotName = (slot) => {
  if (activeTab.value === 'saves') {
    return slot.metadata?.chapter || '未知章节'
  }
  return slot.name || '未命名备份'
}

// 获取存档/备份的描述
const getSlotDescription = (slot) => {
  if (activeTab.value === 'saves') {
    const preview = slot.metadata?.preview || '无预览'
    const playTime = slot.metadata?.playTime || 0
    return `${preview.substring(0, 30)}... | 游戏时长: ${formatPlayTime(playTime)}`
  }
  return `包含 ${slot.messageCount || 0} 条历史消息`
}
</script>

<template>
  <main class="save-load-screen">
    <!-- 标题区域 -->
    <header class="screen-header">
      <h1 class="screen-title">
        <span class="title-icon">💾</span>
        <span class="title-text">存档管理</span>
      </h1>
      <button class="back-button" @click="handleBack" :disabled="isLoading">
        <span class="back-icon">←</span>
        <span class="back-text">返回</span>
      </button>
    </header>

    <!-- 标签页切换 -->
    <div class="tab-switcher">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'saves' }"
        @click="switchTab('saves')"
        :disabled="isLoading"
      >
        <span class="tab-icon">📁</span>
        <span class="tab-label">游戏存档</span>
        <span class="tab-count">{{ saves.length }}</span>
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'backups' }"
        @click="switchTab('backups')"
        :disabled="isLoading"
      >
        <span class="tab-icon">📦</span>
        <span class="tab-label">历史备份</span>
        <span class="tab-count">{{ backups.length }}</span>
      </button>
    </div>

    <!-- 错误提示 -->
    <div v-if="loadError" class="error-message">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{{ loadError }}</span>
    </div>

    <!-- 存档/备份列表 -->
    <section class="slot-list-container">
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p class="loading-text">加载中...</p>
      </div>

      <div v-else-if="!hasItems" class="empty-state">
        <div class="empty-icon">
          {{ activeTab === 'saves' ? '📭' : '📭' }}
        </div>
        <p class="empty-text">
          {{ activeTab === 'saves' ? '暂无存档，开始新游戏吧！' : '暂无历史备份' }}
        </p>
      </div>

      <div v-else class="slot-grid">
        <div
          v-for="slot in currentList"
          :key="slot.id"
          class="slot-card"
          :class="{ selected: selectedSlot?.id === slot.id }"
          @click="selectSlot(slot)"
        >
          <div class="slot-header">
            <span class="slot-name">{{ getSlotName(slot) }}</span>
            <span class="slot-time">{{ formatTimestamp(slot.timestamp) }}</span>
          </div>
          <div class="slot-body">
            <p class="slot-description">{{ getSlotDescription(slot) }}</p>
          </div>
          <div class="slot-actions">
            <button
              class="action-button load"
              @click.stop="activeTab === 'saves' ? handleLoadSave(slot.id) : handleLoadBackup(slot.id)"
              :disabled="isLoading"
            >
              <span class="action-icon">▶</span>
              <span class="action-text">加载</span>
            </button>
            <button
              class="action-button delete"
              @click.stop="showDeleteDialog(activeTab, slot.id)"
              :disabled="isLoading"
            >
              <span class="action-icon">🗑</span>
              <span class="action-text">删除</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 删除确认对话框 -->
    <div v-if="showDeleteConfirm" class="dialog-overlay">
      <div class="confirm-dialog">
        <h2 class="dialog-title">
          <span class="dialog-icon">⚠️</span>
          确认删除
        </h2>
        <p class="dialog-message">
          {{ deleteTarget?.type === 'save' ? '确定要删除此存档吗？此操作不可撤销。' : '确定要删除此备份吗？此操作不可撤销。' }}
        </p>
        <div class="dialog-actions">
          <button class="dialog-button cancel" @click="cancelDelete">
            取消
          </button>
          <button class="dialog-button confirm" @click="confirmDelete" :disabled="isLoading">
            确认删除
          </button>
        </div>
      </div>
    </div>

    <!-- 底部信息 -->
    <footer class="screen-footer">
      <p class="footer-tip">
        <span class="tip-icon">💡</span>
        点击存档卡片可查看详情，点击"加载"按钮可继续游戏进度
      </p>
    </footer>
  </main>
</template>

<style scoped src="./SaveLoadScreen.css"></style>
