<script setup>
import { onMounted, ref } from 'vue'
import {
  createNewWorldBook,
  getActiveWorldBookId,
  loadWorldBooks,
  persistWorldBooks,
  setActiveWorldBookId,
} from '../worldbook/worldBookStore'

const emit = defineEmits(['back', 'open-book'])

const statusMessage = ref('点击一本世界书进入详细设定。')
const worldBooks = ref([])
const activeBookId = ref('default_world_book')

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
        <button type="button" class="worldbook-add-button" @click="addWorldBook">
          ＋ 新增世界书
        </button>
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
        </button>
      </div>
    </section>

    <p class="status-message">{{ statusMessage }}</p>
  </main>
</template>

<style scoped>
.worldbook-screen {
  position: relative;
  width: 100%;
  min-height: calc(100vh - clamp(40px, 8vw, 110px));
  border: 8px solid var(--accent-cyan);
  border-radius: 34px 20px 30px 18px;
  background: var(--surface-panel);
  backdrop-filter: blur(var(--backdrop-blur));
  box-shadow: var(--shadow-screen);
  padding: clamp(18px, 3vw, 32px);
  display: grid;
  grid-template-rows: auto auto auto;
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
