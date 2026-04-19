<script setup>
import { ref } from 'vue'

const emit = defineEmits(['close', 'pet', 'force-speech', 'custom-text', 'change-gif', 'reset-position', 'toggle-visibility'])
defineProps({ isVisible: { type: Boolean, default: true } })

const showCustomText = ref(false)
const customText = ref('')

function handleCustomText() {
  if (customText.value.trim()) {
    emit('custom-text', customText.value.trim())
    customText.value = ''
  }
  showCustomText.value = false
}

const menuItems = [
  { icon: '\uD83E\uDD1A', label: '抚摸', action: 'pet' },
  { icon: '\uD83D\uDCAC', label: '说话', action: 'force-speech' },
  { icon: '\uD83D\uDDBC\uFE0F', label: '更换 GIF', action: 'change-gif' },
  { icon: '\uD83D\uDCCD', label: '重置位置', action: 'reset-position' },
  { icon: '\uD83D\uDC41\uFE0F', label: '显示/隐藏', action: 'toggle-visibility' },
]

function handleMenuClick(action) {
  if (action === 'custom-text') {
    showCustomText.value = !showCustomText.value
  } else {
    showCustomText.value = false
    emit(action)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="menu-fade">
      <div v-if="isVisible" class="mascot-menu-overlay" @click="emit('close')">
        <div class="mascot-menu" @click.stop>
          <button
            v-for="item in menuItems"
            :key="item.action"
            class="menu-item"
            @click="handleMenuClick(item.action)"
          >
            <span class="menu-item-icon">{{ item.icon }}</span>
            <span class="menu-item-label">{{ item.label }}</span>
          </button>

          <button class="menu-item" @click="handleMenuClick('custom-text')">
            <span class="menu-item-icon">\u270F\uFE0F</span>
            <span class="menu-item-label">自定义</span>
          </button>

          <div v-if="showCustomText" class="custom-text-row">
            <input
              v-model="customText"
              class="custom-text-input"
              placeholder="输入想说的话..."
              @keyup.enter="handleCustomText"
            />
            <button class="custom-text-send" @click="handleCustomText">发送</button>
          </div>

          <button class="menu-close" @click="emit('close')">关闭</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mascot-menu-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mascot-menu {
  background: #fff;
  border-radius: 16px;
  padding: 12px 0;
  min-width: 200px;
  max-width: 280px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 20px;
  border: none;
  background: transparent;
  font-size: 15px;
  color: #333;
  cursor: pointer;
  transition: background 0.15s;
}

.menu-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.menu-item:active {
  background: rgba(0, 0, 0, 0.08);
}

.menu-item-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}

.menu-item-label {
  flex: 1;
}

.custom-text-row {
  display: flex;
  gap: 8px;
  padding: 8px 20px 12px;
}

.custom-text-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}

.custom-text-input:focus {
  border-color: #4a9eff;
}

.custom-text-send {
  padding: 8px 16px;
  background: #4a9eff;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.custom-text-send:hover {
  background: #3a8eef;
}

.menu-close {
  display: block;
  width: 100%;
  padding: 10px 20px;
  border: none;
  border-top: 1px solid #eee;
  background: transparent;
  font-size: 14px;
  color: #999;
  cursor: pointer;
}

.menu-close:hover {
  color: #666;
  background: rgba(0, 0, 0, 0.02);
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.2s ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
}
</style>
