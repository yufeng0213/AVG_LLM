<script setup>
/**
 * SmsCalendarModal.vue — 日历事件预览弹窗（浅色主题）
 */
const props = defineProps({
  pendingEvent: { type: Object, default: null },
  importing: { type: Boolean, default: false },
})

const emit = defineEmits(['dismiss', 'import'])
</script>

<template>
  <div v-if="pendingEvent" class="calendar-modal-overlay" @click.self="emit('dismiss')">
    <div class="calendar-modal">
      <div class="calendar-modal-header">
        <span class="calendar-modal-icon">&#128198;</span>
        <h3 class="calendar-modal-title">检测到日程</h3>
      </div>
      <div class="calendar-modal-body">
        <div class="calendar-event-field">
          <span class="calendar-event-label">日期</span>
          <span class="calendar-event-value">{{ pendingEvent.date }}{{ pendingEvent.time ? ' ' + pendingEvent.time : '' }}</span>
        </div>
        <div class="calendar-event-field">
          <span class="calendar-event-label">标题</span>
          <span class="calendar-event-value">{{ pendingEvent.title }}</span>
        </div>
        <div v-if="pendingEvent.description" class="calendar-event-field">
          <span class="calendar-event-label">描述</span>
          <span class="calendar-event-value">{{ pendingEvent.description }}</span>
        </div>
        <div class="calendar-event-field">
          <span class="calendar-event-label">来源</span>
          <span class="calendar-event-value">{{ pendingEvent.contactName }}</span>
        </div>
      </div>
      <div class="calendar-modal-footer">
        <button class="calendar-modal-btn calendar-modal-btn-dismiss" @click="emit('dismiss')">
          稍后再说
        </button>
        <button class="calendar-modal-btn calendar-modal-btn-import" :disabled="importing" @click="emit('import')">
          {{ importing ? '导入中...' : '导入日历' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calendar-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.calendar-modal {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 20px 20px 0 0;
  padding-bottom: env(safe-area-inset-bottom, 16px);
  animation: slideUp 0.3s ease;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.1);
}

.calendar-modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 20px 12px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
}

.calendar-modal-icon {
  font-size: 1.5rem;
}

.calendar-modal-title {
  margin: 0;
  font-size: 1.1rem;
  color: #222;
  font-weight: 600;
}

.calendar-modal-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.calendar-event-field {
  display: flex;
  gap: 8px;
  font-size: 0.9rem;
}

.calendar-event-label {
  color: #999;
  min-width: 40px;
}

.calendar-event-value {
  color: #333;
  flex: 1;
}

.calendar-modal-footer {
  display: flex;
  gap: 12px;
  padding: 12px 20px 20px;
}

.calendar-modal-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.calendar-modal-btn:disabled {
  opacity: 0.5;
}

.calendar-modal-btn-dismiss {
  background: #f5f5f5;
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #555;
}

.calendar-modal-btn-import {
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
  color: #fff;
  box-shadow: 0 2px 8px rgba(255, 143, 171, 0.3);
}

.platform-android.android-portrait .calendar-modal {
  background: #fff !important;
}

.platform-android.android-portrait .calendar-modal-btn-dismiss {
  background: #f5f5f5 !important;
}

.platform-android.android-portrait .calendar-modal-btn-import {
  background: linear-gradient(135deg, #ff8fab, #fb6f92) !important;
}
</style>
