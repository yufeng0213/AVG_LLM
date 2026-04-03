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

<style scoped>
.settings-screen {
  position: relative;
  width: 100%;
  height: calc(100vh - clamp(40px, 8vw, 110px));
  max-height: calc(100vh - clamp(40px, 8vw, 110px));
  border: 8px solid var(--accent-yellow);
  border-radius: 34px 20px 30px 18px;
  background: color-mix(in srgb, var(--muted) 86%, transparent);
  backdrop-filter: blur(9px);
  box-shadow:
    0 0 34px color-mix(in srgb, var(--accent-cyan) 45%, transparent),
    12px 12px 0 var(--accent-magenta), 24px 24px 0 var(--accent-cyan);
  padding: clamp(18px, 3vw, 32px);
  display: grid;
  grid-template-rows: auto 1fr;
  gap: clamp(14px, 2.5vw, 22px);
  overflow: hidden;
}

.settings-screen::before,
.settings-screen::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.settings-screen::before {
  opacity: 0.15;
  background-image:
    radial-gradient(circle, var(--accent-cyan) 1px, transparent 1px),
    repeating-linear-gradient(
      -45deg,
      transparent 0 12px,
      color-mix(in srgb, var(--accent-orange) 35%, transparent) 12px 22px
    );
  background-size:
    24px 24px,
    100% 100%;
}

.settings-screen::after {
  opacity: 0.12;
  background-image: conic-gradient(
    from 90deg at 1px 1px,
    transparent 90deg,
    color-mix(in srgb, var(--accent-magenta) 36%, transparent) 0
  );
  background-size: 44px 44px;
  mix-blend-mode: screen;
}

.settings-bg-word {
  position: absolute;
  margin: 0;
  right: -2%;
  top: -5%;
  font-family: var(--font-heading);
  font-size: clamp(6rem, 21vw, 15rem);
  line-height: 0.8;
  letter-spacing: -0.07em;
  color: color-mix(in srgb, var(--accent-yellow) 34%, transparent);
  opacity: 0.22;
  pointer-events: none;
  user-select: none;
}

.settings-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.back-button {
  appearance: none;
  border: 4px dashed var(--accent-cyan);
  border-radius: 9999px;
  padding: 10px 18px;
  font: 700 0.86rem/1 var(--font-body);
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--foreground);
  background: color-mix(in srgb, var(--accent-purple) 40%, transparent);
  cursor: pointer;
  box-shadow:
    0 0 14px color-mix(in srgb, var(--accent-cyan) 45%, transparent),
    6px 6px 0 var(--accent-yellow);
  transition: transform 240ms ease, box-shadow 240ms ease;
}

.back-button:hover {
  transform: translateY(-2px) scale(1.04);
  box-shadow:
    0 0 20px color-mix(in srgb, var(--accent-cyan) 60%, transparent),
    9px 9px 0 var(--accent-yellow), 14px 14px 0 var(--accent-magenta);
}

.back-button:focus-visible {
  outline: 3px dashed var(--accent-yellow);
  outline-offset: 4px;
}

.settings-title-group {
  display: grid;
  gap: 8px;
}

.settings-tag {
  margin: 0;
  width: fit-content;
  padding: 8px 14px;
  border: 4px solid var(--accent-orange);
  border-radius: 9999px;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow: var(--text-shadow-single);
  background: color-mix(in srgb, var(--accent-magenta) 25%, transparent);
}

.settings-title {
  margin: 0;
  display: grid;
  font-family: var(--font-heading);
  font-size: clamp(2.1rem, 5.7vw, 4.4rem);
  line-height: 0.92;
  letter-spacing: -0.03em;
  text-shadow: var(--text-shadow-triple);
}

.title-gradient {
  width: fit-content;
  font-family: var(--font-display);
  font-size: clamp(2rem, 5vw, 3.3rem);
  letter-spacing: 0.08em;
  background: linear-gradient(
    90deg,
    var(--accent-magenta),
    var(--accent-cyan),
    var(--accent-yellow),
    var(--accent-magenta)
  );
  background-size: 250% 250%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: avg-gradient-shift 4s linear infinite;
}

.settings-layout {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(210px, 250px) minmax(0, 1fr);
  gap: clamp(12px, 2vw, 20px);
  min-height: 0;
  overflow: hidden;
}

.settings-nav {
  align-self: stretch;
  border: 4px solid var(--accent-cyan);
  border-radius: 20px;
  background: color-mix(in srgb, var(--background) 36%, transparent);
  padding: 12px;
  display: grid;
  gap: 10px;
  box-shadow:
    0 0 22px color-mix(in srgb, var(--accent-cyan) 45%, transparent),
    6px 6px 0 var(--accent-yellow);
}

.settings-nav-item {
  appearance: none;
  text-align: left;
  display: grid;
  gap: 5px;
  padding: 12px 14px;
  border: 4px dashed var(--accent-magenta);
  border-radius: 18px;
  background: color-mix(in srgb, var(--accent-purple) 35%, transparent);
  color: var(--foreground);
  cursor: pointer;
  transition: transform 220ms ease, box-shadow 220ms ease, border-style 220ms ease;
  box-shadow:
    0 0 12px color-mix(in srgb, var(--accent-magenta) 45%, transparent),
    6px 6px 0 var(--accent-orange);
}

.settings-nav-item:hover {
  transform: translateX(4px) scale(1.02);
}

.settings-nav-item.active {
  border-style: solid;
  border-color: var(--accent-yellow);
  background: linear-gradient(
    110deg,
    color-mix(in srgb, var(--accent-magenta) 70%, var(--background)),
    color-mix(in srgb, var(--accent-cyan) 60%, var(--background))
  );
  box-shadow:
    0 0 20px color-mix(in srgb, var(--accent-yellow) 45%, transparent),
    8px 8px 0 var(--accent-yellow), 14px 14px 0 var(--accent-cyan);
}

.settings-nav-item:focus-visible {
  outline: 3px dashed var(--accent-cyan);
  outline-offset: 3px;
}

.nav-main {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.nav-note {
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  opacity: 0.86;
}

.settings-content {
  border: 4px dotted var(--accent-orange);
  border-radius: 20px;
  padding: clamp(14px, 2vw, 22px);
  background: color-mix(in srgb, var(--background) 32%, transparent);
  box-shadow:
    0 0 24px color-mix(in srgb, var(--accent-orange) 45%, transparent),
    8px 8px 0 var(--accent-magenta), 16px 16px 0 var(--accent-cyan);
  min-height: 0;
  overflow-y: auto;
}

@media (max-width: 900px) {
  .settings-screen {
    border-width: 4px;
    border-radius: 16px;
    min-height: calc(100vh - 20px);
    padding: 12px;
    gap: 12px;
    box-shadow: 0 0 20px color-mix(in srgb, var(--accent-cyan) 30%, transparent);
  }

  .settings-header {
    gap: 10px;
  }

  .back-button {
    padding: 8px 12px;
    font-size: 0.75rem;
    border-width: 2px;
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent-cyan) 30%, transparent);
  }

  .settings-tag {
    padding: 6px 10px;
    font-size: 0.7rem;
    border-width: 2px;
  }

  .settings-title {
    font-size: 1.5rem;
  }

  .title-gradient {
    font-size: 1rem;
  }

  .settings-layout {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .settings-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
  }

  .settings-nav-item {
    min-height: 60px;
    padding: 8px 12px;
    flex: 1 1 calc(50% - 8px);
    min-width: 100px;
    border-width: 2px;
  }

  .nav-main {
    font-size: 0.85rem;
  }

  .nav-note {
    display: none;
  }

  .settings-content {
    padding: 12px;
    border-width: 2px;
    box-shadow: 0 0 12px color-mix(in srgb, var(--accent-orange) 30%, transparent);
  }

  .settings-bg-word {
    display: none;
  }
}

@media (max-width: 680px) {
  .settings-screen {
    padding: 10px;
    gap: 8px;
  }

  .settings-header {
    flex-direction: column;
    gap: 6px;
  }

  .back-button {
    padding: 6px 10px;
    font-size: 0.65rem;
  }

  .settings-title-group {
    gap: 4px;
  }

  .settings-tag {
    padding: 4px 8px;
    font-size: 0.6rem;
  }

  .settings-title {
    font-size: 1.2rem;
  }

  .title-gradient {
    font-size: 0.8rem;
  }

  .settings-nav {
    gap: 6px;
    padding: 6px;
  }

  .settings-nav-item {
    min-height: 50px;
    padding: 6px 10px;
    flex: 1 1 100%;
    min-width: 0;
  }

  .nav-main {
    font-size: 0.75rem;
  }

  .settings-content {
    padding: 10px;
    border-width: 1px;
  }
}

/* 横屏模式 */
@media (max-width: 768px) and (orientation: landscape) {
  .settings-screen {
    padding: 8px 12px;
    gap: 8px;
  }

  .settings-header {
    flex-direction: row;
    align-items: center;
  }

  .settings-layout {
    grid-template-columns: minmax(0, 140px) minmax(0, 1fr);
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px;
  }

  .settings-nav-item {
    min-height: 40px;
    padding: 4px 8px;
    flex: 0 0 auto;
    min-width: 0;
  }

  .nav-main {
    font-size: 0.7rem;
  }

  .settings-content {
    padding: 8px;
    max-height: calc(100vh - 60px);
    overflow-y: auto;
  }
}

/* 超小屏幕 */
@media (max-width: 480px) {
  .settings-screen {
    padding: 8px;
    border-width: 3px;
    border-radius: 12px;
  }

  .back-button {
    padding: 5px 8px;
    font-size: 0.6rem;
  }

  .settings-title {
    font-size: 1rem;
  }

  .title-gradient {
    font-size: 0.7rem;
  }

  .settings-nav-item {
    min-height: 44px;
    padding: 5px 8px;
  }

  .nav-main {
    font-size: 0.65rem;
  }

  .settings-content {
    padding: 8px;
  }
}
</style>
