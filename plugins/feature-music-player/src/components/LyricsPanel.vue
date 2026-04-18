<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  lines: { type: Array, default: () => [] },
  currentLineIndex: { type: Number, default: -1 },
  hasLyrics: { type: Boolean, default: false },
})

const emit = defineEmits(['seek-to'])

const containerRef = ref(null)
const lineRefs = ref([])

watch(() => props.currentLineIndex, async () => {
  if (!containerRef.value || props.currentLineIndex < 0) return
  await nextTick()
  const el = lineRefs.value[props.currentLineIndex]
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

const collectRef = (el, i) => { if (el) lineRefs.value[i] = el }
</script>

<template>
  <div class="lyrics" ref="containerRef">
    <template v-if="hasLyrics && lines.length">
      <div
        v-for="(line, i) in lines"
        :key="i"
        :ref="(el) => collectRef(el, i)"
        class="lyr-line"
        :class="{ active: i === currentLineIndex }"
        @click="emit('seek-to', i)"
      >
        {{ line.text }}
      </div>
    </template>
    <div v-else class="lyr-empty">
      <p>暂无歌词</p>
      <p class="lyr-hint">可导入 .lrc 歌词文件</p>
    </div>
  </div>
</template>

<style scoped>
.lyrics {
  flex: 1;
  overflow-y: auto;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  scroll-behavior: smooth;
  mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%);
}

.lyr-line {
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  max-width: 440px;
  padding: 4px 10px;
  border-radius: 8px;
  -webkit-font-smoothing: antialiased;
}

.lyr-line:hover {
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.03);
}

.lyr-line.active {
  font-size: 17px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 0 20px rgba(120, 190, 255, 0.3);
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(8px);
  transform: scale(1.02);
}

.lyr-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.2);
  margin-top: 48px;
}

.lyr-empty p {
  margin: 6px 0;
}

.lyr-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.15);
}
</style>
