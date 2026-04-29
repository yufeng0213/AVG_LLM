/**
 * useGameAudio.js - 游戏厅音效引擎（纯 Web Audio API 合成）
 * 每个游戏只需调用 playSFX(name)，零音频文件依赖。
 */

import { ref } from 'vue'

const ctx = ref(null)
const masterGain = ref(null)
let _volume = 0.5

export const useGameAudio = () => {
  const ensureCtx = () => {
    if (ctx.value) return ctx.value
    ctx.value = new (window.AudioContext || window.webkitAudioContext)()
    masterGain.value = ctx.value.createGain()
    masterGain.value.gain.value = _volume
    masterGain.value.connect(ctx.value.destination)
    return ctx.value
  }

  const setVolume = (v) => {
    _volume = Math.max(0, Math.min(1, v))
    if (masterGain.value) masterGain.value.gain.value = _volume
  }

  const mute = () => setVolume(0)
  const unmute = () => setVolume(_volume > 0 ? _volume : 0.5)

  /**
   * 合成并播放音效
   * @param {string} name - 音效名称
   * @param {Object} opts - 可选参数
   */
  const playSFX = (name, opts = {}) => {
    const c = ensureCtx()
    const now = c.currentTime
    const vol = _volume * (opts.volume ?? 1)
    if (vol <= 0) return

    switch (name) {
      // ===== 通用 =====
      case 'click': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'sine'
        osc.frequency.value = 800
        g.gain.setValueAtTime(vol * 0.15, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.05)
        break
      }

      case 'back': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'sine'
        osc.frequency.value = 600
        g.gain.setValueAtTime(vol * 0.12, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.06)
        break
      }

      // ===== 老虎机 =====
      case 'slot_spin': {
        for (let i = 0; i < 6; i++) {
          const osc = c.createOscillator()
          const g = c.createGain()
          osc.type = 'square'
          osc.frequency.value = 200 + i * 80
          const t = now + i * 0.08
          g.gain.setValueAtTime(vol * 0.08, t)
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
          osc.connect(g).connect(masterGain.value)
          osc.start(t)
          osc.stop(t + 0.07)
        }
        break
      }

      case 'slot_win': {
        const freqs = [523, 659, 784, 1047]
        freqs.forEach((f, i) => {
          const osc = c.createOscillator()
          const g = c.createGain()
          osc.type = 'sine'
          osc.frequency.value = f
          const t = now + i * 0.1
          g.gain.setValueAtTime(vol * 0.15, t)
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
          osc.connect(g).connect(masterGain.value)
          osc.start(t)
          osc.stop(t + 0.3)
        })
        break
      }

      case 'slot_lose': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(300, now)
        osc.frequency.linearRampToValueAtTime(150, now + 0.3)
        g.gain.setValueAtTime(vol * 0.12, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.3)
        break
      }

      // ===== 扭蛋机 =====
      case 'gacha_roll': {
        const bufSize = c.sampleRate * 0.2
        const buf = c.createBuffer(1, bufSize, c.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3
        const src = c.createBufferSource()
        src.buffer = buf
        const g = c.createGain()
        const filt = c.createBiquadFilter()
        filt.type = 'lowpass'
        filt.frequency.value = 800
        g.gain.setValueAtTime(vol * 0.15, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
        src.connect(filt).connect(g).connect(masterGain.value)
        src.start(now)
        src.stop(now + 0.2)
        break
      }

      case 'gacha_pop': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(800, now)
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.1)
        g.gain.setValueAtTime(vol * 0.2, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.1)
        break
      }

      // ===== 弹珠台 =====
      case 'pinball_launch': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(100, now)
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.15)
        g.gain.setValueAtTime(vol * 0.2, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.2)
        break
      }

      case 'pinball_hit': {
        const bufSize = c.sampleRate * 0.05
        const buf = c.createBuffer(1, bufSize, c.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1)
        const src = c.createBufferSource()
        src.buffer = buf
        const g = c.createGain()
        g.gain.setValueAtTime(vol * 0.15, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
        src.connect(g).connect(masterGain.value)
        src.start(now)
        src.stop(now + 0.05)
        break
      }

      case 'pinball_score': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'sine'
        osc.frequency.value = 1200
        g.gain.setValueAtTime(vol * 0.15, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.1)
        break
      }

      // ===== 农场 =====
      case 'farm_plant': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'triangle'
        osc.frequency.value = 400
        g.gain.setValueAtTime(vol * 0.12, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.08)
        break
      }

      case 'farm_harvest': {
        const freqs = [440, 554, 659]
        freqs.forEach((f, i) => {
          const osc = c.createOscillator()
          const g = c.createGain()
          osc.type = 'sine'
          osc.frequency.value = f
          const t = now + i * 0.08
          g.gain.setValueAtTime(vol * 0.12, t)
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
          osc.connect(g).connect(masterGain.value)
          osc.start(t)
          osc.stop(t + 0.15)
        })
        break
      }

      // ===== 赛狗 =====
      case 'race_start': {
        const bufSize = c.sampleRate * 0.3
        const buf = c.createBuffer(1, bufSize, c.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < bufSize; i++) data[i] = Math.sin(i / c.sampleRate * 800 * 2 * Math.PI) * 0.5
        const src = c.createBufferSource()
        src.buffer = buf
        const g = c.createGain()
        g.gain.setValueAtTime(vol * 0.15, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
        src.connect(g).connect(masterGain.value)
        src.start(now)
        src.stop(now + 0.3)
        break
      }

      case 'race_running': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'square'
        osc.frequency.value = 150
        g.gain.setValueAtTime(vol * 0.06, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.1)
        break
      }

      case 'race_finish': {
        const freqs = [523, 659, 784, 1047, 1319]
        freqs.forEach((f, i) => {
          const osc = c.createOscillator()
          const g = c.createGain()
          osc.type = 'sine'
          osc.frequency.value = f
          const t = now + i * 0.12
          g.gain.setValueAtTime(vol * 0.15, t)
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
          osc.connect(g).connect(masterGain.value)
          osc.start(t)
          osc.stop(t + 0.4)
        })
        break
      }

      // ===== 厨房 =====
      case 'kitchen_chop': {
        const bufSize = c.sampleRate * 0.06
        const buf = c.createBuffer(1, bufSize, c.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.01))
        const src = c.createBufferSource()
        src.buffer = buf
        const g = c.createGain()
        g.gain.setValueAtTime(vol * 0.15, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
        src.connect(g).connect(masterGain.value)
        src.start(now)
        src.stop(now + 0.06)
        break
      }

      case 'kitchen_sizzle': {
        const bufSize = c.sampleRate * 0.4
        const buf = c.createBuffer(1, bufSize, c.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.2
        const src = c.createBufferSource()
        src.buffer = buf
        const filt = c.createBiquadFilter()
        filt.type = 'bandpass'
        filt.frequency.value = 3000
        filt.Q.value = 0.5
        const g = c.createGain()
        g.gain.setValueAtTime(vol * 0.08, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
        src.connect(filt).connect(g).connect(masterGain.value)
        src.start(now)
        src.stop(now + 0.4)
        break
      }

      case 'kitchen_done': {
        const freqs = [523, 659, 784, 1047]
        freqs.forEach((f, i) => {
          const osc = c.createOscillator()
          const g = c.createGain()
          osc.type = 'sine'
          osc.frequency.value = f
          const t = now + i * 0.1
          g.gain.setValueAtTime(vol * 0.12, t)
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
          osc.connect(g).connect(masterGain.value)
          osc.start(t)
          osc.stop(t + 0.25)
        })
        break
      }

      // ===== 三消 =====
      case 'match3_swap': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'sine'
        osc.frequency.value = 600
        g.gain.setValueAtTime(vol * 0.1, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.08)
        break
      }

      case 'match3_match': {
        const freqs = [784, 988, 1175]
        freqs.forEach((f, i) => {
          const osc = c.createOscillator()
          const g = c.createGain()
          osc.type = 'sine'
          osc.frequency.value = f
          const t = now + i * 0.06
          g.gain.setValueAtTime(vol * 0.12, t)
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
          osc.connect(g).connect(masterGain.value)
          osc.start(t)
          osc.stop(t + 0.12)
        })
        break
      }

      case 'match3_combo': {
        const freqs = [523, 659, 784, 1047, 1319, 1568]
        const count = Math.min(opts.combo || 1, freqs.length)
        for (let i = 0; i < count; i++) {
          const osc = c.createOscillator()
          const g = c.createGain()
          osc.type = 'sine'
          osc.frequency.value = freqs[i]
          const t = now + i * 0.05
          g.gain.setValueAtTime(vol * 0.12, t)
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
          osc.connect(g).connect(masterGain.value)
          osc.start(t)
          osc.stop(t + 0.1)
        }
        break
      }

      case 'match3_fail': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(400, now)
        osc.frequency.linearRampToValueAtTime(200, now + 0.2)
        g.gain.setValueAtTime(vol * 0.1, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.2)
        break
      }

      // ===== 游戏通用 =====
      case 'win': {
        const freqs = [523, 659, 784, 1047]
        freqs.forEach((f, i) => {
          const osc = c.createOscillator()
          const g = c.createGain()
          osc.type = 'sine'
          osc.frequency.value = f
          const t = now + i * 0.1
          g.gain.setValueAtTime(vol * 0.15, t)
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
          osc.connect(g).connect(masterGain.value)
          osc.start(t)
          osc.stop(t + 0.3)
        })
        break
      }

      case 'coin': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(1200, now)
        osc.frequency.setValueAtTime(1600, now + 0.08)
        g.gain.setValueAtTime(vol * 0.15, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.15)
        break
      }

      case 'error': {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'square'
        osc.frequency.value = 200
        g.gain.setValueAtTime(vol * 0.1, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
        osc.connect(g).connect(masterGain.value)
        osc.start(now)
        osc.stop(now + 0.15)
        break
      }
    }
  }

  return {
    playSFX,
    setVolume,
    mute,
    unmute,
    volume: () => _volume,
  }
}

export default useGameAudio
