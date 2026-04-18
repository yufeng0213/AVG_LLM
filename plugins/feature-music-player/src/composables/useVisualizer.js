import { onUnmounted } from 'vue'

let _renderer = null
let _scene = null
let _camera = null
let _particles = null
let _animationId = null

const PARTICLE_COUNT = 2000

export function useVisualizer(canvasRef) {
  let _isThreeJs = false

  const initThreeJS = () => {
    if (!canvasRef.value || !window.THREE) return false
    _isThreeJs = true

    _renderer = new window.THREE.WebGLRenderer({
      canvas: canvasRef.value,
      alpha: true,
      antialias: false,
    })
    _renderer.setSize(window.innerWidth, window.innerHeight)
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    _scene = new window.THREE.Scene()
    _camera = new window.THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    _camera.position.z = 5

    const geometry = new window.THREE.BufferGeometry()
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const colors = new Float32Array(PARTICLE_COUNT * 3)
    const sizes = new Float32Array(PARTICLE_COUNT)
    const originalPositions = new Float32Array(PARTICLE_COUNT * 3)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      const radius = 2 + Math.random() * 3
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i3 + 2] = radius * Math.cos(phi)

      originalPositions[i3] = positions[i3]
      originalPositions[i3 + 1] = positions[i3 + 1]
      originalPositions[i3 + 2] = positions[i3 + 2]

      colors[i3] = 0.66 + Math.random() * 0.2
      colors[i3 + 1] = 0.33 + Math.random() * 0.2
      colors[i3 + 2] = 0.97

      sizes[i] = Math.random() * 3 + 1
    }

    geometry.setAttribute('position', new window.THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new window.THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new window.THREE.BufferAttribute(sizes, 1))
    geometry._originalPositions = originalPositions

    const material = new window.THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      blending: window.THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    })

    _particles = new window.THREE.Points(geometry, material)
    _scene.add(_particles)

    return true
  }

  const initCanvas = (canvasEl) => {
    if (!canvasEl) return false
    _isThreeJs = false
    const ctx = canvasEl.getContext('2d')
    if (!ctx) return false
    canvasEl.width = window.innerWidth
    canvasEl.height = window.innerHeight
    return true
  }

  const updateThreeJS = (getBass, getMid, getTreble, energy) => {
    if (!_particles || !_particles.geometry) return
    const pos = _particles.geometry.attributes.position.array
    const orig = _particles.geometry._originalPositions

    const bass = getBass() || 0
    const mid = getMid() || 0
    const treble = getTreble() || 0

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      const ox = orig[i3], oy = orig[i3 + 1], oz = orig[i3 + 2]

      // Bass: vertical displacement
      pos[i3 + 1] = oy + bass * Math.sin(oz * 2) * 1.5

      // Mid: horizontal spread
      pos[i3] = ox + mid * Math.cos(oy * 1.5) * 0.8

      // Treble: size/sparkle via z-depth
      pos[i3 + 2] = oz + treble * Math.sin(ox * 3) * 0.5
    }

    _particles.geometry.attributes.position.needsUpdate = true
    _particles.material.opacity = 0.3 + energy * 0.7
    _particles.rotation.y += 0.002
    _particles.rotation.x += 0.0005
  }

  const updateCanvas = (canvasEl, freqData, energy) => {
    if (!canvasEl) return
    const ctx = canvasEl.getContext('2d')
    const w = canvasEl.width, h = canvasEl.height
    ctx.clearRect(0, 0, w, h)

    const bars = 64
    const barWidth = w / bars
    const dataLen = freqData?.length || 0

    for (let i = 0; i < bars && i < dataLen; i++) {
      const val = (freqData[i] || 0) / 255
      const barHeight = val * h * 0.4
      const hue = 270 + (i / bars) * 60
      ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${0.3 + val * 0.5})`
      ctx.fillRect(i * barWidth, h - barHeight, barWidth - 1, barHeight)
    }
  }

  const animate = (mode, getBass, getMid, getTreble, energy, freqData) => {
    if (mode === 'threejs' && _renderer && _scene && _camera) {
      updateThreeJS(getBass, getMid, getTreble, energy)
      _renderer.render(_scene, _camera)
    } else if (mode === 'canvas') {
      updateCanvas(_renderer?.domElement || null, freqData, energy)
    }

    _animationId = requestAnimationFrame(() => animate(mode, getBass, getMid, getTreble, energy, freqData))
  }

  const start = (mode, getBass, getMid, getTreble, energy, freqData) => {
    stop()
    animate(mode, getBass, getMid, getTreble, energy, freqData)
  }

  const stop = () => {
    if (_animationId) {
      cancelAnimationFrame(_animationId)
      _animationId = null
    }
  }

  const dispose = () => {
    stop()
    if (_renderer) {
      _renderer.dispose()
      _renderer = null
    }
    if (_particles) {
      _particles.geometry.dispose()
      _particles.material.dispose()
      _particles = null
    }
    _scene = null
    _camera = null
  }

  const detectMode = () => {
    if (typeof window === 'undefined') return 'css'
    if (window.THREE) return 'threejs'
    return 'canvas'
  }

  onUnmounted(() => dispose())

  return {
    actions: { initThreeJS, initCanvas, start, stop, dispose, detectMode },
    isThreeJs: () => _isThreeJs,
  }
}
