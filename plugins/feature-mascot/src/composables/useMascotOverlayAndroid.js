import { registerPlugin } from '@capacitor/core'

const MascotOverlay = registerPlugin('MascotOverlay', {
  android: {
    path: 'MascotPlugin',
  },
})

/**
 * Android 系统级悬浮窗控制器
 */
export async function checkOverlayPermission() {
  const result = await MascotOverlay.checkPermission()
  return result.granted
}

export async function requestOverlayPermission() {
  const result = await MascotOverlay.requestPermission()
  return result.granted
}

export async function createOverlay() {
  await MascotOverlay.create()
}

export async function destroyOverlay() {
  await MascotOverlay.destroy()
}

export async function showOverlay() {
  await MascotOverlay.show()
}

export async function hideOverlay() {
  await MascotOverlay.hide()
}

export async function loadOverlayUrl(url) {
  await MascotOverlay.loadUrl({ url })
}

/**
 * 将 mascot 状态（含 GIF base64）注入到 overlay WebView
 * 用于 Android 上主 app WebView 和 overlay WebView 之间的数据传递
 */
export async function setOverlayMascotData(state) {
  await MascotOverlay.setMascotData({ data: JSON.stringify(state) })
}

/**
 * 获取当前 overlay 中的 mascot 位置
 */
export async function getOverlayMascotData() {
  const result = await MascotOverlay.getMascotData()
  if (result.data) {
    try { return JSON.parse(result.data) } catch { return null }
  }
  return null
}
