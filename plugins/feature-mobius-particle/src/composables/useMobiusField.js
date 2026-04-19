import * as THREE from 'three'

// ============================================================
// Mobius Strip Particle Field — Comet-stream version
// Particles spawn in dense clusters (comet heads) that fan out
// into sparse trailing tails as they flow along the strip.
// ============================================================

const MOBIUS_CONFIG = {
  // Ribbon parameters
  ribbonWidth: 1.2,
  twist: 1, // half-twists (1 = classic Möbius flip)

  // Comet streams
  streamCount: 1,            // single stream
  particlesPerStream: 10000, // total particles in the single stream
  edgeParticles: 600,        // particles along the edge
  ambientParticles: 300,     // floating ambient particles

  // Animation
  flowSpeed: 2.0,            // base speed along the strip
  breatheAmplitude: 0.04,    // idle breathing scale
  breatheSpeed: 0.5,         // idle breathing frequency

  // Camera — view the figure-8 from above (+Y axis), looking down at the XZ plane
  cameraTheta: Math.PI / 2,
  cameraPhi: Math.PI / 2,
  cameraRadius: 7,

  // Colors
  colors: {
    primary:   { r: 0.3, g: 0.6, b: 1.0 },    // blue
    secondary: { r: 0.6, g: 0.2, b: 1.0 },     // purple
    accent:    { r: 0.1, g: 0.9, b: 0.7 },     // teal
    edge:      { r: 0.8, g: 0.4, b: 0.6 },     // pink edge
    bg: '#0a0c14',
  },
}

let renderer = null
let scene = null
let camera = null
let controlsEnabled = false
let isDragging = false
let prevPointer = { x: 0, y: 0 }
let cameraTarget = {
  theta: MOBIUS_CONFIG.cameraTheta,
  phi: MOBIUS_CONFIG.cameraPhi,
  radius: MOBIUS_CONFIG.cameraRadius,
}
let cameraCurrent = { ...cameraTarget }
let eventListeners = {}
let animationId = null
let clock = null

// Particle data
let stripParams = null     // Float32Array [headPhase, v, speedMul, baseRandom]
let stripBaseSizes = null  // Float32Array — base sizes (no per-frame random)
let stripBaseRandoms = null // Float32Array — random seeds for each particle
let stripHeadPosition = 0  // global head angle that advances around the full path
let stripGeometry = null
let stripPoints = null
let edgeGeometry = null
let edgePoints = null
let silverGeometry = null
let silverPoints = null
let edgeParams = null     // Float32Array [u, speedMul, headPhase]
let edgeBaseSizes = null  // Float32Array — base sizes for edge particles
let ambientGeometry = null
let ambientPoints = null

// ============================================================
// Figure-8 lemniscate ribbon
// Base curve: x = sin(t), z = sin(t)*cos(t)  (a figure-8 in the XZ plane)
// Ribbon: at each point, offset along a perpendicular that rotates (twists)
// as t goes 0→2π, giving the Möbius flip at the crossover.
// ============================================================
function mobiusPoint(t, v, ribbonWidth, twist) {
  // Numerical tangent of the figure-8 curve (stable everywhere)
  const eps = 0.001
  const sinT = Math.sin(t), cosT = Math.cos(t)
  const sinT2 = Math.sin(t + eps), cosT2 = Math.cos(t + eps)
  const dx = sinT2 - sinT
  const dz = sinT2 * cosT2 - sinT * cosT
  const tLen = Math.sqrt(dx * dx + dz * dz) || 1

  const tx = dx / tLen  // tangent x
  const tz = dz / tLen  // tangent z

  // Perpendicular in XZ plane: rotate tangent 90° counter-clockwise
  // This is cross(tangent, +Y), always well-defined
  // (tangent never aligns with Y since the curve is purely in XZ)
  const px = -tz
  const pz = tx
  const pLen = Math.sqrt(px * px + pz * pz) || 1

  const nx = px / pLen  // normalized perpendicular
  const nz = pz / pLen

  // Twist angle: half-twist as we go around the full loop
  const angle = (twist * t) / 2
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)

  // The ribbon cross-section: rotate perpendicular around tangent
  // In the local frame: ribbonDir = cosA * perp + sinA * Y
  const rX = nx * cosA
  const rY = sinA
  const rZ = nz * cosA

  const halfW = v * ribbonWidth / 2

  const rawX = sinT + rX * halfW
  const rawY = rY * halfW
  const rawZ = sinT * cosT + rZ * halfW

  // Rotate 45° around Y axis (screen-perpendicular)
  const angle45 = Math.PI / 4
  const c = Math.cos(angle45)
  const s = Math.sin(angle45)
  return [
    rawX * c + rawZ * s,
    rawY,
    -rawX * s + rawZ * c,
  ]
}

// ============================================================
// Color based on position + stream phase
// ============================================================
function stripColor(t, v, time) {
  const c1 = MOBIUS_CONFIG.colors.primary
  const c2 = MOBIUS_CONFIG.colors.secondary
  const blend = 0.5 + 0.5 * Math.sin(t + v * Math.PI + time * 0.3)
  return [
    (c1.r * (1 - blend) + c2.r * blend) * (0.7 + 0.3 * Math.sin(t * 2)),
    (c1.g * (1 - blend) + c2.g * blend) * (0.7 + 0.3 * Math.sin(t * 2)),
    (c1.b * (1 - blend) + c2.b * blend) * (0.7 + 0.3 * Math.sin(t * 2)),
  ]
}

// ============================================================
// Create strip particles — comet-stream distribution
// Each stream has a "head" (dense, bright) and a "tail" (sparse, fading)
// ============================================================
function createStripParticles() {
  const { streamCount, particlesPerStream, ribbonWidth, twist } = MOBIUS_CONFIG
  const total = streamCount * particlesPerStream

  const positions = new Float32Array(total * 3)
  const colors    = new Float32Array(total * 3)
  const sizes     = new Float32Array(total)
  const alphas    = new Float32Array(total)
  const randoms   = new Float32Array(total)

  // Per-particle: [t, v, speedOffset, headPhase]
  // headPhase ∈ [0,1]: 0 = right at the head, 1 = far tail
  stripParams = new Float32Array(total * 4)
  stripBaseSizes = new Float32Array(total)
  stripBaseRandoms = new Float32Array(total)

  for (let s = 0; s < streamCount; s++) {
    for (let i = 0; i < particlesPerStream; i++) {
      const idx = s * particlesPerStream + i

      // headPhase: exponential distribution — most particles near the head
      const headPhase = Math.pow(Math.random(), 2.5)

      // v: tighter near the center line, wider spread at the tail
      const vSpread = 0.2 + headPhase * 0.8
      const v = (Math.random() * 2 - 1) * vSpread

      const speedMul = 0.85 + Math.random() * 0.3

      stripParams[idx * 4]     = headPhase  // distance behind head (0=head, 1=tail)
      stripParams[idx * 4 + 1] = v
      stripParams[idx * 4 + 2] = speedMul
      stripParams[idx * 4 + 3] = Math.random()

      stripBaseSizes[idx] = 0.04 + Math.random() * 0.04
    }
  }

  // Set initial positions from the global head
  for (let i = 0; i < total; i++) {
    const headPhase = stripParams[i * 4]
    const v = stripParams[i * 4 + 1]
    const streamLength = Math.PI * 2 * 0.6
    let t = (stripHeadPosition - headPhase * streamLength) % (Math.PI * 2)
    if (t < 0) t += Math.PI * 2

    const [x, y, z] = mobiusPoint(t, v, ribbonWidth, twist)
    const [cr, cg, cb] = stripColor(t, v, 0)

    positions[i * 3]     = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    colors[i * 3]     = cr
    colors[i * 3 + 1] = cg
    colors[i * 3 + 2] = cb

    const headFactor = 1.0 - headPhase
    sizes[i]  = stripBaseSizes[i] * (0.4 + headFactor * 0.6)
    alphas[i] = 0.3 + headFactor * 0.7
  }

  stripGeometry = new THREE.BufferGeometry()
  stripGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  stripGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  stripGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  stripGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1))
  stripGeometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

  stripPoints = new THREE.Points(stripGeometry, new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      attribute float aRandom;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;
      uniform float uPixelRatio;

      void main() {
        vColor = color;
        float pulse = 0.85 + 0.15 * sin(uTime * 2.5 + aRandom * 6.2831);
        vAlpha = alpha * pulse;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (220.0 / -mvPosition.z) * pulse;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float a = smoothstep(0.5, 0.02, dist) * vAlpha;
        float glow = exp(-dist * 5.0) * 0.5;
        vec3 col = vColor + glow;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  }))
  scene.add(stripPoints)
}

// ============================================================
// Edge particles — comet style too
// ============================================================
function createEdgeParticles() {
  const count = MOBIUS_CONFIG.edgeParticles
  const { ribbonWidth, twist } = MOBIUS_CONFIG
  const ec = MOBIUS_CONFIG.colors.edge

  const positions = new Float32Array(count * 3)
  const colors    = new Float32Array(count * 3)
  const sizes     = new Float32Array(count)
  const alphas    = new Float32Array(count)
  const randoms   = new Float32Array(count)
  const edgeParams = new Float32Array(count * 3) // [t, speedMul, headPhase]

  for (let i = 0; i < count; i++) {
    const headPhase = Math.pow(Math.random(), 3.0)
    const t = Math.random() * Math.PI * 2
    // Edge particles: random position across the ribbon width
    const vEdge = (Math.random() * 2 - 1)

    const [x, y, z] = mobiusPoint(t, vEdge, ribbonWidth, twist)
    const bright = (0.7 + Math.random() * 0.3) * (1.0 - headPhase * 0.5)

    positions[i * 3]     = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    colors[i * 3]     = ec.r * bright
    colors[i * 3 + 1] = ec.g * bright
    colors[i * 3 + 2] = ec.b * bright

    sizes[i] = (0.03 + Math.random() * 0.03) * (1.0 - headPhase * 0.4)
    alphas[i] = 1.0 - headPhase * 0.6
    randoms[i] = Math.random()

    edgeParams[i * 3]     = t
    edgeParams[i * 3 + 1] = 0.85 + Math.random() * 0.3
    edgeParams[i * 3 + 2] = headPhase
  }

  edgeBaseSizes = sizes.slice() // store base sizes

  edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  edgeGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  edgeGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  edgeGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1))
  edgeGeometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

  edgePoints = new THREE.Points(edgeGeometry, new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      attribute float aRandom;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;
      uniform float uPixelRatio;

      void main() {
        vColor = color;
        float twinkle = 0.7 + 0.3 * sin(uTime * 3.0 + aRandom * 6.2831);
        vAlpha = alpha * twinkle;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (240.0 / -mvPosition.z) * twinkle;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        gl_FragColor = vec4(vColor, smoothstep(0.5, 0.0, dist) * vAlpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  }))

  edgePoints.userData.params = edgeParams
  scene.add(edgePoints)
}

// ============================================================
// Ambient floating particles
// ============================================================
function createAmbientParticles() {
  const count = MOBIUS_CONFIG.ambientParticles
  const positions = new Float32Array(count * 3)
  const colors    = new Float32Array(count * 3)
  const sizes     = new Float32Array(count)
  const randoms   = new Float32Array(count)
  const velocities = new Float32Array(count * 3)

  const allColors = [
    MOBIUS_CONFIG.colors.primary,
    MOBIUS_CONFIG.colors.secondary,
    MOBIUS_CONFIG.colors.accent,
    MOBIUS_CONFIG.colors.edge,
  ]

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 5 + Math.random() * 8

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)

    const c = allColors[Math.floor(Math.random() * allColors.length)]
    const bright = 0.3 + Math.random() * 0.4
    colors[i * 3]     = c.r * bright
    colors[i * 3 + 1] = c.g * bright
    colors[i * 3 + 2] = c.b * bright

    sizes[i] = 0.02 + Math.random() * 0.03
    randoms[i] = Math.random()
    velocities[i * 3]     = (Math.random() - 0.5) * 0.002
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002
  }

  ambientGeometry = new THREE.BufferGeometry()
  ambientGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  ambientGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  ambientGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  ambientGeometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

  ambientPoints = new THREE.Points(ambientGeometry, new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float size;
      attribute float aRandom;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;
      uniform float uPixelRatio;

      void main() {
        vColor = color;
        float twinkle = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * 1.5 + aRandom * 6.2831), 2.0);
        vAlpha = twinkle * 0.5;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (150.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, dist) * vAlpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  }))

  ambientPoints.userData.velocities = velocities
  scene.add(ambientPoints)
}

// ============================================================
// Static silver particles outlining the entire Möbius ribbon
// ============================================================
function createSilverParticles() {
  const count = 15000
  const { ribbonWidth, twist } = MOBIUS_CONFIG

  const positions = new Float32Array(count * 3)
  const colors    = new Float32Array(count * 3)
  const sizes     = new Float32Array(count)
  const randoms   = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2
    const v = (Math.random() * 2 - 1) * 0.15

    const [x, y, z] = mobiusPoint(t, v, ribbonWidth, twist)

    positions[i * 3]     = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    // Silver color with slight variation
    const bright = 0.55 + Math.random() * 0.2
    colors[i * 3]     = bright
    colors[i * 3 + 1] = bright
    colors[i * 3 + 2] = bright + 0.05

    sizes[i] = 0.015 + Math.random() * 0.02
    randoms[i] = Math.random()
  }

  silverGeometry = new THREE.BufferGeometry()
  silverGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  silverGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  silverGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  silverGeometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

  silverPoints = new THREE.Points(silverGeometry, new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float size;
      attribute float aRandom;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;
      uniform float uPixelRatio;

      void main() {
        vColor = color;
        float twinkle = 0.5 + 0.5 * sin(uTime * 1.2 + aRandom * 6.2831);
        vAlpha = 0.3 + 0.4 * twinkle;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float a = smoothstep(0.5, 0.05, dist) * vAlpha;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  }))
  scene.add(silverPoints)
}

// ============================================================
// Update: global head advances around the full path;
// each particle trails behind at its headPhase distance.
// When headPhase exceeds 1.0 the particle respawns at the head.
// ============================================================
function updateStripParticles(elapsed, delta) {
  if (!stripParams || !stripPoints) return

  const positions = stripGeometry.attributes.position.array
  const colors    = stripGeometry.attributes.color.array
  const alphas    = stripGeometry.attributes.alpha.array
  const sizes     = stripGeometry.attributes.size.array
  const { ribbonWidth, twist, flowSpeed, breatheAmplitude, breatheSpeed } = MOBIUS_CONFIG

  const breathe = 1 + breatheAmplitude * Math.sin(elapsed * breatheSpeed)
  const streamLength = Math.PI * 2 * 0.6  // each stream spans 60% of the path

  // Advance the global head around the full 2π path
  stripHeadPosition += flowSpeed * delta
  if (stripHeadPosition > Math.PI * 2) stripHeadPosition -= Math.PI * 2

  for (let i = 0; i < stripParams.length / 4; i++) {
    let headPhase = stripParams[i * 4]
    let v         = stripParams[i * 4 + 1]
    let speedMul  = stripParams[i * 4 + 2]

    // Advance the particle's distance behind the head
    headPhase += speedMul * 0.15 * delta
    if (headPhase > 1.0) {
      // Respawn at the head
      headPhase = 0
      v = (Math.random() * 2 - 1) * 0.2
      speedMul = 0.85 + Math.random() * 0.3
    }

    stripParams[i * 4]     = headPhase
    stripParams[i * 4 + 1] = v
    stripParams[i * 4 + 2] = speedMul

    // Compute actual position on the path
    let t = (stripHeadPosition - headPhase * streamLength * speedMul) % (Math.PI * 2)
    if (t < 0) t += Math.PI * 2

    const rw = ribbonWidth * breathe
    const [x, y, z] = mobiusPoint(t, v, rw, twist)
    const [cr, cg, cb] = stripColor(t, v, elapsed * 0.05)

    positions[i * 3]     = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    colors[i * 3]     = cr
    colors[i * 3 + 1] = cg
    colors[i * 3 + 2] = cb

    // Size & alpha: big & bright at head (headPhase ≈ 0), small & dim at tail
    const headFactor = 1.0 - headPhase
    sizes[i]  = stripBaseSizes[i] * (0.4 + headFactor * 0.6)
    alphas[i] = 0.3 + headFactor * 0.7
  }

  stripGeometry.attributes.position.needsUpdate = true
  stripGeometry.attributes.color.needsUpdate = true
  stripGeometry.attributes.size.needsUpdate = true
  stripGeometry.attributes.alpha.needsUpdate = true
}

function updateEdgeParticles(elapsed, delta) {
  if (!edgePoints || !edgePoints.userData.params) return

  const positions = edgeGeometry.attributes.position.array
  const alphas    = edgeGeometry.attributes.alpha.array
  const sizes     = edgeGeometry.attributes.size.array
  const { ribbonWidth, twist, flowSpeed, breatheAmplitude, breatheSpeed } = MOBIUS_CONFIG

  const breathe = 1 + breatheAmplitude * Math.sin(elapsed * breatheSpeed)
  const params = edgePoints.userData.params
  const rw = ribbonWidth * breathe

  for (let i = 0; i < params.length / 3; i++) {
    let t     = params[i * 3]
    let speed = params[i * 3 + 1]
    let phase = params[i * 3 + 2]

    t += flowSpeed * speed * delta * 0.9
    if (t > Math.PI * 2) t -= Math.PI * 2

    phase += speed * 0.35 * delta
    if (phase > 1.0) {
      phase = 0
      t = Math.random() * Math.PI * 2
      speed = 0.85 + Math.random() * 0.3
    }

    params[i * 3]     = t
    params[i * 3 + 1] = speed
    params[i * 3 + 2] = phase

    const vEdge = (Math.random() * 2 - 1)
    const [x, y, z] = mobiusPoint(t, vEdge, rw, twist)
    positions[i * 3]     = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    const headFactor = 1.0 - phase
    alphas[i] = 0.4 + headFactor * 0.6
    sizes[i]  = edgeBaseSizes[i] * (0.5 + headFactor * 0.5)
  }

  edgeGeometry.attributes.position.needsUpdate = true
  edgeGeometry.attributes.alpha.needsUpdate = true
  edgeGeometry.attributes.size.needsUpdate = true
}

function updateAmbientParticles(dt) {
  if (!ambientPoints) return

  const positions = ambientGeometry.attributes.position.array
  const velocities = ambientPoints.userData.velocities

  for (let i = 0; i < positions.length / 3; i++) {
    const idx = i * 3
    positions[idx]     += velocities[idx]     + Math.sin(dt * 0.3 + i) * 0.001
    positions[idx + 1] += velocities[idx + 1] + Math.cos(dt * 0.2 + i) * 0.001
    positions[idx + 2] += velocities[idx + 2]

    const dist = Math.sqrt(
      positions[idx] ** 2 + positions[idx + 1] ** 2 + positions[idx + 2] ** 2
    )
    if (dist > 14) {
      const s = 14 / dist
      positions[idx] *= s; positions[idx + 1] *= s; positions[idx + 2] *= s
    }
    if (dist < 4) {
      velocities[idx] += 0.0001
      velocities[idx + 1] += 0.0001
      velocities[idx + 2] += 0.0001
    }
  }

  ambientGeometry.attributes.position.needsUpdate = true
}

// ============================================================
// Camera
// ============================================================
function updateCamera() {
  const damping = 0.08
  cameraCurrent.theta += (cameraTarget.theta - cameraCurrent.theta) * damping
  cameraCurrent.phi   += (cameraTarget.phi - cameraCurrent.phi) * damping
  cameraCurrent.radius += (cameraTarget.radius - cameraCurrent.radius) * damping

  const r = cameraCurrent.radius
  const theta = cameraCurrent.theta
  const phi = cameraCurrent.phi

  camera.position.set(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi)
  )
  camera.lookAt(0, 0, 0)
}

// ============================================================
// Render loop
// ============================================================
let prevTime = 0

function animate() {
  animationId = requestAnimationFrame(animate)
  const elapsed = clock.getElapsedTime()
  const delta = prevTime === 0 ? 0.016 : Math.min(0.05, elapsed - prevTime)
  prevTime = elapsed

  if (stripPoints)  stripPoints.material.uniforms.uTime.value = elapsed
  if (edgePoints)   edgePoints.material.uniforms.uTime.value = elapsed
  if (silverPoints) silverPoints.material.uniforms.uTime.value = elapsed
  if (ambientPoints) ambientPoints.material.uniforms.uTime.value = elapsed

  updateStripParticles(elapsed, delta)
  updateEdgeParticles(elapsed, delta)
  updateAmbientParticles(elapsed)

  updateCamera()
  renderer.render(scene, camera)
}

// ============================================================
// Interaction
// ============================================================
function onPointerDown(e) {
  isDragging = true
  prevPointer.x = e.clientX
  prevPointer.y = e.clientY
}

function onPointerMove(e) {
  if (isDragging) {
    const dx = e.clientX - prevPointer.x
    const dy = e.clientY - prevPointer.y
    cameraTarget.theta -= dx * 0.005
    cameraTarget.phi -= dy * 0.005
    cameraTarget.phi = Math.max(0.2, Math.min(Math.PI - 0.2, cameraTarget.phi))
    prevPointer.x = e.clientX
    prevPointer.y = e.clientY
  }
}

function onPointerUp() { isDragging = false }

function onWheel(e) {
  cameraTarget.radius += e.deltaY * 0.01
  cameraTarget.radius = Math.max(5, Math.min(20, cameraTarget.radius))
}

function enableInteraction() {
  if (controlsEnabled || !renderer) return
  controlsEnabled = true
  const canvas = renderer.domElement
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: true })
}

function disableInteraction() {
  if (!renderer) return
  controlsEnabled = false
  const canvas = renderer.domElement
  canvas.removeEventListener('pointerdown', onPointerDown)
  canvas.removeEventListener('pointermove', onPointerMove)
  canvas.removeEventListener('pointerup', onPointerUp)
  canvas.removeEventListener('wheel', onWheel)
}

function onResize() {
  if (!renderer || !camera) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const pr = Math.min(window.devicePixelRatio, 2)
  if (stripPoints)  stripPoints.material.uniforms.uPixelRatio.value = pr
  if (edgePoints)   edgePoints.material.uniforms.uPixelRatio.value = pr
  if (ambientPoints) ambientPoints.material.uniforms.uPixelRatio.value = pr
}

// ============================================================
// Public API
// ============================================================
function init(container) {
  if (!container) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(MOBIUS_CONFIG.colors.bg)
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)
  clock = new THREE.Clock()

  createStripParticles()
  createEdgeParticles()
  createSilverParticles()
  createAmbientParticles()

  animate()
  window.addEventListener('resize', onResize)
}

function dispose(container) {
  disableInteraction()
  window.removeEventListener('resize', onResize)

  if (animationId) { cancelAnimationFrame(animationId); animationId = null }

  if (renderer) {
    if (container && renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement)
    }
    renderer.dispose()
    renderer = null
  }

  stripGeometry?.dispose(); stripGeometry = null
  edgeGeometry?.dispose(); edgeGeometry = null
  silverGeometry?.dispose(); silverGeometry = null
  ambientGeometry?.dispose(); ambientGeometry = null

  stripPoints = null; edgePoints = null; silverPoints = null; ambientPoints = null
  stripParams = null; stripBaseSizes = null; stripBaseRandoms = null
  stripHeadPosition = 0
  edgeBaseSizes = null
  scene = null; camera = null; clock = null
}

function on(event, callback) {
  if (!eventListeners[event]) eventListeners[event] = []
  eventListeners[event].push(callback)
}

function emit(event, data) {
  if (eventListeners[event]) eventListeners[event].forEach(cb => cb(data))
}

export default function useMobiusField() {
  return { init, enableInteraction, disableInteraction, dispose, on, emit }
}
