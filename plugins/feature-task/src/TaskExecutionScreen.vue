<script setup>
/**
 * TaskExecutionScreen.vue - 全屏路由版任务执行界面
 * 包装 TaskExecutionModal，提供全屏路由入口
 */
import { ref } from 'vue'
import TaskExecutionModal from './components/TaskExecutionModal.vue'

const props = defineProps({
  task: { type: Object, default: () => ({}) },
  worldBook: { type: Object, default: () => ({}) },
  userName: { type: String, default: '玩家' },
  targetCharacterId: { type: String, default: '' },
  targetCharacterName: { type: String, default: '' },
})

const emit = defineEmits(['back', 'task-complete'])

const isOpen = ref(true)

const handleClose = () => {
  emit('back')
}

const handleComplete = (taskId, evidence) => {
  emit('task-complete', { taskId, ...evidence })
}
</script>

<template>
  <TaskExecutionModal
    :is-open="isOpen"
    :task="task"
    :world-book="worldBook"
    :user-name="userName"
    :target-character-id="targetCharacterId"
    :target-character-name="targetCharacterName"
    @close="handleClose"
    @complete="handleComplete"
  />
</template>
