import * as THREE from 'three'
import gsap from 'gsap'

/* ======================== Audio Engine ======================== */

function createAudioCtx() {
  return new (window.AudioContext || window.webkitAudioContext)()
}

function playSandFlowSound(ctx, intensity = 0.04) {
  const now = ctx.currentTime
  const bufSize = ctx.sampleRate * 0.3
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.12))
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(intensity, now)
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
  const filt = ctx.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.value = 2500
  filt.Q.value = 1.5
  noise.connect(filt).connect(ng).connect(ctx.destination)
  noise.start(now)
  noise.stop(now + 0.3)
}

function playFlipSound(ctx) {
  const now = ctx.currentTime
  const bufSize = ctx.sampleRate * 0.8
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) {
    const env = Math.exp(-i / (ctx.sampleRate * 0.25))
    const mod = 1 + 0.5 * Math.sin(i / ctx.sampleRate * Math.PI * 2 * 3)
    d[i] = (Math.random() * 2 - 1) * env * mod * 0.4
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.06, now)
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.setValueAtTime(800, now)
  filt.frequency.exponentialRampToValueAtTime(3000, now + 0.2)
  filt.frequency.exponentialRampToValueAtTime(400, now + 0.8)
  noise.connect(filt).connect(ng).connect(ctx.destination)
  noise.start(now)
  noise.stop(now + 0.8)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(600, now)
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.3)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.03, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
  osc.connect(g).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.3)
}

/* ======================== Deterministic RNG ======================== */

function makeRNG(seed) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

/* ======================== Main Composable ======================== */

export function useHourglass() {
  let renderer, scene, camera
  let glassPoints, sandStreamPoints
  let bgStarField, ambientPoints, ambientMaterial
  const ambientParticles = []
  let container

  // Top/Bottom sand point objects
  let topSandPoints = null
  let bottomSandPoints = null

  // State
  let state = 'flowing' // 'flowing' | 'turning'
  let turnTween = null

  // Audio
  let audioCtx = null

  // Time
  let startTime = 0

  // Drag
  let dragging = false
  let dragStartX = 0
  let dragStartY = 0
  let dragInitX = 0
  let dragInitY = 0

  // Camera
  let camTheta = 0
  let camPhi = Math.PI / 2
  let camRadius = 10
  let targetTheta = 0
  let targetPhi = Math.PI / 2
  let targetRadius = 10
  const damping = 0.08

  // Hourglass geometry params
  const GLASS_TOP_Y = 3.0
  const GLASS_BOTTOM_Y = -3.0
  const GLASS_NECK_Y = 0
  const GLASS_RADIUS_TOP = 2.2
  const GLASS_RADIUS_MID = 0.25
  const GLASS_RADIUS_BOTTOM = 2.2

  // Particle pools
  let topSandPool = null
  let bottomSandPool = null

  // Falling sand particles (in mid-air, animating from top to bottom)
  let fallingSand = [] // [{ topIndex, x, y, z, startY, endY, speed, settled }]

  const MAX_TOP_SAND_PARTICLES = 120000
  const MAX_BOTTOM_SAND_PARTICLES = 120000
  const MAX_FALLING = 200  // max particles in mid-air at once
  const STREAM_PARTICLE_COUNT = 0  // removed separate stream, using falling particles instead

  /* ======================== Shader Code ======================== */

  const GLASS_VERTEX_SHADER = `
    attribute float aSize;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (200.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
      vAlpha = 0.35;
    }
  `

  const GLASS_FRAGMENT_SHADER = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 center = gl_PointCoord - 0.5;
      float dist = length(center);
      if (dist > 0.5) discard;
      float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
      gl_FragColor = vec4(vColor, alpha);
    }
  `

  const SAND_VERTEX_SHADER = `
    attribute float aSize;
    varying vec3 vColor;
    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (200.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const SAND_FRAGMENT_SHADER = `
    varying vec3 vColor;
    void main() {
      vec2 center = gl_PointCoord - 0.5;
      float dist = length(center);
      if (dist > 0.5) discard;
      float core = smoothstep(0.5, 0.15, dist);
      float halo = exp(-dist * 3.0) * 0.2;
      float alpha = core + halo;
      float glow = exp(-dist * 2.0) * 0.1;
      vec3 col = vColor + vec3(glow * 0.2);
      gl_FragColor = vec4(col, alpha);
    }
  `

  const STREAM_VERTEX_SHADER = `
    attribute float aSize;
    varying vec3 vColor;
    varying float vStreamAlpha;
    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (150.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
      vStreamAlpha = 0.7;
    }
  `

  const STREAM_FRAGMENT_SHADER = `
    varying vec3 vColor;
    varying float vStreamAlpha;
    void main() {
      vec2 center = gl_PointCoord - 0.5;
      float dist = length(center);
      if (dist > 0.5) discard;
      float alpha = smoothstep(0.5, 0.2, dist) * vStreamAlpha;
      gl_FragColor = vec4(vColor, alpha);
    }
  `

  /* ======================== Glass Geometry ======================== */

  function generateGlassPoints() {
    const positions = []
    const colors = []
    const sizes = []

    // Horizontal rings that trace the X shape
    function addRingAtY(y, radius, segCount) {
      for (let j = 0; j < segCount; j++) {
        const angle = (j / segCount) * Math.PI * 2
        positions.push(
          Math.cos(angle) * radius,
          y,
          Math.sin(angle) * radius
        )
        colors.push(0.6, 0.65, 0.78)
        sizes.push(0.035)
      }
    }

    // Ring count along the cone
    const ringCount = 600
    // Points per ring at max radius (controls density)
    const pointsPerUnitRadius = 55

    // Upper half: rings from neck (y=0, r=0.25) to top (y=3, r=2.2)
    for (let i = 0; i < ringCount; i++) {
      const t = i / ringCount
      const y = GLASS_NECK_Y + t * (GLASS_TOP_Y - GLASS_NECK_Y)
      const r = GLASS_RADIUS_MID + t * (GLASS_RADIUS_TOP - GLASS_RADIUS_MID)
      const segCount = Math.max(30, Math.round(r * pointsPerUnitRadius))
      addRingAtY(y, r, segCount)
    }

    // Lower half: rings from neck (y=0, r=0.25) to bottom (y=-3, r=2.2)
    for (let i = 0; i < ringCount; i++) {
      const t = i / ringCount
      const y = GLASS_NECK_Y - t * (GLASS_NECK_Y - GLASS_BOTTOM_Y)
      const r = GLASS_RADIUS_MID + t * (GLASS_RADIUS_BOTTOM - GLASS_RADIUS_MID)
      const segCount = Math.max(30, Math.round(r * pointsPerUnitRadius))
      addRingAtY(y, r, segCount)
    }

    // Top circular cap — many concentric dense circles
    function addCapCircle(centerY, radius, yOffset) {
      const segCount = 120
      for (let j = 0; j < segCount; j++) {
        const angle = (j / segCount) * Math.PI * 2
        positions.push(
          Math.cos(angle) * radius,
          centerY + yOffset,
          Math.sin(angle) * radius
        )
        colors.push(0.65, 0.7, 0.82)
        sizes.push(0.045 + Math.random() * 0.02)
      }
    }
    // Top cap: 12 concentric circles
    for (let ring = 1; ring <= 12; ring++) {
      const r = ring * GLASS_RADIUS_TOP / 12
      addCapCircle(GLASS_TOP_Y, r, 0.01)
      addCapCircle(GLASS_TOP_Y, r, -0.01)
    }
    // Bottom cap: 24 concentric circles (extra dense)
    for (let ring = 1; ring <= 24; ring++) {
      const r = ring * GLASS_RADIUS_BOTTOM / 24
      addCapCircle(GLASS_BOTTOM_Y, r, 0.015)
      addCapCircle(GLASS_BOTTOM_Y, r, 0)
      addCapCircle(GLASS_BOTTOM_Y, r, -0.015)
    }

    // Neck ring — narrow middle circle
    for (let j = 0; j < 60; j++) {
      const angle = (j / 60) * Math.PI * 2
      positions.push(
        Math.cos(angle) * GLASS_RADIUS_MID,
        GLASS_NECK_Y,
        Math.sin(angle) * GLASS_RADIUS_MID
      )
      colors.push(0.65, 0.7, 0.82)
      sizes.push(0.04)
    }

    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      sizes: new Float32Array(sizes),
    }
  }

  /* ======================== Sand Particle Pool ======================== */

  function generateTopSandPool(maxParticles, rng) {
    const particles = []
    const baseR = GLASS_RADIUS_TOP * 0.82

    // All particles scattered in the bottom half of the top chamber
    const yMin = 0.1
    const yMax = 0.1 + (GLASS_TOP_Y - 0.3) * 0.5  // y=0.1 ~ y=1.55

    for (let i = 0; i < maxParticles; i++) {
      // Random y in the lower half of upper chamber
      const y = yMin + rng() * (yMax - yMin)

      // Radius at this y (matches glass cone shape)
      // At y=0.1, r ≈ 0.25 (neck). At y=3.0, r = 2.2
      const t = (y - GLASS_NECK_Y) / (GLASS_TOP_Y - GLASS_NECK_Y) // 0~1 along cone
      const glassR = GLASS_RADIUS_MID + t * (GLASS_RADIUS_TOP - GLASS_RADIUS_MID)
      const maxR = glassR * 0.85 // stay inside glass

      // Random position within the circle
      const r = Math.sqrt(rng()) * maxR
      const angle = rng() * Math.PI * 2

      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r

      // Sand color variation
      const warmth = 0.75 + rng() * 0.2
      const colR = warmth * (0.85 + rng() * 0.1)
      const colG = warmth * (0.6 + rng() * 0.1)
      const colB = warmth * (0.2 + rng() * 0.1)

      particles.push({
        x, y, z,
        color: [colR, colG, colB],
        size: 0.035 + rng() * 0.05,
      })
    }

    // Sort by y ascending so lowest particles (closest to neck) fall first
    particles.sort((a, b) => a.y - b.y)

    return { particles }
  }

  function generateBottomSandPool(maxParticles, rng) {
    const particles = []

    for (let i = 0; i < maxParticles; i++) {
      // All start hidden below bottom
      particles.push({
        x: 0, y: -999, z: 0,
        color: [0.7, 0.45, 0.15],
        size: 0.035 + rng() * 0.05,
        settled: false,
      })
    }

    return { particles, nextIndex: 0 }
  }

  function applySandPoolToGeometry(pointsObj, pool) {
    if (!pointsObj || !pointsObj.geometry || !pool) return

    const particles = pool.particles
    const count = particles.length

    const posAttr = pointsObj.geometry.attributes.position
    const colAttr = pointsObj.geometry.attributes.color
    const sizeAttr = pointsObj.geometry.attributes.aSize

    for (let i = 0; i < count; i++) {
      const p = particles[i]
      const idx = i * 3
      posAttr.array[idx] = p.x
      posAttr.array[idx + 1] = p.y
      posAttr.array[idx + 2] = p.z
      colAttr.array[idx] = p.color[0]
      colAttr.array[idx + 1] = p.color[1]
      colAttr.array[idx + 2] = p.color[2]
      sizeAttr.array[i] = p.size
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
    pointsObj.geometry.setDrawRange(0, count)
  }

  /* ======================== Stream ======================== */

  /* ======================== Build Scene ======================== */

  function buildGlass() {
    const data = generateGlassPoints()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(data.sizes, 1))

    const mat = new THREE.ShaderMaterial({
      vertexShader: GLASS_VERTEX_SHADER,
      fragmentShader: GLASS_FRAGMENT_SHADER,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })

    glassPoints = new THREE.Points(geo, mat)
    scene.add(glassPoints)
  }

  function buildSand() {
    // Top sand pool — all 120k particles scattered in lower half of upper chamber
    topSandPool = generateTopSandPool(MAX_TOP_SAND_PARTICLES, makeRNG(42))

    // Bottom sand pool (pre-allocated, particles added as sand falls)
    bottomSandPool = generateBottomSandPool(MAX_BOTTOM_SAND_PARTICLES, makeRNG(99))

    const sandMat = new THREE.ShaderMaterial({
      vertexShader: SAND_VERTEX_SHADER,
      fragmentShader: SAND_FRAGMENT_SHADER,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })

    // Top sand
    const topGeo = new THREE.BufferGeometry()
    topGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TOP_SAND_PARTICLES * 3), 3))
    topGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_TOP_SAND_PARTICLES * 3), 3))
    topGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_TOP_SAND_PARTICLES), 1))

    topSandPoints = new THREE.Points(topGeo, sandMat)
    topSandPoints._activeCount = -1
    scene.add(topSandPoints)

    // Bottom sand
    const botGeo = new THREE.BufferGeometry()
    botGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_BOTTOM_SAND_PARTICLES * 3), 3))
    botGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_BOTTOM_SAND_PARTICLES * 3), 3))
    botGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_BOTTOM_SAND_PARTICLES), 1))

    bottomSandPoints = new THREE.Points(botGeo, sandMat.clone())
    bottomSandPoints._activeCount = -1
    scene.add(bottomSandPoints)

    // Stream - buffer for falling sand particles
    const streamGeo = new THREE.BufferGeometry()
    streamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_FALLING * 3), 3))
    streamGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_FALLING * 3), 3))
    streamGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_FALLING), 1))
    streamGeo.setDrawRange(0, 0)

    const streamMat = new THREE.ShaderMaterial({
      vertexShader: STREAM_VERTEX_SHADER,
      fragmentShader: STREAM_FRAGMENT_SHADER,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    sandStreamPoints = new THREE.Points(streamGeo, streamMat)
    scene.add(sandStreamPoints)
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
        opacity: 0.35,
        sizeAttenuation: true,
      })
    )
    scene.add(bgStarField)
  }

  function createAmbientParticles() {
    const count = 60
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 4
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3
      ambientParticles.push({
        baseX: positions[i * 3],
        baseY: positions[i * 3 + 1],
        baseZ: positions[i * 3 + 2],
        speed: 0.2 + Math.random() * 0.3,
        amplitude: 0.15 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
      })
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    ambientMaterial = new THREE.PointsMaterial({
      color: 0xffc060,
      size: 0.04,
      transparent: true,
      opacity: 0.2,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    ambientPoints = new THREE.Points(geo, ambientMaterial)
    scene.add(ambientPoints)
  }

  function updateAmbientParticles(time) {
    if (!ambientPoints || ambientParticles.length === 0) return
    const pos = ambientPoints.geometry.attributes.position.array
    for (let i = 0; i < ambientParticles.length; i++) {
      const p = ambientParticles[i]
      pos[i * 3] = p.baseX + Math.sin(time * p.speed + p.phase) * p.amplitude
      pos[i * 3 + 1] = p.baseY + Math.sin(time * p.speed * 0.6 + p.phase + 1) * p.amplitude * 0.4
      pos[i * 3 + 2] = p.baseZ + Math.cos(time * p.speed * 0.4 + p.phase + 2) * p.amplitude * 0.2
    }
    ambientPoints.geometry.attributes.position.needsUpdate = true
  }

  /* ======================== Camera ======================== */

  function updateCamera() {
    camTheta += (targetTheta - camTheta) * damping
    camPhi += (targetPhi - camPhi) * damping
    camRadius += (targetRadius - camRadius) * damping

    camera.position.x = camRadius * Math.sin(camPhi) * Math.sin(camTheta)
    camera.position.y = camRadius * Math.cos(camPhi)
    camera.position.z = camRadius * Math.sin(camPhi) * Math.cos(camTheta)
    camera.lookAt(0, 0, 0)
  }

  /* ======================== Sand Flow Logic ======================== */

  // Track which top particles have fallen
  let topFallCount = 0

  function updateSandFlow(deltaTime) {
    if (state !== 'flowing') return
    if (topFallCount >= topSandPool.particles.length) {
      resetSand()
      return
    }

    // Launch new falling particles if there's room
    const launchPerFrame = 15
    for (let i = 0; i < launchPerFrame && topFallCount < topSandPool.particles.length && fallingSand.length < MAX_FALLING; i++) {
      const topP = topSandPool.particles[topFallCount]
      if (!topP) break

      fallingSand.push({
        topIndex: topFallCount,
        x: topP.x,
        y: topP.y,
        z: topP.z,
        speed: 0.5 + Math.random() * 1.5,
        color: [...topP.color],
        size: topP.size,
      })

      // Hide from top pool
      topP.y = -999
      topFallCount++
    }

    // Debug: log first frame
    if (topFallCount > 0 && topFallCount < 20) {
      console.log('[hourglass] fallingSand:', fallingSand.length, 'topFallCount:', topFallCount)
    }
  }

  function updateFallingSand(dt) {
    if (fallingSand.length === 0) return

    const bottomY = GLASS_BOTTOM_Y + 0.3

    for (let i = fallingSand.length - 1; i >= 0; i--) {
      const f = fallingSand[i]

      // Fall downward
      f.y -= f.speed * dt * 8

      // Slight wobble
      const wobble = Math.sin(f.y * 3.0 + f.topIndex * 0.1) * 0.02
      f.x += wobble * dt * 10
      f.z += Math.cos(f.y * 2.5 + f.topIndex * 0.08) * 0.02 * dt * 10

      // Reached bottom
      if (f.y <= bottomY) {
        const bottomP = bottomSandPool.particles[bottomSandPool.nextIndex]
        if (bottomP) {
          const pileRatio = bottomSandPool.nextIndex / bottomSandPool.particles.length
          const maxR = GLASS_RADIUS_TOP * 0.82 * (1.0 - pileRatio * 0.85)
          const angle = Math.random() * Math.PI * 2
          const r = Math.sqrt(Math.random()) * maxR
          bottomP.x = Math.cos(angle) * r
          bottomP.y = bottomY + Math.random() * 0.5
          bottomP.z = Math.sin(angle) * r
          bottomP.settled = true
          bottomSandPool.nextIndex++
        }

        fallingSand.splice(i, 1)
      }
    }

    if (audioCtx && topFallCount % 300 === 0) {
      playSandFlowSound(audioCtx, 0.02)
    }
  }

  function resetSand() {
    // Regenerate top sand
    topSandPool = generateTopSandPool(MAX_TOP_SAND_PARTICLES, makeRNG(Math.floor(Math.random() * 10000)))
    // Clear bottom sand
    bottomSandPool = generateBottomSandPool(MAX_BOTTOM_SAND_PARTICLES, makeRNG(99))
    // Clear falling particles
    fallingSand = []
    topFallCount = 0
    // Clear stream draw range
    if (sandStreamPoints && sandStreamPoints.geometry) {
      sandStreamPoints.geometry.setDrawRange(0, 0)
    }
  }

  /* ======================== Flip Animation ======================== */

  function flipHourglass() {
    if (state === 'turning') return

    state = 'turning'
    if (!audioCtx) audioCtx = createAudioCtx()
    playFlipSound(audioCtx)

    turnTween = gsap.to(
      { t: 0 },
      {
        t: 1,
        duration: 1.2,
        ease: 'power2.inOut',
        onUpdate: function () {
          const t = this.targets()[0].t
          if (glassPoints) glassPoints.rotation.x = t * Math.PI
          if (topSandPoints) topSandPoints.rotation.x = t * Math.PI
          if (bottomSandPoints) bottomSandPoints.rotation.x = t * Math.PI
          if (sandStreamPoints) sandStreamPoints.rotation.x = t * Math.PI
        },
        onComplete: () => {
          // Swap sand: reset top to full, clear bottom
          fallingSand = []
          resetSand()

          // Reset rotation
          if (glassPoints) glassPoints.rotation.x = 0
          if (topSandPoints) topSandPoints.rotation.x = 0
          if (bottomSandPoints) bottomSandPoints.rotation.x = 0
          if (sandStreamPoints) sandStreamPoints.rotation.x = 0

          state = 'flowing'
          turnTween = null
        },
      }
    )
  }

  /* ======================== Raycasting & Interaction ======================== */

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  function handleClick(clientX, clientY) {
    if (state === 'turning') return

    mouse.x = (clientX / window.innerWidth) * 2 - 1
    mouse.y = -(clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)

    const targets = [glassPoints, topSandPoints, bottomSandPoints].filter(Boolean)
    const intersects = raycaster.intersectObjects(targets)
    if (intersects.length > 0) {
      flipHourglass()
    }
  }

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
    targetPhi = Math.max(0.3, Math.min(Math.PI - 0.3, targetPhi + dy * 0.005))
    dragStartX = e.clientX
    dragStartY = e.clientY
  }

  function onPointerUp(e) {
    const dx = Math.abs(e.clientX - dragInitX)
    const dy = Math.abs(e.clientY - dragInitY)
    dragging = false

    if (dx < 8 && dy < 8) {
      handleClick(e.clientX, e.clientY)
    }
  }

  function onWheel(e) {
    targetRadius = Math.max(5, Math.min(18, targetRadius + e.deltaY * 0.01))
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
    camera.position.set(0, 0, 10)

    createBgStars()
    buildGlass()
    buildSand()
    createAmbientParticles()
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
    if (turnTween) turnTween.kill()
    if (audioCtx) audioCtx.close()

    ;[glassPoints, topSandPoints, bottomSandPoints, sandStreamPoints, bgStarField, ambientPoints].forEach((obj) => {
      if (obj) {
        obj.geometry?.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
          else obj.material.dispose()
        }
      }
    })

    if (renderer) {
      if (el && el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }

    state = 'flowing'
    turnTween = null
    topSandPool = null
    bottomSandPool = null
  }

  /* ======================== Render Loop ======================== */

  let rafId = null
  let lastTime = 0

  function animate() {
    rafId = requestAnimationFrame(animate)
    const now = (performance.now() - startTime) / 1000
    const dt = lastTime ? Math.min(now - lastTime, 0.05) : 0.016
    lastTime = now

    updateCamera()
    updateSandFlow(dt)
    updateFallingSand(dt)

    // Update falling sand positions in stream points
    if (sandStreamPoints && sandStreamPoints.geometry) {
      const pos = sandStreamPoints.geometry.attributes.position.array
      const col = sandStreamPoints.geometry.attributes.color.array
      const sizes = sandStreamPoints.geometry.attributes.aSize.array
      for (let i = 0; i < fallingSand.length; i++) {
        const f = fallingSand[i]
        pos[i * 3] = f.x
        pos[i * 3 + 1] = f.y
        pos[i * 3 + 2] = f.z
        col[i * 3] = f.color[0]
        col[i * 3 + 1] = f.color[1]
        col[i * 3 + 2] = f.color[2]
        sizes[i] = f.size
      }
      sandStreamPoints.geometry.attributes.position.needsUpdate = true
      sandStreamPoints.geometry.attributes.color.needsUpdate = true
      sandStreamPoints.geometry.attributes.aSize.needsUpdate = true
      sandStreamPoints.geometry.setDrawRange(0, fallingSand.length)
    }

    // Apply sand pools every frame
    applySandPoolToGeometry(topSandPoints, topSandPool)
    applySandPoolToGeometry(bottomSandPoints, bottomSandPool)

    if (bgStarField) bgStarField.rotation.y += 0.0001
    updateAmbientParticles(now)

    renderer.render(scene, camera)
  }

  function startRenderLoop() {
    if (!rafId) animate()
  }

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
  }
}
