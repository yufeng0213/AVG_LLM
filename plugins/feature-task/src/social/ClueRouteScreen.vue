<script setup>
/**
 * ClueRouteScreen.vue - 线索收集任务路由包装器
 */
import ClueScreen from './ClueScreen.vue'

const props = defineProps({
  taskId: { type: String, default: '' },
  worldBook: { type: Object, default: () => ({}) },
  task: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['back', 'clue-success', 'clue-fail'])

const handleBack = () => emit('back')
const handleSuccess = (data) => emit('clue-success', data)
const handleFail = (data) => emit('clue-fail', data)
</script>

<template>
  <ClueScreen
    :task-id="props.taskId"
    :world-book="props.worldBook"
    :task="props.task"
    @back="handleBack"
    @clue-success="handleSuccess"
    @clue-fail="handleFail"
  />
</template>
