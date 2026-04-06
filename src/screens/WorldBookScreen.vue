<script setup>
import { onMounted, ref } from 'vue'
import {
  createNewWorldBook,
  deleteWorldBook,
  exportWorldBook,
  getActiveWorldBookId,
  importWorldBooks,
  loadWorldBooks,
  persistWorldBooks,
  setActiveWorldBookId,
} from '../worldbook/worldBookStore'

const emit = defineEmits(['back', 'open-book'])

const statusMessage = ref('点击一本世界书进入详细设定。')
const worldBooks = ref([])
const activeBookId = ref('default_world_book')
const showDeleteConfirm = ref(false)
const bookToDelete = ref(null)
const fileInputRef = ref(null)
const showNewBookDialog = ref(false)
const newBookTitle = ref('')

const bookToneClasses = [
  'book-tone-magenta',
  'book-tone-cyan',
  'book-tone-orange',
  'book-tone-purple',
  'book-tone-yellow',
]

const getBookToneClass = (book, index) => {
  if (book.isDefault) return 'book-tone-default'
  return bookToneClasses[index % bookToneClasses.length]
}

const refreshBooks = async () => {
  worldBooks.value = await loadWorldBooks()

  const storedActiveId = await getActiveWorldBookId()
  const activeExists = worldBooks.value.some((book) => book.id === storedActiveId)
  activeBookId.value = activeExists ? storedActiveId : worldBooks.value[0]?.id || 'default_world_book'
  await setActiveWorldBookId(activeBookId.value)
}

const openBook = async (bookId) => {
  activeBookId.value = bookId
  await setActiveWorldBookId(bookId)
  emit('open-book', bookId)
}

const openNewBookDialog = () => {
  newBookTitle.value = ''
  showNewBookDialog.value = true
}

const cancelNewBook = () => {
  newBookTitle.value = ''
  showNewBookDialog.value = false
}

const confirmNewBook = async () => {
  const title = newBookTitle.value.trim() || `新世界书 ${worldBooks.value.length + 1}`
  const nextBook = createNewWorldBook(worldBooks.value)
  nextBook.title = title
  worldBooks.value = [...worldBooks.value, nextBook]
  await persistWorldBooks(worldBooks.value)
  await setActiveWorldBookId(nextBook.id)
  activeBookId.value = nextBook.id
  statusMessage.value = `已新增：${title}`
  showNewBookDialog.value = false
  newBookTitle.value = ''
}

const confirmDelete = (book, event) => {
  event.stopPropagation()
  if (book.isDefault || book.id === 'default_world_book') {
    statusMessage.value = '无法删除默认世界书'
    return
  }
  bookToDelete.value = book
  showDeleteConfirm.value = true
}

const cancelDelete = () => {
  bookToDelete.value = null
  showDeleteConfirm.value = false
}

const executeDelete = async () => {
  if (!bookToDelete.value) return
  
  const result = deleteWorldBook(worldBooks.value, bookToDelete.value.id)
  if (result.success) {
    worldBooks.value = result.books
    await persistWorldBooks(worldBooks.value)
    
    // 如果删除的是当前激活的世界书，切换到第一本
    if (activeBookId.value === bookToDelete.value.id) {
      const newActiveId = worldBooks.value[0]?.id || 'default_world_book'
      activeBookId.value = newActiveId
      await setActiveWorldBookId(newActiveId)
    }
    
    statusMessage.value = result.message
  } else {
    statusMessage.value = result.message
  }
  
  bookToDelete.value = null
  showDeleteConfirm.value = false
}

const handleExport = (book, event) => {
  event.stopPropagation()
  const jsonStr = exportWorldBook(book)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${book.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_worldbook.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  statusMessage.value = `已导出：${book.title}`
}

const triggerImport = () => {
  fileInputRef.value?.click()
}

const handleFileImport = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  
  try {
    const text = await file.text()
    const result = importWorldBooks(text, worldBooks.value)
    
    if (result.success && result.books.length > 0) {
      worldBooks.value = [...worldBooks.value, ...result.books]
      await persistWorldBooks(worldBooks.value)
      statusMessage.value = result.message
    } else {
      statusMessage.value = result.message
    }
  } catch (error) {
    statusMessage.value = `导入失败：${error.message}`
  }
  
  // 重置文件输入
  event.target.value = ''
}

onMounted(async () => {
  await refreshBooks()
})
</script>

<template>
  <main class="worldbook-screen" role="main">
    <p class="worldbook-bg-word" aria-hidden="true">LORE</p>

    <header class="worldbook-header">
      <button type="button" class="back-button" @click="emit('back')">返回主菜单</button>
      <div class="worldbook-title-group">
        <p class="worldbook-tag">Story Background Builder</p>
        <h1 class="worldbook-title">
          <span>世界书</span>
          <span class="worldbook-title-gradient">WORLD BOOK</span>
        </h1>
      </div>
    </header>

    <section class="worldbook-shelf-zone" aria-label="世界书书架">
      <div class="worldbook-shelf-header">
        <p class="worldbook-shelf-title">世界书书架</p>
        <div class="worldbook-actions">
          <input
            ref="fileInputRef"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleFileImport"
          />
          <button type="button" class="worldbook-import-button" @click="triggerImport">
            📥 导入
          </button>
          <button type="button" class="worldbook-add-button" @click="openNewBookDialog">
            ＋ 新增世界书
          </button>
        </div>
      </div>

      <div class="worldbook-shelf">
        <button
          v-for="(book, index) in worldBooks"
          :key="book.id"
          type="button"
          class="worldbook-book-spine"
          :class="[getBookToneClass(book, index), { active: activeBookId === book.id }]"
          :title="book.summary || book.title"
          @click="openBook(book.id)"
        >
          <span v-if="book.isDefault" class="spine-badge">默认</span>
          <span class="spine-title">{{ book.title }}</span>
          <div class="spine-actions" @click.stop>
            <button
              type="button"
              class="spine-action-btn export-btn"
              title="导出"
              @click="handleExport(book, $event)"
            >
              📤
            </button>
            <button
              v-if="!book.isDefault && book.id !== 'default_world_book'"
              type="button"
              class="spine-action-btn delete-btn"
              title="删除"
              @click="confirmDelete(book, $event)"
            >
              🗑️
            </button>
          </div>
        </button>
      </div>
    </section>

    <!-- 删除确认弹窗 -->
    <div v-if="showDeleteConfirm" class="delete-confirm-overlay" @click.self="cancelDelete">
      <div class="delete-confirm-dialog">
        <h3>确认删除</h3>
        <p>确定要删除世界书「{{ bookToDelete?.title }}」吗？</p>
        <p class="delete-warning">此操作无法撤销！</p>
        <div class="delete-confirm-actions">
          <button type="button" class="cancel-btn" @click="cancelDelete">取消</button>
          <button type="button" class="confirm-delete-btn" @click="executeDelete">确认删除</button>
        </div>
      </div>
    </div>

    <!-- 新增世界书弹窗 -->
    <div v-if="showNewBookDialog" class="delete-confirm-overlay" @click.self="cancelNewBook">
      <div class="new-book-dialog">
        <h3>新增世界书</h3>
        <label class="new-book-field">
          <span class="field-label">世界书名称</span>
          <input
            v-model="newBookTitle"
            type="text"
            class="new-book-input"
            placeholder="请输入世界书名称"
            @keyup.enter="confirmNewBook"
          />
        </label>
        <div class="delete-confirm-actions">
          <button type="button" class="cancel-btn" @click="cancelNewBook">取消</button>
          <button type="button" class="confirm-btn" @click="confirmNewBook">确认</button>
        </div>
      </div>
    </div>

    <p class="status-message">{{ statusMessage }}</p>
  </main>
</template>

<style scoped src="./WorldBookScreen.css"></style>

