import * as THREE from 'three'
import gsap from 'gsap'

/* ======================== Simplex 3D Noise ======================== */

const PERM = new Uint8Array(512)
;(function initPerm() {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  // Fisher-Yates shuffle with fixed seed for deterministic results
  let seed = 42
  function rand() {
    seed = (seed * 16807 + 0) % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
})()

function noise3D(x, y, z) {
  const X = Math.floor(x) & 255
  const Y = Math.floor(y) & 255
  const Z = Math.floor(z) & 255
  x -= Math.floor(x)
  y -= Math.floor(y)
  z -= Math.floor(z)
  const u = x * x * x * (x * (x * 6 - 15) + 10)
  const v = y * y * y * (y * (y * 6 - 15) + 10)
  const w = z * z * z * (z * (z * 6 - 15) + 10)
  const A = PERM[X] + Y
  const AA = PERM[A] + Z
  const AB = PERM[A + 1] + Z
  const B = PERM[X + 1] + Y
  const BA = PERM[B] + Z
  const BB = PERM[B + 1] + Z
  function grad(hash, px, py, pz) {
    const h = hash & 15
    const u = h < 8 ? px : py
    const v = h < 4 ? py : (h === 12 || h === 14 ? px : pz)
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }
  function mix(t, a, b) {
    return a + t * (b - a)
  }
  return mix(
    w,
    mix(
      v,
      mix(u, grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z)),
      mix(u, grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z))
    ),
    mix(
      v,
      mix(u, grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1)),
      mix(u, grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1))
    )
  )
}

/* ======================== Audio Engine ======================== */

function createAudioCtx() {
  return new (window.AudioContext || window.webkitAudioContext)()
}

function playPetalFlySound(ctx) {
  const now = ctx.currentTime

  // Rising tone: 523Hz → 1047Hz (C5 to C6, pure)
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(523, now)
  osc.frequency.exponentialRampToValueAtTime(1047, now + 0.4)

  // Shimmer: 2× octave harmonic
  const osc2 = ctx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(1047, now + 0.05)
  osc2.frequency.exponentialRampToValueAtTime(2093, now + 0.35)

  // Glass pad: wide detuned third
  const osc3 = ctx.createOscillator()
  osc3.type = 'triangle'
  osc3.frequency.setValueAtTime(659, now + 0.03)
  osc3.frequency.exponentialRampToValueAtTime(1318, now + 0.38)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.12, now + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7)

  const gain2 = ctx.createGain()
  gain2.gain.setValueAtTime(0, now)
  gain2.gain.linearRampToValueAtTime(0.04, now + 0.05)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6)

  const gain3 = ctx.createGain()
  gain3.gain.setValueAtTime(0, now)
  gain3.gain.linearRampToValueAtTime(0.03, now + 0.06)
  gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.55)

  osc.connect(gain).connect(ctx.destination)
  osc2.connect(gain2).connect(ctx.destination)
  osc3.connect(gain3).connect(ctx.destination)
  osc.start(now)
  osc2.start(now)
  osc3.start(now)
  osc.stop(now + 0.7)
  osc2.stop(now + 0.6)
  osc3.stop(now + 0.55)

  // Wind-chime sparkle
  const bufSize = ctx.sampleRate * 0.6
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08)) * 0.25
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.02, now + 0.02)
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
  const filt = ctx.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.value = 4000
  filt.Q.value = 3
  noise.connect(filt).connect(ng).connect(ctx.destination)
  noise.start(now + 0.02)
  noise.stop(now + 0.6)
}

function playPetalReturnSound(ctx) {
  const now = ctx.currentTime

  // Falling tone: 1047Hz → 523Hz (C6 to C5, pure)
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1047, now)
  osc.frequency.exponentialRampToValueAtTime(523, now + 0.6)

  // Harmonic echo: fifth below
  const osc2 = ctx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(784, now + 0.1)
  osc2.frequency.exponentialRampToValueAtTime(392, now + 0.7)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.1, now + 0.04)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65)

  const gain2 = ctx.createGain()
  gain2.gain.setValueAtTime(0, now + 0.1)
  gain2.gain.linearRampToValueAtTime(0.04, now + 0.15)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75)

  osc.connect(gain).connect(ctx.destination)
  osc2.connect(gain2).connect(ctx.destination)
  osc.start(now)
  osc2.start(now + 0.1)
  osc.stop(now + 0.65)
  osc2.stop(now + 0.75)

  // Soft sparkle landing
  const bufSize = ctx.sampleRate * 0.4
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06)) * 0.15
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.015, now + 0.4)
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
  const filt = ctx.createBiquadFilter()
  filt.type = 'highpass'
  filt.frequency.value = 6000
  filt.Q.value = 1
  noise.connect(filt).connect(ng).connect(ctx.destination)
  noise.start(now + 0.4)
  noise.stop(now + 0.8)
}

/* ======================== Main Composable ======================== */

export function useRoseField() {
  let renderer, scene, camera
  let rosePoints, roseGeometry, roseMaterial
  let ambientPoints, ambientMaterial
  let bgStarField
  let clickTarget
  let container

  // Event callbacks
  const callbacks = {}

  // State
  let state = 'idle' // 'idle' | 'flying' | 'flying_back'
  let animTween = null

  // Particle data
  const petalParticles = [] // { x,y,z, petalIndex, layer, originalX/Y/Z }
  const stemParticles = []
  const leafParticles = []
  const centerParticles = []
  const ambientParticles = []

  // Camera
  let camTheta = 0
  let camPhi = Math.PI / 2
  let camRadius = 12
  let targetTheta = 0
  let targetPhi = Math.PI / 2
  let targetRadius = 12
  const damping = 0.08

  // Drag
  let dragging = false
  let dragStartX = 0
  let dragStartY = 0
  let dragInitX = 0 // initial press position, for click vs drag detection
  let dragInitY = 0

  // Time
  let startTime = 0

  // Audio
  let audioCtx = null

  // Rose config
  const ROSE_CONFIG = {
    centerX: 0,
    centerY: 0.8,
    centerZ: 0,
    layers: [
      { count: 14, size: 1.8, color: [0.30, 0.0, 0.02], particles: 500, curl: 0.9,  bloomOpen: 0.75 },
      { count: 12, size: 1.5, color: [0.42, 0.02, 0.05], particles: 450, curl: 0.75, bloomOpen: 0.55 },
      { count: 10, size: 1.2, color: [0.52, 0.04, 0.08], particles: 400, curl: 0.6,  bloomOpen: 0.35 },
      { count: 8,  size: 0.9, color: [0.65, 0.10, 0.15], particles: 350, curl: 0.45, bloomOpen: 0.15 },
      { count: 7,  size: 0.6, color: [0.78, 0.18, 0.25], particles: 300, curl: 0.35, bloomOpen: 0.05 },
      { count: 5,  size: 0.35,color: [0.9,  0.35, 0.42], particles: 250, curl: 0.25, bloomOpen: 0.0  },
    ],
    stem: { length: 3.5, color: [0.18, 0.55, 0.08], particles: 800 },
    leaves: { count: 3, size: 1.1, color: [0.2, 0.58, 0.08], particles: 160 },
    center: { color: [0.95, 0.75, 0.1], particles: 120 },
    sepals: { count: 5, size: 0.5, color: [0.15, 0.5, 0.05], particles: 80 },
    thorns: { count: 6, color: [0.18, 0.55, 0.08], particles: 20 },
  }

  // Selected petal info
  let selectedPetal = null
  let selectedParticleIndices = []
  const _offsets = [] // reused array for petal offsets

  function on(event, fn) {
    if (!callbacks[event]) callbacks[event] = []
    callbacks[event].push(fn)
  }
  function emitEvent(event, data) {
    if (callbacks[event]) callbacks[event].forEach((fn) => fn(data))
  }

  /* ======================== Shader Code ======================== */

  const ROSE_VERTEX_SHADER = `
    attribute float aSize;
    attribute float aPetalId;
    varying vec3 vColor;
    varying float vSize;
    varying float vAlpha;
    varying float vPetalId;
    uniform float uTime;
    uniform float uFlyAlpha;
    void main() {
      vColor = color;
      vSize = aSize;
      vPetalId = aPetalId;
      // Idle breathing
      float breathe = sin(uTime * 0.8 + position.y * 1.5) * 0.02;
      vec3 pos = position + breathe;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = aSize * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
      vAlpha = 1.0;
    }
  `

  const ROSE_FRAGMENT_SHADER = `
    varying vec3 vColor;
    varying float vSize;
    varying float vAlpha;
    varying float vPetalId;
    uniform float uFlyAlpha;
    void main() {
      vec2 center = gl_PointCoord - 0.5;
      float dist = length(center);
      if (dist > 0.5) discard;

      // Soft circular sprite with gentle falloff
      float core = smoothstep(0.5, 0.1, dist);
      float halo = exp(-dist * 4.0) * 0.35;
      float alpha = (core + halo) * vAlpha;

      // Glow: brighter near center
      float glow = exp(-dist * 2.5) * 0.15;
      vec3 col = vColor * (1.0 + glow) + vec3(glow * 0.3);

      gl_FragColor = vec4(col, alpha);
    }
  `

  /* ======================== Rose Geometry ======================== */

  function generatePetalPoints(u, v, size, curl, noiseScale, layerIndex, totalLayers, layer) {
    const t = v // 0 at base, 1 at tip
    const theta = u * Math.PI * 2

    // Layer ratio: 0 = outermost (most open), 1 = innermost (tightest bud)
    const layerRatio = 1 - layerIndex / totalLayers

    // Petal width envelope
    const tipSharpness = 0.9
    const tipFactor = Math.pow(Math.sin(t * Math.PI), tipSharpness)
    const widthEnvelope = tipFactor * size * (0.4 + 0.6 * Math.sin(theta * Math.PI))

    // Height along the petal
    const y_local = t * size * 1.5

    // Curl: outer petals curl outward at the tip, inner ones stay flatter
    const curlDir = layerRatio > 0.3 ? -1 : 1
    const curlAmount = curl * Math.sin(t * Math.PI) * (0.3 + 0.4 * t)
    const z_curl = curlAmount * 0.3 * curlDir

    // Edge waviness
    const edgeWave = Math.sin(theta * 6 * Math.PI) * 0.02 * tipFactor * size
    const edgeRuffle = Math.sin(theta * 10 * Math.PI + t * 5) * 0.012 * tipFactor

    // Base taper
    const baseTaper = Math.pow(t, 0.5)
    const finalWidth = widthEnvelope * baseTaper

    // Bloom tilt: use per-layer bloomOpen for controlled opening
    // bloomOpen: 0 = fully closed bud, 1 = fully flat
    const bloomAngle = layer.bloomOpen * 1.4 // max 80° for outermost petals
    const cosBloom = Math.cos(bloomAngle)
    const sinBloom = Math.sin(bloomAngle)

    // Apply bloom rotation: rotate around the petal's width axis (X axis in local space)
    // y_local → y after tilt, z_curl → z after tilt
    const y_bloom = y_local * cosBloom + z_curl * sinBloom
    const z_bloom = -y_local * sinBloom + z_curl * cosBloom

    const finalX = finalWidth
    const finalY = y_bloom
    const finalZ = z_bloom + finalWidth * finalWidth * 0.1 * (0.3 + 0.7 * layerRatio) + edgeWave + edgeRuffle

    // Noise perturbation
    const nx = noise3D(finalX * noiseScale + 1.7, finalY * noiseScale, finalZ * noiseScale) * 0.04
    const ny = noise3D(finalX * noiseScale, finalY * noiseScale + 2.3, finalZ * noiseScale) * 0.04
    const nz = noise3D(finalX * noiseScale, finalY * noiseScale, finalZ * noiseScale + 3.1) * 0.03

    return [finalX + nx, finalY + ny, finalZ + nz]
  }

  function addPetalPoints(petalIndex, layerIndex, layer) {
    const { size, color, particles, curl } = layer
    const count = layer.count
    const angle = (petalIndex / count) * Math.PI * 2 + layerIndex * 0.35 // stagger layers for open bloom
    const ca = Math.cos(angle)
    const sa = Math.sin(angle)

    // Color with per-petal and per-layer variation (deeper at base, lighter at edges)
    const cr = Math.min(1, color[0] + (Math.random() - 0.5) * 0.1)
    const cg = Math.min(1, color[1] + (Math.random() - 0.5) * 0.08 + layerIndex * 0.05)
    const cb = Math.min(1, color[2] + (Math.random() - 0.5) * 0.08 + layerIndex * 0.03)

    const noiseScale = 2.0 + layerIndex * 0.5 + Math.random() * 0.5

    for (let i = 0; i < particles; i++) {
      const u = Math.random()
      const v = Math.random()
      const [px, py, pz] = generatePetalPoints(u, v, size, curl, noiseScale, layerIndex, ROSE_CONFIG.layers.length, layer)

      const x = px * ca - pz * sa + ROSE_CONFIG.centerX
      const y = py + ROSE_CONFIG.centerY + layerIndex * 0.06 + Math.random() * 0.01
      const z = px * sa + pz * ca + ROSE_CONFIG.centerZ

      petalParticles.push({
        x, y, z,
        originalX: x,
        originalY: y,
        originalZ: z,
        petalIndex,
        layerIndex,
        color: [cr, cg, cb],
        size: 0.07 + Math.random() * 0.06,
        id: petalParticles.length,
      })
    }
  }

  function addStemPoints() {
    const cfg = ROSE_CONFIG.stem
    const baseX = ROSE_CONFIG.centerX
    const baseZ = ROSE_CONFIG.centerZ

    for (let i = 0; i < cfg.particles; i++) {
      const t = Math.random()
      const y = ROSE_CONFIG.centerY - t * cfg.length

      // More natural curve: slight S-bend
      const curveX = Math.sin(t * Math.PI * 0.6) * 0.2 - Math.sin(t * Math.PI * 2) * 0.05
      const curveZ = Math.cos(t * Math.PI * 0.4 + 0.5) * 0.15

      // Radius: thicker at top, tapering down
      const radius = 0.05 * (1 - t * 0.6)
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * radius

      const cr = cfg.color[0] + (Math.random() - 0.5) * 0.04
      const cg = cfg.color[1] + (Math.random() - 0.5) * 0.1
      const cb = cfg.color[2] + (Math.random() - 0.5) * 0.03

      stemParticles.push({
        x: baseX + curveX + Math.cos(a) * r,
        y,
        z: baseZ + curveZ + Math.sin(a) * r,
        color: [cr, cg, cb],
        size: 0.04 + Math.random() * 0.04,
      })
    }

    // Add thorns
    const thornCfg = ROSE_CONFIG.thorns
    for (let i = 0; i < thornCfg.count; i++) {
      const t = 0.15 + (i / thornCfg.count) * 0.7
      const y = ROSE_CONFIG.centerY - t * cfg.length
      const curveX = Math.sin(t * Math.PI * 0.6) * 0.2 - Math.sin(t * Math.PI * 2) * 0.05
      const curveZ = Math.cos(t * Math.PI * 0.4 + 0.5) * 0.15
      const side = i % 2 === 0 ? 1 : -1
      const angle = side * 0.8
      const thornLen = 0.12 + Math.random() * 0.06

      for (let j = 0; j < thornCfg.particles / thornCfg.count; j++) {
        const u = Math.random()
        const tx = baseX + curveX + Math.cos(angle) * u * thornLen
        const ty = y - u * thornLen * 0.5
        const tz = baseZ + curveZ + Math.sin(angle) * u * thornLen

        stemParticles.push({
          x: tx,
          y: ty,
          z: tz,
          color: [cfg.color[0] + 0.05, cfg.color[1] - 0.05, cfg.color[2]],
          size: 0.03 + Math.random() * 0.02,
        })
      }
    }
  }

  function addLeafPoints(side, leafIndex) {
    const cfg = ROSE_CONFIG.leaves
    const attachY = ROSE_CONFIG.centerY - 1.0 - leafIndex * 0.7
    const attachX = ROSE_CONFIG.centerX + side * 0.12
    const attachZ = ROSE_CONFIG.centerZ

    for (let i = 0; i < cfg.particles / 3; i++) {
      const u = Math.random() // position along length
      const v = Math.random() // position across width

      // Realistic leaf: pointed tip, serrated edge
      const tipFactor = Math.pow(Math.sin(u * Math.PI), 0.9)
      const halfW = cfg.size * tipFactor * (0.5 + 0.5 * (1 - u * u)) * (0.9 + 0.1 * Math.sin(v * Math.PI * 6)) // serrated edge

      const len = cfg.size * 1.3

      // Pointed oval shape
      const lx = (v - 0.5) * halfW * 2
      const ly = u * len

      // Slight cup: leaf surface isn't flat
      const lz = Math.sin(u * Math.PI) * 0.15 + Math.sin(v * Math.PI) * 0.05

      // Leaf vein: darken particles along the center line
      const distFromVein = Math.abs(lx) / (halfW + 0.01)
      const veinDark = Math.max(0, 1 - distFromVein * 4) * 0.1

      // Angle the leaf grows at
      const ca = Math.cos(side * 0.5 + leafIndex * 0.3)
      const sa = Math.sin(side * 0.5 + leafIndex * 0.3)

      const wx = lx * ca - ly * sa * 0.25 + attachX
      const wy = ly * 0.6 + lx * sa * 0.2 + attachY
      const wz = lz + attachZ

      const cr = cfg.color[0] + (Math.random() - 0.5) * 0.06 - veinDark
      const cg = cfg.color[1] + (Math.random() - 0.5) * 0.12 - veinDark * 0.5
      const cb = cfg.color[2] + (Math.random() - 0.5) * 0.04

      leafParticles.push({
        x: wx, y: wy, z: wz,
        color: [cr, cg, cb],
        size: 0.04 + Math.random() * 0.03,
      })
    }
  }

  function addSepalPoints(sepalIndex) {
    const cfg = ROSE_CONFIG.sepals
    const angle = (sepalIndex / cfg.count) * Math.PI * 2 + 0.15
    const ca = Math.cos(angle)
    const sa = Math.sin(angle)

    for (let i = 0; i < cfg.particles; i++) {
      const u = Math.random() // along length
      const v = Math.random() // across width

      // Narrow pointed sepal
      const halfW = cfg.size * Math.sin(u * Math.PI) * (0.2 + 0.3 * (1 - u))
      const len = cfg.size * 0.8

      const lx = (v - 0.5) * halfW * 2
      const ly = u * len
      const lz = -u * 0.3 // sepal bends downward

      const wx = lx * ca - lz * sa + ROSE_CONFIG.centerX
      const wy = ly * 0.3 - 0.05 + ROSE_CONFIG.centerY // sits just below petals
      const wz = lx * sa + lz * ca + ROSE_CONFIG.centerZ

      const cr = cfg.color[0] + (Math.random() - 0.5) * 0.03
      const cg = cfg.color[1] + (Math.random() - 0.5) * 0.08
      const cb = cfg.color[2] + (Math.random() - 0.5) * 0.03

      leafParticles.push({
        x: wx, y: wy, z: wz,
        color: [cr, cg, cb],
        size: 0.03 + Math.random() * 0.02,
      })
    }
  }

  function addCenterPoints() {
    const cfg = ROSE_CONFIG.center
    for (let i = 0; i < cfg.particles; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.5
      const r = Math.random() * 0.2

      const x = Math.sin(phi) * Math.cos(theta) * r + ROSE_CONFIG.centerX
      const y = Math.cos(phi) * r * 0.5 + ROSE_CONFIG.centerY + 0.05
      const z = Math.sin(phi) * Math.sin(theta) * r + ROSE_CONFIG.centerZ

      const cr = cfg.color[0] + (Math.random() - 0.5) * 0.1
      const cg = cfg.color[1] + (Math.random() - 0.5) * 0.1
      const cb = cfg.color[2] + (Math.random() - 0.5) * 0.05

      centerParticles.push({
        x, y, z,
        color: [cr, cg, cb],
        size: 0.03 + Math.random() * 0.03,
      })
    }
  }

  function buildRose() {
    // Generate all particles
    ROSE_CONFIG.layers.forEach((layer, li) => {
      for (let pi = 0; pi < layer.count; pi++) {
        addPetalPoints(pi, li, layer)
      }
    })
    addStemPoints()
    for (let i = 0; i < ROSE_CONFIG.leaves.count; i++) {
      addLeafPoints(i === 0 ? 1 : -1, i)
    }
    // Sepals at flower base
    for (let i = 0; i < ROSE_CONFIG.sepals.count; i++) {
      addSepalPoints(i)
    }
    addCenterPoints()

    const total =
      petalParticles.length +
      stemParticles.length +
      leafParticles.length +
      centerParticles.length

    const positions = new Float32Array(total * 3)
    const colors = new Float32Array(total * 3)
    const sizes = new Float32Array(total)
    const petalIds = new Float32Array(total)

    let offset = 0

    function writeParticle(p, id) {
      positions[offset * 3] = p.x
      positions[offset * 3 + 1] = p.y
      positions[offset * 3 + 2] = p.z
      colors[offset * 3] = p.color[0]
      colors[offset * 3 + 1] = p.color[1]
      colors[offset * 3 + 2] = p.color[2]
      sizes[offset] = p.size
      petalIds[offset] = id
      offset++
    }

    petalParticles.forEach((p) => writeParticle(p, p.petalIndex + 1))
    stemParticles.forEach((p) => writeParticle(p, 0))
    leafParticles.forEach((p) => writeParticle(p, 0))
    centerParticles.forEach((p) => writeParticle(p, 0))

    roseGeometry = new THREE.BufferGeometry()
    roseGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    roseGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    roseGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    roseGeometry.setAttribute('aPetalId', new THREE.BufferAttribute(petalIds, 1))

    roseMaterial = new THREE.ShaderMaterial({
      vertexShader: ROSE_VERTEX_SHADER,
      fragmentShader: ROSE_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uFlyAlpha: { value: 0 },
      },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    rosePoints = new THREE.Points(roseGeometry, roseMaterial)
    scene.add(rosePoints)
  }

  /* ======================== Background Stars ======================== */

  function createBgStars() {
    const count = 1200
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60
      positions[i * 3 + 1] = (Math.random() - 0.5) * 60
      positions[i * 3 + 2] = -20 - Math.random() * 40
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    bgStarField = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.1,
        transparent: true,
        opacity: 0.4,
        sizeAttenuation: true,
      })
    )
    scene.add(bgStarField)
  }

  /* ======================== Ambient Floating Particles ======================== */

  function createAmbientParticles() {
    const count = 100
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = ROSE_CONFIG.centerX + (Math.random() - 0.5) * 5
      positions[i * 3 + 1] = ROSE_CONFIG.centerY + (Math.random() - 0.5) * 5
      positions[i * 3 + 2] = ROSE_CONFIG.centerZ + (Math.random() - 0.5) * 3
      ambientParticles.push({
        baseX: positions[i * 3],
        baseY: positions[i * 3 + 1],
        baseZ: positions[i * 3 + 2],
        speed: 0.3 + Math.random() * 0.5,
        amplitude: 0.2 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
      })
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    ambientMaterial = new THREE.PointsMaterial({
      color: 0xffb0c0,
      size: 0.06,
      transparent: true,
      opacity: 0.3,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const pts = new THREE.Points(geo, ambientMaterial)
    ambientPoints = pts
    scene.add(pts)
  }

  function updateAmbientParticles(time) {
    if (!ambientPoints || ambientParticles.length === 0) return
    const pos = ambientPoints.geometry.attributes.position.array
    for (let i = 0; i < ambientParticles.length; i++) {
      const p = ambientParticles[i]
      pos[i * 3] = p.baseX + Math.sin(time * p.speed + p.phase) * p.amplitude
      pos[i * 3 + 1] = p.baseY + Math.sin(time * p.speed * 0.7 + p.phase + 1) * p.amplitude * 0.5
      pos[i * 3 + 2] = p.baseZ + Math.cos(time * p.speed * 0.5 + p.phase + 2) * p.amplitude * 0.3
    }
    ambientPoints.geometry.attributes.position.needsUpdate = true
  }

  /* ======================== Click Target ======================== */

  function createClickTarget() {
    clickTarget = new THREE.Mesh(
      new THREE.SphereGeometry(4.0, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    clickTarget.position.set(ROSE_CONFIG.centerX, ROSE_CONFIG.centerY - 0.5, ROSE_CONFIG.centerZ)
    scene.add(clickTarget)
  }

  /* ======================== Camera ======================== */

  function updateCamera() {
    camTheta += (targetTheta - camTheta) * damping
    camPhi += (targetPhi - camPhi) * damping
    camRadius += (targetRadius - camRadius) * damping

    camera.position.x = camRadius * Math.sin(camPhi) * Math.sin(camTheta)
    camera.position.y = camRadius * Math.cos(camPhi) + 1
    camera.position.z = camRadius * Math.sin(camPhi) * Math.cos(camTheta)
    camera.lookAt(ROSE_CONFIG.centerX, ROSE_CONFIG.centerY - 0.2, ROSE_CONFIG.centerZ)
  }

  /* ======================== Animation ======================== */

  // Fly animation state
  let flyProgress = 0 // 0 = idle, 1 = fully flown
  let petalCenterX = 0, petalCenterY = 0, petalCenterZ = 0 // original center of selected petal
  const _camForward = new THREE.Vector3()
  const _targetPos = new THREE.Vector3()
  const _targetLocal = new THREE.Vector3() // target in rose's local space

  function updateFlyingPetal() {
    if (state !== 'flying_done' || !rosePoints) return

    // Petal stays in front of camera — convert world-space target to rose's local space
    camera.getWorldDirection(_camForward)
    const targetDist = 5.0
    _targetPos.copy(camera.position).addScaledVector(_camForward, targetDist)

    // Use Three.js built-in to convert world → local at current rose transform
    _targetLocal.copy(_targetPos)
    rosePoints.worldToLocal(_targetLocal)

    const currentScale = rosePoints.scale.x
    const pos = roseGeometry.attributes.position.array
    const spread = 1.8 * currentScale

    for (let idx = 0; idx < selectedParticleIndices.length; idx++) {
      const p = selectedParticleIndices[idx]
      const i = p.origIndex
      const ox = _offsets[idx].ox
      const oy = _offsets[idx].oy
      const oz = _offsets[idx].oz

      pos[i * 3] = _targetLocal.x + ox * spread
      pos[i * 3 + 1] = _targetLocal.y + oy * spread
      pos[i * 3 + 2] = _targetLocal.z + oz * spread
    }
    roseGeometry.attributes.position.needsUpdate = true
  }

  function animatePetalFly() {
    if (state !== 'idle' || !rosePoints) return
    if (petalParticles.length === 0) return

    state = 'flying'
    if (!audioCtx) audioCtx = createAudioCtx()
    playPetalFlySound(audioCtx)

    // Pick a random outer petal
    const outerPetals = petalParticles.filter((p) => p.layerIndex === 0)
    if (outerPetals.length === 0) {
      state = 'idle'
      return
    }

    // Pick a random petal index from outer layer
    const availableIndices = [...new Set(outerPetals.map((p) => p.petalIndex))]
    const chosenIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)]
    selectedPetal = { petalIndex: chosenIndex }
    selectedParticleIndices = petalParticles
      .map((p, i) => ({ ...p, origIndex: i }))
      .filter((p) => p.petalIndex === chosenIndex)

    // Compute petal center (in rose's local space)
    petalCenterX = 0
    petalCenterY = 0
    petalCenterZ = 0
    selectedParticleIndices.forEach((p) => {
      petalCenterX += p.originalX
      petalCenterY += p.originalY
      petalCenterZ += p.originalZ
    })
    const n = selectedParticleIndices.length
    petalCenterX /= n
    petalCenterY /= n
    petalCenterZ /= n

    // Pre-compute offsets from petal center
    _offsets.length = 0
    for (let idx = 0; idx < selectedParticleIndices.length; idx++) {
      const p = selectedParticleIndices[idx]
      _offsets.push({
        ox: p.originalX - petalCenterX,
        oy: p.originalY - petalCenterY,
        oz: p.originalZ - petalCenterZ,
      })
    }

    // Animate
    animTween = gsap.to(
      { t: 0 },
      {
        t: 1,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: function () {
          const t = this.targets()[0].t
          const pos = roseGeometry.attributes.position.array

          // Compute dynamic target in front of camera
          camera.getWorldDirection(_camForward)
          const targetDist = 5.0
          _targetPos.copy(camera.position).addScaledVector(_camForward, targetDist)

          // Scale down rose body slightly
          const currentScale = 1 - t * 0.15
          rosePoints.scale.setScalar(currentScale)

          const spread = 1 + t * 0.8

          // Convert world-space target to rose's local space at current frame
          _targetLocal.copy(_targetPos)
          rosePoints.worldToLocal(_targetLocal)

          for (let idx = 0; idx < selectedParticleIndices.length; idx++) {
            const p = selectedParticleIndices[idx]
            const i = p.origIndex
            const ox = _offsets[idx].ox
            const oy = _offsets[idx].oy
            const oz = _offsets[idx].oz

            pos[i * 3] = petalCenterX * (1 - t) + _targetLocal.x * t + ox * spread
            pos[i * 3 + 1] = petalCenterY * (1 - t) + _targetLocal.y * t + oy * spread
            pos[i * 3 + 2] = petalCenterZ * (1 - t) + _targetLocal.z * t + oz * spread
          }

          roseGeometry.attributes.position.needsUpdate = true
        },
        onComplete: () => {
          state = 'flying_done'
          flyProgress = 1
          emitEvent('petal-flew')
        },
      }
    )
  }

  function animatePetalReturn() {
    if (state !== 'flying_done' || !rosePoints) return

    state = 'flying_back'
    if (!audioCtx) audioCtx = createAudioCtx()
    playPetalReturnSound(audioCtx)

    // Capture camera-facing target at click time, convert to local space at current rose transform
    camera.getWorldDirection(_camForward)
    const targetDist = 5.0
    _targetPos.copy(camera.position).addScaledVector(_camForward, targetDist)
    _targetLocal.copy(_targetPos)
    rosePoints.worldToLocal(_targetLocal)

    animTween = gsap.to(
      { t: 0 },
      {
        t: 1,
        duration: 1.0,
        ease: 'power2.inOut',
        onUpdate: function () {
          const t = this.targets()[0].t // goes 0 -> 1, meaning from target back to rose
          const pos = roseGeometry.attributes.position.array

          const currentScale = 0.85 + t * 0.15
          rosePoints.scale.setScalar(currentScale)

          const spread = 1.8 - t * 0.8 // shrink spread back to 1

          for (let idx = 0; idx < selectedParticleIndices.length; idx++) {
            const p = selectedParticleIndices[idx]
            const i = p.origIndex
            const ox = _offsets[idx].ox
            const oy = _offsets[idx].oy
            const oz = _offsets[idx].oz

            pos[i * 3] = _targetLocal.x * (1 - t) + petalCenterX * t + ox * spread
            pos[i * 3 + 1] = _targetLocal.y * (1 - t) + petalCenterY * t + oy * spread
            pos[i * 3 + 2] = _targetLocal.z * (1 - t) + petalCenterZ * t + oz * spread
          }

          roseGeometry.attributes.position.needsUpdate = true
        },
        onComplete: () => {
          // Reset all petal positions to original
          const pos = roseGeometry.attributes.position.array
          let idx = 0
          petalParticles.forEach((p) => {
            pos[idx * 3] = p.originalX
            pos[idx * 3 + 1] = p.originalY
            pos[idx * 3 + 2] = p.originalZ
            idx++
          })
          roseGeometry.attributes.position.needsUpdate = true
          rosePoints.scale.setScalar(1)

          state = 'idle'
          selectedPetal = null
          selectedParticleIndices = []
          _offsets.length = 0
          emitEvent('petal-returned')
        },
      }
    )
  }

  /* ======================== Raycasting ======================== */

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  function handleInteraction(clientX, clientY) {
    if (!camera || state === 'flying' || state === 'flying_back') return

    mouse.x = (clientX / window.innerWidth) * 2 - 1
    mouse.y = -(clientY / window.innerHeight) * 2 + 1

    raycaster.setFromCamera(mouse, camera)

    if (state === 'idle') {
      const intersects = raycaster.intersectObject(clickTarget)
      if (intersects.length > 0) {
        animatePetalFly()
      }
    } else if (state === 'flying_done') {
      animatePetalReturn()
    }
  }

  /* ======================== Events ======================== */

  function onPointerDown(e) {
    dragging = true
    dragInitX = e.clientX
    dragInitY = e.clientY
    dragStartX = e.clientX
    dragStartY = e.clientY
  }

  function onPointerMove(e) {
    if (!dragging) return
    const dx = e.clientX - dragStartX
    const dy = e.clientY - dragStartY
    targetTheta -= dx * 0.005
    targetPhi = Math.max(
      0.3,
      Math.min(Math.PI - 0.3, targetPhi + dy * 0.005)
    )
    dragStartX = e.clientX
    dragStartY = e.clientY
  }

  function onPointerUp(e) {
    const dx = Math.abs(e.clientX - dragInitX)
    const dy = Math.abs(e.clientY - dragInitY)
    dragging = false

    // If barely moved, treat as click
    if (dx < 5 && dy < 5) {
      handleInteraction(e.clientX, e.clientY)
    }
  }

  function onWheel(e) {
    targetRadius = Math.max(6, Math.min(22, targetRadius + e.deltaY * 0.01))
  }

  /* ======================== Init / Dispose ======================== */

  function init(el) {
    container = el
    startTime = performance.now()

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x0c0e12)
    container.appendChild(renderer.domElement)

    scene = new THREE.Scene()

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.set(0, 1, 10)

    createBgStars()
    buildRose()
    createAmbientParticles()
    createClickTarget()
  }

  function enableInteraction() {
    if (!renderer || !renderer.domElement) return
    const el = renderer.domElement
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: true })
  }

  function disableInteraction() {
    if (!renderer || !renderer.domElement) return
    const el = renderer.domElement
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
    el.removeEventListener('wheel', onWheel)
  }

  function dispose(el) {
    disableInteraction()
    if (animTween) animTween.kill()
    if (audioCtx) audioCtx.close()

    if (roseGeometry) roseGeometry.dispose()
    if (roseMaterial) roseMaterial.dispose()
    if (bgStarField) bgStarField.geometry.dispose()
    if (ambientPoints) ambientPoints.geometry.dispose()
    if (ambientMaterial) ambientMaterial.dispose()
    if (clickTarget) {
      clickTarget.geometry.dispose()
      clickTarget.material.dispose()
    }

    if (renderer) {
      if (el && el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }

    petalParticles.length = 0
    stemParticles.length = 0
    leafParticles.length = 0
    centerParticles.length = 0
    ambientParticles.length = 0
    selectedParticleIndices = []
    selectedPetal = null
    state = 'idle'
  }

  /* ======================== Render Loop ======================== */

  let rafId = null
  function animate() {
    rafId = requestAnimationFrame(animate)
    const time = (performance.now() - startTime) / 1000

    // Idle breathing rotation
    if (state === 'idle' || state === 'flying_done') {
      targetTheta += 0.001
    }

    updateCamera()

    if (rosePoints) {
      roseMaterial.uniforms.uTime.value = time
      // Idle subtle rotation
      if (state === 'idle' || state === 'flying_done') {
        rosePoints.rotation.y += 0.0015
      }
    }

    // Keep flying petal in front of camera
    if (state === 'flying_done') {
      updateFlyingPetal()
    }

    if (bgStarField) {
      bgStarField.rotation.y += 0.0002
    }

    updateAmbientParticles(time)

    renderer.render(scene, camera)
  }

  function startRenderLoop() {
    if (!rafId) animate()
  }

  // Patch init to also start render loop
  const origInit = init
  function initWithLoop(el) {
    origInit(el)
    startRenderLoop()
  }

  return {
    init: initWithLoop,
    enableInteraction,
    disableInteraction,
    dispose,
    on,
  }
}
