<script setup>
/**
 * TeamSelectScreen.vue - 全屏路由版队友选择界面
 * 先选世界书，再选队友（最多3人 + 玩家 = 4人）
 */
import { computed, ref, watch, onMounted } from 'vue'
import { loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'

const props = defineProps({
  taskId: { type: String, default: '' },
})

const emit = defineEmits(['back', 'start-battle'])

const worldBooks = ref([])
const selectedBookId = ref('')
const selectedIds = ref(new Set())

const maxSlots = 3

const safeCharacters = computed(() => {
  const book = worldBooks.value.find(b => b.id === selectedBookId.value)
  const chars = book?.characters
  return Array.isArray(chars) ? chars.filter(Boolean) : []
})

const selectedList = computed(() => {
  return safeCharacters.value.filter(c => selectedIds.value.has(c.id))
})

const teamSize = computed(() => selectedIds.value.size)

// 组件挂载时加载世界书
onMounted(async () => {
  try {
    const books = await loadWorldBooks()
    worldBooks.value = books
    if (books.length > 0) {
      selectedBookId.value = books[0].id
    }
  } catch (e) {
    console.warn('[TeamSelectScreen] 加载世界书失败:', e)
  }
})

// 切换世界书时清空已选
watch(selectedBookId, () => {
  selectedIds.value = new Set()
})

function toggleSelect(charId) {
  const next = new Set(selectedIds.value)
  if (next.has(charId)) {
    next.delete(charId)
  } else {
    if (next.size >= maxSlots) return
    next.add(charId)
  }
  selectedIds.value = next
}

function canStartBattle() {
  return selectedIds.value.size >= 1
}

function handleStartBattle() {
  if (!canStartBattle()) return
  const book = worldBooks.value.find(b => b.id === selectedBookId.value)
  const selected = safeCharacters.value.filter(c => selectedIds.value.has(c.id))
  emit('start-battle', {
    worldBook: book || {},
    selectedCharacters: selected,
  })
}

function handleBack() {
  emit('back')
}

</script>

<template>
  <div class="team-screen">
    <!-- 顶部返回 + 标题 -->
    <header class="team-screen-header">
      <button type="button" class="team-back-btn" @click="handleBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="team-title">组队出征</h2>
      <div style="width:40px"></div>
    </header>

    <!-- 世界书选择 -->
    <div class="team-book-selector">
      <label class="book-label">选择世界书：</label>
      <select v-model="selectedBookId" class="book-select">
        <option v-for="book in worldBooks" :key="book.id" :value="book.id">
          《{{ book.title || '未命名世界书' }}》
        </option>
        <option v-if="worldBooks.length === 0" value="" disabled>暂无世界书</option>
      </select>
    </div>

    <!-- 玩家（自动加入） -->
    <div class="team-player-section">
      <span class="team-player-label">玩家（自动加入）</span>
      <div class="team-player-card">
        <span class="player-icon">&#x1F9D1;</span>
        <span class="player-name">玩家</span>
      </div>
    </div>

    <!-- 可选角色列表 -->
    <div class="team-characters-section">
      <p class="section-hint">选择队友（至少1人，最多{{ maxSlots }}人）</p>
      <div class="characters-grid">
        <div
          v-for="char in safeCharacters"
          :key="char.id"
          class="character-card"
          :class="{ selected: selectedIds.has(char.id) }"
          @click="toggleSelect(char.id)"
        >
          <div class="char-avatar">
            <span v-if="char.portraits?.[0]" class="char-portrait">
              <img :src="char.portraits[0]" :alt="char.name" />
            </span>
            <span v-else class="char-avatar-placeholder">&#x1F464;</span>
            <span v-if="selectedIds.has(char.id)" class="char-check">&#x2713;</span>
          </div>
          <span class="char-name">{{ char.name }}</span>
          <span v-if="char.identity" class="char-identity">{{ char.identity }}</span>
        </div>

        <div v-if="safeCharacters.length === 0" class="empty-characters">
          <p>该世界书暂无可选角色</p>
          <p class="empty-hint">请先在世界书中创建角色</p>
        </div>
      </div>
    </div>

    <!-- 已选队伍预览 -->
    <div class="team-preview-section">
      <p class="section-hint">队伍预览（已选 {{ teamSize }}/{{ maxSlots }}）</p>
      <div class="team-slots">
        <!-- 玩家固定第一个 -->
        <div class="team-slot is-player">
          <span class="slot-avatar">&#x1F9D1;</span>
          <span class="slot-name">玩家</span>
        </div>
        <!-- 已选角色 -->
        <div
          v-for="char in selectedList"
          :key="char.id"
          class="team-slot"
        >
          <span class="slot-avatar">
            <template v-if="char.portraits?.[0]">
              <img :src="char.portraits[0]" :alt="char.name" />
            </template>
            <template v-else>&#x1F464;</template>
          </span>
          <span class="slot-name">{{ char.name }}</span>
        </div>
        <!-- 空位 -->
        <div
          v-for="i in (maxSlots - teamSize)"
          :key="'empty-' + i"
          class="team-slot is-empty"
        >
          <span class="slot-avatar">?</span>
          <span class="slot-name">空位</span>
        </div>
      </div>
    </div>

    <!-- 进入战斗按钮 -->
    <div class="team-footer">
      <button
        type="button"
        class="team-start-btn"
        :class="{ disabled: !canStartBattle() }"
        :disabled="!canStartBattle()"
        @click="handleStartBattle"
      >
        &#x2694;&#xFE0F; 进入战斗
      </button>
    </div>
  </div>
</template>

<style scoped>
.team-screen {
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
.team-screen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(180deg, #1a0a2e 0%, rgba(26,10,46,0.95) 100%);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 215, 0, 0.1);
  flex-shrink: 0;
}

.team-back-btn {
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
.team-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.team-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #ffd700;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
  text-align: center;
  flex: 1;
}

/* Book selector */
.team-book-selector {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(26, 10, 46, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.book-label {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}

.book-select {
  flex: 1;
  appearance: none;
  border: 1px solid rgba(255, 215, 0, 0.25);
  border-radius: 8px;
  padding: 8px 12px;
  background: rgba(255, 215, 0, 0.08);
  color: #ffd700;
  font-size: 0.85rem;
  cursor: pointer;
  outline: none;
  transition: all 150ms ease;
}
.book-select:focus {
  border-color: rgba(255, 215, 0, 0.5);
  background: rgba(255, 215, 0, 0.12);
}

/* Player section */
.team-player-section {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.team-player-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: block;
  margin-bottom: 8px;
}

.team-player-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.player-icon {
  font-size: 24px;
}

.player-name {
  font-size: 15px;
  font-weight: 600;
}

/* Characters grid */
.team-characters-section {
  padding: 12px 16px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.section-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 10px;
}

.characters-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.character-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: calc((100% - 30px) / 4);
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  position: relative;
}

.character-card:hover {
  background: rgba(255, 255, 255, 0.1);
}

.character-card.selected {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.15);
}

.char-avatar {
  position: relative;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 8px;
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
  font-size: 24px;
}

.char-check {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 20px;
  height: 20px;
  background: #3b82f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.char-name {
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.char-identity {
  font-size: 10px;
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
  padding: 32px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

.empty-hint {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.2);
}

/* Team preview */
.team-preview-section {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.team-slots {
  display: flex;
  gap: 10px;
}

.team-slot {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 10px;
}

.team-slot.is-player {
  background: rgba(234, 179, 8, 0.1);
  border-color: rgba(234, 179, 8, 0.3);
}

.team-slot.is-empty {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.1);
}

.slot-avatar {
  font-size: 20px;
}

.slot-avatar img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

.slot-name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* Footer */
.team-footer {
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.team-start-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  cursor: pointer;
  transition: all 0.2s;
}

.team-start-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(220, 38, 38, 0.4);
}

.team-start-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
