<script setup>
/**
 * 剧情券生成界面
 * 选择主题、触发LLM生成、自动存档
 */
import { computed, ref } from 'vue'
import { generateStoryTicket } from '../llm'
import { saveStoryArchive, loadStoryArchives } from '../services/storyTicketArchiveService'

const props = defineProps({
  targetCharacter: {
    type: String,
    required: true,
  },
  worldBook: {
    type: Object,
    default: null,
  },
  characters: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['back', 'view-archive'])

const customTheme = ref('')
const isGenerating = ref(false)
const generationStatus = ref('')
const generationProgress = ref(0)
const generatedArchives = ref([])
const error = ref('')

async function handleStartGeneration() {
  isGenerating.value = true
  error.value = ''
  generationStatus.value = '正在生成完整剧情...'
  generationProgress.value = 10

  try {
    generationStatus.value = 'LLM 正在构思剧情...'
    generationProgress.value = 30

    const result = await generateStoryTicket({
      worldBook: props.worldBook,
      targetCharacter: props.targetCharacter,
      customTheme: customTheme.value || undefined,
      characters: props.characters,
    })

    generationStatus.value = '正在解析和存档...'
    generationProgress.value = 80

    if (!result.success) {
      error.value = result.error || '生成失败'
      isGenerating.value = false
      return
    }

    // 计算字数
    let totalChars = 0
    for (const dlg of result.dialogues) {
      totalChars += (dlg.text || '').replace(/[\s\n\r]/g, '').length
    }

    // 创建存档
    const archive = {
      id: `story_ticket_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: `${props.targetCharacter}的专属剧情`,
      targetCharacter: props.targetCharacter,
      theme: customTheme.value || '自由剧情',
      worldBookId: props.worldBook?.id || '',
      dialogues: result.dialogues,
      rawContent: result.rawResponse,
      createdAt: Date.now(),
      wordCount: totalChars,
    }

    await saveStoryArchive(archive)
    generationStatus.value = '存档完成！'
    generationProgress.value = 100

    // 延迟一下让用户看到完成状态
    await new Promise(resolve => setTimeout(resolve, 500))

    isGenerating.value = false
    generatedArchives.value = await loadStoryArchives()

    // 自动跳转到查看页面
    emit('view-archive', archive)
  } catch (err) {
    error.value = `生成异常：${err?.message || '未知错误'}`
    isGenerating.value = false
  }
}

function handleBack() {
  emit('back')
}

function handleClose() {
  emit('back')
}
</script>

<template>
  <Teleport to="body">
    <div class="story-ticket-gen">
      <header class="stg-header">
        <button class="stg-back-btn" @click="handleBack">&larr; 返回</button>
        <div class="stg-header-info">
          <h3 class="stg-title">&#x1f3ab; 剧情券 - {{ targetCharacter }}的专属剧情</h3>
        </div>
        <div class="stg-header-spacer"></div>
      </header>

      <div class="stg-content">
        <!-- 主题选择 -->
        <div class="stg-theme-section">
          <label class="stg-section-label">剧情主题（可选）</label>
          <p class="stg-section-desc">留空则由 LLM 自由决定主题</p>
          <textarea
            v-model="customTheme"
            class="stg-theme-input"
            placeholder="例如：两人一起准备学园祭、深夜谈心、回忆过去的冒险..."
            maxlength="500"
          ></textarea>
          <div class="stg-theme-count">{{ customTheme.length }}/500</div>

          <div class="stg-theme-presets">
            <button
              v-for="preset in [
                '深夜谈心',
                '学园祭准备',
                '一起做饭',
                '回忆往事',
                '意外访客',
                '雨天窝在家里',
              ]"
              :key="preset"
              class="stg-preset-btn"
              @click="customTheme = (customTheme ? customTheme + '、' : '') + preset"
            >
              {{ preset }}
            </button>
          </div>
        </div>

        <!-- 开始生成按钮 -->
        <button
          class="stg-start-btn"
          :disabled="isGenerating"
          @click="handleStartGeneration"
        >
          {{ isGenerating ? '生成中...' : '开始生成剧情' }}
        </button>

        <!-- 错误提示 -->
        <p v-if="error" class="stg-error">{{ error }}</p>
      </div>

      <!-- 生成中遮罩 -->
      <Transition name="stg-fade">
        <div v-if="isGenerating" class="stg-overlay">
          <div class="stg-overlay-card">
            <div class="stg-spinner"></div>
            <p class="stg-overlay-status">{{ generationStatus }}</p>
            <div class="stg-overlay-bar">
              <div class="stg-overlay-bar-fill" :style="{ width: generationProgress + '%' }"></div>
            </div>
            <p class="stg-overlay-hint">剧情券生成需要较长时间，请耐心等待...</p>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.story-ticket-gen {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: linear-gradient(180deg, rgba(20, 20, 30, 0.95) 0%, rgba(10, 10, 15, 0.98) 100%);
  display: flex;
  flex-direction: column;
  color: #fff;
  font-family: inherit;
}

.stg-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.stg-back-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.stg-back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.stg-header-info {
  flex: 1;
}

.stg-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.stg-header-spacer {
  width: 80px;
}

.stg-content {
  flex: 1;
  padding: 24px 16px;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
  overflow-y: auto;
}

.stg-theme-section {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.stg-section-label {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
  display: block;
}

.stg-section-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 12px;
}

.stg-theme-input {
  width: 100%;
  min-height: 80px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 12px;
  color: #fff;
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
  line-height: 1.6;
}

.stg-theme-input:focus {
  outline: none;
  border-color: rgba(167, 139, 250, 0.5);
}

.stg-theme-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  text-align: right;
  margin-top: 4px;
}

.stg-theme-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.stg-preset-btn {
  background: rgba(167, 139, 250, 0.15);
  border: 1px solid rgba(167, 139, 250, 0.3);
  color: #c4b5fd;
  padding: 6px 14px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 13px;
}

.stg-preset-btn:hover {
  background: rgba(167, 139, 250, 0.3);
}

.stg-start-btn {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #a78bfa, #818cf8);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}

.stg-start-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.stg-start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stg-error {
  color: #ef4444;
  font-size: 14px;
  margin-top: 16px;
  text-align: center;
}

/* 生成中遮罩 */
.stg-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.stg-overlay-card {
  background: rgba(30, 30, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  max-width: 400px;
  width: 90%;
}

.stg-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.1);
  border-top-color: #a78bfa;
  border-radius: 50%;
  animation: stg-spin 1s linear infinite;
}

@keyframes stg-spin {
  to { transform: rotate(360deg); }
}

.stg-overlay-status {
  font-size: 16px;
  color: #fff;
  text-align: center;
  margin: 0;
}

.stg-overlay-bar {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.stg-overlay-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #a78bfa, #818cf8);
  transition: width 0.3s ease;
}

.stg-overlay-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  margin: 0;
}

.stg-fade-enter-active,
.stg-fade-leave-active {
  transition: opacity 0.3s ease;
}

.stg-fade-enter-from,
.stg-fade-leave-to {
  opacity: 0;
}
</style>
