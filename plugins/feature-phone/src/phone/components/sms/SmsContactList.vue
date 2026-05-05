<script setup>
/**
 * SmsContactList.vue — 私聊联系人列表 + 群聊列表 + 标签切换（浅色 IM 风格）
 */
import { computed, ref } from 'vue'

const props = defineProps({
  contacts: { type: Array, required: true },
  groupChats: { type: Array, required: true },
  activeTab: { type: String, default: 'private' },
  npcSmsThreads: { type: Array, default: () => [] },
  getLastMessage: { type: Function, required: true },
  getLastGroupMessage: { type: Function, required: true },
  getOnlineStatusForChar: { type: Function, required: true },
  formatSmsTime: { type: Function, required: true },
  getCharAvatar: { type: Function, required: true },
  getGroupMemberCount: { type: Function, required: true },
})

const emit = defineEmits(['select-contact', 'select-group', 'update:activeTab', 'create-group', 'open-npc-thread', 'avatar-pointer-down', 'avatar-pointer-up', 'avatar-pointer-leave'])

// 搜索
const searchQuery = ref('')

// 分组折叠状态
const collapsedGroups = ref(new Set())

function toggleGroup(worldBookId) {
  const set = new Set(collapsedGroups.value)
  if (set.has(worldBookId)) set.delete(worldBookId)
  else set.add(worldBookId)
  collapsedGroups.value = set
}

// 过滤联系人
const filteredContacts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.contacts

  return props.contacts.map(g => ({
    ...g,
    characters: (g.characters || []).filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.identity || '').toLowerCase().includes(q) ||
      (c.nickname || '').toLowerCase().includes(q),
    ),
  })).filter(g => g.characters.length > 0)
})

function onAvatarPointerDown(e, char) {
  emit('avatar-pointer-down', e, char)
}
function onAvatarPointerUp() {
  emit('avatar-pointer-up')
}
function onAvatarPointerLeave() {
  emit('avatar-pointer-leave')
}
</script>

<template>
  <!-- 搜索栏 -->
  <div class="sms-search-bar">
    <div class="sms-search-input-wrapper">
      <svg class="sms-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input
        v-model="searchQuery"
        class="sms-search-input"
        type="text"
        placeholder="搜索联系人"
      />
      <button v-if="searchQuery" class="sms-search-clear" @click="searchQuery = ''">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </div>

  <!-- 快捷入口 -->
  <div class="sms-quick-access">
    <div class="sms-quick-item" @click="emit('update:activeTab', 'private')">
      <div class="sms-quick-icon" style="background: linear-gradient(135deg, #ff8fab, #fb6f92);">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <span class="sms-quick-label">消息</span>
    </div>
    <div class="sms-quick-item" @click="emit('update:activeTab', 'group')">
      <div class="sms-quick-icon" style="background: linear-gradient(135deg, #a78bfa, #7c3aed);">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </div>
      <span class="sms-quick-label">群聊</span>
    </div>
    <div class="sms-quick-item">
      <div class="sms-quick-icon" style="background: linear-gradient(135deg, #60a5fa, #3b82f6);">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <span class="sms-quick-label">最近</span>
    </div>
    <div class="sms-quick-item">
      <div class="sms-quick-icon" style="background: linear-gradient(135deg, #f472b6, #ec4899);">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </div>
      <span class="sms-quick-label">特别关注</span>
    </div>
  </div>

  <!-- 私聊联系人 -->
  <div v-if="activeTab === 'private'" class="contact-list">
    <template v-for="group in filteredContacts" :key="group.worldBookId">
      <div
        class="contact-section-header"
        @click="toggleGroup(group.worldBookId)"
      >
        <div class="section-header-left">
          <div class="section-header-icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <span class="section-header-label">{{ group.worldBookTitle }}</span>
          <span class="section-header-count">{{ group.characters.length }}</span>
        </div>
        <svg class="contact-section-chevron" :class="{ collapsed: collapsedGroups.has(group.worldBookId) }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div v-show="!collapsedGroups.has(group.worldBookId)">
        <div
          v-for="char in group.characters"
          :key="char.id"
          class="contact-item"
          @click="emit('select-contact', char)"
        >
          <div class="contact-avatar" @pointerdown.stop="onAvatarPointerDown($event, char)" @pointerup.stop="onAvatarPointerUp" @pointerleave.stop="onAvatarPointerLeave">
            <img v-if="getCharAvatar(char)" :src="getCharAvatar(char)" :alt="char.name" />
            <span v-else class="contact-avatar-placeholder">&#x1F464;</span>
          </div>
          <div class="contact-info">
            <div class="contact-name-row">
              <span class="contact-name">{{ char.name }}</span>
              <span class="contact-status-dot" :style="{ background: getOnlineStatusForChar(char).color }" :title="getOnlineStatusForChar(char).label" />
            </div>
            <div class="contact-last-msg">
              {{ getLastMessage(char.id)?.text || '暂无消息，点击开始对话' }}
            </div>
          </div>
          <div class="contact-time" :class="{ unread: getLastMessage(char.id)?.role === 'assistant' }">
            {{ getLastMessage(char.id) ? formatSmsTime(getLastMessage(char.id).timestamp) : '' }}
          </div>
        </div>
      </div>
    </template>
    <div v-if="filteredContacts.length === 0" class="phone-loading">
      暂无联系人，请先在世界书中创建角色
    </div>
  </div>

  <!-- 群聊列表 -->
  <div v-else-if="activeTab === 'group'" class="contact-list">
    <div class="group-list-header">
      <span>群聊列表</span>
      <button class="group-create-btn" @click="emit('create-group')">+ 新建</button>
    </div>
    <div
      v-for="g in groupChats"
      :key="g.id"
      class="contact-item group-item"
      @click="emit('select-group', g)"
    >
      <div class="contact-avatar group-avatar">
        &#x1F465;
      </div>
      <div class="contact-info">
        <div class="contact-name">{{ g.name }}</div>
        <div class="contact-last-msg">
          {{ getLastGroupMessage(g.id)?.text || `暂无消息，${getGroupMemberCount(g)} 位成员` }}
        </div>
      </div>
      <div class="contact-time">
        {{ getLastGroupMessage(g.id) ? formatSmsTime(getLastGroupMessage(g.id).timestamp) : '' }}
      </div>
    </div>
    <div v-if="groupChats.length === 0" class="phone-loading">
      暂无群聊
    </div>
  </div>

  <!-- NPC观察 -->
  <div v-else-if="activeTab === 'npc'" class="contact-list">
    <div class="npc-list-header">
      <span>NPC 间短信</span>
    </div>
    <div
      v-for="thread in npcSmsThreads"
      :key="thread.id"
      class="contact-item npc-thread-item"
      @click="emit('open-npc-thread', thread)"
    >
      <div class="npc-thread-avatars">
        <span class="npc-avatar-name">{{ thread.charA?.name || '?' }}</span>
        <span class="npc-vs">&#8644;</span>
        <span class="npc-avatar-name">{{ thread.charB?.name || '?' }}</span>
      </div>
      <div class="contact-info">
        <div class="contact-name">{{ thread.location || '未知地点' }}</div>
        <div class="contact-last-msg">
          {{ thread.messages?.length || 0 }} 条短信
        </div>
      </div>
      <div class="contact-time">
        {{ formatSmsTime(thread.createdAt) }}
      </div>
    </div>
    <div v-if="npcSmsThreads.length === 0" class="phone-loading">
      暂无 NPC 短信，当两个角色在同一地点时可能会互相发短信
    </div>
  </div>
</template>

<style scoped>
/* ===== 搜索栏 ===== */
.sms-search-bar {
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.sms-search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f0f0f0;
  border-radius: 20px;
  padding: 0 12px;
  height: 36px;
  transition: background 0.15s, box-shadow 0.15s;
}

.sms-search-input-wrapper:focus-within {
  background: #fff;
  box-shadow: 0 0 0 2px rgba(255, 143, 171, 0.3);
}

.sms-search-icon {
  color: #bbb;
  flex-shrink: 0;
}

.sms-search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 0.85rem;
  color: #333;
  outline: none;
}

.sms-search-input::placeholder {
  color: #bbb;
}

.sms-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 50%;
  color: #999;
  cursor: pointer;
  flex-shrink: 0;
}

.sms-search-clear:hover {
  background: rgba(0, 0, 0, 0.15);
}

/* ===== 快捷入口 ===== */
.sms-quick-access {
  display: flex;
  justify-content: space-around;
  padding: 12px 14px 8px;
  background: rgba(255, 255, 255, 0.9);
}

.sms-quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.sms-quick-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: transform 0.15s;
}

.sms-quick-icon:hover {
  transform: scale(1.08);
}

.sms-quick-icon:active {
  transform: scale(0.95);
}

.sms-quick-label {
  font-size: 0.7rem;
  color: #666;
  font-weight: 500;
}

/* ===== 联系人列表 ===== */
.contact-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  background: #fafafa;
}

.contact-list::-webkit-scrollbar {
  width: 4px;
}

.contact-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.08);
  border-radius: 2px;
}

.contact-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  cursor: pointer;
  user-select: none;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.6);
}

.section-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.section-header-icon {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 1px 4px rgba(255, 143, 171, 0.25);
}

.section-header-label {
  font-size: 0.92rem;
  font-weight: 700;
  color: #333;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.section-header-count {
  font-size: 0.72rem;
  color: #bbb;
  font-weight: 500;
  margin-left: 2px;
  flex-shrink: 0;
}

.contact-section-chevron {
  color: #ccc;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.contact-section-chevron.collapsed {
  transform: rotate(-90deg);
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.04);
}

.contact-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.contact-item:active {
  background: rgba(0, 0, 0, 0.06);
}

/* ===== 联系人头像 ===== */
.contact-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #ffecd2, #fcb69f);
  border: 2px solid rgba(255, 255, 255, 0.8);
  flex-shrink: 0;
  font-size: 1.4rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: transform 0.2s ease;
}

.contact-avatar:hover {
  transform: scale(1.08);
}

.contact-avatar:active {
  transform: scale(0.95);
}

.contact-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.contact-avatar-placeholder {
  opacity: 0.7;
}

/* ===== 联系人信息 ===== */
.contact-info {
  flex: 1;
  min-width: 0;
}

.contact-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.contact-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #333;
  letter-spacing: 0.3px;
}

.contact-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 6px currentColor;
}

.contact-last-msg {
  font-size: 0.78rem;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 3px;
  line-height: 1.4;
}

/* ===== 时间戳 ===== */
.contact-time {
  font-size: 0.68rem;
  font-weight: 500;
  color: #ccc;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 4px;
}

.contact-time.unread {
  color: #ff8fab;
  font-weight: 600;
}

/* ===== 群聊相关 ===== */
.group-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px 8px;
  color: #999;
  font-size: 0.8rem;
  font-weight: 600;
}

.group-create-btn {
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
  border: none;
  border-radius: 12px;
  padding: 5px 12px;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(255, 143, 171, 0.3);
}

.group-create-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(255, 143, 171, 0.4);
}

.group-create-btn:active {
  transform: scale(0.95);
}

.group-avatar {
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #a78bfa, #7c3aed) !important;
}

/* ===== NPC 观察 ===== */
.npc-list-header {
  padding: 12px 16px 8px;
  color: #999;
  font-size: 0.8rem;
  font-weight: 600;
}

.npc-thread-item {
  background: linear-gradient(135deg, rgba(255, 143, 171, 0.08) 0%, rgba(251, 111, 146, 0.04) 100%);
  border-bottom: 0.5px solid rgba(255, 143, 171, 0.15);
}

.npc-thread-item:hover {
  background: linear-gradient(135deg, rgba(255, 143, 171, 0.12) 0%, rgba(251, 111, 146, 0.08) 100%);
}

.npc-thread-avatars {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  font-size: 0.75rem;
  color: #999;
}

.npc-avatar-name {
  color: #fb6f92;
  font-weight: 600;
  padding: 4px 8px;
  background: rgba(255, 143, 171, 0.12);
  border-radius: 8px;
}

.npc-vs {
  color: #ddd;
  font-size: 0.9rem;
}

/* ===== 空状态 ===== */
.phone-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  font-size: 0.82rem;
  color: #bbb;
  text-align: center;
  line-height: 1.6;
}

/* ===== Android 兼容 ===== */
.platform-android.android-portrait .sms-search-input-wrapper {
  background: #f0f0f0 !important;
}

.platform-android.android-portrait .sms-search-input {
  color: #333 !important;
}

.platform-android.android-portrait .sms-search-icon {
  color: #aaa !important;
}

.platform-android.android-portrait .sms-search-clear {
  color: #999 !important;
  background: rgba(0,0,0,0.1) !important;
}

.platform-android.android-portrait .sms-quick-label {
  color: #555 !important;
}

.platform-android.android-portrait .contact-name {
  color: #333 !important;
}

.platform-android.android-portrait .contact-last-msg {
  color: #888 !important;
}

.platform-android.android-portrait .contact-section-header {
  background: rgba(255, 255, 255, 0.95) !important;
  color: #888 !important;
}

.platform-android.android-portrait .section-header-icon {
  background: linear-gradient(135deg, #ff8fab, #fb6f92) !important;
}

.platform-android.android-portrait .section-header-label {
  color: #333 !important;
  font-weight: 700 !important;
}

.platform-android.android-portrait .section-header-count {
  color: #bbb !important;
}

.platform-android.android-portrait .contact-section-chevron {
  color: #ccc !important;
}

.platform-android.android-portrait .group-list-header,
.platform-android.android-portrait .npc-list-header {
  color: #888 !important;
}

.platform-android.android-portrait .group-create-btn {
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

  .platform-android.android-portrait .group-create-btn {
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
