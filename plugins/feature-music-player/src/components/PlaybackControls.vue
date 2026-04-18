<script setup>
import { computed, onMounted, watch, nextTick } from 'vue'
import { formatTime } from '../utils/timeFormat.js'

const props = defineProps({
  isPlaying: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  volume: { type: Number, default: 80 },
  isMuted: { type: Boolean, default: false },
  hasTrack: { type: Boolean, default: false },
})

const emit = defineEmits(['play-toggle', 'prev', 'next', 'seek', 'volume-change', 'mute-toggle'])

const seekPercent = computed(() => {
  if (!props.duration) return 0
  return (props.currentTime / props.duration) * 100
})

const volPercent = computed(() => props.isMuted ? 0 : props.volume)

const updateSliderFill = (el) => {
  if (!el) return
  const pct = ((el.value - el.min) / (el.max - el.min)) * 100
  const trackH = el.offsetHeight || 4
  el.style.background = `linear-gradient(to right, rgba(120,190,255,0.6) 0%, rgba(120,190,255,0.6) ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`
}

const updateVolFill = (el) => {
  if (!el) return
  const pct = ((el.value - el.min) / (el.max - el.min)) * 100
  el.style.background = `linear-gradient(to right, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.55) ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`
}

onMounted(() => {
  nextTick(() => {
    const seekBar = document.querySelector('.seek-bar')
    const volBar = document.querySelector('.vol-bar')
    if (seekBar) updateSliderFill(seekBar)
    if (volBar) updateVolFill(volBar)
  })
})

watch(() => props.currentTime, () => {
  const bar = document.querySelector('.seek-bar')
  if (bar) updateSliderFill(bar)
})

watch(() => [props.volume, props.isMuted], () => {
  const bar = document.querySelector('.vol-bar')
  if (bar) updateVolFill(bar)
})
</script>

<template>
  <div class="controls">
    <div class="seek-row">
      <span class="time">{{ formatTime(props.currentTime) }}</span>
      <input
        type="range"
        class="seek-bar"
        :min="0"
        :max="props.duration || 100"
        :value="props.currentTime"
        :disabled="!props.hasTrack"
        :style="{ '--progress': seekPercent + '%' }"
        @input="emit('seek', Number($event.target.value))"
      />
      <span class="time">{{ formatTime(props.duration) }}</span>
    </div>

    <div class="buttons">
      <button class="ctrl-btn" :disabled="!props.hasTrack" @click="emit('prev')" title="上一首">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="currentColor"/></svg>
      </button>
      <button class="ctrl-btn play-btn" :disabled="!props.hasTrack" @click="emit('play-toggle')">
        <template v-if="props.isLoading">
          <svg viewBox="0 0 24 24" width="28" height="28" class="spin"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z" fill="currentColor"/></svg>
        </template>
        <template v-else-if="props.isPlaying">
          <svg viewBox="0 0 24 24" width="28" height="28"><path d="M6 19h4V5H6zm8-14v14h4V5z" fill="currentColor"/></svg>
        </template>
        <template v-else>
          <svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
        </template>
      </button>
      <button class="ctrl-btn" :disabled="!props.hasTrack" @click="emit('next')" title="下一首">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6z" fill="currentColor"/></svg>
      </button>
    </div>

    <div class="vol-row">
      <button class="vol-btn" @click="emit('mute-toggle')" :title="props.isMuted ? '取消静音' : '静音'">
        <svg v-if="!props.isMuted && props.volume > 0" viewBox="0 0 24 24" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.5v7a4.49 4.49 0 0 0 2.5-3.5z" fill="currentColor"/></svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16"><path d="M16.5 12A4.5 4.5 0 0 0 14 8.5v2.09l2.41 2.41c.06-.31.09-.63.09-.97zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87s-.32-2.7-.88-3.87l-1.53 1.53c.26.73.41 1.52.41 2.34zm-7 6.5V16l-5-5v-1l5-5V4.5L3 9v6h4l5 5z" fill="currentColor"/></svg>
      </button>
      <input
        type="range"
        class="vol-bar"
        min="0"
        max="100"
        :value="volPercent"
        :style="{ '--progress': volPercent + '%' }"
        @input="emit('volume-change', Number($event.target.value))"
      />
      <span class="vol-val">{{ volPercent }}%</span>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.seek-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0 2px;
}

.time {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.3);
  min-width: 36px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

.seek-bar {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  outline: none;
  cursor: pointer;
  border-radius: 2px;
}

.seek-bar:disabled {
  cursor: default;
  opacity: 0.3;
}

.seek-bar::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 0.1s;
}

.seek-bar::-webkit-slider-thumb:hover {
  transform: scale(1.25);
}

.seek-bar::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}

.buttons {
  display: flex;
  align-items: center;
  gap: 18px;
}

.ctrl-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.ctrl-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
}

.ctrl-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.ctrl-btn:disabled {
  opacity: 0.15;
  cursor: not-allowed;
}

.play-btn {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.play-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
  box-shadow:
    0 6px 24px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  transform: scale(1.05);
}

.play-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.vol-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
}

.vol-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  padding: 4px;
  display: flex;
  transition: color 0.15s;
  flex-shrink: 0;
}

.vol-btn:hover {
  color: rgba(255, 255, 255, 0.7);
}

.vol-bar {
  width: 80px;
  height: 3px;
  -webkit-appearance: none;
  appearance: none;
  outline: none;
  cursor: pointer;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
}

.vol-bar::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.vol-val {
  font-size: 10px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.25);
  min-width: 30px;
  text-align: right;
  -webkit-font-smoothing: antialiased;
}
</style>
