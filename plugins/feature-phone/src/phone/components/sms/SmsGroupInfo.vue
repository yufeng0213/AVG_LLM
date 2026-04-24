<script setup>
/**
 * SmsGroupInfo.vue — 群信息面板 + 成员管理
 */
const props = defineProps({
  group: { type: Object, required: true },
  contacts: { type: Array, required: true },
  expandedWb: { type: String, default: null },
  showManageMembers: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'toggle-manage', 'update:expandedWb', 'toggle-member', 'delete-group'])

function isMemberInGroup(contactId) {
  return (props.group.members || []).some(m => m.contactId === contactId)
}

function getMemberCount() {
  return Array.isArray(props.group.members) ? props.group.members.length : 0
}
</script>

<template>
  <div class="group-info-overlay" @click.self="emit('close')">
    <div class="group-info-container">
      <!-- 顶部群名称 -->
      <div class="group-info-header">
        <div class="group-avatar-large">&#x1F465;</div>
        <div class="group-info-title">{{ group.name }}</div>
        <div class="group-info-subtitle">
          {{ group.type === 'worldbook' ? '世界书群聊' : '自定义群聊' }}
          <span v-if="group.type === 'worldbook'"> · {{ group.worldBookTitle }}</span>
        </div>
      </div>

      <!-- 成员九宫格/列表 -->
      <div class="group-members-section">
        <div class="members-section-title">
          聊天成员 ({{ getMemberCount() }})
        </div>
        <div class="members-grid">
          <div
            v-for="m in group.members"
            :key="m.contactId"
            class="member-grid-item"
            :class="{ canRemove: group.type === 'custom' }"
            @click="group.type === 'custom' && emit('toggle-member', m)"
          >
            <div class="member-grid-avatar">
              <span>{{ m.contactName.charAt(0) }}</span>
            </div>
            <div class="member-grid-name">{{ m.contactName }}</div>
            <span v-if="group.type === 'custom'" class="member-remove-badge">×</span>
          </div>
          <!-- 添加成员按钮 -->
          <div
            v-if="group.type === 'custom'"
            class="member-grid-item add-member-btn"
            @click="emit('toggle-manage')"
          >
            <div class="member-grid-avatar add-avatar">
              +
            </div>
            <div class="member-grid-name">添加成员</div>
          </div>
        </div>
      </div>

      <!-- 管理成员面板（可展开） -->
      <div v-if="showManageMembers && group.type === 'custom'" class="manage-members-panel">
        <div class="manage-header">
          <h4>管理成员</h4>
          <button class="manage-close-btn" @click="emit('toggle-manage')">×</button>
        </div>
        <div class="manage-body">
          <div v-for="wb in contacts" :key="wb.worldBookId" class="wb-member-section">
            <button
              class="wb-toggle-btn"
              :class="{ expanded: expandedWb === wb.worldBookId }"
              @click="emit('update:expandedWb', expandedWb === wb.worldBookId ? null : wb.worldBookId)"
            >
              {{ expandedWb === wb.worldBookId ? '▼' : '▶' }}
              《{{ wb.worldBookTitle }}》
            </button>
            <div v-if="expandedWb === wb.worldBookId" class="wb-member-list">
              <div
                v-for="char in wb.characters"
                :key="char.id"
                class="wb-member-item"
                :class="{ selected: isMemberInGroup(char.id) }"
                @click="emit('toggle-member', { contactId: char.id, contactName: char.name, worldBookId: wb.worldBookId, worldBookTitle: wb.worldBookTitle, identity: char.identity })"
              >
                <span class="wb-member-check">{{ isMemberInGroup(char.id) ? '&#x2714;' : '&#x25FB;' }}</span>
                <span>{{ char.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="group-info-actions">
        <button
          v-if="group.type === 'custom'"
          class="action-btn delete-btn"
          @click="emit('delete-group')"
        >
          删除群聊
        </button>
        <button class="action-btn close-btn" @click="emit('close')">
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group-info-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  background: var(--phone-overlay, rgba(0, 0, 0, 0.7));
  display: flex;
  align-items: flex-end;
  padding: 16px;
  animation: fade-in 0.2s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.group-info-container {
  width: 100%;
  max-height: 85vh;
  background: rgba(28, 28, 30, 0.9);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border-radius: 20px 20px 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  overflow-y: auto;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.4);
}

.group-info-header {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-bottom: 1px solid var(--phone-border, rgba(255, 255, 255, 0.08));
}

.group-avatar-large {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  margin-bottom: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.group-info-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--phone-text-primary, #fff);
  margin-bottom: 4px;
}

.group-info-subtitle {
  font-size: 0.75rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
}

.group-members-section {
  padding: 16px;
}

.members-section-title {
  font-size: 0.82rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
  margin-bottom: 12px;
}

.members-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.member-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: default;
  position: relative;
}

.member-grid-item.canRemove {
  cursor: pointer;
}

.member-grid-item.canRemove:active .member-grid-avatar {
  opacity: 0.5;
}

.member-grid-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--phone-text-primary, #fff);
  transition: opacity 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.member-grid-avatar.add-avatar {
  background: rgba(255, 255, 255, 0.06);
  font-size: 1.2rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-weight: 400;
}

.member-grid-name {
  font-size: 0.7rem;
  color: var(--phone-text-primary, #fff);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.member-remove-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--phone-accent-red, #ff3b30);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.add-member-btn {
  cursor: pointer;
}

.add-member-btn:active .member-grid-avatar {
  opacity: 0.7;
}

.manage-members-panel {
  margin: 0 16px 16px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  overflow: hidden;
}

.manage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--phone-border, rgba(255, 255, 255, 0.08));
}

.manage-header h4 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--phone-text-primary, #fff);
}

.manage-close-btn {
  background: none;
  border: none;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 8px;
}

.manage-body {
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.wb-member-section {
  margin-bottom: 4px;
}

.wb-toggle-btn {
  width: 100%;
  text-align: left;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: none;
  border-radius: 10px;
  padding: 6px 10px;
  color: var(--phone-text-primary, #fff);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s;
}

.wb-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.wb-toggle-btn.expanded {
  background: rgba(255, 255, 255, 0.1);
}

.wb-member-list {
  padding-left: 12px;
}

.wb-member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 0.82rem;
  color: var(--phone-text-primary, #fff);
}

.wb-member-item:hover {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.06));
}

.wb-member-item.selected {
  background: rgba(10, 132, 255, 0.15);
}

.wb-member-check {
  font-size: 1rem;
  color: var(--phone-accent-blue, #0a84ff);
}

.group-info-actions {
  padding: 16px;
  display: flex;
  gap: 10px;
  border-top: 1px solid var(--phone-border, rgba(255, 255, 255, 0.08));
}

.action-btn {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.action-btn:active {
  opacity: 0.7;
}

.action-btn.delete-btn {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
  border-color: rgba(255, 59, 48, 0.3);
}

.action-btn.close-btn {
  background: rgba(255, 255, 255, 0.08);
  color: var(--phone-text-primary, #fff);
}

.platform-android.android-portrait .group-info-container {
  background: rgba(28, 28, 30, 0.97) !important;
}
.platform-android.android-portrait .group-avatar-large,
.platform-android.android-portrait .member-grid-avatar {
  background: rgba(255, 255, 255, 0.18) !important;
}
.platform-android.android-portrait .member-grid-avatar.add-avatar {
  background: rgba(255, 255, 255, 0.14) !important;
}
.platform-android.android-portrait .manage-members-panel {
  background: rgba(255, 255, 255, 0.1) !important;
}
.platform-android.android-portrait .action-btn.close-btn {
  background: rgba(255, 255, 255, 0.16) !important;
}
.platform-android.android-portrait .action-btn.delete-btn {
  background: rgba(255, 59, 48, 0.25) !important;
}
.platform-android.android-portrait .wb-toggle-btn {
  background: rgba(255, 255, 255, 0.1) !important;
}
.platform-android.android-portrait .wb-toggle-btn.expanded {
  background: rgba(255, 255, 255, 0.18) !important;
}
</style>
