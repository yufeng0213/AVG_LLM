import { ref, computed } from 'vue'
import { isNative } from '../../../../src/utils/platform.js'

const STORAGE_KEY = 'dormitory:avatarFrames'
const FRAME_DIR = 'avg_llm_frames'
const MAX_FILE_SIZE = 1.5 * 1024 * 1024 // 1.5MB

const frames = ref([])
const activeFrameId = ref(null)

/**
 * 获取头像框的文件路径
 */
function getFramePath(frame) {
  const ext = frame.fileType || 'png'
  return `${FRAME_DIR}/${frame.id}.${ext}`
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      // 只加载元数据，不加载 dataUrl（原生环境 dataUrl 为空，需要时再读取）
      frames.value = (data.frames || []).map(f => ({
        id: f.id,
        name: f.name,
        fileType: f.fileType || 'png',
        createdAt: f.createdAt,
        dataUrl: f.dataUrl || null, // Web 环境保留 dataUrl，原生环境为 null
      }))
      activeFrameId.value = data.activeFrameId || null
    }
  } catch (e) {
    console.warn('[AvatarFrame] Failed to load frames:', e)
  }
}

function persist() {
  try {
    // 原生环境：只保存元数据，不保存 dataUrl
    const dataToSave = {
      frames: frames.value.map(f => ({
        id: f.id,
        name: f.name,
        fileType: f.fileType,
        createdAt: f.createdAt,
        ...(isNative() ? {} : { dataUrl: f.dataUrl }),
      })),
      activeFrameId: activeFrameId.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
  } catch (e) {
    console.error('[AvatarFrame] Failed to persist frames:', e)
  }
}

function selectFrame(id) {
  activeFrameId.value = id
  persist()
}

async function loadFrameDataUrl(frame) {
  if (frame.dataUrl) return frame.dataUrl

  if (isNative()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      const result = await Filesystem.readFile({
        path: getFramePath(frame),
        directory: Directory.Documents,
        encoding: Encoding.Base64,
      })
      const ext = frame.fileType || 'png'
      const mime = ext === 'gif' ? 'image/gif' : 'image/png'
      return `data:${mime};base64,${result.data}`
    } catch (e) {
      console.warn('[AvatarFrame] Failed to read frame from filesystem:', e)
      return null
    }
  }

  return null
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

    if (isNative()) {
      // 原生环境：直接用 Capacitor Filesystem 保存文件
      const frameId = `custom_${Date.now()}`
      const ext = fileName.endsWith('.gif') ? 'gif' : 'png'
      const fileNameSafe = `${frameId}.${ext}`

      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')

          // 确保目录存在
          try {
            await Filesystem.mkdir({
              path: FRAME_DIR,
              directory: Directory.Documents,
              recursive: true,
            })
          } catch {
            // 目录可能已存在
          }

          // 保存文件
          const base64Data = e.target.result
          await Filesystem.writeFile({
            path: `${FRAME_DIR}/${fileNameSafe}`,
            data: base64Data,
            directory: Directory.Documents,
            encoding: Encoding.Base64,
          })

          const frame = {
            id: frameId,
            name: file.name.replace(/\.(png|gif)$/i, ''),
            dataUrl: null, // 原生环境不保留 dataUrl 在内存中
            fileType: ext,
            createdAt: Date.now(),
          }
          frames.value.push(frame)
          activeFrameId.value = frame.id
          persist()
          resolve(frame)
        } catch (err) {
          console.error('[AvatarFrame] Failed to save frame to filesystem:', err)
          reject(new Error('保存头像框失败'))
        }
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    } else {
      // Web / Electron 环境：保留原有的 localStorage 方式
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
    }
  })
}

function deleteFrames(ids) {
  // 原生环境：同时删除文件系统上的文件
  if (isNative()) {
    const toDelete = frames.value.filter(f => ids.includes(f.id))
    toDelete.forEach(async (frame) => {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        await Filesystem.deleteFile({
          path: getFramePath(frame),
          directory: Directory.Documents,
        })
      } catch (e) {
        console.warn('[AvatarFrame] Failed to delete frame file:', e)
      }
    })
  }

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
  return { frames, activeFrameId, activeFrame, selectFrame, importFrame, deleteFrames, getFrameById, loadFrameDataUrl }
}
