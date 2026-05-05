<script setup>
/**
 * PhoneScreen.vue - 全屏路由版手机界面
 * 管理 iOS 风格主屏和各子 App 的切换。
 */
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import './phone/styles/phone-screen.css'
import PhoneHomeScreen from './phone/PhoneHomeScreen.vue'
import PhoneSmsApp from './phone/PhoneSmsApp.vue'
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
import ScrapbookScreen from '../../feature-scrapbook/src/ScrapbookScreen.vue'
import PhoneBrowserApp from './phone/PhoneBrowserApp.vue'
import { useOfflinePush } from './phone/composables/useOfflinePush.js'
import { useCallPush } from './phone/composables/useCallPush.js'
import { useBatteryAwareness } from './phone/composables/useBatteryAwareness.js'
import { useScreenTimeCare } from './phone/composables/useScreenTimeCare.js'
import { useBluetoothAudio } from './phone/composables/useBluetoothAudio.js'
import { useAmbientSounds } from './phone/composables/useAmbientSounds.js'
import { useNotificationSounds } from './phone/composables/useNotificationSounds.js'
import { usePhoneHomeCharacter } from './phone/composables/usePhoneHomeCharacter.js'
import { usePhoneHomeWeather } from './phone/composables/usePhoneHomeWeather.js'
import { loadCalendarEvents, getGroupedContacts } from './phone/composables/usePhoneData.js'

const emit = defineEmits(['back'])

const currentApp = ref(null)

// ===== 来电联系人传递 =====
const pendingCallContact = ref(null)
provide('pendingCallContact', pendingCallContact)

// ===== 语音通话来电 =====
const pendingVoiceCall = ref(null)
provide('pendingVoiceCall', pendingVoiceCall)

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
    appId: 'sms',
    type: 'voice_call',
    contact,
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
    // 来电通知统一走短信 APP（语音通话）
    const targetAppId = appId === 'calls' ? 'sms' : appId
    currentApp.value = targetAppId
    if (targetAppId === 'sms' && typeof data === 'object' && data.contact) {
      pendingVoiceCall.value = data.contact
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

// 分享联系人列表
const shareContacts = ref([])
onMounted(async () => {
  try {
    const groups = await getGroupedContacts()
    const flat = []
    for (const g of groups) {
      if (g.characters) flat.push(...g.characters)
    }
    shareContacts.value = flat
  } catch (e) {
    console.warn('[PhoneScreen] load share contacts failed:', e.message)
  }
})

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

// ===== 跨App分享（Reader → SMS） =====
const pendingSmsShare = ref(null)
provide('pendingSmsShare', pendingSmsShare)

const showShareContactPicker = ref(false)
const shareDataForPicker = ref(null)

function handleShareToSms(e) {
  shareDataForPicker.value = e.detail
  showShareContactPicker.value = true
}

function handleShareToContact(contact) {
  showShareContactPicker.value = false
  pendingSmsShare.value = {
    contactId: contact.id,
    contact,
    shareData: shareDataForPicker.value,
  }
  openApp('sms')
}

onMounted(() => {
  window.addEventListener('avg:share-to-sms', handleShareToSms)
})
onUnmounted(() => {
  window.removeEventListener('avg:share-to-sms', handleShareToSms)
})

// ===== 手机主屏数据 =====
const phoneCharacter = usePhoneHomeCharacter()
const phoneWeather = usePhoneHomeWeather()
const phoneCalendarEvents = ref([])

provide('phoneCharacter', phoneCharacter)
provide('phoneWeather', phoneWeather)
provide('phoneCalendarEvents', phoneCalendarEvents)

onMounted(async () => {
  try {
    phoneCalendarEvents.value = await loadCalendarEvents()
  } catch (e) {
    console.warn('[PhoneScreen] load calendar events failed:', e.message)
  }
})

// Capacitor 通知点击监听
onMounted(async () => {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action.notification?.extra || {}
      if (extra.type === 'spontaneous_call') {
        handleNotificationClick({
          appId: 'sms',
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
  scrapbook: { component: ScrapbookScreen, icon: '📓', name: '手帐' },
  browser: { component: PhoneBrowserApp, icon: '🧭', name: '浏览器' },
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
      <div class="push-notification-icon">{{ pushNotification.type === 'voice_call' ? '&#x1F4DE;' : pushNotification.isSpotCheck ? '&#x1F3A4;' : '&#x1F4AC;' }}</div>
      <div class="push-notification-body">
        <div class="push-notification-sender">{{ pushNotification.type === 'voice_call' ? '来电' : pushNotification.isSpotCheck ? '查岗' : '短信' }}：{{ pushNotification.contactName }}</div>
        <div class="push-notification-text">{{ pushNotification.text }}</div>
      </div>
      <button class="push-notification-close" @click.stop="pushNotification = null">×</button>
    </div>

    <!-- 分享角色选择浮层 -->
    <div v-if="showShareContactPicker" class="share-overlay" @click.self="showShareContactPicker = false">
      <div class="share-card">
        <div class="share-header">
          <h3>选择分享对象</h3>
          <button class="share-close-btn" @click="showShareContactPicker = false">×</button>
        </div>
        <div v-if="shareDataForPicker" class="share-preview">
          <span class="share-preview-icon">📖</span>
          <span class="share-preview-text">{{ shareDataForPicker.excerpt?.substring(0, 60) || '未知内容' }}</span>
        </div>
        <div class="share-contact-list">
          <div
            v-for="contact in shareContacts"
            :key="contact.id"
            class="share-contact-item"
            @click="handleShareToContact(contact)"
          >
            <img v-if="contact.smsAvatar" :src="contact.smsAvatar" class="share-contact-avatar-img" />
            <div v-else class="share-contact-avatar">{{ contact.name?.[0] }}</div>
            <span class="share-contact-name">{{ contact.name }}</span>
          </div>
          <div v-if="shareContacts.length === 0" class="share-contact-empty">暂无联系人</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 分享选择浮层 */
.share-overlay {
  position: fixed;
  inset: 0;
  z-index: 10010;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  animation: fadeIn 0.2s ease;
}

.share-card {
  background: #fff;
  border-radius: 20px;
  width: 90%;
  max-width: 380px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.25s ease;
}

.share-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0e8ff;
}

.share-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #2d2040;
}

.share-close-btn {
  background: none;
  border: none;
  font-size: 1.4rem;
  color: #b0a8c0;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
}

.share-close-btn:hover {
  color: #2d2040;
  background: #f0e8ff;
}

/* 分享预览 */
.share-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: linear-gradient(135deg, #f8f0ff, #f0e8ff);
  border-bottom: 1px solid #ede4ff;
}

.share-preview-icon {
  font-size: 1.4rem;
  flex-shrink: 0;
}

.share-preview-text {
  font-size: 0.8rem;
  color: #4a3d5c;
  line-height: 1.4;
}

/* 联系人列表 */
.share-contact-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  -webkit-overflow-scrolling: touch;
}

.share-contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  cursor: pointer;
  transition: background 0.15s;
}

.share-contact-item:hover {
  background: #f8f4ff;
}

.share-contact-item:active {
  background: #f0e8ff;
}

.share-contact-avatar-img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.share-contact-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a855f7, #8b5cf6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 700;
  flex-shrink: 0;
}

.share-contact-name {
  font-size: 0.9rem;
  font-weight: 500;
  color: #2d2040;
}

.share-contact-empty {
  text-align: center;
  padding: 40px 20px;
  color: #b0a8c0;
  font-size: 0.9rem;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.platform-android.android-portrait .share-close-btn {
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  flex: none !important;
  font-size: 1.1rem !important;
  padding: 6px 10px !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 8px !important;
  white-space: nowrap !important;
}
</style>
