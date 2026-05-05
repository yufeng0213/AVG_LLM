<script setup>
/**
 * TodoScreen.vue — 待办应用容器
 * 管理内部 3 个 tab：list / stats / settings
 * + 按钮悬浮在内容区，不属于导航栏
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { kvStorage } from '../../../src/storage/index.js'

import TodoListView from './TodoListView.vue'
import TodoAddScreen from './TodoAddScreen.vue'
import TodoStatsScreen from './TodoStatsScreen.vue'
import TodoSettingsScreen from './TodoSettingsScreen.vue'
import TodoTabBar from './TodoTabBar.vue'

const currentTab = ref('list')
const bgImageUrl = ref(null)

async function loadBgPath() {
  const path = await kvStorage.get('avg_llm_todo_bg_path')
  bgImageUrl.value = path || null
}

onMounted(() => {
  loadBgPath()
  window.addEventListener('todo:settingsChanged', loadBgPath)
})

onUnmounted(() => {
  window.removeEventListener('todo:settingsChanged', loadBgPath)
})

const bgStyle = ref({})
function applyBgStyle() {
  if (bgImageUrl.value) {
    bgStyle.value = {
      backgroundImage: `url(${bgImageUrl.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  } else {
    bgStyle.value = {
      background: 'linear-gradient(180deg, #f8f6ff 0%, #f5e6f0 100%)',
    }
  }
}

watch(bgImageUrl, applyBgStyle, { immediate: true })
</script>

<template>
  <div class="todo-screen" :style="bgStyle">
    <!-- 半透明遮罩层 -->
    <div class="screen-overlay" />

    <!-- 子页面 -->
    <div class="screen-body">
      <TodoListView v-if="currentTab === 'list'" @switchTab="currentTab = $event" />
      <TodoAddScreen v-else-if="currentTab === 'add'" @saved="currentTab = 'list'" />
      <TodoStatsScreen v-else-if="currentTab === 'stats'" />
      <TodoSettingsScreen v-else-if="currentTab === 'settings'" />
    </div>

    <!-- 悬浮 + 按钮（仅 list/stats/settings 页显示） -->
    <button
      v-if="currentTab !== 'add'"
      type="button"
      class="fab"
      @click="currentTab = 'add'"
    >
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>

    <!-- 底部导航（仅 list/stats/settings 页显示） -->
    <TodoTabBar v-if="currentTab !== 'add'" v-model="currentTab" />
  </div>
</template>

<style scoped>
.todo-screen {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.screen-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.3);
  pointer-events: none;
  z-index: 0;
}

.screen-body {
  flex: 1;
  position: relative;
  z-index: 1;
  overflow: hidden;
}

/* 悬浮 + 按钮 */
.fab {
  position: absolute;
  right: 20px;
  bottom: 76px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #9b8ec4, #b8a9e0);
  border: none;
  box-shadow: 0 4px 16px rgba(155, 142, 196, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: transform 0.2s;
}

.fab:active {
  transform: scale(0.92);
}

  .platform-android.android-portrait .fab {
    width: auto !important;
    height: auto !important;
    min-width: 56px !important;
    min-height: 56px !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    padding: 12px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 50% !important;
    white-space: nowrap !important;
    right: 20px !important;
    bottom: 76px !important;
  }

</style>
