/**
 * NpcSmsThread.vue — 查看 NPC 间短信线程
 */
<template>
  <div class="npc-sms-overlay" @click.self="close">
    <div class="npc-sms-modal">
      <div class="npc-sms-header">
        <div class="npc-sms-title">
          <span class="npc-char">{{ thread.charA?.name || '?' }}</span>
          <span class="npc-arrow">⇄</span>
          <span class="npc-char">{{ thread.charB?.name || '?' }}</span>
        </div>
        <button class="npc-sms-close" @click="close">✕</button>
      </div>

      <div class="npc-sms-location" v-if="thread.location">
        📍 {{ thread.location }}
      </div>

      <div class="npc-sms-messages">
        <div
          v-for="msg in thread.messages || []"
          :key="msg.id"
          class="npc-sms-bubble"
          :class="msg.role === 'assistant_a' ? 'left' : 'right'"
        >
          <div class="npc-sms-sender">{{ msg.senderName }}</div>
          <div class="npc-sms-text">{{ msg.text }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  visible: { type: Boolean, default: false },
  thread: { type: Object, default: null },
})

const emit = defineEmits(['close'])

function close() {
  emit('close')
}
</script>

<style scoped>
.npc-sms-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.npc-sms-modal {
  background: #1c1c1e;
  border-radius: 16px;
  width: min(420px, 90vw);
  max-height: 80vh;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
}

.npc-sms-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.npc-sms-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}

.npc-char {
  color: rgba(255, 200, 220, 0.9);
}

.npc-arrow {
  color: rgba(255, 255, 255, 0.3);
}

.npc-sms-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
}

.npc-sms-location {
  padding: 8px 16px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.npc-sms-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.npc-sms-bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.npc-sms-bubble.left {
  align-self: flex-start;
  background: rgba(100, 180, 255, 0.15);
  border: 1px solid rgba(100, 180, 255, 0.2);
  color: rgba(255, 255, 255, 0.85);
  border-bottom-left-radius: 4px;
}

.npc-sms-bubble.right {
  align-self: flex-end;
  background: rgba(255, 100, 200, 0.15);
  border: 1px solid rgba(255, 100, 200, 0.2);
  color: rgba(255, 255, 255, 0.85);
  border-bottom-right-radius: 4px;
}

.npc-sms-sender {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 2px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
