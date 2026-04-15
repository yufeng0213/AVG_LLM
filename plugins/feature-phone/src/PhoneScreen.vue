<script setup>
/**
 * PhoneScreen.vue - 全屏路由版手机界面
 * 管理 iOS 风格主屏和各子 App 的切换。
 */
import { computed, ref } from 'vue'
import './phone/styles/phone-screen.css'
import PhoneHomeScreen from './phone/PhoneHomeScreen.vue'
import PhoneSmsApp from './phone/PhoneSmsApp.vue'
import PhoneCallsApp from './phone/PhoneCallsApp.vue'
import PhonePhotosApp from './phone/PhonePhotosApp.vue'
import PhoneCalendarApp from './phone/PhoneCalendarApp.vue'
import PhoneNotesApp from './phone/PhoneNotesApp.vue'
import PhoneRedditApp from './phone/PhoneRedditApp.vue'
import PhonePlaceholderApp from './phone/PhonePlaceholderApp.vue'
import Phone2048App from './phone/games/Phone2048App.vue'
import PhoneMinesweeperApp from './phone/games/PhoneMinesweeperApp.vue'
import PhoneTetrisApp from './phone/games/PhoneTetrisApp.vue'
import PhoneBrickApp from './phone/games/PhoneBrickApp.vue'
import PhoneKlotskiApp from './phone/games/PhoneKlotskiApp.vue'

const emit = defineEmits(['back'])

const currentApp = ref(null)

const APP_MAP = {
  sms: { component: PhoneSmsApp, icon: '💬', name: '短信' },
  calls: { component: PhoneCallsApp, icon: '📞', name: '电话' },
  calendar: { component: PhoneCalendarApp, icon: '📅', name: '日历' },
  xiaohongshu: { component: PhonePlaceholderApp, icon: '📕', name: '小红书' },
  reddit: { component: PhoneRedditApp, icon: '🟠', name: 'Reddit' },
  photos: { component: PhonePhotosApp, icon: '🌈', name: '照片' },
  notes: { component: PhoneNotesApp, icon: '📝', name: '备忘录' },
  game2048: { component: Phone2048App, icon: '🔢', name: '2048' },
  minesweeper: { component: PhoneMinesweeperApp, icon: '💣', name: '扫雷' },
  tetris: { component: PhoneTetrisApp, icon: '🧱', name: '俄罗斯方块' },
  brick: { component: PhoneBrickApp, icon: '🏓', name: '打砖块' },
  klotski: { component: PhoneKlotskiApp, icon: '🧩', name: '华容道' },
}

function openApp(appId) {
  currentApp.value = appId
}

function closeApp() {
  currentApp.value = null
}

const appComponent = computed(() => {
  const config = APP_MAP[currentApp.value]
  return config?.component || null
})

const appIcon = computed(() => APP_MAP[currentApp.value]?.icon || '')
const appName = computed(() => APP_MAP[currentApp.value]?.name || '')
</script>

<template>
  <div class="phone-screen">
    <!-- 主屏 -->
    <PhoneHomeScreen
      v-if="!currentApp"
      @open-app="openApp"
      @close="emit('back')"
    />

    <!-- 子 App -->
    <component
      :is="appComponent"
      v-if="appComponent"
      :icon="appIcon"
      :name="appName"
      @back="closeApp"
    />
  </div>
</template>
