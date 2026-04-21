<script setup>
/**
 * PhoneMomentsApp.vue - 朋友圈/动态
 * 角色发动态，玩家点赞评论，角色回应
 */
import { computed, onMounted, ref } from 'vue'
import { usePhoneMoments } from './composables/usePhoneMoments.js'
import { getGroupedContacts, getWorldBookById } from './composables/usePhoneData.js'
import { useCharacterSchedule } from '../../../feature-character-schedule/src/composables/useCharacterSchedule.js'
import { SCHEDULE_ACTIVITY_TYPES } from '../../../feature-character-schedule/src/composables/useScheduleTime.js'

const emit = defineEmits(['back'])

const moments = usePhoneMoments()
const contacts = ref([])
const schedule = useCharacterSchedule()

// 联系人缓存 + 自动生成动态
onMounted(async () => {
  contacts.value = await getGroupedContacts()
  await generateScheduledMoments()
})

// 打开App时自动生成一轮角色动态（基于当前日程）
async function generateScheduledMoments() {
  const allChars = contacts.value.flatMap(g => g.characters || [])
  for (const char of allChars) {
    // 已看过该角色的动态？（30分钟内只生成一次）
    const recentFromChar = moments.moments.filter(m => m.charId === char.id)
    if (recentFromChar.length > 0) {
      const lastTime = new Date(recentFromChar[0].createdAt).getTime()
      if (Date.now() - lastTime < 30 * 60 * 1000) continue
    }

    const status = schedule.getCharacterStatus(char.worldBookId || '', char.id)
    if (!status) continue

    // 30%概率发动态
    if (Math.random() > 0.3) continue

    // 如果角色不可交互（睡觉、工作等），降低到10%
    if (!status.canContact && Math.random() > 0.1) continue

    const activityType = status.currentActivity || 'leisure'
    const book = await getWorldBookById(char.worldBookId || '')
    if (!book) continue

    await moments.generateMomentForChar(
      char.worldBookId || book.id,
      char.id,
      char.name,
      activityType,
      null, // mood 后续可从日程心情获取
    )
  }
}

// 头像缓存
const avatarCache = {}
function getCharAvatar(char) {
  if (char.portraits?.[0]) return char.portraits[0]
  return ''
}

// 评论输入框状态
const commentingId = ref(null)
const commentText = ref('')

function startComment(momentId) {
  commentingId.value = momentId
  commentText.value = ''
}

function cancelComment() {
  commentingId.value = null
  commentText.value = ''
}

async function submitComment(momentId) {
  if (!commentText.value.trim()) return
  await moments.commentMoment(momentId, commentText.value)
  cancelComment()
}

function formatTime(isoStr) {
  const now = new Date()
  const d = new Date(isoStr)
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days <= 7) return `${days}天前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// 全部动态（按时间倒序）
const allMoments = computed(() => {
  return [...moments.moments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

// 未读数
const unreadCount = computed(() => moments.unseenMoments.length)

// 查看全部已读
async function markAllRead() {
  await moments.markAllSeen()
}
</script>

<template>
  <div class="moments-app">
    <!-- 顶部导航 -->
    <div class="phone-app-header">
      <button type="button" class="phone-app-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <h2 class="phone-app-title">朋友圈</h2>
      <button v-if="unreadCount > 0" type="button" class="phone-app-back-btn" @click="markAllRead">
        全部已读 {{ unreadCount > 99 ? '99+' : unreadCount }}
      </button>
      <div v-else class="phone-app-header-spacer" />
    </div>

    <!-- 动态列表 -->
    <div class="moments-list">
      <div v-if="allMoments.length === 0" class="moments-empty">
        <span class="empty-icon">🌍</span>
        <p class="empty-text">还没有人发动态</p>
        <p class="empty-hint">角色会根据自己的日程发动态哦</p>
      </div>

      <div v-for="moment in allMoments" :key="moment.id" class="moment-card" :class="{ unseen: !moments.seenMoments.find(m => m.id === moment.id) && moments.unseenMoments.find(m => m.id === moment.id) }">
        <!-- 头部：头像 + 昵称 + 时间 -->
        <div class="moment-header">
          <div class="moment-avatar">
            <template v-for="group in contacts" :key="group.worldBookId">
              <template v-for="char in (group.characters || [])" :key="char.id">
                <img v-if="char.id === moment.charId && getCharAvatar(char)" :src="getCharAvatar(char)" class="avatar-img" />
              </template>
            </template>
            <span v-if="!contacts.flatMap(g => g.characters || []).find(c => c.id === moment.charId && c.portraits?.[0])" class="avatar-text">{{ moment.charName.slice(0, 1) }}</span>
          </div>
          <div class="moment-author">
            <span class="author-name">{{ moment.charName }}</span>
            <span class="author-time">{{ formatTime(moment.createdAt) }}</span>
          </div>
        </div>

        <!-- 动态内容 -->
        <div class="moment-content">
          <span class="moment-emoji">{{ moment.emoji }}</span>
          <span class="moment-text">{{ moment.text }}</span>
        </div>

        <!-- 互动区 -->
        <div class="moment-actions">
          <!-- 点赞 -->
          <button type="button" class="action-btn like-btn" :class="{ liked: moment.likes?.includes('player') }" @click="moments.likeMoment(moment.id)">
            <span>{{ moment.likes?.includes('player') ? '❤️' : '🤍' }}</span>
            <span v-if="moment.likes?.length > 0">{{ moment.likes.length }}</span>
          </button>

          <!-- 评论 -->
          <button type="button" class="action-btn comment-btn" @click="startComment(moment.id)">
            💬 <span v-if="moment.comments?.length > 0">{{ moment.comments.length }}</span>
          </button>
        </div>

        <!-- 角色回应 -->
        <div class="char-reply" v-if="moment.charReply">
          <span class="reply-name">{{ moment.charName }}：</span>
          <span class="reply-text">{{ moment.charReply.text }}</span>
        </div>

        <!-- 玩家评论列表 -->
        <div class="comment-list" v-if="moment.comments?.length > 0">
          <div v-for="comment in moment.comments" :key="comment.id" class="comment-item">
            <span class="comment-author">我：</span>
            <span class="comment-text">{{ comment.text }}</span>
          </div>
        </div>

        <!-- 评论输入框 -->
        <div class="comment-input-row" v-if="commentingId === moment.id">
          <input
            v-model="commentText"
            class="comment-input"
            placeholder="写评论..."
            maxlength="100"
            @keydown.enter="submitComment(moment.id)"
          />
          <button type="button" class="comment-send" @click="submitComment(moment.id)">发送</button>
          <button type="button" class="comment-cancel" @click="cancelComment()">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.moments-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1c1c1e;
  color: #fff;
}

.moments-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.moments-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.empty-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 4px;
}

.moment-card {
  padding: 12px;
  background: rgba(44, 44, 46, 0.6);
  border-radius: 12px;
  margin-bottom: 8px;
}

.moment-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.moment-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-text {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.moment-author {
  display: flex;
  flex-direction: column;
}

.author-name {
  font-size: 14px;
  font-weight: 500;
}

.author-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.moment-content {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
}

.moment-emoji {
  font-size: 22px;
}

.moment-text {
  font-size: 14px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.9);
}

.moment-actions {
  display: flex;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
}

.action-btn span:last-child {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.char-reply {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(255, 204, 0, 0.08);
  border-radius: 8px;
}

.reply-name {
  font-size: 12px;
  font-weight: 500;
  color: #ffd60a;
}

.reply-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.comment-list {
  margin-top: 8px;
}

.comment-item {
  padding: 4px 0;
}

.comment-author {
  font-size: 12px;
  font-weight: 500;
  color: #5ac8fa;
}

.comment-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.comment-input-row {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}

.comment-input {
  flex: 1;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  color: #fff;
  font-size: 13px;
  outline: none;
}

.comment-send {
  padding: 6px 12px;
  background: rgba(255, 204, 0, 0.2);
  border: none;
  border-radius: 16px;
  color: #ffd60a;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.comment-cancel {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 16px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
</style>
