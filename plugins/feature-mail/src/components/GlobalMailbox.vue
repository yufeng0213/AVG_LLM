<script setup>
/**
 * GlobalMailbox.vue - 全局信箱面板
 * 聚合所有世界书的信件，收信时可选择世界书+角色。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useMailbox } from '../composables/useMailbox.js'
import { loadWorldBooks } from '../../../../src/worldbook/worldBookStore.js'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'mail-affection-change'])

const {
  inbox,
  inboxVersion,
  stamps,
  selectedRecipient,
  letterContent,
  selectedStamp,
  isSending,
  sendingStatus,
  viewingLetter,
  activeTab,
  unreadCount,
  availableStamps,
  loadInbox,
  saveInbox,
  sendLetter,
  viewLetter,
  closeLetter,
  toggleFavorite,
  deleteLetter,
  checkPendingMails,
  startChecker,
  startCheckerAll,
  stopChecker,
  resetForm,
  STAMP_CONFIG,
} = useMailbox()

// 世界书列表
const allWorldBooks = ref([])
const selectedBookId = ref('')
const isLoadingBooks = ref(false)

const loadBooks = async () => {
  isLoadingBooks.value = true
  try {
    const books = await loadWorldBooks()
    allWorldBooks.value = Array.isArray(books) ? books : []
    if (allWorldBooks.value.length > 0 && !selectedBookId.value) {
      selectedBookId.value = allWorldBooks.value[0].id
    }
  } catch (e) {
    console.warn('[GlobalMailbox] Failed to load world books:', e)
  } finally {
    isLoadingBooks.value = false
  }
}

// 聚合所有世界书的收件箱
const globalInbox = computed(() => {
  // 依赖 inboxVersion，当 pending 生成回信/已读/删除后触发重新计算
  const _v = inboxVersion.value
  // 强制收集响应式依赖
  void inboxVersion.value
  try {
    const all = JSON.parse(localStorage.getItem('avg_llm_dormitory_mailbox_v1') || '{}')
    const entries = []
    for (const [bookId, bookState] of Object.entries(all)) {
      if (bookState?.inbox) {
        for (const letter of bookState.inbox) {
          entries.push({ ...letter, _bookId: bookId })
        }
      }
    }
    // 按时间倒序
    return entries.sort((a, b) => (b.receivedAt || b.sentAt || 0) - (a.receivedAt || a.sentAt || 0))
  } catch {
    return []
  }
})

const globalUnreadCount = computed(() => {
  return globalInbox.value.filter(l => !l.read).length
})

// 当前选中世界书的角色列表
const currentBookCharacters = computed(() => {
  const book = allWorldBooks.value.find(b => b.id === selectedBookId.value)
  if (!book || !Array.isArray(book.characters)) return []
  return book.characters.map((char, idx) => {
    const id = String(char?.id || `char_${idx + 1}`)
    const name = String(char?.name || '').trim() || `角色 ${idx + 1}`
    return { id, label: name, raw: char }
  })
})

// 选中的角色对象
const selectedCharacter = computed(() => {
  return currentBookCharacters.value.find(c => c.id === selectedRecipient.value) || null
})

// 当前选中的世界书
const selectedBook = computed(() => {
  return allWorldBooks.value.find(b => b.id === selectedBookId.value) || null
})

const charCount = computed(() => letterContent.value.length)
const isContentValid = computed(() => charCount.value >= 100 && charCount.value <= 1000)

function timeAgo(timestamp) {
  if (!timestamp) return '等待回信中...'
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

function getStampIcon(stampId) {
  const cfg = STAMP_CONFIG[stampId]
  return cfg ? cfg.icon : '🌸'
}

function getStampLabel(stampId) {
  const cfg = STAMP_CONFIG[stampId]
  return cfg ? cfg.label : ''
}

// 获取信件来源世界书标题
function getLetterBookTitle(letter) {
  if (!letter._bookId) return ''
  const book = allWorldBooks.value.find(b => b.id === letter._bookId)
  return book?.title || ''
}

function handleSend() {
  if (!isContentValid.value || !selectedRecipient.value || !selectedBookId.value) return
  const char = selectedCharacter.value
  if (!char) return

  isSending.value = true
  sendingStatus.value = 'sending'

  const success = sendLetter(selectedBookId.value, char.label)
  isSending.value = false

  if (success) {
    setTimeout(() => {
      sendingStatus.value = ''
    }, 2000)
  } else {
    sendingStatus.value = 'error'
    setTimeout(() => {
      sendingStatus.value = ''
    }, 3000)
  }
}

function handleViewLetter(letter) {
  viewLetter(letter)
  // 找到该书并标记已读
  const bookId = letter._bookId || selectedBookId.value
  if (bookId) {
    try {
      const all = JSON.parse(localStorage.getItem('avg_llm_dormitory_mailbox_v1') || '{}')
      const lsItem = all[bookId]?.inbox?.find(i => i.id === letter.id)
      if (lsItem) {
        lsItem.read = true
        localStorage.setItem('avg_llm_dormitory_mailbox_v1', JSON.stringify(all))
        // 触发 globalInbox 重新计算，更新未读数
        inboxVersion.value++
      }
    } catch { /* ignore */ }
  }
}

function handleTabSwitch(tab) {
  activeTab.value = tab
  if (tab === 'write') {
    resetForm()
  }
}

function handleSelectStamp(stampId) {
  if (stamps.value[stampId] <= 0) return
  selectedStamp.value = stampId
}

function handleDeleteLetter() {
  if (!viewingLetter.value) return
  const bookId = viewingLetter.value._bookId || selectedBookId.value
  if (!bookId) return
  if (!confirm('确定要删除这封信吗？')) return
  deleteLetter(viewingLetter.value, bookId)
}

function handleClose() {
  stopChecker()
  emit('close')
}

onMounted(() => {
  loadBooks()
  // 使用 'global' 作为邮箱加载键（聚合所有书）
  loadInbox('global')
})

onUnmounted(() => {
  stopChecker()
})

// 当切换到写信 tab 时启动邮件检查
watch([() => props.isOpen, activeTab], ([isOpen, tab]) => {
  console.log('[GlobalMailbox] watch triggered, isOpen:', isOpen, 'tab:', tab)
  if (isOpen && tab === 'inbox') {
    console.log('[GlobalMailbox] Starting checker all, currentBookCharacters:', currentBookCharacters.value.length)
    startCheckerAll(currentBookCharacters.value)
  }
})

// 当 inboxVersion 变化时，更新当前查看的信件内容
watch(inboxVersion, () => {
  if (viewingLetter.value && !viewingLetter.value.content) {
    const updated = globalInbox.value.find(l => l.id === viewingLetter.value.id)
    if (updated && updated.content) {
      viewingLetter.value.content = updated.content
      viewingLetter.value.replied = true
      viewingLetter.value.receivedAt = updated.receivedAt
      console.log('[GlobalMailbox] viewingLetter updated with reply content')
    }
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="isOpen" class="global-mailbox-modal" @click.self="handleClose">
        <div class="global-mailbox-panel">
          <!-- 顶部 -->
          <header class="mailbox-header">
            <h2 class="mailbox-title">📮 信箱</h2>
            <button type="button" class="mailbox-close-btn" @click="handleClose">✕</button>
          </header>

          <!-- 信件详情弹窗 -->
          <div v-if="viewingLetter" class="letter-overlay" @click.self="closeLetter">
            <div class="letter-detail">
              <header class="letter-detail-header">
                <button type="button" class="letter-close-btn" @click="closeLetter">✕</button>
                <span class="letter-detail-from">{{ viewingLetter.from }} 的回信</span>
                <span v-if="getLetterBookTitle(viewingLetter)" class="letter-book-tag">《{{ getLetterBookTitle(viewingLetter) }}》</span>
                <span class="letter-detail-time">{{ timeAgo(viewingLetter.receivedAt || viewingLetter.sentAt) }}</span>
              </header>
              <div class="letter-detail-content">
                <div class="letter-stamp-badge">
                  <span class="letter-stamp-icon">{{ getStampIcon(viewingLetter.stamp) }}</span>
                  <span class="letter-stamp-label">{{ getStampLabel(viewingLetter.stamp) }}</span>
                </div>
                <div v-if="viewingLetter.content" class="letter-text">
                  {{ viewingLetter.content }}
                </div>
                <div v-else class="letter-waiting">
                  <p class="waiting-dots">
                    <span>🕊️</span>
                    <span>对</span><span>方</span><span>正</span><span>在</span><span>回</span><span>信</span><span>中</span>
                  </p>
                </div>
              </div>
              <!-- 操作栏 -->
              <div class="letter-actions">
                <button
                  type="button"
                  class="letter-action-btn"
                  :class="{ 'is-favorite': viewingLetter.favorite }"
                  @click="toggleFavorite(viewingLetter, viewingLetter._bookId)"
                >
                  <span class="letter-action-icon">{{ viewingLetter.favorite ? '★' : '☆' }}</span>
                  <span class="letter-action-text">{{ viewingLetter.favorite ? '已收藏' : '收藏' }}</span>
                </button>
                <button
                  type="button"
                  class="letter-action-btn is-delete"
                  @click="handleDeleteLetter"
                >
                  <span class="letter-action-icon">🗑</span>
                  <span class="letter-action-text">删除</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Tab 切换 -->
          <div class="mailbox-tabs">
            <button
              type="button"
              class="mailbox-tab"
              :class="{ 'tab-active': activeTab === 'inbox' }"
              @click="handleTabSwitch('inbox')"
            >
              📬 收件箱
              <span v-if="globalUnreadCount > 0" class="unread-badge">{{ globalUnreadCount }}</span>
            </button>
            <button
              type="button"
              class="mailbox-tab"
              :class="{ 'tab-active': activeTab === 'write' }"
              @click="handleTabSwitch('write')"
            >
              ✉️ 写信
            </button>
          </div>

          <!-- 收件箱 -->
          <div v-if="activeTab === 'inbox'" class="mailbox-inbox">
            <template v-if="globalInbox.length === 0">
              <div class="mailbox-empty">
                <p>📭 收件箱是空的</p>
                <p class="mailbox-empty-sub">去写一封信吧！</p>
              </div>
            </template>
            <template v-else>
              <div
                v-for="letter in globalInbox"
                :key="letter.id"
                class="inbox-item"
                :class="{ 'item-unread': !letter.read }"
                @click="handleViewLetter(letter)"
              >
                <div class="inbox-item-header">
                  <span class="inbox-item-from">
                    <span v-if="!letter.read" class="unread-dot">🔴</span>
                    {{ letter.from }}
                  </span>
                  <span class="inbox-item-time">{{ timeAgo(letter.receivedAt || letter.sentAt) }}</span>
                </div>
                <div v-if="getLetterBookTitle(letter)" class="inbox-item-book">
                  《{{ getLetterBookTitle(letter) }}》
                </div>
                <div class="inbox-item-preview">
                  <template v-if="letter.replied">
                    {{ letter.content?.slice(0, 40) }}{{ letter.content?.length > 40 ? '...' : '' }}
                  </template>
                  <template v-else>
                    <span class="waiting-text">🕊️ 等待回信中...</span>
                  </template>
                </div>
                <div class="inbox-item-stamp">
                  {{ getStampIcon(letter.stamp) }} {{ getStampLabel(letter.stamp) }}
                </div>
              </div>
            </template>
          </div>

          <!-- 写信 -->
          <div v-if="activeTab === 'write'" class="mailbox-write">
            <!-- 世界书选择 -->
            <div class="write-section">
              <label class="write-label">世界书</label>
              <select v-model="selectedBookId" class="worldbook-select">
                <option value="" disabled>请选择世界书</option>
                <option v-for="book in allWorldBooks" :key="book.id" :value="book.id">
                  {{ book.title }}
                </option>
              </select>
            </div>

            <!-- 收信人选择 -->
            <div class="write-section">
              <label class="write-label">收信人</label>
              <select v-model="selectedRecipient" class="recipient-select">
                <option value="" disabled>请选择一个角色</option>
                <option v-for="char in currentBookCharacters" :key="char.id" :value="char.id">
                  {{ char.label }}
                </option>
              </select>
            </div>

            <!-- 信件内容 -->
            <div class="write-section">
              <label class="write-label">信件内容</label>
              <textarea
                v-model="letterContent"
                class="letter-textarea"
                placeholder="写下你想对 TA 说的话...（至少 100 字）"
                maxlength="1000"
                rows="8"
              ></textarea>
              <div class="char-count" :class="{ 'count-valid': isContentValid }">
                {{ charCount }}/1000 {{ charCount < 100 ? '（还需 ' + (100 - charCount) + ' 字）' : '✓' }}
              </div>
            </div>

            <!-- 邮票选择 -->
            <div class="write-section">
              <label class="write-label">邮票（选择1张贴上）</label>
              <div class="stamp-grid">
                <div
                  v-for="stamp in [
                    { id: 'stamp_normal' },
                    { id: 'stamp_star' },
                    { id: 'stamp_ribbon' },
                    { id: 'stamp_limited' },
                  ]"
                  :key="stamp.id"
                  class="stamp-option"
                  :class="{
                    'stamp-selected': selectedStamp === stamp.id,
                    'stamp-disabled': stamps[stamp.id] <= 0,
                  }"
                  @click="handleSelectStamp(stamp.id)"
                >
                  <div class="stamp-icon">{{ STAMP_CONFIG[stamp.id].icon }}</div>
                  <div class="stamp-name">{{ STAMP_CONFIG[stamp.id].label }}</div>
                  <div class="stamp-count">×{{ stamps[stamp.id] || 0 }}</div>
                </div>
              </div>
            </div>

            <!-- 发送状态 -->
            <Transition name="status-fade">
              <div v-if="sendingStatus" class="sending-status" :class="`status-${sendingStatus}`">
                <template v-if="sendingStatus === 'sending'">📮 投递中...</template>
                <template v-else-if="sendingStatus === 'sent'">✅ 投递成功！等待回信中...</template>
                <template v-else>❌ 投递失败，请检查字数和邮票</template>
              </div>
            </Transition>

            <!-- 投递按钮 -->
            <button
              type="button"
              class="send-btn"
              :class="{
                'btn-disabled': !isContentValid || !selectedRecipient || !stamps[selectedStamp] || stamps[selectedStamp] <= 0,
              }"
              :disabled="isSending || !isContentValid || !selectedRecipient"
              @click="handleSend"
            >
              📮 投递信件
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.global-mailbox-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.global-mailbox-panel {
  width: min(95vw, 560px);
  height: min(90vh, 700px);
  display: flex;
  flex-direction: column;
  background: var(--background, #0a0a0a);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
  border-radius: 18px;
  overflow: hidden;
  color: var(--foreground, #ffffff);
}

.mailbox-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
}

.mailbox-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  flex: 1;
}

.mailbox-close-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 15%, transparent);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--foreground, #ffffff);
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 150ms ease;
}

.mailbox-close-btn:hover {
  background: color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
}

.mailbox-tabs {
  display: flex;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
}

.mailbox-tab {
  flex: 1;
  padding: 12px;
  background: transparent;
  border: none;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.mailbox-tab.tab-active {
  color: var(--foreground, #ffffff);
  background: color-mix(in srgb, var(--foreground, #ffffff) 5%, transparent);
  border-bottom: 2px solid color-mix(in srgb, var(--accent-cyan, #6872D9) 40%, transparent);
}

.unread-badge {
  background: #ef4444;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.mailbox-inbox {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.mailbox-empty {
  text-align: center;
  padding: 40px 20px;
  color: color-mix(in srgb, var(--foreground, #ffffff) 35%, transparent);
}

.mailbox-empty p { font-size: 0.95rem; margin: 0; }
.mailbox-empty-sub { font-size: 0.8rem; margin-top: 8px !important; }

.inbox-item {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
  background: color-mix(in srgb, var(--foreground, #ffffff) 3%, transparent);
  cursor: pointer;
  transition: all 150ms ease;
}

.inbox-item:hover {
  background: color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
}

.inbox-item.item-unread {
  border-color: color-mix(in srgb, #ef4444 30%, transparent);
  background: color-mix(in srgb, #ef4444 5%, transparent);
}

.inbox-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.inbox-item-from {
  font-size: 0.88rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
}

.unread-dot { font-size: 0.6rem; }

.inbox-item-time {
  font-size: 0.72rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
}

.inbox-item-book {
  font-size: 0.68rem;
  color: color-mix(in srgb, var(--accent-magenta, #5E6AD2) 50%, transparent);
  margin-bottom: 4px;
}

.inbox-item-preview {
  font-size: 0.8rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  line-height: 1.4;
}

.waiting-text {
  color: color-mix(in srgb, var(--accent-yellow, #F5C542) 40%, transparent);
  font-style: italic;
}

.inbox-item-stamp {
  font-size: 0.68rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 30%, transparent);
  margin-top: 4px;
}

.mailbox-write {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.write-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.write-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: color-mix(in srgb, var(--foreground, #ffffff) 60%, transparent);
}

.worldbook-select,
.recipient-select {
  background: color-mix(in srgb, var(--foreground, #ffffff) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
  border-radius: 10px;
  padding: 8px 12px;
  color: var(--foreground, #ffffff);
  font-size: 0.85rem;
  width: 100%;
  cursor: pointer;
}

.worldbook-select option,
.recipient-select option {
  background: #1a1a2e;
  color: #fff;
}

.letter-textarea {
  background: color-mix(in srgb, var(--foreground, #ffffff) 3%, transparent);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--foreground, #ffffff);
  font-size: 0.85rem;
  line-height: 1.6;
  resize: vertical;
  width: 100%;
  font-family: inherit;
}

.letter-textarea::placeholder {
  color: color-mix(in srgb, var(--foreground, #ffffff) 20%, transparent);
}

.letter-textarea:focus {
  border-color: color-mix(in srgb, var(--accent-cyan, #6872D9) 30%, transparent);
  outline: none;
}

.char-count {
  font-size: 0.72rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
  text-align: right;
}

.char-count.count-valid {
  color: #22c55e;
}

.stamp-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stamp-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: color-mix(in srgb, var(--foreground, #ffffff) 3%, transparent);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
  border-radius: 10px;
  padding: 10px 6px;
  cursor: pointer;
  transition: all 150ms ease;
}

.stamp-option:hover:not(.stamp-disabled) {
  background: color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
}

.stamp-option.stamp-selected {
  border-color: color-mix(in srgb, var(--accent-cyan, #6872D9) 35%, transparent);
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 10%, transparent);
}

.stamp-option.stamp-disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.stamp-icon { font-size: 1.5rem; }
.stamp-name { font-size: 0.65rem; color: color-mix(in srgb, var(--foreground, #ffffff) 70%, transparent); font-weight: 600; text-align: center; white-space: nowrap; }
.stamp-count { font-size: 0.6rem; color: color-mix(in srgb, var(--accent-yellow, #F5C542) 60%, transparent); font-weight: 700; }

.sending-status {
  text-align: center;
  padding: 6px 14px;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 600;
}

.status-sending { background: color-mix(in srgb, #60a5fa 10%, transparent); color: #60a5fa; }
.status-sent { background: color-mix(in srgb, #22c55e 10%, transparent); color: #22c55e; }
.status-error { background: color-mix(in srgb, #ef4444 10%, transparent); color: #ef4444; }

.send-btn {
  appearance: none;
  border: none;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent-cyan, #6872D9) 30%, transparent), color-mix(in srgb, var(--accent-magenta, #5E6AD2) 20%, transparent));
  color: var(--foreground, #ffffff);
  font-size: 0.95rem;
  font-weight: 800;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 150ms ease;
}

.send-btn:hover:not(.btn-disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--accent-cyan, #6872D9) 15%, transparent);
}

.send-btn:active:not(.btn-disabled) {
  transform: scale(0.97);
}

.send-btn.btn-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 信件详情 */
.letter-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 10;
}

.letter-detail {
  background: var(--background, #0a0a0a);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 15%, transparent);
  border-radius: 16px;
  max-width: 420px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}

.letter-detail-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
  position: relative;
}

.letter-close-btn {
  position: absolute;
  top: 8px;
  right: 12px;
  background: none;
  border: none;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px;
}

.letter-close-btn:hover { color: var(--foreground, #ffffff); }

.letter-detail-from {
  font-size: 0.95rem;
  font-weight: 700;
}

.letter-book-tag {
  font-size: 0.68rem;
  color: color-mix(in srgb, var(--accent-magenta, #5E6AD2) 50%, transparent);
}

.letter-detail-time {
  font-size: 0.7rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
}

.letter-detail-content {
  padding: 16px;
}

/* 操作栏 */
.letter-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 12px 16px;
  border-top: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
}

.letter-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
  border-radius: 10px;
  padding: 8px 16px;
  color: color-mix(in srgb, var(--foreground, #ffffff) 60%, transparent);
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 150ms ease;
}

.letter-action-btn:hover {
  background: color-mix(in srgb, var(--foreground, #ffffff) 5%, transparent);
  color: var(--foreground, #ffffff);
}

.letter-action-btn.is-favorite {
  color: color-mix(in srgb, var(--accent-yellow, #F5C542) 80%, transparent);
  border-color: color-mix(in srgb, var(--accent-yellow, #F5C542) 30%, transparent);
}

.letter-action-btn.is-delete:hover {
  background: color-mix(in srgb, #ef4444 10%, transparent);
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 30%, transparent);
}

.letter-action-icon {
  font-size: 1rem;
}

.letter-action-text {
  font-weight: 600;
}

.letter-stamp-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: color-mix(in srgb, var(--accent-yellow, #F5C542) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-yellow, #F5C542) 10%, transparent);
  border-radius: 8px;
  padding: 4px 10px;
  margin-bottom: 16px;
  width: fit-content;
}

.letter-stamp-icon { font-size: 1rem; }
.letter-stamp-label { font-size: 0.7rem; color: color-mix(in srgb, var(--accent-yellow, #F5C542) 60%, transparent); }

.letter-text {
  font-size: 0.85rem;
  line-height: 1.8;
  color: color-mix(in srgb, var(--foreground, #ffffff) 80%, transparent);
  white-space: pre-wrap;
}

.letter-waiting {
  text-align: center;
  padding: 20px;
}

.letter-waiting .waiting-dots {
  display: inline-flex;
  gap: 4px;
  font-size: 0.9rem;
  color: color-mix(in srgb, var(--accent-yellow, #F5C542) 50%, transparent);
}

.letter-waiting .waiting-dots span {
  animation: waiting-bounce 1.4s infinite ease-in-out both;
}

.letter-waiting .waiting-dots span:nth-child(1) { animation-delay: 0s; }
.letter-waiting .waiting-dots span:nth-child(2) { animation-delay: 0.1s; }
.letter-waiting .waiting-dots span:nth-child(3) { animation-delay: 0.2s; }
.letter-waiting .waiting-dots span:nth-child(4) { animation-delay: 0.3s; }
.letter-waiting .waiting-dots span:nth-child(5) { animation-delay: 0.4s; }
.letter-waiting .waiting-dots span:nth-child(6) { animation-delay: 0.5s; }
.letter-waiting .waiting-dots span:nth-child(7) { animation-delay: 0.6s; }
.letter-waiting .waiting-dots span:nth-child(8) { animation-delay: 0.7s; }
.letter-waiting .waiting-dots span:nth-child(9) { animation-delay: 0.8s; }

@keyframes waiting-bounce {
  0%, 80%, 100% {
    transform: scale(0.8);
    opacity: 0.4;
  }
  40% {
    transform: scale(1.1);
    opacity: 1;
  }
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 200ms ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.status-fade-enter-active,
.status-fade-leave-active {
  transition: all 0.3s ease;
}

.status-fade-enter-from,
.status-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
