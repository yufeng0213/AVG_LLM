/**
 * useAudioScoring.js - MFCC 提取 + DTW 距离计算 → 0-100 发音评分
 *
 * 算法流程：
 * 1. AudioContext.decodeAudioData → PCM (16kHz)
 * 2. 预加重 (alpha=0.97)
 * 3. 分帧 (25ms 窗 / 10ms 跳)
 * 4. 汉明窗
 * 5. FFT (基数-2 Cooley-Tukey, 零填充到 512)
 * 6. Mel 滤波器组 (40 个三角滤波器)
 * 7. 对数能量
 * 8. DCT-II → 13 个 MFCC 系数
 * 9. DTW 距离计算 + 指数映射评分
 */

// ===== FFT 实现 (基数-2 Cooley-Tukey) =====

function nextPow2(n) {
  let p = 1
  while (p < n) p <<= 1
  return p
}

/**
 * 原地复数 FFT。
 * @param {Float64Array} real - 实部输入
 * @param {Float64Array} imag - 虚部输入（初始为 0）
 */
function fftInPlace(real, imag) {
  const n = real.length
  if (n <= 1) return

  // 位逆序置换
  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]]
      [imag[i], imag[j]] = [imag[j], imag[i]]
    }
    let k = n >> 1
    while (k <= j) {
      j -= k
      k >>= 1
    }
    j += k
  }

  // 蝶形运算
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1
    const angle = (-2 * Math.PI) / len
    const wReal = Math.cos(angle)
    const wImag = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let curWReal = 1
      let curWImag = 0
      for (let k = 0; k < halfLen; k++) {
        const uReal = real[i + k]
        const uImag = imag[i + k]
        const tReal = curWReal * real[i + k + halfLen] - curWImag * imag[i + k + halfLen]
        const tImag = curWReal * imag[i + k + halfLen] + curWImag * real[i + k + halfLen]
        real[i + k] = uReal + tReal
        imag[i + k] = uImag + tImag
        real[i + k + halfLen] = uReal - tReal
        imag[i + k + halfLen] = uImag - tImag
        const newWReal = curWReal * wReal - curWImag * wImag
        curWImag = curWReal * wImag + curWImag * wReal
        curWReal = newWReal
      }
    }
  }
}

// ===== Mel 滤波器组 =====

function hzToMel(hz) {
  return 1125.0 * Math.log(1 + hz / 700.0)
}

function melToHz(mel) {
  return 700.0 * (Math.exp(mel / 1125.0) - 1.0)
}

/**
 * 构建 Mel 滤波器组。
 * @param {number} numFilters - 滤波器数量 (40)
 * @param {number} fftSize - FFT 大小 (512)
 * @param {number} sampleRate - 采样率 (16000)
 * @returns {Array<{ start: number, end: number, weights: Float32Array }>}
 */
function buildMelFilterbank(numFilters, fftSize, sampleRate) {
  const numBins = fftSize / 2
  const lowMel = hzToMel(300)
  const highMel = hzToMel(sampleRate / 2)
  const melPoints = []
  for (let i = 0; i < numFilters + 2; i++) {
    melPoints.push(lowMel + ((highMel - lowMel) * i) / (numFilters + 1))
  }
  const hzPoints = melPoints.map((m) => melToHz(m))
  const binPoints = hzPoints.map((h) => Math.floor(((fftSize + 1) * h) / sampleRate))

  const filterbank = []
  for (let m = 1; m <= numFilters; m++) {
    const start = binPoints[m - 1]
    const center = binPoints[m]
    const end = binPoints[m + 1]
    const len = end - start + 1
    const weights = new Float32Array(len)
    for (let k = start; k <= center && k < numBins; k++) {
      weights[k - start] = (k - start) / (center - start + 1e-10)
    }
    for (let k = center + 1; k <= end && k < numBins; k++) {
      weights[k - start] = (end - k) / (end - center + 1e-10)
    }
    filterbank.push({ start, end: Math.min(end, numBins - 1), weights })
  }
  return filterbank
}

// 预计算 Mel 滤波器组 (512 FFT, 16kHz, 40 filters)
let _melFilterbank = null
function getMelFilterbank() {
  if (!_melFilterbank) {
    _melFilterbank = buildMelFilterbank(40, 512, 16000)
  }
  return _melFilterbank
}

// ===== 语音活动检测 (VAD) =====

/**
 * 基于能量的简单 VAD，去除静音段。
 * 返回 [startFrame, endFrame] 范围内的帧索引。
 */
function vadFrameRange(pcm, sampleRate = 16000) {
  const frameSize = Math.floor(0.025 * sampleRate)
  const hopSize = Math.floor(0.010 * sampleRate)
  const numFrames = Math.floor((pcm.length - frameSize) / hopSize) + 1
  if (numFrames <= 0) return { start: 0, end: 0 }

  // 计算每帧能量
  const energies = new Float32Array(numFrames)
  for (let i = 0; i < numFrames; i++) {
    let energy = 0
    const offset = i * hopSize
    for (let j = 0; j < frameSize; j++) {
      energy += pcm[offset + j] * pcm[offset + j]
    }
    energies[i] = energy / frameSize
  }

  // Otsu 阈值法
  const histSize = 100
  const hist = new Float32Array(histSize)
  const maxEnergy = Math.max(...energies, 1e-10)
  for (let i = 0; i < numFrames; i++) {
    const bin = Math.min(histSize - 1, Math.floor((energies[i] / maxEnergy) * histSize))
    hist[bin]++
  }

  let bestThresh = 0.01
  let bestVar = -Infinity
  for (let t = 1; t < histSize; t++) {
    const w0 = hist.slice(0, t).reduce((a, b) => a + b, 0)
    const w1 = hist.slice(t).reduce((a, b) => a + b, 0)
    if (w0 === 0 || w1 === 0) continue
    const mu0 = hist.slice(0, t).reduce((s, v, i) => s + v * i, 0) / w0
    const mu1 = hist.slice(t).reduce((s, v, i) => s + v * i, 0) / w1
    const betweenVar = w0 * w1 * (mu0 - mu1) * (mu0 - mu1)
    if (betweenVar > bestVar) {
      bestVar = betweenVar
      bestThresh = (t / histSize) * maxEnergy
    }
  }

  // 找出语音段的起止帧
  let startFrame = 0
  let endFrame = numFrames - 1
  for (let i = 0; i < numFrames; i++) {
    if (energies[i] > bestThresh) { startFrame = i; break }
  }
  for (let i = numFrames - 1; i >= 0; i--) {
    if (energies[i] > bestThresh) { endFrame = i; break }
  }

  return { start: startFrame, end: endFrame }
}

// ===== MFCC 提取 =====

/**
 * 从音频 Blob 提取 MFCC 系数矩阵。
 * @param {Blob|ArrayBuffer} audioBlob - 音频数据
 * @param {number} sampleRate - 目标采样率
 * @returns {Promise<Float32Array[]>} 每帧 13 个 MFCC 系数的数组
 */
/**
 * 从音频数据提取 PCM 波形数据（用于可视化）。
 * @param {Blob|ArrayBuffer|Uint8Array} audioBlob - 音频数据
 * @returns {Promise<Float32Array>} PCM 波形数据
 */
export async function extractPCM(audioBlob) {
  const audioCtx = new AudioContext({ sampleRate: 16000 })

  let arrayBuffer
  if (audioBlob instanceof Blob) {
    arrayBuffer = await audioBlob.arrayBuffer()
  } else if (audioBlob instanceof ArrayBuffer) {
    arrayBuffer = audioBlob
  } else if (audioBlob instanceof Uint8Array) {
    arrayBuffer = audioBlob.buffer.slice(audioBlob.byteOffset, audioBlob.byteOffset + audioBlob.byteLength)
  } else {
    audioCtx.close()
    return new Float32Array(0)
  }

  let audioBuffer
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  } catch {
    audioCtx.close()
    return new Float32Array(0)
  }

  const pcm = audioBuffer.getChannelData(0)
  audioCtx.close()
  return new Float32Array(pcm)
}

export async function extractMFCC(audioBlob, sampleRate = 16000) {
  const audioCtx = new AudioContext({ sampleRate })

  let arrayBuffer
  if (audioBlob instanceof Blob) {
    arrayBuffer = await audioBlob.arrayBuffer()
  } else if (audioBlob instanceof ArrayBuffer) {
    arrayBuffer = audioBlob
  } else if (audioBlob instanceof Uint8Array) {
    arrayBuffer = audioBlob.buffer.slice(audioBlob.byteOffset, audioBlob.byteOffset + audioBlob.byteLength)
  } else {
    audioCtx.close()
    return []
  }

  let audioBuffer
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  } catch {
    audioCtx.close()
    return []
  }

  const rawPcm = audioBuffer.getChannelData(0)
  audioCtx.close()

  if (rawPcm.length < sampleRate * 0.1) {
    return []
  }

  // VAD 去静音，只保留有效语音段
  const vadRange = vadFrameRange(rawPcm, sampleRate)
  const hopSize = Math.floor(0.010 * sampleRate)
  const startSample = vadRange.start * hopSize
  const endSample = (vadRange.end + 1) * Math.floor(0.025 * sampleRate)
  const pcm = rawPcm.slice(Math.max(0, startSample), Math.min(rawPcm.length, endSample))

  if (pcm.length < sampleRate * 0.1) {
    return []
  }

  // 1. 预加重
  const preEmphasized = new Float32Array(pcm.length)
  preEmphasized[0] = pcm[0]
  for (let i = 1; i < pcm.length; i++) {
    preEmphasized[i] = pcm[i] - 0.97 * pcm[i - 1]
  }

  // 2. 分帧参数
  const frameSize = Math.floor(0.025 * sampleRate) // 400
  const numCoeffs = 13
  const fftSize = 512
  const hamming = new Float32Array(frameSize)
  for (let i = 0; i < frameSize; i++) {
    hamming[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameSize - 1))
  }

  const melFilterbank = getMelFilterbank()
  const mfccFrames = []

  for (let start = 0; start + frameSize <= preEmphasized.length; start += hopSize) {
    // 3. 汉明窗
    const windowed = new Float32Array(fftSize)
    for (let i = 0; i < frameSize; i++) {
      windowed[i] = preEmphasized[start + i] * hamming[i]
    }

    // 4. FFT
    const real = new Float64Array(windowed)
    const imag = new Float64Array(fftSize)
    fftInPlace(real, imag)

    // 5. 功率谱
    const numBins = fftSize / 2
    const melEnergies = new Float32Array(40)
    for (let m = 0; m < 40; m++) {
      const fb = melFilterbank[m]
      let sum = 0
      for (let k = 0; k <= fb.end - fb.start && fb.start + k < numBins; k++) {
        const binIdx = fb.start + k
        const power = (real[binIdx] * real[binIdx] + imag[binIdx] * imag[binIdx]) / fftSize
        sum += fb.weights[k] * power
      }
      melEnergies[m] = Math.log(sum + 1e-10)
    }

    // 6. DCT-II → MFCC
    const mfcc = new Float32Array(numCoeffs)
    for (let k = 0; k < numCoeffs; k++) {
      let s = 0
      for (let n = 0; n < 40; n++) {
        s += melEnergies[n] * Math.cos((Math.PI * k * (2 * n + 1)) / 80)
      }
      mfcc[k] = s
    }

    mfccFrames.push(mfcc)
  }

  return mfccFrames
}

// ===== DTW 距离计算 =====

/**
 * 计算两个 MFCC 序列之间的 DTW 距离。
 * 使用 Sakoe-Chiba 带状约束限制 warping 路径，避免过度对齐。
 * @param {Float32Array[]} mfcc1 - 参考 MFCC 序列
 * @param {Float32Array[]} mfcc2 - 用户 MFCC 序列
 * @param {number} windowSize - Sakoe-Chiba 窗口大小（默认 30 帧）
 * @returns {number} 归一化 DTW 距离
 */
export function computeDTWDistance(mfcc1, mfcc2, windowSize = 30) {
  const n = mfcc1.length
  const m = mfcc2.length
  if (n === 0 || m === 0) return Infinity

  const numCoeffs = mfcc1[0].length // 13
  const SakoeChibaBand = Math.min(Math.max(windowSize, Math.abs(n - m)), Math.min(n, m))

  // 一维数组模拟 (n+1) x (m+1) 矩阵
  const cols = m + 1
  const cost = new Float64Array((n + 1) * cols).fill(Infinity)
  cost[0] = 0

  for (let i = 1; i <= n; i++) {
    // Sakoe-Chiba 带状约束
    const jMin = Math.max(1, i - SakoeChibaBand)
    const jMax = Math.min(m, i + SakoeChibaBand)

    for (let j = jMin; j <= jMax; j++) {
      // 欧几里得距离
      let dist = 0
      const v1 = mfcc1[i - 1]
      const v2 = mfcc2[j - 1]
      for (let k = 0; k < numCoeffs; k++) {
        const d = v1[k] - v2[k]
        dist += d * d
      }
      dist = Math.sqrt(dist)

      const idx = i * cols + j
      const up = cost[(i - 1) * cols + j]
      const left = cost[i * cols + (j - 1)]
      const diag = cost[(i - 1) * cols + (j - 1)]
      cost[idx] = dist + Math.min(up, left, diag)
    }
  }

  // 归一化：除以路径长度（约 max(n,m)）
  return cost[n * cols + m] / Math.max(n, m)
}

/**
 * 将 DTW 距离映射到 0-100 分。
 * @param {number} distance - 归一化 DTW 距离
 * @param {number} threshold - 距离阈值（越大评分越宽松）
 * @returns {number} 0-100 评分
 */
function dtwToScore(distance, threshold = 10.0) {
  return Math.round(Math.max(0, Math.min(100, 100 * Math.exp(-distance / threshold))))
}

/**
 * 获取评分反馈文字。
 * @param {number} score
 * @returns {string}
 */
export function getScoreFeedback(score) {
  if (score >= 80) return '发音优秀！'
  if (score >= 60) return '不错，继续加油！'
  if (score >= 40) return '需要改进，仔细听标准发音'
  return '多听几遍再试试！'
}

/**
 * 完整评分管道。
 * @param {Blob|ArrayBuffer} refAudio - 参考音频 (TTS)
 * @param {Blob} userAudio - 用户录音
 * @returns {Promise<{ score: number, dtwDistance: number, feedback: string }>}
 */
export async function scorePronunciation(refAudio, userAudio) {
  const [refMFCC, userMFCC] = await Promise.all([
    extractMFCC(refAudio),
    extractMFCC(userAudio),
  ])

  if (!refMFCC.length && !userMFCC.length) {
    return { score: 0, dtwDistance: Infinity, feedback: '音频太短，无法分析' }
  }
  if (!refMFCC.length) {
    return { score: 0, dtwDistance: Infinity, feedback: '参考音频解码失败，无法分析' }
  }
  if (!userMFCC.length) {
    return { score: 0, dtwDistance: Infinity, feedback: '录音太短或解码失败，请重新录制' }
  }

  const dtwDistance = computeDTWDistance(refMFCC, userMFCC)
  const score = dtwToScore(dtwDistance)
  const feedback = getScoreFeedback(score)

  return { score, dtwDistance, feedback }
}
