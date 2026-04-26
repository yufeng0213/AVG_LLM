<script setup>
import { ref } from 'vue'

const props = defineProps({
  events: { type: Array, default: () => [] },
  eventLog: { type: Array, default: () => [] },
})

const emit = defineEmits(['resolve', 'close'])

const activeEventId = ref(null)
const showLog = ref(false)

function handleResolve(eventId, optionId) {
  emit('resolve', eventId, optionId)
  activeEventId.value = null
}

function toggleLog() {
  showLog.value = !showLog.value
}
</script>

<template>
  <div class="event-panel">
    <div class="event-header">
      <span>基地事件</span>
      <button class="log-toggle" @click="toggleLog">
        {{ showLog ? '当前事件' : '历史记录' }}
      </button>
    </div>

    <!-- Active events -->
    <div v-if="!showLog" class="event-list">
      <div v-if="events.length === 0" class="event-empty">
        <p>暂无事件</p>
        <p class="empty-hint">事件会在基地运行过程中随机触发</p>
      </div>
      <div v-for="event in events" :key="event.id" class="event-card">
        <div class="event-type-badge" :class="`type-${event.type}`">
          {{ event.type }}
        </div>
        <div class="event-title">{{ event.title }}</div>
        <div class="event-desc">{{ event.description }}</div>

        <div v-if="activeEventId === event.id" class="event-options">
          <div v-for="option in event.options" :key="option.id" class="event-option">
            <div class="option-cost">
              <template v-if="option.cost && Object.keys(option.cost).length > 0">
                消耗: {{ Object.entries(option.cost).map(([k, v]) => `${k}×${v}`).join(', ') }}
              </template>
              <span v-else>无消耗</span>
            </div>
            <button class="option-btn" @click="handleResolve(event.id, option.id)">
              {{ option.text }}
            </button>
            <div class="option-outcome">{{ option.outcome }}</div>
          </div>
          <button class="option-close" @click="activeEventId = null">收起</button>
        </div>
        <button v-else class="event-action" @click="activeEventId = event.id">
          查看选项
        </button>
      </div>
    </div>

    <!-- Event log -->
    <div v-else class="event-log">
      <div v-if="eventLog.length === 0" class="event-empty">
        暂无历史记录
      </div>
      <div v-for="(entry, i) in [...eventLog].reverse()" :key="i" class="log-entry">
        <div class="log-title">{{ entry.title }}</div>
        <div class="log-outcome">{{ entry.outcome }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.event-panel {
  padding: 4px 0;
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 12px;
}

.log-toggle {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 4px 8px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  cursor: pointer;
}

.event-list,
.event-log {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.event-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
  padding: 30px 0;
}

.empty-hint {
  font-size: 11px;
  margin-top: 4px;
}

.event-card {
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.event-type-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  margin-bottom: 6px;
}

.type-袭击 { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
.type-难民 { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
.type-发现 { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.type-灾害 { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
.type-内乱 { background: rgba(168, 85, 247, 0.2); color: #a855f7; }

.event-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.event-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
  line-height: 1.5;
}

.event-action {
  width: 100%;
  padding: 6px;
  background: rgba(74, 158, 255, 0.15);
  border: 1px solid rgba(74, 158, 255, 0.3);
  border-radius: 6px;
  color: #4a9eff;
  font-size: 12px;
  cursor: pointer;
}

.event-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.event-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.option-cost {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
}

.option-btn {
  padding: 8px 12px;
  background: #4a9eff;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.option-outcome {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-style: italic;
}

.option-close {
  padding: 4px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  font-size: 11px;
  cursor: pointer;
}

.log-entry {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.log-title {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

.log-outcome {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 2px;
}
</style>
