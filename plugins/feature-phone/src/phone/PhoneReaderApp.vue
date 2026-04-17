<script setup>
/**
 * PhoneReaderApp.vue - 书城 APP 在手机里的容器
 * 包装 ReaderScreen，适配手机 app 的 props 和事件。
 */
import ReaderScreen from '../../../feature-reader/src/ReaderScreen.vue'

defineProps({
  icon: { type: String, default: '📜' },
  name: { type: String, default: '书城' },
})

const emit = defineEmits(['back'])
</script>

<template>
  <ReaderScreen @back="emit('back')" />
</template>
