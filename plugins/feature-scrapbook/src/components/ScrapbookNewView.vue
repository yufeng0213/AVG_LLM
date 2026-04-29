<script setup>
/**
 * ScrapbookNewView.vue - 新建手帐
 * 输入标题、选择世界书角色、上传封面。
 */
import { ref, onMounted } from 'vue'
import { loadWorldBooks } from '../../../../src/worldbook/worldBookStore.js'
import { saveBook } from '../composables/useScrapbookData.js'

const emit = defineEmits(['back', 'save'])

const worldBooks = ref([])
const selectedBookId = ref('')
const selectedCharId = ref('')
const title = ref('')
const coverImage = ref('')

const characters = ref([])

onMounted(async () => {
  worldBooks.value = await loadWorldBooks()
  if (worldBooks.value.length > 0) {
    selectedBookId.value = worldBooks.value[0].id
    updateCharacters()
  }
})

function updateCharacters() {
  const wb = worldBooks.value.find(b => b.id === selectedBookId.value)
  characters.value = wb?.characters || []
  selectedCharId.value = ''
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function handleCoverSelect(event) {
  const file = event.target.files?.[0]
  if (!file) return
  coverImage.value = await fileToDataUrl(file)
}

function getCharName(charId) {
  const wb = worldBooks.value.find(b => b.id === selectedBookId.value)
  const char = wb?.characters?.find(c => c.id === charId || c.name === charId)
  return char?.name || ''
}

async function handleSave() {
  if (!title.value.trim()) {
    alert('请输入手帐标题')
    return
  }

  const book = {
    title: title.value.trim(),
    worldBookId: selectedBookId.value,
    characterId: selectedCharId.value,
    characterName: getCharName(selectedCharId.value),
    coverImage: coverImage.value,
    pages: [
      {
        id: 'page_1',
        title: title.value.trim(),
        elements: [],
      },
    ],
  }

  const saved = await saveBook(book)
  emit('save', saved)
}
</script>

<template>
  <div class="scrapbook-new">
    <h2 class="new-title">新建手帐</h2>

    <div class="new-form">
      <!-- 手帐标题 -->
      <label class="new-label">手帐标题</label>
      <input
        v-model="title"
        class="new-input"
        type="text"
        placeholder="给手帐取个名字..."
        maxlength="30"
      />

      <!-- 选择世界书 -->
      <label class="new-label">选择世界书</label>
      <select v-model="selectedBookId" class="new-select" @change="updateCharacters">
        <option value="" disabled>请选择...</option>
        <option v-for="book in worldBooks" :key="book.id" :value="book.id">
          {{ book.title }}
        </option>
      </select>

      <!-- 选择角色 -->
      <label class="new-label">和谁一起编写</label>
      <select v-model="selectedCharId" class="new-select">
        <option value="" disabled>请选择角色...</option>
        <option v-for="char in characters" :key="char.id || char.name" :value="char.id || char.name">
          {{ char.name }}
        </option>
      </select>

      <!-- 封面 -->
      <label class="new-label">封面（可选）</label>
      <div class="cover-section">
        <label class="cover-upload-btn">
          选择图片
          <input
            type="file"
            accept="image/*"
            @change="handleCoverSelect"
            hidden
          />
        </label>
        <img
          v-if="coverImage"
          :src="coverImage"
          class="cover-preview"
          alt="封面预览"
        />
      </div>

      <!-- 保存按钮 -->
      <button class="new-save-btn" @click="handleSave">
        创建手帐
      </button>
    </div>
  </div>
</template>

<style scoped>
.scrapbook-new {
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

.new-input,
.new-select {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--reader-text, #fff);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.new-input:focus,
.new-select:focus {
  border-color: var(--reader-accent-start, #667eea);
}

.new-select {
  appearance: none;
  cursor: pointer;
}

.cover-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cover-upload-btn {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  border-radius: 10px;
  padding: 10px 16px;
  color: var(--reader-text, #fff);
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
}

.cover-preview {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
}

.new-save-btn {
  background: linear-gradient(135deg, var(--reader-accent-start, #667eea), var(--reader-accent-end, #764ba2));
  border: none;
  color: #fff;
  padding: 14px;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s;
  margin-top: 8px;
}

.new-save-btn:hover {
  transform: scale(1.02);
}

.new-save-btn:active {
  transform: scale(0.98);
}
.platform-android.android-portrait .new-save-btn {
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
