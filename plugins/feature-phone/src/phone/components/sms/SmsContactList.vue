<script setup>
/**
 * SmsContactList.vue — 私聊联系人列表 + 群聊列表 + 标签切换
 */
const props = defineProps({
  contacts: { type: Array, required: true },
  groupChats: { type: Array, required: true },
  activeTab: { type: String, default: 'private' },
  npcSmsThreads: { type: Array, default: () => [] },
  getLastMessage: { type: Function, required: true },
  getLastGroupMessage: { type: Function, required: true },
  getOnlineStatusForChar: { type: Function, required: true },
  getSignatureForChar: { type: Function, required: true },
  formatSmsTime: { type: Function, required: true },
  getCharAvatar: { type: Function, required: true },
  getGroupMemberCount: { type: Function, required: true },
})

const emit = defineEmits(['select-contact', 'select-group', 'update:activeTab', 'create-group', 'open-npc-thread', 'avatar-pointer-down', 'avatar-pointer-up', 'avatar-pointer-leave'])

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
  <!-- 标签切换 -->
  <div class="sms-tab-bar">
    <button class="sms-tab" :class="{ active: activeTab === 'private' }" @click="emit('update:activeTab', 'private')">私聊</button>
    <button class="sms-tab" :class="{ active: activeTab === 'group' }" @click="emit('update:activeTab', 'group')">群聊</button>
    <button class="sms-tab" :class="{ active: activeTab === 'npc' }" @click="emit('update:activeTab', 'npc')">NPC观察</button>
  </div>

  <!-- 私聊联系人 -->
  <div v-if="activeTab === 'private'" class="contact-list">
    <template v-for="group in contacts" :key="group.worldBookId">
      <div class="contact-section-header">《{{ group.worldBookTitle }}》</div>
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
          <div class="contact-signature" v-if="getSignatureForChar(char)">
            {{ getSignatureForChar(char) }}
          </div>
        </div>
        <div class="contact-time" :class="{ unread: getLastMessage(char.id)?.role === 'assistant' }">
          {{ getLastMessage(char.id) ? formatSmsTime(getLastMessage(char.id).timestamp) : '' }}
        </div>
      </div>
    </template>
    <div v-if="contacts.length === 0" class="phone-loading">
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
        <span class="npc-vs">⇄</span>
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
/* 联系人头像长按交互 */
.contact-avatar {
  cursor: pointer;
  transition: transform 0.15s;
}

.contact-avatar:active {
  transform: scale(0.92);
}

/* ===== 标签切换 ===== */
.sms-tab-bar {
  display: flex;
  padding: 6px 12px;
  gap: 6px;
  border-bottom: 1px solid var(--phone-border, rgba(255, 255, 255, 0.1));
}

.sms-tab {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.sms-tab.active {
  background: rgba(10, 132, 255, 0.25);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-color: rgba(10, 132, 255, 0.4);
  color: #fff;
  box-shadow: 0 4px 16px rgba(10, 132, 255, 0.3);
}

/* ===== 群聊相关 ===== */
.group-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px 6px;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-size: 0.78rem;
  font-weight: 600;
}

.group-create-btn {
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 3px 10px;
  color: #0a84ff;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s;
}

.group-avatar {
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* NPC 观察 */
.npc-list-header {
  padding: 10px 16px 6px;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-size: 0.78rem;
  font-weight: 600;
}

.npc-thread-item {
  background: rgba(255, 100, 200, 0.05);
  border-color: rgba(255, 100, 200, 0.1);
}

.npc-thread-avatars {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

.npc-avatar-name {
  color: rgba(255, 200, 220, 0.8);
  font-weight: 500;
}

.npc-vs {
  color: rgba(255, 255, 255, 0.2);
}

.platform-android.android-portrait .sms-tab {
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
  background: rgba(255, 255, 255, 0.18) !important;
}
.platform-android.android-portrait .sms-tab.active {
  background: rgba(10, 132, 255, 0.35) !important;
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
