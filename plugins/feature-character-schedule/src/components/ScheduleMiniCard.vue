<script setup>
/**
 * ScheduleMiniCard.vue - 寝室今日概览卡片
 * 在寝室房间显示角色当前时段活动概览
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useCharacterSchedule, SCHEDULE_EVENTS } from '../composables/useCharacterSchedule.js'
import { createScheduleEventListener } from '../services/scheduleEvents.js'
import { getCurrentHour, getNextHour, HOUR_LABEL_MAP } from '../composables/useScheduleTime.js'

const props = defineProps({
  bookId: {
    type: String,
    required: true,
  },
  charId: {
    type: String,
    required: true,
  },
  charName: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['open-detail'])

const { getCharacterStatus, scheduleState } = useCharacterSchedule()

// 当前状态
const currentStatus = ref(null)

// 事件监听管理器
const eventListener = createScheduleEventListener()

onMounted(async () => {
  // 初始化状态
  currentStatus.value = getCharacterStatus(props.bookId, props.charId)

  // 监听状态变化
  eventListener.on(SCHEDULE_EVENTS.UPDATED, ({ key, schedule }) => {
    if (key === `${props.bookId}::${props.charId}`) {
      currentStatus.value = schedule?.currentStatus || null
    }
  })

  eventListener.on(SCHEDULE_EVENTS.STATUS_CHANGED, ({ key, status }) => {
    if (key === `${props.bookId}::${props.charId}`) {
      currentStatus.value = status
    }
  })
})

onUnmounted(() => {
  eventListener.cleanup()
})

// 计算属性
const statusEmoji = computed(() => currentStatus.value?.statusEmoji || '📍')
const statusText = computed(() => currentStatus.value?.statusText || '空闲中')
const canContact = computed(() => currentStatus.value?.canContact ?? true)
const contactHint = computed(() => currentStatus.value?.contactHint || '')

// 下一个小时
const nextHourLabel = computed(() => {
  const nextH = getNextHour(getCurrentHour())
  return `${String(nextH).padStart(2, '0')}:00`
})

// 点击打开详情
function openDetail() {
  emit('open-detail', { bookId: props.bookId, charId: props.charId })
}
</script>

<template>
  <div class="schedule-mini-card" @click="openDetail">
    <div class="mini-header">
      <span class="mini-title">{{ charName || '角色' }} 日程</span>
      <span class="mini-badge" :class="{ available: canContact }">
        {{ canContact ? '可联络' : '勿打扰' }}
      </span>
    </div>

    <div class="mini-current">
      <span class="mini-emoji">{{ statusEmoji }}</span>
      <span class="mini-status">{{ statusText }}</span>
    </div>

    <div class="mini-hint" v-if="!canContact && contactHint">
      {{ contactHint }}
    </div>

    <div class="mini-next">
      <span class="next-label">下一个活动: {{ nextHourLabel }}</span>
      <svg class="mini-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  </div>
</template>

<style scoped>
.schedule-mini-card {
  padding: 10px 12px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s;
}

.schedule-mini-card:hover {
  background: rgba(44, 44, 46, 1);
}

.mini-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.mini-title {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.mini-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(255, 59, 48, 0.2);
  color: #ef9a9a;
}

.mini-badge.available {
  background: rgba(52, 199, 89, 0.2);
  color: #a5d6a7;
}

.mini-current {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini-emoji {
  font-size: 24px;
}

.mini-status {
  font-size: 15px;
  font-weight: 500;
}

.mini-hint {
  font-size: 12px;
  color: #ff6b6b;
  margin-top: 6px;
}

.mini-next {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.next-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.mini-chevron {
  color: rgba(255, 255, 255, 0.4);
}
</style>