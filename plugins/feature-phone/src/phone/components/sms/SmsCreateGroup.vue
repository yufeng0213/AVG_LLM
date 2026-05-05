<script setup>
/**
 * SmsCreateGroup.vue — 创建群聊弹窗（浅色主题）
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
  <div class="create-group-overlay" @click.self="emit('close')">
    <div class="create-group-panel">
      <div class="settings-header">
        <h3>新建群聊</h3>
        <button class="settings-close-btn" @click="emit('close')">&times;</button>
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
              <span class="wb-member-check">{{ isMemberSelected(char.id) ? '&#10004;' : '&#9635;' }}</span>
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
.create-group-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  background: rgba(0, 0, 0, 0.4);
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

.create-group-panel {
  width: 100%;
  max-width: 400px;
  max-height: 85vh;
  background: #fff;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}

.settings-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #222;
}

.settings-close-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 1.4rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  line-height: 1;
}

.settings-close-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #555;
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
  color: #666;
  font-weight: 600;
  margin-bottom: 8px;
}

.group-name-input {
  width: 100%;
  background: #f0f0f0;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px 12px;
  color: #333;
  font-size: 0.88rem;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.group-name-input:focus {
  border-color: #ff8fab;
  background: #fff;
}

.wb-member-section {
  margin-bottom: 4px;
}

.wb-toggle-btn {
  width: 100%;
  text-align: left;
  background: #f5f5f5;
  border: none;
  border-radius: 10px;
  padding: 6px 10px;
  color: #555;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s;
}

.wb-toggle-btn:hover {
  background: #f0f0f0;
}

.wb-toggle-btn.expanded {
  background: #eee;
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
  color: #333;
}

.wb-member-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.wb-member-item.selected {
  background: rgba(255, 143, 171, 0.12);
}

.wb-member-check {
  font-size: 1rem;
  color: #fb6f92;
}

.settings-footer {
  padding: 12px 16px;
  border-top: 0.5px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.apply-btn {
  flex: 1;
  padding: 10px;
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: 0 2px 12px rgba(255, 143, 171, 0.3);
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

.platform-android.android-portrait .create-group-panel {
  background: #fff !important;
}

.platform-android.android-portrait .wb-toggle-btn {
  background: #f5f5f5 !important;
}

.platform-android.android-portrait .wb-toggle-btn.expanded {
  background: #eee !important;
}

.platform-android.android-portrait .apply-btn {
  background: linear-gradient(135deg, #ff8fab, #fb6f92) !important;
}

.platform-android.android-portrait .group-name-input {
  background: #f0f0f0 !important;
  color: #333 !important;
}
</style>
