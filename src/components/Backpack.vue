<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { kvStorage } from '../storage/index.js'
import { isAndroid } from '../utils/platform.js'

const props = defineProps({
  worldBook: {
    type: Object,
    default: null,
  },
  saveSlotId: {
    type: [String, Number],
    default: '',
  },
  dialogueHistory: {
    type: Array,
    default: () => [],
  },
  currentLine: {
    type: Object,
    default: null,
  },
})

const BACKPACK_STORAGE_PREFIX = 'backpack-items'
const BACKPACK_POSITION_STORAGE_KEY = 'backpack-position'
const MAX_ITEMS = 180

const backpackRef = ref(null)
const isOpen = ref(false)
const isUsing = ref(false)
const useError = ref('')

const items = ref([])
const selectedItemId = ref('')

const isDragging = ref(false)
const dragMoved = ref(false)
const activePointerId = ref(null)
const pointerCaptureTarget = ref(null)
const dragStartPos = ref({ x: 0, y: 0 })
const backpackStartPos = ref({ x: 0, y: 0 })
const dragSize = ref({ width: 56, height: 56 })

const isAndroidPlatform = computed(() => isAndroid())

const getDefaultPosition = () => {
  if (typeof window === 'undefined') {
    return { x: 12, y: 120 }
  }

  return {
    x: Math.max(8, window.innerWidth - 72),
    y: Math.max(8, window.innerHeight - 252),
  }
}

const backpackPosition = ref(getDefaultPosition())

const backpackStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${BACKPACK_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const seedBackpackItems = () => ([
  {
    id: 'item_bandage',
    name: '应急绷带',
    description: '可以快速止血和包扎，适合紧急场景。',
    category: '医疗',
    rarity: 'common',
    tags: ['消耗', '医疗'],
    count: 2,
  },
  {
    id: 'item_access_card',
    name: '旧门禁卡',
    description: '边缘磨损严重，也许还能打开某些老旧门禁。',
    category: '关键道具',
    rarity: 'rare',
    tags: ['钥匙', '剧情'],
    count: 1,
  },
  {
    id: 'item_battery',
    name: '备用电池',
    description: '常见的高容量电池，可给便携设备补充电力。',
    category: '工具',
    rarity: 'common',
    tags: ['工具', '电力'],
    count: 3,
  },
])

const normalizeCount = (value, fallback = 1) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(999, parsed))
}

const normalizeTags = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 8)
}

const normalizeRarity = (value) => {
  const rarity = String(value || '').trim().toLowerCase()
  if (['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(rarity)) {
    return rarity
  }
  return 'common'
}

const normalizeItem = (raw, index = 0) => {
  const name = String(raw?.name || '').trim()
  if (!name) return null

  const count = normalizeCount(raw?.count ?? raw?.quantity, 1)
  if (count <= 0) return null

  return {
    id: String(raw?.id || `bag_item_${index + 1}`).trim() || `bag_item_${index + 1}`,
    name,
    description: String(raw?.description || raw?.detail || raw?.summary || '').trim(),
    category: String(raw?.category || raw?.type || '物品').trim() || '物品',
    rarity: normalizeRarity(raw?.rarity),
    tags: normalizeTags(raw?.tags),
    count,
  }
}

const normalizeStoredPayload = (raw) => {
  if (Array.isArray(raw)) {
    return {
      items: raw
        .map((item, index) => normalizeItem(item, index))
        .filter(Boolean)
        .slice(0, MAX_ITEMS),
    }
  }

  const source = raw && typeof raw === 'object' ? raw : {}
  const normalizedItems = Array.isArray(source.items)
    ? source.items
        .map((item, index) => normalizeItem(item, index))
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
    : []

  return {
    items: normalizedItems,
  }
}

const selectedItem = computed(() =>
  items.value.find((item) => item.id === selectedItemId.value) || null,
)

const totalCount = computed(() =>
  items.value.reduce((sum, item) => sum + (Number.isFinite(item.count) ? item.count : 0), 0),
)

const getRarityLabel = (rarity) => {
  if (rarity === 'legendary') return '传说'
  if (rarity === 'epic') return '史诗'
  if (rarity === 'rare') return '稀有'
  if (rarity === 'uncommon') return '普通+'
  return '普通'
}

const syncSelectedItem = () => {
  const currentId = String(selectedItemId.value || '').trim()
  if (!currentId) return
  const exists = items.value.some((item) => item.id === currentId)
  if (!exists) {
    selectedItemId.value = ''
  }
}

const persistBackpackData = async () => {
  try {
    await kvStorage.set(backpackStorageKey.value, items.value.slice(0, MAX_ITEMS))
  } catch {
    // no-op
  }
}

const loadBackpackData = async () => {
  try {
    const raw = await kvStorage.get(backpackStorageKey.value)
    const normalized = normalizeStoredPayload(raw)
    const nextItems = normalized.items.length > 0 ? normalized.items : seedBackpackItems()
    items.value = nextItems
    syncSelectedItem()

    if (!raw || normalized.items.length === 0) {
      await persistBackpackData()
    }
  } catch {
    items.value = seedBackpackItems()
    syncSelectedItem()
    await persistBackpackData()
  }
}

const loadBackpackPosition = async () => {
  try {
    const raw = await kvStorage.get(BACKPACK_POSITION_STORAGE_KEY)
    if (!raw || typeof raw !== 'object') {
      backpackPosition.value = getDefaultPosition()
      return
    }

    const nextX = Number(raw.x)
    const nextY = Number(raw.y)
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      backpackPosition.value = getDefaultPosition()
      return
    }

    backpackPosition.value = {
      x: Math.max(0, nextX),
      y: Math.max(0, nextY),
    }
  } catch {
    backpackPosition.value = getDefaultPosition()
  }
}

const saveBackpackPosition = async () => {
  try {
    await kvStorage.set(BACKPACK_POSITION_STORAGE_KEY, backpackPosition.value)
  } catch {
    // no-op
  }
}

const getFallbackSize = () => {
  if (isOpen.value) {
    return isAndroidPlatform.value
      ? { width: 308, height: 456 }
      : { width: 352, height: 498 }
  }
  return { width: 56, height: 56 }
}

const getCurrentSize = () => {
  const root = backpackRef.value
  if (root) {
    const rect = root.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      return { width: rect.width, height: rect.height }
    }
  }
  return getFallbackSize()
}

const clampPositionToViewport = (position = backpackPosition.value) => {
  if (typeof window === 'undefined') return
  const size = getCurrentSize()
  const maxX = Math.max(0, window.innerWidth - size.width)
  const maxY = Math.max(0, window.innerHeight - size.height)
  backpackPosition.value = {
    x: Math.max(0, Math.min(position.x, maxX)),
    y: Math.max(0, Math.min(position.y, maxY)),
  }
}

const toggleItemExpand = (itemId) => {
  const nextId = String(itemId || '').trim()
  if (!nextId) return
  selectedItemId.value = selectedItemId.value === nextId ? '' : nextId
  useError.value = ''
}

const applyItemDelta = (itemId, delta) => {
  if (!delta) return
  items.value = items.value
    .map((item) => {
      if (item.id !== itemId) return item
      return {
        ...item,
        count: Math.max(0, item.count + delta),
      }
    })
    .filter((item) => item.count > 0)
}

const useSelectedItem = async (targetItemId = '') => {
  if (isUsing.value) return

  const normalizedTargetId = String(targetItemId || '').trim()
  if (normalizedTargetId) {
    selectedItemId.value = normalizedTargetId
  }

  const item = normalizedTargetId
    ? items.value.find((entry) => entry.id === normalizedTargetId) || null
    : selectedItem.value
  if (!item) {
    useError.value = '请先选择物品'
    return
  }

  if (item.count <= 0) {
    useError.value = '该物品数量不足'
    return
  }

  useError.value = ''
  isUsing.value = true

  try {
    applyItemDelta(item.id, -1)

    syncSelectedItem()
    await persistBackpackData()

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('backpack-use-request', {
        detail: {
          worldBookId: String(props.worldBook?.id || '').trim(),
          saveSlotId: String(props.saveSlotId || '').trim(),
          itemId: item.id,
          itemName: item.name,
          itemDescription: String(item.description || '').trim(),
          itemCategory: String(item.category || '').trim(),
          tags: Array.isArray(item.tags) ? item.tags : [],
          promptText: `使用了 ${item.name}`,
          timestamp: new Date().toISOString(),
        },
      }))
    }
  } finally {
    isUsing.value = false
  }
}

const toggleBackpack = () => {
  if (dragMoved.value) {
    dragMoved.value = false
    return
  }
  isOpen.value = !isOpen.value
  if (!isOpen.value) {
    useError.value = ''
  }
}

const collapseBackpack = () => {
  if (!isOpen.value) return
  isOpen.value = false
  useError.value = ''
}

const startDrag = (event) => {
  if (typeof event.pointerId !== 'number') return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (event.target.closest('.bag-no-drag')) return

  activePointerId.value = event.pointerId
  const captureTarget = event.currentTarget
  if (captureTarget && typeof captureTarget.setPointerCapture === 'function') {
    try {
      captureTarget.setPointerCapture(event.pointerId)
      pointerCaptureTarget.value = captureTarget
    } catch {
      pointerCaptureTarget.value = null
    }
  } else {
    pointerCaptureTarget.value = null
  }

  dragSize.value = getCurrentSize()
  isDragging.value = true
  dragMoved.value = false
  dragStartPos.value = {
    x: event.clientX,
    y: event.clientY,
  }
  backpackStartPos.value = {
    x: backpackPosition.value.x,
    y: backpackPosition.value.y,
  }

  document.addEventListener('pointermove', handleDrag)
  document.addEventListener('pointerup', stopDrag)
  document.addEventListener('pointercancel', stopDrag)

  if (event.cancelable) {
    event.preventDefault()
  }
}

const handleDrag = (event) => {
  if (!isDragging.value) return
  if (activePointerId.value !== null && event.pointerId !== activePointerId.value) return

  const deltaX = event.clientX - dragStartPos.value.x
  const deltaY = event.clientY - dragStartPos.value.y
  if (!dragMoved.value && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
    dragMoved.value = true
  }

  let nextX = backpackStartPos.value.x + deltaX
  let nextY = backpackStartPos.value.y + deltaY

  const maxX = Math.max(0, window.innerWidth - dragSize.value.width)
  const maxY = Math.max(0, window.innerHeight - dragSize.value.height)
  nextX = Math.max(0, Math.min(nextX, maxX))
  nextY = Math.max(0, Math.min(nextY, maxY))

  backpackPosition.value = {
    x: nextX,
    y: nextY,
  }

  if (event.cancelable) {
    event.preventDefault()
  }
}

const stopDrag = () => {
  if (!isDragging.value) return

  isDragging.value = false
  const pointerId = activePointerId.value
  if (
    pointerCaptureTarget.value &&
    typeof pointerCaptureTarget.value.releasePointerCapture === 'function' &&
    typeof pointerId === 'number'
  ) {
    try {
      pointerCaptureTarget.value.releasePointerCapture(pointerId)
    } catch {
      // no-op
    }
  }

  pointerCaptureTarget.value = null
  activePointerId.value = null

  document.removeEventListener('pointermove', handleDrag)
  document.removeEventListener('pointerup', stopDrag)
  document.removeEventListener('pointercancel', stopDrag)

  saveBackpackPosition()
}

const handleDocumentPointerDown = (event) => {
  if (!isOpen.value || isDragging.value) return
  const root = backpackRef.value
  if (!root) return

  const target = event.target
  if (typeof Node !== 'undefined' && target instanceof Node && root.contains(target)) {
    return
  }

  collapseBackpack()
}

const handleWindowResize = () => {
  clampPositionToViewport(backpackPosition.value)
}

const handleBackpackItemsUpdated = async (event) => {
  const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
  const worldBookId = String(detail.worldBookId || '').trim()
  const saveSlotId = String(detail.saveSlotId || '').trim()
  const currentWorldBookId = String(props.worldBook?.id || '').trim()
  const currentSaveSlotId = String(props.saveSlotId || '').trim()

  if (worldBookId && worldBookId !== currentWorldBookId) return
  if (saveSlotId && saveSlotId !== currentSaveSlotId) return

  await loadBackpackData()
}

watch(backpackStorageKey, async () => {
  await loadBackpackData()
}, { immediate: true })

watch(
  () => items.value.map((item) => `${item.id}:${item.count}`).join('|'),
  () => {
    syncSelectedItem()
  },
)

watch(isOpen, async () => {
  await nextTick()
  clampPositionToViewport(backpackPosition.value)
  await saveBackpackPosition()
})

onMounted(async () => {
  await loadBackpackPosition()
  clampPositionToViewport(backpackPosition.value)
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('backpack-items-updated', handleBackpackItemsUpdated)
})

onUnmounted(() => {
  document.removeEventListener('pointermove', handleDrag)
  document.removeEventListener('pointerup', stopDrag)
  document.removeEventListener('pointercancel', stopDrag)
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('backpack-items-updated', handleBackpackItemsUpdated)
})
</script>

<template>
  <div
    ref="backpackRef"
    class="backpack-plugin"
    :class="{ open: isOpen, dragging: isDragging, 'is-android': isAndroidPlatform }"
    :style="{
      left: `${backpackPosition.x}px`,
      top: `${backpackPosition.y}px`,
    }"
  >
    <button
      v-if="!isOpen"
      type="button"
      class="small-btn backpack-trigger"
      title="背包（可拖动）"
      @pointerdown="startDrag"
      @click="toggleBackpack"
    >
      <span class="trigger-icon">🎒</span>
    </button>

    <section v-else class="backpack-panel">
      <header class="backpack-header" @pointerdown="startDrag">
        <div class="header-main">
          <p class="header-title">背包</p>
          <p class="header-meta">物品 {{ items.length }} 种 · 共 {{ totalCount }} 件</p>
        </div>
        <button
          type="button"
          class="small-btn bag-no-drag collapse-btn"
          @pointerdown.stop
          @click="collapseBackpack"
        >
          收起
        </button>
      </header>

      <div class="backpack-content">
        <p v-if="items.length === 0" class="empty-text">背包为空</p>

        <article
          v-for="item in items"
          :key="item.id"
          class="bag-item-block"
          :class="{ expanded: selectedItemId === item.id }"
        >
          <div class="bag-item-head">
            <button
              type="button"
              class="small-btn bag-no-drag bag-item-btn"
              :class="{ active: selectedItemId === item.id }"
              @pointerdown.stop
              @click="toggleItemExpand(item.id)"
            >
              <span class="item-main">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-meta">{{ item.category }} · {{ getRarityLabel(item.rarity) }}</span>
              </span>
              <span class="item-count">x{{ item.count }}</span>
            </button>
            <button
              type="button"
              class="small-btn bag-no-drag use-inline-btn"
              :disabled="isUsing || item.count <= 0"
              @pointerdown.stop
              @click.stop="useSelectedItem(item.id)"
            >
              {{ isUsing ? '...' : '使用' }}
            </button>
          </div>

          <section v-if="selectedItemId === item.id" class="item-detail-card">
            <p class="detail-desc">{{ item.description || '暂无描述' }}</p>
            <p v-if="item.tags.length > 0" class="detail-tags">
              {{ item.tags.join(' · ') }}
            </p>

            <p v-if="useError && selectedItem?.id === item.id" class="use-error">{{ useError }}</p>
          </section>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backpack-plugin {
  position: fixed;
  z-index: 1001;
  pointer-events: auto;
  user-select: none;
}

.backpack-plugin.dragging {
  cursor: grabbing;
}

.backpack-trigger {
  width: 56px;
  height: 56px;
  min-width: 56px;
  min-height: 56px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: linear-gradient(160deg, rgba(35, 38, 48, 0.96), rgba(21, 23, 30, 0.95));
  color: #f7f8fb;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
  cursor: grab;
  touch-action: none;
}

.backpack-trigger:active {
  cursor: grabbing;
}

.trigger-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.backpack-panel {
  width: min(352px, calc(100vw - 16px));
  max-height: min(82vh, 620px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(14, 16, 22, 0.96), rgba(10, 12, 18, 0.96));
  color: #eef0f6;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.backpack-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
  cursor: grab;
  touch-action: none;
}

.backpack-header:active {
  cursor: grabbing;
}

.header-main {
  min-width: 0;
}

.header-title {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.2;
}

.header-meta {
  margin: 2px 0 0;
  font-size: 0.76rem;
  color: rgba(239, 242, 250, 0.72);
}

.collapse-btn {
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: #f5f7ff;
  font-size: 0.74rem;
  white-space: nowrap;
  cursor: pointer;
}

.backpack-content {
  flex: 1;
  min-height: 0;
  padding: 10px 10px max(10px, env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
}

.bag-item-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 6px;
  padding: 6px;
}

.bag-item-block {
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  overflow: visible;
}

.bag-item-block.expanded {
  border-color: rgba(125, 176, 255, 0.62);
  background: rgba(80, 132, 255, 0.12);
}

.bag-item-btn {
  width: 100%;
  min-width: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #eef2ff;
  text-align: left;
  cursor: pointer;
}

.bag-item-btn.active {
  background: rgba(80, 132, 255, 0.18);
}

.item-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.item-name {
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  margin-top: 2px;
  font-size: 0.7rem;
  color: rgba(239, 242, 250, 0.7);
  line-height: 1.1;
}

.item-count {
  flex-shrink: 0;
  font-size: 0.76rem;
  font-weight: 700;
  color: #9ec0ff;
}

.use-inline-btn {
  min-width: 48px;
  height: auto;
  border: 1px solid rgba(117, 184, 255, 0.84);
  border-radius: 10px;
  background: rgba(63, 128, 236, 0.2);
  color: #f7fbff;
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1;
  padding: 0 8px;
  white-space: nowrap;
  cursor: pointer;
}

.use-inline-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.item-detail-card {
  padding: 8px 10px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.14);
}

.detail-desc {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: rgba(239, 242, 250, 0.9);
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-tags {
  margin: 8px 0 0;
  font-size: 0.72rem;
  color: rgba(173, 205, 255, 0.92);
}

.use-error {
  margin: 8px 0 0;
  font-size: 0.72rem;
  color: #ff9b9b;
}

.empty-text {
  margin: 10px 0 0;
  font-size: 0.75rem;
  color: rgba(239, 242, 250, 0.7);
  line-height: 1.4;
}

@media (max-width: 768px) and (orientation: portrait) {
  .backpack-panel {
    width: min(308px, calc(100vw - 12px));
    max-height: min(78vh, 540px);
    border-radius: 14px;
  }

  .backpack-content {
    padding: 8px;
  }

  .backpack-header {
    padding: 9px 10px;
  }

  .header-title {
    font-size: 0.92rem;
  }

  .header-meta {
    font-size: 0.69rem;
  }

  .collapse-btn {
    font-size: 0.7rem;
  }

  .bag-item-head {
    gap: 5px;
    padding: 5px;
  }

  .bag-item-btn {
    width: 100% !important;
    min-width: 100% !important;
    padding: 7px 7px !important;
    border-radius: 0;
  }

  .use-inline-btn {
    min-width: 42px;
    font-size: 0.7rem;
    padding: 0 7px;
  }

  .item-name {
    font-size: 0.75rem;
  }

  .item-meta,
  .item-count {
    font-size: 0.66rem;
  }

  .item-detail-card {
    padding: 7px 8px 8px;
  }

  .detail-tags,
  .detail-desc {
    font-size: 0.7rem;
  }

  .empty-text {
    font-size: 0.64rem;
  }
}
</style>
