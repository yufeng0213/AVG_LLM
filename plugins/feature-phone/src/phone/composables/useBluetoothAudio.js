/**
 * useBluetoothAudio.js — 蓝牙音响连接状态检测
 *
 * 通过 navigator.mediaDevices.enumerateDevices() 检测是否有
 * 非内置的音频输出设备（蓝牙音响/耳机/USB 音响等）。
 * 监听 devicechange 事件实时更新状态。
 */
import { onMounted, onUnmounted, readonly, ref } from 'vue'

// 已知的内置/虚拟设备关键词
const BUILT_IN_KEYWORDS = [
  'built-in', 'builtin', 'internal', 'speaker', '扬声器',
  'default', '虚拟', 'virtual', 'null', 'none',
  'microphone', '麦克风', '摄像头', 'camera',
]

export function useBluetoothAudio() {
  const isBluetoothConnected = ref(false)
  const bluetoothDeviceName = ref('')
  const isSupported = ref(false)

  let deviceChangeHandler = null

  async function detectDevices() {
    if (!('mediaDevices' in navigator)) return

    try {
      // 需要先获取权限才能看到完整设备列表
      // 尝试获取音频输出权限
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(t => t.stop())
      } catch {
        // 没有麦克风权限也能继续，只是可能看不到设备名
      }

      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput')
      const audioInputs = devices.filter(d => d.kind === 'audioinput')

      // 找非内置的音频输出设备
      const externalOutputs = audioOutputs.filter(d => {
        const label = (d.label || '').toLowerCase()
        return !BUILT_IN_KEYWORDS.some(kw => label.includes(kw)) && label.length > 0
      })

      // 也检查 input 设备里的蓝牙设备
      const bluetoothInputs = audioInputs.filter(d => {
        const label = (d.label || '').toLowerCase()
        return (label.includes('bluetooth') || label.includes('bt') || label.includes('bt-')) && label.length > 0
      })

      const externalDevices = [...externalOutputs, ...bluetoothInputs]

      if (externalDevices.length > 0) {
        isBluetoothConnected.value = true
        bluetoothDeviceName.value = externalDevices[0].label || '蓝牙音响'
      } else {
        // 如果没有 audiooutput 设备（Firefox 默认不暴露），
        // 尝试通过 input 设备名推断
        const btInDevices = audioInputs.filter(d => {
          const label = (d.label || '').toLowerCase()
          return label.includes('bluetooth') || label.includes('bt ') || label.includes('hands-free')
        })
        if (btInDevices.length > 0) {
          isBluetoothConnected.value = true
          bluetoothDeviceName.value = btInDevices[0].label || '蓝牙设备'
        } else {
          isBluetoothConnected.value = false
          bluetoothDeviceName.value = ''
        }
      }
    } catch (e) {
      // enumerateDevices 在不安全上下文中不可用
    }
  }

  onMounted(async () => {
    if (!('mediaDevices' in navigator)) {
      isSupported.value = false
      return
    }

    isSupported.value = true
    await detectDevices()

    deviceChangeHandler = () => {
      detectDevices()
    }
    navigator.mediaDevices.addEventListener('devicechange', deviceChangeHandler)
  })

  onUnmounted(() => {
    if (deviceChangeHandler && 'mediaDevices' in navigator) {
      navigator.mediaDevices.removeEventListener('devicechange', deviceChangeHandler)
    }
  })

  return {
    isBluetoothConnected: readonly(isBluetoothConnected),
    bluetoothDeviceName: readonly(bluetoothDeviceName),
    isSupported: readonly(isSupported),
    refresh: detectDevices,
  }
}
