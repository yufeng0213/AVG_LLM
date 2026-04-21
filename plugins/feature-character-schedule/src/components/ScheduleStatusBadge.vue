<script setup>
/**
 * ScheduleStatusBadge.vue - 状态徽章组件
 * 在短信联系人、地图角色标记等位置显示当前状态
 * 支持不同尺寸：small（短信）、medium（地图）
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useCharacterSchedule, SCHEDULE_EVENTS } from '../composables/useCharacterSchedule.js'
import { createScheduleEventListener } from '../services/scheduleEvents.js'

const props = defineProps({
  bookId: {
    type: String,
    required: true,
  },
  charId: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    default: 'small', // 'small' | 'medium'
  },
  showHint: {
    type: Boolean,
    default: false,
  },
})

const { getCharacterStatus } = useCharacterSchedule()

// 当前状态
const currentStatus = ref(null)

// 事件监听管理器
const eventListener = createScheduleEventListener()

onMounted(() => {
  currentStatus.value = getCharacterStatus(props.bookId, props.charId)

  eventListener.on(SCHEDULE_EVENTS.UPDATED, ({ key }) => {
    if (key === `${props.bookId}::${props.charId}`) {
      currentStatus.value = getCharacterStatus(props.bookId, props.charId)
    }
  })
})

onUnmounted(() => {
  eventListener.cleanup()
})

// 计算属性
const statusEmoji = computed(() => currentStatus.value?.statusEmoji || '📍')
const statusText = computed(() => currentStatus.value?.statusText || '')
const canContact = computed(() => currentStatus.value?.canContact ?? true)
const contactHint = computed(() => currentStatus.value?.contactHint || '')
</script>

<template>
  <div
    class="status-badge"
    :class="[size, { busy: !canContact }]"
    :title="showHint && contactHint ? contactHint : ''"
  >
    <span class="badge-emoji">{{ statusEmoji }}</span>
    <span class="badge-text" v-if="size === 'medium'">{{ statusText }}</span>
    <span class="badge-indicator" :class="{ available: canContact }"></span>
  </div>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.status-badge.small {
  padding: 2px 4px;
  font-size: 12px;
}

.status-badge.medium {
  padding: 4px 8px;
  font-size: 14px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 6px;
}

.badge-emoji {
  font-size: inherit;
}

.badge-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.badge-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef9a9a;
}

.badge-indicator.available {
  background: #a5d6a7;
}

.status-badge.busy .badge-indicator {
  background: #ff6b6b;
}
</style>