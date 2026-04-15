/**
 * useStarField — Three.js 星空 + 星球场景核心逻辑
 *
 * 功能：
 * - 星空粒子背景（2500+ 小星点）
 * - 10 个程序化纹理星球（自定义 shader + 噪声函数）
 * - 大气层辉光（Fresnel 边缘发光）
 * - 部分星球带环系统
 * - Raycaster 点击检测
 * - GSAP 动画：聚焦星球 / 重置视角
 */

import * as THREE from 'three'
import gsap from 'gsap'

// ==================== GLSL 噪声函数 ====================
const NOISE_GLSL = `
  // Simplex 3D noise
  vec3 mod289v(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289v(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 perm(vec4 x) { return mod289v(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289v(i);
    vec4 p = perm(perm(perm(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x4 = x_ * ns.x + ns.yyyy;
    vec4 y4 = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x4) - abs(y4);
    vec4 b0 = vec4(x4.xy, y4.xy);
    vec4 b1 = vec4(x4.zw, y4.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // FBM (Fractal Brownian Motion)
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int ii = 0; ii < 5; ii++) {
      value += amplitude * snoise(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }
`

// ==================== 星球表面 shader 类型 ====================

// 类型 1：类地行星（大陆+海洋+云层）
const TERRAIN_VERTEX_SHADER = `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const TERRAIN_FRAGMENT_SHADER = `
  precision highp float;
  ${NOISE_GLSL}
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  uniform vec3 uOceanColor;
  uniform vec3 uLandColor;
  uniform vec3 uMountainColor;
  uniform vec3 uPolarColor;
  uniform vec3 uCloudColor;
  uniform float uTime;

  void main() {
    vec3 dir = normalize(vPosition);

    // 基础地形噪声
    float continent = fbm(dir * 2.0);
    float detail = snoise(dir * 6.0) * 0.3;
    float elevation = continent + detail;

    // 海洋 vs 陆地
    vec3 color;
    if (elevation < 0.0) {
      float depth = smoothstep(-0.5, 0.0, elevation);
      color = mix(uOceanColor, mix(uOceanColor, vec3(0.02, 0.04, 0.12), 0.5), depth);
    } else if (elevation < 0.25) {
      color = uLandColor;
    } else if (elevation < 0.45) {
      color = mix(uLandColor, uMountainColor, smoothstep(0.25, 0.45, elevation));
    } else {
      color = mix(uMountainColor, uPolarColor, smoothstep(0.45, 0.6, elevation));
    }

    // 极地冰盖
    float latitude = abs(dir.y);
    if (latitude > 0.75) {
      float ice = smoothstep(0.75, 0.92, latitude);
      color = mix(color, uPolarColor, ice * 0.8);
    }

    // 云层
    float cloudNoise = fbm(dir * 3.0 + vec3(uTime * 0.01, 0.0, uTime * 0.005));
    float cloud = smoothstep(0.1, 0.4, cloudNoise);
    color = mix(color, uCloudColor, cloud * 0.35);

    // 简易光照
    vec3 lightDir = normalize(vec3(5.0, 5.0, 10.0));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.7 + 0.6;
    color *= diff;
    color *= 1.3;

    gl_FragColor = vec4(color, 1.0);
  }
`

// 类型 2：气态巨行星（条纹+风暴）
const GAS_VERTEX_SHADER = `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GAS_FRAGMENT_SHADER = `
  precision highp float;
  ${NOISE_GLSL}
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uTime;

  void main() {
    vec3 dir = normalize(vPosition);
    float lat = atan(dir.z, dir.x) / 3.14159;
    float lon = dir.y;

    // 条纹
    float bands = sin(lon * 20.0) * 0.5 + 0.5;
    float bandNoise = snoise(vec3(lat * 8.0, lon * 3.0, uTime * 0.02)) * 0.3;
    bands += bandNoise;
    bands = clamp(bands, 0.0, 1.0);

    vec3 color;
    if (bands < 0.33) {
      color = mix(uColor1, uColor2, bands * 3.0);
    } else if (bands < 0.66) {
      color = mix(uColor2, uColor3, (bands - 0.33) * 3.0);
    } else {
      color = mix(uColor3, uColor1, (bands - 0.66) * 3.0);
    }

    // 风暴眼
    float storm = snoise(dir * 5.0 + vec3(uTime * 0.005));
    if (storm > 0.5) {
      float spot = smoothstep(0.5, 0.7, storm);
      color = mix(color, uColor1 * 1.5, spot * 0.5);
    }

    // 光照
    vec3 lightDir = normalize(vec3(5.0, 5.0, 10.0));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.7 + 0.6;
    color *= diff;
    color *= 1.3;

    gl_FragColor = vec4(color, 1.0);
  }
`

// 类型 3：熔岩行星（裂纹+发光）
const LAVA_VERTEX_SHADER = `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const LAVA_FRAGMENT_SHADER = `
  precision highp float;
  ${NOISE_GLSL}
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  uniform vec3 uRockColor;
  uniform vec3 uLavaColor;
  uniform float uTime;

  void main() {
    vec3 dir = normalize(vPosition);
    float n = fbm(dir * 4.0 + vec3(uTime * 0.003));

    // 熔岩裂纹
    float crack = 1.0 - smoothstep(-0.1, 0.1, n);
    float pulse = sin(uTime * 0.5) * 0.2 + 0.8;

    vec3 color = uRockColor;
    color = mix(color, uLavaColor * pulse, crack * 0.9);

    // 自发光区域
    float glow = smoothstep(0.2, 0.5, crack) * pulse;
    color += uLavaColor * glow * 0.3;

    // 光照
    vec3 lightDir = normalize(vec3(5.0, 5.0, 10.0));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.7 + 0.6;
    color *= diff;
    color *= 1.3;

    gl_FragColor = vec4(color, 1.0);
  }
`

// 类型 4：冰晶行星（半透明+折射效果）
const ICE_VERTEX_SHADER = `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ICE_FRAGMENT_SHADER = `
  precision highp float;
  ${NOISE_GLSL}
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  uniform vec3 uIceColor;
  uniform vec3 uCoreColor;
  uniform float uTime;

  void main() {
    vec3 dir = normalize(vPosition);

    // 冰层纹理
    float iceNoise = snoise(dir * 8.0) * 0.5 + 0.5;
    float crackle = snoise(dir * 16.0) * 0.25 + 0.25;

    vec3 color = uIceColor;
    color = mix(color, vec3(1.0), crackle * 0.3);

    // 核心发光
    float fresnel = pow(1.0 - abs(dot(vNormal, normalize(-vPosition))), 3.0);
    color += uCoreColor * fresnel * 0.6;

    // 内部光脉动
    float pulse = sin(uTime * 0.8) * 0.15 + 0.85;
    color += uCoreColor * iceNoise * 0.15 * pulse;

    // 光照
    vec3 lightDir = normalize(vec3(5.0, 5.0, 10.0));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.7 + 0.6;
    color *= diff;
    color *= 1.3;

    float alpha = 0.85 + fresnel * 0.15;
    gl_FragColor = vec4(color, alpha);
  }
`

// 大气层辉光 shader
const ATMOSPHERE_VERTEX_SHADER = `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ATMOSPHERE_FRAGMENT_SHADER = `
  precision highp float;
  uniform vec3 uAtmoColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 viewDir = normalize(-vPosition);
    float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 3.0);
    vec3 color = uAtmoColor * fresnel * uIntensity * 2.5;
    float alpha = fresnel * 0.85 * uIntensity;
    gl_FragColor = vec4(color, alpha);
  }
`

// 行星环 shader
const RING_VERTEX_SHADER = `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const RING_FRAGMENT_SHADER = `
  precision highp float;
  ${NOISE_GLSL}
  varying vec2 vUv;
  varying vec3 vPosition;

  uniform vec3 uRingColor;

  void main() {
    float dist = length(vUv - 0.5) * 2.0;
    float ring = smoothstep(0.35, 0.4, dist) * (1.0 - smoothstep(0.75, 0.8, dist));

    // 环带纹理
    float band = sin(dist * 40.0) * 0.5 + 0.5;
    float noise = snoise(vec3(dist * 10.0, vUv.x * 5.0, vUv.y * 5.0)) * 0.2 + 0.8;
    float alpha = ring * band * noise;

    // 透明度渐变
    alpha *= smoothstep(0.35, 0.45, dist);
    alpha *= 1.0 - smoothstep(0.7, 0.8, dist);

    vec3 color = uRingColor * (0.7 + band * 0.3);
    gl_FragColor = vec4(color, alpha * 0.7);
  }
`

// ==================== 星球配置 ====================
const PLANET_CONFIGS = [
  {
    type: 'terrain',
    name: '翠绿星',
    radius: 1.8,
    uniforms: {
      uOceanColor: { value: new THREE.Color(0x1a4a6e) },
      uLandColor: { value: new THREE.Color(0x3a7a2a) },
      uMountainColor: { value: new THREE.Color(0x6a5a4a) },
      uPolarColor: { value: new THREE.Color(0xe8e8f0) },
      uCloudColor: { value: new THREE.Color(0xffffff) },
      uTime: { value: 0 },
    },
    atmoColor: 0x4a9a3a,
    atmoIntensity: 1.0,
    hasRing: false,
    particleColor: 0x40c840,
  },
  {
    type: 'gas',
    name: '琥珀巨行星',
    radius: 3.0,
    uniforms: {
      uColor1: { value: new THREE.Color(0xd4a050) },
      uColor2: { value: new THREE.Color(0xc87830) },
      uColor3: { value: new THREE.Color(0xa05820) },
      uTime: { value: 0 },
    },
    atmoColor: 0xd4a050,
    atmoIntensity: 0.6,
    hasRing: true,
    ringColor: 0xc8a878,
    ringTilt: 0.4,
    particleColor: 0xe8c060,
  },
  {
    type: 'lava',
    name: '狱火星',
    radius: 1.5,
    uniforms: {
      uRockColor: { value: new THREE.Color(0x2a1a1a) },
      uLavaColor: { value: new THREE.Color(0xff5500) },
      uTime: { value: 0 },
    },
    atmoColor: 0xff3300,
    atmoIntensity: 0.8,
    hasRing: false,
    particleColor: 0xff4400,
  },
  {
    type: 'ice',
    name: '冰蓝星',
    radius: 2.0,
    uniforms: {
      uIceColor: { value: new THREE.Color(0x8ab8d8) },
      uCoreColor: { value: new THREE.Color(0x4080ff) },
      uTime: { value: 0 },
    },
    atmoColor: 0x60a0e0,
    atmoIntensity: 1.2,
    hasRing: false,
    particleColor: 0x80c0f0,
  },
  {
    type: 'terrain',
    name: '紫罗兰',
    radius: 1.6,
    uniforms: {
      uOceanColor: { value: new THREE.Color(0x2a1a3a) },
      uLandColor: { value: new THREE.Color(0x7a3a8a) },
      uMountainColor: { value: new THREE.Color(0x5a2a6a) },
      uPolarColor: { value: new THREE.Color(0xc8a0e0) },
      uCloudColor: { value: new THREE.Color(0xe0c0f0) },
      uTime: { value: 0 },
    },
    atmoColor: 0x8040a0,
    atmoIntensity: 1.0,
    hasRing: false,
    particleColor: 0xb060e0,
  },
  {
    type: 'gas',
    name: '金环星',
    radius: 2.8,
    uniforms: {
      uColor1: { value: new THREE.Color(0xe8c878) },
      uColor2: { value: new THREE.Color(0xd0a848) },
      uColor3: { value: new THREE.Color(0xb88830) },
      uTime: { value: 0 },
    },
    atmoColor: 0xe8c878,
    atmoIntensity: 0.7,
    hasRing: true,
    ringColor: 0xe0d0a0,
    ringTilt: 0.6,
    particleColor: 0xf0d870,
  },
  {
    type: 'lava',
    name: '熔核星',
    radius: 1.4,
    uniforms: {
      uRockColor: { value: new THREE.Color(0x1a0a0a) },
      uLavaColor: { value: new THREE.Color(0xff8800) },
      uTime: { value: 0 },
    },
    atmoColor: 0xff6600,
    atmoIntensity: 0.6,
    hasRing: false,
    particleColor: 0xff7700,
  },
  {
    type: 'terrain',
    name: '绯红星',
    radius: 1.7,
    uniforms: {
      uOceanColor: { value: new THREE.Color(0x3a0a0a) },
      uLandColor: { value: new THREE.Color(0xa03030) },
      uMountainColor: { value: new THREE.Color(0x702020) },
      uPolarColor: { value: new THREE.Color(0xe8d0c0) },
      uCloudColor: { value: new THREE.Color(0xd8a090) },
      uTime: { value: 0 },
    },
    atmoColor: 0xc04040,
    atmoIntensity: 0.9,
    hasRing: false,
    particleColor: 0xe04040,
  },
  {
    type: 'ice',
    name: '水晶星',
    radius: 2.2,
    uniforms: {
      uIceColor: { value: new THREE.Color(0xc0d8e8) },
      uCoreColor: { value: new THREE.Color(0x80e0d0) },
      uTime: { value: 0 },
    },
    atmoColor: 0x60d8c8,
    atmoIntensity: 1.0,
    hasRing: false,
    particleColor: 0x80f0d0,
  },
  {
    type: 'gas',
    name: '暮光巨行星',
    radius: 3.2,
    uniforms: {
      uColor1: { value: new THREE.Color(0x6040a0) },
      uColor2: { value: new THREE.Color(0xa04060) },
      uColor3: { value: new THREE.Color(0x4060a0) },
      uTime: { value: 0 },
    },
    atmoColor: 0x8060c0,
    atmoIntensity: 0.8,
    hasRing: true,
    ringColor: 0xa080c0,
    ringTilt: 0.3,
    particleColor: 0x9060d0,
  },
]

// ==================== 场景变量 ====================
let scene, camera, renderer, raycaster, mouse
let starField, planets = [], atmospheres = [], outerGlows = [], rings = []
let raycastSpheres = []
let originalPositions = [], originalScales = []
let isAnimating = false
let focusedIndex = -1
let animationHandles = []
let cameraLocked = false

// Spherical camera: camera orbits around origin
const cameraSphere = { radius: 25, theta: 0, phi: Math.PI / 2 }
const cameraTarget = { radius: 25, theta: 0, phi: Math.PI / 2 }
let isDragging = false
let dragLast = { x: 0, y: 0 }
const DRAG_SENSITIVITY = 0.005
const ZOOM_SENSITIVITY = 0.02

function clearAnimations() {
  animationHandles.forEach(h => h.kill())
  animationHandles = []
}

function getInitialCameraPos() {
  return new THREE.Vector3(0, 0, 25)
}

function updateCameraFromSphere() {
  const r = cameraSphere.radius
  const t = cameraSphere.theta
  const p = cameraSphere.phi
  camera.position.x = r * Math.sin(p) * Math.sin(t)
  camera.position.y = r * Math.cos(p)
  camera.position.z = r * Math.sin(p) * Math.cos(t)
  camera.lookAt(0, 0, 0)
}

function smoothCameraTarget() {
  const damping = 0.12
  cameraSphere.radius += (cameraTarget.radius - cameraSphere.radius) * damping
  cameraSphere.theta += (cameraTarget.theta - cameraSphere.theta) * damping
  cameraSphere.phi += (cameraTarget.phi - cameraSphere.phi) * damping
  updateCameraFromSphere()
}

// ==================== 初始化 ====================
function init(container) {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0c0e22)

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
  updateCameraFromSphere()

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  createStarField()
  createPlanets()

  window.addEventListener('resize', onResize)

  animate()
}

// ==================== 星空背景 ====================
function createStarField() {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(2500 * 3)
  const sizes = new Float32Array(2500)

  for (let i = 0; i < 2500; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 300
    positions[i * 3 + 1] = (Math.random() - 0.5) * 300
    positions[i * 3 + 2] = (Math.random() - 0.5) * 300 - 50
    sizes[i] = Math.random() * 2 + 0.5
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.3,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
  })

  starField = new THREE.Points(geometry, material)
  scene.add(starField)
}

// ==================== 创建星球（实体内核 + 粒子外壳） ====================
function createPlanetMesh(config) {
  const baseColor = new THREE.Color(config.particleColor || 0xffffff)

  // --- 内层：实体球 ---
  const solidGeo = new THREE.SphereGeometry(config.radius * 0.92, 48, 48)
  const solidMat = new THREE.ShaderMaterial({
    uniforms: {
      uBaseColor: { value: baseColor.clone().multiplyScalar(0.6) },
      uHighlight: { value: baseColor.clone().multiplyScalar(1.3) },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uBaseColor;
      uniform vec3 uHighlight;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 lightDir = normalize(vec3(5.0, 5.0, 10.0));
        float diff = max(dot(vNormal, lightDir), 0.0);
        float wrap = diff * 0.6 + 0.4; // 柔和包裹光

        // 边缘 fresnel
        vec3 viewDir = normalize(-vPosition);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.0);

        vec3 color = mix(uBaseColor, uHighlight, fresnel * 0.6);
        color *= wrap;

        // 微脉动
        float pulse = sin(uTime * 1.2) * 0.03 + 1.0;
        color *= pulse;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
  const solidSphere = new THREE.Mesh(solidGeo, solidMat)

  // --- 外层：粒子壳 ---
  const count = 1200
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const phi = Math.acos(2 * Math.random() - 1)
    const theta = Math.random() * Math.PI * 2
    // 粒子在实体球外面，距离有随机性
    const radius = config.radius + Math.random() * config.radius * 0.4

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi)

    const c = baseColor.clone()
    c.offsetHSL(0, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.25)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b

    sizes[i] = 0.1 + Math.random() * 0.1
  }

  const particleGeo = new THREE.BufferGeometry()
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const particleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uTime;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // 粒子脉动
        float breathe = 1.0 + sin(uTime * 0.8 + position.x * 3.0) * 0.2;
        gl_PointSize = size * uPixelRatio * breathe * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.05, 0.5, d);
        gl_FragColor = vec4(vColor * 1.5, alpha * 0.75);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const particles = new THREE.Points(particleGeo, particleMat)

  // 给实体球加上可点击的包围球
  solidSphere.geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, 0),
    config.radius * 1.3
  )

  return { solid: solidSphere, particles }
}

function cloneUniforms(src) {
  const dst = {}
  for (const [key, val] of Object.entries(src)) {
    dst[key] = { value: val.value.clone ? val.value.clone() : val.value }
  }
  return dst
}

function createAtmosphere(config, index) {
  const geometry = new THREE.SphereGeometry(config.radius * 1.2, 32, 32)
  const material = new THREE.ShaderMaterial({
    vertexShader: ATMOSPHERE_VERTEX_SHADER,
    fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
    uniforms: {
      uAtmoColor: { value: new THREE.Color(config.atmoColor) },
      uIntensity: { value: config.atmoIntensity },
    },
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const atmoMesh = new THREE.Mesh(geometry, material)
  atmoMesh.userData.configIndex = index
  return atmoMesh
}

// Large outer glow shell for dreamy effect
function createOuterGlow(config, index) {
  const geometry = new THREE.SphereGeometry(config.radius * 1.6, 32, 32)
  const material = new THREE.ShaderMaterial({
    vertexShader: ATMOSPHERE_VERTEX_SHADER,
    fragmentShader: `
      precision highp float;
      uniform vec3 uGlowColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 viewDir = normalize(-vPosition);
        float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.5);
        vec3 color = uGlowColor * fresnel * uIntensity * 1.5;
        float alpha = fresnel * 0.5 * uIntensity;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    uniforms: {
      uGlowColor: { value: new THREE.Color(config.atmoColor) },
      uIntensity: { value: config.atmoIntensity },
    },
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glowMesh = new THREE.Mesh(geometry, material)
  glowMesh.userData.configIndex = index
  return glowMesh
}

function createRing(config) {
  const geometry = new THREE.PlaneGeometry(config.radius * 4, config.radius * 4)
  const material = new THREE.ShaderMaterial({
    vertexShader: RING_VERTEX_SHADER,
    fragmentShader: RING_FRAGMENT_SHADER,
    uniforms: {
      uRingColor: { value: new THREE.Color(config.ringColor || 0xc8b898) },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
  const ring = new THREE.Mesh(geometry, material)
  ring.rotation.x = Math.PI * 0.5 + (config.ringTilt || 0.2)
  ring.userData.configIndex = -1
  return ring
}

function createPlanets() {
  const usedPositions = []

  PLANET_CONFIGS.forEach((config, i) => {
    const { solid, particles } = createPlanetMesh(config)
    const atmosphere = createAtmosphere(config, i)
    const outerGlow = createOuterGlow(config, i)

    // 位置分布
    let pos, attempts = 0
    const effectiveRadius = config.radius * 2
    do {
      pos = new THREE.Vector3(
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 36,
        (Math.random() - 0.5) * 60 - 20
      )
      attempts++
    } while (
      attempts < 50 &&
      usedPositions.some(up => pos.distanceTo(up) < 15 + effectiveRadius)
    )

    solid.position.copy(pos)
    atmosphere.position.copy(pos)
    outerGlow.position.copy(pos)
    usedPositions.push(pos.clone())

    solid.userData.rotationSpeed = {
      x: (Math.random() - 0.5) * 0.003,
      y: (Math.random() - 0.5) * 0.008,
    }
    solid.userData.configIndex = i
    solid.userData.config = config

    // 粒子壳作为 solid 的子对象（位置已在局部空间，不需要额外设置）
    solid.add(particles)

    scene.add(solid)
    scene.add(atmosphere)
    scene.add(outerGlow)

    // 不可见球体用于射线检测
    const raySphere = new THREE.Mesh(
      new THREE.SphereGeometry(config.radius * 1.3, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    raySphere.userData.configIndex = i
    solid.add(raySphere)
    raycastSpheres.push(raySphere)

    planets.push(solid)
    atmospheres.push(atmosphere)
    outerGlows.push(outerGlow)
    originalPositions.push(pos.clone())
    originalScales.push(1)

    // 行星环（作为子对象跟星球走）
    if (config.hasRing) {
      const ring = createRing(config)
      ring.position.copy(pos)
      scene.add(ring)
      rings.push(ring)
    } else {
      rings.push(null)
    }
  })

  // 环境光 + 点光源
  const ambientLight = new THREE.AmbientLight(0x555577, 1.0)
  scene.add(ambientLight)

  const pointLight = new THREE.PointLight(0xffffff, 2.0, 200)
  pointLight.position.set(10, 10, 20)
  scene.add(pointLight)
}

// ==================== 交互 ====================
function onMouseClick(event) {
  if (isAnimating) return

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const allTargets = [...raycastSpheres, ...atmospheres, ...outerGlows.filter(g => g)]
  const intersects = raycaster.intersectObjects(allTargets)

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object
    const idx = hitMesh.userData.configIndex
    if (idx >= 0 && idx !== focusedIndex) {
      focusPlanet(idx)
    }
  } else if (focusedIndex !== -1) {
    resetView()
  }
}

function enableInteraction() {
  renderer.domElement.addEventListener('click', onMouseClick)
  renderer.domElement.addEventListener('mousedown', onDragStart)
  renderer.domElement.addEventListener('mousemove', onDragMove)
  renderer.domElement.addEventListener('mouseup', onDragEnd)
  renderer.domElement.addEventListener('mouseleave', onDragEnd)
  renderer.domElement.addEventListener('wheel', onWheel)
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false })
  renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false })
  renderer.domElement.addEventListener('touchend', onTouchEnd)
}

function disableInteraction() {
  renderer.domElement.removeEventListener('click', onMouseClick)
  renderer.domElement.removeEventListener('mousedown', onDragStart)
  renderer.domElement.removeEventListener('mousemove', onDragMove)
  renderer.domElement.removeEventListener('mouseup', onDragEnd)
  renderer.domElement.removeEventListener('mouseleave', onDragEnd)
  renderer.domElement.removeEventListener('wheel', onWheel)
  renderer.domElement.removeEventListener('touchstart', onTouchStart)
  renderer.domElement.removeEventListener('touchmove', onTouchMove)
  renderer.domElement.removeEventListener('touchend', onTouchEnd)
}

function onDragStart(e) {
  if (isAnimating) return
  isDragging = false
  dragLast.x = e.clientX
  dragLast.y = e.clientY
  renderer.domElement.style.cursor = 'grab'
}

function onDragMove(e) {
  if (dragLast.x === undefined) return
  const dx = e.clientX - dragLast.x
  const dy = e.clientY - dragLast.y
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    isDragging = true
    renderer.domElement.style.cursor = 'grabbing'
  }
  if (isDragging) {
    cameraTarget.theta -= dx * DRAG_SENSITIVITY
    cameraTarget.phi += dy * DRAG_SENSITIVITY
    cameraTarget.phi = Math.max(0.3, Math.min(Math.PI - 0.3, cameraTarget.phi))
    dragLast.x = e.clientX
    dragLast.y = e.clientY
  }
}

function onDragEnd() {
  renderer.domElement.style.cursor = ''
  setTimeout(() => { isDragging = false }, 0)
}

function onWheel(e) {
  if (isAnimating) return
  cameraTarget.radius += e.deltaY * ZOOM_SENSITIVITY
  cameraTarget.radius = Math.max(8, Math.min(50, cameraTarget.radius))
}

function onTouchStart(e) {
  if (isAnimating || e.touches.length !== 1) return
  isDragging = false
  dragLast.x = e.touches[0].clientX
  dragLast.y = e.touches[0].clientY
}

function onTouchMove(e) {
  if (dragLast.x === undefined || e.touches.length !== 1) return
  const dx = e.touches[0].clientX - dragLast.x
  const dy = e.touches[0].clientY - dragLast.y
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    isDragging = true
    e.preventDefault()
  }
  if (isDragging) {
    cameraTarget.theta -= dx * DRAG_SENSITIVITY
    cameraTarget.phi += dy * DRAG_SENSITIVITY
    cameraTarget.phi = Math.max(0.3, Math.min(Math.PI - 0.3, cameraTarget.phi))
    dragLast.x = e.touches[0].clientX
    dragLast.y = e.touches[0].clientY
  }
}

function onTouchEnd() {
  setTimeout(() => { isDragging = false }, 0)
}

// ==================== GSAP 动画 ====================
let focusLookAt = new THREE.Vector3()

function focusPlanet(index) {
  isAnimating = true
  focusedIndex = index
  clearAnimations()

  const target = planets[index]
  const targetAtmo = atmospheres[index]
  const targetPos = target.position.clone()
  const targetRing = rings[index]

  cameraLocked = true

  // 第一步：相机飞到星球正前方，星球在屏幕中心
  // 从当前相机位置指向星球，沿这条线后退 dist 距离作为相机目标
  const toPlanet = new THREE.Vector3().subVectors(targetPos, camera.position).normalize()
  const dist = Math.max(target.userData.config.radius * 3, 5)
  const camCenterPos = targetPos.clone().sub(toPlanet.clone().multiplyScalar(dist))

  console.log(`[focusPlanet] planet=${target.userData.config.name}`, {
    camPos: `(${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`,
    targetPos: `(${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)})`,
    toPlanet: `(${toPlanet.x.toFixed(2)}, ${toPlanet.y.toFixed(2)}, ${toPlanet.z.toFixed(2)})`,
    dist,
    camCenterPos: `(${camCenterPos.x.toFixed(1)}, ${camCenterPos.y.toFixed(1)}, ${camCenterPos.z.toFixed(1)})`,
  })

  // 第二步：相机左移，星球出现在屏幕左侧
  const slideOffset = new THREE.Vector3(-3.5, 0, 0)
  const camLeftPos = camCenterPos.clone().add(slideOffset)

  // 相机位置动画：从当前位置飞到中心，再滑到左侧
  // 关键：每次都从 camera.position 的当前实时值出发
  const startPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
  const startLook = { x: focusLookAt.x, y: focusLookAt.y, z: focusLookAt.z }

  const tl = gsap.timeline()
  // 第一步：飞向中心
  tl.to(startPos, {
    x: camCenterPos.x, y: camCenterPos.y, z: camCenterPos.z,
    duration: 0.8, ease: 'power2.inOut',
    onUpdate: () => camera.position.set(startPos.x, startPos.y, startPos.z),
  })

  // 注视点：全程盯着星球
  focusLookAt.copy(targetPos)

  // 第二步：左移
  tl.to(startPos, {
    x: camLeftPos.x, y: camLeftPos.y, z: camLeftPos.z,
    duration: 0.5, ease: 'power2.inOut',
    onUpdate: () => camera.position.set(startPos.x, startPos.y, startPos.z),
  })

  // 左移阶段同时偏移注视点
  tl.to(startLook, {
    x: targetPos.x + 3.5, y: targetPos.y, z: targetPos.z,
    duration: 0.5, ease: 'power2.inOut',
    onUpdate: () => focusLookAt.set(startLook.x, startLook.y, startLook.z),
  }, 0.8)

  // 目标星球稍微放大
  gsap.to(target.scale, {
    x: 1.4,
    y: 1.4,
    z: 1.4,
    duration: 0.8,
    ease: 'power2.inOut',
  })

  // 大气层增强
  if (targetAtmo && targetAtmo.material.uniforms) {
    gsap.to(targetAtmo.material.uniforms.uIntensity, {
      value: (targetAtmo.material.uniforms.uIntensity.value || 1) * 1.8,
      duration: 0.8,
      ease: 'power2.inOut',
    })
  }
  if (outerGlows[index] && outerGlows[index].material.uniforms) {
    gsap.to(outerGlows[index].material.uniforms.uIntensity, {
      value: (outerGlows[index].material.uniforms.uIntensity.value || 1) * 1.8,
      duration: 0.8,
      ease: 'power2.inOut',
    })
  }

  // 其他星球缩小淡出
  planets.forEach((planet, i) => {
    if (i !== index) {
      gsap.to(planet.scale, {
        x: 0.5, y: 0.5, z: 0.5,
        duration: 0.8, ease: 'power2.inOut',
      })
      if (atmospheres[i] && atmospheres[i].material) {
        gsap.to(atmospheres[i].material, {
          opacity: 0.2,
          duration: 0.8, ease: 'power2.inOut',
        })
      }
      if (outerGlows[i] && outerGlows[i].material) {
        gsap.to(outerGlows[i].material, {
          opacity: 0.1,
          duration: 0.8, ease: 'power2.inOut',
        })
      }
      if (rings[i]) {
        gsap.to(rings[i].material, {
          opacity: 0.2,
          duration: 0.8, ease: 'power2.inOut',
        })
      }
    }
  })

  // 星空变暗
  gsap.to(starField.material, {
    opacity: 0.3,
    duration: 0.8, ease: 'power2.inOut',
  })

  setTimeout(() => { isAnimating = false }, 1400)
}

function resetView() {
  isAnimating = true
  clearAnimations()

  cameraLocked = true

  // 相机回到初始位置
  const initPos = getInitialCameraPos()
  const camProxy = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
  const lookProxy = { x: focusLookAt.x, y: focusLookAt.y, z: focusLookAt.z }

  gsap.to(camProxy, {
    x: initPos.x, y: initPos.y, z: initPos.z,
    duration: 1.0, ease: 'power2.inOut',
    onUpdate: () => camera.position.set(camProxy.x, camProxy.y, camProxy.z),
  })
  gsap.to(lookProxy, {
    x: 0, y: 0, z: -1,
    duration: 1.0, ease: 'power2.inOut',
    onUpdate: () => focusLookAt.set(lookProxy.x, lookProxy.y, lookProxy.z),
  })

  // 恢复所有星球
  planets.forEach((planet, i) => {
    gsap.to(planet.scale, {
      x: 1, y: 1, z: 1,
      duration: 1.0, ease: 'power2.inOut',
    })
    gsap.to(planet.position, {
      x: originalPositions[i].x,
      y: originalPositions[i].y,
      z: originalPositions[i].z,
      duration: 1.0, ease: 'power2.inOut',
    })

    if (atmospheres[i] && atmospheres[i].material) {
      const cfg = planet.userData.config
      gsap.to(atmospheres[i].material, { opacity: 1, duration: 1.0, ease: 'power2.inOut' })
      gsap.to(atmospheres[i].position, {
        x: originalPositions[i].x, y: originalPositions[i].y, z: originalPositions[i].z,
        duration: 1.0, ease: 'power2.inOut',
      })
      if (cfg && atmospheres[i].material.uniforms?.uIntensity) {
        gsap.to(atmospheres[i].material.uniforms.uIntensity, {
          value: cfg.atmoIntensity, duration: 1.0, ease: 'power2.inOut',
        })
      }
    }
    if (outerGlows[i] && outerGlows[i].material) {
      const cfg = planet.userData.config
      gsap.to(outerGlows[i].material, { opacity: 1, duration: 1.0, ease: 'power2.inOut' })
      gsap.to(outerGlows[i].position, {
        x: originalPositions[i].x, y: originalPositions[i].y, z: originalPositions[i].z,
        duration: 1.0, ease: 'power2.inOut',
      })
      if (cfg && outerGlows[i].material.uniforms?.uIntensity) {
        gsap.to(outerGlows[i].material.uniforms.uIntensity, {
          value: cfg.atmoIntensity, duration: 1.0, ease: 'power2.inOut',
        })
      }
    }
    if (rings[i] && rings[i].material) {
      gsap.to(rings[i].material, { opacity: 1, duration: 1.0, ease: 'power2.inOut' })
      gsap.to(rings[i].position, {
        x: originalPositions[i].x, y: originalPositions[i].y, z: originalPositions[i].z,
        duration: 1.0, ease: 'power2.inOut',
      })
    }
  })

  gsap.to(starField.material, {
    opacity: 0.8, duration: 1.0, ease: 'power2.inOut',
  })

  focusedIndex = -1

  setTimeout(() => {
    isAnimating = false
    cameraLocked = false
    cameraSphere.radius = 25
    cameraSphere.theta = 0
    cameraSphere.phi = Math.PI / 2
    cameraTarget.radius = 25
    cameraTarget.theta = 0
    cameraTarget.phi = Math.PI / 2
  }, 1100)
}

// ==================== 渲染循环 ====================
function animate() {
  requestAnimationFrame(animate)

  const time = performance.now() * 0.001

  planets.forEach(planet => {
    planet.rotation.x += planet.userData.rotationSpeed.x
    planet.rotation.y += planet.userData.rotationSpeed.y

    // 实体球 shader time
    const mat = planet.material
    if (mat.uniforms?.uTime) {
      mat.uniforms.uTime.value = time
    }

    // 粒子壳 shader time
    planet.children.forEach(child => {
      if (child.isPoints && child.material.uniforms?.uTime) {
        child.material.uniforms.uTime.value = time
      }
    })
  })

  // 平滑相机
  if (cameraLocked) {
    camera.lookAt(focusLookAt)
  } else {
    smoothCameraTarget()
  }

  starField.rotation.y += 0.0001

  renderer.render(scene, camera)
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function dispose(container) {
  disableInteraction()
  window.removeEventListener('resize', onResize)
  clearAnimations()
  if (container && renderer.domElement.parentNode === container) {
    container.removeChild(renderer.domElement)
  }
  renderer.dispose()

  // 清理 shader material
  planets.forEach(p => {
    p.geometry.dispose()
    p.material.dispose()
    // 清理子对象（粒子壳、射线检测球）
    p.children.forEach(child => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    })
  })
  atmospheres.forEach(a => a.material.dispose())
  outerGlows.forEach(g => g && g.material.dispose())
  rings.forEach(r => r && r.material.dispose())
}

export function useStarField() {
  return {
    init,
    enableInteraction,
    disableInteraction,
    dispose,
  }
}
