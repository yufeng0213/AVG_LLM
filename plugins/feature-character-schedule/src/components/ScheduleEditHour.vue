/**
 * ScheduleEditHour.vue — 编辑单个日程小时
 */
<template>
  <div v-if="visible" class="edit-hour-overlay" @click.self="close">
    <div class="edit-hour-modal">
      <div class="edit-header">
        <h3>编辑时段 — {{ padHour(hour) }}:00</h3>
        <button class="edit-close-btn" @click="close">✕</button>
      </div>

      <div class="edit-form">
        <label class="edit-label">活动类型</label>
        <select v-model="form.activityType" class="edit-select">
          <option v-for="opt in activityOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>

        <label class="edit-label">描述</label>
        <textarea v-model="form.description" class="edit-textarea" rows="3" placeholder="简要描述活动..."></textarea>

        <label class="edit-label">地点名称</label>
        <input v-model="form.locationName" class="edit-input" placeholder="如：家里、学校、公园..." />

        <label class="edit-label">是否锁定（不可被打扰）</label>
        <div class="edit-toggle">
          <button type="button" :class="{ active: form.isLocked }" @click="form.isLocked = !form.isLocked">
            {{ form.isLocked ? '是' : '否' }}
          </button>
        </div>
      </div>

      <div class="edit-actions">
        <button class="edit-cancel-btn" @click="close">取消</button>
        <button class="edit-save-btn" @click="save" :disabled="!form.activityType">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { SCHEDULE_ACTIVITY_TYPES } from '../composables/useCharacterSchedule.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  hour: { type: Number, default: 0 },
  existing: { type: Object, default: null },
})

const emit = defineEmits(['close', 'save'])

const activityOptions = Object.entries(SCHEDULE_ACTIVITY_TYPES).map(([type, def]) => ({ value: type, label: def.label }))

const form = reactive({
  activityType: props.existing?.plannedActivity?.activityType || '',
  description: props.existing?.plannedActivity?.description || '',
  locationName: props.existing?.plannedActivity?.locationName || '',
  isLocked: props.existing?.plannedActivity?.isLocked || false,
})

function close() {
  emit('close')
}

function save() {
  emit('save', {
    hour: props.hour,
    activityType: form.activityType,
    description: form.description,
    locationName: form.locationName,
    isLocked: form.isLocked,
  })
}

function padHour(h) {
  return h.toString().padStart(2, '0')
}
</script>

<style scoped>
.edit-hour-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.edit-hour-modal {
  background: #1c1c1e;
  border-radius: 16px;
  width: min(400px, 90vw);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 20px;
}

.edit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.edit-header h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}
.edit-close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 8px;
}

.edit-select,
.edit-input,
.edit-textarea {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  padding: 8px 12px;
  font-size: 14px;
}
.edit-textarea {
  resize: vertical;
  font-family: inherit;
}

.edit-toggle button {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  padding: 6px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.edit-toggle button.active {
  background: rgba(100, 180, 255, 0.2);
  border-color: rgba(100, 180, 255, 0.5);
}

.edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.edit-cancel-btn,
.edit-save-btn {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  cursor: pointer;
}
.edit-cancel-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.edit-save-btn {
  background: rgba(100, 180, 255, 0.3);
  color: #fff;
}
.edit-save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
