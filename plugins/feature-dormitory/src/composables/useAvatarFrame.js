import { ref, computed } from 'vue'

const STORAGE_KEY = 'dormitory:avatarFrames'
const MAX_FILE_SIZE = 1.5 * 1024 * 1024 // 1.5MB

const frames = ref([])
const activeFrameId = ref(null)

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      frames.value = data.frames || []
      activeFrameId.value = data.activeFrameId || null
    }
  } catch (e) {
    console.warn('[AvatarFrame] Failed to load frames:', e)
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      frames: frames.value,
      activeFrameId: activeFrameId.value,
    }))
  } catch (e) {
    console.error('[AvatarFrame] Failed to persist frames:', e)
  }
}

function selectFrame(id) {
  activeFrameId.value = id
  persist()
}

function importFrame(file) {
  return new Promise((resolve, reject) => {
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.png') && !fileName.endsWith('.gif')) {
      reject(new Error('仅支持 PNG 或 GIF 格式'))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error('文件大小不能超过 1.5MB'))
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const ext = fileName.endsWith('.gif') ? 'gif' : 'png'
      const frame = {
        id: `custom_${Date.now()}`,
        name: file.name.replace(/\.(png|gif)$/i, ''),
        dataUrl: e.target.result,
        fileType: ext,
        createdAt: Date.now(),
      }
      frames.value.push(frame)
      activeFrameId.value = frame.id
      persist()
      resolve(frame)
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

function deleteFrames(ids) {
  frames.value = frames.value.filter(f => !ids.includes(f.id))
  if (ids.includes(activeFrameId.value)) {
    activeFrameId.value = null
    persist()
  }
}

function getFrameById(id) {
  if (!id) return null
  return frames.value.find(f => f.id === id) || null
}

const activeFrame = computed(() => getFrameById(activeFrameId.value))

// 模块加载时自动读取
load()

export function useAvatarFrame() {
  return { frames, activeFrameId, activeFrame, selectFrame, importFrame, deleteFrames, getFrameById }
}
