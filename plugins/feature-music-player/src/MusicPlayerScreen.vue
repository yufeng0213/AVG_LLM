<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAudioPlayer } from './composables/useAudioPlayer.js'
import { usePlaylist } from './composables/usePlaylist.js'
import { useAudioAnalysis } from './composables/useAudioAnalysis.js'
import { kvStorage } from '../../../src/storage/index.js'
import { extractFromFile, extractFromElectronFile } from './utils/audioMetadata.js'
import { parseNeteaseId, parseNeteaseType, fetchNeteaseMetadata, fetchNeteaseLyrics, fetchNeteasePlaylist } from './utils/neteaseApi.js'

const emit = defineEmits(['close'])

const isExpanded = ref(false)

// Audio + playlist + analysis
const { state: audioState, actions: audioActions } = useAudioPlayer({ onEnded: () => playNext() })
const { state: playlistState, actions: playlistActions } = usePlaylist()
const { state: analysisState, actions: analysisActions } = useAudioAnalysis()

// Init audio analysis when audio element is ready
watch(() => audioState.audio, (el) => {
  if (el) {
    analysisActions.init(el)
  }
}, { immediate: true })

// Start/stop analysis with playback
watch(() => audioState.isPlaying.value, (playing) => {
  if (playing) analysisActions.start()
  else analysisActions.stop()
})

const currentTrack = computed(() => audioState.currentTrack.value)
const hasTrack = computed(() => !!audioState.currentTrack.value)
const trackCover = computed(() => currentTrack.value?.cover || null)

// Ripple rings driven by audio energy
const bassEnergy = ref(0)
let rippleTimer = null
const startRippleLoop = () => {
  if (rippleTimer) return
  const loop = () => {
    bassEnergy.value = analysisActions.getBassEnergy()
    rippleTimer = requestAnimationFrame(loop)
  }
  loop()
}
const stopRippleLoop = () => {
  if (rippleTimer) { cancelAnimationFrame(rippleTimer); rippleTimer = null }
  bassEnergy.value = 0
}
watch(() => audioState.isPlaying.value, (playing) => {
  if (playing) startRippleLoop()
  else stopRippleLoop()
})

const playTrack = async (track) => {
  audioState.currentTrack.value = track
  await audioActions.loadAndPlay(track)
  // Try to fetch lyrics if this track has a netease ID
  if (track?.neteaseId && !track?.lrc) {
    fetchNeteaseLyrics(track.neteaseId).then(lrc => {
      if (lrc) playlistActions.updateTrackMetadata(track.id, { lrc })
    })
  }
}

const playNext = async () => {
  const next = playlistActions.getNextTrack()
  if (next) await playTrack(next)
}

// Settings
const showSettings = ref(false)
const showLyrics = ref(true)
const playerTheme = ref('dark')

// LRC parsing
const parsedLrc = computed(() => {
  const lrc = currentTrack.value?.lrc
  if (!lrc) return []
  const lines = lrc.split('\n')
  const result = []
  for (const line of lines) {
    const m = /^\[(\d{2}):(\d{2})\.(\d+)\](.*)$/.exec(line)
    if (m) {
      const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / Math.pow(10, m[3].length)
      const text = m[4].trim()
      if (text) result.push({ time, text })
    }
  }
  return result
})

const currentLyricLine = computed(() => {
  const lines = parsedLrc.value
  if (!lines.length) return ''
  const t = audioState.currentTime.value
  let idx = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    if (t >= lines[i].time) { idx = i; break }
  }
  return lines[idx]?.text || ''
})

// Dragging
const pos = ref({ x: 0, y: 0 })
const dragging = ref(false)
const dragMoved = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const playerStartPos = ref({ x: 0, y: 0 })
let dragPointerId = null

const BALL_SIZE = 50
const PLAYER_W = 280
const PLAYER_H = 240

const getDefaultPos = () => {
  if (typeof window === 'undefined') return { x: 20, y: 20 }
  return { x: Math.max(4, window.innerWidth - BALL_SIZE - 16), y: Math.max(4, window.innerHeight - BALL_SIZE - 16) }
}

const onPointerDown = (e) => {
  if (e.target.closest('.mini-btn, .song-item, .del, .import-btn, .url-input, .url-add-btn, .settings-toggle, .settings-row, .settings-inner')) return
  dragging.value = true
  dragMoved.value = false
  dragStart.value = { x: e.clientX, y: e.clientY }
  playerStartPos.value = { ...pos.value }
  dragPointerId = e.pointerId
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  if (e.cancelable) e.preventDefault()
}

const onPointerMove = (e) => {
  if (!dragging.value) return
  const dx = e.clientX - dragStart.value.x
  const dy = e.clientY - dragStart.value.y
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved.value = true
  const elW = isExpanded.value ? PLAYER_W : BALL_SIZE
  const elH = isExpanded.value ? PLAYER_H : BALL_SIZE
  pos.value = {
    x: Math.max(0, Math.min(window.innerWidth - elW, playerStartPos.value.x + dx)),
    y: Math.max(0, Math.min(window.innerHeight - elH, playerStartPos.value.y + dy)),
  }
  if (e.cancelable) e.preventDefault()
}

const onPointerUp = (e) => {
  dragging.value = false
  if (dragPointerId != null) {
    try { e.currentTarget.releasePointerCapture(dragPointerId) } catch {}
    dragPointerId = null
  }
  kvStorage.set('music-player-position', pos.value)
}

const onClickBall = () => {
  if (dragMoved.value) return
  expand()
}

// Ball ↔ mini player toggle
const expand = () => { isExpanded.value = true }
const fold = () => { isExpanded.value = false }

// Import
const showUrlInput = ref(false)
const urlInputValue = ref('')
const urlError = ref('')

const handleUrlImport = async () => {
  const url = urlInputValue.value.trim()
  if (!url) { urlError.value = '请输入音频 URL'; return }
  if (!/^https?:\/\//i.test(url)) { urlError.value = 'URL 需以 http:// 或 https:// 开头'; return }
  urlError.value = ''

  const type = parseNeteaseType(url)

  if (type === 'playlist') {
    // Playlist URL — fetch all tracks
    const playlistId = parseNeteaseId(url)
    if (!playlistId) { urlError.value = '无法解析歌单 ID'; return }
    const tracks = await fetchNeteasePlaylist(playlistId)
    if (!tracks?.length) { urlError.value = '歌单为空或无法获取'; return }
    const neteaseTracks = tracks.map(song => ({
      id: `netease-${song.id}-${Date.now()}`,
      name: song.name,
      artist: song.artist,
      album: song.album,
      cover: song.cover,
      neteaseId: song.id,
      path: `http://music.163.com/song/media/outer/url?id=${song.id}.mp3`,
      source: 'url',
    }))
    playlistActions.addTracks(neteaseTracks)
    if (!audioState.currentTrack.value) playTrack(neteaseTracks[0])
  } else if (type === 'song') {
    // Single song URL
    const songId = parseNeteaseId(url)
    if (songId) {
      const meta = await fetchNeteaseMetadata(songId)
      const track = {
        id: `netease-${Date.now()}`,
        name: meta?.name || (decodeURIComponent(url.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '')) || '网易云音乐'),
        artist: meta?.artist || '',
        album: meta?.album || '',
        cover: meta?.cover || '',
        path: url,
        neteaseId: songId,
        source: 'url',
      }
      if (window.avgLLM?.netease) {
        fetchNeteaseLyrics(songId).then(lrc => {
          if (lrc) playlistActions.updateTrackMetadata(track.id, { lrc })
        })
      }
      playlistActions.addTracks([track])
      if (!audioState.currentTrack.value) playTrack(track)
    } else {
      // Generic URL
      const track = { id: `url-${Date.now()}`, name: decodeURIComponent(url.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '')) || '网络音频', path: url, source: 'url' }
      playlistActions.addTracks([track])
      if (!audioState.currentTrack.value) playTrack(track)
    }
  } else {
    // Generic URL
    const track = { id: `url-${Date.now()}`, name: decodeURIComponent(url.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '')) || '网络音频', path: url, source: 'url' }
    playlistActions.addTracks([track])
    if (!audioState.currentTrack.value) playTrack(track)
  }

  urlInputValue.value = ''
  showUrlInput.value = false
}

const handleFileImport = async (e) => {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  try {
    if (window.avgLLM?.bgm?.selectFolder) {
      // Electron: use folder picker
      const r = await window.avgLLM.bgm.selectFolder()
      if (r?.success && r.files?.length) {
        const tracks = []
        for (const f of r.files.filter(f => /\.mp3|wav|ogg|m4a|aac|flac|opus/i.test(f.fullName || f.name || ''))) {
          const meta = await extractFromElectronFile(f.path)
          tracks.push({
            id: `el-${Date.now()}-${tracks.length}`,
            name: meta.title || f.name.replace(/\.[^.]+$/, ''),
            artist: meta.artist,
            album: meta.album,
            cover: meta.cover,
            path: f.path,
            source: 'electron-file',
          })
        }
        if (tracks.length) {
          playlistActions.addTracks(tracks)
          if (!audioState.currentTrack.value) playTrack(tracks[0])
        }
      }
    } else {
      const tracks = []
      for (const f of files) {
        const meta = await extractFromFile(f)
        tracks.push({
          id: `file-${Date.now()}-${tracks.length}-${Math.random()}`,
          name: meta.title || f.name.replace(/\.[^/.]+$/, ''),
          artist: meta.artist,
          album: meta.album,
          cover: meta.cover,
          path: URL.createObjectURL(f),
          source: 'local-file-object',
        })
      }
      if (tracks.length) {
        playlistActions.addTracks(tracks)
        if (!audioState.currentTrack.value) playTrack(tracks[0])
      }
    }
  } catch (err) { console.error('[import] failed', err) }
  e.target.value = ''
}

const handleRemoveTrack = (i) => playlistActions.removeTrack(i)

const toggleTheme = () => {
  playerTheme.value = playerTheme.value === 'dark' ? 'light' : 'dark'
  kvStorage.set('music-player-theme', playerTheme.value)
}

// Persist
let saveTimer = null
watch(() => playlistState.tracks.value, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    await kvStorage.set('music-player-playlist', playlistState.tracks.value)
    await kvStorage.set('music-player-play-mode', playlistState.playMode.value)
  }, 500)
}, { deep: true })

onMounted(async () => {
  const saved = await kvStorage.get('music-player-playlist')
  if (saved?.length) playlistActions.setPlaylist(saved)
  const mode = await kvStorage.get('music-player-play-mode')
  if (mode) playlistActions.setPlayMode(mode)
  const savedPos = await kvStorage.get('music-player-position')
  pos.value = savedPos || getDefaultPos()
  const lyricsOn = await kvStorage.get('music-player-lyrics-on')
  if (lyricsOn !== null) showLyrics.value = lyricsOn
  const savedTheme = await kvStorage.get('music-player-theme')
  if (savedTheme) playerTheme.value = savedTheme
})

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <Teleport to="body">
    <div class="music-float" :class="[`theme-${playerTheme}`]" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
      <!-- 最小化小球 + 波纹 -->
      <div v-show="!isExpanded" class="ball-with-ripple">
        <div class="ball-ripple-container" :class="{ 'ripple-playing': audioState.isPlaying.value }" :style="{ '--ripple-intensity': bassEnergy }">
          <span class="ripple-ring" :style="{ '--delay': '0s' }"></span>
          <span class="ripple-ring" :style="{ '--delay': '0.5s' }"></span>
          <span class="ripple-ring" :style="{ '--delay': '1s' }"></span>
        </div>
        <div class="float-ball" :class="{ dragging }" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @click="onClickBall">
          <img v-if="trackCover" class="ball-cover-img" :class="{ spinning: audioState.isPlaying.value }" :src="trackCover" alt="" />
          <span v-else class="ball-emoji">🎵</span>
        </div>
      </div>

      <!-- 歌词条（在小球旁边） -->
      <div v-show="!isExpanded && showLyrics && currentLyricLine" class="lyrics-strip" :class="{ dragging }">
        {{ currentLyricLine }}
      </div>

      <!-- 展开播放器 -->
      <div v-show="isExpanded" class="ios-mini-player" :class="{ dragging }" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp">
        <div class="mini-head">
          <div class="mini-cover" :class="{ spinning: audioState.isPlaying.value }">
            <img v-if="trackCover" class="cover-img" :src="trackCover" alt="" />
            <div v-else class="cover-disc">
              <div class="cover-hole"></div>
            </div>
          </div>
          <div class="mini-info">
            <div class="mini-title">{{ currentTrack?.name || '等待播放' }}</div>
            <div class="mini-artist">{{ currentTrack?.artist || (hasTrack ? (currentTrack?.source === 'url' ? '网络' : '本地音乐') : '') }}</div>
          </div>
          <div class="mini-buttons">
            <button class="mini-btn" @click="audioActions.togglePlay()">
              {{ audioState.isPlaying.value ? '⏸' : '▶' }}
            </button>
            <button class="mini-btn" @click="fold">−</button>
          </div>
        </div>

        <div class="panel">
          <!-- 播放列表 -->
          <div class="playlist" v-if="playlistState.tracks.value.length">
            <div
              v-for="(song, idx) in playlistState.tracks.value"
              :key="song.id"
              class="song-item"
              :class="{ active: currentTrack?.id === song.id }"
              @click="playTrack(song)"
            >
              <span class="song-name">
                {{ song.name }}<span v-if="song.artist" class="song-artist"> — {{ song.artist }}</span>
              </span>
              <span class="del" @click.stop="handleRemoveTrack(idx)">✕</span>
            </div>
          </div>
          <div class="playlist" v-else>
            <div class="empty-playlist">暂无歌曲</div>
          </div>

          <!-- 设置折叠按钮 -->
          <span class="settings-toggle" @click="showSettings = !showSettings" role="button" tabindex="0">
            ⚙️
          </span>

          <!-- 设置面板 -->
          <div v-show="showSettings" class="settings-inner">
            <input type="file" id="mini-file-input" accept="audio/*" hidden @change="handleFileImport" />
            <div class="import-row">
              <label class="import-btn" for="mini-file-input" title="导入本地音乐">📁</label>
              <span class="import-btn" @click="showUrlInput = !showUrlInput" title="URL导入">🔗</span>
              <span class="import-btn" @click="showLyrics = !showLyrics" :title="showLyrics ? '关闭歌词' : '显示歌词'" :style="{ opacity: showLyrics ? 1 : 0.4 }">📝</span>
              <span class="import-btn" @click="toggleTheme" :title="playerTheme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'">
                {{ playerTheme === 'dark' ? '☀️' : '🌙' }}
              </span>
            </div>

            <div v-if="showUrlInput" class="url-import">
              <input v-model="urlInputValue" type="text" class="url-input" placeholder="https://example.com/song.mp3" @keydown.enter="handleUrlImport" />
              <button class="url-add-btn" @click="handleUrlImport">+</button>
              <p v-if="urlError" class="url-err">{{ urlError }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* ========== 悬浮容器 ========== */
.music-float {
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
}

.platform-android.android-portrait .float-ball {
  background: rgba(255, 255, 255, 0.30) !important;
}
.platform-android.android-portrait .ripple-ring {
  border-color: rgba(255, 255, 255, 0.35) !important;
}
.platform-android.android-portrait .ios-mini-player {
  background: rgba(255, 255, 255, 0.30) !important;
}
.platform-android.android-portrait .import-btn,
.platform-android.android-portrait .settings-toggle {
  background: rgba(255, 255, 255, 0.30) !important;
}
.platform-android.android-portrait .mini-btn {
  background: rgba(255, 255, 255, 0.30) !important;
}
.platform-android.android-portrait .url-input {
  background: rgba(0, 0, 0, 0.5) !important;
}
.platform-android.android-portrait .url-add-btn {
  background: rgba(255, 255, 255, 0.20) !important;
}
.platform-android.android-portrait .playlist {
  background: rgba(255, 255, 255, 0.20) !important;
}
.platform-android.android-portrait .lyrics-strip {
  background: rgba(255, 255, 255, 0.20) !important;
}
/* ========== 最小化小球 ========== */
.ball-with-ripple {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ball-ripple-container {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50px;
  height: 50px;
  margin: -25px;
  pointer-events: none;
}

.ripple-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50px;
  height: 50px;
  margin: -25px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.25);
  opacity: 0;
  transform: scale(1);
}

.ball-ripple-container.ripple-playing .ripple-ring {
  animation: ripple-pulse 2s ease-out infinite;
  animation-delay: var(--delay);
}

@keyframes ripple-pulse {
  0% {
    transform: scale(1);
    opacity: calc(0.5 * var(--ripple-intensity, 0.3));
    border-color: rgba(255, 255, 255, 0.35);
  }
  50% {
    opacity: calc(0.25 * var(--ripple-intensity, 0.3));
    border-color: rgba(255, 255, 255, 0.15);
  }
  100% {
    transform: scale(calc(1 + 1.2 * (0.3 + var(--ripple-intensity, 0.3) * 0.7)));
    opacity: 0;
    border-color: rgba(255, 255, 255, 0);
  }
}

.float-ball {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
  cursor: grab;
  touch-action: none;
  transition: all 0.3s ease;
  user-select: none;
  overflow: hidden;
}

.ball-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}

.ball-cover-img.spinning {
  animation: ball-spin 3s linear infinite;
}

@keyframes ball-spin {
  to { transform: rotate(360deg); }
}

.ball-emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
}

.float-ball:hover {
  transform: scale(1.08);
  background: rgba(255, 255, 255, 0.15);
}

.float-ball.dragging {
  cursor: grabbing;
}

.float-ball.dragging:hover {
  transform: scale(1);
}

/* ========== 展开播放器 ========== */
.ios-mini-player {
  width: 280px;
  padding: 16px 18px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: white;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.ios-mini-player.dragging {
  cursor: grabbing;
}

/* ========== 头部：封面 + 信息 + 按钮 ========== */
.mini-head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.mini-cover {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 12px;
}

.mini-cover.spinning .cover-img {
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}

.cover-disc {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: conic-gradient(
    rgba(255,255,255,0.08) 0deg,
    rgba(255,255,255,0.12) 45deg,
    rgba(255,255,255,0.06) 90deg,
    rgba(255,255,255,0.1) 135deg,
    rgba(255,255,255,0.08) 180deg,
    rgba(255,255,255,0.12) 225deg,
    rgba(255,255,255,0.06) 270deg,
    rgba(255,255,255,0.1) 315deg,
    rgba(255,255,255,0.08) 360deg
  );
  position: relative;
}

.cover-disc::before {
  content: '';
  position: absolute;
  top: 10%;
  left: 10%;
  width: 30%;
  height: 30%;
  background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
  border-radius: 50%;
}

.cover-hole {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
}

.mini-cover.spinning .cover-disc {
  animation: disc-spin 3s linear infinite;
}

@keyframes disc-spin {
  to { transform: rotate(360deg); }
}

.mini-info {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  min-width: 0;
}

.mini-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 3px;
  color: rgba(255, 255, 255, 0.95);
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-artist {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

/* ========== 按钮组 ========== */
.mini-buttons {
  display: flex;
  gap: 6px;
}

.mini-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: white;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.mini-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.05);
}

/* ========== 面板：导入 + 列表 ========== */
.panel {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.import-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.import-btn {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px !important;
  color: rgba(255, 255, 255, 0.5);
  transition: background 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-sizing: border-box;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  user-select: none;
  width: 24px;
  height: 24px;
}

.import-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.8);
}

.url-import {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.url-input {
  width: 100%;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  outline: none;
  transition: all 0.15s;
}

.url-input::placeholder {
  color: rgba(255, 255, 255, 0.15);
}

.url-input:focus {
  border-color: rgba(120, 190, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
}

.url-add-btn {
  -webkit-appearance: none;
  appearance: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
  align-self: flex-end;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.url-add-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.8);
}

.url-err {
  color: rgba(255, 95, 87, 0.6);
  font-size: 10px;
  margin: 0;
}

.playlist {
  max-height: 120px;
  overflow-y: auto;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  padding: 6px;
}

.song-item {
  padding: 6px 10px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: background 0.15s;
}

.song-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.song-item.active {
  background: rgba(255, 255, 255, 0.15);
}

.song-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
}

.song-artist {
  color: rgba(255, 255, 255, 0.35);
}

.song-item.active .song-name {
  color: rgba(255, 255, 255, 0.95);
  font-weight: 500;
}

.del {
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
  transition: color 0.15s;
}

.del:hover {
  color: #ff6666;
}

.empty-playlist {
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  padding: 12px 0;
}

/* ========== 歌词条 ========== */
.lyrics-strip {
  max-width: 180px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: 50px;
  animation: lyrics-fade-in 0.4s ease;
}

.lyrics-strip.dragging {
  opacity: 0.6;
}

@keyframes lyrics-fade-in {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}

/* ========== 设置按钮 ========== */
.settings-toggle {
  align-self: flex-end;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  user-select: none;
  line-height: 1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.settings-toggle:hover {
  background: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.7);
}

/* ========== 设置面板内部 ========== */
.settings-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 0 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
}

.settings-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}

.toggle-switch {
  width: 40px;
  height: 18px;
  border-radius: 9px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.25);
  font-size: 9px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-switch.on {
  background: rgba(120, 190, 255, 0.2);
  color: rgba(120, 190, 255, 0.7);
}

/* ========== 滚动条 ========== */
.playlist::-webkit-scrollbar { width: 4px; }
.playlist::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
.playlist::-webkit-scrollbar-track { background: transparent; }


  .platform-android.android-portrait .mini-btn,
  .platform-android.android-portrait .url-add-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }

/* ========== 亮色主题 ========== */
.theme-light .float-ball {
  background: rgba(0, 0, 0, 0.12);
  border-color: rgba(0, 0, 0, 0.15);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
  color: #1a1a1a;
}

.theme-light .float-ball:hover {
  background: rgba(0, 0, 0, 0.18);
}

.theme-light .ios-mini-player {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  color: #1a1a1a;
}

.theme-light .mini-cover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.theme-light .cover-disc {
  background: conic-gradient(
    rgba(0,0,0,0.06) 0deg,
    rgba(0,0,0,0.1) 45deg,
    rgba(0,0,0,0.04) 90deg,
    rgba(0,0,0,0.08) 135deg,
    rgba(0,0,0,0.06) 180deg,
    rgba(0,0,0,0.1) 225deg,
    rgba(0,0,0,0.04) 270deg,
    rgba(0,0,0,0.08) 315deg,
    rgba(0,0,0,0.06) 360deg
  );
}

.theme-light .cover-disc::before {
  background: radial-gradient(circle, rgba(0,0,0,0.15) 0%, transparent 70%);
}

.theme-light .cover-hole {
  background: rgba(255, 255, 255, 0.8);
}

.theme-light .mini-title {
  color: rgba(0, 0, 0, 0.9);
}

.theme-light .mini-artist {
  color: rgba(0, 0, 0, 0.5);
}

.theme-light .mini-btn {
  background: rgba(0, 0, 0, 0.1);
  color: #1a1a1a;
}

.theme-light .mini-btn:hover {
  background: rgba(0, 0, 0, 0.2);
}

.theme-light .panel {
  border-top-color: rgba(0, 0, 0, 0.08);
}

.theme-light .playlist {
  background: rgba(0, 0, 0, 0.06);
}

.theme-light .song-item:hover {
  background: rgba(0, 0, 0, 0.08);
}

.theme-light .song-item.active {
  background: rgba(0, 0, 0, 0.12);
}

.theme-light .song-name {
  color: rgba(0, 0, 0, 0.7);
}

.theme-light .song-artist {
  color: rgba(0, 0, 0, 0.4);
}

.theme-light .song-item.active .song-name {
  color: rgba(0, 0, 0, 0.9);
}

.theme-light .del {
  color: rgba(0, 0, 0, 0.3);
}

.theme-light .del:hover {
  color: #e6352b;
}

.theme-light .empty-playlist {
  color: rgba(0, 0, 0, 0.3);
}

.theme-light .settings-toggle {
  background: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.4);
}

.theme-light .settings-toggle:hover {
  background: rgba(0, 0, 0, 0.18);
  color: rgba(0, 0, 0, 0.7);
}

.theme-light .import-btn {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.5);
}

.theme-light .import-btn:hover {
  background: rgba(0, 0, 0, 0.14);
  color: rgba(0, 0, 0, 0.8);
}

.theme-light .url-input {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.7);
}

.theme-light .url-input::placeholder {
  color: rgba(0, 0, 0, 0.2);
}

.theme-light .url-input:focus {
  border-color: rgba(10, 132, 255, 0.4);
  background: rgba(0, 0, 0, 0.06);
}

.theme-light .url-add-btn {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.4);
}

.theme-light .url-add-btn:hover {
  background: rgba(0, 0, 0, 0.14);
  color: rgba(0, 0, 0, 0.8);
}

.theme-light .lyrics-strip {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.8);
}

/* 亮色主题波纹 */
.theme-light .ripple-ring {
  border-color: rgba(0, 0, 0, 0.15);
}

.theme-light .ball-ripple-container.ripple-playing .ripple-ring {
  animation-name: ripple-pulse-light;
}

@keyframes ripple-pulse-light {
  0% {
    transform: scale(1);
    opacity: calc(0.4 * var(--ripple-intensity, 0.3));
    border-color: rgba(0, 0, 0, 0.2);
  }
  50% {
    opacity: calc(0.2 * var(--ripple-intensity, 0.3));
    border-color: rgba(0, 0, 0, 0.1);
  }
  100% {
    transform: scale(calc(1 + 1.2 * (0.3 + var(--ripple-intensity, 0.3) * 0.7)));
    opacity: 0;
    border-color: rgba(0, 0, 0, 0);
  }
}

/* 亮色主题 Android 补偿 */
.platform-android.android-portrait .theme-light .float-ball {
  background: rgba(0, 0, 0, 0.22) !important;
}
.platform-android.android-portrait .theme-light .ios-mini-player {
  background: rgba(255, 255, 255, 0.80) !important;
}
.platform-android.android-portrait .theme-light .import-btn,
.platform-android.android-portrait .theme-light .settings-toggle {
  background: rgba(0, 0, 0, 0.18) !important;
}
.platform-android.android-portrait .theme-light .mini-btn {
  background: rgba(0, 0, 0, 0.20) !important;
}
.platform-android.android-portrait .theme-light .playlist {
  background: rgba(0, 0, 0, 0.12) !important;
}
.platform-android.android-portrait .theme-light .lyrics-strip {
  background: rgba(255, 255, 255, 0.70) !important;
}
.platform-android.android-portrait .theme-light .url-add-btn {
  background: rgba(0, 0, 0, 0.15) !important;
}
</style>
