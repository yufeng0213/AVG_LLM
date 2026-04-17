/**
 * useAudioRecording.js - 浏览器麦克风录音封装
 * 使用 MediaRecorder + getUserMedia + AnalyserNode 电平监测。
 */
import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { MicrophonePermission } from '../../../../src/capacitor-plugins/MicrophonePermission.js'

export function useAudioRecording() {
  const isRecording = ref(false)
  const recordingDuration = ref(0)
  const audioLevel = ref(0)
  const isSupported = ref(true)

  let mediaRecorder = null
  let audioChunks = []
  let stream = null
  let analyser = null
  let audioContext = null
  let levelRaf = null
  let timerInterval = null

  async function ensureMicrophonePermission() {
    if (Capacitor.isNativePlatform()) {
      const result = await MicrophonePermission.requestPermission()
      if (!result.granted) {
        throw new Error('麦克风权限被拒绝，请在系统设置中允许麦克风访问')
      }
    }
  }

  function checkSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      isSupported.value = false
      return false
    }
    if (typeof MediaRecorder === 'undefined') {
      isSupported.value = false
      return false
    }
    return true
  }

  function getMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ]
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t
    }
    return ''
  }

  function updateLevel() {
    if (!analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    const avg = data.reduce((a, b) => a + b, 0) / data.length
    audioLevel.value = Math.min(1, avg / 128)
    levelRaf = requestAnimationFrame(updateLevel)
  }

  async function startRecording() {
    if (!checkSupport()) {
      throw new Error('浏览器不支持录音功能')
    }

    await ensureMicrophonePermission()

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    audioContext = new AudioContext({ sampleRate: 16000 })
    const source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.3
    source.connect(analyser)

    levelRaf = requestAnimationFrame(updateLevel)

    const startTime = Date.now()
    timerInterval = setInterval(() => {
      recordingDuration.value = Math.round((Date.now() - startTime) / 100) / 10
    }, 100)

    audioChunks = []
    const mimeType = getMimeType()
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunks.push(e.data)
      }
    }

    mediaRecorder.start(100)
    isRecording.value = true
  }

  function stopRecording() {
    return new Promise((resolve, reject) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        cleanup()
        reject(new Error('未开始录音'))
        return
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, {
          type: mediaRecorder.mimeType || 'audio/webm',
        })
        cleanup()
        resolve(blob)
      }

      mediaRecorder.onerror = (e) => {
        cleanup()
        reject(e)
      }

      mediaRecorder.stop()
    })
  }

  function cancelRecording() {
    cleanup()
  }

  function cleanup() {
    isRecording.value = false
    recordingDuration.value = 0
    audioLevel.value = 0

    if (levelRaf) {
      cancelAnimationFrame(levelRaf)
      levelRaf = null
    }
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
    }
    if (analyser) {
      analyser.disconnect()
      analyser = null
    }
    if (audioContext) {
      audioContext.close()
      audioContext = null
    }
    mediaRecorder = null
    audioChunks = []
  }

  return {
    isRecording,
    recordingDuration,
    audioLevel,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
  }
}
