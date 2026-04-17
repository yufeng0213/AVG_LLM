<script setup>
/**
 * PronunciationSettingsView.vue - 设置页
 * 自定义 TTS API 端点配置。
 */
import { ref, onMounted } from 'vue'
import { loadSettings, saveSettings } from '../composables/usePronunciationData.js'

const emit = defineEmits(['back'])

const ttsApiEndpoint = ref('')
const ttsApiKey = ref('')
const ttsVoiceId = ref('')
const preferredLanguage = ref('en')
const isSaving = ref(false)
const saveMsg = ref('')

onMounted(async () => {
  const settings = await loadSettings()
  ttsApiEndpoint.value = settings.ttsApiEndpoint || ''
  ttsApiKey.value = settings.ttsApiKey || ''
  ttsVoiceId.value = settings.ttsVoiceId || ''
  preferredLanguage.value = settings.preferredLanguage || 'en'
})

async function onSave() {
  isSaving.value = true
  saveMsg.value = ''
  try {
    await saveSettings({
      ttsApiEndpoint: ttsApiEndpoint.value.trim() || null,
      ttsApiKey: ttsApiKey.value.trim() || null,
      ttsVoiceId: ttsVoiceId.value.trim() || null,
      preferredLanguage: preferredLanguage.value,
    })
    saveMsg.value = '已保存'
    setTimeout(() => { saveMsg.value = '' }, 2000)
  } catch (e) {
    saveMsg.value = '保存失败：' + e.message
  } finally {
    isSaving.value = false
  }
}

async function onTest() {
  if (!ttsApiEndpoint.value.trim()) {
    saveMsg.value = '请先填写 API 端点'
    return
  }
  saveMsg.value = '测试中...'
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (ttsApiKey.value.trim()) {
      headers['Authorization'] = `Bearer ${ttsApiKey.value.trim()}`
    }
    const response = await fetch(ttsApiEndpoint.value.trim(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: 'Hello', language: 'en', voiceId: ttsVoiceId.value.trim() || undefined }),
    })
    if (response.ok) {
      const blob = await response.blob()
      saveMsg.value = `测试成功，返回 ${blob.size} 字节音频`
    } else {
      saveMsg.value = `测试失败：HTTP ${response.status}`
    }
  } catch (e) {
    saveMsg.value = '测试失败：' + e.message
  }
}
</script>

<template>
  <div class="pron-settings">
    <h3 class="settings-title">⚙️ 设置</h3>

    <!-- 自定义 TTS API -->
    <div class="settings-section">
      <h4 class="settings-label">TTS API 端点</h4>
      <p class="settings-hint">留空则使用默认 MiniMax TTS。配置后将使用你的自定义端点。</p>
      <input
        v-model="ttsApiEndpoint"
        class="settings-input"
        placeholder="https://your-tts-api.com/tts"
      />
    </div>

    <div class="settings-section">
      <h4 class="settings-label">API Key（可选）</h4>
      <input
        v-model="ttsApiKey"
        class="settings-input"
        type="password"
        placeholder="Bearer Token"
      />
    </div>

    <!-- 角色语音 ID -->
    <div class="settings-section">
      <h4 class="settings-label">MiniMax Voice ID</h4>
      <p class="settings-hint">使用默认 MiniMax TTS 时的角色语音 ID。留空则使用系统默认。</p>
      <input
        v-model="ttsVoiceId"
        class="settings-input"
        placeholder="例如：male-qn-qingse"
      />
    </div>

    <!-- 默认语言 -->
    <div class="settings-section">
      <h4 class="settings-label">默认语言</h4>
      <select v-model="preferredLanguage" class="settings-select">
        <option value="en">英语</option>
        <option value="zh">中文</option>
        <option value="ja">日语</option>
        <option value="ko">韩语</option>
        <option value="fr">法语</option>
        <option value="de">德语</option>
        <option value="es">西班牙语</option>
        <option value="ru">俄语</option>
      </select>
    </div>

    <!-- 保存消息 -->
    <div v-if="saveMsg" class="save-msg" :class="{ 'save-error': saveMsg.includes('失败') }">
      {{ saveMsg }}
    </div>

    <!-- 操作按钮 -->
    <div class="settings-actions">
      <button class="settings-btn test-btn" @click="onTest">测试 TTS</button>
      <button class="settings-btn save-btn" @click="onSave" :disabled="isSaving">
        {{ isSaving ? '保存中...' : '保存' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.pron-settings {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 8px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #ccc;
  margin: 0;
}

.settings-hint {
  font-size: 0.75rem;
  color: #666;
  margin: 0;
}

.settings-input {
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-size: 0.85rem;
  outline: none;
}

.settings-input:focus {
  border-color: #667eea;
}

.settings-input::placeholder {
  color: #555;
}

.settings-select {
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-size: 0.85rem;
  outline: none;
}

.settings-select option {
  background: #1a1a2e;
}

.save-msg {
  padding: 10px;
  background: rgba(52, 199, 89, 0.1);
  border-radius: 10px;
  color: #34c759;
  font-size: 0.85rem;
  text-align: center;
}

.save-error {
  background: rgba(255, 59, 48, 0.1) !important;
  color: #ff6b6b !important;
}

.settings-actions {
  display: flex;
  gap: 10px;
}

.settings-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.test-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #ccc;
}

.save-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

.settings-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
