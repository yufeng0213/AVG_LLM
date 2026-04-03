<script setup>
/**
 * 示例音乐播放器插件
 * 这是一个简化的音乐播放器，用于演示插件替换功能
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'

// 播放器状态
const isExpanded = ref(false)
const isPlaying = ref(false)
const currentTrackIndex = ref(0)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(80)

// 播放列表
const playlist = ref([])
const bgmFolderPath = ref('')

// 音频元素
let audioElement = null

// 当前播放曲目
const currentTrack = computed(() => {
  if (playlist.value.length === 0) return null
  return playlist.value[currentTrackIndex.value]
})

// 格式化时间
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 进度百分比
const progressPercent = computed(() => {
  if (duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

// 初始化音频元素
const initAudio = () => {
  if (audioElement) {
    audioElement.pause()
    audioElement.src = ''
  }
  
  audioElement = new Audio()
  audioElement.volume = volume.value / 100
  
  audioElement.addEventListener('timeupdate', () => {
    currentTime.value = audioElement.currentTime
  })
  
  audioElement.addEventListener('loadedmetadata', () => {
    duration.value = audioElement.duration
  })
  
  audioElement.addEventListener('ended', () => {
    playNext()
  })
}

// 加载BGM文件夹
const loadBgmFolder = async () => {
  try {
    if (window.avgLLM?.bgm?.selectFolder) {
      const result = await window.avgLLM.bgm.selectFolder()
      if (result.success && result.files.length > 0) {
        bgmFolderPath.value = result.folderPath
        playlist.value = result.files.map((file, index) => ({
          id: index,
          name: file.name,
          path: file.path,
        }))
        currentTrackIndex.value = 0
        initAudio()
      }
    }
  } catch (e) {
    console.error('Failed to load BGM folder:', e)
  }
}

// 播放当前曲目
const playCurrent = async () => {
  if (!currentTrack.value || !audioElement) return
  
  try {
    if (window.avgLLM?.bgm?.readAudio) {
      const result = await window.avgLLM.bgm.readAudio(currentTrack.value.path)
      if (result) {
        audioElement.src = `data:${result.mimeType};base64,${result.base64}`
        audioElement.play()
        isPlaying.value = true
      }
    }
  } catch (e) {
    console.error('Failed to play audio:', e)
  }
}

// 播放/暂停
const togglePlay = () => {
  if (!audioElement) return
  
  if (isPlaying.value) {
    audioElement.pause()
    isPlaying.value = false
  } else {
    playCurrent()
  }
}

// 上一曲
const playPrev = () => {
  if (playlist.value.length === 0) return
  currentTrackIndex.value = (currentTrackIndex.value - 1 + playlist.value.length) % playlist.value.length
  if (isPlaying.value) {
    playCurrent()
  }
}

// 下一曲
const playNext = () => {
  if (playlist.value.length === 0) return
  currentTrackIndex.value = (currentTrackIndex.value + 1) % playlist.value.length
  if (isPlaying.value) {
    playCurrent()
  }
}

// 调整音量
const adjustVolume = (newVolume) => {
  volume.value = Math.max(0, Math.min(100, newVolume))
  if (audioElement) {
    audioElement.volume = volume.value / 100
  }
}

// 切换展开状态
const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}

onMounted(() => {
  initAudio()
})

onUnmounted(() => {
  if (audioElement) {
    audioElement.pause()
    audioElement.src = ''
  }
})
</script>

<template>
  <div class="example-music-player" :class="{ 'is-expanded': isExpanded }">
    <!-- 迷你模式 -->
    <div v-if="!isExpanded" class="mini-player">
      <button class="mini-btn" @click="toggleExpand" title="展开">
        🎵
      </button>
      <button class="mini-btn" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
        {{ isPlaying ? '⏸' : '▶' }}
      </button>
      <span class="mini-track" v-if="currentTrack">
        {{ currentTrack.name }}
      </span>
    </div>
    
    <!-- 展开模式 -->
    <div v-else class="full-player">
      <div class="player-header">
        <h3>🎵 示例音乐播放器</h3>
        <button class="collapse-btn" @click="toggleExpand" title="收起">
          ▼
        </button>
      </div>
      
      <!-- 播放列表 -->
      <div class="playlist-section">
        <button class="load-btn" @click="loadBgmFolder">
          📁 加载音乐文件夹
        </button>
        
        <div v-if="playlist.length > 0" class="track-list">
          <div 
            v-for="(track, index) in playlist" 
            :key="track.id"
            class="track-item"
            :class="{ 'is-active': index === currentTrackIndex }"
            @click="currentTrackIndex = index; playCurrent()"
          >
            <span class="track-icon">{{ index === currentTrackIndex && isPlaying ? '▶' : '♪' }}</span>
            <span class="track-name">{{ track.name }}</span>
          </div>
        </div>
        <div v-else class="empty-playlist">
          <p>请加载音乐文件夹</p>
        </div>
      </div>
      
      <!-- 当前播放信息 -->
      <div v-if="currentTrack" class="current-track-info">
        <p class="track-title">{{ currentTrack.name }}</p>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <p class="time-info">
          {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
        </p>
      </div>
      
      <!-- 控制按钮 -->
      <div class="controls">
        <button class="ctrl-btn" @click="playPrev" title="上一曲">⏮</button>
        <button class="ctrl-btn play-btn" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button class="ctrl-btn" @click="playNext" title="下一曲">⏭</button>
      </div>
      
      <!-- 音量控制 -->
      <div class="volume-section">
        <span class="volume-icon">🔊</span>
        <input 
          type="range" 
          min="0" 
          max="100" 
          :value="volume"
          @input="adjustVolume(Number($event.target.value))"
          class="volume-slider"
        />
        <span class="volume-value">{{ volume }}%</span>
      </div>
      
      <!-- 插件标识 -->
      <div class="plugin-badge">
        <span>🔌 插件示例</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.example-music-player {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

/* 迷你模式 */
.mini-player {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 24px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.mini-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: white;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.mini-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.mini-track {
  color: white;
  font-size: 0.85rem;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 展开模式 */
.full-player {
  width: 320px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  color: #e0e0e0;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.player-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #fff;
}

.collapse-btn {
  padding: 4px 8px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #aaa;
  cursor: pointer;
  font-size: 0.8rem;
}

.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* 播放列表 */
.playlist-section {
  margin-bottom: 12px;
}

.load-btn {
  width: 100%;
  padding: 8px;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  font-size: 0.85rem;
  margin-bottom: 8px;
}

.load-btn:hover {
  opacity: 0.9;
}

.track-list {
  max-height: 150px;
  overflow-y: auto;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
}

.track-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.track-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.track-item.is-active {
  background: rgba(102, 126, 234, 0.3);
}

.track-icon {
  font-size: 0.8rem;
  color: #888;
}

.track-item.is-active .track-icon {
  color: #667eea;
}

.track-name {
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-playlist {
  padding: 16px;
  text-align: center;
  color: #888;
  font-size: 0.85rem;
}

/* 当前播放信息 */
.current-track-info {
  margin-bottom: 12px;
}

.track-title {
  margin: 0 0 8px;
  font-size: 0.9rem;
  color: #fff;
  text-align: center;
}

.progress-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  transition: width 0.1s;
}

.time-info {
  margin: 4px 0 0;
  font-size: 0.75rem;
  color: #888;
  text-align: center;
}

/* 控制按钮 */
.controls {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 12px;
}

.ctrl-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.ctrl-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.ctrl-btn.play-btn {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-size: 1.2rem;
}

.ctrl-btn.play-btn:hover {
  transform: scale(1.1);
}

/* 音量控制 */
.volume-section {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.volume-icon {
  font-size: 0.9rem;
}

.volume-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: #667eea;
  border-radius: 50%;
}

.volume-value {
  font-size: 0.75rem;
  color: #888;
  min-width: 40px;
}

/* 插件标识 */
.plugin-badge {
  margin-top: 8px;
  padding: 4px 8px;
  background: rgba(102, 126, 234, 0.2);
  border-radius: 4px;
  text-align: center;
}

.plugin-badge span {
  font-size: 0.75rem;
  color: #667eea;
}
</style>