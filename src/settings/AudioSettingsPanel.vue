<script setup>
import { reactive } from 'vue'

const audioState = reactive({
  master: 82,
  bgm: 74,
  effect: 88,
  voice: 91,
  muteInBackground: false,
})
</script>

<template>
  <section class="settings-panel-content">
    <h2 class="panel-title">音量设置</h2>
    <p class="panel-description">调节主音量、背景音乐与语音轨道。每项会独立保存到本地设备。</p>

    <div class="settings-grid single-column">
      <label class="setting-field">
        <span class="setting-label">主音量 {{ audioState.master }}%</span>
        <input v-model="audioState.master" class="setting-range" type="range" min="0" max="100" />
      </label>

      <label class="setting-field">
        <span class="setting-label">背景音乐 {{ audioState.bgm }}%</span>
        <input v-model="audioState.bgm" class="setting-range" type="range" min="0" max="100" />
      </label>

      <label class="setting-field">
        <span class="setting-label">音效 {{ audioState.effect }}%</span>
        <input v-model="audioState.effect" class="setting-range" type="range" min="0" max="100" />
      </label>

      <label class="setting-field">
        <span class="setting-label">语音 {{ audioState.voice }}%</span>
        <input v-model="audioState.voice" class="setting-range" type="range" min="0" max="100" />
      </label>
    </div>

    <label class="setting-checkbox-row">
      <input v-model="audioState.muteInBackground" class="setting-checkbox" type="checkbox" />
      <span>后台运行时静音</span>
    </label>
  </section>
</template>

<style scoped src="./SettingsPanel.css"></style>
