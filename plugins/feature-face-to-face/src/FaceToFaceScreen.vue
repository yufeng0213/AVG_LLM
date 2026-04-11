<script setup>
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { generateCharacterSpeech, generateFaceToFaceJointDialogues } from '../../../src/llm'
import { getActiveWorldBookId, loadWorldBooks } from '../../../src/worldbook/worldBookStore'

const emit = defineEmits(['back'])

const screenRef = ref(null)
const videoInputRef = ref(null)
const videoRef = ref(null)
const poseCanvasRef = ref(null)

const videoUrl = ref('')
const selectedFileName = ref('')
const poseStatus = ref('待上传视频')
const poseError = ref('')
const clickResult = ref('请先绑定世界书 CHAR，再点击视频区域识别关节')
const worldBooks = ref([])
const selectedWorldBookId = ref('')
const selectedCharacterId = ref('')
const dialogueSpeaker = ref('系统')
const dialogueText = ref('请先绑定世界书 CHAR，再上传视频。系统会按角色设定生成关节台词。')
const jointDialogueStatus = ref('关节台词未生成')
const jointDialogueError = ref('')
const jointVoiceStatus = ref('关节语音未生成')
const jointVoiceError = ref('')
const isMenuOpen = ref(false)
const poseDetectFps = ref(8)
const showPoseOverlay = ref(true)
const poseModelVariant = ref('lite')
const poseDelegate = ref('GPU')
const minPoseDetectionConfidence = ref(0.5)
const minPosePresenceConfidence = ref(0.5)
const minTrackingConfidence = ref(0.5)
const landmarkVisibilityThreshold = ref(0.35)
const landmarkPresenceThreshold = ref(0.35)
const clickSparkles = ref([])
const cameraPreviewRef = ref(null)
const cameraPreviewVideoRef = ref(null)
const cameraPreviewEnabled = ref(false)
const cameraPreviewDragging = ref(false)
const cameraPreviewStatus = ref('相机未开启')
const cameraPreviewError = ref('')
const cameraPreviewX = ref(0)
const cameraPreviewY = ref(0)
const emotionDetectionEnabled = ref(true)
const emotionDetectFps = ref(5)
const emotionStatus = ref('情绪识别未启动')
const emotionError = ref('')
const emotionLabel = ref('未知')
const emotionScore = ref(0)

const POSE_FPS_MIN = 1
const POSE_FPS_MAX = 30

const LOCAL_POSE_WASM_URL = '/mediapipe/wasm'
const POSE_MODEL_VARIANTS = ['lite', 'full', 'heavy']
const LOCAL_POSE_MODEL_URLS = {
  lite: '/mediapipe/models/pose_landmarker_lite.task',
  full: '/mediapipe/models/pose_landmarker_full.task',
  heavy: '/mediapipe/models/pose_landmarker_heavy.task',
}
const REMOTE_POSE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
const REMOTE_POSE_MODEL_URLS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
}
const MODEL_LOAD_TIMEOUT_MS = 16000
const POSE_CONFIDENCE_MIN = 0
const POSE_CONFIDENCE_MAX = 1
const POSE_CONFIDENCE_STEP = 0.05
const LANDMARK_THRESHOLD_MIN = 0
const LANDMARK_THRESHOLD_MAX = 1
const LANDMARK_THRESHOLD_STEP = 0.05
const CLICK_SPARKLE_DURATION_MS = 620
const CLICK_SPARKLE_LIMIT = 16
const CAMERA_PREVIEW_WIDTH = 142
const CAMERA_PREVIEW_HEIGHT = 252
const CAMERA_PREVIEW_MARGIN = 10
const CAMERA_PREVIEW_DEFAULT_TOP = 72
const EMOTION_FPS_MIN = 1
const EMOTION_FPS_MAX = 12
const HUMAN_MODEL_BASE_PATH = '/human-models/'
const HUMAN_MODEL_LOAD_TIMEOUT_MS = 12000
const HUMAN_BACKEND_CANDIDATES = ['webgl', 'wasm', 'cpu']

// MediaPipe Pose 33 点骨架连线
const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32],
  [27, 31], [28, 32],
]

const POSE_LANDMARK_META = [
  { id: 'nose', label: '鼻尖' },
  { id: 'left_eye_inner', label: '左眼内侧' },
  { id: 'left_eye', label: '左眼' },
  { id: 'left_eye_outer', label: '左眼外侧' },
  { id: 'right_eye_inner', label: '右眼内侧' },
  { id: 'right_eye', label: '右眼' },
  { id: 'right_eye_outer', label: '右眼外侧' },
  { id: 'left_ear', label: '左耳' },
  { id: 'right_ear', label: '右耳' },
  { id: 'mouth_left', label: '左嘴角' },
  { id: 'mouth_right', label: '右嘴角' },
  { id: 'left_shoulder', label: '左肩' },
  { id: 'right_shoulder', label: '右肩' },
  { id: 'left_elbow', label: '左肘' },
  { id: 'right_elbow', label: '右肘' },
  { id: 'left_wrist', label: '左手腕' },
  { id: 'right_wrist', label: '右手腕' },
  { id: 'left_pinky', label: '左小指' },
  { id: 'right_pinky', label: '右小指' },
  { id: 'left_index', label: '左食指' },
  { id: 'right_index', label: '右食指' },
  { id: 'left_thumb', label: '左拇指' },
  { id: 'right_thumb', label: '右拇指' },
  { id: 'left_hip', label: '左髋' },
  { id: 'right_hip', label: '右髋' },
  { id: 'left_knee', label: '左膝' },
  { id: 'right_knee', label: '右膝' },
  { id: 'left_ankle', label: '左踝' },
  { id: 'right_ankle', label: '右踝' },
  { id: 'left_heel', label: '左脚跟' },
  { id: 'right_heel', label: '右脚跟' },
  { id: 'left_foot_index', label: '左脚尖' },
  { id: 'right_foot_index', label: '右脚尖' },
]

let poseLandmarker = null
let poseLandmarkerConfigKey = ''
let poseLandmarkerLoadingTask = null
let rafId = 0
let resizeObserver = null
let currentDpr = 1
let lastVideoTime = -1
let lastInferenceTs = 0
let startToken = 0
let isModelLoading = false
let latestLandmarks = null
let highlightedJoint = null
let jointDialogueRequestToken = 0
let jointVoiceRequestToken = 0
const jointDialogueCache = new Map()
const jointDialogueInFlight = new Map()
const jointVoiceCache = new Map()
const jointVoiceInFlight = new Map()
let jointAudioInstance = null
let jointAudioObjectUrl = ''
let currentPlayingJointKey = ''
let clickSparkleSeed = 0
const clickSparkleTimers = new Map()
let cameraPreviewStream = null
let cameraPreviewPositionInitialized = false
let cameraPreviewDragPointerId = null
let cameraPreviewDragOffsetX = 0
let cameraPreviewDragOffsetY = 0
let humanEngine = null
let humanLoadingTask = null
let humanBackendInUse = ''
let emotionLoopRaf = 0
let lastEmotionInferenceTs = 0
let emotionDetectInFlight = false

const getCharacterDisplayName = (character, index = 0) => {
  const fallback = `角色 ${index + 1}`
  const name = String(character?.name || '').trim() || fallback
  const nickname = String(character?.nickname || '').trim()
  return nickname ? `${name}（${nickname}）` : name
}

const selectedWorldBook = computed(() => {
  return worldBooks.value.find((book) => book.id === selectedWorldBookId.value) || null
})

const worldBookCharacters = computed(() => {
  const source = Array.isArray(selectedWorldBook.value?.characters)
    ? selectedWorldBook.value.characters
    : []
  return source.map((character, index) => ({
    id: String(character?.id || `char_${index + 1}`),
    label: getCharacterDisplayName(character, index),
    raw: character,
  }))
})

const selectedCharacter = computed(() => {
  return worldBookCharacters.value.find((item) => item.id === selectedCharacterId.value) || null
})

const poseDetectIntervalMs = computed(() => {
  const fps = Math.min(POSE_FPS_MAX, Math.max(POSE_FPS_MIN, Number(poseDetectFps.value) || 8))
  return Math.max(1, Math.round(1000 / fps))
})

const poseDetectDebugLabel = computed(() => {
  return `当前约 ${poseDetectFps.value} FPS（${poseDetectIntervalMs.value}ms/次）`
})

const emotionDetectIntervalMs = computed(() => {
  const fps = Math.min(EMOTION_FPS_MAX, Math.max(EMOTION_FPS_MIN, Number(emotionDetectFps.value) || 5))
  return Math.max(1, Math.round(1000 / fps))
})

const emotionDetectDebugLabel = computed(() => {
  return `当前约 ${emotionDetectFps.value} FPS（${emotionDetectIntervalMs.value}ms/次）`
})

const clampPoseDetectFps = (value) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return 8
  return Math.min(POSE_FPS_MAX, Math.max(POSE_FPS_MIN, parsed))
}

const clampEmotionDetectFps = (value) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return 5
  return Math.min(EMOTION_FPS_MAX, Math.max(EMOTION_FPS_MIN, parsed))
}

const poseModelVariantLabel = computed(() => {
  const variant = String(poseModelVariant.value || '').toLowerCase()
  if (variant === 'full') return 'FULL（更准）'
  if (variant === 'heavy') return 'HEAVY（最稳/最慢）'
  return 'LITE（更快）'
})

const poseDebugSummaryLabel = computed(() => {
  return `显示 ${showPoseOverlay.value ? '开' : '关'} | 模型 ${poseModelVariantLabel.value} | 委托 ${poseDelegate.value} | det ${minPoseDetectionConfidence.value.toFixed(2)} | presence ${minPosePresenceConfidence.value.toFixed(2)} | tracking ${minTrackingConfidence.value.toFixed(2)} | 可见性 ${landmarkVisibilityThreshold.value.toFixed(2)} | 存在性 ${landmarkPresenceThreshold.value.toFixed(2)}`
})

const cameraPreviewStyle = computed(() => {
  return {
    width: `${CAMERA_PREVIEW_WIDTH}px`,
    height: `${CAMERA_PREVIEW_HEIGHT}px`,
    transform: `translate3d(${Math.round(cameraPreviewX.value)}px, ${Math.round(cameraPreviewY.value)}px, 0)`,
  }
})

const cameraPreviewEmotionTag = computed(() => {
  if (!emotionDetectionEnabled.value) return '实时相机'
  if (emotionError.value) return '实时相机 · 情绪异常'
  const label = String(emotionLabel.value || '').trim() || '未知'
  const score = Math.max(0, Math.min(1, Number(emotionScore.value) || 0))
  if (!score) {
    return `实时相机 · ${label}`
  }
  return `实时相机 · ${label} ${Math.round(score * 100)}%`
})

const clampUnitThreshold = (value, fallback = 0.5) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(1, Math.max(0, Number(parsed.toFixed(2))))
}

const normalizePoseModelVariant = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  return POSE_MODEL_VARIANTS.includes(normalized) ? normalized : 'lite'
}

const normalizePoseDelegate = (value) => {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized === 'CPU' ? 'CPU' : 'GPU'
}

const normalizeHumanEmotionLabel = (value) => {
  const token = String(value || '').trim().toLowerCase()
  const map = {
    angry: '生气',
    disgust: '厌恶',
    fear: '害怕',
    happy: '开心',
    sad: '难过',
    surprised: '惊讶',
    surprise: '惊讶',
    neutral: '平静',
    contempt: '轻蔑',
    calm: '平静',
    confused: '困惑',
  }
  return map[token] || (token ? token : '未知')
}

const getBindingCacheKey = (worldBookId, characterId) => {
  const nextWorldBookId = String(worldBookId || '').trim()
  const nextCharacterId = String(characterId || '').trim()
  if (!nextWorldBookId || !nextCharacterId) return ''
  return `${nextWorldBookId}::${nextCharacterId}`
}

const getCurrentBindingCacheKey = () => {
  return getBindingCacheKey(selectedWorldBookId.value, selectedCharacterId.value)
}

const setDialogueGuidance = () => {
  if (!selectedCharacter.value) {
    dialogueSpeaker.value = '系统'
    dialogueText.value = '请先在左上角菜单选择世界书中的 CHAR。'
    return
  }

  const roleLabel = selectedCharacter.value.label
  dialogueSpeaker.value = roleLabel
  if (!videoUrl.value) {
    dialogueText.value = '请先上传视频，上传后会自动生成该角色的关节台词。'
    return
  }

  const bindingKey = getCurrentBindingCacheKey()
  if (bindingKey && jointDialogueCache.has(bindingKey)) {
    dialogueText.value = '点击角色关节可触发该部位对应台词。'
    return
  }

  if (jointDialogueInFlight.has(bindingKey)) {
    dialogueText.value = '正在根据角色设定生成关节台词，请稍候。'
    return
  }

  dialogueText.value = '关节台词尚未准备完成，点击后会自动尝试补全。'
}

const buildFallbackJointDialogue = (joint) => {
  const roleLabel = selectedCharacter.value?.label || '角色'
  return `${roleLabel}在${joint.label}被点到时轻轻停顿了一下。`
}

const cloneAudioBytes = (bytes) => {
  if (!bytes) return null
  try {
    return new Uint8Array(bytes)
  } catch {
    return null
  }
}

const normalizeVoiceEnabled = (value) => {
  if (value === true) return true
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true'
  }
  if (typeof value === 'number') {
    return value === 1
  }
  return false
}

const normalizeCharacterVoiceConfig = (voiceConfig) => {
  if (!voiceConfig || typeof voiceConfig !== 'object') return null
  const voiceId = String(voiceConfig.voiceId || voiceConfig.voice_id || '').trim()
  return {
    ...voiceConfig,
    enabled: normalizeVoiceEnabled(voiceConfig.enabled),
    voiceId,
  }
}

const resolveCharacterVoiceRuntime = (character = selectedCharacter.value) => {
  const roleLabel = character?.label || '角色'
  const voiceConfig = normalizeCharacterVoiceConfig(character?.raw?.voiceConfig)
  if (!voiceConfig) {
    return {
      success: false,
      error: `${roleLabel} 未配置语音参数`,
      voiceConfig: null,
    }
  }
  if (!voiceConfig.enabled) {
    return {
      success: false,
      error: `${roleLabel} 未开启语音`,
      voiceConfig: null,
    }
  }
  if (!voiceConfig.voiceId) {
    return {
      success: false,
      error: `${roleLabel} 缺少 voice_id`,
      voiceConfig: null,
    }
  }
  return {
    success: true,
    error: '',
    voiceConfig,
  }
}

const getJointVoiceBucket = (bindingKey, create = false) => {
  if (!bindingKey) return null
  if (!jointVoiceCache.has(bindingKey)) {
    if (!create) return null
    jointVoiceCache.set(bindingKey, new Map())
  }
  return jointVoiceCache.get(bindingKey)
}

const getJointVoiceCachedCount = (bindingKey) => {
  const bucket = getJointVoiceBucket(bindingKey, false)
  return bucket instanceof Map ? bucket.size : 0
}

const getJointVoiceCacheEntry = ({ bindingKey, jointId, line = '' }) => {
  const bucket = getJointVoiceBucket(bindingKey, false)
  if (!bucket) return null
  const cached = bucket.get(String(jointId || ''))
  if (!cached) return null

  const expectedLine = String(line || '').trim()
  const cachedLine = String(cached.line || '').trim()
  if (expectedLine && cachedLine && cachedLine !== expectedLine) {
    return null
  }

  const clonedBytes = cloneAudioBytes(cached.audioBytes)
  if (!clonedBytes || clonedBytes.length === 0) return null

  return {
    jointId: String(cached.jointId || jointId || ''),
    line: cachedLine,
    audioBytes: clonedBytes,
    mimeType: String(cached.mimeType || 'audio/mpeg').trim() || 'audio/mpeg',
    format: String(cached.format || 'mp3').trim().toLowerCase() || 'mp3',
  }
}

const setJointVoiceCacheEntry = ({
  bindingKey,
  jointId,
  line,
  audioBytes,
  mimeType,
  format,
}) => {
  const bucket = getJointVoiceBucket(bindingKey, true)
  if (!bucket) return null

  const clonedBytes = cloneAudioBytes(audioBytes)
  const normalizedJointId = String(jointId || '').trim()
  if (!normalizedJointId || !clonedBytes || clonedBytes.length === 0) return null

  const payload = {
    jointId: normalizedJointId,
    line: String(line || '').trim(),
    audioBytes: clonedBytes,
    mimeType: String(mimeType || 'audio/mpeg').trim() || 'audio/mpeg',
    format: String(format || 'mp3').trim().toLowerCase() || 'mp3',
  }
  bucket.set(normalizedJointId, payload)
  return getJointVoiceCacheEntry({
    bindingKey,
    jointId: normalizedJointId,
    line: payload.line,
  })
}

const buildJointVoiceInFlightKey = (bindingKey, jointId, line = '') => {
  return `${String(bindingKey || '').trim()}::${String(jointId || '').trim()}::${String(line || '').trim()}`
}

const releaseJointAudioObjectUrl = () => {
  if (!jointAudioObjectUrl) return
  try {
    URL.revokeObjectURL(jointAudioObjectUrl)
  } catch {
    // no-op
  }
  jointAudioObjectUrl = ''
}

const stopJointAudioPlayback = () => {
  if (jointAudioInstance) {
    try {
      jointAudioInstance.pause()
      jointAudioInstance.currentTime = 0
    } catch {
      // no-op
    }
  }
  jointAudioInstance = null
  currentPlayingJointKey = ''
  releaseJointAudioObjectUrl()
}

const syncJointVoiceStatusForCurrentBinding = ({
  pendingMessage = '关节语音待生成（台词就绪后自动触发）',
  clearError = true,
} = {}) => {
  if (!selectedCharacter.value) {
    jointVoiceStatus.value = '关节语音未生成'
    if (clearError) {
      jointVoiceError.value = ''
    }
    return
  }

  const voiceRuntime = resolveCharacterVoiceRuntime(selectedCharacter.value)
  if (!voiceRuntime.success) {
    jointVoiceStatus.value = voiceRuntime.error
    if (clearError) {
      jointVoiceError.value = ''
    }
    return
  }

  const bindingKey = getCurrentBindingCacheKey()
  const cachedCount = getJointVoiceCachedCount(bindingKey)
  if (cachedCount > 0) {
    jointVoiceStatus.value = `关节语音已缓存（${selectedCharacter.value.label}，${cachedCount}条）`
  } else {
    jointVoiceStatus.value = pendingMessage
  }
  if (clearError) {
    jointVoiceError.value = ''
  }
}

const generateJointVoiceForLine = async ({
  bindingKey,
  jointId,
  text,
  voiceConfig,
}) => {
  const normalizedBindingKey = String(bindingKey || '').trim()
  const normalizedJointId = String(jointId || '').trim()
  const lineText = String(text || '').trim()
  if (!normalizedBindingKey || !normalizedJointId || !lineText) {
    return {
      success: false,
      error: '关节语音文本为空',
      audioBytes: null,
    }
  }

  const cached = getJointVoiceCacheEntry({
    bindingKey: normalizedBindingKey,
    jointId: normalizedJointId,
    line: lineText,
  })
  if (cached) {
    return {
      success: true,
      error: null,
      ...cached,
      source: 'cache',
    }
  }

  const inFlightKey = buildJointVoiceInFlightKey(normalizedBindingKey, normalizedJointId, lineText)
  if (jointVoiceInFlight.has(inFlightKey)) {
    return jointVoiceInFlight.get(inFlightKey)
  }

  const requestTask = (async () => {
    const result = await generateCharacterSpeech({
      text: lineText,
      voiceConfig,
    })

    if (!result.success || !result.audioBytes) {
      return {
        success: false,
        error: result.error || '关节语音生成失败',
        audioBytes: null,
      }
    }

    const stored = setJointVoiceCacheEntry({
      bindingKey: normalizedBindingKey,
      jointId: normalizedJointId,
      line: lineText,
      audioBytes: result.audioBytes,
      mimeType: result.mimeType,
      format: result.format,
    })

    if (!stored) {
      return {
        success: false,
        error: '关节语音缓存失败',
        audioBytes: null,
      }
    }

    return {
      success: true,
      error: null,
      ...stored,
      source: 'tts',
    }
  })()
    .finally(() => {
      jointVoiceInFlight.delete(inFlightKey)
    })

  jointVoiceInFlight.set(inFlightKey, requestTask)
  return requestTask
}

const ensureJointVoiceForCurrentBinding = async ({ force = false, trigger = 'runtime' } = {}) => {
  if (!selectedWorldBook.value || !selectedCharacter.value) {
    return {
      success: false,
      error: '世界书或角色未选择',
      total: 0,
      generated: 0,
      failed: 0,
    }
  }

  const bindingKey = getCurrentBindingCacheKey()
  if (!bindingKey) {
    return {
      success: false,
      error: '绑定信息无效',
      total: 0,
      generated: 0,
      failed: 0,
    }
  }

  const dialogueMap = jointDialogueCache.get(bindingKey)
  if (!dialogueMap || typeof dialogueMap !== 'object') {
    return {
      success: false,
      error: '关节台词未就绪',
      total: 0,
      generated: 0,
      failed: 0,
    }
  }

  const voiceRuntime = resolveCharacterVoiceRuntime(selectedCharacter.value)
  if (!voiceRuntime.success) {
    if (getCurrentBindingCacheKey() === bindingKey) {
      jointVoiceStatus.value = voiceRuntime.error
      jointVoiceError.value = ''
    }
    return {
      success: false,
      error: voiceRuntime.error,
      total: 0,
      generated: 0,
      failed: 0,
      skipped: true,
    }
  }

  const lines = POSE_LANDMARK_META
    .map((joint) => ({
      jointId: joint.id,
      text: String(dialogueMap?.[joint.id] || '').trim(),
    }))
    .filter((item) => Boolean(item.text))

  if (lines.length === 0) {
    if (getCurrentBindingCacheKey() === bindingKey) {
      jointVoiceStatus.value = '关节台词为空，未生成语音'
      jointVoiceError.value = ''
    }
    return {
      success: false,
      error: '关节台词为空',
      total: 0,
      generated: 0,
      failed: 0,
    }
  }

  if (force) {
    jointVoiceCache.delete(bindingKey)
  } else {
    const allCached = lines.every((item) => {
      return Boolean(getJointVoiceCacheEntry({
        bindingKey,
        jointId: item.jointId,
        line: item.text,
      }))
    })
    if (allCached) {
      if (getCurrentBindingCacheKey() === bindingKey) {
        jointVoiceError.value = ''
        jointVoiceStatus.value = `关节语音已就绪（${selectedCharacter.value.label}，${lines.length}条）`
      }
      return {
        success: true,
        error: null,
        total: lines.length,
        generated: lines.length,
        failed: 0,
        source: 'cache',
      }
    }
  }

  const requestToken = ++jointVoiceRequestToken
  const boundCharacter = selectedCharacter.value
  let generated = 0
  let failed = 0
  let firstError = ''

  if (getCurrentBindingCacheKey() === bindingKey) {
    jointVoiceError.value = ''
    jointVoiceStatus.value = `正在生成关节语音（0/${lines.length}）...`
  }

  for (const item of lines) {
    if (requestToken !== jointVoiceRequestToken) {
      return {
        success: false,
        error: '关节语音生成已取消',
        total: lines.length,
        generated,
        failed,
      }
    }

    const cached = getJointVoiceCacheEntry({
      bindingKey,
      jointId: item.jointId,
      line: item.text,
    })
    if (cached) {
      generated += 1
      if (requestToken === jointVoiceRequestToken && getCurrentBindingCacheKey() === bindingKey) {
        jointVoiceStatus.value = `正在生成关节语音（${generated}/${lines.length}）...`
      }
      continue
    }

    const generatedResult = await generateJointVoiceForLine({
      bindingKey,
      jointId: item.jointId,
      text: item.text,
      voiceConfig: voiceRuntime.voiceConfig,
    })
    if (generatedResult.success && generatedResult.audioBytes) {
      generated += 1
    } else {
      failed += 1
      if (!firstError) {
        firstError = generatedResult.error || '未知错误'
      }
    }

    if (requestToken === jointVoiceRequestToken && getCurrentBindingCacheKey() === bindingKey) {
      jointVoiceStatus.value = `正在生成关节语音（${generated}/${lines.length}）...`
    }
  }

  if (requestToken === jointVoiceRequestToken && getCurrentBindingCacheKey() === bindingKey) {
    if (failed > 0) {
      jointVoiceStatus.value = `关节语音部分可用（${generated}/${lines.length}）`
      jointVoiceError.value = `部分关节语音生成失败（${failed}/${lines.length}）${firstError ? `：${firstError}` : ''}`
    } else {
      jointVoiceStatus.value = `关节语音已就绪（${boundCharacter?.label || '角色'}，${generated}条）`
      jointVoiceError.value = ''
      console.log('[face-to-face] joint-voices-ready', {
        trigger,
        worldBookId: selectedWorldBookId.value,
        worldBookTitle: selectedWorldBook.value?.title || '',
        characterId: boundCharacter?.id || '',
        characterName: boundCharacter?.label || '',
        count: generated,
      })
    }
  }

  return {
    success: failed === 0,
    error: failed > 0 ? firstError || '部分关节语音生成失败' : null,
    total: lines.length,
    generated,
    failed,
    partial: failed > 0,
    source: 'tts',
  }
}

const playJointVoiceForJointLine = async ({
  bindingKey,
  jointId,
  text,
  character = selectedCharacter.value,
}) => {
  const normalizedBindingKey = String(bindingKey || '').trim()
  const normalizedJointId = String(jointId || '').trim()
  const lineText = String(text || '').trim()
  if (!normalizedBindingKey || !normalizedJointId || !lineText) {
    return
  }

  const voiceRuntime = resolveCharacterVoiceRuntime(character)
  if (!voiceRuntime.success) {
    if (getCurrentBindingCacheKey() === normalizedBindingKey) {
      jointVoiceStatus.value = voiceRuntime.error
      jointVoiceError.value = ''
    }
    return
  }

  const targetJointKey = `${normalizedBindingKey}::${normalizedJointId}`
  if (currentPlayingJointKey === targetJointKey && jointAudioInstance) {
    stopJointAudioPlayback()
    if (getCurrentBindingCacheKey() === normalizedBindingKey) {
      const cachedCount = getJointVoiceCachedCount(normalizedBindingKey)
      jointVoiceStatus.value = `关节语音已缓存（${character?.label || '角色'}，${cachedCount}条）`
      jointVoiceError.value = ''
    }
    return
  }

  let payload = getJointVoiceCacheEntry({
    bindingKey: normalizedBindingKey,
    jointId: normalizedJointId,
    line: lineText,
  })
  if (!payload) {
    const generated = await generateJointVoiceForLine({
      bindingKey: normalizedBindingKey,
      jointId: normalizedJointId,
      text: lineText,
      voiceConfig: voiceRuntime.voiceConfig,
    })
    if (!generated.success || !generated.audioBytes) {
      if (getCurrentBindingCacheKey() === normalizedBindingKey) {
        jointVoiceStatus.value = '关节语音生成失败'
        jointVoiceError.value = generated.error || '关节语音生成失败'
      }
      return
    }
    payload = generated
  }

  const audioBytes = cloneAudioBytes(payload.audioBytes)
  if (!audioBytes || audioBytes.length === 0) {
    if (getCurrentBindingCacheKey() === normalizedBindingKey) {
      jointVoiceStatus.value = '关节语音数据异常'
      jointVoiceError.value = '关节语音为空'
    }
    return
  }

  stopJointAudioPlayback()

  try {
    const blob = new Blob([audioBytes], {
      type: payload.mimeType || 'audio/mpeg',
    })
    const objectUrl = URL.createObjectURL(blob)
    const audio = new Audio(objectUrl)

    jointAudioObjectUrl = objectUrl
    jointAudioInstance = audio
    currentPlayingJointKey = targetJointKey

    audio.onended = () => {
      if (jointAudioInstance !== audio) return
      jointAudioInstance = null
      currentPlayingJointKey = ''
      releaseJointAudioObjectUrl()
      if (getCurrentBindingCacheKey() === normalizedBindingKey) {
        const cachedCount = getJointVoiceCachedCount(normalizedBindingKey)
        jointVoiceStatus.value = `关节语音已缓存（${character?.label || '角色'}，${cachedCount}条）`
      }
    }

    audio.onerror = () => {
      if (jointAudioInstance !== audio) return
      stopJointAudioPlayback()
      if (getCurrentBindingCacheKey() === normalizedBindingKey) {
        jointVoiceStatus.value = '关节语音播放失败'
        jointVoiceError.value = '语音播放失败'
      }
    }

    await audio.play()
    if (getCurrentBindingCacheKey() === normalizedBindingKey) {
      jointVoiceStatus.value = `正在播放关节语音（${character?.label || '角色'} / ${normalizedJointId}）`
      jointVoiceError.value = ''
    }
  } catch (error) {
    stopJointAudioPlayback()
    if (getCurrentBindingCacheKey() === normalizedBindingKey) {
      jointVoiceStatus.value = '关节语音播放失败'
      jointVoiceError.value = `语音播放失败：${error?.message || '未知错误'}`
    }
  }
}

const ensureCharacterSelectionForCurrentWorldBook = () => {
  const candidates = worldBookCharacters.value
  if (candidates.length === 0) {
    selectedCharacterId.value = ''
    return
  }

  const currentExists = candidates.some((item) => item.id === selectedCharacterId.value)
  if (!currentExists) {
    selectedCharacterId.value = candidates[0].id
  }
}

const hasSelectedCharacter = () => {
  if (selectedCharacter.value) {
    return true
  }

  if (worldBookCharacters.value.length === 0) {
    poseStatus.value = '当前世界书没有 CHAR，请先到世界书里新增角色'
    clickResult.value = '未绑定角色：当前世界书没有 CHAR'
    dialogueSpeaker.value = '系统'
    dialogueText.value = '当前世界书暂无 CHAR，请先新增角色。'
    jointVoiceStatus.value = '关节语音未生成'
    jointVoiceError.value = ''
    return false
  }

  poseStatus.value = '请先选择当前视频对应的世界书 CHAR'
  clickResult.value = '未绑定角色：请选择世界书中的 CHAR'
  dialogueSpeaker.value = '系统'
  dialogueText.value = '请先在左上角菜单选择对应的世界书角色。'
  jointVoiceStatus.value = '关节语音未生成'
  jointVoiceError.value = ''
  return false
}

const ensureJointDialoguesForCurrentBinding = async ({ force = false, trigger = 'runtime' } = {}) => {
  if (!selectedWorldBook.value || !selectedCharacter.value) {
    return {
      success: false,
      error: '世界书或角色未选择',
      jointDialogues: null,
    }
  }

  const bindingKey = getCurrentBindingCacheKey()
  if (!bindingKey) {
    return {
      success: false,
      error: '绑定信息无效',
      jointDialogues: null,
    }
  }

  if (!force && jointDialogueCache.has(bindingKey)) {
    const cached = jointDialogueCache.get(bindingKey)
    jointDialogueError.value = ''
    jointDialogueStatus.value = `关节台词已加载（${selectedCharacter.value.label}）`
    void ensureJointVoiceForCurrentBinding({ trigger: 'joint-dialogues-cache' })
    return {
      success: true,
      error: null,
      jointDialogues: cached,
      source: 'cache',
    }
  }

  if (jointDialogueInFlight.has(bindingKey)) {
    return jointDialogueInFlight.get(bindingKey)
  }

  const requestToken = ++jointDialogueRequestToken
  const boundCharacter = selectedCharacter.value
  const worldBook = selectedWorldBook.value
  const characterPayload = boundCharacter?.raw && typeof boundCharacter.raw === 'object'
    ? boundCharacter.raw
    : {
      id: boundCharacter?.id || '',
      name: boundCharacter?.label || '角色',
    }

  jointDialogueError.value = ''
  jointDialogueStatus.value = `正在生成关节台词（${boundCharacter?.label || '角色'}）...`

  const requestTask = (async () => {
    const result = await generateFaceToFaceJointDialogues({
      worldBook,
      character: characterPayload,
      characterName: boundCharacter?.label || '',
      jointIds: POSE_LANDMARK_META.map((item) => item.id),
      options: {
        temperature: 0.86,
        maxTokens: 1600,
        lineMaxLength: 64,
      },
    })

    if (!result.success || !result.jointDialogues) {
      const message = result.error || '关节台词生成失败'
      if (requestToken === jointDialogueRequestToken && getCurrentBindingCacheKey() === bindingKey) {
        jointDialogueError.value = message
        jointDialogueStatus.value = '关节台词生成失败'
      }
      return {
        success: false,
        error: message,
        jointDialogues: null,
      }
    }

    jointDialogueCache.set(bindingKey, result.jointDialogues)
    if (requestToken === jointDialogueRequestToken && getCurrentBindingCacheKey() === bindingKey) {
      jointDialogueError.value = ''
      jointDialogueStatus.value = `关节台词已就绪（${boundCharacter?.label || '角色'}）`
      setDialogueGuidance()
      void ensureJointVoiceForCurrentBinding({
        force: true,
        trigger: 'joint-dialogues-ready',
      })
      console.log('[face-to-face] joint-dialogues-ready', {
        trigger,
        worldBookId: selectedWorldBookId.value,
        worldBookTitle: worldBook?.title || '',
        characterId: boundCharacter?.id || '',
        characterName: boundCharacter?.label || '',
        count: Object.keys(result.jointDialogues).length,
      })
    }

    return {
      success: true,
      error: null,
      jointDialogues: result.jointDialogues,
      source: 'llm',
    }
  })()
    .finally(() => {
      jointDialogueInFlight.delete(bindingKey)
    })

  jointDialogueInFlight.set(bindingKey, requestTask)
  return requestTask
}

const loadWorldBookCharacterOptions = async () => {
  const books = await loadWorldBooks()
  worldBooks.value = books

  if (books.length === 0) {
    selectedWorldBookId.value = ''
    selectedCharacterId.value = ''
    poseStatus.value = '未找到世界书，请先创建世界书'
    clickResult.value = '未绑定角色：请先创建世界书与 CHAR'
    dialogueSpeaker.value = '系统'
    dialogueText.value = '未找到世界书，请先创建世界书并新增 CHAR。'
    jointDialogueStatus.value = '关节台词未生成'
    jointDialogueError.value = ''
    jointVoiceStatus.value = '关节语音未生成'
    jointVoiceError.value = ''
    return
  }

  const activeBookId = await getActiveWorldBookId()
  const activeExists = books.some((book) => book.id === activeBookId)
  selectedWorldBookId.value = activeExists ? activeBookId : books[0].id
  ensureCharacterSelectionForCurrentWorldBook()

  if (!selectedCharacter.value) {
    poseStatus.value = '当前世界书没有 CHAR，请先到世界书里新增角色'
    clickResult.value = '未绑定角色：当前世界书没有 CHAR'
    dialogueSpeaker.value = '系统'
    dialogueText.value = '当前世界书暂无 CHAR，请先创建角色。'
    jointDialogueStatus.value = '关节台词未生成'
    jointDialogueError.value = ''
    jointVoiceStatus.value = '关节语音未生成'
    jointVoiceError.value = ''
    return
  }

  poseStatus.value = `已绑定角色：${selectedCharacter.value.label}`
  clickResult.value = '点击视频区域可识别关节'
  jointDialogueStatus.value = '关节台词待生成（上传视频后自动触发）'
  jointDialogueError.value = ''
  setDialogueGuidance()
  syncJointVoiceStatusForCurrentBinding()
}

const handleWorldBookChange = (event) => {
  selectedWorldBookId.value = String(event?.target?.value || '').trim()
}

const handleCharacterChange = (event) => {
  selectedCharacterId.value = String(event?.target?.value || '').trim()
}

const handlePoseDetectFpsChange = (event) => {
  poseDetectFps.value = clampPoseDetectFps(event?.target?.value)
}

const handleShowPoseOverlayChange = (event) => {
  showPoseOverlay.value = Boolean(event?.target?.checked)
}

const handlePoseModelVariantChange = (event) => {
  poseModelVariant.value = normalizePoseModelVariant(event?.target?.value)
}

const handlePoseDelegateChange = (event) => {
  poseDelegate.value = normalizePoseDelegate(event?.target?.value)
}

const handleMinPoseDetectionConfidenceChange = (event) => {
  minPoseDetectionConfidence.value = clampUnitThreshold(event?.target?.value, 0.5)
}

const handleMinPosePresenceConfidenceChange = (event) => {
  minPosePresenceConfidence.value = clampUnitThreshold(event?.target?.value, 0.5)
}

const handleMinTrackingConfidenceChange = (event) => {
  minTrackingConfidence.value = clampUnitThreshold(event?.target?.value, 0.5)
}

const handleLandmarkVisibilityThresholdChange = (event) => {
  landmarkVisibilityThreshold.value = clampUnitThreshold(event?.target?.value, 0.35)
}

const handleLandmarkPresenceThresholdChange = (event) => {
  landmarkPresenceThreshold.value = clampUnitThreshold(event?.target?.value, 0.35)
}

const handleEmotionDetectionToggleChange = (event) => {
  emotionDetectionEnabled.value = Boolean(event?.target?.checked)
}

const handleEmotionDetectFpsChange = (event) => {
  emotionDetectFps.value = clampEmotionDetectFps(event?.target?.value)
}

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
}

const clearVideoUrl = () => {
  if (!videoUrl.value) return
  URL.revokeObjectURL(videoUrl.value)
  videoUrl.value = ''
}

const openVideoPicker = () => {
  isMenuOpen.value = false
  videoInputRef.value?.click()
}

const clampNumber = (value, min, max) => {
  return Math.min(max, Math.max(min, value))
}

const getCameraPreviewBounds = () => {
  const host = screenRef.value
  const hostWidth = host?.clientWidth || window.innerWidth || (CAMERA_PREVIEW_WIDTH + CAMERA_PREVIEW_MARGIN * 2)
  const hostHeight = host?.clientHeight || window.innerHeight || (CAMERA_PREVIEW_HEIGHT + CAMERA_PREVIEW_MARGIN * 2)
  const maxX = Math.max(CAMERA_PREVIEW_MARGIN, hostWidth - CAMERA_PREVIEW_WIDTH - CAMERA_PREVIEW_MARGIN)
  const maxY = Math.max(CAMERA_PREVIEW_MARGIN, hostHeight - CAMERA_PREVIEW_HEIGHT - CAMERA_PREVIEW_MARGIN)
  return {
    minX: CAMERA_PREVIEW_MARGIN,
    maxX,
    minY: CAMERA_PREVIEW_MARGIN,
    maxY,
  }
}

const setCameraPreviewPosition = (x, y) => {
  const bounds = getCameraPreviewBounds()
  const safeX = clampNumber(Number(x) || 0, bounds.minX, bounds.maxX)
  const safeY = clampNumber(Number(y) || 0, bounds.minY, bounds.maxY)
  cameraPreviewX.value = Math.round(safeX)
  cameraPreviewY.value = Math.round(safeY)
}

const ensureCameraPreviewInitialPosition = ({ force = false } = {}) => {
  if (cameraPreviewPositionInitialized && !force) {
    setCameraPreviewPosition(cameraPreviewX.value, cameraPreviewY.value)
    return
  }
  const bounds = getCameraPreviewBounds()
  const targetX = bounds.maxX
  const targetY = clampNumber(CAMERA_PREVIEW_DEFAULT_TOP, bounds.minY, bounds.maxY)
  setCameraPreviewPosition(targetX, targetY)
  cameraPreviewPositionInitialized = true
}

const releaseCameraPreviewPointerCapture = () => {
  if (cameraPreviewDragPointerId === null) return
  const host = cameraPreviewRef.value
  if (!host || typeof host.hasPointerCapture !== 'function') return
  try {
    if (host.hasPointerCapture(cameraPreviewDragPointerId)) {
      host.releasePointerCapture(cameraPreviewDragPointerId)
    }
  } catch {
    // no-op
  }
}

const stopCameraPreviewDragging = () => {
  releaseCameraPreviewPointerCapture()
  cameraPreviewDragging.value = false
  cameraPreviewDragPointerId = null
}

const stopCameraPreviewStream = () => {
  const previewVideo = cameraPreviewVideoRef.value
  if (previewVideo && previewVideo.srcObject) {
    previewVideo.srcObject = null
  }

  if (cameraPreviewStream) {
    cameraPreviewStream.getTracks().forEach((track) => {
      track.stop()
    })
  }
  cameraPreviewStream = null
}

const getCameraPreviewErrorMessage = (error) => {
  const code = String(error?.name || '').trim()
  if (code === 'NotAllowedError' || code === 'PermissionDeniedError') {
    return '相机权限被拒绝，请在系统权限里允许访问相机'
  }
  if (code === 'NotFoundError' || code === 'DevicesNotFoundError') {
    return '未检测到可用相机设备'
  }
  if (code === 'NotReadableError' || code === 'TrackStartError') {
    return '相机被其他应用占用，请关闭后重试'
  }
  if (code === 'SecurityError') {
    return '当前环境不支持相机访问'
  }
  return `相机开启失败：${error?.message || '未知错误'}`
}

const bindCameraPreviewStream = async () => {
  const previewVideo = cameraPreviewVideoRef.value
  if (!previewVideo || !cameraPreviewStream) return
  if (previewVideo.srcObject !== cameraPreviewStream) {
    previewVideo.srcObject = cameraPreviewStream
  }
  try {
    await previewVideo.play()
  } catch {
    // 某些设备会要求用户交互后播放，忽略异常。
  }
}

const resetEmotionSnapshot = () => {
  emotionLabel.value = '未知'
  emotionScore.value = 0
}

const stopEmotionLoop = () => {
  if (!emotionLoopRaf) return
  cancelAnimationFrame(emotionLoopRaf)
  emotionLoopRaf = 0
}

const stopEmotionDetection = ({ preserveStatus = false } = {}) => {
  stopEmotionLoop()
  emotionDetectInFlight = false
  lastEmotionInferenceTs = 0
  if (!preserveStatus) {
    resetEmotionSnapshot()
    emotionError.value = ''
    emotionStatus.value = emotionDetectionEnabled.value ? '情绪识别未启动' : '情绪识别已关闭'
  }
}

const getHumanEngineErrorMessage = (error) => {
  const message = String(error?.message || error || '').trim()
  if (!message) return '情绪模型初始化失败'
  if (message.toLowerCase().includes('wasm')) {
    return `情绪模型初始化失败（WASM）：${message}`
  }
  if (message.toLowerCase().includes('webgl')) {
    return `情绪模型初始化失败（WebGL）：${message}`
  }
  return `情绪模型初始化失败：${message}`
}

const getHumanModule = async () => {
  const mod = await import('@vladmandic/human')
  const candidate = mod?.Human || mod?.default?.Human || mod?.default || null
  if (typeof candidate !== 'function') {
    throw new Error('未找到 Human 构造函数')
  }
  return candidate
}

const createHumanConfig = (backend) => {
  return {
    backend,
    debug: false,
    warmup: 'none',
    cacheModels: true,
    modelBasePath: HUMAN_MODEL_BASE_PATH,
    face: {
      enabled: true,
      detector: {
        enabled: true,
        modelPath: 'blazeface.json',
        maxDetected: 1,
        minConfidence: 0.35,
        rotation: false,
      },
      mesh: {
        enabled: false,
      },
      attention: {
        enabled: false,
      },
      iris: {
        enabled: false,
      },
      description: {
        enabled: false,
      },
      antispoof: {
        enabled: false,
      },
      liveness: {
        enabled: false,
      },
      emotion: {
        enabled: true,
        modelPath: 'emotion.json',
        minConfidence: 0.1,
      },
    },
    body: {
      enabled: false,
    },
    hand: {
      enabled: false,
    },
    object: {
      enabled: false,
    },
    segmentation: {
      enabled: false,
    },
    gesture: {
      enabled: false,
    },
    filter: {
      enabled: false,
    },
  }
}

const createHumanEngineForBackend = async (backend) => {
  const HumanCtor = await getHumanModule()
  const config = createHumanConfig(backend)
  const instance = new HumanCtor(config)
  await withTimeout(
    () => instance.load(),
    HUMAN_MODEL_LOAD_TIMEOUT_MS,
    `Human ${backend} 模型加载超时`,
  )
  return instance
}

const ensureHumanEngine = async () => {
  if (humanEngine) return {
    success: true,
    error: null,
    backend: humanBackendInUse,
  }
  if (humanLoadingTask) {
    return humanLoadingTask
  }

  humanLoadingTask = (async () => {
    let lastError = ''
    for (const backend of HUMAN_BACKEND_CANDIDATES) {
      try {
        emotionStatus.value = `情绪模型加载中（${backend}）...`
        const created = await createHumanEngineForBackend(backend)
        humanEngine = created
        humanBackendInUse = backend
        emotionError.value = ''
        emotionStatus.value = `情绪模型已就绪（${backend}）`
        return {
          success: true,
          error: null,
          backend,
        }
      } catch (error) {
        lastError = getHumanEngineErrorMessage(error)
        console.warn('[face-to-face] human backend failed', {
          backend,
          error: lastError,
        })
      }
    }

    emotionError.value = lastError || '情绪模型初始化失败'
    emotionStatus.value = '情绪模型不可用'
    humanEngine = null
    humanBackendInUse = ''
    return {
      success: false,
      error: emotionError.value,
      backend: '',
    }
  })()
    .finally(() => {
      humanLoadingTask = null
    })

  return humanLoadingTask
}

const getTopEmotionFromFace = (face) => {
  const source = Array.isArray(face?.emotion) ? face.emotion : []
  let best = null
  source.forEach((item) => {
    const score = Number(item?.score || 0)
    if (!Number.isFinite(score)) return
    if (!best || score > best.score) {
      best = {
        emotion: String(item?.emotion || '').trim(),
        score: Math.max(0, Math.min(1, score)),
      }
    }
  })
  return best
}

const updateEmotionStateByResult = (result) => {
  const faces = Array.isArray(result?.face) ? result.face : []
  const face = faces[0] || null
  const top = getTopEmotionFromFace(face)
  if (!top) {
    emotionLabel.value = '未检测到人脸'
    emotionScore.value = 0
    emotionStatus.value = '情绪识别中：未检测到人脸'
    return
  }

  const label = normalizeHumanEmotionLabel(top.emotion)
  emotionLabel.value = label
  emotionScore.value = top.score
  emotionStatus.value = `情绪识别中：${label} ${Math.round(top.score * 100)}%`
}

const runEmotionLoop = () => {
  stopEmotionLoop()

  const tick = async () => {
    emotionLoopRaf = requestAnimationFrame(tick)

    if (!emotionDetectionEnabled.value || !cameraPreviewEnabled.value || !humanEngine) return
    if (emotionDetectInFlight) return

    const previewVideo = cameraPreviewVideoRef.value
    if (!previewVideo) return
    if (previewVideo.readyState < 2 || previewVideo.paused || previewVideo.ended) return

    const now = performance.now()
    if (now - lastEmotionInferenceTs < emotionDetectIntervalMs.value) return
    lastEmotionInferenceTs = now
    emotionDetectInFlight = true

    try {
      const result = await humanEngine.detect(previewVideo)
      updateEmotionStateByResult(result)
      emotionError.value = ''
    } catch (error) {
      const message = String(error?.message || '未知错误')
      emotionError.value = `情绪识别失败：${message}`
      emotionStatus.value = '情绪识别异常'
    } finally {
      emotionDetectInFlight = false
    }
  }

  tick()
}

const startEmotionDetection = async () => {
  if (!emotionDetectionEnabled.value || !cameraPreviewEnabled.value) return
  if (!cameraPreviewStream) return

  const ready = await ensureHumanEngine()
  if (!ready.success || !humanEngine) {
    return
  }

  emotionError.value = ''
  emotionStatus.value = `情绪识别中（${ready.backend || humanBackendInUse || 'auto'}）...`
  runEmotionLoop()
}

const startCameraPreview = async () => {
  if (cameraPreviewStream) {
    await bindCameraPreviewStream()
    cameraPreviewError.value = ''
    cameraPreviewStatus.value = '相机已开启（可拖动）'
    void startEmotionDetection()
    return {
      success: true,
      error: null,
    }
  }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const message = '当前环境不支持 getUserMedia 相机接口'
    cameraPreviewError.value = message
    cameraPreviewStatus.value = '相机不可用'
    return {
      success: false,
      error: message,
    }
  }

  cameraPreviewError.value = ''
  cameraPreviewStatus.value = '相机启动中...'

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 720 },
        height: { ideal: 1280 },
      },
    })
    if (!cameraPreviewEnabled.value) {
      stream.getTracks().forEach((track) => {
        track.stop()
      })
      return {
        success: false,
        error: '相机预览已取消',
      }
    }

    cameraPreviewStream = stream
    await nextTick()
    await bindCameraPreviewStream()
    cameraPreviewError.value = ''
    cameraPreviewStatus.value = '相机已开启（可拖动）'
    void startEmotionDetection()
    return {
      success: true,
      error: null,
    }
  } catch (error) {
    const message = getCameraPreviewErrorMessage(error)
    cameraPreviewError.value = message
    cameraPreviewStatus.value = '相机开启失败'
    stopCameraPreviewStream()
    return {
      success: false,
      error: message,
    }
  }
}

const closeCameraPreview = ({ preserveError = false } = {}) => {
  stopCameraPreviewDragging()
  stopEmotionDetection()
  stopCameraPreviewStream()
  cameraPreviewEnabled.value = false
  cameraPreviewStatus.value = '相机未开启'
  if (!preserveError) {
    cameraPreviewError.value = ''
  }
}

const toggleCameraPreview = async () => {
  if (cameraPreviewEnabled.value) {
    closeCameraPreview()
    return
  }

  cameraPreviewEnabled.value = true
  ensureCameraPreviewInitialPosition()
  const started = await startCameraPreview()
  if (!started.success) {
    closeCameraPreview({ preserveError: true })
  }
}

const handleCameraPreviewPointerDown = (event) => {
  if (!cameraPreviewEnabled.value) return
  if (event.pointerType === 'mouse' && event.button !== 0) return

  const host = screenRef.value
  if (!host) return
  const rect = host.getBoundingClientRect()
  const pointX = Number(event.clientX) - rect.left
  const pointY = Number(event.clientY) - rect.top
  if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return

  cameraPreviewDragPointerId = event.pointerId
  cameraPreviewDragging.value = true
  cameraPreviewDragOffsetX = pointX - cameraPreviewX.value
  cameraPreviewDragOffsetY = pointY - cameraPreviewY.value
  try {
    event.currentTarget?.setPointerCapture?.(event.pointerId)
  } catch {
    // no-op
  }
  event.preventDefault()
}

const handleWindowPointerMove = (event) => {
  if (!cameraPreviewDragging.value) return
  if (cameraPreviewDragPointerId !== null && event.pointerId !== cameraPreviewDragPointerId) return

  const host = screenRef.value
  if (!host) return
  const rect = host.getBoundingClientRect()
  const nextX = Number(event.clientX) - rect.left - cameraPreviewDragOffsetX
  const nextY = Number(event.clientY) - rect.top - cameraPreviewDragOffsetY
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return

  setCameraPreviewPosition(nextX, nextY)
  event.preventDefault()
}

const handleWindowPointerUp = (event) => {
  if (!cameraPreviewDragging.value) return
  if (cameraPreviewDragPointerId !== null && event.pointerId !== cameraPreviewDragPointerId) return
  stopCameraPreviewDragging()
}

const handleWindowPointerCancel = (event) => {
  if (!cameraPreviewDragging.value) return
  if (cameraPreviewDragPointerId !== null && event.pointerId !== cameraPreviewDragPointerId) return
  stopCameraPreviewDragging()
}

const clearClickSparkleTimer = (id) => {
  const timer = clickSparkleTimers.get(id)
  if (!timer) return
  clearTimeout(timer)
  clickSparkleTimers.delete(id)
}

const removeClickSparkleById = (id) => {
  clearClickSparkleTimer(id)
  clickSparkles.value = clickSparkles.value.filter((item) => item.id !== id)
}

const clearAllClickSparkles = () => {
  clickSparkleTimers.forEach((timer) => {
    clearTimeout(timer)
  })
  clickSparkleTimers.clear()
  clickSparkles.value = []
}

const getEventPointInScreen = (event) => {
  const host = screenRef.value
  if (!host) return null
  const rect = host.getBoundingClientRect()
  const x = Number(event?.clientX) - rect.left
  const y = Number(event?.clientY) - rect.top
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  return { x, y }
}

const spawnClickSparkleAtPoint = (point) => {
  if (!point) return
  const id = `${Date.now()}_${++clickSparkleSeed}`
  const sparkle = {
    id,
    x: Number(point.x) || 0,
    y: Number(point.y) || 0,
    rotation: (Math.random() * 50) - 25,
    scale: Number((0.92 + Math.random() * 0.44).toFixed(2)),
  }

  if (clickSparkles.value.length >= CLICK_SPARKLE_LIMIT) {
    const oldest = clickSparkles.value[0]
    if (oldest?.id) {
      removeClickSparkleById(oldest.id)
    }
  }

  clickSparkles.value = [...clickSparkles.value, sparkle]
  const timer = setTimeout(() => {
    removeClickSparkleById(id)
  }, CLICK_SPARKLE_DURATION_MS + 40)
  clickSparkleTimers.set(id, timer)
}

const resolveAbsoluteAssetUrl = (path) => {
  const normalized = String(path || '').trim()
  if (!normalized) return ''
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized
  }
  if (typeof window === 'undefined') return normalized
  return new URL(normalized, window.location.origin).toString()
}

const withTimeout = async (factory, timeoutMs, timeoutLabel) => {
  let timerId = 0
  const timeoutPromise = new Promise((_, reject) => {
    timerId = window.setTimeout(() => {
      reject(new Error(timeoutLabel))
    }, timeoutMs)
  })

  try {
    return await Promise.race([factory(), timeoutPromise])
  } finally {
    if (timerId) {
      clearTimeout(timerId)
    }
  }
}

const getPoseModelUrlsForVariant = (variant) => {
  const normalized = normalizePoseModelVariant(variant)
  const local = LOCAL_POSE_MODEL_URLS[normalized] || LOCAL_POSE_MODEL_URLS.lite
  const remote = REMOTE_POSE_MODEL_URLS[normalized] || REMOTE_POSE_MODEL_URLS.lite
  return { local, remote, normalized }
}

const getPoseLandmarkerConfigSnapshot = () => {
  return {
    modelVariant: normalizePoseModelVariant(poseModelVariant.value),
    delegate: normalizePoseDelegate(poseDelegate.value),
    minPoseDetectionConfidence: clampUnitThreshold(minPoseDetectionConfidence.value, 0.5),
    minPosePresenceConfidence: clampUnitThreshold(minPosePresenceConfidence.value, 0.5),
    minTrackingConfidence: clampUnitThreshold(minTrackingConfidence.value, 0.5),
  }
}

const getPoseLandmarkerConfigKey = (config) => {
  const snapshot = config || getPoseLandmarkerConfigSnapshot()
  return [
    snapshot.modelVariant,
    snapshot.delegate,
    snapshot.minPoseDetectionConfidence.toFixed(2),
    snapshot.minPosePresenceConfidence.toFixed(2),
    snapshot.minTrackingConfidence.toFixed(2),
  ].join('|')
}

const disposePoseLandmarker = () => {
  if (poseLandmarker && typeof poseLandmarker.close === 'function') {
    poseLandmarker.close()
  }
  poseLandmarker = null
  poseLandmarkerConfigKey = ''
}

const createPoseLandmarkerForSource = async ({
  sourceLabel,
  wasmUrl,
  modelUrl,
  config,
}) => {
  const resolvedWasmUrl = resolveAbsoluteAssetUrl(wasmUrl)
  const resolvedModelUrl = resolveAbsoluteAssetUrl(modelUrl)
  if (!resolvedWasmUrl || !resolvedModelUrl) {
    throw new Error(`${sourceLabel} 资源路径无效`)
  }

  const vision = await withTimeout(
    () => FilesetResolver.forVisionTasks(resolvedWasmUrl),
    MODEL_LOAD_TIMEOUT_MS,
    `${sourceLabel} WASM 初始化超时`,
  )

  const buildCreateOptions = (baseOptions) => ({
    baseOptions,
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: config.minPoseDetectionConfidence,
    minPosePresenceConfidence: config.minPosePresenceConfidence,
    minTrackingConfidence: config.minTrackingConfidence,
  })

  const createByBaseOptions = async (baseOptions) => {
    return withTimeout(
      () => PoseLandmarker.createFromOptions(vision, buildCreateOptions(baseOptions)),
      MODEL_LOAD_TIMEOUT_MS,
      `${sourceLabel} 模型加载超时`,
    )
  }

  const baseOptions = {
    modelAssetPath: resolvedModelUrl,
  }

  if (config.delegate === 'GPU') {
    try {
      const landmarker = await createByBaseOptions({
        ...baseOptions,
        delegate: 'GPU',
      })
      return {
        landmarker,
        runtimeDelegate: 'GPU',
      }
    } catch {
      const landmarker = await createByBaseOptions(baseOptions)
      return {
        landmarker,
        runtimeDelegate: 'CPU',
      }
    }
  }

  const landmarker = await createByBaseOptions(baseOptions)
  return {
    landmarker,
    runtimeDelegate: 'CPU',
  }
}

const clearPoseCanvas = () => {
  const canvas = poseCanvasRef.value
  if (!canvas) return
  const context = canvas.getContext('2d')
  if (!context) return
  const cssWidth = canvas.width / currentDpr
  const cssHeight = canvas.height / currentDpr
  context.clearRect(0, 0, cssWidth, cssHeight)
}

const resizePoseCanvas = () => {
  const host = screenRef.value
  const canvas = poseCanvasRef.value
  if (!host || !canvas) return

  if (cameraPreviewPositionInitialized) {
    setCameraPreviewPosition(cameraPreviewX.value, cameraPreviewY.value)
  }

  const width = host.clientWidth || window.innerWidth
  const height = host.clientHeight || window.innerHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const nextWidth = Math.round(width * dpr)
  const nextHeight = Math.round(height * dpr)

  if (canvas.width === nextWidth && canvas.height === nextHeight && currentDpr === dpr) {
    return
  }

  currentDpr = dpr
  canvas.width = nextWidth
  canvas.height = nextHeight
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.lineJoin = 'round'
  context.lineCap = 'round'
}

const getVideoRenderMetrics = (videoElement, canvas) => {
  if (!videoElement || !canvas) return null
  const cssWidth = canvas.width / currentDpr
  const cssHeight = canvas.height / currentDpr
  if (cssWidth <= 0 || cssHeight <= 0) return null

  const videoWidth = videoElement.videoWidth || 1
  const videoHeight = videoElement.videoHeight || 1
  const scale = Math.min(cssWidth / videoWidth, cssHeight / videoHeight)
  const drawnVideoWidth = videoWidth * scale
  const drawnVideoHeight = videoHeight * scale

  return {
    cssWidth,
    cssHeight,
    videoWidth,
    videoHeight,
    scale,
    offsetX: (cssWidth - drawnVideoWidth) / 2,
    offsetY: (cssHeight - drawnVideoHeight) / 2,
  }
}

const isPointInsideRenderedVideo = (point, metrics) => {
  if (!point || !metrics) return false
  const maxX = metrics.offsetX + metrics.videoWidth * metrics.scale
  const maxY = metrics.offsetY + metrics.videoHeight * metrics.scale
  return point.x >= metrics.offsetX && point.x <= maxX && point.y >= metrics.offsetY && point.y <= maxY
}

const getHitRadius = () => {
  const host = screenRef.value
  const width = host?.clientWidth || window.innerWidth
  const height = host?.clientHeight || window.innerHeight
  return Math.min(84, Math.max(36, Math.min(width, height) * 0.05))
}

const findNearestVisibleLandmark = (landmarks, clickPoint, metrics) => {
  let nearest = null

  landmarks.forEach((landmark, index) => {
    if (!isLandmarkVisible(landmark)) return
    const point = mapLandmarkToCanvas(landmark, metrics)
    const distance = Math.hypot(clickPoint.x - point.x, clickPoint.y - point.y)
    if (!nearest || distance < nearest.distance) {
      nearest = { index, point, distance }
    }
  })

  return nearest
}

const resolveLandmarkMeta = (index) => {
  return POSE_LANDMARK_META[index] || { id: `landmark_${index}`, label: `关节${index}` }
}

const isLandmarkVisible = (landmark) => {
  if (!landmark) return false
  const visibility = Number.isFinite(landmark.visibility) ? landmark.visibility : 1
  const presence = Number.isFinite(landmark.presence) ? landmark.presence : 1
  return visibility >= landmarkVisibilityThreshold.value && presence >= landmarkPresenceThreshold.value
}

const mapLandmarkToCanvas = (landmark, metrics) => {
  const vx = landmark.x * metrics.videoWidth
  const vy = landmark.y * metrics.videoHeight
  return {
    x: metrics.offsetX + vx * metrics.scale,
    y: metrics.offsetY + vy * metrics.scale,
  }
}

const drawPoseResult = (result, videoElement) => {
  const canvas = poseCanvasRef.value
  if (!canvas) return
  const context = canvas.getContext('2d')
  if (!context) return

  const metrics = getVideoRenderMetrics(videoElement, canvas)
  if (!metrics) return
  context.clearRect(0, 0, metrics.cssWidth, metrics.cssHeight)
  if (!showPoseOverlay.value) return

  const landmarkSets = Array.isArray(result?.landmarks) ? result.landmarks : []
  if (landmarkSets.length === 0) return

  landmarkSets.forEach((landmarks) => {
    context.strokeStyle = 'rgba(43, 230, 255, 0.95)'
    context.lineWidth = 2.25

    POSE_CONNECTIONS.forEach(([startIndex, endIndex]) => {
      const start = landmarks[startIndex]
      const end = landmarks[endIndex]
      if (!isLandmarkVisible(start) || !isLandmarkVisible(end)) return

      const a = mapLandmarkToCanvas(start, metrics)
      const b = mapLandmarkToCanvas(end, metrics)
      context.beginPath()
      context.moveTo(a.x, a.y)
      context.lineTo(b.x, b.y)
      context.stroke()
    })

    context.fillStyle = 'rgba(255, 190, 61, 0.98)'
    landmarks.forEach((landmark) => {
      if (!isLandmarkVisible(landmark)) return
      const point = mapLandmarkToCanvas(landmark, metrics)
      context.beginPath()
      context.arc(point.x, point.y, 3.2, 0, Math.PI * 2)
      context.fill()
    })

    if (highlightedJoint && highlightedJoint.expiresAt > performance.now()) {
      const highlightedLandmark = landmarks[highlightedJoint.index]
      if (isLandmarkVisible(highlightedLandmark)) {
        const highlightedPoint = mapLandmarkToCanvas(highlightedLandmark, metrics)
        context.beginPath()
        context.arc(highlightedPoint.x, highlightedPoint.y, 10, 0, Math.PI * 2)
        context.strokeStyle = 'rgba(255, 82, 82, 0.96)'
        context.lineWidth = 3
        context.stroke()
      }
    } else {
      highlightedJoint = null
    }
  })
}

const stopPoseLoop = () => {
  if (!rafId) return
  cancelAnimationFrame(rafId)
  rafId = 0
}

const runPoseLoop = () => {
  stopPoseLoop()

  const tick = () => {
    rafId = requestAnimationFrame(tick)

    const videoElement = videoRef.value
    if (!poseLandmarker || !videoElement) return
    if (videoElement.readyState < 2 || videoElement.paused || videoElement.ended) return
    const now = performance.now()
    if (now - lastInferenceTs < poseDetectIntervalMs.value) return
    if (videoElement.currentTime === lastVideoTime) return

    lastInferenceTs = now
    lastVideoTime = videoElement.currentTime
    const result = poseLandmarker.detectForVideo(videoElement, now)
    const currentLandmarks = Array.isArray(result?.landmarks) ? result.landmarks[0] : null
    if (Array.isArray(currentLandmarks) && currentLandmarks.length > 0) {
      latestLandmarks = currentLandmarks
    }
    drawPoseResult(result, videoElement)
  }

  tick()
}

const ensurePoseLandmarker = async () => {
  const desiredConfig = getPoseLandmarkerConfigSnapshot()
  const desiredConfigKey = getPoseLandmarkerConfigKey(desiredConfig)
  if (poseLandmarker && poseLandmarkerConfigKey === desiredConfigKey) return

  if (poseLandmarkerLoadingTask) {
    await poseLandmarkerLoadingTask
    const nextDesiredKey = getPoseLandmarkerConfigKey(getPoseLandmarkerConfigSnapshot())
    if (poseLandmarker && poseLandmarkerConfigKey === nextDesiredKey) {
      return
    }
  }

  if (poseLandmarker && poseLandmarkerConfigKey !== desiredConfigKey) {
    disposePoseLandmarker()
  }

  const loadConfig = getPoseLandmarkerConfigSnapshot()
  const loadConfigKey = getPoseLandmarkerConfigKey(loadConfig)
  const modelUrls = getPoseModelUrlsForVariant(loadConfig.modelVariant)
  const sources = [
    {
      label: `本地资源/${modelUrls.normalized}`,
      wasmUrl: LOCAL_POSE_WASM_URL,
      modelUrl: modelUrls.local,
    },
    {
      label: `远程资源/${modelUrls.normalized}`,
      wasmUrl: REMOTE_POSE_WASM_URL,
      modelUrl: modelUrls.remote,
    },
  ]

  const loadingTask = (async () => {
    isModelLoading = true
    poseError.value = ''
    poseStatus.value = `MediaPipe 模型加载中（${modelUrls.normalized} / ${loadConfig.delegate}）...`
    let lastErrorMessage = ''

    try {
      for (let index = 0; index < sources.length; index += 1) {
        const source = sources[index]
        try {
          poseStatus.value = `MediaPipe 模型加载中（${source.label}，${loadConfig.delegate}）...`
          const created = await createPoseLandmarkerForSource({
            sourceLabel: source.label,
            wasmUrl: source.wasmUrl,
            modelUrl: source.modelUrl,
            config: loadConfig,
          })
          poseLandmarker = created.landmarker
          poseLandmarkerConfigKey = loadConfigKey
          poseError.value = ''
          poseStatus.value = `模型已就绪（${source.label}，${created.runtimeDelegate}）`
          return
        } catch (error) {
          lastErrorMessage = error instanceof Error ? error.message : String(error)
          console.warn('[face-to-face] pose source failed', {
            source: source.label,
            error: lastErrorMessage,
          })
        }
      }

      throw new Error(lastErrorMessage || '所有模型源都加载失败')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      poseError.value = `模型加载失败：${message}`
      poseStatus.value = '模型不可用'
      disposePoseLandmarker()
    } finally {
      isModelLoading = false
    }
  })()

  poseLandmarkerLoadingTask = loadingTask
  try {
    await loadingTask
  } finally {
    if (poseLandmarkerLoadingTask === loadingTask) {
      poseLandmarkerLoadingTask = null
    }
  }

  const latestDesiredKey = getPoseLandmarkerConfigKey(getPoseLandmarkerConfigSnapshot())
  if (poseLandmarker && poseLandmarkerConfigKey !== latestDesiredKey) {
    disposePoseLandmarker()
    await ensurePoseLandmarker()
  }
}

const startPoseForCurrentVideo = async () => {
  const token = ++startToken
  stopPoseLoop()
  clearPoseCanvas()
  lastVideoTime = -1
  lastInferenceTs = 0
  latestLandmarks = null
  highlightedJoint = null

  if (!videoUrl.value) {
    poseStatus.value = '待上传视频'
    clickResult.value = selectedCharacter.value
      ? '点击视频区域可识别关节'
      : '请先绑定世界书 CHAR，再点击视频区域识别关节'
    if (selectedCharacter.value) {
      const bindingKey = getCurrentBindingCacheKey()
      jointDialogueStatus.value = jointDialogueCache.has(bindingKey)
        ? `关节台词已加载（${selectedCharacter.value.label}）`
        : '关节台词待生成（上传视频后自动触发）'
      jointDialogueError.value = ''
    }
    setDialogueGuidance()
    syncJointVoiceStatusForCurrentBinding()
    return
  }

  if (!hasSelectedCharacter()) {
    setDialogueGuidance()
    return
  }

  void ensureJointDialoguesForCurrentBinding({ trigger: 'video-load' })

  await ensurePoseLandmarker()
  if (token !== startToken || !poseLandmarker) return

  await nextTick()
  if (token !== startToken) return

  const videoElement = videoRef.value
  if (!videoElement) return

  const startTracking = async () => {
    if (token !== startToken) return
    resizePoseCanvas()
    try {
      await videoElement.play()
    } catch {
      // 部分环境可能会阻止自动播放，这里忽略并继续尝试检测。
    }
    poseStatus.value = `关节点识别中（角色：${selectedCharacter.value?.label || '未绑定'}，${poseDetectFps.value} FPS，${poseModelVariantLabel.value}/${poseDelegate.value}）`
    poseError.value = ''
    runPoseLoop()
  }

  if (videoElement.readyState >= 2) {
    await startTracking()
    return
  }

  videoElement.addEventListener('loadeddata', () => {
    void startTracking()
  }, { once: true })
}

const handleHitLayerClick = async (event) => {
  if (isMenuOpen.value) {
    isMenuOpen.value = false
    return
  }

  const screenPoint = getEventPointInScreen(event)
  spawnClickSparkleAtPoint(screenPoint)

  if (!videoUrl.value) {
    clickResult.value = '请先上传视频'
    return
  }

  if (!hasSelectedCharacter()) {
    return
  }

  await ensurePoseLandmarker()
  if (!poseLandmarker) {
    clickResult.value = '模型未就绪，无法识别'
    return
  }

  const videoElement = videoRef.value
  const canvas = poseCanvasRef.value
  if (!videoElement || !canvas || videoElement.readyState < 2) {
    clickResult.value = '视频尚未准备完成'
    return
  }

  const metrics = getVideoRenderMetrics(videoElement, canvas)
  if (!metrics) {
    clickResult.value = '画布尺寸异常，无法识别'
    return
  }

  const rect = canvas.getBoundingClientRect()
  const clickPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
  if (!isPointInsideRenderedVideo(clickPoint, metrics)) {
    clickResult.value = '请点击视频画面区域（黑边不识别）'
    highlightedJoint = null
    return
  }

  let landmarks = null
  let source = 'fresh'
  let freshLandmarks = null
  try {
    const freshResult = poseLandmarker.detectForVideo(videoElement, performance.now())
    freshLandmarks = Array.isArray(freshResult?.landmarks) ? freshResult.landmarks[0] : null
  } catch (error) {
    console.warn('[face-to-face] click detect failed', error)
  }

  if (Array.isArray(freshLandmarks) && freshLandmarks.length > 0) {
    landmarks = freshLandmarks
    latestLandmarks = freshLandmarks
  } else if (Array.isArray(latestLandmarks) && latestLandmarks.length > 0) {
    landmarks = latestLandmarks
    source = 'fallback'
  }

  if (!Array.isArray(landmarks) || landmarks.length === 0) {
    clickResult.value = '当前帧未检测到人体关节'
    return
  }

  const nearest = findNearestVisibleLandmark(landmarks, clickPoint, metrics)
  if (!nearest) {
    clickResult.value = '当前帧关节置信度较低'
    return
  }

  const hitRadius = getHitRadius()
  const distance = Math.round(nearest.distance)
  if (nearest.distance > hitRadius) {
    clickResult.value = `未命中关节（最近 ${distance}px，阈值 ${Math.round(hitRadius)}px）`
    highlightedJoint = null
    return
  }

  const joint = resolveLandmarkMeta(nearest.index)
  const boundCharacter = selectedCharacter.value
  const bindingKeyAtClick = getCurrentBindingCacheKey()
  highlightedJoint = {
    index: nearest.index,
    expiresAt: performance.now() + 700,
  }
  clickResult.value = `点击命中：${joint.label}（${joint.id}，${distance}px）@ ${boundCharacter?.label || '未绑定角色'}`

  let dialogueMap = bindingKeyAtClick ? jointDialogueCache.get(bindingKeyAtClick) : null
  if (!dialogueMap && bindingKeyAtClick) {
    const generated = await ensureJointDialoguesForCurrentBinding({
      trigger: 'joint-click',
    })
    if (generated.success && getCurrentBindingCacheKey() === bindingKeyAtClick) {
      dialogueMap = jointDialogueCache.get(bindingKeyAtClick) || generated.jointDialogues
    }
  }

  const mappedLine = String(dialogueMap?.[joint.id] || '').trim()
  dialogueSpeaker.value = boundCharacter?.label || '角色'
  dialogueText.value = mappedLine || buildFallbackJointDialogue(joint)
  if (mappedLine && bindingKeyAtClick) {
    void playJointVoiceForJointLine({
      bindingKey: bindingKeyAtClick,
      jointId: joint.id,
      text: mappedLine,
      character: boundCharacter,
    })
  }

  drawPoseResult({ landmarks: [landmarks] }, videoElement)
  console.log('[face-to-face] joint-click', {
    worldBookId: selectedWorldBookId.value,
    worldBookTitle: selectedWorldBook.value?.title || '',
    characterId: boundCharacter?.id || '',
    characterName: boundCharacter?.label || '',
    jointId: joint.id,
    jointLabel: joint.label,
    distance,
    source,
    clickPoint,
    jointPoint: nearest.point,
  })
}

const handleVideoChange = (event) => {
  const file = event?.target?.files?.[0]
  if (!file) return

  stopJointAudioPlayback()
  clearVideoUrl()
  videoUrl.value = URL.createObjectURL(file)
  selectedFileName.value = file.name
  poseStatus.value = selectedCharacter.value
    ? `视频已加载，准备识别（角色：${selectedCharacter.value.label}）...`
    : '视频已加载，请先绑定世界书 CHAR'
  poseError.value = ''
  clickResult.value = selectedCharacter.value
    ? '点击视频区域可识别关节'
    : '请先绑定世界书 CHAR，再点击视频区域识别关节'
  if (selectedCharacter.value) {
    const bindingKey = getCurrentBindingCacheKey()
    jointDialogueStatus.value = jointDialogueCache.has(bindingKey)
      ? `关节台词已加载（${selectedCharacter.value.label}）`
      : `视频已加载，准备生成关节台词（${selectedCharacter.value.label}）...`
    jointDialogueError.value = ''
    syncJointVoiceStatusForCurrentBinding({
      pendingMessage: `视频已加载，准备生成关节语音（${selectedCharacter.value.label}）...`,
    })
  } else {
    jointDialogueStatus.value = '关节台词未生成'
    jointDialogueError.value = ''
    jointVoiceStatus.value = '关节语音未生成'
    jointVoiceError.value = ''
  }
  latestLandmarks = null
  highlightedJoint = null
  setDialogueGuidance()

  // 允许重复选择同一个文件并触发 change
  event.target.value = ''
}

watch(videoUrl, () => {
  void startPoseForCurrentVideo()
})

watch(selectedWorldBookId, () => {
  jointVoiceRequestToken += 1
  stopJointAudioPlayback()
  ensureCharacterSelectionForCurrentWorldBook()
  latestLandmarks = null
  highlightedJoint = null
  jointDialogueError.value = ''
  jointVoiceError.value = ''
  if (!videoUrl.value) {
    if (selectedCharacter.value) {
      poseStatus.value = `已绑定角色：${selectedCharacter.value.label}`
      clickResult.value = '点击视频区域可识别关节'
      const bindingKey = getCurrentBindingCacheKey()
      jointDialogueStatus.value = jointDialogueCache.has(bindingKey)
        ? `关节台词已加载（${selectedCharacter.value.label}）`
        : '关节台词待生成（上传视频后自动触发）'
      setDialogueGuidance()
      syncJointVoiceStatusForCurrentBinding()
    } else {
      hasSelectedCharacter()
      jointDialogueStatus.value = '关节台词未生成'
      setDialogueGuidance()
      syncJointVoiceStatusForCurrentBinding()
    }
    return
  }
  if (selectedCharacter.value) {
    const bindingKey = getCurrentBindingCacheKey()
    jointDialogueStatus.value = jointDialogueCache.has(bindingKey)
      ? `关节台词已加载（${selectedCharacter.value.label}）`
      : `角色已切换，准备生成关节台词（${selectedCharacter.value.label}）...`
    syncJointVoiceStatusForCurrentBinding({
      pendingMessage: `角色已切换，准备生成关节语音（${selectedCharacter.value.label}）...`,
    })
  } else {
    syncJointVoiceStatusForCurrentBinding()
  }
  setDialogueGuidance()
  void startPoseForCurrentVideo()
})

watch(selectedCharacterId, () => {
  jointVoiceRequestToken += 1
  stopJointAudioPlayback()
  latestLandmarks = null
  highlightedJoint = null
  jointDialogueError.value = ''
  jointVoiceError.value = ''
  if (selectedCharacter.value) {
    if (!videoUrl.value) {
      poseStatus.value = `已绑定角色：${selectedCharacter.value.label}`
      clickResult.value = '点击视频区域可识别关节'
      const bindingKey = getCurrentBindingCacheKey()
      jointDialogueStatus.value = jointDialogueCache.has(bindingKey)
        ? `关节台词已加载（${selectedCharacter.value.label}）`
        : '关节台词待生成（上传视频后自动触发）'
      setDialogueGuidance()
      syncJointVoiceStatusForCurrentBinding()
      return
    }
    poseStatus.value = `角色已切换：${selectedCharacter.value.label}，准备识别...`
    clickResult.value = '点击视频区域可识别关节'
    const bindingKey = getCurrentBindingCacheKey()
    jointDialogueStatus.value = jointDialogueCache.has(bindingKey)
      ? `关节台词已加载（${selectedCharacter.value.label}）`
      : `角色已切换，准备生成关节台词（${selectedCharacter.value.label}）...`
    setDialogueGuidance()
    syncJointVoiceStatusForCurrentBinding({
      pendingMessage: `角色已切换，准备生成关节语音（${selectedCharacter.value.label}）...`,
    })
    void startPoseForCurrentVideo()
    return
  }

  hasSelectedCharacter()
  jointDialogueStatus.value = '关节台词未生成'
  setDialogueGuidance()
  syncJointVoiceStatusForCurrentBinding()
})

watch(poseDetectFps, (value) => {
  const nextFps = clampPoseDetectFps(value)
  if (nextFps !== value) {
    poseDetectFps.value = nextFps
    return
  }
  if (videoUrl.value && selectedCharacter.value) {
    poseStatus.value = `关节点识别中（角色：${selectedCharacter.value.label}，${nextFps} FPS，${poseModelVariantLabel.value}/${poseDelegate.value}）`
  }
})

watch(emotionDetectFps, (value) => {
  const nextFps = clampEmotionDetectFps(value)
  if (nextFps !== value) {
    emotionDetectFps.value = nextFps
    return
  }
  if (cameraPreviewEnabled.value && emotionDetectionEnabled.value && !emotionError.value) {
    emotionStatus.value = `情绪识别中（${humanBackendInUse || 'auto'}，${nextFps} FPS）...`
  }
})

watch(emotionDetectionEnabled, (enabled) => {
  if (!enabled) {
    stopEmotionDetection()
    emotionStatus.value = '情绪识别已关闭'
    return
  }

  emotionError.value = ''
  if (!cameraPreviewEnabled.value) {
    emotionStatus.value = '等待开启相机后开始情绪识别'
    return
  }
  void startEmotionDetection()
})

watch(
  [poseModelVariant, poseDelegate, minPoseDetectionConfidence, minPosePresenceConfidence, minTrackingConfidence],
  ([variant, delegate, det, presence, tracking], [prevVariant, prevDelegate, prevDet, prevPresence, prevTracking]) => {
    const normalizedVariant = normalizePoseModelVariant(variant)
    const normalizedDelegate = normalizePoseDelegate(delegate)
    const nextDet = clampUnitThreshold(det, 0.5)
    const nextPresence = clampUnitThreshold(presence, 0.5)
    const nextTracking = clampUnitThreshold(tracking, 0.5)

    const needsNormalize = (
      normalizedVariant !== variant
      || normalizedDelegate !== delegate
      || nextDet !== det
      || nextPresence !== presence
      || nextTracking !== tracking
    )
    if (needsNormalize) {
      poseModelVariant.value = normalizedVariant
      poseDelegate.value = normalizedDelegate
      minPoseDetectionConfidence.value = nextDet
      minPosePresenceConfidence.value = nextPresence
      minTrackingConfidence.value = nextTracking
      return
    }

    const noDiff = (
      variant === prevVariant
      && delegate === prevDelegate
      && det === prevDet
      && presence === prevPresence
      && tracking === prevTracking
    )
    if (noDiff) return

    disposePoseLandmarker()
    if (videoUrl.value && selectedCharacter.value) {
      poseStatus.value = `参数已更新，重建模型中（${poseModelVariantLabel.value}/${poseDelegate.value}）...`
      void startPoseForCurrentVideo()
    }
  },
)

watch(
  [landmarkVisibilityThreshold, landmarkPresenceThreshold],
  ([visibility, presence], [prevVisibility, prevPresence]) => {
    const nextVisibility = clampUnitThreshold(visibility, 0.35)
    const nextPresence = clampUnitThreshold(presence, 0.35)
    const needsNormalize = nextVisibility !== visibility || nextPresence !== presence
    if (needsNormalize) {
      landmarkVisibilityThreshold.value = nextVisibility
      landmarkPresenceThreshold.value = nextPresence
      return
    }

    if (visibility === prevVisibility && presence === prevPresence) return
    if (videoUrl.value && selectedCharacter.value) {
      poseStatus.value = `可见性阈值已更新（vis ${visibility.toFixed(2)} / presence ${presence.toFixed(2)}）`
    }
    if (latestLandmarks && videoRef.value) {
      drawPoseResult({ landmarks: [latestLandmarks] }, videoRef.value)
    }
  },
)

watch(showPoseOverlay, (visible) => {
  if (!visible) {
    clearPoseCanvas()
    return
  }
  if (latestLandmarks && videoRef.value) {
    drawPoseResult({ landmarks: [latestLandmarks] }, videoRef.value)
  }
})

onMounted(() => {
  void loadWorldBookCharacterOptions()
  ensureCameraPreviewInitialPosition({ force: true })
  resizePoseCanvas()
  window.addEventListener('resize', resizePoseCanvas)
  window.addEventListener('pointermove', handleWindowPointerMove)
  window.addEventListener('pointerup', handleWindowPointerUp)
  window.addEventListener('pointercancel', handleWindowPointerCancel)
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => {
      resizePoseCanvas()
    })
    if (screenRef.value) {
      resizeObserver.observe(screenRef.value)
    }
  }
})

onBeforeUnmount(() => {
  startToken += 1
  jointDialogueRequestToken += 1
  jointVoiceRequestToken += 1
  stopPoseLoop()
  clearPoseCanvas()
  window.removeEventListener('resize', resizePoseCanvas)
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('pointerup', handleWindowPointerUp)
  window.removeEventListener('pointercancel', handleWindowPointerCancel)

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  disposePoseLandmarker()
  poseLandmarkerLoadingTask = null

  clearAllClickSparkles()
  closeCameraPreview()
  stopEmotionDetection({ preserveStatus: true })
  humanEngine = null
  humanLoadingTask = null
  humanBackendInUse = ''
  stopJointAudioPlayback()
  jointDialogueInFlight.clear()
  jointVoiceInFlight.clear()
  jointVoiceCache.clear()
  clearVideoUrl()
})
</script>

<template>
  <main ref="screenRef" class="face-to-face-screen" role="main">
    <input
      ref="videoInputRef"
      type="file"
      accept="video/*"
      class="video-input"
      @change="handleVideoChange"
    >

    <section class="video-background" aria-label="背景视频区域">
      <video
        v-if="videoUrl"
        ref="videoRef"
        :key="videoUrl"
        :src="videoUrl"
        autoplay
        muted
        loop
        playsinline
        preload="metadata"
      />
      <div v-else class="video-empty-state">
        <p class="empty-title">面对面模式</p>
        <p class="empty-subtitle">点击左上角菜单上传本地视频作为全屏背景</p>
      </div>
    </section>

    <canvas ref="poseCanvasRef" class="pose-canvas" aria-hidden="true" />
    <div class="hit-layer" @click="handleHitLayerClick" />
    <div class="click-sparkle-layer" aria-hidden="true">
      <span
        v-for="sparkle in clickSparkles"
        :key="sparkle.id"
        class="click-sparkle"
        :style="{
          left: `${sparkle.x}px`,
          top: `${sparkle.y}px`,
          '--sparkle-rotation': `${sparkle.rotation}deg`,
          '--sparkle-scale': sparkle.scale,
        }"
      >✨</span>
    </div>
    <section
      v-if="cameraPreviewEnabled"
      ref="cameraPreviewRef"
      class="camera-preview"
      :class="{ dragging: cameraPreviewDragging }"
      :style="cameraPreviewStyle"
      aria-label="实时相机预览"
      @pointerdown="handleCameraPreviewPointerDown"
    >
      <video
        ref="cameraPreviewVideoRef"
        class="camera-preview-video"
        autoplay
        muted
        playsinline
      />
      <p class="camera-preview-tag">{{ cameraPreviewEmotionTag }}</p>
    </section>

    <header class="menu-anchor">
      <button
        type="button"
        class="menu-toggle"
        :aria-expanded="isMenuOpen ? 'true' : 'false'"
        aria-label="展开操作菜单"
        @click.stop="toggleMenu"
      >
        <span class="menu-toggle-bar" />
        <span class="menu-toggle-bar" />
        <span class="menu-toggle-bar" />
      </button>
      <section v-if="isMenuOpen" class="menu-panel" aria-label="面对面菜单">
        <p class="menu-section-title">面对面菜单</p>
        <section class="character-binding-panel" aria-label="世界书角色绑定">
          <p class="binding-title">模型绑定角色（世界书 CHAR）</p>
          <label class="binding-field">
            <span>世界书</span>
            <select
              class="binding-select"
              :value="selectedWorldBookId"
              @change="handleWorldBookChange"
            >
              <option
                v-for="book in worldBooks"
                :key="book.id"
                :value="book.id"
              >
                {{ book.title }}
              </option>
            </select>
          </label>
          <label class="binding-field">
            <span>CHAR</span>
            <select
              class="binding-select"
              :value="selectedCharacterId"
              :disabled="worldBookCharacters.length === 0"
              @change="handleCharacterChange"
            >
              <option
                v-if="worldBookCharacters.length === 0"
                value=""
              >
                当前世界书暂无 CHAR
              </option>
              <option
                v-for="character in worldBookCharacters"
                :key="character.id"
                :value="character.id"
              >
                {{ character.label }}
              </option>
            </select>
          </label>
        </section>
        <section class="debug-panel" aria-label="调试设置">
          <p class="debug-title">调试接口</p>
          <label class="debug-toggle-row">
            <span>显示关节点骨架</span>
            <input
              class="debug-toggle"
              type="checkbox"
              :checked="showPoseOverlay"
              @change="handleShowPoseOverlayChange"
            >
          </label>
          <label class="debug-field">
            <span>模型档位</span>
            <select class="debug-select" :value="poseModelVariant" @change="handlePoseModelVariantChange">
              <option value="lite">LITE（更快）</option>
              <option value="full">FULL（更准）</option>
              <option value="heavy">HEAVY（最稳/最慢）</option>
            </select>
          </label>
          <label class="debug-field">
            <span>推理委托</span>
            <select class="debug-select" :value="poseDelegate" @change="handlePoseDelegateChange">
              <option value="GPU">GPU（优先）</option>
              <option value="CPU">CPU（稳定）</option>
            </select>
          </label>
          <label class="debug-field">
            <span>检测 FPS</span>
            <div class="debug-fps-row">
              <input
                class="debug-fps-range"
                type="range"
                :min="POSE_FPS_MIN"
                :max="POSE_FPS_MAX"
                :value="poseDetectFps"
                @input="handlePoseDetectFpsChange"
              >
              <input
                class="debug-fps-number"
                type="number"
                :min="POSE_FPS_MIN"
                :max="POSE_FPS_MAX"
                :value="poseDetectFps"
                @input="handlePoseDetectFpsChange"
              >
            </div>
          </label>
          <label class="debug-field">
            <span>minPoseDetectionConfidence</span>
            <div class="debug-threshold-row">
              <input
                class="debug-fps-range"
                type="range"
                :min="POSE_CONFIDENCE_MIN"
                :max="POSE_CONFIDENCE_MAX"
                :step="POSE_CONFIDENCE_STEP"
                :value="minPoseDetectionConfidence"
                @input="handleMinPoseDetectionConfidenceChange"
              >
              <input
                class="debug-threshold-number"
                type="number"
                :min="POSE_CONFIDENCE_MIN"
                :max="POSE_CONFIDENCE_MAX"
                :step="POSE_CONFIDENCE_STEP"
                :value="minPoseDetectionConfidence"
                @input="handleMinPoseDetectionConfidenceChange"
              >
            </div>
          </label>
          <label class="debug-field">
            <span>minPosePresenceConfidence</span>
            <div class="debug-threshold-row">
              <input
                class="debug-fps-range"
                type="range"
                :min="POSE_CONFIDENCE_MIN"
                :max="POSE_CONFIDENCE_MAX"
                :step="POSE_CONFIDENCE_STEP"
                :value="minPosePresenceConfidence"
                @input="handleMinPosePresenceConfidenceChange"
              >
              <input
                class="debug-threshold-number"
                type="number"
                :min="POSE_CONFIDENCE_MIN"
                :max="POSE_CONFIDENCE_MAX"
                :step="POSE_CONFIDENCE_STEP"
                :value="minPosePresenceConfidence"
                @input="handleMinPosePresenceConfidenceChange"
              >
            </div>
          </label>
          <label class="debug-field">
            <span>minTrackingConfidence</span>
            <div class="debug-threshold-row">
              <input
                class="debug-fps-range"
                type="range"
                :min="POSE_CONFIDENCE_MIN"
                :max="POSE_CONFIDENCE_MAX"
                :step="POSE_CONFIDENCE_STEP"
                :value="minTrackingConfidence"
                @input="handleMinTrackingConfidenceChange"
              >
              <input
                class="debug-threshold-number"
                type="number"
                :min="POSE_CONFIDENCE_MIN"
                :max="POSE_CONFIDENCE_MAX"
                :step="POSE_CONFIDENCE_STEP"
                :value="minTrackingConfidence"
                @input="handleMinTrackingConfidenceChange"
              >
            </div>
          </label>
          <label class="debug-field">
            <span>landmark visibility threshold</span>
            <div class="debug-threshold-row">
              <input
                class="debug-fps-range"
                type="range"
                :min="LANDMARK_THRESHOLD_MIN"
                :max="LANDMARK_THRESHOLD_MAX"
                :step="LANDMARK_THRESHOLD_STEP"
                :value="landmarkVisibilityThreshold"
                @input="handleLandmarkVisibilityThresholdChange"
              >
              <input
                class="debug-threshold-number"
                type="number"
                :min="LANDMARK_THRESHOLD_MIN"
                :max="LANDMARK_THRESHOLD_MAX"
                :step="LANDMARK_THRESHOLD_STEP"
                :value="landmarkVisibilityThreshold"
                @input="handleLandmarkVisibilityThresholdChange"
              >
            </div>
          </label>
          <label class="debug-field">
            <span>landmark presence threshold</span>
            <div class="debug-threshold-row">
              <input
                class="debug-fps-range"
                type="range"
                :min="LANDMARK_THRESHOLD_MIN"
                :max="LANDMARK_THRESHOLD_MAX"
                :step="LANDMARK_THRESHOLD_STEP"
                :value="landmarkPresenceThreshold"
                @input="handleLandmarkPresenceThresholdChange"
              >
              <input
                class="debug-threshold-number"
                type="number"
                :min="LANDMARK_THRESHOLD_MIN"
                :max="LANDMARK_THRESHOLD_MAX"
                :step="LANDMARK_THRESHOLD_STEP"
                :value="landmarkPresenceThreshold"
                @input="handleLandmarkPresenceThresholdChange"
              >
            </div>
          </label>
          <p class="debug-note">{{ poseDetectDebugLabel }}</p>
          <p class="debug-note">{{ poseDebugSummaryLabel }}</p>
        </section>
        <section class="camera-control-panel" aria-label="相机预览控制">
          <p class="debug-title">相机预览</p>
          <button type="button" class="camera-toggle-button" @click="toggleCameraPreview">
            {{ cameraPreviewEnabled ? '关闭相机预览' : '开启相机预览' }}
          </button>
          <p class="pose-status" :class="{ error: cameraPreviewError }">{{ cameraPreviewError || cameraPreviewStatus }}</p>
          <label class="debug-toggle-row">
            <span>开启情绪识别</span>
            <input
              class="debug-toggle"
              type="checkbox"
              :checked="emotionDetectionEnabled"
              @change="handleEmotionDetectionToggleChange"
            >
          </label>
          <label class="debug-field">
            <span>情绪检测 FPS</span>
            <div class="debug-fps-row">
              <input
                class="debug-fps-range"
                type="range"
                :min="EMOTION_FPS_MIN"
                :max="EMOTION_FPS_MAX"
                :value="emotionDetectFps"
                @input="handleEmotionDetectFpsChange"
              >
              <input
                class="debug-fps-number"
                type="number"
                :min="EMOTION_FPS_MIN"
                :max="EMOTION_FPS_MAX"
                :value="emotionDetectFps"
                @input="handleEmotionDetectFpsChange"
              >
            </div>
          </label>
          <p class="debug-note">{{ emotionDetectDebugLabel }}</p>
          <p class="pose-status" :class="{ error: emotionError }">{{ emotionError || emotionStatus }}</p>
        </section>
        <button type="button" class="upload-button" @click="openVideoPicker">
          上传本地视频
        </button>
        <button type="button" class="back-button" @click="emit('back')">
          返回主菜单
        </button>
        <p class="video-file-name">{{ selectedFileName || '未选择视频文件' }}</p>
        <p class="pose-status" :class="{ error: poseError }">{{ poseError || poseStatus }}</p>
        <p class="pose-status" :class="{ error: jointDialogueError }">{{ jointDialogueError || jointDialogueStatus }}</p>
        <p class="pose-status" :class="{ error: jointVoiceError }">{{ jointVoiceError || jointVoiceStatus }}</p>
        <p class="click-result">{{ clickResult }}</p>
      </section>
    </header>

    <section class="ftf-dialogue-overlay" aria-label="对话框区域">
      <div class="ftf-dialogue-box">
        <p class="ftf-dialogue-speaker">{{ dialogueSpeaker }}</p>
        <p class="ftf-dialogue-text">{{ dialogueText }}</p>
      </div>
    </section>
  </main>
</template>

<style scoped src="./FaceToFaceScreen.css"></style>
