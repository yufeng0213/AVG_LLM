<script setup>
/**
 * NewStoryView.vue - 新建故事
 * 选择世界书、输入简介、设置字数，生成第一章。
 */
import { ref, computed, onMounted } from 'vue'
import {
  loadWorldBooks,
} from '../../../../../src/worldbook/worldBookStore.js'
import {
  loadStories,
  saveStories,
  addStory,
  addChapter,
  isSQLiteAvailable,
  insertStory as _insertStory,
  insertChapter as _insertChapter,
} from '../../composables/useReaderData.js'
import { generateFirstChapter } from '../../../../../src/llm/llmService.reader.js'

const props = defineProps({
  worldBookId: { type: String, default: '' },
})
const emit = defineEmits(['back', 'story-created'])

const worldBooks = ref([])
const selectedBookId = ref(props.worldBookId || '')
const title = ref('')
const brief = ref('')
const wordCount = ref(1200)
const generating = ref(false)
const error = ref('')

onMounted(async () => {
  worldBooks.value = await loadWorldBooks()
  if (!selectedBookId.value && worldBooks.value.length > 0) {
    selectedBookId.value = worldBooks.value[0].id
  }
})

const selectedBook = computed(() =>
  worldBooks.value.find(b => b.id === selectedBookId.value)
)

async function handleGenerate() {
  if (!selectedBookId.value) {
    error.value = '请选择一本世界书'
    return
  }

  generating.value = true
  error.value = ''

  try {
    const worldBook = selectedBook.value

    const result = await generateFirstChapter({
      worldBook,
      brief: brief.value.trim(),
      wordCount: wordCount.value,
      narrator: null,
    })

    if (!result.success) {
      error.value = result.error || '生成失败'
      return
    }

    // 保存故事和章节
    const storyTitle = title.value.trim() || result.title || '未命名故事'
    const storyBrief = brief.value.trim() || result.content?.slice(0, 100) || ''

    if (isSQLiteAvailable()) {
      // SQLite 模式：直接插入
      const storyId = `story_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const newStory = {
        id: storyId,
        title: storyTitle,
        brief: storyBrief,
        worldBookId: selectedBookId.value,
        chapters: [],
        lastReadChapter: 0,
        settings: { fontSize: 16, lineHeight: 1.8, theme: 'dark' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      addChapter(newStory, {
        title: result.title,
        content: result.content,
        suggestions: result.suggestions || [],
        wordCount: result.wordCount,
      })
      await _insertStory(newStory)
      for (const ch of newStory.chapters) {
        await _insertChapter(storyId, ch)
      }
      emit('story-created', newStory)
    } else {
      // Web fallback
      const stories = await loadStories()
      const newStory = addStory(stories, {
        title: storyTitle,
        brief: storyBrief,
        worldBookId: selectedBookId.value,
      })[0]

      addChapter(newStory, {
        title: result.title,
        content: result.content,
        suggestions: result.suggestions || [],
        wordCount: result.wordCount,
      })

      await saveStories([newStory, ...stories.filter(s => s.id !== newStory.id)])
      emit('story-created', newStory)
    }
  } catch (e) {
    error.value = e.message || '生成时发生错误'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="new-story">
    <!-- 标题栏 -->
    <div class="new-header">
      <button class="new-back-btn" @click="emit('back')"><</button>
      <span class="new-title">新建故事</span>
      <span class="new-spacer" />
    </div>

    <div class="new-form">
      <!-- 选择世界书 -->
      <div class="form-group">
        <label class="form-label">选择世界书</label>
        <select v-model="selectedBookId" class="form-select">
          <option value="" disabled>请选择...</option>
          <option
            v-for="book in worldBooks"
            :key="book.id"
            :value="book.id"
          >
            {{ book.title }}
          </option>
        </select>
      </div>

      <!-- 世界书信息预览 -->
      <div v-if="selectedBook" class="book-preview">
        <p class="book-preview-summary">{{ selectedBook.summary || '暂无摘要' }}</p>
        <p class="book-preview-chars">
          角色: {{ (selectedBook.characters || []).map(c => c.name).join('、') || '无' }}
        </p>
      </div>

      <!-- 故事标题 -->
      <div class="form-group">
        <label class="form-label">故事标题（可选）</label>
        <input
          v-model="title"
          class="form-input"
          type="text"
          placeholder="留空由 AI 自动生成..."
          maxlength="50"
        />
      </div>

      <!-- 故事简介 -->
      <div class="form-group">
        <label class="form-label">故事简介（可选）</label>
        <textarea
          v-model="brief"
          class="form-textarea"
          placeholder="留空由 AI 自行构思故事方向..."
          maxlength="500"
          rows="4"
        />
      </div>

      <!-- 字数设置 -->
      <div class="form-group">
        <label class="form-label">每章字数: {{ wordCount }}</label>
        <input
          v-model="wordCount"
          class="form-range"
          type="range"
          min="500"
          max="3000"
          step="100"
        />
        <div class="range-labels">
          <span>500</span>
          <span>3000</span>
        </div>
      </div>

      <!-- 错误信息 -->
      <div v-if="error" class="new-error">
        {{ error }}
      </div>

      <!-- 生成按钮 -->
      <button
        class="new-generate-btn"
        :disabled="generating"
        @click="handleGenerate"
      >
        <span v-if="generating" class="spinner">⟳</span>
        {{ generating ? '正在生成第一章...' : '生成第一章' }}
      </button>
    </div>

    <div class="bottom-spacer" />
  </div>
</template>

<style scoped>
.new-story {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: linear-gradient(180deg, #f5f0ff 0%, #ede4ff 100%);
}

/* 标题栏 */
.new-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  padding-top: 10px;
}

.new-back-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  color: #2d2040;
  cursor: pointer;
  padding: 4px 8px;
}

.new-title {
  flex: 1;
  text-align: center;
  font-size: 1rem;
  font-weight: 700;
  color: #2d2040;
}

.new-spacer {
  width: 40px;
}

.new-form {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  background: #fff;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.form-label {
  display: block;
  font-size: 0.85rem;
  color: #2d2040;
  font-weight: 600;
  margin-bottom: 8px;
}

.form-select,
.form-input,
.form-textarea {
  background: #f8f4ff;
  border: 1px solid #e8e0f0;
  border-radius: 10px;
  padding: 10px 12px;
  color: #2d2040;
  font-size: 0.88rem;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-select:focus,
.form-input:focus,
.form-textarea:focus {
  border-color: #7c5cbf;
}

.form-select {
  appearance: none;
  cursor: pointer;
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
}

.book-preview {
  background: #fff;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.book-preview-summary {
  font-size: 0.8rem;
  color: #5a3d8a;
  margin: 0 0 6px;
}

.book-preview-chars {
  font-size: 0.75rem;
  color: #b0a8c0;
  margin: 0;
}

.form-range {
  width: 100%;
  accent-color: #7c5cbf;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: #b0a8c0;
  margin-top: 4px;
}

.new-error {
  background: rgba(255, 77, 77, 0.08);
  border: 1px solid rgba(255, 77, 77, 0.2);
  border-radius: 10px;
  padding: 10px 12px;
  color: #ff6b6b;
  font-size: 0.85rem;
}

.new-generate-btn {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  border: none;
  color: #fff;
  padding: 14px;
  border-radius: 24px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.2s;
  margin-top: 4px;
}

.new-generate-btn:hover:not(:disabled) {
  transform: scale(1.02);
}

.new-generate-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.new-generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
  margin-right: 6px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.bottom-spacer {
  height: 20px;
}

.platform-android.android-portrait .new-back-btn,
.platform-android.android-portrait .new-generate-btn {
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  flex: none !important;
  font-size: 1.1rem !important;
  padding: 6px 14px !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 8px !important;
  white-space: nowrap !important;
}
</style>
