<script setup>
import { computed, ref } from 'vue'
import ApiSettingsPanel from '../settings/ApiSettingsPanel.vue'
import AudioSettingsPanel from '../settings/AudioSettingsPanel.vue'
import DisplaySettingsPanel from '../settings/DisplaySettingsPanel.vue'
import ThemeSettingsPanel from '../settings/ThemeSettingsPanel.vue'

const emit = defineEmits(['back'])

const tabItems = [
  { id: 'audio', label: '音量', note: 'Master / BGM / SE' },
  { id: 'display', label: '画面', note: '分辨率 / 特效 / 文本速度' },
  { id: 'theme', label: '主题', note: '预设主题 / JSON 注入切换' },
  { id: 'api', label: 'API设置', note: '模型接口 / 鉴权 / 配置管理' },
]

const activeTab = ref('audio')

const panelMap = {
  audio: AudioSettingsPanel,
  display: DisplaySettingsPanel,
  theme: ThemeSettingsPanel,
  api: ApiSettingsPanel,
}

const activePanel = computed(() => panelMap[activeTab.value])
</script>

<template>
  <main class="settings-screen" role="main">
    <p class="settings-bg-word" aria-hidden="true">SETUP</p>

    <header class="settings-header">
      <button type="button" class="back-button" @click="emit('back')">
        返回主菜单
      </button>
      <div class="settings-title-group">
        <p class="settings-tag">System Control Hub</p>
        <h1 class="settings-title">
          <span>AVG_LLM</span>
          <span class="title-gradient">设置中心</span>
        </h1>
      </div>
    </header>

    <section class="settings-layout">
      <aside class="settings-nav" aria-label="设置分类">
        <button
          v-for="tab in tabItems"
          :key="tab.id"
          type="button"
          class="settings-nav-item"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <span class="nav-main">{{ tab.label }}</span>
          <span class="nav-note">{{ tab.note }}</span>
        </button>
      </aside>

      <section class="settings-content">
        <component :is="activePanel" />
      </section>
    </section>
  </main>
</template>

<style scoped src="./SettingsScreen.css"></style>

