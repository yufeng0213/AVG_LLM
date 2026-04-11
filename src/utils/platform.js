/**
 * 平台检测工具
 * 用于检测当前运行环境（Electron、Android、Web）
 */

/**
 * 检测是否在 Electron 环境中运行
 * @returns {boolean}
 */
export const isElectron = () => {
  return typeof window !== 'undefined' && 
         window.electronAPI !== undefined
}

/**
 * 检测是否在 Android 原生环境中运行
 * @returns {boolean}
 */
export const isAndroid = () => {
  return typeof window !== 'undefined' && 
         window.Capacitor?.getPlatform() === 'android'
}

/**
 * 检测是否在 iOS 原生环境中运行
 * @returns {boolean}
 */
export const isIOS = () => {
  return typeof window !== 'undefined' && 
         window.Capacitor?.getPlatform() === 'ios'
}

/**
 * 检测是否在原生移动端运行（Android 或 iOS）
 * @returns {boolean}
 */
export const isNative = () => {
  return typeof window !== 'undefined' && 
         window.Capacitor?.isNativePlatform() === true
}

/**
 * 检测是否在 Web 浏览器中运行（非原生环境）
 * @returns {boolean}
 */
export const isWeb = () => {
  return !isElectron() && !isNative()
}

/**
 * 获取当前平台名称
 * @returns {'electron' | 'android' | 'ios' | 'web'}
 */
export const getPlatform = () => {
  if (isElectron()) return 'electron'
  if (isAndroid()) return 'android'
  if (isIOS()) return 'ios'
  return 'web'
}

/**
 * 检测是否为移动设备（通过屏幕宽度和触摸支持）
 * @returns {boolean}
 */
export const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= 768 || 
         ('ontouchstart' in window && window.innerWidth <= 1024)
}

/**
 * 检测是否支持触摸
 * @returns {boolean}
 */
export const isTouchDevice = () => {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || 
         navigator.maxTouchPoints > 0
}

/**
 * 检测当前是否为竖屏模式
 * @returns {boolean}
 */
export const isPortrait = () => {
  if (typeof window === 'undefined') return false
  return window.innerHeight > window.innerWidth
}

/**
 * 检测当前是否为横屏模式
 * @returns {boolean}
 */
export const isLandscape = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth > window.innerHeight
}

/**
 * 平台信息对象
 */
export const platform = {
  isElectron,
  isAndroid,
  isIOS,
  isNative,
  isWeb,
  getPlatform,
  isMobileDevice,
  isTouchDevice,
  isPortrait,
  isLandscape,
}

export default platform