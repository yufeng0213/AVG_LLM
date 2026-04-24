/**
 * ScheduleAddEvent.vue — 添加新日程事件
 */
<template>
  <div v-if="visible" class="add-event-overlay" @click.self="close">
    <div class="add-event-modal">
      <div class="add-header">
        <h3>添加日程</h3>
        <button class="add-close-btn" @click="close">✕</button>
      </div>

      <div class="add-form">
        <label class="add-label">小时 (0-23)</label>
        <input v-model.number="form.hour" type="number" min="0" max="23" class="add-input" />

        <label class="add-label">活动类型</label>
        <select v-model="form.activityType" class="add-select">
          <option value="">选择类型...</option>
          <option v-for="opt in activityOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>

        <label class="add-label">描述</label>
        <textarea v-model="form.description" class="add-textarea" rows="3" placeholder="简要描述活动..."></textarea>

        <label class="add-label">地点名称</label>
        <input v-model="form.locationName" class="add-input" placeholder="如：家里、学校、公园..." />
      </div>

      <div class="add-actions">
        <button class="add-cancel-btn" @click="close">取消</button>
        <button class="add-save-btn" @click="save" :disabled="!form.activityType || form.hour == null">添加</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { SCHEDULE_ACTIVITY_TYPES } from '../composables/useCharacterSchedule.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'save'])

const activityOptions = Object.entries(SCHEDULE_ACTIVITY_TYPES).map(([type, def]) => ({ value: type, label: def.label }))

const form = reactive({
  hour: null,
  activityType: '',
  description: '',
  locationName: '',
})

function close() {
  form.hour = null
  form.activityType = ''
  form.description = ''
  form.locationName = ''
  emit('close')
}

function save() {
  emit('save', { ...form })
  close()
}
</script>

<style scoped>
.add-event-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.add-event-modal {
  background: #1c1c1e;
  border-radius: 16px;
  width: min(400px, 90vw);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 20px;
}

.add-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.add-header h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}
.add-close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
}

.add-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.add-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 8px;
}

.add-select,
.add-input,
.add-textarea {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  padding: 8px 12px;
  font-size: 14px;
}
.add-textarea {
  resize: vertical;
  font-family: inherit;
}

.add-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.add-cancel-btn,
.add-save-btn {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  cursor: pointer;
}
.add-cancel-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.add-save-btn {
  background: rgba(100, 255, 180, 0.3);
  color: #fff;
}
.add-save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}


  .platform-android.android-portrait .add-close-btn,
  .platform-android.android-portrait .add-cancel-btn,
  .platform-android.android-portrait .add-save-btn {
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
</style>
