<script setup>
/**
 * 约定设定模态框组件
 * 显示时间选择器、快捷按钮、已有约定列表
 */
import { computed, ref } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  character: {
    type: Object,
    default: null
  },
  existingAppointments: {
    type: Array,
    default: () => []
  },
  isCreating: {
    type: Boolean,
    default: false
  },
  feedback: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'close',
  'create',
  'cancel'
])

const selectedDateTime = ref('')

// 格式化已有约定的时间
function formatAppointmentTime(timestamp) {
  if (!timestamp) return ''
  const ts = Number(timestamp)
  if (Number.isNaN(ts)) return ''
  const date = new Date(ts)
  const now = new Date()
  const diff = date - now

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (diff <= 0) return '已过期'
  if (days > 0) return `${days} 天 ${hours} 小时后`
  if (hours > 0) return `${hours} 小时后`
  const mins = Math.floor(diff / (1000 * 60))
  return `${mins} 分钟后`
}

function formatAbsoluteTime(timestamp) {
  if (!timestamp) return ''
  const ts = Number(timestamp)
  if (Number.isNaN(ts)) return ''
  const date = new Date(ts)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function handleClose() {
  emit('close')
}

function handleQuickSelect(minutes) {
  const date = new Date(Date.now() + minutes * 60 * 1000)
  selectedDateTime.value = toLocalISOString(date)
}

function toLocalISOString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function handleCreate() {
  if (!selectedDateTime.value) return
  const date = new Date(selectedDateTime.value)
  if (isNaN(date.getTime()) || date.getTime() <= Date.now()) return
  emit('create', { scheduledAt: date.getTime() })
}

function handleCancel(appointmentId) {
  emit('cancel', appointmentId)
}

const safeExistingAppointments = computed(() => {
  const arr = props.existingAppointments
  return Array.isArray(arr) ? arr.filter(Boolean) : []
})

const canCreate = computed(() => {
  if (!selectedDateTime.value) return false
  const date = new Date(selectedDateTime.value)
  return !isNaN(date.getTime()) && date.getTime() > Date.now()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="appointment-modal">
      <div v-if="isOpen" class="appointment-overlay" @click.self="handleClose">
        <section class="appointment-panel">
          <header class="appointment-header">
            <h2 class="appointment-title">📝 设定约定</h2>
            <button type="button" class="appointment-close-btn" @click="handleClose">×</button>
          </header>

          <div class="appointment-body">
            <!-- 角色信息 -->
            <div class="appointment-character">
              <span class="character-icon">{{ character?.raw?.icon || character?.raw?.emoji || '👤' }}</span>
              <span class="character-name">{{ character?.label || '未选择角色' }}</span>
            </div>

            <!-- 时间选择器 -->
            <div class="appointment-time-section">
              <label class="time-label">选择约定时间</label>
              <input
                type="datetime-local"
                v-model="selectedDateTime"
                class="time-input"
                :min="toLocalISOString(new Date(Date.now() + 60000))"
              />
            </div>

            <!-- 快捷按钮 -->
            <div class="quick-buttons">
              <button type="button" class="quick-btn" @click="handleQuickSelect(30)">
                ⏰ 30 分钟后
              </button>
              <button type="button" class="quick-btn" @click="handleQuickSelect(60)">
                ⏰ 1 小时后
              </button>
              <button type="button" class="quick-btn" @click="handleQuickSelect(60 * 24)">
                ⏰ 明天同一时间
              </button>
            </div>

            <!-- 已有约定列表 -->
            <div v-if="safeExistingAppointments.length > 0" class="appointment-list">
              <h3 class="appointment-list-title">已有的约定</h3>
              <div
                v-for="appt in safeExistingAppointments"
                :key="appt.id"
                class="appointment-item"
              >
                <div class="appointment-item-info">
                  <span class="appointment-item-time">{{ formatAbsoluteTime(appt.scheduledAt) }}</span>
                  <span class="appointment-item-countdown">{{ formatAppointmentTime(appt.scheduledAt) }}</span>
                </div>
                <button
                  type="button"
                  class="appointment-cancel-btn"
                  @click="handleCancel(appt.id)"
                >
                  取消
                </button>
              </div>
            </div>
          </div>

          <!-- 底部操作 -->
          <footer class="appointment-footer">
            <p v-if="feedback" class="appointment-feedback">{{ feedback }}</p>
            <div class="appointment-footer-actions">
              <button type="button" class="appointment-cancel" @click="handleClose">取消</button>
              <button
                type="button"
                class="appointment-confirm"
                :disabled="!canCreate || isCreating"
                @click="handleCreate"
              >
                {{ isCreating ? '生成中...' : '创建约定' }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.appointment-modal-enter-active,
.appointment-modal-leave-active {
  transition: opacity 0.3s ease;
}

.appointment-modal-enter-from,
.appointment-modal-leave-to {
  opacity: 0;
}

.appointment-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--background, #0a0a0a);
  color: var(--foreground, #ffffff);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.appointment-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.appointment-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.appointment-title {
  margin: 0;
  font-size: 18px;
  color: var(--foreground, #ffffff);
}

.appointment-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  padding: 4px 8px;
  margin-left: auto;
}
  .platform-android.android-portrait .appointment-close-btn  {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }
.appointment-close-btn:hover {
  color: var(--foreground, #ffffff);
}

.appointment-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 角色信息 */
.appointment-character {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  margin-bottom: 20px;
}

.character-icon {
  font-size: 2rem;
}

.character-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--foreground, #ffffff);
}

/* 时间选择器 */
.appointment-time-section {
  margin-bottom: 16px;
}

.time-label {
  display: block;
  font-size: 0.85rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 60%, transparent);
  margin-bottom: 8px;
}

.time-input {
  width: 100%;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: var(--foreground, #ffffff);
  font-size: 0.95rem;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.time-input:focus {
  outline: none;
  border-color: var(--accent-cyan, #00d4ff);
}

/* 快捷按钮 */
.quick-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.quick-btn {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: var(--foreground, #ffffff);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.quick-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.14);
}

.quick-btn:active {
  transform: scale(0.98);
}

/* 约定列表 */
.appointment-list {
  margin-top: 8px;
}

.appointment-list-title {
  margin: 0 0 10px;
  font-size: 0.9rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--foreground, #ffffff) 60%, transparent);
}

.appointment-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  margin-bottom: 6px;
}

.appointment-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.appointment-item-time {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--foreground, #ffffff);
}

.appointment-item-countdown {
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--accent-cyan, #00d4ff) 80%, transparent);
}

.appointment-cancel-btn {
  padding: 6px 14px;
  background: rgba(231, 76, 60, 0.15);
  border: 1px solid rgba(231, 76, 60, 0.25);
  border-radius: 8px;
  color: #e74c3c;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
  .platform-android.android-portrait .appointment-cancel-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }
.appointment-cancel-btn:hover {
  background: rgba(231, 76, 60, 0.25);
  border-color: rgba(231, 76, 60, 0.4);
}

/* 底部操作 */
.appointment-footer {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.appointment-feedback {
  margin: 0 0 10px;
  font-size: 0.8rem;
  color: var(--accent-cyan, #00d4ff);
  text-align: center;
}

.appointment-footer-actions {
  display: flex;
  gap: 10px;
}

.appointment-cancel {
  flex: 1;
  padding: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}
  .platform-android.android-portrait .appointment-cancel {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }

.appointment-cancel:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--foreground, #ffffff);
}

.appointment-confirm {
  flex: 1;
  padding: 12px;
  background: linear-gradient(
    135deg,
    rgba(0, 212, 255, 0.25) 0%,
    rgba(0, 150, 255, 0.15) 100%
  );
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 10px;
  color: var(--accent-cyan, #00d4ff);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
  .platform-android.android-portrait .appointment-confirm {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }
.appointment-confirm:hover:not(:disabled) {
  background: linear-gradient(
    135deg,
    rgba(0, 212, 255, 0.35) 0%,
    rgba(0, 150, 255, 0.2) 100%
  );
  border-color: rgba(0, 212, 255, 0.5);
}

.appointment-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
