/**
 * useNotificationSounds.js — 合成来电/短信铃声
 *
 * 用 Web Audio 振荡器合成独特的来电铃声和短信提示音。
 * 每个角色根据 ID 哈希得到不同音高，形成独特铃声。
 * 仅在蓝牙音响连接时播放铃声（手机模式用系统通知声）。
 */
import { onUnmounted } from 'vue'

// 根据角色 ID 生成唯一音高（简单哈希）
function charToFrequency(charId) {
  let hash = 0
  for (let i = 0; i < charId.length; i++) {
    hash = ((hash << 5) - hash) + charId.charCodeAt(i)
    hash |= 0
  }
  // 映射到 4 个不同音符：C5, E5, G5, A5
  const notes = [523.25, 659.25, 783.99, 880.00]
  return notes[Math.abs(hash) % notes.length]
}

let ctx = null
function getAudioContext() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// 来电铃声 — 三音旋律（类似经典铃声）
function playRingTone(charId, duration = 3000) {
  const audioCtx = getAudioContext()
  const freq = charToFrequency(charId)
  const now = audioCtx.currentTime

  const master = audioCtx.createGain()
  master.gain.value = 0.3
  master.connect(audioCtx.destination)

  // 三音旋律
  const melody = [freq, freq * 1.25, freq * 1.5]
  const noteLen = 0.15
  const gap = 0.1

  for (let ring = 0; ring < 3; ring++) {
    const ringStart = ring * (noteLen * 3 + gap * 3 + 0.3)
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = melody[i]

      const noteGain = audioCtx.createGain()
      noteGain.gain.value = 0
      osc.connect(noteGain)
      noteGain.connect(master)

      const t = now + ringStart + i * (noteLen + gap)
      noteGain.gain.setValueAtTime(0, t)
      noteGain.gain.linearRampToValueAtTime(0.2, t + 0.01)
      noteGain.gain.exponentialRampToValueAtTime(0.001, t + noteLen)

      osc.start(t)
      osc.stop(t + noteLen + 0.01)
    }
  }
}

// 短信提示音 — 短促"叮"声
function playSmsTone(charId) {
  const audioCtx = getAudioContext()
  const freq = charToFrequency(charId)
  const now = audioCtx.currentTime

  const osc = audioCtx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq * 1.5 // 高音

  const gain = audioCtx.createGain()
  gain.gain.value = 0
  osc.connect(gain)
  gain.connect(audioCtx.destination)

  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.15, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)

  osc.start(now)
  osc.stop(now + 0.25)

  // 第二声
  const osc2 = audioCtx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.value = freq * 1.5
  const gain2 = audioCtx.createGain()
  gain2.gain.value = 0
  osc2.connect(gain2)
  gain2.connect(audioCtx.destination)

  const t2 = now + 0.3
  gain2.gain.setValueAtTime(0, t2)
  gain2.gain.linearRampToValueAtTime(0.12, t2 + 0.01)
  gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.15)
  osc2.start(t2)
  osc2.stop(t2 + 0.2)
}

export function useNotificationSounds({ isBluetoothConnected }) {
  function playIncomingCall(charId) {
    // 只在蓝牙模式下播放铃声
    if (isBluetoothConnected?.value) {
      playRingTone(charId)
    }
  }

  function playIncomingSms(charId) {
    if (isBluetoothConnected?.value) {
      playSmsTone(charId)
    }
  }

  onUnmounted(() => {
    if (ctx) ctx.close()
  })

  return { playIncomingCall, playIncomingSms }
}
