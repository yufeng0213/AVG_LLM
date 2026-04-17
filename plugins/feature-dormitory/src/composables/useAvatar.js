import { ref, computed } from 'vue'
import { isNative } from '../../../../src/utils/platform.js'

const STORAGE_KEY = 'dormitory:avatars'
const AVATAR_DIR = 'avg_llm_avatars'
const MAX_FILE_SIZE = 1.5 * 1024 * 1024 // 1.5MB

const avatars = ref([])
const activeAvatarDataUrl = ref(null)
const activeAvatarId = ref(null)

/**
 * 获取头像的文件路径（原生环境）或 dataUrl（Web/Electron）
 */
function getAvatarPath(avatar) {
  return `${AVATAR_DIR}/${avatar.id}.png`
}

/**
 * 从文件系统读取头像 dataUrl（仅用于 Web/Electron 回退显示）
 */
async function loadAvatarDataUrl(avatar) {
  // 原生环境：通过 Capacitor Filesystem 读取为 base64
  if (isNative()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      const result = await Filesystem.readFile({
        path: getAvatarPath(avatar),
        directory: Directory.Documents,
        encoding: Encoding.Base64,
      })
      // Capacitor 返回的 data 是 base64 字符串（不含 data URI 前缀）
      const base64 = typeof result.data === 'string' ? result.data : result.data
      return `data:image/png;base64,${base64}`
    } catch (e) {
      console.warn('[Avatar] Failed to read avatar from filesystem:', e)
      return null
    }
  }

  // Electron / Web 回退：dataUrl 已经存在内存中
  return avatar.dataUrl || null
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      // 只加载元数据，不加载 dataUrl（原生环境 dataUrl 为空，需要时再读取）
      avatars.value = (data.avatars || []).map(a => ({
        id: a.id,
        name: a.name,
        createdAt: a.createdAt,
        dataUrl: a.dataUrl || null, // Web 环境保留 dataUrl，原生环境为 null
      }))
      activeAvatarId.value = data.activeAvatarId || null
      activeAvatarDataUrl.value = data.activeAvatarDataUrl || null
    }
  } catch (e) {
    console.warn('[Avatar] Failed to load avatars:', e)
  }
}

function persist() {
  try {
    // 原生环境：只保存元数据，不保存 dataUrl（图片存在文件系统）
    const dataToSave = {
      avatars: avatars.value.map(a => ({
        id: a.id,
        name: a.name,
        createdAt: a.createdAt,
        ...(isNative() ? {} : { dataUrl: a.dataUrl }),
      })),
      activeAvatarId: activeAvatarId.value,
      activeAvatarDataUrl: isNative() ? null : activeAvatarDataUrl.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
  } catch (e) {
    console.error('[Avatar] Failed to persist avatars:', e)
  }
}

function selectAvatar(id) {
  const avatar = avatars.value.find(a => a.id === id)
  if (!avatar) return

  activeAvatarId.value = id

  if (isNative()) {
    // 原生环境：从文件系统读取当前头像
    loadAvatarDataUrl(avatar).then(url => {
      if (url) {
        activeAvatarDataUrl.value = url
        persist()
      }
    })
  } else {
    activeAvatarDataUrl.value = avatar.dataUrl
    persist()
  }
}

function importAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file.name.toLowerCase().endsWith('.png')) {
      reject(new Error('仅支持 PNG 格式'))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error('文件大小不能超过 1.5MB'))
      return
    }

    if (isNative()) {
      // 原生环境：直接用 Capacitor Filesystem 保存文件
      const avatarId = `avatar_${Date.now()}`
      const fileName = `${avatarId}.png`

      // 使用 FileReader 读取为 ArrayBuffer 再保存
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')

          // 确保目录存在
          try {
            await Filesystem.mkdir({
              path: AVATAR_DIR,
              directory: Directory.Documents,
              recursive: true,
            })
          } catch {
            // 目录可能已存在
          }

          // 保存文件
          const base64Data = e.target.result
          await Filesystem.writeFile({
            path: `${AVATAR_DIR}/${fileName}`,
            data: base64Data,
            directory: Directory.Documents,
            encoding: Encoding.Base64,
          })

          const avatar = {
            id: avatarId,
            name: file.name.replace(/\.png$/i, ''),
            dataUrl: null, // 原生环境不保留 dataUrl 在内存中
            createdAt: Date.now(),
          }
          avatars.value.push(avatar)

          // 读取为当前激活头像
          activeAvatarDataUrl.value = base64Data
          persist()
          resolve(avatar)
        } catch (err) {
          console.error('[Avatar] Failed to save avatar to filesystem:', err)
          reject(new Error('保存头像失败'))
        }
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    } else {
      // Web / Electron 环境：保留原有的 localStorage 方式
      const reader = new FileReader()
      reader.onload = (e) => {
        const avatar = {
          id: `avatar_${Date.now()}`,
          name: file.name.replace(/\.png$/i, ''),
          dataUrl: e.target.result,
          createdAt: Date.now(),
        }
        avatars.value.push(avatar)
        activeAvatarDataUrl.value = avatar.dataUrl
        persist()
        resolve(avatar)
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    }
  })
}

function deleteAvatars(ids) {
  // 原生环境：同时删除文件系统上的文件
  if (isNative()) {
    const toDelete = avatars.value.filter(a => ids.includes(a.id))
    toDelete.forEach(async (avatar) => {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        await Filesystem.deleteFile({
          path: getAvatarPath(avatar),
          directory: Directory.Documents,
        })
      } catch (e) {
        console.warn('[Avatar] Failed to delete avatar file:', e)
      }
    })
  }

  avatars.value = avatars.value.filter(a => !ids.includes(a.id))
  const stillExists = avatars.value.some(a => a.dataUrl === activeAvatarDataUrl.value)
  if (!stillExists) {
    activeAvatarDataUrl.value = null
    persist()
  }
}

// 模块加载时自动读取
load()

export function useAvatar() {
  return { avatars, activeAvatarId, activeAvatarDataUrl, selectAvatar, importAvatar, deleteAvatars }
}
