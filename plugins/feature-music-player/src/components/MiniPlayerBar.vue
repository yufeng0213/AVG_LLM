<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  trackName: { type: String, default: '未知歌曲' },
  isPlaying: { type: Boolean, default: false },
})

const emit = defineEmits(['expand', 'play-toggle'])

const visible = ref(false)

const show = () => { visible.value = true }
const hide = () => { visible.value = false }

defineExpose({ show, hide })
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div v-if="visible" class="mini-player-bar" @click="emit('expand')">
        <div class="mini-track">{{ trackName }}</div>
        <button class="mini-play-btn" @click.stop="emit('play-toggle')">
          <svg v-if="isPlaying" viewBox="0 0 24 24" width="20" height="20"><path d="M6 19h4V5H6zm8-14v14h4V5z" fill="currentColor"/></svg>
          <svg v-else viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mini-player-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50px;
  background: rgba(15, 10, 26, 0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(168, 85, 247, 0.3);
  display: flex;
  align-items: center;
  padding: 0 16px;
  z-index: 9999;
  cursor: pointer;
  transition: background 0.2s;
}

.mini-player-bar:hover {
  background: rgba(25, 15, 40, 0.98);
}

.mini-track {
  flex: 1;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-play-btn {
  background: none;
  border: none;
  color: var(--music-accent, #a855f7);
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
