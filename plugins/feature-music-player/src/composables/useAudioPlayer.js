import { ref, computed, onUnmounted } from 'vue'

const AUDIO_FILE_PATTERN = /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i

let _audio = null
let _timeUpdateHandler = null

export function useAudioPlayer(options = {}) {
  const { onEnded, onError } = options

  const state = {
    audio: null,
    isPlaying: ref(false),
    currentTime: ref(0),
    duration: ref(0),
    volume: ref(80),
    isMuted: ref(false),
    currentTrack: ref(null),
    isLoading: ref(false),
    error: ref(null),
  }

  const initAudio = () => {
    if (_audio) return
    _audio = new Audio()
    _audio.preload = 'metadata'
    state.audio = _audio

    _timeUpdateHandler = () => {
      state.currentTime.value = _audio.currentTime
      state.duration.value = _audio.duration || 0
    }
    _audio.addEventListener('timeupdate', _timeUpdateHandler)
    _audio.addEventListener('loadedmetadata', () => {
      state.duration.value = _audio.duration
      state.isLoading.value = false
    })
    _audio.addEventListener('ended', () => {
      state.isPlaying.value = false
      if (onEnded) onEnded()
    })
    _audio.addEventListener('error', (e) => {
      state.isLoading.value = false
      state.error.value = '音频加载失败'
      console.error('[audio-player] error', e)
      if (onError) onError(e)
    })
    _audio.addEventListener('play', () => { state.isPlaying.value = true })
    _audio.addEventListener('pause', () => { state.isPlaying.value = false })
  }

  const loadAndPlay = async (track) => {
    initAudio()
    if (!_audio) return

    state.isLoading.value = true
    state.error.value = null
    state.currentTrack.value = track

    let src = track.path

    if (track.source === 'electron-file' && window.avgLLM?.bgm?.readAudio) {
      try {
        const result = await window.avgLLM.bgm.readAudio(track.path)
        if (result?.base64 && result?.mimeType) {
          src = `data:${result.mimeType};base64,${result.base64}`
        }
      } catch (e) {
        console.warn('[audio-player] electron readAudio failed, fallback to path', e)
      }
    }

    _audio.src = src
    _audio.volume = state.isMuted.value ? 0 : state.volume.value / 100

    try {
      await _audio.play()
      state.isPlaying.value = true
      state.isLoading.value = false
    } catch (e) {
      state.isLoading.value = false
      state.error.value = '播放失败'
      console.error('[audio-player] play failed', e)
    }
  }

  const togglePlay = async () => {
    if (!_audio) return
    if (state.isPlaying.value) {
      _audio.pause()
    } else {
      try {
        await _audio.play()
      } catch (e) {
        console.error('[audio-player] resume failed', e)
      }
    }
  }

  const pause = () => {
    if (_audio) _audio.pause()
  }

  const seekTo = (time) => {
    if (_audio && isFinite(time)) {
      _audio.currentTime = Math.max(0, Math.min(time, state.duration.value))
    }
  }

  const setVolume = (val) => {
    state.volume.value = Math.max(0, Math.min(100, val))
    if (_audio) {
      _audio.volume = state.isMuted.value ? 0 : state.volume.value / 100
    }
  }

  const toggleMute = () => {
    state.isMuted.value = !state.isMuted.value
    if (_audio) {
      _audio.volume = state.isMuted.value ? 0 : state.volume.value / 100
    }
  }

  const getAudioElement = () => _audio

  onUnmounted(() => {
    if (_audio) {
      _audio.pause()
      _audio.src = ''
      if (_timeUpdateHandler) {
        _audio.removeEventListener('timeupdate', _timeUpdateHandler)
      }
    }
  })

  return {
    state,
    actions: { initAudio, loadAndPlay, togglePlay, pause, seekTo, setVolume, toggleMute, getAudioElement },
  }
}

export function isPlayableAudioFile(file) {
  if (!file) return false
  if (typeof file.type === 'string' && file.type.startsWith('audio/')) return true
  const name = typeof file.name === 'string' ? file.name : ''
  return AUDIO_FILE_PATTERN.test(name)
}

export function pickAudioFiles({ directory = false } = {}) {
  if (typeof document === 'undefined') return Promise.resolve({ files: [], canceled: true })

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
      setTimeout(() => {
        if (!settled) {
          const files = Array.from(input.files || [])
          finish(files, files.length === 0)
        }
      }, 320)
    }

    input.addEventListener('change', () => finish(Array.from(input.files || []), false), { once: true })
    input.addEventListener('cancel', () => finish([], true), { once: true })
    window.addEventListener('focus', handleFocus, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

export function createPlaylistFromFiles(files) {
  const validFiles = Array.isArray(files) ? files.filter(isPlayableAudioFile) : []
  if (validFiles.length === 0) return []

  return validFiles.map((file, index) => ({
    id: `local-${Date.now()}-${index}`,
    name: file.name?.replace(/\.[^.]+$/, '') || `音频 ${index + 1}`,
    path: URL.createObjectURL(file),
    source: 'local-file-object',
    fileName: file.name,
  }))
}
