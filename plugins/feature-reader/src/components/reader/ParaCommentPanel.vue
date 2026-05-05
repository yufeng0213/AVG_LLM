<script setup>
/**
 * ParaCommentPanel.vue - 段评/章评悬浮面板
 * 微信读书风格的右侧滑入面板
 */
import { ref, computed, watch, nextTick } from 'vue'
import { addComment, addReply, toggleLike, getCommentedParagraphs } from '../../composables/useReaderComments.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  storyId: { type: String, required: true },
  chapterIndex: { type: Number, required: true },
  paraIdx: { type: [Number, String], default: 'chapter' },
  comments: { type: Object, default: () => ({ chapterComments: [], paragraphComments: {} }) },
})
const emit = defineEmits(['close', 'refresh'])

const panelVisible = ref(false)
const commentList = ref([])
const inputText = ref('')
const replyTarget = ref(null)
const sending = ref(false)

// 监听面板打开
watch(() => props.visible, async (val) => {
  if (val) {
    panelVisible.value = true
    loadComments()
  } else {
    panelVisible.value = false
    replyTarget.value = null
    inputText.value = ''
  }
})

function loadComments() {
  const key = props.paraIdx === 'chapter' ? 'chapterComments' : String(props.paraIdx)
  commentList.value = props.paraIdx === 'chapter'
    ? [...(props.comments.chapterComments || [])]
    : [...(props.comments.paragraphComments?.[key] || [])]
}

const panelTitle = computed(() => {
  if (props.paraIdx === 'chapter') return '章评'
  return `第${Number(props.paraIdx) + 1}段 段评`
})

function getCommentCount() {
  if (props.paraIdx === 'chapter') return props.comments.chapterComments?.length || 0
  return props.comments.paragraphComments?.[String(props.paraIdx)]?.length || 0
}

async function handleSend() {
  if (!inputText.value.trim() || sending.value) return
  sending.value = true

  const comment = {
    id: `user_cmt_${Date.now()}`,
    author: '我',
    avatar: '🙋',
    content: inputText.value.trim(),
    likes: 0,
    replies: [],
    isUser: true,
    createdAt: new Date().toISOString(),
  }

  if (replyTarget.value) {
    await addReply(props.storyId, props.chapterIndex, props.paraIdx, replyTarget.value.id, comment)
    replyTarget.value.replies.push(comment)
  } else {
    await addComment(props.storyId, props.chapterIndex, props.paraIdx, comment)
    commentList.value.push(comment)
  }

  inputText.value = ''
  replyTarget.value = null
  sending.value = false
  emit('refresh')
}

async function handleLike(comment) {
  const { liked } = await toggleLike(props.storyId, props.chapterIndex, props.paraIdx, comment.id)
  comment.liked = liked
  comment.likes = liked ? (comment.likes || 0) + 1 : Math.max(0, (comment.likes || 1) - 1)
}

function handleReply(comment) {
  replyTarget.value = replyTarget.value?.id === comment.id ? null : comment
  inputText.value = ''
  nextTick(() => {
    const el = document.querySelector('.comment-reply-input')
    el?.focus()
  })
}

function formatTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="slide">
      <div v-if="panelVisible" class="comment-panel-overlay" @click.self="handleClose">
        <div class="comment-panel">
          <!-- 顶部 -->
          <div class="panel-header">
            <h3 class="panel-title">{{ panelTitle }} ({{ getCommentCount() }})</h3>
            <button class="panel-close" @click="handleClose">×</button>
          </div>

          <!-- 评论列表 -->
          <div class="panel-body">
            <div v-if="commentList.length === 0" class="empty-comments">
              <span class="empty-icon">💬</span>
              <p class="empty-text">还没有评论，快来抢沙发～</p>
            </div>
            <div v-else class="comment-list">
              <div v-for="comment in commentList" :key="comment.id" class="comment-item">
                <span class="comment-avatar">{{ comment.avatar || '🗣' }}</span>
                <div class="comment-main">
                  <div class="comment-header">
                    <span class="comment-author">{{ comment.author }}</span>
                    <span class="comment-time">{{ formatTime(comment.createdAt) }}</span>
                  </div>
                  <p class="comment-content">{{ comment.content }}</p>
                  <div class="comment-actions">
                    <button
                      class="action-btn"
                      :class="{ liked: comment.liked }"
                      @click="handleLike(comment)"
                    >
                      {{ comment.liked ? '❤️' : '🤍' }} {{ comment.likes || 0 }}
                    </button>
                    <button class="action-btn" @click="handleReply(comment)">
                      💬 回复 {{ comment.replies?.length || '' }}
                    </button>
                  </div>

                  <!-- 回复列表 -->
                  <div v-if="comment.replies?.length" class="replies">
                    <div v-for="reply in comment.replies" :key="reply.id" class="reply-item">
                      <span class="reply-avatar">{{ reply.avatar || '🗣' }}</span>
                      <div class="reply-main">
                        <div class="reply-header">
                          <span class="reply-author">{{ reply.author }}</span>
                          <span class="reply-time">{{ formatTime(reply.createdAt) }}</span>
                        </div>
                        <p class="reply-content">{{ reply.content }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 回复输入框 -->
          <div v-if="replyTarget" class="reply-notice">
            回复 <span class="reply-notice-name">{{ replyTarget.author }}</span>
            <button class="cancel-reply" @click="replyTarget = null">×</button>
          </div>

          <!-- 底部输入 -->
          <div class="panel-footer">
            <input
              class="comment-reply-input"
              v-model="inputText"
              type="text"
              :placeholder="replyTarget ? '写下你的回复...' : '写下你的评论...'"
              maxlength="200"
              @keyup.enter="handleSend"
            />
            <button
              class="send-btn"
              :disabled="!inputText.trim() || sending"
              @click="handleSend"
            >
              {{ sending ? '...' : '发送' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.comment-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.comment-panel {
  width: 320px;
  max-width: 85vw;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #ede4ff;
  flex-shrink: 0;
}

.panel-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0;
}

.panel-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #8b7ea8;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px 0;
}

.empty-comments {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
}

.empty-icon {
  font-size: 3rem;
}

.empty-text {
  font-size: 0.85rem;
  color: #b0a8c0;
  margin: 0;
}

.comment-list {
  padding: 0 12px;
}

.comment-item {
  display: flex;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid #f0e8ff;
}

.comment-avatar {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.comment-main {
  flex: 1;
  min-width: 0;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.comment-author {
  font-size: 0.78rem;
  font-weight: 600;
  color: #7c5cbf;
}

.comment-time {
  font-size: 0.7rem;
  color: #b0a8c0;
}

.comment-content {
  font-size: 0.82rem;
  color: #2d2040;
  line-height: 1.5;
  margin: 0 0 6px;
  word-break: break-word;
}

.comment-actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  background: none;
  border: none;
  font-size: 0.72rem;
  color: #b0a8c0;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 3px;
}

.action-btn:hover {
  color: #7c5cbf;
}

.action-btn.liked {
  color: #e74c3c;
}

/* 回复 */
.replies {
  margin-top: 8px;
  background: #f8f4ff;
  border-radius: 8px;
  padding: 8px 10px;
}

.reply-item {
  display: flex;
  gap: 8px;
  padding: 6px 0;
}

.reply-avatar {
  font-size: 0.9rem;
  flex-shrink: 0;
}

.reply-main {
  flex: 1;
  min-width: 0;
}

.reply-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.reply-author {
  font-size: 0.72rem;
  font-weight: 600;
  color: #7c5cbf;
}

.reply-time {
  font-size: 0.65rem;
  color: #b0a8c0;
}

.reply-content {
  font-size: 0.78rem;
  color: #5a3d8a;
  line-height: 1.4;
  margin: 0;
  word-break: break-word;
}

/* 回复提示 */
.reply-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #f0e8ff;
  font-size: 0.78rem;
  color: #7c5cbf;
  flex-shrink: 0;
}

.reply-notice-name {
  font-weight: 600;
}

.cancel-reply {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 1.1rem;
  color: #b0a8c0;
  cursor: pointer;
}

/* 底部输入 */
.panel-footer {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #ede4ff;
  background: #fff;
  flex-shrink: 0;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
}

.comment-reply-input {
  flex: 1;
  background: #f8f4ff;
  border: 1px solid #e0d4f5;
  border-radius: 20px;
  padding: 8px 14px;
  font-size: 0.82rem;
  color: #2d2040;
  outline: none;
}

.comment-reply-input:focus {
  border-color: #7c5cbf;
}

.send-btn {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  border: none;
  color: #fff;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 滑入动画 */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
