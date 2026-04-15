<script setup>
/**
 * BattleRouteScreen.vue - 路由版战斗界面（全屏）
 * 包装 BattleScreen，打开时自动触发战斗。
 */
import { ref, onMounted } from 'vue'
import BattleScreen from './components/BattleScreen.vue'

const props = defineProps({
  taskId: { type: String, default: '' },
  boardId: { type: String, default: '' },
  worldBook: { type: Object, default: () => ({}) },
  selectedCharacters: { type: Array, default: () => [] },
  userProfile: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['back', 'battle-victory', 'battle-defeat'])

const isOpen = ref(false)

onMounted(() => {
  // 路由打开时自动触发
  isOpen.value = true
})

const handleClose = () => {
  emit('back')
}

const handleVictory = (data) => {
  emit('battle-victory', { taskId: props.taskId, ...data })
}

const handleDefeat = (data) => {
  emit('battle-defeat', { taskId: props.taskId, ...data })
}
</script>

<template>
  <BattleScreen
    :is-open="isOpen"
    :task-id="taskId"
    :board-id="boardId"
    :world-book="worldBook"
    :selected-characters="selectedCharacters"
    :user-profile="userProfile"
    @close="handleClose"
    @battle-victory="handleVictory"
    @battle-defeat="handleDefeat"
  />
</template>
