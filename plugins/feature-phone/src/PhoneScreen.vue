<script setup>
/**
 * PhoneScreen.vue - 全屏路由版手机界面
 * 管理 iOS 风格主屏和各子 App 的切换。
 */
import { computed, onMounted, provide, ref } from 'vue'
import './phone/styles/phone-screen.css'
import PhoneHomeScreen from './phone/PhoneHomeScreen.vue'
import PhoneSmsApp from './phone/PhoneSmsApp.vue'
import PhoneCallsApp from './phone/PhoneCallsApp.vue'
import PhonePhotosApp from './phone/PhonePhotosApp.vue'
import PhoneCalendarApp from './phone/PhoneCalendarApp.vue'
import PhoneNotesApp from './phone/PhoneNotesApp.vue'
import PhoneRedditApp from './phone/PhoneRedditApp.vue'
import PhoneNewsApp from './phone/PhoneNewsApp.vue'
import PhonePlaceholderApp from './phone/PhonePlaceholderApp.vue'
import Phone2048App from './phone/games/Phone2048App.vue'
import PhoneMinesweeperApp from './phone/games/PhoneMinesweeperApp.vue'
import PhoneTetrisApp from './phone/games/PhoneTetrisApp.vue'
import PhoneBrickApp from './phone/games/PhoneBrickApp.vue'
import PhoneKlotskiApp from './phone/games/PhoneKlotskiApp.vue'
import PhoneQuizApp from './phone/PhoneQuizApp.vue'
import PhoneReaderApp from './phone/PhoneReaderApp.vue'
import PhonePronunciationApp from './phone/PhonePronunciationApp.vue'
import ScheduleScreen from '../../feature-character-schedule/src/ScheduleScreen.vue'
import FridgeScreen from '../../feature-fridge/src/FridgeScreen.vue'
import TodoScreen from '../../feature-todo/src/TodoScreen.vue'
import PhoneMomentsApp from './phone/PhoneMomentsApp.vue'
import PhoneRelationshipApp from '../../feature-relationship-network/src/RelationshipScreen.vue'
import { useOfflinePush } from './phone/composables/useOfflinePush.js'
import { useCallPush } from './phone/composables/useCallPush.js'
import { useBatteryAwareness } from './phone/composables/useBatteryAwareness.js'
import { useScreenTimeCare } from './phone/composables/useScreenTimeCare.js'
import { useBluetoothAudio } from './phone/composables/useBluetoothAudio.js'
import { useAmbientSounds } from './phone/composables/useAmbientSounds.js'
import { useNotificationSounds } from './phone/composables/useNotificationSounds.js'

const emit = defineEmits(['back'])

const currentApp = ref(null)

// ===== 来电联系人传递 =====
const pendingCallContact = ref(null)
provide('pendingCallContact', pendingCallContact)

// ===== 推送通知 =====
const pushNotification = ref(null) // { contactName, text, contactId, appId, timestamp }

function handleNewPushMessage({ contact, text }) {
  pushNotification.value = {
    contactName: contact.name,
    text,
    contactId: contact.id,
    appId: 'sms',
    timestamp: Date.now(),
  }
  setTimeout(() => {
    if (pushNotification.value) pushNotification.value = null
  }, 10000)
}

function handleNewCall({ contact, text }) {
  pushNotification.value = {
    contactName: contact.name,
    text,
    contactId: contact.id,
    appId: 'calls',
    timestamp: Date.now(),
  }
  setTimeout(() => {
    if (pushNotification.value) pushNotification.value = null
  }, 15000) // 来电通知停留更久
}

function handleNotificationClick(data) {
  pushNotification.value = null
  const contactId = typeof data === 'string' ? data : data?.contactId
  const appId = typeof data === 'object' ? data.appId || 'sms' : 'sms'
  if (contactId) {
    currentApp.value = appId
    if (appId === 'calls' && typeof data === 'object' && data.contact) {
      pendingCallContact.value = data.contact
    }
  }
}

const { isPushEnabled, notificationPermission } = useOfflinePush({
  onNewMessage: handleNewPushMessage,
  onNotificationClick: handleNotificationClick,
})

const { isPushEnabled: isCallPushEnabled } = useCallPush({
  onNewCall: handleNewCall,
  onNotificationClick: handleNotificationClick,
})

// 电量感知 + 屏幕时间关怀
useBatteryAwareness({ onNewMessage: handleNewPushMessage })
useScreenTimeCare({ onNewMessage: handleNewPushMessage })

// 蓝牙音响联动
const { isBluetoothConnected, bluetoothDeviceName, isSupported: btSupported } = useBluetoothAudio()

// 查岗推送由 App.vue 全局管理，此处仅监听事件以显示手机内 toast
onMounted(() => {
  window.addEventListener('avg:spot-check', (e) => {
    const { contactName, text } = e.detail
    pushNotification.value = {
      contactName,
      text: text.slice(0, 80),
      contactId: e.detail.contactId || contactName,
      appId: 'sms',
      timestamp: Date.now(),
      isSpotCheck: true,
    }
    setTimeout(() => {
      if (pushNotification.value) pushNotification.value = null
    }, 10000)
  })
})

// 环境音系统（需要获取角色当前日程地点）
const currentLocationName = ref('')
provide('currentLocationName', currentLocationName)

useAmbientSounds({
  isBluetoothConnected,
  locationName: currentLocationName,
  volume: 0.25,
})

// 铃声系统
const { playIncomingCall, playIncomingSms } = useNotificationSounds({ isBluetoothConnected })
provide('playIncomingCall', playIncomingCall)
provide('playIncomingSms', playIncomingSms)

// 提供给子组件
provide('isBluetoothConnected', isBluetoothConnected)
provide('bluetoothDeviceName', bluetoothDeviceName)

// 提供给子组件
provide('pushNotification', pushNotification)

// Capacitor 通知点击监听
onMounted(async () => {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action.notification?.extra || {}
      if (extra.type === 'spontaneous_call') {
        handleNotificationClick({
          appId: 'calls',
          contactId: extra.contactId,
          contact: { id: extra.contactId, name: extra.contactName },
        })
      }
    })
  } catch (e) {
    // 非原生环境忽略
  }
})

// =====

const APP_MAP = {
  sms: { component: PhoneSmsApp, icon: '💬', name: '短信' },
  calls: { component: PhoneCallsApp, icon: '📞', name: '电话' },
  calendar: { component: PhoneCalendarApp, icon: '📅', name: '日历' },
  xiaohongshu: { component: PhonePlaceholderApp, icon: '📕', name: '小红书' },
  reddit: { component: PhoneRedditApp, icon: '🟠', name: 'Reddit' },
  news: { component: PhoneNewsApp, icon: '📰', name: '今日X条' },
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
  schedule: { component: ScheduleScreen, icon: '📅', name: '日程' },
  fridge: { component: FridgeScreen, icon: '🧊', name: '小冰箱' },
  todo: { component: TodoScreen, icon: '📋', name: '待办' },
  moments: { component: PhoneMomentsApp, icon: '🌍', name: '朋友圈' },
  relationship: { component: PhoneRelationshipApp, icon: '🔗', name: '关系网' },
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
    <div v-if="pushNotification" class="push-notification-toast" @click="handleNotificationClick(pushNotification)">
      <div class="push-notification-icon">{{ pushNotification.isSpotCheck ? '&#x1F3A4;' : pushNotification.appId === 'calls' ? '&#x1F4DE;' : '&#x1F4AC;' }}</div>
      <div class="push-notification-body">
        <div class="push-notification-sender">{{ pushNotification.isSpotCheck ? '查岗' : pushNotification.appId === 'calls' ? '来电' : '短信' }}：{{ pushNotification.contactName }}</div>
        <div class="push-notification-text">{{ pushNotification.text }}</div>
      </div>
      <button class="push-notification-close" @click.stop="pushNotification = null">×</button>
    </div>
  </div>
</template>
