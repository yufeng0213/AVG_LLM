<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useVisualizer } from '../composables/useVisualizer.js'

const props = defineProps({
  isActive: { type: Boolean, default: false },
  mode: { type: String, default: 'auto' }, // auto | threejs | canvas | css
  getBassEnergy: { type: Function, default: () => 0 },
  getMidEnergy: { type: Function, default: () => 0 },
  getTrebleEnergy: { type: Function, default: () => 0 },
  energy: { type: Number, default: 0 },
  freqData: { type: Object, default: () => ({ length: 0 }) },
})

const canvasRef = ref(null)
const { actions: vizActions, isTwoJs } = useVisualizer(canvasRef)
const currentMode = ref('css')

let animFrame = null

const animate = () => {
  if (currentMode.value === 'threejs') {
    vizActions.start('threejs', props.getBassEnergy, props.getMidEnergy, props.getTrebleEnergy, props.energy, props.freqData)
  } else if (currentMode.value === 'canvas') {
    vizActions.start('canvas', props.getBassEnergy, props.getMidEnergy, props.getTrebleEnergy, props.energy, props.freqData)
  }
}

watch(() => props.isActive, (active) => {
  if (active) {
    nextTick(() => {
      const detected = props.mode === 'auto' ? vizActions.detectMode() : props.mode
      currentMode.value = detected

      if (detected === 'threejs') {
        vizActions.initThreeJS()
      } else if (detected === 'canvas') {
        vizActions.initCanvas(canvasRef.value)
      }
      animate()
    })
  } else {
    vizActions.stop()
  }
})

onUnmounted(() => {
  vizActions.dispose()
})
</script>

<template>
  <div class="audio-visualizer">
    <canvas ref="canvasRef" class="viz-canvas" v-show="isActive && currentMode !== 'css'" />
    <div v-if="isActive && currentMode === 'css'" class="viz-css" :style="{ opacity: 0.3 + energy * 0.7 }"></div>
  </div>
</template>

<style scoped>
.audio-visualizer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.viz-canvas {
  width: 100%;
  height: 100%;
}

.viz-css {
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse at center,
    rgba(168, 85, 247, calc(0.15 * var(--viz-energy, 1))) 0%,
    rgba(124, 58, 237, calc(0.1 * var(--viz-energy, 1))) 40%,
    transparent 70%
  );
  animation: viz-pulse 2s ease-in-out infinite;
}

@keyframes viz-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
</style>
