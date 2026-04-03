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

<style scoped>
.save-load-screen {
  position: relative;
  width: 100%;
  min-height: calc(100vh - clamp(40px, 8vw, 110px));
  padding: clamp(22px, 4vw, 48px);
  border: 8px solid var(--accent-cyan);
  border-radius: 34px 22px 38px 18px;
  background: color-mix(in srgb, var(--muted) 82%, transparent);
  backdrop-filter: blur(8px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: clamp(16px, 2vw, 28px);
  box-shadow:
    0 0 30px color-mix(in srgb, var(--accent-magenta) 58%, transparent),
    12px 12px 0 var(--accent-yellow),
    24px 24px 0 var(--accent-magenta),
    36px 36px 0 var(--accent-cyan);
}

.screen-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: clamp(12px, 1.5vw, 20px);
  border-bottom: 2px dashed var(--accent-cyan);
}

.screen-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  font-weight: 700;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.title-icon {
  font-size: clamp(2rem, 3.5vw, 2.8rem);
}

.title-text {
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-magenta));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: 2px solid var(--accent-orange);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-orange) 15%, transparent);
  color: var(--accent-orange);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-button:hover:not(:disabled) {
  background: var(--accent-orange);
  color: var(--bg);
  transform: translateX(-4px);
}

.back-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.back-icon {
  font-size: 1.2rem;
}

.tab-switcher {
  display: flex;
  gap: 12px;
  padding: 8px;
  background: color-mix(in srgb, var(--bg) 50%, transparent);
  border-radius: 12px;
  border: 2px solid var(--border);
}

.tab-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: 2px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-cyan) 10%, transparent);
  color: var(--text);
}

.tab-button.active {
  background: var(--accent-cyan);
  color: var(--bg);
  border-color: var(--accent-cyan);
}

.tab-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tab-icon {
  font-size: 1.2rem;
}

.tab-count {
  padding: 2px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--bg) 30%, transparent);
  font-size: 0.85rem;
  font-weight: 600;
}

.tab-button.active .tab-count {
  background: color-mix(in srgb, var(--bg) 50%, transparent);
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 2px solid var(--accent-orange);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-orange) 15%, transparent);
  color: var(--accent-orange);
}

.error-icon {
  font-size: 1.2rem;
}

.error-text {
  font-size: 0.95rem;
  font-weight: 500;
}

.slot-list-container {
  flex: 1;
  min-height: 300px;
  position: relative;
  overflow-y: auto;
  padding: 8px;
  border: 2px dashed var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg) 30%, transparent);
}

.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100%;
  min-height: 200px;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--border);
  border-top-color: var(--accent-cyan);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 1rem;
  color: var(--muted-foreground);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100%;
  min-height: 200px;
}

.empty-icon {
  font-size: 4rem;
  opacity: 0.6;
}

.empty-text {
  font-size: 1.1rem;
  color: var(--muted-foreground);
  text-align: center;
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 8px;
}

.slot-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg) 50%, transparent);
  cursor: pointer;
  transition: all 0.2s ease;
}

.slot-card:hover {
  border-color: var(--accent-cyan);
  background: color-mix(in srgb, var(--accent-cyan) 10%, transparent);
  transform: translateY(-4px);
}

.slot-card.selected {
  border-color: var(--accent-magenta);
  background: color-mix(in srgb, var(--accent-magenta) 15%, transparent);
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent-magenta) 30%, transparent);
}

.slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.slot-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
}

.slot-time {
  font-size: 0.85rem;
  color: var(--muted-foreground);
  white-space: nowrap;
}

.slot-body {
  flex: 1;
}

.slot-description {
  font-size: 0.9rem;
  color: var(--muted-foreground);
  line-height: 1.4;
}

.slot-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 2px solid transparent;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-button.load {
  background: var(--accent-cyan);
  color: var(--bg);
}

.action-button.load:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-cyan) 80%, var(--accent-magenta));
  transform: scale(1.05);
}

.action-button.delete {
  background: transparent;
  border-color: var(--accent-orange);
  color: var(--accent-orange);
}

.action-button.delete:hover:not(:disabled) {
  background: var(--accent-orange);
  color: var(--bg);
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-icon {
  font-size: 1rem;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg) 80%, transparent);
  backdrop-filter: blur(4px);
  z-index: 1000;
}

.confirm-dialog {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 32px;
  border: 4px solid var(--accent-orange);
  border-radius: 16px;
  background: var(--bg);
  max-width: 400px;
  box-shadow: 0 0 40px color-mix(in srgb, var(--accent-orange) 40%, transparent);
}

.dialog-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--accent-orange);
}

.dialog-icon {
  font-size: 1.6rem;
}

.dialog-message {
  font-size: 1rem;
  color: var(--text);
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.dialog-button {
  padding: 10px 24px;
  border: 2px solid transparent;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dialog-button.cancel {
  background: transparent;
  border-color: var(--border);
  color: var(--muted-foreground);
}

.dialog-button.cancel:hover {
  border-color: var(--text);
  color: var(--text);
}

.dialog-button.confirm {
  background: var(--accent-orange);
  color: var(--bg);
}

.dialog-button.confirm:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-orange) 80%, var(--accent-magenta));
}

.dialog-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.screen-footer {
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}

.footer-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--muted-foreground);
}

.tip-icon {
  font-size: 1rem;
}

@media (max-width: 768px) {
  .slot-grid {
    grid-template-columns: 1fr;
  }

  .tab-button {
    padding: 8px 16px;
    font-size: 0.9rem;
  }

  .tab-label {
    display: none;
  }

  .screen-title {
    font-size: 1.4rem;
  }
}
</style>