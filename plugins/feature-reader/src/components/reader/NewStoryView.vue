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
    const stories = await loadStories()
    const storyTitle = title.value.trim() || result.title || '未命名故事'
    const storyBrief = brief.value.trim() || result.content?.slice(0, 100) || ''

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
  } catch (e) {
    error.value = e.message || '生成时发生错误'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="new-story">
    <h2 class="new-title">新建故事</h2>

    <div class="new-form">
      <!-- 选择世界书 -->
      <label class="new-label">选择世界书</label>
      <select v-model="selectedBookId" class="new-select">
        <option value="" disabled>请选择...</option>
        <option
          v-for="book in worldBooks"
          :key="book.id"
          :value="book.id"
        >
          {{ book.title }}
        </option>
      </select>

      <!-- 世界书信息预览 -->
      <div v-if="selectedBook" class="book-preview">
        <p class="book-preview-summary">{{ selectedBook.summary || '暂无摘要' }}</p>
        <p class="book-preview-chars">
          角色: {{ (selectedBook.characters || []).map(c => c.name).join('、') || '无' }}
        </p>
      </div>

      <!-- 故事标题 -->
      <label class="new-label">故事标题（可选）</label>
      <input
        v-model="title"
        class="new-input"
        type="text"
        placeholder="留空由 AI 自动生成..."
        maxlength="50"
      />

      <!-- 故事简介 -->
      <label class="new-label">故事简介（可选）</label>
      <textarea
        v-model="brief"
        class="new-textarea"
        placeholder="留空由 AI 自行构思故事方向..."
        maxlength="500"
        rows="4"
      />

      <!-- 字数设置 -->
      <label class="new-label">每章字数: {{ wordCount }}</label>
      <input
        v-model="wordCount"
        class="new-range"
        type="range"
        min="500"
        max="3000"
        step="100"
      />
      <div class="range-labels">
        <span>500</span>
        <span>3000</span>
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
  </div>
</template>

<style scoped>
.new-story {
  padding: 16px;
  min-height: 100%;
}

.new-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--reader-text, #fff);
}

.new-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.new-label {
  font-size: 0.82rem;
  color: var(--reader-secondary, #8b9dc3);
  font-weight: 600;
}

.new-select,
.new-input,
.new-textarea {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--reader-text, #fff);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.new-select:focus,
.new-input:focus,
.new-textarea:focus {
  border-color: var(--reader-accent-start, #667eea);
}

.new-select {
  appearance: none;
  cursor: pointer;
}

.new-textarea {
  resize: vertical;
  font-family: inherit;
}

.book-preview {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.06));
  border-radius: 10px;
  padding: 10px 12px;
  margin-top: 4px;
}

.book-preview-summary {
  font-size: 0.8rem;
  color: var(--reader-secondary, #aaa);
  margin: 0 0 6px;
}

.book-preview-chars {
  font-size: 0.75rem;
  color: var(--reader-secondary, #666);
  opacity: 0.6;
  margin: 0;
}

.new-range {
  width: 100%;
  accent-color: var(--reader-accent-start, #667eea);
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--reader-secondary, #555);
  opacity: 0.5;
}

.new-error {
  background: rgba(255, 77, 77, 0.1);
  border: 1px solid rgba(255, 77, 77, 0.3);
  border-radius: 10px;
  padding: 10px 12px;
  color: #ff6b6b;
  font-size: 0.85rem;
}

.new-generate-btn {
  background: linear-gradient(135deg, var(--reader-accent-start, #667eea), var(--reader-accent-end, #764ba2));
  border: none;
  color: var(--reader-text, #fff);
  padding: 14px;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.2s;
  margin-top: 8px;
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
</style>
