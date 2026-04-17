<script setup>
/**
 * PronunciationLessonView.vue - 课程页
 * 展示角色代入式讲解、单词/句子列表、TTS 播放、录音评分。
 */
import { ref, onMounted, computed } from 'vue'
import {
  loadNotebook,
  saveNotebook,
  addNotebookEntry,
} from '../composables/usePronunciationData.js'
import {
  storeAudioBlob,
  getAudioBlob,
} from '../storage/pronunciationAudioStore.js'
import { generateCharacterSpeech } from '../../../../src/llm/llmService.core.js'
import { loadSettings } from '../composables/usePronunciationData.js'
import PronunciationRecordingView from './PronunciationRecordingView.vue'

const props = defineProps({
  lesson: { type: Object, required: true },
})
const emit = defineEmits(['back', 'saved'])

const LANGUAGES = [
  { code: 'en', name: '英语', flag: '🇬🇧' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日语', flag: '🇯🇵' },
  { code: 'ko', name: '韩语', flag: '🇰🇷' },
  { code: 'fr', name: '法语', flag: '🇫🇷' },
  { code: 'de', name: '德语', flag: '🇩🇪' },
  { code: 'es', name: '西班牙语', flag: '🇪🇸' },
  { code: 'ru', name: '俄语', flag: '🇷🇺' },
]

const settings = ref({})
const isSaving = ref(false)
const isGeneratingTts = ref(null)
const playingItemId = ref(null)
const practicedItems = ref(new Set())

// 录音相关状态
const recordingItem = ref(null)
const currentRefAudio = ref(null) // 当前录音对比用的参考音频 Blob
const referenceAudioCache = ref({}) // itemId -> Uint8Array

// 确保每个 item 有唯一 id
const lessonItems = computed(() => {
  if (!props.lesson.items) return []
  return props.lesson.items.map((item, idx) => ({
    ...item,
    id: item.id || `item_${idx}_${item.text}`,
  }))
})

const words = computed(() => lessonItems.value.filter(i => i.type === 'word'))
const sentences = computed(() => lessonItems.value.filter(i => i.type === 'sentence'))

onMounted(async () => {
  settings.value = await loadSettings()
  if (props.lesson.fromNotebook) {
    for (const item of lessonItems.value) {
      if (item.score) {
        practicedItems.value.add(item.id)
      }
    }
    // 从笔记本加载时，预加载 TTS 音频
    for (const item of lessonItems.value) {
      const audioKey = getAudioKey(item.id)
      const audioData = await getAudioBlob(audioKey)
      if (audioData) {
        referenceAudioCache.value[item.id] = new Uint8Array(audioData)
      }
    }
  }
})

function getAudioKey(itemId) {
  return `pron_tts_${props.lesson.id}_${itemId}`
}

/**
 * 安全复制 Uint8Array 字节。
 * 参照 GameScreen.vue 的 cloneAudioBytes 实现。
 */
function cloneAudioBytes(bytes) {
  if (!bytes) return null
  try {
    return new Uint8Array(bytes)
  } catch {
    return null
  }
}

/**
 * 确保指定条目的 TTS 音频已生成并缓存。
 * 返回 { data: Uint8Array, mimeType: string } 或 null。
 */
async function ensureTtsAudio(item) {
  const audioKey = getAudioKey(item.id)

  // 调用 TTS
  isGeneratingTts.value = item.id
  try {
    const voiceId = settings.value.ttsVoiceId || ''
    const ttsResult = await generateCharacterSpeech({
      text: item.text,
      voiceConfig: voiceId ? { voiceId } : undefined,
    })

    if (!ttsResult.success) {
      throw new Error(ttsResult.error)
    }

    const audioBytes = cloneAudioBytes(ttsResult.audioBytes)
    if (!audioBytes || audioBytes.length === 0) {
      throw new Error('TTS 返回音频为空')
    }

    // 缓存到 IndexedDB
    await storeAudioBlob(audioKey, audioBytes.buffer)
    referenceAudioCache.value[item.id] = audioBytes
    return { data: audioBytes, mimeType: ttsResult.mimeType || 'audio/mpeg' }
  } finally {
    isGeneratingTts.value = null
  }
}

/**
 * 播放 TTS 音频（用户先听再跟读）。
 */
async function playTTS(item) {
  try {
    // 先检查 IndexedDB 缓存
    const audioKey = getAudioKey(item.id)
    let audioResult = null
    const cachedData = await getAudioBlob(audioKey)
    if (cachedData && cachedData.byteLength > 0) {
      audioResult = { data: new Uint8Array(cachedData), mimeType: 'audio/mpeg' }
    }

    // 缓存未命中，重新生成
    if (!audioResult) {
      audioResult = await ensureTtsAudio(item)
    }

    if (!audioResult || !audioResult.data) return

    playingItemId.value = item.id
    const { data: audioBytes, mimeType } = audioResult
    const blob = new Blob([audioBytes], { type: mimeType })
    if (blob.size === 0) {
      throw new Error('生成的音频 Blob 为空')
    }
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => { playingItemId.value = null; URL.revokeObjectURL(url) }
    audio.onerror = () => { playingItemId.value = null; URL.revokeObjectURL(url); throw new Error('浏览器无法播放此音频，可能格式不兼容') }
    await audio.play()
  } catch (e) {
    alert('TTS 播放失败：' + e.message)
  }
}

/**
 * 点击麦克风：先确保有参考音频，再打开录音。
 */
async function openRecording(item) {
  try {
    const voiceId = settings.value.ttsVoiceId || ''
    const ttsResult = await generateCharacterSpeech({
      text: item.text,
      voiceConfig: voiceId ? { voiceId } : undefined,
    })

    if (!ttsResult.success) {
      throw new Error(ttsResult.error)
    }

    const audioBytes = cloneAudioBytes(ttsResult.audioBytes)
    if (!audioBytes || audioBytes.length === 0) {
      throw new Error('无法生成参考音频')
    }

    const audioBlob = new Blob([audioBytes], { type: ttsResult.mimeType || 'audio/mpeg' })
    referenceAudioCache.value[item.id] = audioBytes
    recordingItem.value = item
    // 将音频 Blob 传递给录音视图
    currentRefAudio.value = audioBlob
  } catch (e) {
    alert('无法生成参考音频：' + e.message)
  }
}

function closeRecording() {
  recordingItem.value = null
  currentRefAudio.value = null
}

function onRecorded({ itemId, userAudioKey }) {
  practicedItems.value.add(itemId)
}

async function saveLesson() {
  isSaving.value = true
  try {
    const notebook = await loadNotebook()
    const entry = addNotebookEntry(notebook, {
      language: props.lesson.language,
      topic: props.lesson.topic,
      character: props.lesson.character,
      characterName: props.lesson.character?.name || '',
      intro: props.lesson.intro,
      items: lessonItems.value.map(item => ({
        ...item,
        practiced: practicedItems.value.has(item.id),
      })),
      practicedCount: practicedItems.value.size,
    })
    await saveNotebook(entry)
    emit('saved', entry[0])
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="pron-lesson">
    <!-- 课程信息 -->
    <div class="lesson-header">
      <div class="lesson-lang">{{ LANGUAGES.find(l => l.code === lesson.language)?.flag || '🌍' }} {{ lesson.language.toUpperCase() }}</div>
      <h2 class="lesson-topic">{{ lesson.topic }}</h2>
      <div v-if="lesson.character" class="lesson-teacher">
        <span>讲师：{{ lesson.character.name }}</span>
      </div>
    </div>

    <!-- 角色代入式讲解 -->
    <div v-if="lesson.intro" class="intro-section">
      <div class="intro-bubble">
        <p class="intro-text">{{ lesson.intro }}</p>
      </div>
    </div>

    <!-- 单词列表 -->
    <div v-if="words.length > 0" class="section">
      <h3 class="section-label">📝 词汇</h3>
      <div class="items-list">
        <div v-for="item in words" :key="item.id" class="item-card">
          <div class="item-content">
            <div class="item-text">{{ item.text }}</div>
            <div class="item-phonetic">{{ item.phonetic }}</div>
            <div class="item-meaning">{{ item.meaning }}</div>
          </div>
          <div class="item-actions">
            <button
              class="action-btn play-btn"
              :class="{ active: playingItemId === item.id, loading: isGeneratingTts === item.id }"
              @click="playTTS(item)"
            >
              <template v-if="isGeneratingTts === item.id">⏳</template>
              <template v-else-if="playingItemId === item.id">⏸</template>
              <template v-else>🔊</template>
            </button>
            <button
              class="action-btn mic-btn"
              :class="{ active: practicedItems.has(item.id) }"
              @click="openRecording(item)"
            >
              🎤
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 句子列表 -->
    <div v-if="sentences.length > 0" class="section">
      <h3 class="section-label">💬 句子</h3>
      <div class="items-list">
        <div v-for="item in sentences" :key="item.id" class="item-card item-card-long">
          <div class="item-content">
            <div class="item-text">{{ item.text }}</div>
            <div class="item-phonetic">{{ item.phonetic }}</div>
            <div class="item-meaning">{{ item.meaning }}</div>
          </div>
          <div class="item-actions">
            <button
              class="action-btn play-btn"
              :class="{ active: playingItemId === item.id, loading: isGeneratingTts === item.id }"
              @click="playTTS(item)"
            >
              <template v-if="isGeneratingTts === item.id">⏳</template>
              <template v-else-if="playingItemId === item.id">⏸</template>
              <template v-else>🔊</template>
            </button>
            <button
              class="action-btn mic-btn"
              :class="{ active: practicedItems.has(item.id) }"
              @click="openRecording(item)"
            >
              🎤
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部操作 -->
    <div class="lesson-footer">
      <button class="footer-btn secondary" @click="emit('back')">
        放弃
      </button>
      <button
        class="footer-btn primary"
        :disabled="isSaving"
        @click="saveLesson"
      >
        {{ isSaving ? '保存中...' : '💾 保存到笔记本' }}
      </button>
    </div>

    <!-- 录音弹窗 -->
    <PronunciationRecordingView
      v-if="recordingItem && currentRefAudio"
      :item="recordingItem"
      :reference-audio="currentRefAudio"
      :lesson-id="lesson.id"
      @close="closeRecording"
      @recorded="onRecorded"
    />
  </div>
</template>

<style scoped>
.pron-lesson {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 80px;
}

.lesson-header {
  text-align: center;
}

.lesson-lang {
  font-size: 0.8rem;
  color: #667eea;
  font-weight: 600;
}

.lesson-topic {
  font-size: 1.2rem;
  font-weight: 700;
  margin: 4px 0;
}

.lesson-teacher {
  font-size: 0.8rem;
  color: #888;
}

.intro-section {
  padding: 14px;
  background: rgba(102, 126, 234, 0.08);
  border-radius: 14px;
  border-left: 3px solid #667eea;
}

.intro-text {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: #ddd;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0;
  color: #ccc;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.item-card-long .item-text {
  font-size: 0.95rem;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-text {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 2px;
}

.item-phonetic {
  font-size: 0.75rem;
  color: #667eea;
  margin-bottom: 2px;
}

.item-meaning {
  font-size: 0.8rem;
  color: #888;
}

.item-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.action-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.play-btn {
  background: rgba(102, 126, 234, 0.2);
}

.play-btn:hover {
  background: rgba(102, 126, 234, 0.35);
}

.play-btn.active {
  background: rgba(102, 126, 234, 0.5);
}

.play-btn.loading {
  opacity: 0.5;
}

.mic-btn {
  background: rgba(52, 199, 89, 0.2);
}

.mic-btn:hover {
  background: rgba(52, 199, 89, 0.35);
}

.mic-btn.active {
  background: rgba(52, 199, 89, 0.4);
}

.lesson-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(15, 15, 26, 0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.footer-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.footer-btn.secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #ccc;
}

.footer-btn.primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

.footer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}


  .platform-android.android-portrait .footer-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }
</style>
