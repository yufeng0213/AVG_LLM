<template>
  <Teleport to="body">
    <div v-if="visible" class="relationship-tooltip" :style="tooltipStyle">
      <div class="tooltip-names">{{ sourceName }} ↔ {{ targetName }}</div>
      <div class="tooltip-score-bar">
        <div class="tooltip-score-fill" :style="fillStyle"></div>
      </div>
      <div class="tooltip-score">
        <span class="score-value" :style="{ color: color }">{{ score }}</span>
        <span class="score-tier">{{ tier }}</span>
      </div>
      <div v-if="description" class="tooltip-desc">{{ description }}</div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { favorToColor, favorToLevel } from '../composables/useRelationship.js'

const props = defineProps({
  sourceName: String,
  targetName: String,
  score: Number,
  description: String,
  x: Number,
  y: Number,
  visible: Boolean,
})

const color = computed(() => favorToColor(props.score))
const tier = computed(() => favorToLevel(props.score).icon + ' ' + favorToLevel(props.score).name)

const fillStyle = computed(() => ({
  width: `${((props.score + 100) / 200) * 100}%`,
  backgroundColor: color.value,
}))

const tooltipStyle = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
  transform: 'translate(-50%, -100%)',
}))
</script>

<style>
.relationship-tooltip {
  position: fixed;
  background: rgba(20, 20, 30, 0.95);
  backdrop-filter: blur(8px);
  border-radius: 10px;
  padding: 10px 14px;
  min-width: 180px;
  max-width: 240px;
  z-index: 99999;
  pointer-events: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
.tooltip-names {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 6px;
}
.tooltip-score-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}
.tooltip-score-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}
.tooltip-score {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.score-value {
  font-size: 14px;
  font-weight: 700;
}
.score-tier {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
.tooltip-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.4;
}
</style>
