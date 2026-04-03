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

const refreshBooks = () => {
  worldBooks.value = loadWorldBooks()

  const storedActiveId = getActiveWorldBookId()
  const activeExists = worldBooks.value.some((book) => book.id === storedActiveId)
  activeBookId.value = activeExists ? storedActiveId : worldBooks.value[0]?.id || 'default_world_book'
  setActiveWorldBookId(activeBookId.value)
}

const openBook = (bookId) => {
  activeBookId.value = bookId
  setActiveWorldBookId(bookId)
  emit('open-book', bookId)
}

const addWorldBook = () => {
  const nextBook = createNewWorldBook(worldBooks.value)
  worldBooks.value = [...worldBooks.value, nextBook]
  persistWorldBooks(worldBooks.value)
  setActiveWorldBookId(nextBook.id)
  activeBookId.value = nextBook.id
  statusMessage.value = `已新增：${nextBook.title}`
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

const executeDelete = () => {
  if (!bookToDelete.value) return
  
  const result = deleteWorldBook(worldBooks.value, bookToDelete.value.id)
  if (result.success) {
    worldBooks.value = result.books
    persistWorldBooks(worldBooks.value)
    
    // 如果删除的是当前激活的世界书，切换到第一本
    if (activeBookId.value === bookToDelete.value.id) {
      const newActiveId = worldBooks.value[0]?.id || 'default_world_book'
      activeBookId.value = newActiveId
      setActiveWorldBookId(newActiveId)
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
      persistWorldBooks(worldBooks.value)
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

onMounted(refreshBooks)
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
          <button type="button" class="worldbook-add-button" @click="addWorldBook">
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

    <p class="status-message">{{ statusMessage }}</p>
  </main>
</template>

<style scoped>
.worldbook-screen {
  position: relative;
  width: 100%;
  height: calc(100vh - clamp(40px, 8vw, 110px));
  max-height: calc(100vh - clamp(40px, 8vw, 110px));
  border: 8px solid var(--accent-cyan);
  border-radius: 34px 20px 30px 18px;
  background: var(--surface-panel);
  backdrop-filter: blur(var(--backdrop-blur));
  box-shadow: var(--shadow-screen);
  padding: clamp(18px, 3vw, 32px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: clamp(14px, 2.5vw, 22px);
  overflow: hidden;
}

.worldbook-screen::before,
.worldbook-screen::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.worldbook-screen::before {
  opacity: 0.14;
  background-image:
    radial-gradient(circle, var(--accent-cyan) 1px, transparent 1px),
    repeating-linear-gradient(
      -40deg,
      transparent 0 12px,
      color-mix(in srgb, var(--accent-orange) 35%, transparent) 12px 22px
    );
  background-size:
    24px 24px,
    100% 100%;
}

.worldbook-screen::after {
  opacity: 0.1;
  background-image: conic-gradient(
    from 90deg at 1px 1px,
    transparent 90deg,
    color-mix(in srgb, var(--accent-magenta) 28%, transparent) 0
  );
  background-size: 44px 44px;
}

.worldbook-bg-word {
  position: absolute;
  margin: 0;
  right: -2%;
  top: -5%;
  font-family: var(--font-heading);
  font-size: clamp(6rem, 20vw, 14rem);
  line-height: 0.8;
  letter-spacing: -0.07em;
  color: color-mix(in srgb, var(--accent-yellow) 32%, transparent);
  opacity: 0.22;
  pointer-events: none;
  user-select: none;
}

.worldbook-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.worldbook-title-group {
  display: grid;
  gap: 8px;
}

.worldbook-tag {
  margin: 0;
  width: fit-content;
  padding: 8px 14px;
  border: 4px solid var(--accent-orange);
  border-radius: 9999px;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow: var(--text-shadow-single);
  background: color-mix(in srgb, var(--accent-magenta) 25%, transparent);
}

.worldbook-title {
  margin: 0;
  display: grid;
  font-family: var(--font-heading);
  font-size: clamp(2.1rem, 5.7vw, 4.4rem);
  line-height: 0.92;
  letter-spacing: -0.03em;
  text-shadow: var(--text-shadow-triple);
}

.worldbook-title-gradient {
  width: fit-content;
  font-family: var(--font-display);
  font-size: clamp(2rem, 5vw, 3.1rem);
  letter-spacing: 0.08em;
  background: linear-gradient(
    90deg,
    var(--accent-magenta),
    var(--accent-cyan),
    var(--accent-yellow),
    var(--accent-magenta)
  );
  background-size: 250% 250%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: avg-gradient-shift 4s linear infinite;
}

.worldbook-shelf-zone {
  position: relative;
  z-index: 2;
  border: 4px solid var(--border-panel);
  border-radius: 24px;
  background: color-mix(in srgb, var(--surface-panel) 92%, transparent);
  box-shadow: var(--shadow-panel);
  padding: 12px;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.worldbook-shelf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.worldbook-shelf-title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 1.08rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: var(--text-shadow-single);
}

.worldbook-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.worldbook-import-button {
  appearance: none;
  border: 4px solid var(--accent-magenta);
  border-radius: var(--radius-button);
  padding: 8px 14px;
  font: 800 0.8rem/1 var(--font-body);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--foreground);
  background: var(--gradient-primary);
  box-shadow: var(--shadow-button);
  cursor: pointer;
  transition: transform 220ms ease, box-shadow 220ms ease;
}

.worldbook-import-button:hover {
  transform: translateY(-2px) scale(1.03);
}

.worldbook-import-button:focus-visible {
  outline: 3px solid var(--accent-yellow);
  outline-offset: 3px;
}

.worldbook-add-button {
  appearance: none;
  border: 4px dashed var(--accent-cyan);
  border-radius: var(--radius-button);
  padding: 8px 14px;
  font: 800 0.8rem/1 var(--font-body);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--foreground);
  background: var(--gradient-secondary);
  box-shadow: var(--shadow-button);
  cursor: pointer;
  transition: transform 220ms ease, box-shadow 220ms ease;
}

.worldbook-add-button:hover {
  transform: translateY(-2px) scale(1.03);
}

.worldbook-add-button:focus-visible {
  outline: 3px dashed var(--accent-yellow);
  outline-offset: 3px;
}

.worldbook-shelf {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  min-height: 220px;
  overflow-x: auto;
  padding: 16px 10px 14px;
}

.worldbook-shelf::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 18px;
  pointer-events: none;
  background:
    linear-gradient(
      to bottom,
      transparent 0 38%,
      color-mix(in srgb, var(--accent-orange) 28%, transparent) 38% 42%,
      transparent 42% 78%,
      color-mix(in srgb, var(--accent-orange) 28%, transparent) 78% 82%,
      transparent 82% 100%
    ),
    radial-gradient(circle, color-mix(in srgb, var(--accent-cyan) 26%, transparent) 1px, transparent 1px);
  background-size:
    100% 100%,
    22px 22px;
  opacity: 0.22;
}

.worldbook-book-spine {
  position: relative;
  appearance: none;
  flex: 0 0 auto;
  width: 78px;
  min-height: 168px;
  border: 4px solid var(--accent-yellow);
  border-radius: 14px 14px 8px 8px;
  color: var(--foreground);
  padding: 30px 6px 12px;
  cursor: pointer;
  box-shadow: var(--shadow-field);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
}

.worldbook-book-spine:hover {
  transform: translateY(-5px);
}

.worldbook-book-spine.active {
  border-color: var(--accent-cyan);
  transform: translateY(-7px) scale(1.03);
  box-shadow: var(--shadow-button);
}

.spine-title {
  font-family: var(--font-heading);
  font-size: 0.84rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  text-shadow: var(--text-shadow-single);
}

.spine-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 6px;
  border: 2px solid color-mix(in srgb, var(--foreground) 65%, transparent);
  border-radius: 9999px;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.08em;
  background: color-mix(in srgb, var(--background) 36%, transparent);
}

.spine-actions {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 200ms ease;
}

.worldbook-book-spine:hover .spine-actions {
  opacity: 1;
}

.spine-action-btn {
  appearance: none;
  border: 2px solid color-mix(in srgb, var(--foreground) 50%, transparent);
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 0.7rem;
  line-height: 1;
  background: color-mix(in srgb, var(--background) 80%, transparent);
  color: var(--foreground);
  cursor: pointer;
  transition: transform 150ms ease, background 150ms ease;
}

.spine-action-btn:hover {
  transform: scale(1.15);
  background: color-mix(in srgb, var(--background) 60%, transparent);
}

.export-btn:hover {
  border-color: var(--accent-cyan);
}

.delete-btn:hover {
  border-color: var(--accent-magenta);
  background: color-mix(in srgb, var(--accent-magenta) 30%, var(--background));
}

/* 删除确认弹窗 */
.delete-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--background) 85%, transparent);
  backdrop-filter: blur(8px);
}

.delete-confirm-dialog {
  position: relative;
  border: 4px solid var(--accent-magenta);
  border-radius: 20px;
  padding: 24px 32px;
  max-width: 400px;
  background: var(--surface-panel);
  box-shadow: var(--shadow-panel);
  text-align: center;
}

.delete-confirm-dialog h3 {
  margin: 0 0 12px;
  font-family: var(--font-heading);
  font-size: 1.4rem;
  color: var(--accent-magenta);
}

.delete-confirm-dialog p {
  margin: 0 0 8px;
  font-size: 1rem;
}

.delete-warning {
  color: var(--accent-orange);
  font-weight: 700;
  font-size: 0.9rem;
}

.delete-confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 20px;
}

.cancel-btn {
  appearance: none;
  border: 3px solid var(--border-panel);
  border-radius: var(--radius-button);
  padding: 10px 20px;
  font: 700 0.9rem/1 var(--font-body);
  color: var(--foreground);
  background: var(--surface-panel);
  cursor: pointer;
  transition: transform 150ms ease;
}

.cancel-btn:hover {
  transform: scale(1.05);
}

.confirm-delete-btn {
  appearance: none;
  border: 3px solid var(--accent-magenta);
  border-radius: var(--radius-button);
  padding: 10px 20px;
  font: 700 0.9rem/1 var(--font-body);
  color: var(--foreground);
  background: var(--accent-magenta);
  cursor: pointer;
  transition: transform 150ms ease;
}

.confirm-delete-btn:hover {
  transform: scale(1.05);
  background: color-mix(in srgb, var(--accent-magenta) 80%, var(--accent-orange));
}

.book-tone-default {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--accent-purple) 80%, var(--background)),
    color-mix(in srgb, var(--accent-magenta) 72%, var(--background))
  );
}

.book-tone-magenta {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--accent-magenta) 78%, var(--background)),
    color-mix(in srgb, var(--accent-yellow) 68%, var(--background))
  );
}

.book-tone-cyan {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--accent-cyan) 80%, var(--background)),
    color-mix(in srgb, var(--accent-purple) 72%, var(--background))
  );
}

.book-tone-orange {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--accent-orange) 82%, var(--background)),
    color-mix(in srgb, var(--accent-yellow) 66%, var(--background))
  );
}

.book-tone-purple {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--accent-purple) 82%, var(--background)),
    color-mix(in srgb, var(--accent-cyan) 66%, var(--background))
  );
}

.book-tone-yellow {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--accent-yellow) 82%, var(--background)),
    color-mix(in srgb, var(--accent-orange) 72%, var(--background))
  );
  color: color-mix(in srgb, var(--background) 88%, var(--foreground));
}

.book-tone-yellow .spine-badge {
  border-color: color-mix(in srgb, var(--background) 75%, transparent);
  background: color-mix(in srgb, var(--foreground) 22%, transparent);
}

@media (max-width: 980px) {
  .worldbook-screen {
    border-width: 6px;
    min-height: calc(100vh - 30px);
  }

  .worldbook-shelf {
    min-height: 188px;
  }

  .worldbook-book-spine {
    width: 72px;
    min-height: 146px;
  }
}

@media (max-width: 680px) {
  .worldbook-shelf-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .worldbook-add-button {
    width: 100%;
  }

  .worldbook-bg-word {
    font-size: clamp(4.5rem, 24vw, 8rem);
    right: -7%;
  }
}
</style>
