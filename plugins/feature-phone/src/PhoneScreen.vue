<script setup>
/**
 * PhoneScreen.vue - 全屏路由版手机界面
 * 管理 iOS 风格主屏和各子 App 的切换。
 */
import { computed, provide, ref } from 'vue'
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
import PhoneQuizApp from './phone/PhoneQuizApp.vue'
import PhoneReaderApp from './phone/PhoneReaderApp.vue'
import PhonePronunciationApp from './phone/PhonePronunciationApp.vue'
import { useOfflinePush } from './phone/composables/useOfflinePush.js'

const emit = defineEmits(['back'])

const currentApp = ref(null)

// ===== 离线推送 =====
const pushNotification = ref(null) // { contactName, text, contactId, timestamp }

function handleNewPushMessage({ contact, text }) {
  pushNotification.value = {
    contactName: contact.name,
    text,
    contactId: contact.id,
    timestamp: Date.now(),
  }
  // 10 秒后自动清除
  setTimeout(() => {
    if (pushNotification.value) pushNotification.value = null
  }, 10000)
}

function handleNotificationClick(contactId) {
  pushNotification.value = null
  if (contactId) {
    currentApp.value = 'sms'
  }
}

const { isPushEnabled, notificationPermission } = useOfflinePush({
  onNewMessage: handleNewPushMessage,
  onNotificationClick: handleNotificationClick,
})

// 提供给子组件
provide('pushNotification', pushNotification)

// =====

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
  quiz: { component: PhoneQuizApp, icon: '📖', name: '陪学' },
  reader: { component: PhoneReaderApp, icon: '📜', name: '书城' },
  pronunciation: { component: PhonePronunciationApp, icon: '🎙️', name: '发音' },
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

    <!-- 推送通知浮层 -->
    <div v-if="pushNotification" class="push-notification-toast" @click="handleNotificationClick(pushNotification.contactId)">
      <div class="push-notification-icon">&#x1F4AC;</div>
      <div class="push-notification-body">
        <div class="push-notification-sender">{{ pushNotification.contactName }}</div>
        <div class="push-notification-text">{{ pushNotification.text }}</div>
      </div>
      <button class="push-notification-close" @click.stop="pushNotification = null">×</button>
    </div>
  </div>
</template>
