<script setup>
/**
 * HarmonicaScreen.vue - 10孔C调口琴模拟器
 * 基于 Web Audio API：锯齿波振荡器 + 带通滤波 + 颤音LFO + 呼吸包络
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import Toast from '../Toast.vue'

const emit = defineEmits(['back', 'harmonica-result'])
const props = defineProps({
  coins: { type: Number, default: 0 },
})

// ====== 口琴音高映射（C调10孔，每孔吹/吸） ======

const HOLES = [
  { hole: 1, blow: { note: 'C4', freq: 261.63  }, draw: { note: 'D4', freq: 293.66  } },
  { hole: 2, blow: { note: 'E4', freq: 329.63  }, draw: { note: 'G4', freq: 392.00  } },
  { hole: 3, blow: { note: 'G4', freq: 392.00  }, draw: { note: 'B4', freq: 493.88  } },
  { hole: 4, blow: { note: 'C5', freq: 523.25  }, draw: { note: 'D5', freq: 587.33  } },
  { hole: 5, blow: { note: 'E5', freq: 659.25  }, draw: { note: 'F5', freq: 698.46  } },
  { hole: 6, blow: { note: 'G5', freq: 783.99  }, draw: { note: 'A5', freq: 880.00  } },
  { hole: 7, blow: { note: 'C6', freq: 1046.50 }, draw: { note: 'B5', freq: 987.77  } },
  { hole: 8, blow: { note: 'E6', freq: 1318.51 }, draw: { note: 'D6', freq: 1174.66 } },
  { hole: 9, blow: { note: 'G6', freq: 1567.98 }, draw: { note: 'F6', freq: 1396.91 } },
  { hole: 10, blow: { note: 'C7', freq: 2093.00 }, draw: { note: 'A6', freq: 1760.00 } },
]

// 为吹/吸分别生成唯一索引
// blow indices: 0-9, draw indices: 10-19
function getBlowIndex(holeIdx) { return holeIdx }
function getDrawIndex(holeIdx) { return holeIdx + 10 }

const ALL_NOTES = []
HOLES.forEach((h, i) => {
  ALL_NOTES.push({ ...h.blow, type: 'blow', hole: h.hole, index: getBlowIndex(i) })
  ALL_NOTES.push({ ...h.draw, type: 'draw', hole: h.hole, index: getDrawIndex(i) })
})

const NOTE_BY_INDEX = {}
ALL_NOTES.forEach(n => { NOTE_BY_INDEX[n.index] = n })

// ====== 音频引擎 ======

let audioCtx = null
let masterGain = null
let lfo = null
let lfoGainNode = null
let compressor = null

// 每个正在发声的音符的节点
const activeVoices = {} // { index: { oscillators, gainNode } }

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()

    // Compressor — 防削波
    compressor = audioCtx.createDynamicsCompressor()
    compressor.threshold.value = -20
    compressor.knee.value = 10
    compressor.ratio.value = 4
    compressor.connect(audioCtx.destination)

    // Master gain
    masterGain = audioCtx.createGain()
    masterGain.gain.value = 0.7
    masterGain.connect(compressor)

    // LFO — 颤音
    lfo = audioCtx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 5.5

    lfoGainNode = audioCtx.createGain()
    lfoGainNode.gain.value = 3 // ±3 cents detune depth

    lfo.connect(lfoGainNode)
    lfo.start()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

function noteStart(index) {
  if (activeVoices[index]) return // 已经在响，防重复
  const ctx = ensureAudioCtx()
  const note = NOTE_BY_INDEX[index]
  if (!note) return

  const now = ctx.currentTime
  const freq = note.freq
  const isHigh = note.hole >= 8 // 高音区衰减

  // === 振荡器组 ===

  // 1. 主锯齿波（簧片主振动）
  const osc1 = ctx.createOscillator()
  osc1.type = 'sawtooth'
  osc1.frequency.setValueAtTime(freq, now)
  osc1.detune.setValueAtTime(0, now)

  // 2. 微失谐锯齿波（模拟双簧片耦合）
  const osc2 = ctx.createOscillator()
  osc2.type = 'sawtooth'
  osc2.frequency.setValueAtTime(freq, now)
  osc2.detune.setValueAtTime(3, now) // +3 cents

  // 3. 高次泛音（金属感）
  const osc3 = ctx.createOscillator()
  osc3.type = 'sine'
  osc3.frequency.setValueAtTime(freq * 2, now)

  // === 带通滤波器（簧片鼻音感）===
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(freq * 1.5, now)
  filter.Q.setValueAtTime(3, now)

  // === 包络增益 ===
  const envGain = ctx.createGain()
  const vol = isHigh ? 0.20 : 0.35 // 高音衰减
  envGain.gain.setValueAtTime(0, now)
  envGain.gain.linearRampToValueAtTime(vol, now + 0.06) // Attack 60ms
  envGain.gain.linearRampToValueAtTime(vol * 0.85, now + 0.15) // 小幅下降到 Sustain

  // === 泛音增益 ===
  const harmGain = ctx.createGain()
  harmGain.gain.setValueAtTime(0, now)
  harmGain.gain.linearRampToValueAtTime(isHigh ? 0.03 : 0.08, now + 0.06)

  const harmGain2 = ctx.createGain()
  harmGain2.gain.setValueAtTime(0, now)
  harmGain2.gain.linearRampToValueAtTime(isHigh ? 0.04 : 0.12, now + 0.06)

  // === 连接 ===
  // LFO → 所有振荡器的 detune
  lfoGainNode.connect(osc1.detune)
  lfoGainNode.connect(osc2.detune)

  osc1.connect(harmGain2)
  osc2.connect(envGain)
  osc3.connect(harmGain)

  harmGain2.connect(filter)
  envGain.connect(filter)
  harmGain.connect(filter)

  filter.connect(masterGain)

  osc1.start(now)
  osc2.start(now)
  osc3.start(now)

  activeVoices[index] = {
    oscillators: [osc1, osc2, osc3],
    gainNode: envGain,
    harmGain,
    harmGain2,
    filter,
    note,
  }
}

function noteStop(index) {
  const voice = activeVoices[index]
  if (!voice) return

  const ctx = audioCtx
  const now = ctx.currentTime

  // Release 120ms — 气流渐弱
  voice.gainNode.gain.cancelScheduledValues(now)
  voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now)
  voice.gainNode.gain.linearRampToValueAtTime(0, now + 0.12)

  voice.harmGain.gain.cancelScheduledValues(now)
  voice.harmGain.gain.setValueAtTime(voice.harmGain.gain.value, now)
  voice.harmGain.gain.linearRampToValueAtTime(0, now + 0.12)

  voice.harmGain2.gain.cancelScheduledValues(now)
  voice.harmGain2.gain.setValueAtTime(voice.harmGain2.gain.value, now)
  voice.harmGain2.gain.linearRampToValueAtTime(0, now + 0.12)

  // 150ms 后停止振荡器
  setTimeout(() => {
    voice.oscillators.forEach(osc => {
      try { osc.stop() } catch (_) {}
    })
    delete activeVoices[index]
  }, 160)
}

// ====== 模式 ======

const MODE = { FREE: 'free', CHALLENGE: 'challenge' }
const mode = ref(MODE.FREE)

// ====== 交互状态 ======

const activeHole = ref(-1) // 当前按住的孔 0-9
const activeType = ref('') // 'blow' | 'draw'
const slideActive = ref(false) // 是否正在滑动

function getActiveNoteIndex() {
  if (activeHole.value < 0) return -1
  if (activeType.value === 'blow') return getBlowIndex(activeHole.value)
  if (activeType.value === 'draw') return getDrawIndex(activeHole.value)
  return -1
}

function activateNote(holeIdx, type) {
  // 停掉之前的音
  const prevIndex = getActiveNoteIndex()
  if (prevIndex >= 0 && prevIndex !== -1) {
    noteStop(prevIndex)
  }

  activeHole.value = holeIdx
  activeType.value = type

  const idx = getActiveNoteIndex()
  if (idx >= 0) noteStart(idx)

  // 录音
  if (isRecording.value) {
    const elapsed = recording.value.length === 0 ? 0 : Date.now() - recording.value[recording.value.length - 1].time
    recording.value.push({ noteIndex: idx, time: Date.now(), gap: elapsed, type })
  }
}

function deactivateAll() {
  const idx = getActiveNoteIndex()
  if (idx >= 0) noteStop(idx)
  activeHole.value = -1
  activeType.value = ''
}

// 触摸/指针处理
function handleHolePointerDown(holeIdx, type, event) {
  if (mode.value === MODE.CHALLENGE && challengeShowing.value) return
  event.preventDefault()
  activateNote(holeIdx, type)

  if (mode.value === MODE.CHALLENGE && !challengeShowing.value) {
    handleChallengeInput(getActiveNoteIndex())
  }
}

function handleHolePointerUp(holeIdx, type) {
  deactivateAll()
}

// 滑动切换（在同一行内：吹气区滑到另一孔的吹气，吸气区同理）
function handleHolePointerMove(holeIdx, type, event) {
  if (!event) return
  if (activeHole.value === holeIdx && activeType.value === type) return
  if (activeHole.value < 0) return // 没按住

  activateNote(holeIdx, type)

  if (mode.value === MODE.CHALLENGE && !challengeShowing.value) {
    handleChallengeInput(getActiveNoteIndex())
  }
}

// ====== 录音回放 ======

const recording = ref([])
const isRecording = ref(false)
const isPlaying = ref(false)
const playbackIndex = ref(-1)
const maxRecording = 30

function startRecording() {
  recording.value = []
  isRecording.value = true
}

function stopRecording() {
  if (recording.value.length === 0) {
    showToast('还没有录到任何音符！', 'warning')
    return
  }
  isRecording.value = false
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
    noteStart(note.noteIndex)

    const delay = i === 0 ? 0 : (note.gap || 400)
    // 吹多久
    const holdTime = Math.min(delay * 0.7, 600)
    setTimeout(() => noteStop(note.noteIndex), Math.max(holdTime, 100))

    i++
    setTimeout(playNext, Math.max(delay, 200))
  }

  playNext()
}

// ====== 跟吹挑战 ======

const CHALLENGE_COST = 5
const CHALLENGE_REWARD = 15
const CHALLENGE_BASE_LENGTH = 4
const CHALLENGE_MAX_LENGTH = 8

const challengeSequence = ref([]) // [{ holeIndex, type: 'blow'|'draw' }]
const challengePlayerInput = ref([])
const challengeShowing = ref(false)
const challengeActiveIndex = ref(-1)
const challengeStreak = ref(0)

function generateChallenge() {
  const len = Math.min(CHALLENGE_BASE_LENGTH + challengeStreak.value, CHALLENGE_MAX_LENGTH)
  const seq = []
  for (let i = 0; i < len; i++) {
    const holeIdx = Math.floor(Math.random() * 10)
    const type = Math.random() < 0.5 ? 'blow' : 'draw'
    seq.push({ holeIndex: holeIdx, type })
  }
  challengeSequence.value = seq
  challengePlayerInput.value = []
}

async function startChallenge() {
  if (props.coins < CHALLENGE_COST) {
    showToast('金币不足！挑战需要 ' + CHALLENGE_COST + ' 💰', 'error')
    return
  }

  emit('harmonica-result', { cost: CHALLENGE_COST, earned: 0 })
  generateChallenge()
  mode.value = MODE.CHALLENGE
  await showChallengeSequence()
}

async function showChallengeSequence() {
  challengeShowing.value = true
  challengeActiveIndex.value = -1

  for (let i = 0; i < challengeSequence.value.length; i++) {
    challengeActiveIndex.value = i
    const seq = challengeSequence.value[i]
    const noteIdx = seq.type === 'blow' ? getBlowIndex(seq.holeIndex) : getDrawIndex(seq.holeIndex)
    noteStart(noteIdx)
    await delay(500)
    noteStop(noteIdx)
    challengeActiveIndex.value = -1
    await delay(200)
  }

  challengeShowing.value = false
  showToast('轮到你了！按顺序吹响 ' + challengeSequence.value.length + ' 个音', 'info')
}

function handleChallengeInput(noteIndex) {
  if (!challengeShowing.value && mode.value === MODE.CHALLENGE) {
    const currentIdx = challengePlayerInput.value.length
    const expected = challengeSequence.value[currentIdx]
    const expectedIdx = expected.type === 'blow' ? getBlowIndex(expected.holeIndex) : getDrawIndex(expected.holeIndex)

    if (noteIndex !== expectedIdx) {
      mode.value = MODE.FREE
      challengeStreak.value = 0
      showToast('吹错了！再试一次吧 (-' + CHALLENGE_COST + '💰)', 'error')
      return
    }

    challengePlayerInput.value.push(noteIndex)

    if (challengePlayerInput.value.length === challengeSequence.value.length) {
      const reward = CHALLENGE_REWARD + challengeStreak.value * 2
      challengeStreak.value++
      emit('harmonica-result', { cost: 0, earned: reward })
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

onUnmounted(() => {
  // 清理所有声音
  Object.keys(activeVoices).forEach(idx => noteStop(parseInt(idx)))
  if (audioCtx) audioCtx.close()
})

defineExpose({ noteStart, noteStop })
</script>

<template>
  <div class="harmonica-screen">
    <!-- Header -->
    <header class="harmo-header">
      <button type="button" class="harmo-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="harmo-title">🎶 口琴</h2>
      <div class="harmo-coin-box">
        <span class="harmo-coin-icon">💰</span>
        <span class="harmo-coin-value">{{ coins }}</span>
      </div>
    </header>

    <!-- 模式切换 -->
    <div class="harmo-mode-tabs">
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === MODE.FREE }"
        @click="mode = MODE.FREE"
      >
        自由吹奏
      </button>
      <button
        type="button"
        class="mode-tab"
        :class="{ active: isRecording }"
        @click="isRecording ? stopRecording() : startRecording()"
      >
        {{ isRecording ? '录音中...' : recording.length > 0 ? '录音(' + recording.length + ')' : '录音' }}
      </button>
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === MODE.CHALLENGE }"
        @click="mode === MODE.CHALLENGE ? mode = MODE.FREE : startChallenge()"
      >
        跟吹挑战 ({{ CHALLENGE_COST }}💰)
      </button>
    </div>

    <!-- 主体 -->
    <main class="harmo-body">
      <!-- 录音控制 -->
      <Transition name="result-fade">
        <div v-if="isRecording" class="recording-status">
          <span class="rec-dot"></span>
          <span>录音中... 按孔吹奏 (最多 {{ maxRecording }} 音符)</span>
          <button type="button" class="rec-stop-btn" @click="stopRecording">停止</button>
        </div>
      </Transition>

      <div v-if="!isRecording && recording.length > 0 && mode !== MODE.CHALLENGE" class="recording-controls">
        <button
          type="button"
          class="rec-action-btn"
          :class="{ disabled: isPlaying }"
          :disabled="isPlaying"
          @click="playRecording"
        >
          <span class="rec-icon">▶</span>
          <span>播放 ({{ recording.length }}音)</span>
        </button>
        <button type="button" class="rec-action-btn rec-clear" @click="recording = []">清空</button>
      </div>

      <!-- 挑战状态 -->
      <Transition name="result-fade">
        <div v-if="mode === MODE.CHALLENGE" class="challenge-status">
          <div v-if="challengeShowing" class="challenge-showing">
            <span class="challenge-label">请记住旋律...</span>
            <div class="challenge-note-display">
              <div
                v-for="(seq, i) in challengeSequence"
                :key="i"
                class="challenge-note-dot"
                :class="{
                  active: challengeActiveIndex === i,
                  done: challengeActiveIndex > i,
                }"
                :style="{
                  '--seq-color': seq.type === 'blow' ? '#ffd700' : '#60a5fa',
                  '--seq-glow': seq.type === 'blow' ? 'rgba(255,215,0,0.5)' : 'rgba(96,165,250,0.5)',
                }"
              >
                <span class="dot-label">{{ seq.type === 'blow' ? '吹' : '吸' }}</span>
                <span class="dot-hole">#{{ seq.holeIndex + 1 }}</span>
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

      <!-- 口琴本体 -->
      <section class="harmonica-body">
        <div class="harmonica-frame">
          <!-- 吹气行 -->
          <div class="harmonica-row harmonica-blow-row">
            <div class="row-label">吹</div>
            <div
              v-for="(h, i) in HOLES"
              :key="'blow-' + i"
              class="harmonica-cell"
              :class="{
                'cell-active': activeHole === i && activeType === 'blow',
                'cell-challenge': challengeShowing && challengeActiveIndex >= 0 && challengeSequence[challengeActiveIndex]?.holeIndex === i && challengeSequence[challengeActiveIndex]?.type === 'blow',
                'cell-playback': isPlaying && playbackIndex === getBlowIndex(i),
              }"
              @pointerdown.prevent="handleHolePointerDown(i, 'blow', $event)"
              @pointerup="handleHolePointerUp(i, 'blow')"
              @pointerleave="activeHole === i && activeType === 'blow' && handleHolePointerUp(i, 'blow')"
              @pointermove="(e) => handleHolePointerMove(i, 'blow', e)"
            >
              <span class="cell-note">{{ h.blow.note }}</span>
            </div>
          </div>

          <!-- 分割线 -->
          <div class="harmonica-divider">
            <div class="divider-line"></div>
          </div>

          <!-- 吸气行 -->
          <div class="harmonica-row harmonica-draw-row">
            <div class="row-label">吸</div>
            <div
              v-for="(h, i) in HOLES"
              :key="'draw-' + i"
              class="harmonica-cell"
              :class="{
                'cell-active': activeHole === i && activeType === 'draw',
                'cell-challenge': challengeShowing && challengeActiveIndex >= 0 && challengeSequence[challengeActiveIndex]?.holeIndex === i && challengeSequence[challengeActiveIndex]?.type === 'draw',
                'cell-playback': isPlaying && playbackIndex === getDrawIndex(i),
              }"
              @pointerdown.prevent="handleHolePointerDown(i, 'draw', $event)"
              @pointerup="handleHolePointerUp(i, 'draw')"
              @pointerleave="activeHole === i && activeType === 'draw' && handleHolePointerUp(i, 'draw')"
              @pointermove="(e) => handleHolePointerMove(i, 'draw', e)"
            >
              <span class="cell-note">{{ h.draw.note }}</span>
            </div>
          </div>

          <!-- 孔号标签 -->
          <div class="harmonica-numbers">
            <div class="hole-number-label"></div>
            <div
              v-for="(h, i) in HOLES"
              :key="'num-' + i"
              class="hole-number-label"
            >
              {{ h.hole }}
            </div>
          </div>
        </div>
      </section>

      <!-- 提示 -->
      <p class="harmo-hint">
        <template v-if="mode === MODE.FREE">上排吹气 · 下排吸气 · 可滑动换孔</template>
        <template v-else-if="isRecording">录音中...</template>
        <template v-else-if="mode === MODE.CHALLENGE && challengeShowing">记住吹/吸和孔位</template>
        <template v-else-if="mode === MODE.CHALLENGE">按顺序复现</template>
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
.harmonica-screen {
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
.harmo-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 215, 0, 0.1);
  gap: 10px;
}

.harmo-back-btn {
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
.harmo-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.harmo-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: #ffd700;
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.harmo-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}
.harmo-coin-value { color: #ffd700; font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* Mode tabs */
.harmo-mode-tabs {
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
.harmo-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 12px 16px;
  overflow-y: auto;
}

/* Recording */
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

/* Challenge */
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
  flex-wrap: wrap;
}

.challenge-note-dot {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  gap: 1px;
}
.challenge-note-dot.active {
  background: var(--seq-color);
  border-color: var(--seq-color);
  box-shadow: 0 0 20px var(--seq-glow);
  transform: scale(1.15);
}
.challenge-note-dot.done {
  border-color: var(--seq-color);
  background: color-mix(in srgb, var(--seq-color) 30%, transparent);
}

.dot-label {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.dot-hole {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1;
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

/* ====== 口琴本体 ====== */
.harmonica-body {
  display: flex;
  justify-content: center;
  padding: 4px 0 0;
  margin-top: auto;
}

.harmonica-frame {
  background: linear-gradient(180deg, #1a1a2e, #12121f);
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 8px 6px 6px;
  box-shadow:
    0 0 30px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  width: 100%;
  max-width: 500px;
}

/* 行 */
.harmonica-row {
  display: flex;
  gap: 3px;
}

.row-label {
  width: 28px;
  min-width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.4);
  writing-mode: vertical-lr;
  letter-spacing: 4px;
}

/* 单元 */
.harmonica-cell {
  flex: 1;
  height: 52px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  touch-action: none;
  transition: all 0.08s ease;
  position: relative;
  overflow: hidden;
}

/* 吹气格 */
.harmonica-blow-row .harmonica-cell {
  background: linear-gradient(180deg,
    rgba(255, 215, 0, 0.12),
    rgba(255, 140, 0, 0.06)
  );
  border: 1px solid rgba(255, 215, 0, 0.1);
}

.harmonica-blow-row .cell-note {
  color: rgba(255, 215, 0, 0.7);
}

/* 吸气格 */
.harmonica-draw-row .harmonica-cell {
  background: linear-gradient(180deg,
    rgba(96, 165, 250, 0.12),
    rgba(59, 130, 246, 0.06)
  );
  border: 1px solid rgba(96, 165, 250, 0.1);
}

.harmonica-draw-row .cell-note {
  color: rgba(96, 165, 250, 0.7);
}

.cell-note {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
}

/* 按下态 */
.harmonica-cell.cell-active {
  transform: scale(0.94);
}

.harmonica-blow-row .cell-active {
  background: linear-gradient(180deg,
    rgba(255, 215, 0, 0.35),
    rgba(255, 140, 0, 0.2)
  );
  border-color: #ffd700;
  box-shadow: 0 0 18px rgba(255, 215, 0, 0.4);
}

.harmonica-blow-row .cell-active .cell-note {
  color: #ffd700;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
}

.harmonica-draw-row .cell-active {
  background: linear-gradient(180deg,
    rgba(96, 165, 250, 0.35),
    rgba(59, 130, 246, 0.2)
  );
  border-color: #60a5fa;
  box-shadow: 0 0 18px rgba(96, 165, 250, 0.4);
}

.harmonica-draw-row .cell-active .cell-note {
  color: #60a5fa;
  text-shadow: 0 0 8px rgba(96, 165, 250, 0.6);
}

/* 挑战演示高亮 */
.cell-challenge {
  animation: harmo-challenge-glow 0.5s ease;
}

@keyframes harmo-challenge-glow {
  0% { transform: scale(1); }
  30% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

/* 回放高亮 */
.cell-playback {
  opacity: 0.8;
}

/* 分割线 */
.harmonica-divider {
  padding: 3px 0;
}

.divider-line {
  height: 2px;
  background: linear-gradient(90deg,
    transparent,
    rgba(255, 255, 255, 0.15) 20%,
    rgba(255, 255, 255, 0.15) 80%,
    transparent
  );
  border-radius: 1px;
}

/* 孔号 */
.harmonica-numbers {
  display: flex;
  gap: 3px;
  margin-top: 6px;
  padding: 0 0 0 28px;
}

.hole-number-label {
  flex: 1;
  text-align: center;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.25);
  font-weight: 600;
}

/* Hint */
.harmo-hint {
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  padding: 6px 0 2px;
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
.platform-android.android-portrait .harmo-header {
  padding-top: calc(12px + env(safe-area-inset-top)) !important;
}
.platform-android.android-portrait .harmo-back-btn {
  width: 44px !important; height: 44px !important; min-width: 44px !important; min-height: 44px !important;
}
.platform-android.android-portrait .harmo-title { font-size: 15px !important; }
.platform-android.android-portrait .harmonica-cell { height: 48px !important; }
.platform-android.android-portrait .cell-note { font-size: 12px !important; }
.platform-android.android-portrait .row-label { width: 24px !important; min-width: 24px !important; font-size: 11px !important; }
.platform-android.android-portrait .harmonica-numbers { padding-left: 24px !important; }
</style>
