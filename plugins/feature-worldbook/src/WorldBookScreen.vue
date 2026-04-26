<script setup>
import { onMounted, ref } from 'vue'
import {
  createNewWorldBook,
  deleteWorldBook,
  exportWorldBook,
  getActiveWorldBookId,
  importWorldBooks,
  loadWorldBooks,
  loadWorldBookTitles,
  persistWorldBooks,
  setActiveWorldBookId,
} from '../../../src/worldbook/worldBookStore'

const emit = defineEmits(['back', 'open-book'])

const statusMessage = ref('点击一本世界书进入详细设定。')
const worldBooks = ref([])
const activeBookId = ref('default_world_book')
const activatedBookId = ref('default_world_book') // 当前激活的世界书（用于游戏）
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
  // 书架列表只加载 id、title、summary、isDefault，不加载角色/entries 等大字段
  worldBooks.value = await loadWorldBookTitles()

  const storedActiveId = await getActiveWorldBookId()
  const activeExists = worldBooks.value.some((book) => book.id === storedActiveId)
  activeBookId.value = activeExists ? storedActiveId : worldBooks.value[0]?.id || 'default_world_book'
  activatedBookId.value = activeBookId.value // 同步激活状态
}

const activateBook = async (bookId) => {
  await setActiveWorldBookId(bookId)
  activatedBookId.value = bookId
  const book = worldBooks.value.find(b => b.id === bookId)
  statusMessage.value = `已激活：${book?.title || bookId}`
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
  // 加载完整数据后再新增，避免用 titles-only 数据覆盖
  const fullBooks = await loadWorldBooks()
  const nextBook = createNewWorldBook(fullBooks)
  nextBook.title = title
  fullBooks.push(nextBook)
  await persistWorldBooks(fullBooks)
  await refreshBooks()
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

  // 删除前加载完整数据，确保 persistWorldBooks 不会覆盖其他字段
  const fullBooks = await loadWorldBooks()
  const result = deleteWorldBook(fullBooks, bookToDelete.value.id)
  if (result.success) {
    await persistWorldBooks(result.books)
    await refreshBooks()

    statusMessage.value = result.message
  } else {
    statusMessage.value = result.message
  }

  bookToDelete.value = null
  showDeleteConfirm.value = false
}

const handleExport = async (book, event) => {
  event.stopPropagation()
  // 导出需要完整数据，先加载再导出
  const fullBooks = await loadWorldBooks()
  const fullBook = fullBooks.find(b => b.id === book.id)
  if (!fullBook) {
    statusMessage.value = `导出失败：找不到世界书 ${book.title}`
    return
  }
  const jsonStr = exportWorldBook(fullBook)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fullBook.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_worldbook.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  statusMessage.value = `已导出：${fullBook.title}`
}

const triggerImport = () => {
  fileInputRef.value?.click()
}

const handleFileImport = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    // Android 兼容：优先使用 FileReader，避免 file.text() 在旧 WebView 上的问题
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })

    // 导入前加载完整数据，确保不会用 titles-only 数据覆盖
    const fullBooks = await loadWorldBooks()
    const result = importWorldBooks(text, fullBooks)

    if (result.success && result.books.length > 0) {
      const allBooks = [...fullBooks, ...result.books]
      try {
        await persistWorldBooks(allBooks)
        await refreshBooks()
        statusMessage.value = result.message
      } catch (saveError) {
        console.warn('[WorldBook] 保存失败:', saveError)
        statusMessage.value = `${result.message}（保存失败，数据将在下次重启后丢失）`
      }
    } else {
      statusMessage.value = result.message
    }
  } catch (error) {
    console.error('[WorldBook] 导入错误:', error)
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
      <button type="button" class="back-button" @click="emit('back')">
        <span class="back-icon">‹</span>
      </button>
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
            📥 新增
          </button>
        </div>
      </div>

      <div class="worldbook-shelf">
        <button
          v-for="(book, index) in worldBooks"
          :key="book.id"
          type="button"
          class="worldbook-book-spine"
          :class="[getBookToneClass(book, index), { active: activatedBookId === book.id }]"
          :title="book.summary || book.title"
          @click="openBook(book.id)"
        >
          <span v-if="book.isDefault" class="spine-badge">默认</span>
          <span class="spine-title">{{ book.title }}</span>
          <div class="spine-actions" @click.stop>
            <button
              v-if="activatedBookId !== book.id"
              type="button"
              class="spine-action-btn activate-btn"
              title="激活此世界书"
              @click="activateBook(book.id)"
            >
              ⚡
            </button>
            <span v-else class="spine-active-badge">✓激活</span>
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

