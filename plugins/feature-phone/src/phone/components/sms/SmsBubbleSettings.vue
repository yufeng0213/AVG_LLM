<script setup>
/**
 * SmsBubbleSettings.vue — 气泡CSS设置 + 聊天背景设置（浅色主题）
 */
const props = defineProps({
  bubbleCss: { type: String, default: '' },
  chatBgUrl: { type: String, default: '' },
  chatBgUrlInput: { type: String, default: '' },
  contextMessages: { type: Number, default: 8 },
  smsMaxTokens: { type: Number, default: 2000 },
  bubbleCssFile: { type: String, default: null },
  spotCheckEnabled: { type: Boolean, default: true },
  spotCheckMinMin: { type: Number, default: 40 },
  spotCheckMinMax: { type: Number, default: 90 },
  spotCheckWhitelist: { type: Array, default: () => [] },
  allContacts: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'close',
  'update:bubbleCss',
  'update:chatBgUrl',
  'update:chatBgUrlInput',
  'update:contextMessages',
  'update:smsMaxTokens',
  'update:spotCheckEnabled',
  'update:spotCheckMinMin',
  'update:spotCheckMinMax',
  'update:spotCheckWhitelist',
  'save-settings',
  'save-bg',
  'save-spot-check',
  'reset-css',
  'import-css',
  'bg-file-select',
  'bg-url-import',
  'bg-clear',
  'import-event-pool',
  'export-event-pool',
])
</script>

<template>
  <div class="sms-bubble-settings-overlay" @click.self="emit('close')">
    <div class="sms-bubble-settings-panel">
      <div class="settings-header">
        <h3>设置</h3>
        <button class="settings-close-btn" @click="emit('close')">&times;</button>
      </div>

      <div class="settings-body">
        <!-- 角色查岗 -->
        <label class="settings-label">角色查岗语音推送</label>
        <div class="spot-check-row">
          <label class="spot-check-toggle">
            <input
              type="checkbox"
              :checked="spotCheckEnabled ?? true"
              @change="emit('update:spotCheckEnabled', $event.target.checked)"
            />
            <span class="toggle-slider"></span>
          </label>
          <span class="spot-check-label-text">开启后角色会随机发来查岗语音</span>
        </div>
        <div class="spot-check-interval">
          <span class="interval-label-text">间隔（分钟）</span>
          <input
            :value="spotCheckMinMin ?? 40"
            @input="emit('update:spotCheckMinMin', Number($event.target.value))"
            class="interval-input"
            type="number"
            min="1"
            max="120"
            placeholder="最小"
          />
          <span class="interval-sep">～</span>
          <input
            :value="spotCheckMinMax ?? 90"
            @input="emit('update:spotCheckMinMax', Number($event.target.value))"
            class="interval-input"
            type="number"
            min="1"
            max="180"
            placeholder="最大"
          />
          <button class="interval-save-btn" @click="emit('save-spot-check')">保存</button>
        </div>
        <div class="spot-check-whitelist">
          <span class="whitelist-title">允许查岗的角色</span>
          <div class="whitelist-list">
            <label
              v-for="char in allContacts"
              :key="char.id"
              class="whitelist-item"
            >
              <span class="whitelist-name">{{ char.name }}</span>
              <label class="whitelist-toggle">
                <input
                  type="checkbox"
                  :checked="spotCheckWhitelist.includes(char.id)"
                  @change="emit('update:spotCheckWhitelist', $event.target.checked ? [...spotCheckWhitelist, char.id] : spotCheckWhitelist.filter(id => id !== char.id))"
                />
                <span class="whitelist-toggle-slider"></span>
              </label>
            </label>
          </div>
        </div>

        <label class="settings-label" style="margin-top: 16px;">发送上下文消息数</label>
        <div class="context-messages-row">
          <input
            :value="contextMessages"
            @input="emit('update:contextMessages', Number($event.target.value))"
            class="context-messages-input"
            type="number"
            min="0"
            step="1"
            placeholder="输入数量..."
          />
          <span class="context-messages-hint">
            {{ contextMessages > 0 ? `附带最近 ${contextMessages} 条消息` : '不带上下文，仅根据当前消息生成回复' }}
          </span>
        </div>

        <label class="settings-label" style="margin-top: 16px;">短信生成最大 tokens</label>
        <div class="context-messages-row">
          <input
            :value="smsMaxTokens"
            @input="emit('update:smsMaxTokens', Number($event.target.value))"
            class="context-messages-input"
            type="number"
            min="100"
            max="8000"
            step="100"
            placeholder="tokens..."
          />
          <span class="context-messages-hint">
            {{ smsMaxTokens >= 2000 ? `当前 ${smsMaxTokens} tokens（推荐 2000+）` : `当前 ${smsMaxTokens} tokens（建议提高到 2000+）` }}
          </span>
        </div>

        <!-- 聊天背景 -->
        <label class="settings-label" style="margin-top: 16px;">聊天背景</label>

        <div class="chat-bg-preview" :style="chatBgUrl ? { backgroundImage: 'url(' + chatBgUrl + ')' } : {}">
          <span v-if="!chatBgUrl" class="chat-bg-placeholder">暂无背景</span>
        </div>

        <div class="chat-bg-actions">
          <label class="chat-bg-btn chat-bg-upload-btn">
            上传图片
            <input type="file" accept="image/*" @change="emit('bg-file-select', $event)" />
          </label>
          <div class="chat-bg-url-row">
            <input
              :value="chatBgUrlInput"
              @input="emit('update:chatBgUrlInput', $event.target.value)"
              class="chat-bg-url-input"
              type="text"
              placeholder="图片 URL..."
              @keydown.enter="emit('bg-url-import')"
            />
            <button class="chat-bg-btn chat-bg-url-btn" @click="emit('bg-url-import')">导入</button>
          </div>
          <button class="chat-bg-btn chat-bg-clear-btn" @click="emit('bg-clear')">清除背景</button>
        </div>

        <label class="settings-label" style="margin-top: 16px;">自定义 CSS 样式</label>
        <textarea
          :value="bubbleCss"
          @input="emit('update:bubbleCss', $event.target.value)"
          class="css-editor"
          placeholder="输入自定义 CSS..."
          spellcheck="false"
        />

        <div class="settings-actions">
          <label class="import-btn">
            导入 .css 文件
            <input type="file" accept=".css" @change="emit('import-css', $event)" />
          </label>
          <button class="reset-btn" @click="emit('reset-css')">恢复默认</button>
        </div>

        <div class="css-hint">
          <p>可用选择器：</p>
          <code>.sms-bubble.user</code> — 用户消息<br/>
          <code>.sms-bubble.assistant</code> — 对方消息<br/>
          <code>.sms-bubble</code> — 通用气泡<br/>
          <code>.sms-time</code> — 时间分隔线
        </div>

        <!-- SMS 事件池 -->
        <label class="settings-label" style="margin-top: 24px;">聊天事件池</label>
        <p class="event-pool-desc">
          导入事件池后，聊天时会随机（30%概率）触发事件话题，让对话更有活人感。
        </p>
        <div class="event-pool-actions">
          <label class="event-btn event-btn--import">
            导入 JSON
            <input type="file" accept=".json" @change="emit('import-event-pool', $event)" />
          </label>
          <button class="event-btn event-btn--export" @click="emit('export-event-pool')">导出事件池</button>
        </div>
        <p class="event-pool-status">当前未加载事件池（需导入 JSON 文件）</p>
      </div>

      <div class="settings-footer">
        <button class="apply-btn" @click="emit('save-bg')">保存背景</button>
        <button class="apply-btn" @click="emit('save-settings')">应用设置</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sms-bubble-settings-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fade-in 0.2s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.sms-bubble-settings-panel {
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  background: #fff;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}

.settings-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #222;
}

.settings-close-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 1.4rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  line-height: 1;
}

.settings-close-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #555;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
}

.settings-label {
  display: block;
  font-size: 0.85rem;
  color: #666;
  font-weight: 600;
  margin-bottom: 8px;
}

.context-messages-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.context-messages-input {
  width: 80px;
  background: #f0f0f0;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 8px 12px;
  color: #333;
  font-size: 0.9rem;
  outline: none;
  text-align: center;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.context-messages-input:focus {
  border-color: #ff8fab;
  background: #fff;
}

.context-messages-input::-webkit-outer-spin-button,
.context-messages-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.context-messages-input[type='number'] {
  -moz-appearance: textfield;
}

.context-messages-hint {
  font-size: 0.78rem;
  color: #999;
}

/* 查岗设置 */
.spot-check-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.spot-check-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
}
.spot-check-toggle input { display: none; }
.toggle-slider {
  position: absolute;
  inset: 0;
  background: #ddd;
  border-radius: 12px;
  transition: background 0.2s;
}
.toggle-slider::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.spot-check-toggle input:checked + .toggle-slider {
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
}
.spot-check-toggle input:checked + .toggle-slider::after {
  transform: translateX(20px);
}
.spot-check-label-text {
  font-size: 0.78rem;
  color: #888;
}
.spot-check-interval {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.interval-label-text {
  font-size: 0.78rem;
  color: #999;
}
.interval-input {
  width: 56px;
  background: #f0f0f0;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 6px 10px;
  color: #333;
  font-size: 0.85rem;
  outline: none;
  text-align: center;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.interval-input:focus {
  border-color: #ff8fab;
  background: #fff;
}
.interval-input::-webkit-outer-spin-button,
.interval-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.interval-input[type='number'] {
  -moz-appearance: textfield;
}
.interval-sep {
  font-size: 0.85rem;
  color: #ccc;
}
.interval-save-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
  color: #fff;
  font-size: 0.78rem;
  cursor: pointer;
  font-weight: 500;
}
.interval-save-btn:hover {
  opacity: 0.85;
}

/* 查岗角色白名单 */
.spot-check-whitelist {
  margin-bottom: 16px;
  max-height: 200px;
  overflow-y: auto;
  background: #f8f8f8;
  border-radius: 10px;
  padding: 8px 12px;
}
.whitelist-title {
  font-size: 0.78rem;
  color: #999;
  display: block;
  margin-bottom: 6px;
}
.whitelist-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.whitelist-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  cursor: pointer;
}
.whitelist-name {
  font-size: 0.82rem;
  color: #333;
  flex: 1;
}
.whitelist-toggle {
  position: relative;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
}
.whitelist-toggle input[type="checkbox"] {
  display: none;
}
.whitelist-toggle-slider {
  position: absolute;
  inset: 0;
  background: #ddd;
  border-radius: 10px;
  transition: background 0.2s;
}
.whitelist-toggle-slider::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.whitelist-toggle input:checked + .whitelist-toggle-slider {
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
}
.whitelist-toggle input:checked + .whitelist-toggle-slider::after {
  transform: translateX(16px);
}

.chat-bg-preview {
  width: 100%;
  height: 80px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #f8f8f8;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
}

.chat-bg-placeholder {
  font-size: 0.75rem;
  color: #bbb;
}

.chat-bg-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.chat-bg-btn {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #f5f5f5;
  color: #fb6f92;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  transition: background 0.2s;
}

.chat-bg-btn:hover {
  background: #f0f0f0;
}

.chat-bg-btn input {
  display: none;
}

.chat-bg-url-row {
  display: flex;
  gap: 8px;
}

.chat-bg-url-input {
  flex: 1;
  background: #f0f0f0;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 8px 12px;
  color: #333;
  font-size: 0.82rem;
  outline: none;
  transition: border-color 0.15s;
}

.chat-bg-url-input:focus {
  border-color: #ff8fab;
  background: #fff;
}

.chat-bg-url-btn {
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(251, 111, 146, 0.4);
  background: rgba(251, 111, 146, 0.15);
  color: #fb6f92;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.chat-bg-clear-btn {
  color: #ff9500;
  border-color: rgba(255, 149, 0, 0.2);
  background: rgba(255, 149, 0, 0.08);
}

.css-editor {
  width: 100%;
  min-height: 200px;
  max-height: 40vh;
  background: #f8f8f8;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 12px;
  color: #333;
  font-family: var(--font-mono, 'Consolas', 'Monaco', monospace);
  font-size: 0.8rem;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  tab-size: 2;
}

.css-editor:focus {
  border-color: #ff8fab;
  background: #fff;
}

.settings-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.import-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  background: #f5f5f5;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  color: #fb6f92;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.import-btn:hover {
  background: #f0f0f0;
}

.import-btn input {
  display: none;
}

.reset-btn {
  padding: 8px 16px;
  background: #f5f5f5;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  color: #ff9500;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.reset-btn:hover {
  background: #f0f0f0;
}

.css-hint {
  margin-top: 14px;
  padding: 10px 12px;
  background: #f8f8f8;
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  font-size: 0.75rem;
  color: #888;
  line-height: 1.6;
}

.css-hint p {
  margin: 0 0 4px;
  font-weight: 600;
  color: #666;
}

.css-hint code {
  display: inline-block;
  background: #f0f0f0;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 0.72rem;
  color: #fb6f92;
  margin: 1px 0;
}

.settings-footer {
  padding: 12px 16px;
  border-top: 0.5px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.apply-btn {
  flex: 1;
  padding: 10px;
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: 0 2px 12px rgba(255, 143, 171, 0.3);
}

.apply-btn:hover {
  transform: scale(1.02);
}

.apply-btn:active {
  transform: scale(0.98);
}

.apply-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.platform-android.android-portrait .sms-bubble-settings-panel {
  background: #fff !important;
}

.platform-android.android-portrait .settings-close-btn,
.platform-android.android-portrait .reset-btn,
.platform-android.android-portrait .interval-save-btn {
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

.platform-android.android-portrait .apply-btn {
  background: linear-gradient(135deg, #ff8fab, #fb6f92) !important;
}

.platform-android.android-portrait .import-btn,
.platform-android.android-portrait .reset-btn {
  background: #f5f5f5 !important;
}

.platform-android.android-portrait .css-editor {
  background: #f8f8f8 !important;
  color: #333 !important;
}

.platform-android.android-portrait .chat-bg-preview {
  background: #f8f8f8 !important;
}

.platform-android.android-portrait .chat-bg-btn {
  background: #f5f5f5 !important;
}

.platform-android.android-portrait .chat-bg-url-input {
  background: #f0f0f0 !important;
  color: #333 !important;
}

.platform-android.android-portrait .chat-bg-url-btn {
  background: rgba(251, 111, 146, 0.2) !important;
}

.platform-android.android-portrait .chat-bg-clear-btn {
  background: rgba(255, 149, 0, 0.1) !important;
}

.platform-android.android-portrait .css-hint {
  background: #f8f8f8 !important;
}

.platform-android.android-portrait .context-messages-input {
  background: #f0f0f0 !important;
  color: #333 !important;
}

.platform-android.android-portrait .spot-check-whitelist {
  background: #f8f8f8 !important;
}

.platform-android.android-portrait .whitelist-name {
  color: #333 !important;
}

.platform-android.android-portrait .toggle-slider {
  background: #ddd !important;
}

.platform-android.android-portrait .spot-check-toggle input:checked + .toggle-slider {
  background: linear-gradient(135deg, #ff8fab, #fb6f92) !important;
}

/* 事件池 */
.event-pool-desc {
  font-size: 0.75rem;
  color: #999;
  margin: 6px 0 10px;
  line-height: 1.5;
}
.event-pool-actions {
  display: flex;
  gap: 8px;
}
.event-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  background: #f5f5f5;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  color: #fb6f92;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}
.event-btn:hover {
  background: #f0f0f0;
}
.event-btn input {
  display: none;
}
.event-btn--export {
  color: #30d158;
  border-color: rgba(48, 209, 88, 0.3);
}
.event-btn--export:hover {
  background: rgba(48, 209, 88, 0.1);
}
.event-pool-status {
  margin-top: 8px;
  font-size: 0.72rem;
  color: #bbb;
}
</style>
