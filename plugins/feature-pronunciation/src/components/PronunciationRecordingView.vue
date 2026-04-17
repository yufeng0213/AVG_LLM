<script setup>
/**
 * PronunciationRecordingView.vue - 录音页
 * 录制/回放对比，单弹窗体验。
 */
import { ref, onMounted, nextTick } from 'vue'
import { useAudioRecording } from '../composables/useAudioRecording.js'
import { extractPCM } from '../composables/useAudioScoring.js'
import { storeAudioBlob } from '../storage/pronunciationAudioStore.js'

const props = defineProps({
  item: { type: Object, required: true },
  referenceAudio: { type: [Blob, ArrayBuffer], required: true },
  lessonId: { type: String, required: true },
})
const emit = defineEmits(['close', 'recorded'])

const {
  isRecording,
  recordingDuration,
  audioLevel,
  isSupported,
  startRecording,
  stopRecording,
  cancelRecording,
} = useAudioRecording()

const error = ref('')

// 波形对比
const refCanvas = ref(null)
const userCanvas = ref(null)
const isPlayingRef = ref(false)
const isPlayingUser = ref(false)
let currentAudio = null
let cachedUserBlob = null
let hasRecording = ref(false)

function getLevelPercent() {
  return Math.round(audioLevel * 100)
}

function drawWaveform(canvas, data, color) {
  if (!canvas || !data.length) return
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  const mid = height / 2

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, mid)
  ctx.lineTo(width, mid)
  ctx.stroke()

  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const step = Math.max(1, Math.floor(data.length / width))
  for (let i = 0; i < width; i++) {
    const idx = Math.min(i * step, data.length - 1)
    const y = mid + data[idx] * mid * 0.9
    if (i === 0) ctx.moveTo(i, y)
    else ctx.lineTo(i, y)
  }
  ctx.stroke()
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  isPlayingRef.value = false
  isPlayingUser.value = false
}

function playReference() {
  stopCurrentAudio()
  const audio = props.referenceAudio
  const blob = audio instanceof Blob ? audio : new Blob([audio], { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  currentAudio = new Audio(url)
  isPlayingRef.value = true
  currentAudio.onended = () => { isPlayingRef.value = false; URL.revokeObjectURL(url); currentAudio = null }
  currentAudio.onerror = () => { isPlayingRef.value = false; URL.revokeObjectURL(url); currentAudio = null }
  currentAudio.play()
}

function playUserRecording() {
  stopCurrentAudio()
  if (!cachedUserBlob) return
  const url = URL.createObjectURL(cachedUserBlob)
  currentAudio = new Audio(url)
  isPlayingUser.value = true
  currentAudio.onended = () => { isPlayingUser.value = false; URL.revokeObjectURL(url); currentAudio = null }
  currentAudio.onerror = () => { isPlayingUser.value = false; URL.revokeObjectURL(url); currentAudio = null }
  currentAudio.play()
}

async function drawUserWaveform() {
  if (!cachedUserBlob) return
  const userPCM = await extractPCM(cachedUserBlob)
  await nextTick()
  if (userCanvas.value) drawWaveform(userCanvas.value, userPCM, '#34c759')
}

async function onToggleRecord() {
  if (isRecording.value) {
    await onStop()
  } else {
    await onStart()
  }
}

async function onStart() {
  error.value = ''
  try {
    await startRecording()
  } catch (e) {
    error.value = e.message || '录音启动失败'
  }
}

async function onStop() {
  try {
    const userBlob = await stopRecording()
    if (!userBlob || userBlob.size < 100) {
      error.value = '录音太短，请重新录制'
      return
    }

    cachedUserBlob = userBlob
    hasRecording.value = true

    const userAudioKey = `pron_user_${props.item.id}_${Date.now()}`
    try {
      await storeAudioBlob(userAudioKey, await userBlob.arrayBuffer())
    } catch {
      // 存储失败不影响回放
    }

    emit('recorded', {
      itemId: props.item.id,
      userAudioKey,
    })

    await drawUserWaveform()
  } catch (e) {
    error.value = e.message || '录音失败'
  }
}

function onClose() {
  if (isRecording.value) {
    cancelRecording()
  }
  emit('close')
}

onMounted(async () => {
  // 绘制标准波形
  const pcm = await extractPCM(props.referenceAudio)
  await nextTick()
  if (refCanvas.value) drawWaveform(refCanvas.value, pcm, '#667eea')
  // 如果已有缓存的用户录音（重录），也绘制
  if (cachedUserBlob) await drawUserWaveform()
})
</script>

<template>
  <div class="pron-recording">
    <div class="recording-card">
      <!-- 当前练习内容 -->
      <div class="practice-text">
        <h3>{{ item.text }}</h3>
        <p class="phonetic">{{ item.phonetic }}</p>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="error-msg">{{ error }}</div>

      <!-- 录音电平指示（录音中） -->
      <div v-if="isRecording" class="level-meter">
        <div class="level-bar">
          <div
            class="level-fill"
            :style="{ width: getLevelPercent() + '%' }"
            :class="{ active: isRecording }"
          ></div>
        </div>
        <div class="duration">{{ recordingDuration.toFixed(1) }}s</div>
      </div>

      <!-- 波形对比 -->
      <div class="waveform-section">
        <div class="waveform-item">
          <div class="waveform-header">
            <span class="waveform-label">标准发音</span>
            <button class="waveform-play-btn" @click="playReference" :disabled="isPlayingRef">
              {{ isPlayingRef ? '⏸' : '🔊' }}
            </button>
          </div>
          <canvas ref="refCanvas" width="320" height="80" class="waveform-canvas"></canvas>
        </div>
        <div class="waveform-item">
          <div class="waveform-header">
            <span class="waveform-label">你的发音</span>
            <button
              v-if="hasRecording"
              class="waveform-play-btn"
              @click="playUserRecording"
              :disabled="isPlayingUser"
            >
              {{ isPlayingUser ? '⏸' : '🔊' }}
            </button>
            <span v-else class="waveform-hint">录音后显示</span>
          </div>
          <div class="waveform-canvas-wrapper">
            <canvas
              ref="userCanvas"
              width="320"
              height="80"
              class="waveform-canvas"
              :class="{ empty: !hasRecording }"
            ></canvas>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="recording-actions">
        <!-- 未录音 -->
        <button
          v-if="!isRecording && !hasRecording"
          class="record-btn"
          @click="onToggleRecord"
        >
          {{ isSupported ? '🎤 开始录音' : '浏览器不支持录音' }}
        </button>

        <!-- 录音中 -->
        <button
          v-if="isRecording"
          class="stop-btn"
          @click="onToggleRecord"
        >
          ⏹ 停止
        </button>

        <!-- 已录音：重录 / 完成 -->
        <div v-if="hasRecording && !isRecording" class="result-actions">
          <button class="retry-btn" @click="onStart">🔄 重新录音</button>
          <button class="done-btn" @click="onClose">完成</button>
        </div>

        <!-- 未录音时：取消 -->
        <button
          v-if="!hasRecording && !isRecording"
          class="close-btn"
          @click="onClose"
        >
          取消
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pron-recording {
  position: fixed;
  inset: 0;
  z-index: 10003;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.recording-card {
  width: 100%;
  max-width: 400px;
  background: #1a1a2e;
  border-radius: 20px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.practice-text {
  text-align: center;
}

.practice-text h3 {
  margin: 0 0 4px;
  font-size: 1.3rem;
  font-weight: 700;
}

.phonetic {
  color: #667eea;
  font-size: 0.85rem;
  margin: 0;
}

.error-msg {
  padding: 10px;
  background: rgba(255, 59, 48, 0.1);
  border-radius: 10px;
  color: #ff6b6b;
  font-size: 0.85rem;
  text-align: center;
}

.level-meter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.level-bar {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.level-fill {
  height: 100%;
  background: rgba(102, 126, 234, 0.3);
  border-radius: 4px;
  transition: width 0.1s, background 0.2s;
}

.level-fill.active {
  background: linear-gradient(90deg, #34c759, #667eea);
}

.duration {
  font-size: 0.8rem;
  color: #667eea;
  font-weight: 600;
}

.waveform-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
}

.waveform-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.waveform-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.waveform-play-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(102, 126, 234, 0.2);
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.waveform-play-btn:hover {
  background: rgba(102, 126, 234, 0.4);
}

.waveform-play-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.waveform-label {
  font-size: 0.75rem;
  color: #888;
}

.waveform-hint {
  font-size: 0.7rem;
  color: #555;
}

.waveform-canvas-wrapper {
  position: relative;
  width: 100%;
  height: 80px;
}

.waveform-canvas {
  width: 100%;
  height: 80px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
}

.waveform-canvas.empty {
  opacity: 0.3;
}

.recording-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.record-btn {
  padding: 16px;
  background: linear-gradient(135deg, #ff3b30, #ff6b6b);
  border: none;
  border-radius: 14px;
  color: #fff;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
}

.stop-btn {
  padding: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 14px;
  color: #fff;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
}

.result-actions {
  display: flex;
  gap: 10px;
}

.retry-btn {
  flex: 1;
  padding: 12px;
  background: rgba(102, 126, 234, 0.2);
  border: none;
  border-radius: 12px;
  color: #667eea;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.done-btn {
  flex: 1;
  padding: 12px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.close-btn {
  padding: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  border-radius: 12px;
  color: #888;
  font-size: 0.9rem;
  cursor: pointer;
}


  .platform-android.android-portrait .waveform-play-btn,
  .platform-android.android-portrait .retry-btn,
  .platform-android.android-portrait .done-btn,
  .platform-android.android-portrait .close-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }
</style>
