<script setup>
import { ref, onMounted, defineAsyncComponent } from 'vue'
import { getActiveWorldBookId, loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'

const DungeonAdventureGame = defineAsyncComponent(() =>
  import('../../../src/plugins/handheld-xx-dungeon-adventure/index.vue'),
)

const emit = defineEmits(['back'])

const worldBook = ref(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const books = await loadWorldBooks()
    const activeId = await getActiveWorldBookId()
    const activeBook = books.find(b => b.id === activeId) || books[0] || null
    worldBook.value = activeBook
  } catch (e) {
    console.error('[AdventureGameScreen] Failed to load world book:', e)
  } finally {
    loading.value = false
  }
})

const handleBack = () => {
  emit('back')
}
</script>

<template>
  <main class="adventure-game-screen">
    <!-- 返回按钮 -->
    <button class="adventure-back-btn" type="button" @click="handleBack">
      <span class="back-icon">←</span>
      <span class="back-text">返回主菜单</span>
    </button>

    <!-- 加载状态 -->
    <div v-if="loading" class="adventure-loading">
      <div class="loading-spinner"></div>
      <p class="loading-text">正在加载冒险游戏...</p>
    </div>

    <!-- 冒险游戏主体 -->
    <div v-else class="adventure-game-container">
      <DungeonAdventureGame
        :world-book="worldBook"
        save-slot-id="adventure-standalone"
        :auto-open="true"
      />
    </div>
  </main>
</template>

<style scoped>
.adventure-game-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #0a0e1a 0%, #111827 50%, #0f172a 100%);
  z-index: 1000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.adventure-back-btn {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 1001;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 14px;
  color: #f1f5f9;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(12px);
}

.adventure-back-btn:hover {
  background: rgba(99, 102, 241, 0.25);
  border-color: rgba(99, 102, 241, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.2);
}

.adventure-back-btn:active {
  transform: translateY(0);
}

.back-icon {
  font-size: 18px;
  font-weight: bold;
}

.back-text {
  font-weight: 500;
  letter-spacing: 0.5px;
}

.adventure-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: rgba(255, 255, 255, 0.7);
  font-size: 16px;
  font-weight: 500;
}

.adventure-game-container {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>

<style scoped src="./AdventureGameScreen.css"></style>
