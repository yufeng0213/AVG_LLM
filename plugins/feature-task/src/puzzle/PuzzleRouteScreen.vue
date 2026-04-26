<script setup>
/**
 * PuzzleRouteScreen.vue - 解谜任务路由包装器
 */
import PuzzleScreen from './PuzzleScreen.vue'

const props = defineProps({
  taskId: { type: String, default: '' },
  worldBook: { type: Object, default: () => ({}) },
  task: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['back', 'puzzle-success', 'puzzle-fail'])

const handleBack = () => emit('back')
const handleSuccess = (data) => emit('puzzle-success', data)
const handleFail = (data) => emit('puzzle-fail', data)
</script>

<template>
  <PuzzleScreen
    :task-id="props.taskId"
    :world-book="props.worldBook"
    :task="props.task"
    @back="handleBack"
    @puzzle-success="handleSuccess"
    @puzzle-fail="handleFail"
  />
</template>
