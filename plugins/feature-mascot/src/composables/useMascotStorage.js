import { ref } from 'vue'
import { isNative } from '../../../../src/utils/platform.js'

const STORAGE_KEY = 'avg_llm_mascot_v1'
const MASCOT_DIR = 'avg_llm_mascot'
const MAX_MASCOT_SIZE = 2 * 1024 * 1024 // 2MB (GIF 文件大小限制)

const mascotState = ref({
  x: window.innerWidth / 2 - 40,
  y: window.innerHeight / 2 - 40,
  visible: true,
  gifData: null, // { id, name, data?, createdAt }
})

// Trigger for showing importer (set by external callers)
const showImporterTrigger = ref(false)

function openImporter() {
  showImporterTrigger.value = true
}

function getGifPath(gif) {
  return `${MASCOT_DIR}/${gif.id}.gif`
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      mascotState.value = {
        x: data.x ?? mascotState.value.x,
        y: data.y ?? mascotState.value.y,
        visible: true,
        gifData: data.gifData ?? null,
      }
    }
  } catch (e) {
    console.warn('[Mascot] Failed to load state:', e)
  }
}

function persist() {
  try {
    const toSave = {
      x: mascotState.value.x,
      y: mascotState.value.y,
      visible: mascotState.value.visible,
      gifData: mascotState.value.gifData
        ? {
            id: mascotState.value.gifData.id,
            name: mascotState.value.gifData.name,
            createdAt: mascotState.value.gifData.createdAt,
            ...(isNative() ? {} : { data: mascotState.value.gifData.data }),
          }
        : null,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch (e) {
    console.error('[Mascot] Failed to persist state:', e)
  }
}

async function loadGifDataUrl() {
  const gif = mascotState.value.gifData
  if (!gif) return null
  if (gif.data) return gif.data

  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const result = await Filesystem.readFile({
        path: getGifPath(gif),
        directory: Directory.Data,
      })
      // 返回 base64 data URL
      return `data:image/gif;base64,${result.data}`
    } catch (e) {
      console.warn('[Mascot] Failed to read GIF from filesystem:', e)
      return null
    }
  }
  return null
}

function importGif(file) {
  return new Promise((resolve, reject) => {
    const fileName = file.name.toLowerCase()

    // 仅支持 GIF 格式
    if (!fileName.endsWith('.gif')) {
      reject(new Error('仅支持 GIF 格式'))
      return
    }

    if (file.size > MAX_MASCOT_SIZE) {
      reject(new Error(`GIF 文件大小超过 2MB 限制`))
      return
    }

    // GIF 文件：读取为 base64 data URL
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const dataUrl = e.target.result

        mascotState.value.gifData = {
          id: `gif_${Date.now()}`,
          name: file.name.replace(/\.gif$/i, ''),
          data: dataUrl,
          createdAt: Date.now(),
        }
        persist()
        resolve(mascotState.value.gifData)
      } catch (err) {
        console.error('[Mascot] Failed to process GIF:', err)
        reject(new Error('GIF 处理失败'))
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

function resetPosition() {
  mascotState.value.x = window.innerWidth / 2 - 40
  mascotState.value.y = window.innerHeight / 2 - 40
  persist()
}

function toggleVisibility() {
  mascotState.value.visible = !mascotState.value.visible
  persist()
}

// Auto-load on module import
load()

export function useMascotStorage() {
  return { mascotState, importGif, loadGifDataUrl, resetPosition, toggleVisibility, persist, MAX_MASCOT_SIZE, showImporterTrigger, openImporter }
}
