import { ref } from 'vue'
import { isNative } from '../../../../src/utils/platform.js'

const STORAGE_KEY = 'avg_llm_mascot_v1'
const MASCOT_DIR = 'avg_llm_mascot'
const MAX_GIF_SIZE = 2 * 1024 * 1024 // 2MB

const mascotState = ref({
  x: window.innerWidth / 2 - 40,
  y: window.innerHeight / 2 - 40,
  visible: true,
  gifData: null, // { id, name, fileType, dataUrl?, createdAt }
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
            fileType: 'gif',
            createdAt: mascotState.value.gifData.createdAt,
            ...(isNative() ? {} : { dataUrl: mascotState.value.gifData.dataUrl }),
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
  if (gif.dataUrl) return gif.dataUrl

  if (isNative()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      const result = await Filesystem.readFile({
        path: getGifPath(gif),
        directory: Directory.Data,
        encoding: Encoding.Base64,
      })
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
    if (!fileName.endsWith('.gif')) {
      reject(new Error('仅支持 GIF 格式'))
      return
    }

    const warnSize = file.size > MAX_GIF_SIZE
    if (warnSize) {
      console.warn(`[Mascot] GIF ${Math.round(file.size / 1024)}KB > 2MB recommended`)
    }

    if (isNative()) {
      const gifId = `mascot_${Date.now()}`
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')

          try {
            await Filesystem.mkdir({
              path: MASCOT_DIR,
              directory: Directory.Data,
              recursive: true,
            })
          } catch {}

          await Filesystem.writeFile({
            path: `${MASCOT_DIR}/${gifId}.gif`,
            data: e.target.result,
            directory: Directory.Data,
            encoding: Encoding.Base64,
          })

          mascotState.value.gifData = {
            id: gifId,
            name: file.name.replace(/\.gif$/i, ''),
            dataUrl: null,
            fileType: 'gif',
            createdAt: Date.now(),
          }
          persist()
          resolve(mascotState.value.gifData)
        } catch (err) {
          console.error('[Mascot] Failed to save GIF:', err)
          reject(new Error('保存 GIF 失败'))
        }
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    } else {
      const reader = new FileReader()
      reader.onload = (e) => {
        mascotState.value.gifData = {
          id: `mascot_${Date.now()}`,
          name: file.name.replace(/\.gif$/i, ''),
          dataUrl: e.target.result,
          fileType: 'gif',
          createdAt: Date.now(),
        }
        persist()
        resolve(mascotState.value.gifData)
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    }
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
  return { mascotState, importGif, loadGifDataUrl, resetPosition, toggleVisibility, persist, MAX_GIF_SIZE, showImporterTrigger, openImporter }
}
