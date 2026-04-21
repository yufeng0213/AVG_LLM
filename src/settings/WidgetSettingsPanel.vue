<template>
  <div class="widget-settings-panel">
    <h2 class="panel-title">Widget 取景框设置</h2>

    <!-- 平台警告 -->
    <div v-if="!isAndroid" class="platform-warning">
      注意：Widget 功能仅在 Android 平台可用
    </div>

    <!-- 立绘同步 -->
    <div class="sync-section">
      <h3 class="section-title">角色立绘同步</h3>
      <p class="section-desc">将角色立绘转换为 Widget 可用的格式</p>

      <div class="sync-info">
        <p>当前世界书: <strong>{{ currentWorldBookName || '未选择' }}</strong></p>
        <p>角色数量: <strong>{{ characterCount }}</strong></p>
      </div>

      <button class="sync-btn" :disabled="syncing" @click="syncPortraits">
        {{ syncing ? '同步中...' : '同步所有角色立绘' }}
      </button>
      <p v-if="syncResult" class="sync-result">{{ syncResult }}</p>
    </div>

    <!-- 取景框样式选择 -->
    <div class="frame-section">
      <h3 class="section-title">取景框样式</h3>
      <p class="section-desc">选择 Widget 显示的取景框效果</p>

      <div class="frame-options">
        <div
          class="frame-option"
          :class="{ selected: frameStyle === 'camera' }"
          @click="selectFrame('camera')"
        >
          <span class="frame-icon">📷</span>
          <div class="frame-info">
            <span class="frame-label">相机框</span>
            <span class="frame-desc">经典绿色边框 + 暗角效果</span>
          </div>
        </div>

        <div
          class="frame-option"
          :class="{ selected: frameStyle === 'simple' }"
          @click="selectFrame('simple')"
        >
          <span class="frame-icon">⬜</span>
          <div class="frame-info">
            <span class="frame-label">简约框</span>
            <span class="frame-desc">白色虚线边框</span>
          </div>
        </div>

        <div
          class="frame-option"
          :class="{ selected: frameStyle === 'none' }"
          @click="selectFrame('none')"
        >
          <span class="frame-icon">🚫</span>
          <div class="frame-info">
            <span class="frame-label">无框</span>
            <span class="frame-desc">完全不显示边框</span>
          </div>
        </div>

        <div
          class="frame-option"
          :class="{ selected: frameStyle === 'custom' }"
          @click="selectFrame('custom')"
        >
          <span class="frame-icon">🎨</span>
          <div class="frame-info">
            <span class="frame-label">自定义</span>
            <span class="frame-desc">上传自己的 PNG 取景框</span>
          </div>
        </div>
      </div>

      <!-- 预览 -->
      <div class="preview-container">
        <p class="preview-label">预览效果</p>
        <div class="widget-preview" :class="getPreviewClass()">
          <!-- 取景框叠加层 -->
          <div class="frame-overlay" :class="'frame-preview-' + frameStyle">
            <img v-if="frameStyle === 'custom' && customFramePreview"
                 :src="customFramePreview"
                 class="custom-frame-img" />
          </div>
          <!-- 对话气泡 -->
          <div class="preview-bubble">
            <span class="preview-dialogue">今天天气真好呢~</span>
          </div>
          <!-- 角色名 -->
          <span class="preview-name">角色名</span>
          <!-- 底部栏：状态 + 语音按钮 -->
          <div class="preview-bottom-bar">
            <span class="preview-status">CONNECTED</span>
            <span class="preview-voice-btn">🎤</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 自定义取景框上传 -->
    <div v-if="frameStyle === 'custom'" class="custom-section">
      <h3 class="section-title">上传自定义取景框</h3>

      <div class="upload-area">
        <div v-if="!customFramePreview" class="upload-placeholder" @click="pickImage">
          <span class="upload-icon">📤</span>
          <p class="upload-text">点击上传 PNG 图片</p>
          <p class="upload-hint">建议尺寸: 180x110 或按 Widget 比例</p>
        </div>

        <div v-else class="upload-preview-wrapper">
          <img :src="customFramePreview" class="custom-preview-img" />
          <button class="clear-btn" @click="clearCustomFrame">清除</button>
        </div>
      </div>

      <p class="custom-tip">
        提示：PNG 图片中透明区域将显示角色立绘，非透明区域作为取景框装饰。
        建议使用带圆角或特殊形状的 PNG 以获得最佳效果。
      </p>
    </div>

    <!-- 保存按钮 -->
    <div class="actions">
      <button class="save-btn" :disabled="saving" @click="saveSettings">
        {{ saving ? '保存中...' : '保存设置' }}
      </button>
      <p v-if="saveMessage" class="save-msg">{{ saveMessage }}</p>
    </div>

    <!-- 使用说明 -->
    <div class="help-section">
      <h3 class="section-title">使用说明</h3>
      <ul class="help-list">
        <li><strong>点击 Widget</strong>：直接在桌面进行语音对话（不会打开应用）</li>
        <li><strong>悬浮窗口权限</strong>：首次使用需要在系统设置中授权"显示在其他应用上层"</li>
        <li><strong>立绘同步</strong>：将角色立绘保存到文件系统，让 Widget 可以直接读取</li>
        <li><strong>对话气泡</strong>：显示你的对话历史或随机对话</li>
        <li><strong>取景框</strong>：选择不同风格的取景框叠加在立绘上</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { loadWorldBooks, getActiveWorldBookId } from '../worldbook/worldBookStore.js'
import { syncAllCharacterPortraits } from '../utils/widgetSync.js'

const isAndroid = computed(() => Capacitor.getPlatform() === 'android')
const frameStyle = ref('camera')
const customFramePreview = ref(null)
const saving = ref(false)
const saveMessage = ref('')

// 同步相关
const syncing = ref(false)
const syncResult = ref('')
const currentWorldBookName = ref('')
const characterCount = ref(0)

// 加载当前设置和世界书数据
onMounted(async () => {
  try {
    const { value } = await Preferences.get({ key: 'avg_llm_widget_frame' })
    if (value) {
      frameStyle.value = value
    }

    // 检查是否有自定义取景框
    const { value: customPath } = await Preferences.get({ key: 'avg_llm_widget_custom_frame_path' })
    if (customPath) {
      customFramePreview.value = customPath
    }

    // 加载世界书数据
    await loadWorldBookData()
  } catch (e) {
    console.error('Failed to load widget settings:', e)
  }
})

// 加载世界书数据
const loadWorldBookData = async () => {
  try {
    const worldBooks = await loadWorldBooks()
    const activeId = await getActiveWorldBookId()

    if (worldBooks && worldBooks.length > 0) {
      const activeBook = worldBooks.find(b => b.id === activeId) || worldBooks[0]
      currentWorldBookName.value = activeBook?.name || activeBook?.id || '默认'
      characterCount.value = activeBook?.characters?.length || 0
    }
  } catch (e) {
    console.error('Failed to load world books:', e)
  }
}

// 选择取景框样式
const selectFrame = (style) => {
  frameStyle.value = style
}

// 获取预览类名
const getPreviewClass = () => {
  return {}
}

// 同步立绘
const syncPortraits = async () => {
  syncing.value = true
  syncResult.value = ''

  try {
    const worldBooks = await loadWorldBooks()
    const activeId = await getActiveWorldBookId()

    if (!worldBooks || worldBooks.length === 0) {
      syncResult.value = '未找到世界书数据'
      return
    }

    const activeBook = worldBooks.find(b => b.id === activeId) || worldBooks[0]
    const characters = activeBook?.characters || []

    if (characters.length === 0) {
      syncResult.value = '当前世界书没有角色'
      return
    }

    const result = await syncAllCharacterPortraits(characters, activeBook.id)
    syncResult.value = `同步完成: ${result.synced} 成功, ${result.failed} 失败`

    // 3秒后清除消息
    setTimeout(() => {
      syncResult.value = ''
    }, 5000)
  } catch (e) {
    console.error('Failed to sync portraits:', e)
    syncResult.value = '同步失败: ' + e.message
  } finally {
    syncing.value = false
  }
}

// 选择图片
const pickImage = async () => {
  if (!isAndroid.value) {
    // Web 平台使用文件选择
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          customFramePreview.value = ev.target.result
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
    return
  }

  // Android 使用 Capacitor 插件
  try {
    const { WidgetBackgroundPicker } = await import('../capacitor-plugins/WidgetBackgroundPicker.js')
    const result = await WidgetBackgroundPicker.pickImage()
    if (result.success) {
      customFramePreview.value = result.filePath
      console.log('Custom frame saved:', result.filePath)
    }
  } catch (e) {
    console.error('Failed to pick image:', e)
    saveMessage.value = '图片选择失败: ' + e.message
  }
}

// 清除自定义取景框
const clearCustomFrame = async () => {
  customFramePreview.value = null
  try {
    await Preferences.remove({ key: 'avg_llm_widget_custom_frame_path' })
  } catch (e) {
    console.error('Failed to clear custom frame:', e)
  }
}

// 保存设置
const saveSettings = async () => {
  saving.value = true
  saveMessage.value = ''

  try {
    // 保存取景框样式
    await Preferences.set({
      key: 'avg_llm_widget_frame',
      value: frameStyle.value
    })

    // 如果有自定义取景框路径，也保存
    if (frameStyle.value === 'custom' && customFramePreview.value) {
      await Preferences.set({
        key: 'avg_llm_widget_custom_frame_path',
        value: customFramePreview.value
      })
    }

    saveMessage.value = '设置已保存！'

    // 3秒后清除消息
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  } catch (e) {
    console.error('Failed to save settings:', e)
    saveMessage.value = '保存失败: ' + e.message
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.widget-settings-panel {
  padding: 16px;
  max-width: 600px;
}

.panel-title {
  font-size: 20px;
  color: #FFFFFF;
  margin-bottom: 16px;
  font-weight: bold;
}

.platform-warning {
  background: #332200;
  color: #FFAA00;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  color: #AAAAAA;
  margin-bottom: 8px;
  font-weight: normal;
}

.section-desc {
  font-size: 12px;
  color: #666666;
  margin-bottom: 12px;
}

.sync-section {
  background: #1A1A2E;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
}

.sync-info {
  margin-bottom: 12px;
}

.sync-info p {
  font-size: 14px;
  color: #AAAAAA;
  margin-bottom: 4px;
}

.sync-info strong {
  color: #FFFFFF;
}

.sync-btn {
  padding: 12px 24px;
  background: #3366CC;
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.sync-btn:hover {
  background: #4477DD;
}

.sync-btn:disabled {
  background: #555;
  cursor: not-allowed;
}

.sync-result {
  margin-top: 8px;
  font-size: 13px;
  color: #00FF88;
}

.frame-section {
  margin-bottom: 24px;
}

.frame-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.frame-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #2D2D44;
  border: 2px solid #3D3D5C;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.frame-option:hover {
  border-color: #5D5D7C;
}

.frame-option.selected {
  border-color: #00FF88;
  background: #1A3A2A;
}

.frame-icon {
  font-size: 24px;
  color: #FFFFFF;
}

.frame-info {
  flex: 1;
}

.frame-label {
  font-size: 14px;
  color: #FFFFFF;
  font-weight: bold;
}

.frame-desc {
  font-size: 12px;
  color: #888888;
  margin-top: 2px;
}

.preview-container {
  margin-top: 16px;
}

.preview-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.widget-preview {
  width: 180px;
  height: 110px;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 12px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

/* 取景框叠加层 */
.frame-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.frame-overlay.frame-preview-camera {
  border: 2px solid #00FF88;
  box-shadow: inset 0 0 40px rgba(0,0,0,0.5);
}

.frame-overlay.frame-preview-simple {
  border: 1px dashed rgba(255,255,255,0.5);
}

.frame-overlay.frame-preview-none {
  /* 无框 */
}

.custom-frame-img {
  width: 100%;
  height: 100%;
  object-fit: fill;
}

/* 对话气泡 */
.preview-bubble {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 140px;
  background: rgba(26, 26, 46, 0.85);
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 12px;
  padding: 6px 10px;
  z-index: 2;
}

.preview-dialogue {
  font-size: 11px;
  color: #FFFFFF;
  font-family: monospace;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

.preview-name {
  font-size: 12px;
  color: #FFFFFF;
  font-family: monospace;
  font-weight: bold;
  z-index: 2;
  margin-bottom: 4px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

.preview-bottom-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0,0,0,0.6);
  padding: 2px 6px;
  border-radius: 4px;
  z-index: 2;
}

.preview-status {
  font-size: 9px;
  color: #00FF88;
  font-family: monospace;
}

.preview-voice-btn {
  font-size: 14px;
  color: #FFFFFF;
  cursor: pointer;
}

.custom-section {
  background: #1A1A2E;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
}

.upload-area {
  margin-bottom: 12px;
}

.upload-placeholder {
  background: #2D2D44;
  border: 2px dashed #5D5D7C;
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-placeholder:hover {
  border-color: #00FF88;
  background: #3D3D55;
}

.upload-icon {
  font-size: 32px;
}

.upload-text {
  font-size: 14px;
  color: #FFFFFF;
  margin-top: 8px;
}

.upload-hint {
  font-size: 12px;
  color: #888888;
  margin-top: 4px;
}

.upload-preview-wrapper {
  position: relative;
}

.custom-preview-img {
  width: 100%;
  max-width: 300px;
  border-radius: 8px;
  border: 2px solid #00FF88;
}

.clear-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #FF3333;
  color: #FFFFFF;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.custom-tip {
  font-size: 12px;
  color: #888888;
  line-height: 1.6;
}

.actions {
  margin-bottom: 24px;
}

.save-btn {
  padding: 12px 24px;
  background: #00AA66;
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.save-btn:hover {
  background: #00BB77;
}

.save-btn:disabled {
  background: #555;
  cursor: not-allowed;
}

.save-msg {
  margin-top: 8px;
  font-size: 13px;
  color: #00FF88;
}

.help-section {
  background: #1A1A2E;
  padding: 16px;
  border-radius: 8px;
}

.help-list {
  font-size: 13px;
  color: #CCCCCC;
  line-height: 2;
}

.help-list li {
  margin-bottom: 4px;
}

.help-list strong {
  color: #FFFFFF;
}
</style>