<script setup>
import { computed } from 'vue'

const props = defineProps({
  track: { type: Object, default: null },
  isPlaying: { type: Boolean, default: false },
})

const displayName = computed(() => props.track?.name || '未播放')
const displaySource = computed(() => {
  if (!props.track) return ''
  const m = { 'local-file-object': 'Local', 'electron-file': 'Local', 'url': 'URL', 'playlist': 'Playlist' }
  return m[props.track.source] || ''
})
</script>

<template>
  <div class="track-card">
    <div class="vinyl" :class="{ spinning: isPlaying }">
      <div class="vinyl-grooves"></div>
      <div class="vinyl-label"></div>
      <div class="vinyl-hole"></div>
    </div>
    <div class="track-meta">
      <h3 class="track-name" :title="displayName">{{ displayName }}</h3>
      <span v-if="displaySource" class="track-tag">{{ displaySource }}</span>
    </div>
  </div>
</template>

<style scoped>
.track-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.vinyl {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  /* Glass disc: translucent with subtle gradient */
  background:
    radial-gradient(circle at 35% 30%, rgba(255,255,255,0.08) 0%, transparent 50%),
    conic-gradient(
      rgba(255,255,255,0.03) 0deg,
      rgba(255,255,255,0.06) 30deg,
      rgba(255,255,255,0.02) 60deg,
      rgba(255,255,255,0.05) 90deg,
      rgba(255,255,255,0.03) 120deg,
      rgba(255,255,255,0.06) 150deg,
      rgba(255,255,255,0.02) 180deg,
      rgba(255,255,255,0.05) 210deg,
      rgba(255,255,255,0.03) 240deg,
      rgba(255,255,255,0.06) 270deg,
      rgba(255,255,255,0.02) 300deg,
      rgba(255,255,255,0.05) 330deg,
      rgba(255,255,255,0.03) 360deg
    );
  position: relative;
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.4),
    0 4px 16px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: box-shadow 0.4s, transform 0.4s;
}

.vinyl.spinning {
  animation: vinyl-spin 4s linear infinite;
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.45),
    0 4px 20px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

@keyframes vinyl-spin {
  to { transform: rotate(360deg); }
}

.vinyl-grooves {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle, transparent 35%, rgba(255,255,255,0.015) 36%, transparent 37%),
    radial-gradient(circle, transparent 45%, rgba(255,255,255,0.015) 46%, transparent 47%),
    radial-gradient(circle, transparent 55%, rgba(255,255,255,0.015) 56%, transparent 57%),
    radial-gradient(circle, transparent 65%, rgba(255,255,255,0.015) 66%, transparent 67%),
    radial-gradient(circle, transparent 75%, rgba(255,255,255,0.015) 76%, transparent 77%);
}

/* Glass label: frosted circle in center */
.vinyl-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  overflow: hidden;
}

/* Subtle color accent on label */
.vinyl-label::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(120,190,255,0.15), rgba(180,130,255,0.1));
}

.vinyl-hole {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}

.track-meta {
  text-align: center;
  max-width: 300px;
}

.track-name {
  font-size: 18px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  -webkit-font-smoothing: antialiased;
}

.track-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 8px;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  backdrop-filter: blur(8px);
}
</style>
