<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  initSkinSystem,
  loadSkin,
  getCurrentSkin,
  skinToStyles,
  generateCustomCSS,
  saveSkinSetting,
  getSkinList
} from './musicPlayerSkinManager.js'
import { kvStorage } from '../storage/index.js'
import { isAndroid } from '../utils/platform.js'

// 播放器状态
const isExpanded = ref(false)
const isPlaying = ref(false)
const currentTrackIndex = ref(0)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(80)
const isMuted = ref(false)
const showSettings = ref(false)
const showSkinSelector = ref(false)
const musicPlayerRef = ref(null)

// 播放列表
const playlist = ref([])
const bgmFolderPath = ref('')

// 皮肤系统
const currentSkin = ref(null)
const skinList = ref([])
const selectedSkinId = ref('default')

// 拖动状态
const getDefaultPlayerPosition = () => {
  if (typeof window === 'undefined') {
    return { x: 20, y: 20 }
  }

  return {
    x: Math.max(8, window.innerWidth - 64),
    y: Math.max(8, window.innerHeight - 180),
  }
}

const playerPosition = ref(getDefaultPlayerPosition())
const isDragging = ref(false)
const dragStartPos = ref({ x: 0, y: 0 })
const playerStartPos = ref({ x: 0, y: 0 })
const dragMoved = ref(false)
const activePointerId = ref(null)
const pointerCaptureTarget = ref(null)
const isAndroidPlatform = computed(() => isAndroid())

// 音频元素
let audioElement = null
const webAudioObjectUrls = new Set()

const AUDIO_FILE_PATTERN = /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i

const clearWebAudioObjectUrls = () => {
  webAudioObjectUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  })
  webAudioObjectUrls.clear()
}

const isPlayableAudioFile = (file) => {
  if (!file) return false
  if (typeof file.type === 'string' && file.type.startsWith('audio/')) {
    return true
  }
  const name = typeof file.name === 'string' ? file.name : ''
  return AUDIO_FILE_PATTERN.test(name)
}

const pickAudioFiles = ({ directory = false } = {}) => {
  if (typeof document === 'undefined') {
    return Promise.resolve({ files: [], canceled: true })
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus'
    input.multiple = true
    input.style.position = 'fixed'
    input.style.left = '-9999px'

    if (directory) {
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
    }

    let settled = false
    const finish = (files, canceled = false) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', handleFocus)
      input.remove()
      resolve({ files, canceled })
    }

    const handleFocus = () => {
      window.setTimeout(() => {
        if (!settled) {
          const files = Array.from(input.files || [])
          finish(files, files.length === 0)
        }
      }, 320)
    }

    input.addEventListener('change', () => {
      finish(Array.from(input.files || []), false)
    }, { once: true })

    input.addEventListener('cancel', () => {
      finish([], true)
    }, { once: true })

    window.addEventListener('focus', handleFocus, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

const createPlaylistFromLocalFiles = (files) => {
  const validFiles = Array.isArray(files) ? files.filter(isPlayableAudioFile) : []
  if (validFiles.length === 0) {
    return []
  }

  return validFiles.map((file, index) => {
    const objectUrl = URL.createObjectURL(file)
    return {
      id: index,
      name: file.name || `音频 ${index + 1}`,
      path: objectUrl,
      source: 'local-file-object',
    }
  })
}

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
  
  audioElement.addEventListener('error', (e) => {
    console.error('Audio error:', e)
  })
}

// 加载BGM文件夹
const loadBgmFolder = async () => {
  try {
    if (window.avgLLM?.bgm?.selectFolder) {
      const result = await window.avgLLM.bgm.selectFolder()
      if (result.success && result.files.length > 0) {
        clearWebAudioObjectUrls()
        bgmFolderPath.value = result.folderPath
        playlist.value = result.files.map((file, index) => ({
          id: index,
          name: file.name,
          path: file.path,
        }))
        currentTrackIndex.value = 0
        saveBgmSettings()
        // 自动播放第一首
        playTrack(0)
      }
      return
    }

    const picked = await pickAudioFiles({ directory: isAndroidPlatform.value })
    if (picked.canceled || picked.files.length === 0) {
      return
    }

    const localTracks = createPlaylistFromLocalFiles(picked.files)
    if (localTracks.length === 0) {
      return
    }

    clearWebAudioObjectUrls()
    localTracks.forEach((track) => {
      if (track.path) {
        webAudioObjectUrls.add(track.path)
      }
    })
    playlist.value = localTracks
    bgmFolderPath.value = `已选择 ${localTracks.length} 个音频文件`
    currentTrackIndex.value = 0
    await saveBgmSettings()
    await playTrack(0)
  } catch (error) {
    console.error('Failed to load BGM folder:', error)
  }
}

// 播放指定曲目
const playTrack = async (index) => {
  if (index < 0 || index >= playlist.value.length) return
  
  currentTrackIndex.value = index
  const track = playlist.value[index]
  
  if (!audioElement) initAudio()
  
  try {
    if (
      track?.source === 'local-file-object' ||
      (typeof track?.path === 'string' && (track.path.startsWith('blob:') || track.path.startsWith('data:audio')))
    ) {
      audioElement.src = track.path
      await audioElement.play()
      isPlaying.value = true
      return
    }

    // 使用 IPC 读取音频文件为 Base64，然后使用 data URL 播放
    if (window.avgLLM?.bgm?.readAudio) {
      const audioData = await window.avgLLM.bgm.readAudio(track.path)
      if (audioData && audioData.base64) {
        audioElement.src = `data:${audioData.mimeType};base64,${audioData.base64}`
        await audioElement.play()
        isPlaying.value = true
        return
      }
    }
    
    if (track?.path) {
      // 如果 Base64 方式失败，尝试使用自定义协议
      audioElement.src = `local-file://${encodeURIComponent(track.path)}`
      await audioElement.play()
      isPlaying.value = true
    }
  } catch (error) {
    console.error('Failed to play track:', error)
    // 尝试直接使用路径（在某些环境下可能有效）
    try {
      if (track?.path) {
        audioElement.src = track.path
        await audioElement.play()
        isPlaying.value = true
      }
    } catch (e) {
      console.error('Fallback play also failed:', e)
    }
  }
}

// 播放/暂停
const togglePlay = () => {
  if (!audioElement || playlist.value.length === 0) return
  
  if (isPlaying.value) {
    audioElement.pause()
    isPlaying.value = false
  } else {
    audioElement.play()
    isPlaying.value = true
  }
}

// 上一首
const playPrevious = () => {
  if (playlist.value.length === 0) return
  
  let newIndex = currentTrackIndex.value - 1
  if (newIndex < 0) {
    newIndex = playlist.value.length - 1
  }
  playTrack(newIndex)
}

// 下一首
const playNext = () => {
  if (playlist.value.length === 0) return
  
  let newIndex = currentTrackIndex.value + 1
  if (newIndex >= playlist.value.length) {
    newIndex = 0
  }
  playTrack(newIndex)
}

// 跳转进度
const seekTo = (event) => {
  if (!audioElement || duration.value === 0) return
  
  const rect = event.currentTarget.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  audioElement.currentTime = percent * duration.value
}

// 音量控制
const handleVolumeChange = (value) => {
  volume.value = value
  if (audioElement) {
    audioElement.volume = isMuted.value ? 0 : value / 100
  }
  saveBgmSettings()
}

// 静音切换
const toggleMute = () => {
  isMuted.value = !isMuted.value
  if (audioElement) {
    audioElement.volume = isMuted.value ? 0 : volume.value / 100
  }
}

// 保存BGM设置
const saveBgmSettings = async () => {
  const settings = {
    bgmFolderPath: bgmFolderPath.value,
    volume: volume.value,
    currentTrackIndex: currentTrackIndex.value,
  }
  await kvStorage.set('bgm-settings', settings)
}

// 加载BGM设置
const loadBgmSettings = async () => {
  try {
    const settings = await kvStorage.get('bgm-settings')
    if (settings) {
      volume.value = Number.isFinite(Number(settings.volume)) ? Number(settings.volume) : 80
      bgmFolderPath.value = settings.bgmFolderPath || ''
      currentTrackIndex.value = Number.isFinite(Number(settings.currentTrackIndex))
        ? Math.max(0, Number(settings.currentTrackIndex))
        : 0
      
      // 如果有保存的文件夹路径，重新加载播放列表
      if (bgmFolderPath.value && window.avgLLM?.bgm?.loadFolder) {
        const result = await window.avgLLM.bgm.loadFolder(bgmFolderPath.value)
        if (result.success && result.files.length > 0) {
          playlist.value = result.files.map((file, index) => ({
            id: index,
            name: file.name,
            path: file.path,
          }))
        }
      }
    }
  } catch (error) {
    console.error('Failed to load BGM settings:', error)
  }
}

// 切换展开状态
const toggleExpand = () => {
  if (dragMoved.value) {
    dragMoved.value = false
    return
  }
  isExpanded.value = !isExpanded.value
  if (!isExpanded.value) {
    showSettings.value = false
  }
}

// 切换设置面板
const toggleSettings = () => {
  showSettings.value = !showSettings.value
}

// ========== 拖动功能 ==========

// 开始拖动
const startDrag = (event) => {
  if (typeof event.pointerId !== 'number') return
  if (event.pointerType === 'mouse' && event.button !== 0) return

  // 如果是点击展开按钮，不触发拖动
  if (event.target.closest('.icon-btn')) return
  
  activePointerId.value = event.pointerId
  const captureTarget = event.currentTarget
  if (captureTarget && typeof captureTarget.setPointerCapture === 'function') {
    try {
      captureTarget.setPointerCapture(event.pointerId)
      pointerCaptureTarget.value = captureTarget
    } catch {
      pointerCaptureTarget.value = null
    }
  } else {
    pointerCaptureTarget.value = null
  }

  isDragging.value = true
  dragMoved.value = false
  dragStartPos.value = {
    x: event.clientX,
    y: event.clientY
  }
  playerStartPos.value = {
    x: playerPosition.value.x,
    y: playerPosition.value.y
  }
  
  // 添加全局事件监听
  document.addEventListener('pointermove', handleDrag)
  document.addEventListener('pointerup', stopDrag)
  document.addEventListener('pointercancel', stopDrag)
  
  // 阻止默认行为
  if (event.cancelable) {
    event.preventDefault()
  }
}

// 拖动中
const handleDrag = (event) => {
  if (!isDragging.value) return
  if (activePointerId.value !== null && event.pointerId !== activePointerId.value) return
  
  const deltaX = event.clientX - dragStartPos.value.x
  const deltaY = event.clientY - dragStartPos.value.y

  if (!dragMoved.value && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
    dragMoved.value = true
  }
  
  // 计算新位置
  let newX = playerStartPos.value.x + deltaX
  let newY = playerStartPos.value.y + deltaY
  
  // 获取窗口尺寸进行边界限制
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const playerWidth = isExpanded.value ? 320 : 48
  const playerHeight = isExpanded.value ? 400 : 48
  
  // 边界限制
  newX = Math.max(0, Math.min(newX, windowWidth - playerWidth))
  newY = Math.max(0, Math.min(newY, windowHeight - playerHeight))
  
  playerPosition.value = { x: newX, y: newY }

  if (event.cancelable) {
    event.preventDefault()
  }
}

// 结束拖动
const stopDrag = () => {
  if (!isDragging.value) return

  isDragging.value = false
  const pointerId = activePointerId.value
  if (
    pointerCaptureTarget.value &&
    typeof pointerCaptureTarget.value.releasePointerCapture === 'function' &&
    typeof pointerId === 'number'
  ) {
    try {
      pointerCaptureTarget.value.releasePointerCapture(pointerId)
    } catch {
      // no-op
    }
  }
  pointerCaptureTarget.value = null
  activePointerId.value = null
  
  // 移除全局事件监听
  document.removeEventListener('pointermove', handleDrag)
  document.removeEventListener('pointerup', stopDrag)
  document.removeEventListener('pointercancel', stopDrag)
  
  // 保存位置
  savePlayerPosition()
}

const collapsePlayer = () => {
  if (!isExpanded.value) {
    return
  }
  isExpanded.value = false
  showSettings.value = false
}

const handleDocumentPointerDown = (event) => {
  if (!isExpanded.value || isDragging.value) {
    return
  }

  const root = musicPlayerRef.value
  if (!root) {
    return
  }

  const target = event.target
  if (target instanceof Node && root.contains(target)) {
    return
  }

  collapsePlayer()
}

// 保存播放器位置
const savePlayerPosition = async () => {
  await kvStorage.set('music-player-position', playerPosition.value)
}

// 加载播放器位置
const loadPlayerPosition = async () => {
  try {
    const pos = await kvStorage.get('music-player-position')
    if (pos) {
      // 验证位置是否在当前窗口范围内
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      if (pos.x >= 0 && pos.x < windowWidth - 48 && pos.y >= 0 && pos.y < windowHeight - 48) {
        playerPosition.value = pos
      }
    } else {
      playerPosition.value = getDefaultPlayerPosition()
    }
  } catch {
    // 使用默认位置
    playerPosition.value = getDefaultPlayerPosition()
  }
}

// ========== 皮肤系统功能 ==========

// 计算皮肤样式
const skinStyles = computed(() => {
  return skinToStyles(currentSkin.value)
})

// 切换皮肤
const handleSkinChange = async (skinId) => {
  selectedSkinId.value = skinId
  currentSkin.value = await loadSkin(skinId)
  saveSkinSetting(skinId)
}

// 加载外部皮肤文件
const loadCustomSkin = async () => {
  try {
    if (window.avgLLM?.dialog?.selectFile) {
      const result = await window.avgLLM.dialog.selectFile({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        title: '选择皮肤文件'
      })
      if (!result.canceled && result.filePaths.length > 0) {
        const skinPath = result.filePaths[0]
        currentSkin.value = await loadSkin(skinPath)
        selectedSkinId.value = skinPath
        saveSkinSetting(skinPath)
      }
    }
  } catch (error) {
    console.error('Failed to load custom skin:', error)
  }
}

// 监听音量变化
watch(volume, (newVal) => {
  if (audioElement && !isMuted.value) {
    audioElement.volume = newVal / 100
  }
})

// 组件挂载
onMounted(async () => {
  initAudio()
  await loadBgmSettings()
  loadPlayerPosition()
  
  // 初始化皮肤系统
  skinList.value = getSkinList()
  currentSkin.value = await initSkinSystem()
  selectedSkinId.value = getCurrentSkin().name === '默认皮肤' ? 'default' : 'neon-cyber'

  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
})

// 组件卸载
onUnmounted(() => {
  if (audioElement) {
    audioElement.pause()
    audioElement.src = ''
    audioElement = null
  }
  clearWebAudioObjectUrls()
  // 清理拖动事件监听
  document.removeEventListener('pointermove', handleDrag)
  document.removeEventListener('pointerup', stopDrag)
  document.removeEventListener('pointercancel', stopDrag)
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
})
</script>

<template>
  <div
    ref="musicPlayerRef"
    class="music-player"
    :class="{ expanded: isExpanded, dragging: isDragging, 'is-android': isAndroidPlatform }"
    :style="{
      right: 'auto',
      bottom: 'auto',
      left: playerPosition.x + 'px',
      top: playerPosition.y + 'px',
      ...skinStyles.player
    }"
  >
    <!-- 收缩状态 - 小图标按钮（可拖动） -->
    <button
      v-if="!isExpanded"
      class="player-toggle-btn"
      :style="skinStyles.toggleButton"
      @pointerdown="startDrag"
      @click="toggleExpand"
      title="音乐播放器（可拖动）"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
      </svg>
    </button>
    
    <!-- 展开状态 - 播放器面板 -->
    <div v-else class="player-panel" :style="skinStyles.panel">
      <!-- 头部（可拖动区域） -->
      <div class="player-header" :style="skinStyles.header" @pointerdown="startDrag">
        <span class="player-title">🎵 音乐播放器</span>
        <div class="header-actions">
          <button class="icon-btn" @click="toggleSettings" title="设置">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
          <button class="icon-btn" @click="toggleExpand" title="收起">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M19 13H5v-2h14v2z"/>
            </svg>
          </button>
        </div>
      </div>
      
      <!-- 设置面板 -->
      <div v-if="showSettings" class="settings-panel">
        <div class="setting-row folder-row">
          <label>BGM文件夹:</label>
          <div class="folder-path">
            {{ bgmFolderPath || '未选择' }}
          </div>
          <button class="btn-primary mp-compact-btn" @click="loadBgmFolder">选择文件夹</button>
        </div>
        <div class="setting-row volume-row">
          <label>音量:</label>
          <div class="volume-controls">
            <input 
              type="range" 
              min="0" 
              max="100" 
              :value="volume" 
              @input="handleVolumeChange($event.target.value)"
              class="volume-slider"
            />
            <span class="volume-value">{{ volume }}%</span>
            <button class="icon-btn" @click="toggleMute" :title="isMuted ? '取消静音' : '静音'">
              <svg v-if="isMuted" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- 皮肤选择 -->
        <div class="setting-row skin-selector">
          <label>皮肤:</label>
          <div class="skin-options">
            <button
              v-for="skin in skinList"
              :key="skin.id"
              class="skin-option"
              :class="{ active: selectedSkinId === skin.id }"
              @click="handleSkinChange(skin.id)"
            >
              {{ skin.name }}
            </button>
          </div>
        </div>
      </div>
      
      <!-- 当前曲目信息 -->
      <div class="track-info">
        <div class="track-name">
          {{ currentTrack ? currentTrack.name : '未加载音乐' }}
        </div>
        <div class="track-status">
          {{ playlist.length > 0 ? `第 ${currentTrackIndex + 1} 首 / 共 ${playlist.length} 首` : '请选择BGM文件夹' }}
        </div>
      </div>
      
      <!-- 进度条 -->
      <div class="progress-section">
        <span class="time-display">{{ formatTime(currentTime) }}</span>
        <div class="progress-bar" @click="seekTo">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <span class="time-display">{{ formatTime(duration) }}</span>
      </div>
      
      <!-- 控制按钮 -->
      <div class="controls">
        <button class="control-btn" @click="playPrevious" :disabled="playlist.length === 0" title="上一首">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
        </button>
        <button class="control-btn play-btn" @click="togglePlay" :disabled="playlist.length === 0" :title="isPlaying ? '暂停' : '播放'">
          <svg v-if="isPlaying" viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
        <button class="control-btn" @click="playNext" :disabled="playlist.length === 0" title="下一首">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
          </svg>
        </button>
      </div>
      
      <!-- 播放列表 -->
      <div v-if="playlist.length > 0" class="playlist">
        <div class="playlist-title">播放列表</div>
        <div class="playlist-items">
          <div 
            v-for="(track, index) in playlist" 
            :key="track.id"
            class="playlist-item"
            :class="{ active: index === currentTrackIndex }"
            @click="playTrack(index)"
          >
            <span class="track-index">{{ index + 1 }}</span>
            <span class="track-title">{{ track.name }}</span>
            <span v-if="index === currentTrackIndex && isPlaying" class="playing-indicator">▶</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./MusicPlayer.css"></style>

