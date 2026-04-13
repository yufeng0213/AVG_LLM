import { ref, computed } from 'vue'

const STORAGE_KEY = 'dormitory:avatars'
const MAX_FILE_SIZE = 1.5 * 1024 * 1024 // 1.5MB

const avatars = ref([])
const activeAvatarDataUrl = ref(null)

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      avatars.value = data.avatars || []
      activeAvatarDataUrl.value = data.activeAvatarDataUrl || null
    }
  } catch (e) {
    console.warn('[Avatar] Failed to load avatars:', e)
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      avatars: avatars.value,
      activeAvatarDataUrl: activeAvatarDataUrl.value,
    }))
  } catch (e) {
    console.error('[Avatar] Failed to persist avatars:', e)
  }
}

function selectAvatar(id) {
  const avatar = avatars.value.find(a => a.id === id)
  if (avatar) {
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
  })
}

function deleteAvatars(ids) {
  avatars.value = avatars.value.filter(a => !ids.includes(a.id))
  // 如果删除了当前选中的头像，重置
  const stillExists = avatars.value.some(a => a.dataUrl === activeAvatarDataUrl.value)
  if (!stillExists) {
    activeAvatarDataUrl.value = null
    persist()
  }
}

// 模块加载时自动读取
load()

export function useAvatar() {
  return { avatars, activeAvatarDataUrl, selectAvatar, importAvatar, deleteAvatars }
}
