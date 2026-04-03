<script setup>
/**
 * 手机插件
 * 在游戏界面显示一个手机模拟器，包含各种应用程序
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'

// 手机状态
const isPhoneVisible = ref(false)
const currentApp = ref(null) // 当前打开的app，null表示主屏幕

// 拖动状态
const phonePosition = ref({ x: window.innerWidth - 80, y: window.innerHeight - 80 }) // 默认位置（右下角偏移）
const isDragging = ref(false)
const dragStartPos = ref({ x: 0, y: 0 })
const phoneStartPos = ref({ x: 0, y: 0 })

// 通讯录数据
const contacts = ref([
  { id: 1, name: '妈妈', phone: '138-0000-0001', avatar: '👩', recent: true },
  { id: 2, name: '爸爸', phone: '138-0000-0002', avatar: '👨', recent: true },
  { id: 3, name: '小明', phone: '139-1111-2222', avatar: '👦', recent: false },
  { id: 4, name: '小红', phone: '139-3333-4444', avatar: '👧', recent: false },
  { id: 5, name: '老师', phone: '137-5555-6666', avatar: '👨‍🏫', recent: false },
  { id: 6, name: '老板', phone: '136-7777-8888', avatar: '🧑‍💼', recent: false },
  { id: 7, name: '快递员', phone: '135-9999-0000', avatar: '🧑‍✈️', recent: false },
])

// 通话记录
const callHistory = ref([
  { id: 1, name: '妈妈', phone: '138-0000-0001', type: 'incoming', time: '今天 10:30', duration: '5分钟' },
  { id: 2, name: '小明', phone: '139-1111-2222', type: 'outgoing', time: '今天 09:15', duration: '2分钟' },
  { id: 3, name: '爸爸', phone: '138-0000-0002', type: 'missed', time: '昨天 18:45', duration: '' },
])

// 拨号号码
const dialNumber = ref('')
const isInCall = ref(false)
const callDuration = ref(0)
let callTimer = null

// 应用列表
const apps = ref([
  { id: 'phone', name: '电话', icon: '📞', color: '#4CAF50' },
  { id: 'messages', name: '短信', icon: '💬', color: '#2196F3' },
  { id: 'camera', name: '相机', icon: '📷', color: '#9C27B0' },
  { id: 'gallery', name: '相册', icon: '🖼️', color: '#FF9800' },
  { id: 'settings', name: '设置', icon: '⚙️', color: '#607D8B' },
  { id: 'notes', name: '备忘录', icon: '📝', color: '#FFEB3B' },
])

// 当前时间显示
const currentTime = ref(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
let timeInterval = null

onMounted(() => {
  timeInterval = setInterval(() => {
    currentTime.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }, 1000)
  loadPhonePosition()
})

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval)
  }
})

// 切换手机显示
const togglePhone = () => {
  isPhoneVisible.value = !isPhoneVisible.value
  if (!isPhoneVisible.value) {
    currentApp.value = null
    isInCall.value = false
    endCall()
  }
}

// 打开应用
const openApp = (appId) => {
  currentApp.value = appId
}

// 返回主屏幕
const goHome = () => {
  currentApp.value = null
  isInCall.value = false
  endCall()
}

// ========== 拖动功能 ==========

// 开始拖动
const startDrag = (event) => {
  isDragging.value = true
  dragStartPos.value = {
    x: event.clientX,
    y: event.clientY
  }
  phoneStartPos.value = {
    x: phonePosition.value.x,
    y: phonePosition.value.y
  }
  
  // 添加全局事件监听
  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', stopDrag)
  
  // 阻止默认行为
  event.preventDefault()
}

// 拖动中
const handleDrag = (event) => {
  if (!isDragging.value) return
  
  const deltaX = event.clientX - dragStartPos.value.x
  const deltaY = event.clientY - dragStartPos.value.y
  
  // 计算新位置
  let newX = phoneStartPos.value.x + deltaX
  let newY = phoneStartPos.value.y + deltaY
  
  // 获取窗口尺寸进行边界限制
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const phoneWidth = isPhoneVisible.value ? 320 : 60
  const phoneHeight = isPhoneVisible.value ? 600 : 60
  
  // 边界限制
  newX = Math.max(0, Math.min(newX, windowWidth - phoneWidth))
  newY = Math.max(0, Math.min(newY, windowHeight - phoneHeight))
  
  phonePosition.value = { x: newX, y: newY }
}

// 结束拖动
const stopDrag = () => {
  isDragging.value = false
  
  // 移除全局事件监听
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
  
  // 保存位置
  savePhonePosition()
}

// 保存手机位置
const savePhonePosition = () => {
  localStorage.setItem('phone-position', JSON.stringify(phonePosition.value))
}

// 加载手机位置
const loadPhonePosition = () => {
  try {
    const saved = localStorage.getItem('phone-position')
    if (saved) {
      const pos = JSON.parse(saved)
      // 验证位置是否在当前窗口范围内
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      if (pos.x >= 0 && pos.x < windowWidth - 60 && pos.y >= 0 && pos.y < windowHeight - 60) {
        phonePosition.value = pos
      }
    }
  } catch {
    // 使用默认位置
  }
}

// 拨号
const pressKey = (key) => {
  if (dialNumber.value.length < 15) {
    dialNumber.value += key
  }
}

// 删除最后一位
const deleteLastDigit = () => {
  dialNumber.value = dialNumber.value.slice(0, -1)
}

// 清空号码
const clearNumber = () => {
  dialNumber.value = ''
}

// 拨打电话
const makeCall = (phone) => {
  if (phone) {
    dialNumber.value = phone.replace(/-/g, '')
  }
  if (dialNumber.value) {
    isInCall.value = true
    callDuration.value = 0
    callTimer = setInterval(() => {
      callDuration.value++
    }, 1000)
  }
}

// 结束通话
const endCall = () => {
  if (callTimer) {
    clearInterval(callTimer)
    callTimer = null
  }
  isInCall.value = false
}

// 格式化通话时长
const formatCallDuration = (seconds) => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// 获取通话类型图标
const getCallTypeIcon = (type) => {
  switch (type) {
    case 'incoming': return '📥'
    case 'outgoing': return '📤'
    case 'missed': return '📵'
    default: return '📞'
  }
}

// 获取联系人头像
const getContactAvatar = (name) => {
  const contact = contacts.value.find(c => c.name === name)
  return contact ? contact.avatar : '👤'
}
</script>

<template>
  <div
    class="phone-plugin"
    :class="{ dragging: isDragging }"
    :style="{
      right: 'auto',
      bottom: 'auto',
      left: phonePosition.x + 'px',
      top: phonePosition.y + 'px'
    }"
  >
    <!-- 手机触发按钮 -->
    <button
      class="phone-trigger"
      @mousedown="startDrag"
      @click="togglePhone"
      title="打开手机"
    >
      📱
    </button>

    <!-- 手机界面 -->
    <Transition name="phone-slide">
      <div v-if="isPhoneVisible" class="phone-container">
        <div class="phone-frame">
          <!-- 状态栏 -->
          <div class="status-bar">
            <span class="time">{{ currentTime }}</span>
            <div class="status-icons">
              <span>📶</span>
              <span>🔋</span>
            </div>
          </div>

          <!-- 主屏幕 -->
          <div v-if="!currentApp" class="home-screen">
            <!-- 时间显示 -->
            <div class="lock-time">
              <div class="big-time">{{ currentTime }}</div>
              <div class="date">{{ new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) }}</div>
            </div>

            <!-- 应用网格 -->
            <div class="app-grid">
              <div 
                v-for="app in apps" 
                :key="app.id" 
                class="app-icon"
                @click="openApp(app.id)"
              >
                <div class="app-icon-bg" :style="{ backgroundColor: app.color }">
                  {{ app.icon }}
                </div>
                <span class="app-name">{{ app.name }}</span>
              </div>
            </div>
          </div>

          <!-- 电话应用 -->
          <div v-else-if="currentApp === 'phone'" class="app-screen phone-app">
            <!-- 应用标题栏 -->
            <div class="app-header">
              <button class="back-btn" @click="goHome">←</button>
              <span class="app-title">📞 电话</span>
            </div>

            <!-- 通话中界面 -->
            <div v-if="isInCall" class="calling-screen">
              <div class="calling-avatar">👤</div>
              <div class="calling-number">{{ dialNumber }}</div>
              <div class="calling-duration">{{ formatCallDuration(callDuration) }}</div>
              <button class="end-call-btn" @click="endCall">
                📵 挂断
              </button>
            </div>

            <!-- 拨号和通讯录界面 -->
            <div v-else class="phone-content">
              <!-- 拨号显示 -->
              <div class="dial-display">
                <input 
                  type="text" 
                  v-model="dialNumber" 
                  placeholder="输入号码"
                  readonly
                />
                <button v-if="dialNumber" class="clear-btn" @click="clearNumber">✕</button>
              </div>

              <!-- 拨号键盘 -->
              <div class="dial-pad">
                <button v-for="key in ['1','2','3','4','5','6','7','8','9','*','0','#']" 
                        :key="key" 
                        class="dial-key"
                        @click="pressKey(key)">
                  {{ key }}
                </button>
                <button class="dial-key delete-key" @click="deleteLastDigit">⌫</button>
              </div>

              <!-- 拨打按钮 -->
              <button class="call-btn" @click="makeCall()">
                📞 拨打
              </button>

              <!-- 通讯录标签 -->
              <div class="contacts-section">
                <h4>通讯录</h4>
                <div class="contacts-list">
                  <div 
                    v-for="contact in contacts" 
                    :key="contact.id" 
                    class="contact-item"
                    @click="makeCall(contact.phone)"
                  >
                    <span class="contact-avatar">{{ contact.avatar }}</span>
                    <div class="contact-info">
                      <span class="contact-name">{{ contact.name }}</span>
                      <span class="contact-phone">{{ contact.phone }}</span>
                    </div>
                    <span class="call-icon">📞</span>
                  </div>
                </div>
              </div>

              <!-- 通话记录 -->
              <div class="history-section">
                <h4>通话记录</h4>
                <div class="history-list">
                  <div 
                    v-for="record in callHistory" 
                    :key="record.id" 
                    class="history-item"
                    @click="makeCall(record.phone)"
                  >
                    <span class="history-type">{{ getCallTypeIcon(record.type) }}</span>
                    <div class="history-info">
                      <span class="history-name">{{ record.name }}</span>
                      <span class="history-time">{{ record.time }}</span>
                    </div>
                    <span class="call-icon">📞</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 其他应用占位 -->
          <div v-else class="app-screen">
            <div class="app-header">
              <button class="back-btn" @click="goHome">←</button>
              <span class="app-title">{{ apps.find(a => a.id === currentApp)?.icon }} {{ apps.find(a => a.id === currentApp)?.name }}</span>
            </div>
            <div class="app-placeholder">
              <p>🚧 应用开发中...</p>
              <p class="hint">此应用功能即将上线</p>
            </div>
          </div>

          <!-- 底部导航栏 -->
          <div class="nav-bar">
            <button class="nav-btn" @click="goHome">🏠</button>
            <button class="nav-btn" @click="togglePhone">✕</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ========== 扁平化现代设计风格 ========== */

.phone-plugin {
  position: fixed;
  z-index: 1000;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.phone-plugin.dragging {
  cursor: grabbing;
}

.phone-plugin.dragging .phone-trigger {
  cursor: grabbing;
}

/* 触发按钮 - 简洁圆形设计 */
.phone-trigger {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: #ffffff;
  color: #333;
  font-size: 26px;
  cursor: grab;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.phone-trigger:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.phone-trigger:active {
  transform: scale(0.95);
}

.phone-container {
  position: absolute;
  top: 65px;
  left: 0;
  z-index: 999;
}

/* 手机框架 - 现代扁平设计 */
.phone-frame {
  width: 300px;
  height: 580px;
  background: #f5f5f7;
  border-radius: 24px;
  border: none;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 状态栏 - 简洁设计 */
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #ffffff;
  color: #1d1d1f;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.status-icons {
  display: flex;
  gap: 6px;
  font-size: 12px;
}

/* 主屏幕 */
.home-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 16px;
  overflow-y: auto;
  background: linear-gradient(180deg, #ffffff 0%, #f5f5f7 100%);
}

.lock-time {
  text-align: center;
  margin-bottom: 40px;
  padding-top: 20px;
}

.big-time {
  font-size: 56px;
  font-weight: 300;
  color: #1d1d1f;
  letter-spacing: -2px;
  line-height: 1;
}

.date {
  font-size: 15px;
  color: #86868b;
  margin-top: 8px;
  font-weight: 400;
}

/* 应用网格 - 现代图标设计 */
.app-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px 16px;
  padding: 8px;
}

.app-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.app-icon:hover {
  transform: scale(1.05);
}

.app-icon:active {
  transform: scale(0.95);
}

.app-icon-bg {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  box-shadow: none;
  transition: box-shadow 0.15s ease;
}

.app-icon:hover .app-icon-bg {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.app-name {
  font-size: 12px;
  color: #1d1d1f;
  margin-top: 8px;
  text-align: center;
  font-weight: 400;
}

/* 应用屏幕 */
.app-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
}

.app-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  background: #ffffff;
  color: #1d1d1f;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.back-btn {
  background: none;
  border: none;
  color: #007aff;
  font-size: 18px;
  cursor: pointer;
  padding: 8px 12px;
  margin-right: 8px;
  border-radius: 8px;
  transition: background 0.15s ease;
}

.back-btn:hover {
  background: rgba(0, 122, 255, 0.1);
}

.app-title {
  font-size: 17px;
  font-weight: 600;
  color: #1d1d1f;
}

/* 电话应用 */
.phone-app .phone-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #f5f5f7;
}

/* 拨号显示 - 简洁输入框 */
.dial-display {
  display: flex;
  align-items: center;
  background: #ffffff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.dial-display input {
  flex: 1;
  background: none;
  border: none;
  color: #1d1d1f;
  font-size: 28px;
  text-align: center;
  outline: none;
  font-weight: 300;
  letter-spacing: 2px;
}

.dial-display input::placeholder {
  color: #86868b;
}

.dial-display .clear-btn {
  background: none;
  border: none;
  color: #86868b;
  font-size: 18px;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.dial-display .clear-btn:hover {
  color: #ff3b30;
  background: rgba(255, 59, 48, 0.1);
}

/* 拨号键盘 - 圆形扁平按钮 */
.dial-pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
  padding: 8px;
}

.dial-key {
  height: 56px;
  border-radius: 50%;
  border: none;
  background: #ffffff;
  color: #1d1d1f;
  font-size: 22px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dial-key:hover {
  background: #f5f5f7;
}

.dial-key:active {
  background: #e5e5e7;
  transform: scale(0.92);
}

.delete-key {
  background: #ff3b30;
  color: #ffffff;
}

.delete-key:hover {
  background: #ff453a;
}

/* 拨打按钮 - 简洁绿色 */
.call-btn {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  border: none;
  background: #34c759;
  color: #ffffff;
  font-size: 17px;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 20px;
  transition: all 0.15s ease;
}

.call-btn:hover {
  background: #30d158;
}

.call-btn:active {
  transform: scale(0.98);
}

/* 通讯录和通话记录 - 卡片式设计 */
.contacts-section,
.history-section {
  margin-top: 20px;
}

.contacts-section h4,
.history-section h4 {
  color: #86868b;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 12px;
  padding-left: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.contacts-list,
.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.contact-item,
.history-item {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  background: #ffffff;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.contact-item:hover,
.history-item:hover {
  background: #f5f5f7;
  border-color: rgba(0, 0, 0, 0.08);
}

.contact-item:active,
.history-item:active {
  transform: scale(0.98);
}

.contact-avatar {
  font-size: 28px;
  margin-right: 14px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f7;
  border-radius: 50%;
}

.contact-info,
.history-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.contact-name,
.history-name {
  color: #1d1d1f;
  font-size: 15px;
  font-weight: 500;
}

.contact-phone {
  color: #86868b;
  font-size: 13px;
  margin-top: 2px;
}

.history-time {
  color: #86868b;
  font-size: 12px;
  margin-top: 2px;
}

.history-type {
  font-size: 18px;
  margin-right: 12px;
}

.call-icon {
  font-size: 20px;
  color: #007aff;
  opacity: 0.8;
}

/* 通话中界面 - 简洁设计 */
.calling-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: #ffffff;
}

.calling-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #f5f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  margin-bottom: 24px;
}

.calling-number {
  color: #1d1d1f;
  font-size: 26px;
  font-weight: 300;
  margin-bottom: 8px;
  letter-spacing: 1px;
}

.calling-duration {
  color: #86868b;
  font-size: 15px;
  margin-bottom: 48px;
}

.end-call-btn {
  padding: 16px 48px;
  border-radius: 50px;
  border: none;
  background: #ff3b30;
  color: #ffffff;
  font-size: 17px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.end-call-btn:hover {
  background: #ff453a;
}

.end-call-btn:active {
  transform: scale(0.95);
}

/* 应用占位 - 简洁提示 */
.app-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #86868b;
  background: #ffffff;
}

.app-placeholder p {
  font-size: 16px;
  margin: 6px 0;
}

.app-placeholder .hint {
  font-size: 13px;
  color: #86868b;
}

/* 底部导航栏 - 简洁设计 */
.nav-bar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 12px 16px;
  background: #ffffff;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.nav-btn {
  background: none;
  border: none;
  color: #1d1d1f;
  font-size: 22px;
  cursor: pointer;
  padding: 10px 24px;
  border-radius: 12px;
  transition: all 0.15s ease;
}

.nav-btn:hover {
  background: #f5f5f7;
}

.nav-btn:active {
  transform: scale(0.9);
}

/* 动画 */
.phone-slide-enter-active,
.phone-slide-leave-active {
  transition: all 0.3s ease;
}

.phone-slide-enter-from,
.phone-slide-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}
</style>