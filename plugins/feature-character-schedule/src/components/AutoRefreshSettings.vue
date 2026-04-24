<script setup>
/**
 * AutoRefreshSettings.vue - 角色日程自动刷新配置
 * 支持启用/禁用、触发模式、刷新范围、保存配置
 */
import { computed, onMounted, ref } from 'vue'
import { SCHEDULE_CONFIG_KEY } from '../composables/useCharacterSchedule.js'
import { loadWorldBooks } from '../../../../src/worldbook/worldBookStore.js'
import { kvStorage } from '../../../../src/storage/index.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'saved'])

const defaultConfig = {
  enabled: false,
  mode: 'specificTimes',
  triggerHours: [0, 2],
  refreshIntervalHours: 2,
  scope: 'all',
  scopeBookId: '',
  scopeCharIds: [],
}

const config = ref({ ...defaultConfig })
const worldBooks = ref([])
const expandedBooks = ref(new Set())
const saving = ref(false)

onMounted(async () => {
  await loadConfig()
  worldBooks.value = await loadWorldBooks()
})

async function loadConfig() {
  try {
    const stored = await kvStorage.get(SCHEDULE_CONFIG_KEY)
    if (stored?.autoRefresh) {
      const ar = stored.autoRefresh
      config.value = {
        enabled: ar.enabled ?? false,
        mode: ar.mode || 'specificTimes',
        triggerHours: ar.triggerHours ? [...ar.triggerHours] : [0, 2],
        refreshIntervalHours: ar.refreshIntervalHours ?? 2,
        scope: ar.scope || 'all',
        scopeBookId: ar.scopeBookId || '',
        scopeCharIds: ar.scopeCharIds ? [...ar.scopeCharIds] : [],
        lastRefreshTimestamp: ar.lastRefreshTimestamp || null,
      }
    } else {
      config.value = { ...defaultConfig }
    }
  } catch {
    config.value = { ...defaultConfig }
  }
}

const lastRefreshText = computed(() => {
  if (!config.value.lastRefreshTimestamp) return '从未刷新'
  const d = new Date(config.value.lastRefreshTimestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

const totalChars = computed(() => {
  if (config.value.scope === 'all') {
    return worldBooks.value.reduce((n, b) => n + (b.characters || []).length, 0)
  }
  if (config.value.scope === 'book' && config.value.scopeBookId) {
    const book = worldBooks.value.find(b => b.id === config.value.scopeBookId)
    return (book?.characters || []).length
  }
  if (config.value.scope === 'characters') {
    return config.value.scopeCharIds.length
  }
  return 0
})

function toggleHour(hour) {
  const idx = config.value.triggerHours.indexOf(hour)
  if (idx >= 0) {
    config.value.triggerHours.splice(idx, 1)
  } else {
    config.value.triggerHours.push(hour)
  }
  config.value.triggerHours = [...config.value.triggerHours]
}

function isHourSelected(hour) {
  return config.value.triggerHours.includes(hour)
}

function toggleChar(key) {
  const idx = config.value.scopeCharIds.indexOf(key)
  if (idx >= 0) {
    config.value.scopeCharIds.splice(idx, 1)
  } else {
    config.value.scopeCharIds.push(key)
  }
  config.value.scopeCharIds = [...config.value.scopeCharIds]
}

function isCharSelected(key) {
  return config.value.scopeCharIds.includes(key)
}

function toggleBook(bookId) {
  const set = expandedBooks.value
  if (set.has(bookId)) {
    set.delete(bookId)
  } else {
    set.add(bookId)
  }
  expandedBooks.value = new Set(set)
}

async function handleSave() {
  if (saving.value) return
  saving.value = true

  try {
    const arConfig = {
      enabled: config.value.enabled,
      mode: config.value.mode,
      triggerHours: config.value.triggerHours,
      refreshIntervalHours: config.value.refreshIntervalHours,
      scope: config.value.scope,
      scopeBookId: config.value.scopeBookId,
      scopeCharIds: config.value.scopeCharIds,
      lastRefreshTimestamp: null,
    }

    const stored = await kvStorage.get(SCHEDULE_CONFIG_KEY)
    await kvStorage.set(SCHEDULE_CONFIG_KEY, {
      ...(stored || {}),
      autoRefresh: arConfig,
    })

    emit('saved', arConfig)
  } catch (e) {
    console.error('[AutoRefreshSettings] save error:', e)
  } finally {
    saving.value = false
  }
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="ar-overlay" @click.self="handleClose">
      <div class="ar-modal">
        <div class="ar-header">
          <h3 class="ar-title">自动刷新设置</h3>
          <button class="ar-close-btn" @click="handleClose">&times;</button>
        </div>

        <div class="ar-body">
          <!-- 启用开关 -->
          <div class="ar-section">
            <div class="ar-row">
              <span class="ar-label">启用自动刷新</span>
              <label class="ar-toggle">
                <input type="checkbox" v-model="config.enabled" />
                <span class="ar-toggle-slider" />
              </label>
            </div>
          </div>

          <template v-if="config.enabled">
            <!-- 触发模式 -->
            <div class="ar-section">
              <p class="ar-section-title">触发模式</p>
              <div class="ar-radio-group">
                <label class="ar-radio" :class="{ active: config.mode === 'specificTimes' }">
                  <input type="radio" value="specificTimes" v-model="config.mode" />
                  <span class="ar-radio-dot" />
                  <span class="ar-radio-label">具体时间</span>
                </label>
                <label class="ar-radio" :class="{ active: config.mode === 'interval' }">
                  <input type="radio" value="interval" v-model="config.mode" />
                  <span class="ar-radio-dot" />
                  <span class="ar-radio-label">固定间隔</span>
                </label>
              </div>

              <!-- 具体时间 -->
              <div v-if="config.mode === 'specificTimes'" class="ar-hour-grid">
                <button
                  v-for="h in 24"
                  :key="h - 1"
                  type="button"
                  class="ar-hour-btn"
                  :class="{ selected: isHourSelected(h - 1) }"
                  @click="toggleHour(h - 1)"
                >
                  {{ String(h - 1).padStart(2, '0') }}
                </button>
              </div>

              <!-- 固定间隔 -->
              <div v-if="config.mode === 'interval'" class="ar-interval-row">
                <span class="ar-interval-label">每隔</span>
                <input
                  type="number"
                  class="ar-interval-input"
                  v-model.number="config.refreshIntervalHours"
                  min="1"
                  max="24"
                  step="1"
                />
                <span class="ar-interval-unit">小时</span>
              </div>
            </div>

            <!-- 刷新范围 -->
            <div class="ar-section">
              <p class="ar-section-title">
                刷新范围
                <span class="ar-scope-count">({{ totalChars }} 个角色)</span>
              </p>
              <div class="ar-radio-group ar-scope-group">
                <label class="ar-radio" :class="{ active: config.scope === 'all' }">
                  <input type="radio" value="all" v-model="config.scope" />
                  <span class="ar-radio-dot" />
                  <span class="ar-radio-label">全部角色</span>
                </label>
                <label class="ar-radio" :class="{ active: config.scope === 'book' }">
                  <input type="radio" value="book" v-model="config.scope" />
                  <span class="ar-radio-dot" />
                  <span class="ar-radio-label">指定世界书</span>
                </label>
              </div>

              <!-- 指定世界书下拉 -->
              <div v-if="config.scope === 'book'" class="ar-book-select">
                <select v-model="config.scopeBookId" class="ar-select">
                  <option value="">请选择世界书</option>
                  <option v-for="book in worldBooks" :key="book.id" :value="book.id">
                    {{ book.title || '未命名世界书' }}
                  </option>
                </select>
              </div>

              <!-- 指定世界书下的角色复选 -->
              <div v-if="config.scope === 'book' && config.scopeBookId" class="ar-char-list">
                <label
                  v-for="char in (worldBooks.find(b => b.id === config.scopeBookId)?.characters || [])"
                  :key="char.id"
                  class="ar-char-check"
                >
                  <input
                    type="checkbox"
                    :checked="isCharSelected(`${config.scopeBookId}::${char.id}`)"
                    @change="toggleChar(`${config.scopeBookId}::${char.id}`)"
                  />
                  <span class="ar-char-name">{{ char.name || char.nickname || '未命名' }}</span>
                </label>
                <p v-if="!(worldBooks.find(b => b.id === config.scopeBookId)?.characters?.length)" class="ar-empty">
                  该世界书暂无角色
                </p>
              </div>

              <label class="ar-radio ar-scope-chars" :class="{ active: config.scope === 'characters' }">
                <input type="radio" value="characters" v-model="config.scope" />
                <span class="ar-radio-dot" />
                <span class="ar-radio-label">指定角色</span>
              </label>

              <!-- 指定角色树 -->
              <div v-if="config.scope === 'characters'" class="ar-char-tree">
                <div v-for="book in worldBooks" :key="book.id" class="ar-tree-book">
                  <div class="ar-tree-book-header" @click="toggleBook(book.id)">
                    <span class="ar-tree-arrow" :class="{ expanded: expandedBooks.has(book.id) }">&#8250;</span>
                    <span class="ar-tree-book-name">{{ book.title || '未命名世界书' }}</span>
                    <span class="ar-tree-book-count">({{ (book.characters || []).length }})</span>
                  </div>
                  <div v-show="expandedBooks.has(book.id)" class="ar-tree-chars">
                    <label
                      v-for="char in (book.characters || [])"
                      :key="char.id"
                      class="ar-char-check"
                    >
                      <input
                        type="checkbox"
                        :checked="isCharSelected(`${book.id}::${char.id}`)"
                        @change="toggleChar(`${book.id}::${char.id}`)"
                      />
                      <span class="ar-char-name">{{ char.name || char.nickname || '未命名' }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- 上次刷新 -->
            <div class="ar-section ar-section--muted">
              <p class="ar-section-title">上次刷新</p>
              <p class="ar-last-refresh">{{ lastRefreshText }}</p>
            </div>
          </template>
        </div>

        <div class="ar-footer">
          <button class="ar-btn ar-btn--cancel" @click="handleClose">取消</button>
          <button class="ar-btn ar-btn--save" :disabled="saving" @click="handleSave">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.ar-modal {
  width: 90%;
  max-width: 420px;
  max-height: 85vh;
  background: #1c1c1e;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  color: #fff;
  overflow: hidden;
}

.ar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.ar-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.ar-close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.ar-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.ar-section {
  margin-bottom: 16px;
}

.ar-section--muted {
  opacity: 0.7;
}

.ar-section-title {
  margin: 0 0 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
}

.ar-scope-count {
  font-weight: 400;
}

.ar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ar-label {
  font-size: 14px;
}

/* Toggle */
.ar-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  display: inline-block;
  cursor: pointer;
}

.ar-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.ar-toggle-slider {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  transition: background 0.2s;
}

.ar-toggle-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.ar-toggle input:checked + .ar-toggle-slider {
  background: rgba(255, 204, 0, 0.5);
}

.ar-toggle input:checked + .ar-toggle-slider::before {
  transform: translateX(20px);
}

/* Radio */
.ar-radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ar-scope-group {
  flex-direction: row;
  flex-wrap: wrap;
}

.ar-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  transition: background 0.15s;
}

.ar-radio.active {
  background: rgba(255, 204, 0, 0.15);
}

.ar-radio input {
  display: none;
}

.ar-radio-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;
  flex-shrink: 0;
}

.ar-radio-dot::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  transition: background 0.15s;
}

.ar-radio.active .ar-radio-dot {
  border-color: #ffcc00;
}

.ar-radio.active .ar-radio-dot::after {
  background: #ffcc00;
}

.ar-radio-label {
  font-size: 13px;
}

/* Hour grid */
.ar-hour-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  margin-top: 10px;
}

.ar-hour-btn {
  padding: 4px 0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  text-align: center;
}

.ar-hour-btn.selected {
  background: rgba(255, 204, 0, 0.25);
  border-color: rgba(255, 204, 0, 0.5);
  color: #fff;
}

/* Interval */
.ar-interval-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.ar-interval-label,
.ar-interval-unit {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.ar-interval-input {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 14px;
  text-align: center;
}

/* Book select */
.ar-book-select {
  margin-top: 8px;
}

.ar-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 13px;
}

.ar-select option {
  background: #1c1c1e;
  color: #fff;
}

/* Char list */
.ar-char-list,
.ar-char-tree {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.ar-char-check {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
  font-size: 13px;
}

.ar-char-check input {
  accent-color: #ffcc00;
  width: 14px;
  height: 14px;
}

.ar-char-name {
  color: rgba(255, 255, 255, 0.8);
}

.ar-empty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin: 4px 0 0;
}

/* Tree */
.ar-tree-book {
  margin-bottom: 4px;
}

.ar-tree-book-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  cursor: pointer;
  border-radius: 6px;
}

.ar-tree-book-header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.ar-tree-arrow {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  transition: transform 0.15s;
  display: inline-block;
  width: 16px;
  text-align: center;
}

.ar-tree-arrow.expanded {
  transform: rotate(90deg);
}

.ar-tree-book-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.ar-tree-book-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.ar-tree-chars {
  padding-left: 20px;
}

/* Last refresh */
.ar-last-refresh {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

/* Footer */
.ar-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.ar-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.ar-btn--cancel {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.ar-btn--save {
  background: rgba(255, 204, 0, 0.3);
  color: #fff;
}

.ar-btn--save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}



  .platform-android.android-portrait .ar-close-btn,
  .platform-android.android-portrait .ar-btn {
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
