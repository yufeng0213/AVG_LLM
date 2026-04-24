/**
 * useAmbientSounds.js — Web Audio 环境音合成系统
 *
 * 用振荡器 + 噪声发生器合成 5 种场景环境音，不需要外部音频文件。
 * 仅在蓝牙音响连接时播放（避免手机外放尴尬）。
 *
 * 场景映射：
 *   雨声: rain / 下雨 / 雷雨
 *   海浪: beach / 海边 / 海滩 / 海 / shore / ocean
 *   咖啡馆: cafe / 咖啡 / coffee
 *   森林鸟鸣: forest / 森林 / 树林 / park / 公园
 *   城市街景: city / 城市 / street / 街道 / urban
 */
import { computed, onUnmounted, ref, watch } from 'vue'

const SCENE_MAP = {
  rain: ['rain', '下雨', '雷雨', '雨天', '阴雨', '暴雨', '小雨', '中雨', '大雨'],
  waves: ['beach', '海边', '海滩', '海', 'shore', 'ocean', '海洋', '海边沙滩', '海岸'],
  cafe: ['cafe', '咖啡', 'coffee', '咖啡馆', '咖啡店', '茶室', '餐厅'],
  forest: ['forest', '森林', '树林', 'park', '公园', '花园', '植物园'],
  city: ['city', '城市', 'street', '街道', 'urban', '商业区', '市中心', '广场', '车站'],
}

function matchScene(locationName) {
  if (!locationName) return null
  const lower = String(locationName).toLowerCase()
  for (const [scene, keywords] of Object.entries(SCENE_MAP)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return scene
    }
  }
  return null
}

// ===== 声音合成器 =====

function createNoiseBuffer(ctx, duration = 2) {
  const sampleRate = ctx.sampleRate
  const length = sampleRate * duration
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

// 雨声：带通滤波白噪声 + 低频隆隆声
function startRain(ctx, destination, volume = 0.3) {
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(destination)

  // 白噪声 → 带通滤波
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 4)
  noise.loop = true

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 3000
  bp.Q.value = 0.5

  noise.connect(bp)
  bp.connect(gain)

  // 低频隆隆声
  const noise2 = ctx.createBufferSource()
  noise2.buffer = createNoiseBuffer(ctx, 4)
  noise2.loop = true

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 200

  const rainGain = ctx.createGain()
  rainGain.gain.value = volume * 0.6
  noise2.connect(lp)
  lp.connect(rainGain)
  rainGain.connect(destination)

  gain.gain.setTargetAtTime(volume * 0.8, ctx.currentTime, 0.5)

  noise.start()
  noise2.start()

  return { stop: () => { noise.stop(); noise2.stop(); gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3) } }
}

// 海浪：振幅调制噪声 + 低频振荡
function startWaves(ctx, destination, volume = 0.3) {
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(destination)

  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 6)
  noise.loop = true

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 600

  noise.connect(lp)
  lp.connect(gain)

  // 振幅调制 — 模拟波浪起伏
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.08 // 很慢的波浪
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = volume * 0.3
  lfo.connect(lfoGain)
  lfoGain.connect(gain.gain)

  gain.gain.setTargetAtTime(volume * 0.5, ctx.currentTime, 1)

  noise.start()
  lfo.start()

  return { stop: () => { noise.stop(); lfo.stop(); gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5) } }
}

// 咖啡馆：带通滤波噪声 + 随机"人声"短音
function startCafe(ctx, destination, volume = 0.3) {
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(destination)

  // 背景白噪声（人群嗡嗡声）
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 4)
  noise.loop = true

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 800
  bp.Q.value = 0.3

  noise.connect(bp)
  bp.connect(gain)
  gain.gain.setTargetAtTime(volume * 0.2, ctx.currentTime, 0.5)

  noise.start()

  // 随机"杯子碰撞"短音
  const clinks = []
  function scheduleClink() {
    const osc = ctx.createOscillator()
    osc.frequency.value = 2000 + Math.random() * 2000
    const cGain = ctx.createGain()
    cGain.gain.value = 0
    osc.connect(cGain)
    cGain.connect(destination)

    const now = ctx.currentTime + Math.random() * 3
    cGain.gain.setValueAtTime(0, now)
    cGain.gain.linearRampToValueAtTime(volume * 0.05, now + 0.01)
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
    osc.start(now)
    osc.stop(now + 0.2)
    clinks.push(osc)

    // 下一个碰撞
    const timer = setTimeout(scheduleClink, 2000 + Math.random() * 5000)
    clinks.push(timer)
  }
  scheduleClink()

  return { stop: () => { noise.stop(); gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3); clinks.forEach(c => { if (c.stop) c.stop(); else clearTimeout(c) }) } }
}

// 森林鸟鸣：正弦振荡器鸟叫 + 微风噪声
function startForest(ctx, destination, volume = 0.3) {
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(destination)

  // 微风噪声
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 4)
  noise.loop = true

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 2000

  noise.connect(hp)
  hp.connect(gain)
  gain.gain.setTargetAtTime(volume * 0.1, ctx.currentTime, 0.5)

  noise.start()

  // 随机鸟叫
  const birds = []
  function chirp() {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    const baseFreq = 2000 + Math.random() * 3000
    osc.frequency.value = baseFreq

    const bGain = ctx.createGain()
    bGain.gain.value = 0
    osc.connect(bGain)
    bGain.connect(destination)

    const now = ctx.currentTime + Math.random() * 0.5
    const dur = 0.1 + Math.random() * 0.3
    bGain.gain.setValueAtTime(0, now)
    bGain.gain.linearRampToValueAtTime(volume * 0.08, now + 0.01)
    // 鸟叫频率变化
    osc.frequency.linearRampToValueAtTime(baseFreq * (1.2 + Math.random() * 0.5), now + dur * 0.3)
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.8, now + dur * 0.7)
    bGain.gain.exponentialRampToValueAtTime(0.001, now + dur)

    osc.start(now)
    osc.stop(now + dur + 0.01)
    birds.push(osc)

    const timer = setTimeout(chirp, 800 + Math.random() * 4000)
    birds.push(timer)
  }
  chirp()

  return { stop: () => { noise.stop(); gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3); birds.forEach(b => { if (b.stop) b.stop(); else clearTimeout(b) }) } }
}

// 城市街景：低频交通噪声 + 人群嗡嗡
function startCity(ctx, destination, volume = 0.3) {
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(destination)

  // 交通低频隆隆声
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 4)
  noise.loop = true

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 400

  noise.connect(lp)
  lp.connect(gain)
  gain.gain.setTargetAtTime(volume * 0.3, ctx.currentTime, 0.5)

  noise.start()

  // 偶尔的汽车鸣笛
  const horns = []
  function honk() {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 300 + Math.random() * 200

    const hGain = ctx.createGain()
    hGain.gain.value = 0
    osc.connect(hGain)
    hGain.connect(destination)

    const now = ctx.currentTime + Math.random() * 0.5
    hGain.gain.setValueAtTime(0, now)
    hGain.gain.linearRampToValueAtTime(volume * 0.04, now + 0.05)
    hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
    osc.start(now)
    osc.stop(now + 1)
    horns.push(osc)

    const timer = setTimeout(honk, 5000 + Math.random() * 15000)
    horns.push(timer)
  }
  honk()

  return { stop: () => { noise.stop(); gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3); horns.forEach(h => { if (h.stop) h.stop(); else clearTimeout(h) }) } }
}

const SYNTHESIZERS = { rain: startRain, waves: startWaves, cafe: startCafe, forest: startForest, city: startCity }

// ===== Composable =====

export function useAmbientSounds({ isBluetoothConnected, locationName, volume = 0.3 }) {
  let ctx = null
  let destination = null
  let currentSound = null
  let currentScene = null
  const activeScene = ref(null)

  const scene = computed(() => matchScene(locationName))

  function startSound(sceneName) {
    stopSound()
    if (!SYNTHESIZERS[sceneName]) return

    if (!ctx) {
      ctx = new AudioContext()
      destination = ctx.destination
    }
    if (ctx.state === 'suspended') ctx.resume()

    const vol = typeof volume === 'function' ? volume() : volume
    currentSound = SYNTHESIZERS[sceneName](ctx, destination, vol)
    currentScene = sceneName
    activeScene.value = sceneName
  }

  function stopSound() {
    if (currentSound) {
      currentSound.stop()
      currentSound = null
    }
    currentScene = null
    activeScene.value = null
  }

  // 监听蓝牙连接状态和场景变化
  const stopWatch = watch([isBluetoothConnected, scene], ([bt, s]) => {
    if (bt && s && s !== currentScene) {
      startSound(s)
    } else if (!bt) {
      stopSound()
    } else if (!s) {
      stopSound()
    }
  }, { immediate: true })

  onUnmounted(() => {
    stopSound()
    if (ctx) ctx.close()
    stopWatch()
  })

  return { activeScene }
}
