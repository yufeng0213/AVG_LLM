<script setup>
/**
 * TRPGScreen.vue - 全屏路由版 TRPG 跑团界面
 * 包装 TRPGPanel，支持跨世界书角色选择。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'
import TRPGPanel from './TRPGPanel.vue'
import { useGlobalUser } from '../../../src/composables/useGlobalUser.js'

const emit = defineEmits(['back'])

const trpgPanelRef = ref(null)
const globalUser = useGlobalUser()

// 世界书
const worldBooks = ref([])
const selectedBookId = ref('')

// 当前世界书的角色
const currentBookCharacters = computed(() => {
  const book = worldBooks.value.find(b => b.id === selectedBookId.value)
  const chars = book?.characters
  return Array.isArray(chars) ? chars.filter(Boolean) : []
})

// 已选角色（跨世界书，最多3个）
const selectedCharacters = ref([])
const maxSlots = 3

// 展开/折叠角色选择面板
const showCharPanel = ref(false)

// 检查角色是否已在其他世界书中被选中
function isAlreadySelected(charId) {
  return selectedCharacters.value.some(c => c.id === charId)
}

// 切换选择
function toggleSelect(char) {
  const idx = selectedCharacters.value.findIndex(c => c.id === char.id)
  if (idx >= 0) {
    selectedCharacters.value = selectedCharacters.value.filter(c => c.id !== char.id)
  } else {
    if (selectedCharacters.value.length >= maxSlots) return
    // 给角色标记来源世界书
    const book = worldBooks.value.find(b => b.id === selectedBookId.value)
    selectedCharacters.value.push({
      ...char,
      _sourceBookTitle: book?.title || '',
    })
  }
}

// 移除已选角色
function removeSelected(charId) {
  selectedCharacters.value = selectedCharacters.value.filter(c => c.id !== charId)
}

// 切换世界书时不自动清空（因为支持跨世界书），但收起面板
watch(selectedBookId, () => {
  showCharPanel.value = false
})

onMounted(async () => {
  try {
    const books = await loadWorldBooks()
    worldBooks.value = books
    if (books.length > 0) {
      selectedBookId.value = books[0].id
    }
  } catch (e) {
    console.warn('[TRPGScreen] 加载世界书失败:', e)
  }
})

const handleClose = () => {
  emit('back')
}

defineExpose({
  open: () => trpgPanelRef.value?.open(),
})
</script>

<template>
  <div class="trpg-screen">
    <!-- 顶部返回 + 标题 -->
    <header class="trpg-screen-header">
      <button type="button" class="trpg-screen-back-btn" @click="handleClose">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="trpg-screen-title">TRPG 跑团</h2>
      <div style="width:40px"></div>
    </header>

    <!-- 世界书选择 + 添加按钮 -->
    <div class="trpg-book-bar">
      <div class="trpg-book-selector">
        <label class="book-label">世界书：</label>
        <select v-model="selectedBookId" class="book-select">
          <option v-for="book in worldBooks" :key="book.id" :value="book.id">
            《{{ book.title || '未命名世界书' }}》
          </option>
          <option v-if="worldBooks.length === 0" value="" disabled>暂无世界书</option>
        </select>
      </div>
      <button
        type="button"
        class="trpg-add-char-btn"
        :class="{ active: showCharPanel }"
        @click="showCharPanel = !showCharPanel"
      >
        {{ showCharPanel ? '收起' : '＋ 添加角色' }}
      </button>
    </div>

    <!-- 角色选择面板 -->
    <div v-if="showCharPanel" class="trpg-char-panel">
      <div class="char-panel-header">
        <span class="char-panel-title">从《{{ worldBooks.find(b => b.id === selectedBookId)?.title || '未命名' }}》选择角色</span>
        <span class="char-panel-hint">已选 {{ selectedCharacters.length }}/{{ maxSlots }}</span>
      </div>
      <div class="char-grid">
        <div
          v-for="char in currentBookCharacters"
          :key="char.id"
          class="char-card"
          :class="{
            selected: isAlreadySelected(char.id),
            disabled: !isAlreadySelected(char.id) && selectedCharacters.length >= maxSlots,
          }"
          @click="toggleSelect(char)"
        >
          <div class="char-avatar">
            <span v-if="char.portraits?.[0]" class="char-portrait">
              <img :src="char.portraits[0]" :alt="char.name" />
            </span>
            <span v-else class="char-avatar-placeholder">&#x1F464;</span>
            <span v-if="isAlreadySelected(char.id)" class="char-check">&#x2713;</span>
          </div>
          <span class="char-name">{{ char.name }}</span>
          <span v-if="char.identity" class="char-identity">{{ char.identity }}</span>
        </div>
        <div v-if="currentBookCharacters.length === 0" class="empty-characters">
          <p>该世界书暂无可选角色</p>
        </div>
      </div>
    </div>

    <!-- TRPGPanel -->
    <TRPGPanel
      ref="trpgPanelRef"
      :is-open="true"
      :active-book="null"
      :user-name="globalUser.username.value || '玩家'"
      :selected-characters="selectedCharacters"
      :no-teleport="true"
      @close="handleClose"
      @remove-character="removeSelected"
    />
  </div>
</template>

<style scoped>
.trpg-screen {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: var(--background, #0a0a0a);
  color: var(--foreground, #ffffff);
  overflow: hidden;
}

/* Header */
.trpg-screen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(180deg, #1a0a2e 0%, rgba(26,10,46,0.95) 100%);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 215, 0, 0.1);
  flex-shrink: 0;
}

.trpg-screen-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.trpg-screen-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.trpg-screen-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #ffd700;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
  text-align: center;
  flex: 1;
}

/* Book bar */
.trpg-book-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(26, 10, 46, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.trpg-book-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.book-label {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}

.book-select {
  flex: 1;
  appearance: none;
  border: 1px solid rgba(255, 215, 0, 0.25);
  border-radius: 8px;
  padding: 7px 10px;
  background: rgba(255, 215, 0, 0.08);
  color: #ffd700;
  font-size: 0.82rem;
  cursor: pointer;
  outline: none;
  transition: all 150ms ease;
}
.book-select:focus {
  border-color: rgba(255, 215, 0, 0.5);
  background: rgba(255, 215, 0, 0.12);
}

.trpg-add-char-btn {
  appearance: none;
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 8px;
  padding: 7px 14px;
  background: rgba(0, 212, 255, 0.1);
  color: #00d4ff;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}
.trpg-add-char-btn:hover { background: rgba(0, 212, 255, 0.18); }
.trpg-add-char-btn.active {
  background: rgba(0, 212, 255, 0.2);
  border-color: rgba(0, 212, 255, 0.5);
}

/* Char panel */
.trpg-char-panel {
  padding: 12px 16px;
  background: rgba(15, 26, 46, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  max-height: 45vh;
  overflow-y: auto;
}

.char-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.char-panel-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.char-panel-hint {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

.char-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.char-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: calc((100% - 30px) / 4);
  padding: 10px 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.char-card:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.char-card.selected {
  border-color: #00d4ff;
  background: rgba(0, 212, 255, 0.12);
}

.char-card.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.char-avatar {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
}

.char-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.char-avatar-placeholder {
  font-size: 22px;
}

.char-check {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  background: #00d4ff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #0a0a0a;
}

.char-name {
  font-size: 0.78rem;
  font-weight: 600;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.char-identity {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  margin-top: 2px;
}

.empty-characters {
  width: 100%;
  text-align: center;
  padding: 24px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 0.85rem;
}

 .platform-android.android-portrait .trpg-screen-back-btn,
 .platform-android.android-portrait .trpg-add-char-btn {
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
