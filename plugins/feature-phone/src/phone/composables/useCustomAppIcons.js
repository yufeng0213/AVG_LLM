/**
 * useCustomAppIcons.js - 自定义应用图标管理
 * 存储和加载用户为每个应用上传的自定义图标
 */
import { reactive, ref } from 'vue'
import { kvStorage } from '../../../../../src/storage/index.js'

const STORAGE_KEY = 'avg_llm_phone_custom_icons_v1'

// 模块级状态（单例）
let _customIcons = null
let _initialized = false

async function loadCustomIcons() {
  const stored = await kvStorage.get(STORAGE_KEY)
  _customIcons = stored && typeof stored === 'object' ? stored : {}
  _initialized = true
}

async function saveCustomIcons() {
  await kvStorage.set(STORAGE_KEY, _customIcons)
}

/**
 * @param {Object} options
 * @param {string} options.filePickerId - 隐藏的文件输入框 ID
 * @returns {Object}
 */
export function useCustomAppIcons(options = {}) {
  if (!_initialized) {
    _customIcons = {}
    _initialized = true
    loadCustomIcons()
  }

  const icons = reactive(_customIcons)

  /**
   * 获取应用图标（自定义优先，否则返回 null）
   */
  function getCustomIcon(appId) {
    return icons[appId] || null
  }

  /**
   * 触发文件选择
   */
  function triggerFilePicker(filePickerId) {
    const input = document.getElementById(filePickerId)
    if (input) input.click()
  }

  /**
   * 处理文件选择：读取图片并压缩后存储
   */
  async function handleFileSelect(event, appId, maxSize = 60) {
    const file = event.target?.files?.[0]
    if (!file || !file.type.startsWith('image/')) return null

    // 读取为 Image
    const img = new Image()
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        img.onload = () => resolve(e.target.result)
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })

    // 压缩到目标尺寸
    const compressed = await compressImage(img, maxSize)
    icons[appId] = compressed
    await saveCustomIcons()
    return compressed
  }

  /**
   * 移除自定义图标（恢复默认）
   */
  async function removeCustomIcon(appId) {
    delete icons[appId]
    await saveCustomIcons()
  }

  /**
   * 压缩图片为小尺寸 data URL
   */
  function compressImage(img, size) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, size, size)
    return canvas.toDataURL('image/png', 0.8)
  }

  return {
    icons,
    getCustomIcon,
    triggerFilePicker,
    handleFileSelect,
    removeCustomIcon,
  }
}
