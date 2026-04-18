<script setup>
const props = defineProps({
  tracks: { type: Array, default: () => [] },
  currentTrackId: { type: String, default: null },
  playMode: { type: String, default: 'sequence' },
})

const emit = defineEmits(['play-track', 'remove-track', 'clear', 'set-mode'])

const modes = [
  { key: 'sequence', icon: '🔁', label: '顺序' },
  { key: 'shuffle', icon: '🔀', label: '随机' },
  { key: 'repeat-one', icon: '🔂', label: '单曲' },
  { key: 'repeat-all', icon: '🔁', label: '循环' },
]

const cycleMode = () => {
  const keys = modes.map(m => m.key)
  const i = keys.indexOf(props.playMode)
  emit('set-mode', keys[(i + 1) % keys.length])
}
</script>

<template>
  <div class="playlist">
    <div class="pl-header">
      <h2 class="pl-title">播放列表 ({{ tracks.length }})</h2>
      <button class="pl-mode" @click="cycleMode" :title="modes.find(m => m.key === playMode)?.label">
        {{ modes.find(m => m.key === playMode)?.icon }}
      </button>
      <button v-if="tracks.length > 0" class="pl-clear" @click="emit('clear')">Clear</button>
    </div>

    <div class="pl-list">
      <div
        v-for="(track, i) in tracks"
        :key="track.id"
        class="pl-item"
        :class="{ active: track.id === currentTrackId }"
        @click="emit('play-track', track)"
      >
        <span class="pl-num">{{ i + 1 }}</span>
        <span class="pl-name" :title="track.name">{{ track.name }}</span>
        <button class="pl-del" @click.stop="emit('remove-track', i)">&times;</button>
      </div>
      <div v-if="tracks.length === 0" class="pl-empty">暂无歌曲，点击上方标签导入</div>
    </div>
  </div>
</template>

<style scoped>
.playlist {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  height: 100%;
}

.pl-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.pl-title {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  margin: 0;
  color: rgba(255, 255, 255, 0.6);
  -webkit-font-smoothing: antialiased;
}

.pl-mode {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}

.pl-mode:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.12);
}

.pl-clear {
  background: none;
  border: 1px solid rgba(255, 107, 107, 0.15);
  color: rgba(255, 107, 107, 0.5);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 3px 10px;
  border-radius: 6px;
  transition: all 0.15s;
}

.pl-clear:hover {
  background: rgba(255, 107, 107, 0.08);
  border-color: rgba(255, 107, 107, 0.25);
  color: rgba(255, 107, 107, 0.7);
}

.pl-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pl-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
}

.pl-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.pl-item.active {
  background: rgba(120, 190, 255, 0.08);
  backdrop-filter: blur(8px);
}

.pl-num {
  width: 22px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.2);
  font-variant-numeric: tabular-nums;
}

.pl-item.active .pl-num {
  color: rgba(120, 190, 255, 0.7);
}

.pl-name {
  flex: 1;
  font-size: 13px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  -webkit-font-smoothing: antialiased;
}

.pl-item.active .pl-name {
  color: rgba(120, 190, 255, 0.85);
  font-weight: 500;
}

.pl-del {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.12);
  font-size: 18px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  transition: color 0.15s;
}

.pl-del:hover {
  color: rgba(255, 95, 87, 0.7);
}

.pl-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.2);
  padding: 40px 16px;
  font-size: 13px;
}
</style>
