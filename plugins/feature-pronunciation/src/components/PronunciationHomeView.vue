<script setup>
/**
 * PronunciationHomeView.vue - 口语学习首页
 * 语言选择、角色选择、生成今日课程。
 */
import { ref, computed, onMounted } from 'vue'
import { loadSettings } from '../composables/usePronunciationData.js'
import { getGroupedContacts } from '../../../feature-phone/src/phone/composables/usePhoneData.js'
import { generatePronunciationLesson } from '../../../../src/llm/llmService.pronunciation.js'

const emit = defineEmits(['generate-lesson', 'open-notebook', 'open-settings'])

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

const TOPICS = [
  '日常问候',
  '餐厅点餐',
  '购物砍价',
  '旅行问路',
  '自我介绍',
  '天气讨论',
  '兴趣爱好',
  '工作面试',
]

const selectedLanguage = ref('en')
const selectedTopic = ref('')
const customTopic = ref('')
const selectedCharacter = ref(null)
const showCharacterPicker = ref(false)

const isGenerating = ref(false)
const error = ref('')

const contactGroups = ref([])

onMounted(async () => {
  const settings = await loadSettings()
  if (settings.preferredLanguage) {
    selectedLanguage.value = settings.preferredLanguage
  }
  contactGroups.value = await getGroupedContacts()
})

function toggleCharacterPicker() {
  showCharacterPicker.value = !showCharacterPicker.value
}

function onSelectCharacter(char) {
  selectedCharacter.value = char
  showCharacterPicker.value = false
}

function onSelectDefault() {
  selectedCharacter.value = null
  showCharacterPicker.value = false
}

async function generateLesson() {
  const topic = customTopic.value.trim() || selectedTopic.value
  if (!topic) {
    error.value = '请选择或输入一个学习主题'
    return
  }

  isGenerating.value = true
  error.value = ''

  const worldBook = selectedCharacter.value?._worldBook || null
  const result = await generatePronunciationLesson({
    language: selectedLanguage.value,
    topic,
    wordCount: 4,
    sentenceCount: 2,
    character: selectedCharacter.value || undefined,
    worldBook,
  })

  isGenerating.value = false

  if (!result.success) {
    error.value = result.error || '生成失败'
    return
  }

  emit('generate-lesson', {
    id: `lesson_${Date.now()}`,
    language: selectedLanguage.value,
    topic,
    character: selectedCharacter.value,
    worldBook,
    intro: result.intro,
    items: result.items.map((item, idx) => ({
      ...item,
      id: `item_${idx}_${item.text}_${Date.now()}`,
    })),
  })
}

const filteredGroups = computed(() => contactGroups.value)
const allCharacters = computed(() => contactGroups.value.flatMap(g => g.characters || []))

// 根据选中讲师生成推荐主题
const recommendedTopics = computed(() => {
  if (!selectedCharacter.value) return []
  const char = selectedCharacter.value
  const topics = []
  if (char.identity) topics.push(`关于${char.identity}的话题`)
  if (char.background) {
    const bg = char.background.slice(0, 10)
    topics.push(`${char.name}的故事`)
  }
  topics.push(`${char.name}的日常`)
  return topics.slice(0, 3)
})
</script>

<template>
  <div class="pron-home">
    <!-- 语言选择 -->
    <div class="section">
      <h3 class="section-title">选择语言</h3>
      <select v-model="selectedLanguage" class="lang-select">
        <option v-for="lang in LANGUAGES" :key="lang.code" :value="lang.code">
          {{ lang.flag }} {{ lang.name }}
        </option>
      </select>
    </div>

    <!-- 角色选择 -->
    <div class="section">
      <h3 class="section-title">讲师角色</h3>
      <div v-if="selectedCharacter" class="selected-char">
        <div class="char-avatar">
          <template v-if="selectedCharacter.portraits?.length > 0">
            <img :src="selectedCharacter.portraits[0]?.dataUrl || ''" :alt="selectedCharacter.name" />
          </template>
          <template v-else>
            {{ selectedCharacter.name?.charAt(0) || '?' }}
          </template>
        </div>
        <div class="char-info">
          <span class="char-name">{{ selectedCharacter.name }}</span>
          <span v-if="selectedCharacter.identity" class="char-identity">{{ selectedCharacter.identity }}</span>
        </div>
        <button class="char-change-btn" @click="toggleCharacterPicker">更换</button>
      </div>
      <button v-else class="select-char-btn" @click="toggleCharacterPicker">
        + 选择一位讲师角色（可选）
      </button>
    </div>

    <!-- 角色选择面板 -->
    <div v-if="showCharacterPicker" class="character-picker-overlay">
      <div class="character-picker-panel">
        <div class="picker-header">
          <h4>选择讲师</h4>
          <button class="picker-close" @click="showCharacterPicker = false">✕</button>
        </div>
        <div class="char-list">
          <div v-for="group in filteredGroups" :key="group.worldBookId" class="char-group">
            <span class="group-label">{{ group.worldBookTitle }}</span>
            <button
              v-for="char in group.characters"
              :key="char.id"
              class="char-item"
              @click="onSelectCharacter(char)"
            >
              <div class="char-item-avatar">
                <template v-if="char.portraits?.length > 0">
                  <img :src="char.portraits[0]?.dataUrl || ''" :alt="char.name" />
                </template>
                <template v-else>
                  {{ char.name?.charAt(0) || '?' }}
                </template>
              </div>
              <span class="char-item-name">{{ char.name }}</span>
            </button>
          </div>
          <button class="char-item default-char" @click="onSelectDefault">
            <div class="char-item-avatar default-avatar">🤖</div>
            <span class="char-item-name">不使用角色</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 学习主题 -->
    <div class="section">
      <h3 class="section-title">学习主题</h3>
      <!-- 讲师推荐主题 -->
      <div v-if="recommendedTopics.length > 0" class="recommended-topics">
        <span class="recommend-label">讲师推荐：</span>
        <button
          v-for="topic in recommendedTopics"
          :key="'rec_' + topic"
          class="topic-chip recommended"
          :class="{ active: selectedTopic === topic && !customTopic.trim() }"
          @click="selectedTopic = topic; customTopic = ''"
        >
          {{ topic }}
        </button>
      </div>
      <div class="topic-chips">
        <button
          v-for="topic in TOPICS"
          :key="topic"
          class="topic-chip"
          :class="{ active: selectedTopic === topic && !customTopic.trim() }"
          @click="selectedTopic = topic; customTopic = ''"
        >
          {{ topic }}
        </button>
      </div>
      <input
        v-model="customTopic"
        class="custom-topic-input"
        placeholder="或输入自定义主题..."
        @focus="selectedTopic = ''"
      />
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 生成按钮 -->
    <button
      class="generate-btn"
      :disabled="isGenerating"
      @click="generateLesson"
    >
      <template v-if="isGenerating">
        <span class="loading-spinner">⏳</span> 生成中...
      </template>
      <template v-else>
        ✨ 生成今日课程
      </template>
    </button>
  </div>
</template>

<style scoped>
.pron-home {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 0.85rem;
  color: #8b9dc3;
  margin: 0;
  font-weight: 600;
}

.lang-select {
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-size: 0.9rem;
  outline: none;
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
}

.lang-select option {
  background: #1a1a2e;
  color: #fff;
}

.lang-select:focus {
  border-color: #667eea;
}

.selected-char {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.char-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}

.char-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.char-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.char-name {
  font-size: 0.9rem;
  font-weight: 600;
}

.char-identity {
  font-size: 0.75rem;
  color: #888;
}

.char-change-btn {
  padding: 4px 10px;
  background: rgba(102, 126, 234, 0.2);
  border: none;
  border-radius: 8px;
  color: #667eea;
  font-size: 0.8rem;
  cursor: pointer;
}

.select-char-btn {
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: #888;
  font-size: 0.85rem;
  cursor: pointer;
}

.character-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 10002;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.character-picker-panel {
  width: 90%;
  max-width: 400px;
  max-height: 70vh;
  background: #1a1a2e;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.picker-header h4 {
  margin: 0;
  font-size: 1rem;
}

.picker-close {
  background: none;
  border: none;
  color: #888;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px;
}

.char-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.char-group {
  margin-bottom: 12px;
}

.group-label {
  font-size: 0.75rem;
  color: #667eea;
  font-weight: 600;
  display: block;
  margin-bottom: 6px;
  padding-left: 8px;
}

.char-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  background: none;
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
}

.char-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.char-item-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}

.char-item-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.char-item-name {
  font-size: 0.85rem;
}

.default-char .char-item-avatar {
  background: rgba(255, 255, 255, 0.1);
}

.recommended-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  padding: 8px 10px;
  background: rgba(102, 126, 234, 0.06);
  border-radius: 10px;
  border: 1px dashed rgba(102, 126, 234, 0.25);
}

.recommend-label {
  font-size: 0.75rem;
  color: #667eea;
  font-weight: 600;
}

.topic-chip.recommended {
  background: rgba(102, 126, 234, 0.12);
  border-color: rgba(102, 126, 234, 0.4);
  color: #a8b8ff;
}

.topic-chip.recommended.active {
  background: rgba(102, 126, 234, 0.25);
  border-color: #667eea;
  color: #fff;
}

.topic-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.topic-chip {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  color: #ccc;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.topic-chip.active {
  background: rgba(102, 126, 234, 0.2);
  border-color: #667eea;
  color: #fff;
}

.custom-topic-input {
  width: 100%;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
}

.custom-topic-input:focus {
  border-color: #667eea;
}

.custom-topic-input::placeholder {
  color: #555;
}

.error-msg {
  padding: 10px 14px;
  background: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.3);
  border-radius: 10px;
  color: #ff6b6b;
  font-size: 0.85rem;
}

.generate-btn {
  padding: 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 14px;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.generate-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.loading-spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}


  .platform-android.android-portrait .topic-chip,
  .platform-android.android-portrait .char-change-btn {
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
