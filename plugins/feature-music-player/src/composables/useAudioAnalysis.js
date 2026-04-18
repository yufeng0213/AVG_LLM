import { ref, onUnmounted } from 'vue'

let _audioCtx = null
let _analyser = null
let _source = null
let _rafId = null

const freqData = ref(new Uint8Array(0))
const timeData = ref(new Uint8Array(0))
const audioEnergy = ref(0)

export function useAudioAnalysis() {
  const state = {
    freqData,
    timeData,
    audioEnergy,
    isReady: ref(false),
  }

  const init = (audioElement) => {
    if (!audioElement) return
    try {
      if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      }
      if (_audioCtx.state === 'suspended') {
        _audioCtx.resume()
      }

      if (_source) {
        try { _source.disconnect() } catch {}
      }

      _analyser = _audioCtx.createAnalyser()
      _analyser.fftSize = 256
      _analyser.smoothingTimeConstant = 0.8

      _source = _audioCtx.createMediaElementSource(audioElement)
      _source.connect(_analyser)
      _analyser.connect(_audioCtx.destination)

      freqData.value = new Uint8Array(_analyser.frequencyBinCount)
      timeData.value = new Uint8Array(_analyser.fftSize)
      state.isReady.value = true
    } catch (e) {
      console.warn('[audio-analysis] init failed', e)
    }
  }

  const analyze = () => {
    if (!_analyser || !state.isReady.value) return

    _analyser.getByteFrequencyData(freqData.value)
    _analyser.getByteTimeDomainData(timeData.value)

    // Compute aggregate energy (0-1)
    let sum = 0
    for (let i = 0; i < freqData.value.length; i++) {
      sum += freqData.value[i]
    }
    audioEnergy.value = sum / (freqData.value.length * 255)

    _rafId = requestAnimationFrame(analyze)
  }

  const start = () => {
    if (state.isReady.value && !_rafId) {
      analyze()
    }
  }

  const stop = () => {
    if (_rafId) {
      cancelAnimationFrame(_rafId)
      _rafId = null
    }
  }

  const getBassEnergy = () => {
    if (!freqData.value.length) return 0
    let sum = 0
    const end = Math.floor(freqData.value.length * 0.15)
    for (let i = 0; i < end; i++) sum += freqData.value[i]
    return sum / (end * 255)
  }

  const getMidEnergy = () => {
    if (!freqData.value.length) return 0
    const start = Math.floor(freqData.value.length * 0.15)
    const end = Math.floor(freqData.value.length * 0.6)
    let sum = 0
    for (let i = start; i < end; i++) sum += freqData.value[i]
    return sum / ((end - start) * 255)
  }

  const getTrebleEnergy = () => {
    if (!freqData.value.length) return 0
    const start = Math.floor(freqData.value.length * 0.6)
    let sum = 0
    for (let i = start; i < freqData.value.length; i++) sum += freqData.value[i]
    return sum / ((freqData.value.length - start) * 255)
  }

  onUnmounted(() => {
    stop()
    if (_source) { try { _source.disconnect() } catch {} }
    if (_analyser) { try { _analyser.disconnect() } catch {} }
  })

  return {
    state,
    actions: { init, start, stop, getBassEnergy, getMidEnergy, getTrebleEnergy },
  }
}
