<script setup>
/**
 * SmsCreateGroup.vue — 创建群聊弹窗
 * 群名输入 + 按世界书展开的成员选择。
 */
const props = defineProps({
  contacts: { type: Array, required: true },
  groupName: { type: String, default: '' },
  members: { type: Array, default: () => [] },
  expandedWb: { type: String, default: null },
})

const emit = defineEmits(['close', 'update:groupName', 'update:members', 'update:expandedWb', 'create'])

function toggleMember(member) {
  const newMembers = [...props.members]
  const idx = newMembers.findIndex(m => m.contactId === member.contactId)
  if (idx >= 0) {
    newMembers.splice(idx, 1)
  } else {
    newMembers.push(member)
  }
  emit('update:members', newMembers)
}

function isMemberSelected(contactId) {
  return props.members.some(m => m.contactId === contactId)
}

function handleCreate() {
  if (!props.groupName.trim() || props.members.length < 2) return
  emit('create')
}
</script>

<template>
  <div class="sms-bubble-settings-overlay" @click.self="emit('close')">
    <div class="sms-bubble-settings-panel create-group-panel">
      <div class="settings-header">
        <h3>新建群聊</h3>
        <button class="settings-close-btn" @click="emit('close')">×</button>
      </div>
      <div class="settings-body">
        <label class="settings-label">群聊名称</label>
        <input
          :value="groupName"
          @input="emit('update:groupName', $event.target.value)"
          class="group-name-input"
          type="text"
          placeholder="输入群名..."
          maxlength="20"
        />

        <label class="settings-label" style="margin-top: 14px;">
          选择成员（已选 {{ members.length }} 人）
        </label>

        <!-- 按世界书展开选择 -->
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
              :class="{ selected: isMemberSelected(char.id) }"
              @click="toggleMember({ contactId: char.id, contactName: char.name, worldBookId: wb.worldBookId, worldBookTitle: wb.worldBookTitle, identity: char.identity })"
            >
              <span class="wb-member-check">{{ isMemberSelected(char.id) ? '&#x2714;' : '&#x25FB;' }}</span>
              <span>{{ char.name }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="settings-footer">
        <button
          class="apply-btn"
          :disabled="!groupName.trim() || members.length < 2"
          @click="handleCreate"
        >
          创建群聊（至少2人）
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.create-group-panel {
  max-height: 85vh;
}

.group-name-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--phone-text-primary, #fff);
  font-size: 0.88rem;
  outline: none;
  box-sizing: border-box;
}

.group-name-input:focus {
  border-color: rgba(10, 132, 255, 0.5);
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

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--phone-border, rgba(255, 255, 255, 0.1));
  flex-shrink: 0;
}

.settings-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--phone-text-primary, #fff);
}

.settings-close-btn {
  background: none;
  border: none;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-size: 1.4rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  line-height: 1;
}

.settings-close-btn:hover {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.1));
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
}

.settings-label {
  display: block;
  font-size: 0.85rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-weight: 600;
  margin-bottom: 8px;
}

.settings-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--phone-border, rgba(255, 255, 255, 0.1));
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.apply-btn {
  flex: 1;
  padding: 10px;
  background: linear-gradient(135deg, rgba(10, 132, 255, 0.35), rgba(88, 86, 214, 0.35));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(10, 132, 255, 0.4);
  border-radius: 12px;
  color: var(--phone-text-primary, #fff);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: 0 4px 16px rgba(10, 132, 255, 0.25);
}

.apply-btn:hover {
  transform: scale(1.02);
}

.apply-btn:active {
  transform: scale(0.98);
}

.apply-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.sms-bubble-settings-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  background: var(--phone-overlay, rgba(0, 0, 0, 0.85));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fade-in 0.2s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.sms-bubble-settings-panel {
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  background: rgba(28, 28, 30, 0.85);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.platform-android.android-portrait .sms-bubble-settings-panel {
  background: rgba(28, 28, 30, 0.95) !important;
}
.platform-android.android-portrait .wb-toggle-btn {
  background: rgba(255, 255, 255, 0.1) !important;
}
.platform-android.android-portrait .wb-toggle-btn.expanded {
  background: rgba(255, 255, 255, 0.18) !important;
}
.platform-android.android-portrait .apply-btn {
  background: linear-gradient(135deg, rgba(10, 132, 255, 0.5), rgba(88, 86, 214, 0.5)) !important;
}
.platform-android.android-portrait .group-name-input {
  background: rgba(0, 0, 0, 0.5) !important;
}
</style>
