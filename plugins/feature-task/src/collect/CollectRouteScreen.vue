<script setup>
/**
 * CollectRouteScreen - 采集任务路由包装器
 */
import { ref, onMounted } from 'vue'
import CollectScreen from './CollectScreen.vue'

const props = defineProps({
  taskId: { type: String, default: '' },
  worldBook: { type: Object, default: () => ({}) },
  userProfile: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['back', 'collect-success', 'collect-fail'])

const isOpen = ref(false)

onMounted(() => {
  isOpen.value = true
})

const handleClose = () => { emit('back') }
const handleSuccess = (data) => { emit('collect-success', { taskId: props.taskId, ...data }) }
const handleFail = (data) => { emit('collect-fail', { taskId: props.taskId, ...data }) }
</script>

<template>
  <CollectScreen
    :is-open="isOpen"
    :task-id="taskId"
    :world-book="worldBook"
    :user-profile="userProfile"
    @close="handleClose"
    @collect-success="handleSuccess"
    @collect-fail="handleFail"
  />
</template>
