<script setup>
/**
 * QuizTeachingSetupView.vue - 陪学设置页
 * 选择学习来源（自由主题 或 URL）+ 选择讲师 → 开始陪学。
 */
import { ref } from 'vue'
import QuizCharacterPicker from './QuizCharacterPicker.vue'

const emit = defineEmits(['back', 'start-teaching'])

const sourceType = ref('topic') // topic | url
const topicInput = ref('')
const urlInput = ref('')
const selectedCharacter = ref(null)
const useDefaultCharacter = ref(false)
const step = ref('source') // source | character

function selectCharacter(char) {
  selectedCharacter.value = char
  useDefaultCharacter.value = false
}

function selectDefault() {
  selectedCharacter.value = null
  useDefaultCharacter.value = true
}

function startTeaching() {
  const topic = sourceType.value === 'topic' ? topicInput.value.trim() : urlInput.value.trim()
  if (!topic) return

  emit('start-teaching', {
    type: sourceType.value,
    topic: sourceType.value === 'topic' ? topic : null,
    url: sourceType.value === 'url' ? topic : null,
    character: selectedCharacter.value,
    useDefault: useDefaultCharacter.value,
  })
}

const canProceed = ref(false)

function goToCharacterStep() {
  if (sourceType.value === 'topic' && !topicInput.value.trim()) return
  if (sourceType.value === 'url' && !urlInput.value.trim()) return
  step.value = 'character'
}
</script>

<template>
  <div class="teaching-setup">
    <h2 class="setup-title">🎓 设置陪学</h2>

    <!-- 选择学习来源 -->
    <div v-if="step === 'source'" class="setup-section">
      <h3 class="section-label">学习内容</h3>

      <!-- 来源切换 -->
      <div class="source-tabs">
        <button
          class="source-tab"
          :class="{ active: sourceType === 'topic' }"
          @click="sourceType = 'topic'"
        >
          💡 自由主题
        </button>
        <button
          class="source-tab"
          :class="{ active: sourceType === 'url' }"
          @click="sourceType = 'url'"
        >
          🔗 导入链接
        </button>
      </div>

      <!-- 自由主题输入 -->
      <div v-if="sourceType === 'topic'" class="input-area">
        <input
          v-model="topicInput"
          type="text"
          class="setup-input"
          placeholder="输入你想学习的主题..."
          @keyup.enter="goToCharacterStep"
        />
        <div class="topic-suggestions">
          <span class="suggestion-label">试试：</span>
          <button v-for="t in ['Python基础', '英语语法', '世界历史', '高等数学']" :key="t" class="suggestion-tag" @click="topicInput = t">
            {{ t }}
          </button>
        </div>
      </div>

      <!-- URL 输入 -->
      <div v-else class="input-area">
        <input
          v-model="urlInput"
          type="text"
          class="setup-input"
          placeholder="https://..."
          @keyup.enter="goToCharacterStep"
        />
      </div>

      <button
        class="next-btn"
        :disabled="sourceType === 'topic' ? !topicInput.trim() : !urlInput.trim()"
        @click="goToCharacterStep"
      >
        下一步：选择讲师 →
      </button>
    </div>

    <!-- 选择讲师 -->
    <div v-else class="setup-section">
      <h3 class="section-label">选择讲师</h3>
      <QuizCharacterPicker
        @select="selectCharacter"
        @select-default="selectDefault"
      />

      <div class="setup-actions">
        <button class="back-step-btn" @click="step = 'source'">← 上一步</button>
        <button
          class="start-btn"
          :disabled="!selectedCharacter && !useDefaultCharacter"
          @click="startTeaching"
        >
          开始陪学
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.teaching-setup {
  padding: 16px;
  min-height: 100%;
}

.setup-title {
  font-size: 1.2rem;
  margin-bottom: 20px;
  text-align: center;
}

.setup-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-label {
  font-size: 0.95rem;
  font-weight: 600;
  color: #8b9dc3;
  margin-bottom: 4px;
}

.source-tabs {
  display: flex;
  gap: 8px;
}

.source-tab {
  flex: 1;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #ccc;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.source-tab.active {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.15);
  color: #fff;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setup-input {
  width: 100%;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: #fff;
  font-size: 0.95rem;
  outline: none;
  box-sizing: border-box;
}

.setup-input:focus {
  border-color: #667eea;
}

.setup-input::placeholder {
  color: #555;
}

.topic-suggestions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.suggestion-label {
  font-size: 0.8rem;
  color: #666;
}

.suggestion-tag {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  color: #8b9dc3;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.suggestion-tag:hover {
  background: rgba(102, 126, 234, 0.15);
  border-color: #667eea;
  color: #fff;
}

.next-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.next-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.next-btn:not(:disabled):hover {
  opacity: 0.9;
}

.setup-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.back-step-btn {
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #8b9dc3;
  font-size: 0.9rem;
  cursor: pointer;
}

.start-btn {
  flex: 1;
  padding: 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.start-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.start-btn:not(:disabled):hover {
  opacity: 0.9;
}

  .platform-android.android-portrait .start-btn,
  .platform-android.android-portrait .source-tab,
  .platform-android.android-portrait .back-step-btn {
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
