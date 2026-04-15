<script setup>
/**
 * XylophoneScreen.vue - 木琴小游戏
 * 8键可弹奏木琴，支持自由弹奏、录音回放、跟弹挑战
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import Toast from '../Toast.vue'

const emit = defineEmits(['back', 'xylophone-result'])
const props = defineProps({
  coins: { type: Number, default: 0 },
})

// ====== 音符定义 ======

const NOTES = [
  { id: 'c4', name: 'Do',  freq: 261.63, label: '1', emoji: '🔴', color: '#ff4444', glow: 'rgba(255, 68, 68, 0.5)', height: 360 },
  { id: 'd4', name: 'Re',  freq: 293.66, label: '2', emoji: '🟠', color: '#ff8c00', glow: 'rgba(255, 140, 0, 0.5)', height: 330 },
  { id: 'e4', name: 'Mi',  freq: 329.63, label: '3', emoji: '🟡', color: '#ffd700', glow: 'rgba(255, 215, 0, 0.5)', height: 300 },
  { id: 'f4', name: 'Fa',  freq: 349.23, label: '4', emoji: '🟢', color: '#22c55e', glow: 'rgba(34, 197, 94, 0.5)', height: 276 },
  { id: 'g4', name: 'Sol', freq: 392.00, label: '5', emoji: '🔵', color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.5)', height: 252 },
  { id: 'a4', name: 'La',  freq: 440.00, label: '6', emoji: '🔵', color: '#6366f1', glow: 'rgba(99, 102, 241, 0.5)', height: 228 },
  { id: 'b4', name: 'Si',  freq: 493.88, label: '7', emoji: '🟣', color: '#a855f7', glow: 'rgba(168, 85, 247, 0.5)', height: 204 },
  { id: 'c5', name: 'Do\'', freq: 523.25, label: 'i', emoji: '🟣', color: '#ec4899', glow: 'rgba(236, 72, 153, 0.5)', height: 180 },
]

const NOTE_MAP = {}
NOTES.forEach((n, i) => { NOTE_MAP[i] = n })

// ====== 音频引擎 ======

let audioCtx = null

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

function playNote(index, duration = 0.2) {
  const ctx = ensureAudioCtx()
  const note = NOTE_MAP[index]
  if (!note) return

  const now = ctx.currentTime

  // 主振荡器 — 正弦波
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(note.freq, now)

  // 泛音 — 轻微三角波叠加增加木质感
  const osc2 = ctx.createOscillator()
  osc2.type = 'triangle'
  osc2.frequency.setValueAtTime(note.freq * 2, now)

  // 增益包络 — 快速 Attack + 指数 Decay 模拟木琴
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.35, now + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  const gain2 = ctx.createGain()
  gain2.gain.setValueAtTime(0, now)
  gain2.gain.linearRampToValueAtTime(0.08, now + 0.005)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6)

  osc.connect(gain).connect(ctx.destination)
  osc2.connect(gain2).connect(ctx.destination)

  osc.start(now)
  osc2.start(now)
  osc.stop(now + duration)
  osc2.stop(now + duration)
}

// ====== 模式 ======

const MODE = {
  FREE: 'free',
  RECORD: 'record',
  PLAYBACK: 'playback',
  CHALLENGE: 'challenge',
}

const mode = ref(MODE.FREE)

// ====== 自由弹奏 ======

const activeKeys = ref({}) // { index: true } 用于高亮

function handleKeyDown(index) {
  if (activeKeys.value[index]) return // 防重复
  activeKeys.value = { ...activeKeys.value, [index]: true }
  playNote(index)

  if (mode.value === MODE.RECORD) {
    const elapsed = recording.value.length === 0 ? 0 : Date.now() - recording.value[recording.value.length - 1].time
    recording.value.push({ noteIndex: index, time: Date.now(), gap: elapsed })
  }
}

function handleKeyUp(index) {
  const next = { ...activeKeys.value }
  delete next[index]
  activeKeys.value = next
}

// ====== 录音回放 ======

const recording = ref([])
const isRecording = computed(() => mode.value === MODE.RECORD)
const isPlaying = ref(false)
const playbackIndex = ref(-1)
const maxRecording = 20

function startRecording() {
  recording.value = []
  mode.value = MODE.RECORD
}

function stopRecording() {
  if (recording.value.length === 0) {
    showToast('还没有录到任何音符！', 'warning')
    return
  }
  mode.value = MODE.FREE
  showToast(`录制完成！共 ${recording.value.length} 个音符`, 'success')
}

function playRecording() {
  if (recording.value.length === 0 || isPlaying.value) return

  isPlaying.value = true
  let i = 0

  function playNext() {
    if (i >= recording.value.length) {
      isPlaying.value = false
      playbackIndex.value = -1
      return
    }

    const note = recording.value[i]
    playbackIndex.value = note.noteIndex
    playNote(note.noteIndex)

    const delay = i === 0 ? 0 : (note.gap || 400)
    i++
    setTimeout(playNext, Math.max(delay, 150))
  }

  playNext()
}

// ====== 跟弹挑战 ======

const CHALLENGE_COST = 5
const CHALLENGE_REWARD = 15
const CHALLENGE_BASE_LENGTH = 4
const CHALLENGE_MAX_LENGTH = 8

const challengeSequence = ref([])
const challengePlayerInput = ref([])
const challengeShowing = ref(false) // 正在演示旋律
const challengeActiveIndex = ref(-1) // 当前演示到的音符索引
const challengeLevel = ref(1)
const challengeStreak = ref(0)

function generateChallenge() {
  const len = Math.min(CHALLENGE_BASE_LENGTH + challengeStreak.value, CHALLENGE_MAX_LENGTH)
  const seq = []
  for (let i = 0; i < len; i++) {
    seq.push(Math.floor(Math.random() * 8))
  }
  challengeSequence.value = seq
  challengePlayerInput.value = []
}

async function startChallenge() {
  if (props.coins < CHALLENGE_COST) {
    showToast('金币不足！挑战需要 ' + CHALLENGE_COST + ' 💰', 'error')
    return
  }

  emit('xylophone-result', { cost: CHALLENGE_COST, earned: 0 })
  generateChallenge()
  mode.value = MODE.CHALLENGE
  await showChallengeSequence()
}

async function showChallengeSequence() {
  challengeShowing.value = true
  challengeActiveIndex.value = -1

  // 每个音符间隔演示
  for (let i = 0; i < challengeSequence.value.length; i++) {
    challengeActiveIndex.value = i
    playNote(challengeSequence.value[i], 0.3)
    await delay(500)
    challengeActiveIndex.value = -1
    await delay(200)
  }

  challengeShowing.value = false
  showToast('轮到你了！按顺序弹奏 ' + challengeSequence.value.length + ' 个音符', 'info')
}

function handleChallengeInput(noteIndex) {
  if (!challengeShowing.value && mode.value === MODE.CHALLENGE) {
    playNote(noteIndex)
    challengePlayerInput.value.push(noteIndex)

    const currentIdx = challengePlayerInput.value.length - 1
    const expected = challengeSequence.value[currentIdx]

    if (noteIndex !== expected) {
      // 失败
      mode.value = MODE.FREE
      challengeStreak.value = 0
      challengeLevel.value = 1
      showToast('弹错了！再试一次吧 (-' + CHALLENGE_COST + '💰)', 'error')
      return
    }

    // 检查是否完成全部
    if (challengePlayerInput.value.length === challengeSequence.value.length) {
      const reward = CHALLENGE_REWARD + challengeStreak.value * 2
      challengeStreak.value++
      challengeLevel.value = challengeStreak.value + 1
      emit('xylophone-result', { cost: 0, earned: reward })
      mode.value = MODE.FREE
      showToast('挑战成功！+' + reward + '💰 | 连胜 x' + challengeStreak.value, 'success')
    }
  }
}

// ====== Toast ======

const toastMessage = ref('')
const toastType = ref('success')
const toastVisible = ref(false)
let toastKey = 0

function showToast(msg, type = 'success') {
  toastKey++
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
  setTimeout(() => { toastVisible.value = false }, 3000)
}

// ====== 工具 ======

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ====== 键盘支持 ======

function handleKeyboard(e) {
  const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7 }
  if (keyMap[e.key] !== undefined) {
    handleKeyDown(keyMap[e.key])
    if (mode.value === MODE.CHALLENGE && !challengeShowing.value) {
      handleChallengeInput(keyMap[e.key])
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyboard)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboard)
  if (audioCtx) audioCtx.close()
})

defineExpose({
  playNote,
})
</script>

<template>
  <div class="xylophone-screen">
    <!-- Header -->
    <header class="xylo-header">
      <button type="button" class="xylo-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="xylo-title">🎵 木琴</h2>
      <div class="xylo-coin-box">
        <span class="xylo-coin-icon">💰</span>
        <span class="xylo-coin-value">{{ coins }}</span>
      </div>
    </header>

    <!-- 模式切换 -->
    <div class="xylo-mode-tabs">
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === MODE.FREE }"
        @click="mode = MODE.FREE"
      >
        自由弹奏
      </button>
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === MODE.RECORD || mode === MODE.PLAYBACK }"
        @click="mode = mode === MODE.FREE ? MODE.RECORD : MODE.FREE"
      >
        {{ isRecording ? '录音中...' : recording.length > 0 ? '录音(' + recording.length + ')' : '录音' }}
      </button>
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === MODE.CHALLENGE }"
        @click="mode === MODE.CHALLENGE ? mode = MODE.FREE : startChallenge()"
      >
        跟弹挑战 ({{ CHALLENGE_COST }}💰)
      </button>
    </div>

    <!-- 主体 -->
    <main class="xylo-body">
      <!-- 挑战状态 -->
      <Transition name="result-fade">
        <div v-if="mode === MODE.CHALLENGE" class="challenge-status">
          <div v-if="challengeShowing" class="challenge-showing">
            <span class="challenge-label">请记住旋律...</span>
            <div class="challenge-note-display">
              <div
                v-for="(noteIdx, i) in challengeSequence"
                :key="i"
                class="challenge-note-dot"
                :class="{
                  active: challengeActiveIndex === i,
                  done: challengeActiveIndex > i,
                }"
                :style="{
                  '--note-color': NOTE_MAP[noteIdx]?.color,
                  '--note-glow': NOTE_MAP[noteIdx]?.glow,
                }"
              >
                <span class="dot-label">{{ NOTE_MAP[noteIdx]?.label }}</span>
              </div>
            </div>
          </div>
          <div v-else class="challenge-input-hint">
            <span class="challenge-label">轮到你了！</span>
            <span class="challenge-progress">{{ challengePlayerInput.length }} / {{ challengeSequence.length }}</span>
          </div>
          <div v-if="challengeStreak > 0 && !challengeShowing" class="challenge-streak">
            🔥 连胜 x{{ challengeStreak }}
          </div>
        </div>
      </Transition>

      <!-- 录音控制 -->
      <Transition name="result-fade">
        <div v-if="isRecording" class="recording-status">
          <span class="rec-dot"></span>
          <span>录音中... 点击琴键弹奏 (最多 {{ maxRecording }} 音符)</span>
          <button type="button" class="rec-stop-btn" @click="stopRecording">停止</button>
        </div>
      </Transition>

      <!-- 播放按钮 -->
      <div v-if="!isRecording && recording.length > 0 && mode !== MODE.CHALLENGE" class="recording-controls">
        <button
          type="button"
          class="rec-action-btn"
          :class="{ disabled: isPlaying }"
          :disabled="isPlaying"
          @click="playRecording"
        >
          <span class="rec-icon">▶</span>
          <span>播放录音 ({{ recording.length }}音符)</span>
        </button>
        <button type="button" class="rec-action-btn rec-clear" @click="recording = []; mode = MODE.FREE">
          清空
        </button>
      </div>

      <!-- 木琴键盘 -->
      <section class="xylo-keys">
        <div
          v-for="(note, index) in NOTES"
          :key="note.id"
          class="xylo-key"
          :style="{
            '--key-color': note.color,
            '--key-glow': note.glow,
            '--key-height': note.height + 'px',
          }"
          :class="{
            'key-active': activeKeys[index] || (challengeShowing && challengeActiveIndex === index),
            'key-challenge-note': challengeShowing && challengeActiveIndex === index,
            'key-playback': isPlaying && playbackIndex === index,
          }"
          @pointerdown.prevent="handleKeyDown(index); if (mode === MODE.CHALLENGE && !challengeShowing) handleChallengeInput(index)"
          @pointerup="handleKeyUp(index)"
          @pointerleave="handleKeyUp(index)"
          @pointercancel="handleKeyUp(index)"
        >
          <span class="key-emoji">{{ note.emoji }}</span>
          <span class="key-label">{{ note.name }}</span>
          <span class="key-number">{{ note.label }}</span>
        </div>
      </section>

      <!-- 提示 -->
      <p class="xylo-hint">
        <template v-if="mode === MODE.FREE">自由弹奏，享受音乐！</template>
        <template v-else-if="mode === MODE.RECORD">点击琴键开始录制</template>
        <template v-else-if="mode === MODE.CHALLENGE && challengeShowing">请记住旋律...</template>
        <template v-else-if="mode === MODE.CHALLENGE">按顺序复现旋律</template>
      </p>
    </main>

    <!-- Toast -->
    <Teleport to="body">
      <Transition name="toast-fade">
        <Toast
          v-if="toastVisible"
          :key="toastKey"
          :message="toastMessage"
          :type="toastType"
          :duration="3000"
          position="top"
          :on-close="() => { toastVisible.value = false }"
        />
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.xylophone-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, #0f0a1e 0%, #1a0a2e 40%, #0f1a2e 100%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.xylo-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 215, 0, 0.1);
  gap: 10px;
}

.xylo-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.xylo-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.xylo-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: #ffd700;
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.xylo-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}
.xylo-coin-value { color: #ffd700; font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* Mode tabs */
.xylo-mode-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.2);
}

.mode-tab {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.mode-tab:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.mode-tab.active {
  border-color: rgba(255, 215, 0, 0.4);
  background: rgba(255, 215, 0, 0.1);
  color: #ffd700;
}
  .platform-android.android-portrait .mode-tab {
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
/* Body */
.xylo-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px 16px;
  overflow-y: auto;
}

/* Challenge status */
.challenge-status {
  background: rgba(168, 85, 247, 0.08);
  border: 1px solid rgba(168, 85, 247, 0.2);
  border-radius: 12px;
  padding: 12px;
  text-align: center;
}

.challenge-label {
  font-size: 13px;
  color: #c084fc;
  font-weight: 600;
}

.challenge-showing {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.challenge-note-display {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.challenge-note-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.challenge-note-dot.active {
  background: var(--note-color);
  border-color: var(--note-color);
  box-shadow: 0 0 20px var(--note-glow);
  transform: scale(1.2);
}
.challenge-note-dot.done {
  border-color: var(--note-color);
  background: color-mix(in srgb, var(--note-color) 30%, transparent);
}

.dot-label {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.challenge-input-hint {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.challenge-progress {
  font-size: 18px;
  font-weight: 700;
  color: #ffd700;
}

.challenge-streak {
  margin-top: 6px;
  font-size: 14px;
  color: #ff8c00;
  font-weight: 700;
}

/* Recording status */
.recording-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 10px;
  font-size: 12px;
  color: #f87171;
}

.rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  animation: rec-pulse 1s ease infinite;
}

@keyframes rec-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 4px #ef4444; }
  50% { opacity: 0.3; box-shadow: none; }
}

.rec-stop-btn {
  margin-left: auto;
  padding: 4px 12px;
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

/* Recording controls */
.recording-controls {
  display: flex;
  gap: 8px;
}

.rec-action-btn {
  flex: 1;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}
.rec-action-btn:hover { background: rgba(255, 255, 255, 0.08); }
.rec-action-btn.disabled { opacity: 0.4; cursor: not-allowed; }
.rec-action-btn.rec-clear {
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.rec-icon { font-size: 14px; }

/* Xylophone keys — 底部对齐，高低错落如真实木琴 */
.xylo-keys {
  display: flex;
  flex-direction: row;
  gap: 5px;
  padding: 8px 0 0;
  justify-content: center;
  align-items: flex-end;
  margin-top: auto;
}

.xylo-key {
  position: relative;
  width: 100%;
  max-width: 52px;
  height: var(--key-height);
  border-radius: 12px 12px 8px 8px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--key-color) 30%, rgba(30, 20, 50, 0.6)),
    color-mix(in srgb, var(--key-color) 12%, rgba(20, 10, 40, 0.9))
  );
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 4px;
  cursor: pointer;
  user-select: none;
  touch-action: none;
  transition: all 0.1s ease;
  overflow: hidden;
}

.xylo-key::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  height: 5px;
  background: var(--key-color);
  border-radius: 3px 3px 0 0;
  opacity: 0.6;
}

.key-emoji {
  font-size: 16px;
  flex-shrink: 0;
}

.key-label {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 0 8px var(--key-glow);
  writing-mode: vertical-lr;
  letter-spacing: 2px;
}

.key-number {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 600;
  flex-shrink: 0;
}

/* Active state */
.xylo-key.key-active {
  transform: scaleY(0.97);
  border-color: var(--key-color);
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--key-color) 55%, rgba(30, 20, 50, 0.5)),
    color-mix(in srgb, var(--key-color) 30%, rgba(20, 10, 40, 0.7))
  );
  box-shadow:
    0 0 20px var(--key-glow),
    inset 0 0 15px color-mix(in srgb, var(--key-color) 20%, transparent);
}

.key-active .key-label {
  animation: key-bounce 0.15s ease;
}

@keyframes key-bounce {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

/* Challenge demo highlight */
.xylo-key.key-challenge-note {
  animation: challenge-pulse 0.4s ease;
  border-color: var(--key-color);
  box-shadow: 0 0 30px var(--key-glow);
}

@keyframes challenge-pulse {
  0% { transform: scale(1); }
  30% { transform: scale(1.03); }
  100% { transform: scale(1); }
}

/* Playback highlight */
.xylo-key.key-playback {
  border-color: var(--key-color);
  box-shadow: 0 0 15px var(--key-glow);
}

/* Hint */
.xylo-hint {
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  padding: 8px 0;
}

/* Transitions */
.result-fade-enter-active,
.result-fade-leave-active {
  transition: all 0.3s ease;
}
.result-fade-enter-from,
.result-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Android竖屏适配 */
.platform-android.android-portrait .xylo-header {
  padding-top: calc(12px + env(safe-area-inset-top)) !important;
}
.platform-android.android-portrait .xylo-back-btn {
  width: 44px !important; height: 44px !important; min-width: 44px !important; min-height: 44px !important;
}
.platform-android.android-portrait .xylo-title { font-size: 15px !important; }
.platform-android.android-portrait .key-label { font-size: 12px !important; }
.platform-android.android-portrait .key-emoji { font-size: 14px !important; }
.platform-android.android-portrait .key-number { font-size: 11px !important; }
</style>
