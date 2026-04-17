import * as THREE from 'three'
import gsap from 'gsap'

/* ======================== Simplex 3D Noise ======================== */

const PERM = new Uint8Array(512)
;(function initPerm() {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
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

function playPageTurnSound(ctx, direction) {
  const now = ctx.currentTime

  const bufSize = ctx.sampleRate * 0.5
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.15)) * 0.3
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.08, now)
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
  const filt = ctx.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.value = direction === 'right' ? 3000 : 2500
  filt.Q.value = 1.5
  noise.connect(filt).connect(ng).connect(ctx.destination)
  noise.start(now)
  noise.stop(now + 0.5)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  if (direction === 'right') {
    osc.frequency.setValueAtTime(400, now)
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.15)
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.4)
  } else {
    osc.frequency.setValueAtTime(800, now)
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.15)
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.4)
  }
  const og = ctx.createGain()
  og.gain.setValueAtTime(0.03, now)
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
  osc.connect(og).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.4)
}

/* ======================== Magic Text Generation ======================== */

function generateMagicText(pageSeed) {
  const runes = '᚛᚜ᚐᚑᚒᚓᚔᚕᚖᚗᚘᚙᚚꙮ᛭᚜᚛ⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪ⟡⬡⬢◈◇◆⊕⊗⊘⊙⊚⊛'
  const lines = []
  const rng = (function(seed) {
    let s = seed * 137 + 42
    return function() {
      s = (s * 16807) % 2147483647
      return (s - 1) / 2147483646
    }
  })(pageSeed)

  const numLines = 6 + Math.floor(rng() * 5)
  for (let i = 0; i < numLines; i++) {
    const len = 8 + Math.floor(rng() * 15)
    let line = ''
    for (let j = 0; j < len; j++) {
      line += runes[Math.floor(rng() * runes.length)]
    }
    lines.push(line)
  }
  return lines
}

/* ======================== Page Geometry ======================== */

const PAGE_CONFIG = {
  width: 1.6,        // page width from spine to edge (along X)
  height: 2.8,       // page height along spine (along Z)
  paperParticles: 1200,
  textParticles: 400,
  edgeParticles: 80,
  thicknessOffset: 0.008, // Y offset per page to simulate stack
}

// Page droop curve: power(t^0.3) — steep rise right at the spine, then flattens toward edge
// Spine is the LOWEST point, pages curve upward from it
// t^0.3 gives: t=0→0, t=0.1→0.5, t=0.5→0.81, t=1→1
const MAX_DROOP = 0.4
function pageDroop(t) {
  return Math.pow(t, 0.3)  // positive — page rises from spine to edge
}

function generatePageParticles(pageIndex, isLeft, side) {
  const { width, height, paperParticles, textParticles, edgeParticles } = PAGE_CONFIG
  const particles = []
  const seed = pageIndex * 7919 + (isLeft ? 10000 : 0)

  // Paper particles
  // Book lies flat on XZ plane: spine along Z axis, pages extend along ±X
  // Pages have a natural droop: flat at spine, curves downward toward free edge
  // Using logarithmic droop: y = -MAX_DROOP * log(1 + 3*t) / log(4)
  for (let i = 0; i < paperParticles; i++) {
    const t = Math.random()  // 0 at spine, 1 at free edge (along X)
    const u = Math.random()  // 0..1 along spine (along Z)

    const x = isLeft ? -(t * width) : (t * width)
    const droop = pageDroop(t) * MAX_DROOP
    const y = droop
    const z = (u - 0.5) * height

    const n = noise3D(x * 0.5 + pageIndex, z * 0.5, 1.0)
    const cr = 0.92 + n * 0.06 + Math.random() * 0.02
    const cg = 0.85 + n * 0.05 + Math.random() * 0.02
    const cb = 0.72 + n * 0.04 + Math.random() * 0.02

    particles.push({
      x, y, z,
      originalX: x,
      originalY: y,
      originalZ: z,
      t, u,
      pageInternalY: droop,
      stackOffset: 0,
      color: [cr, cg, cb],
      size: 0.035 + Math.random() * 0.02,
      type: 0, // paper
      pageIndex,
      isLeft,
    })
  }

  // Magic text particles — lines along spine (Z), spaced from spine outward (X)
  const magicLines = generateMagicText(seed)
  for (let i = 0; i < textParticles; i++) {
    const lineIdx = Math.floor(Math.random() * magicLines.length)
    const charPos = Math.random() // position along the text line (Z direction)
    const t = (lineIdx + 0.5 + (Math.random() - 0.5) * 0.3) / (magicLines.length + 1)

    const x = isLeft ? -(t * width * 0.85 + width * 0.075) : (t * width * 0.85 + width * 0.075)
    const z = (charPos - 0.5) * height * 0.85

    // Follow same droop curve
    const droop = pageDroop(t) * MAX_DROOP

    const darkness = 0.15 + Math.random() * 0.1
    particles.push({
      x, y: droop + 0.001, z,
      originalX: x,
      originalY: droop + 0.001,
      originalZ: z,
      t, u: charPos,
      pageInternalY: droop + 0.001,
      stackOffset: 0,
      color: [darkness, darkness * 0.9, darkness * 0.7],
      size: 0.025 + Math.random() * 0.015,
      type: 1, // text
      pageIndex,
      isLeft,
    })
  }

  // Edge highlight particles (along the free edge)
  for (let i = 0; i < edgeParticles; i++) {
    const u = Math.random()
    const x = isLeft ? -width : width
    const z = (u - 0.5) * height

    // Edge droop: max droop at t=1
    const droop = pageDroop(1.0) * MAX_DROOP

    particles.push({
      x, y: droop, z,
      originalX: x,
      originalY: droop,
      originalZ: z,
      t: 1.0, u,
      pageInternalY: 0,
      stackOffset: 0,
      color: [0.98, 0.93, 0.85],
      size: 0.02 + Math.random() * 0.01,
      type: 2, // edge
      pageIndex,
      isLeft,
    })
  }

  // Blue spell/distortion text particles — float above the page surface
  // Runes that appear to drift and warp in the air above each page
  const spellRunes = '᚛᚜ᚐᚑᚒᚓᚔꙮ᛭⟡⬡◈⊕⊙⊛'
  for (let i = 0; i < 80; i++) {
    const t = 0.2 + Math.random() * 0.7  // mostly in the middle of the page
    const u = Math.random()

    const x = isLeft ? -(t * width * 0.8) : (t * width * 0.8)
    const z = (u - 0.5) * height * 0.85
    // Float above the page surface
    const droop = pageDroop(t) * MAX_DROOP
    const floatY = droop + 0.15 + Math.random() * 0.35

    // Blue spell color
    const br = 0.15 + Math.random() * 0.25
    const bg = 0.35 + Math.random() * 0.35
    const bb = 0.85 + Math.random() * 0.15

    particles.push({
      x, y: floatY, z,
      originalX: x,
      originalY: floatY,
      originalZ: z,
      t, u,
      pageInternalY: floatY,
      stackOffset: 0,
      color: [br, bg, bb],
      size: 0.025 + Math.random() * 0.025,
      type: 3, // spell text
      pageIndex,
      isLeft,
      // Drift params for idle animation
      driftPhase: Math.random() * Math.PI * 2,
      driftSpeed: 0.4 + Math.random() * 0.6,
      driftAmp: 0.05 + Math.random() * 0.08,
    })
  }

  return particles
}

/* ======================== Shader Code ======================== */

const BOOK_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aType;
  varying vec3 vColor;
  varying float vSize;
  varying float vType;
  varying float vY;
  uniform float uTime;

  void main() {
    vColor = color;
    vSize = aSize;
    vType = aType;
    vY = position.y;

    // Idle breathing: pages very subtly undulate
    float breathe = sin(uTime * 0.6 + position.x * 0.5) * 0.015;
    vec3 pos = position + vec3(0, breathe, 0);

    // Spell particles get extra float
    if (aType > 2.5) {
      pos.y += sin(uTime * 1.2 + position.x * 2.0) * 0.04;
      pos.x += cos(uTime * 0.8 + position.z * 1.5) * 0.03;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const BOOK_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vSize;
  varying float vType;
  varying float vY;
  uniform float uTime;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);

    float core = smoothstep(0.5, 0.15, dist);
    float halo = exp(-dist * 5.0) * 0.2;
    float alpha = core + halo;

    vec3 col = vColor;

    // Text particles: slight glow
    if (vType > 0.5 && vType < 1.5) {
      float glow = exp(-dist * 3.0) * 0.15;
      col += vec3(glow * 0.4, glow * 0.2, glow * 0.6);
    }

    // Edge particles: brighter
    if (vType > 1.5 && vType < 2.5) {
      col += vec3(0.1, 0.08, 0.05);
    }

    // Blue spell/distortion text: strong blue glow with halo
    if (vType > 2.5) {
      float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + vY * 3.0);
      float glow = exp(-dist * 2.5) * 0.5 * pulse;
      float halo = exp(-dist * 4.0) * 0.25 * pulse;
      col += vec3(glow * 0.2, glow * 0.5, glow);
      col += vec3(halo * 0.1, halo * 0.3, halo * 0.7);
    }

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(col, alpha);
  }
`

/* ======================== Main Composable ======================== */

export function useBookPage() {
  let renderer, scene, camera
  let bookPoints, bookGeometry, bookMaterial
  let bgParticles, bgStarField

  const callbacks = {}

  // State
  let state = 'idle' // 'idle' | 'turning'
  let animTween = null
  let turnDirection = null // 'right' (page from right to left) | 'left' (page from left to right)

  // Page management
  const pagesRight = [] // pages on the right side (not yet turned)
  const pagesLeft = []  // pages on the left side (already turned)
  const TOTAL_PAGES = 30 // total pages in the book

  // Audio
  let audioCtx = null

  // Time
  let startTime = 0
  let rafId = null

  // Turning page particle data
  let turningParticles = []
  let turningStartIndex = 0

  // Spell particle indices (type 3) for idle animation
  const spellParticleIndices = []
  const spellParticleData = [] // {idx, driftPhase, driftSpeed, driftAmp}

  function on(event, fn) {
    if (!callbacks[event]) callbacks[event] = []
    callbacks[event].push(fn)
  }
  function emitEvent(event, data) {
    if (callbacks[event]) callbacks[event].forEach((fn) => fn(data))
  }

  /* ======================== Background ======================== */

  function createBgStars() {
    const count = 800
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50
      positions[i * 3 + 1] = (Math.random() - 0.5) * 50
      positions[i * 3 + 2] = -15 - Math.random() * 30
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    bgStarField = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.08,
        transparent: true,
        opacity: 0.3,
        sizeAttenuation: true,
      })
    )
    scene.add(bgStarField)
  }

  function createFloatingDust() {
    const count = 150
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6
      positions[i * 3 + 2] = -2 + Math.random() * 4
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    bgParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xf5e6c8,
        size: 0.04,
        transparent: true,
        opacity: 0.15,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    scene.add(bgParticles)
  }

  function updateFloatingDust(time) {
    if (!bgParticles) return
    const pos = bgParticles.geometry.attributes.position.array
    for (let i = 0; i < pos.length / 3; i++) {
      pos[i * 3] += Math.sin(time * 0.3 + i * 1.7) * 0.001
      pos[i * 3 + 1] += Math.cos(time * 0.2 + i * 2.3) * 0.0005
    }
    bgParticles.geometry.attributes.position.needsUpdate = true
  }

  /* ======================== Book Building ======================== */

  function buildBook() {
    const allParticles = []

    // Build right stack (pages not yet turned)
    let offset = 0
    for (let i = TOTAL_PAGES - 1; i >= TOTAL_PAGES / 2; i--) {
      const page = generatePageParticles(i, false, 'right')
      const stackOffset = (i - TOTAL_PAGES / 2) * PAGE_CONFIG.thicknessOffset
      page.forEach(p => {
        p.pageInternalY = p.originalY
        p.stackOffset = stackOffset
        p.originalY = p.pageInternalY + stackOffset
        p.y = p.originalY
      })
      pagesRight.push({ index: i, particles: page, startIndex: offset })
      allParticles.push(...page)
      offset += page.length
    }

    // Build left stack (pages already turned)
    for (let i = TOTAL_PAGES / 2 - 1; i >= 0; i--) {
      const page = generatePageParticles(i, true, 'left')
      const stackOffset = i * PAGE_CONFIG.thicknessOffset
      page.forEach(p => {
        p.pageInternalY = p.originalY
        p.stackOffset = stackOffset
        p.originalY = p.pageInternalY + stackOffset
        p.y = p.originalY
      })
      pagesLeft.push({ index: i, particles: page, startIndex: offset })
      allParticles.push(...page)
      offset += page.length
    }

    const total = allParticles.length
    const positions = new Float32Array(total * 3)
    const colors = new Float32Array(total * 3)
    const sizes = new Float32Array(total)
    const types = new Float32Array(total)

    allParticles.forEach((p, i) => {
      positions[i * 3] = p.x
      positions[i * 3 + 1] = p.y
      positions[i * 3 + 2] = p.z
      colors[i * 3] = p.color[0]
      colors[i * 3 + 1] = p.color[1]
      colors[i * 3 + 2] = p.color[2]
      sizes[i] = p.size
      types[i] = p.type

      if (p.type === 3) {
        spellParticleIndices.push(i)
        spellParticleData.push({
          idx: i,
          driftPhase: p.driftPhase || 0,
          driftSpeed: p.driftSpeed || 0.5,
          driftAmp: p.driftAmp || 0.08,
          baseX: p.x,
          baseY: p.y,
        })
      }
    })

    bookGeometry = new THREE.BufferGeometry()
    bookGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    bookGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    bookGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    bookGeometry.setAttribute('aType', new THREE.BufferAttribute(types, 1))

    bookMaterial = new THREE.ShaderMaterial({
      vertexShader: BOOK_VERTEX_SHADER,
      fragmentShader: BOOK_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })

    bookPoints = new THREE.Points(bookGeometry, bookMaterial)
    scene.add(bookPoints)
  }

  /* ======================== Camera ======================== */

  function setupCamera() {
    // Book lies flat on XZ plane, spine along Z
    // Right page extends to +X, left page to -X
    // Camera from front-above, looking down at the book
    const aspect = window.innerWidth / window.innerHeight
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100)
    camera.position.set(0, 4.5, 7)
    camera.lookAt(0, 0, 0.5)
  }

  /* ======================== Page Turning ======================== */

  function turnPage(direction) {
    if (state !== 'idle') return

    if (direction === 'right') {
      // Turn page from right to left
      if (pagesRight.length === 0) return
      state = 'turning'
      turnDirection = 'right'

      const pageData = pagesRight.pop()
      turningStartIndex = pageData.startIndex
      turningParticles = pageData.particles.map((p, i) => ({
        ...p,
        origIndex: pageData.startIndex + i,
      }))

    } else if (direction === 'left') {
      // Turn page from left to right
      if (pagesLeft.length === 0) return
      state = 'turning'
      turnDirection = 'left'

      const pageData = pagesLeft.pop()
      turningStartIndex = pageData.startIndex
      turningParticles = pageData.particles.map((p, i) => ({
        ...p,
        origIndex: pageData.startIndex + i,
      }))
    }

    if (!audioCtx) audioCtx = createAudioCtx()
    playPageTurnSound(audioCtx, direction)

    animTween = gsap.to(
      { t: 0 },
      {
        t: 1,
        duration: 0.9,
        ease: 'power2.inOut',
        onUpdate: function () {
          const t = this.targets()[0].t
          updateTurningPage(t)
        },
        onComplete: () => {
          finalizeTurn()
        },
      }
    )
  }

  function updateTurningPage(t) {
    if (turningParticles.length === 0) return

    const pos = bookGeometry.attributes.position.array

    for (let i = 0; i < turningParticles.length; i++) {
      const p = turningParticles[i]
      const idx = p.origIndex

      // Angle: 0 to PI for right turn, 0 to -PI for left turn
      const angle = turnDirection === 'right'
        ? t * Math.PI
        : -t * Math.PI

      // t_param: distance from spine (0 at spine, 1 at free edge)
      const t_param = Math.abs(p.t)

      const radialDist = Math.abs(p.originalX)
      const cosA = Math.cos(angle)
      const sinA = Math.sin(angle)

      // 3D arch: always upward, regardless of flip direction
      const archAmount = 0.8 * Math.sin(t * Math.PI) * Math.sin(t_param * Math.PI)

      // Droop fades out during flip (page straightens as it rises)
      const droopFactor = 1 - Math.sin(t * Math.PI)
      const droopAtEdge = pageDroop(t_param) * MAX_DROOP
      const baseY = droopAtEdge * droopFactor

      let newX, newY

      if (turnDirection === 'right') {
        // Right page (at +X) rotates toward -X, arching through +Y
        newX = radialDist * cosA
        newY = radialDist * sinA + archAmount + baseY
      } else {
        // Left page (at -X) rotates toward +X, arching through +Y
        // sin(-t*PI) = -sin(t*PI), so use abs for upward arch
        newX = -radialDist * cosA
        newY = radialDist * Math.abs(sinA) + archAmount + baseY
      }

      // Z stays the same (along the spine)
      pos[idx * 3] = newX
      pos[idx * 3 + 1] = newY
      pos[idx * 3 + 2] = p.originalZ
    }

    bookGeometry.attributes.position.needsUpdate = true
  }

  function finalizeTurn() {
    const pos = bookGeometry.attributes.position.array
    const dir = turnDirection

    if (dir === 'right') {
      // Move particles to their final left-side positions
      const newStackOffset = pagesLeft.length * PAGE_CONFIG.thicknessOffset
      for (let i = 0; i < turningParticles.length; i++) {
        const p = turningParticles[i]
        const idx = p.origIndex

        // X flips, Z stays, Y resets to pageInternalY + stackOffset
        const finalX = -Math.abs(p.originalX)
        const finalY = p.pageInternalY + newStackOffset
        const finalZ = p.originalZ

        pos[idx * 3] = finalX
        pos[idx * 3 + 1] = finalY
        pos[idx * 3 + 2] = finalZ

        p.x = finalX
        p.y = finalY
        p.z = finalZ
        p.originalX = finalX
        p.originalY = finalY
        p.originalZ = finalZ
        p.stackOffset = newStackOffset
      }

      pagesLeft.push({
        index: turningParticles[0]?.pageIndex ?? 0,
        particles: turningParticles,
        startIndex: turningStartIndex,
      })

    } else {
      // Move particles to their final right-side positions
      const newStackOffset = pagesRight.length * PAGE_CONFIG.thicknessOffset
      for (let i = 0; i < turningParticles.length; i++) {
        const p = turningParticles[i]
        const idx = p.origIndex

        const finalX = Math.abs(p.originalX)
        const finalY = p.pageInternalY + newStackOffset
        const finalZ = p.originalZ

        pos[idx * 3] = finalX
        pos[idx * 3 + 1] = finalY
        pos[idx * 3 + 2] = finalZ

        p.x = finalX
        p.y = finalY
        p.z = finalZ
        p.originalX = finalX
        p.originalY = finalY
        p.originalZ = finalZ
        p.stackOffset = newStackOffset
      }

      pagesRight.push({
        index: turningParticles[0]?.pageIndex ?? 0,
        particles: turningParticles,
        startIndex: turningStartIndex,
      })
    }

    bookGeometry.attributes.position.needsUpdate = true

    state = 'idle'
    turnDirection = null
    turningParticles = []
    animTween = null

    emitEvent('page-turned', { direction: dir })
  }

  /* ======================== Interaction ======================== */

  function handleInteraction(clientX, clientY) {
    if (state !== 'idle') return

    // Simple: right half = turn right page, left half = turn left page
    if (clientX > window.innerWidth / 2) {
      turnPage('right')
    } else {
      turnPage('left')
    }
  }

  function onPointerUp(e) {
    handleInteraction(e.clientX, e.clientY)
  }

  function enableInteraction() {
    if (!renderer || !renderer.domElement) return
    renderer.domElement.addEventListener('pointerup', onPointerUp)
  }

  function disableInteraction() {
    if (!renderer || !renderer.domElement) return
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
  }

  /* ======================== Render Loop ======================== */

  function animate() {
    rafId = requestAnimationFrame(animate)
    const time = (performance.now() - startTime) / 1000

    // Update shader breathing time
    if (bookMaterial) bookMaterial.uniforms.uTime.value = time

    // Subtle camera breathing sway
    if (camera) {
      camera.position.x = Math.sin(time * 0.3) * 0.15
      camera.position.y = 4.5 + Math.sin(time * 0.2) * 0.1
    }

    updateFloatingDust(time)

    // Idle floating for blue spell particles (position-level, in addition to shader-level float)
    if (spellParticleData.length > 0 && bookGeometry) {
      const pos = bookGeometry.attributes.position.array
      for (let i = 0; i < spellParticleData.length; i++) {
        const sp = spellParticleData[i]
        pos[sp.idx * 3] = sp.baseX + Math.sin(time * sp.driftSpeed + sp.driftPhase) * sp.driftAmp
        pos[sp.idx * 3 + 1] = sp.baseY + Math.sin(time * sp.driftSpeed * 0.7 + sp.driftPhase + 1) * sp.driftAmp * 0.5
      }
      bookGeometry.attributes.position.needsUpdate = true
    }

    if (bgStarField) {
      bgStarField.rotation.y += 0.0001
    }

    renderer.render(scene, camera)
  }

  /* ======================== Init / Dispose ======================== */

  function init(el) {
    startTime = performance.now()

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x2a1a3a)
    el.appendChild(renderer.domElement)

    scene = new THREE.Scene()

    setupCamera()

    createBgStars()
    createFloatingDust()
    buildBook()

    // Start render loop
    if (!rafId) animate()
  }

  function dispose(el) {
    disableInteraction()
    if (animTween) animTween.kill()
    if (audioCtx) audioCtx.close()
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    if (bookGeometry) bookGeometry.dispose()
    if (bookMaterial) bookMaterial.dispose()
    if (bgStarField) bgStarField.geometry.dispose()
    if (bgParticles) bgParticles.geometry.dispose()

    if (renderer) {
      if (el && el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }

    pagesRight.length = 0
    pagesLeft.length = 0
    turningParticles = []
    spellParticleIndices.length = 0
    spellParticleData.length = 0
    state = 'idle'
  }

  return {
    init,
    enableInteraction,
    disableInteraction,
    dispose,
    on,
  }
}
