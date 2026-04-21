<script setup>
/**
 * ScheduleTimeline.vue - 24小时日程时间线组件
 * 合并连续相同活动的小时块，显示当前/已完成/锁定状态
 */
import { computed } from 'vue'
import { HOUR_TIME_MAP, SCHEDULE_ACTIVITY_TYPES, getCurrentHour } from '../composables/useScheduleTime.js'

const props = defineProps({
  hourEntries: {
    type: Array,
    default: () => [],
  },
  generatedAt: {
    type: String,
    default: '',
  },
})

const currentHour = getCurrentHour()

// 将连续相同blockId的小时合并为渲染块
const groupedBlocks = computed(() => {
  const blocks = []
  let currentBlock = null

  for (const entry of props.hourEntries) {
    const blockId = entry.plannedActivity?.blockId || ''

    if (!currentBlock || blockId !== currentBlock.blockId) {
      currentBlock = {
        startHour: entry.hour,
        endHour: entry.hour,
        activity: entry.plannedActivity,
        blockId,
        entries: [entry],
        hasExecuted: !!entry.executed,
        allCompleted: entry.isCompleted,
        isCurrentHour: entry.hour === currentHour,
        isLocked: entry.plannedActivity?.isLocked || false,
      }
      blocks.push(currentBlock)
    } else {
      currentBlock.endHour = entry.hour
      currentBlock.entries.push(entry)
      if (entry.executed) currentBlock.hasExecuted = true
      if (!entry.isCompleted) currentBlock.allCompleted = false
      if (entry.hour === currentHour) currentBlock.isCurrentHour = true
      if (entry.plannedActivity?.isLocked) currentBlock.isLocked = true
    }
  }

  return blocks
})

// 格式化时间范围
function formatTimeRange(startHour, endHour) {
  const start = `${String(startHour).padStart(2, '0')}:00`
  const endHour24 = endHour + 1
  const end = endHour24 >= 24 ? '24:00' : `${String(endHour24 % 24).padStart(2, '0')}:00`
  return `${start} - ${end}`
}

// 计算块样式类
function getBlockClass(block) {
  const classes = ['timeline-block']
  if (block.isCurrentHour) classes.push('current')
  if (block.allCompleted) classes.push('completed')
  if (block.isLocked) classes.push('locked')
  return classes.join(' ')
}

// 获取活动emoji
function getActivityEmoji(activityType) {
  return SCHEDULE_ACTIVITY_TYPES[activityType]?.emoji || '📍'
}

// 获取能量变化摘要
function getEnergySummary(block) {
  const executedEntries = block.entries.filter(e => e.executed)
  if (executedEntries.length === 0) return null
  const total = executedEntries.reduce((sum, e) => sum + (e.executed?.actualEnergyChange || 0), 0)
  return total
}

// 获取心情摘要
function getMoodSummary(block) {
  const executedEntries = block.entries.filter(e => e.executed)
  if (executedEntries.length === 0) return null
  const lastExecuted = executedEntries[executedEntries.length - 1]
  return lastExecuted.executed?.actualMood || ''
}
</script>

<template>
  <div class="schedule-timeline">
    <div class="timeline-header">
      <span class="timeline-title">今日日程</span>
      <span class="timeline-date">{{ new Date().toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) }}</span>
    </div>

    <div class="timeline-blocks">
      <div
        v-for="block in groupedBlocks"
        :key="block.blockId"
        :class="getBlockClass(block)"
      >
        <!-- 头部：时间 + 活动类型 -->
        <div class="block-header">
          <span class="block-time">{{ formatTimeRange(block.startHour, block.endHour) }}</span>
          <span class="block-emoji">{{ getActivityEmoji(block.activity?.activityType) }}</span>
          <span class="block-label">{{ block.activity?.activityLabel || '未知' }}</span>
          <span class="block-duration" v-if="block.entries.length > 1">{{ block.entries.length }}h</span>
        </div>

        <!-- 活动内容 -->
        <div class="block-content">
          <div class="block-desc" v-if="block.activity?.description">{{ block.activity.description }}</div>
          <div class="block-meta">
            <span class="block-location" v-if="block.activity?.locationName">&#x1F4CD; {{ block.activity.locationName }}</span>
          </div>
        </div>

        <!-- 状态标记 -->
        <div class="block-status">
          <span v-if="block.isCurrentHour" class="status-current">当前时段</span>
          <span v-if="block.allCompleted" class="status-completed">已完成</span>
          <span v-if="block.allCompleted && getEnergySummary(block) !== null" class="status-energy">
            &#x26A1;{{ getEnergySummary(block) >= 0 ? '+' : '' }}{{ getEnergySummary(block) }}
          </span>
          <span v-if="block.allCompleted && getMoodSummary(block)" class="status-mood">
            &#x1F3AE; {{ getMoodSummary(block) }}
          </span>
          <span v-if="block.isLocked && block.isCurrentHour" class="status-busy">
            勿打扰
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.schedule-timeline {
  padding: 12px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  margin-bottom: 12px;
}

.timeline-title {
  font-size: 14px;
  font-weight: 500;
}

.timeline-date {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.timeline-blocks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-block {
  padding: 12px;
  background: rgba(44, 44, 46, 0.6);
  border-radius: 10px;
  border-left: 3px solid rgba(255, 255, 255, 0.1);
}

.timeline-block.current {
  background: rgba(255, 204, 0, 0.1);
  border-left-color: #ffd60a;
}

.timeline-block.completed {
  opacity: 0.6;
}

.timeline-block.locked {
  border-left-color: #ef9a9a;
}

.block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.block-time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-family: monospace;
}

.block-emoji {
  font-size: 20px;
}

.block-label {
  font-size: 14px;
  font-weight: 500;
}

.block-duration {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
}

.block-content {
  padding-left: 4px;
}

.block-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.4;
}

.block-meta {
  margin-top: 4px;
}

.block-location {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.block-status {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.status-current {
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(255, 204, 0, 0.2);
  color: #ffd60a;
  border-radius: 4px;
}

.status-completed {
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(52, 199, 89, 0.2);
  color: #a5d6a7;
  border-radius: 4px;
}

.status-energy {
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(90, 200, 250, 0.15);
  color: #5ac8fa;
  border-radius: 4px;
}

.status-mood {
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
  border-radius: 4px;
}

.status-busy {
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(255, 59, 48, 0.2);
  color: #ef9a9a;
  border-radius: 4px;
}
</style>
