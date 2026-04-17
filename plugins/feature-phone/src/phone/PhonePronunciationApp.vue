<script setup>
/**
 * PhonePronunciationApp.vue - 手机上的口语学习 APP 入口
 * 薄包装组件，转发到 feature-pronunciation 插件。
 */
import PronunciationScreen from '../../../feature-pronunciation/src/PronunciationScreen.vue'

defineProps({
  icon: { type: String, default: '' },
  name: { type: String, default: '' },
})
const emit = defineEmits(['back'])
</script>

<template>
  <div class="pronunciation-phone-app">
    <PronunciationScreen @back="emit('back')" />
  </div>
</template>
