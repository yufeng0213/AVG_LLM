<script setup>
import { ref, computed } from 'vue'
import { createPawnSpriteResolver } from '../render/pawnSprites.js'

const props = defineProps({
  pawn: { type: Object, default: null },
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'save'])

// 部件定义从 sprite resolver 获取
const spriteResolver = createPawnSpriteResolver()
const outfitDefs = spriteResolver.getOutfitDefinitions()

// 当前编辑的 outfit
const currentOutfit = computed(() => {
  if (!props.pawn?.sprite?.outfit) {
    return { hair: 'short', eyes: 'normal', top: 'robe', bottom: 'boots', accessory: 'none' }
  }
  return { ...props.pawn.sprite.outfit }
})

const currentPalette = computed(() => props.pawn?.sprite?.palette || 'ember')


const PALETTE_LIST = ['ember', 'forest', 'sky', 'violet', 'sand', 'iron', 'copper', 'silver']
const PALETTE_LABELS = {
  ember: '余烬', forest: '森林', sky: '天空', violet: '紫罗兰',
  sand: '沙漠', iron: '钢铁', copper: '铜色', silver: '银色',
}
const PALETTE_COLORS = {
  ember: '#b35943', forest: '#477e50', sky: '#507ebf', violet: '#7653ba',
  sand: '#9d7d55', iron: '#6b7688', copper: '#b87333', silver: '#9a9aa0',
}

// 当前选中的部件类别
const selectedCategory = ref('hair')
const CATEGORIES = [
  { key: 'hair', label: '发型', icon: '💇' },
  { key: 'eyes', label: '眼睛', icon: '👁️' },
  { key: 'top', label: '上衣', icon: '👕' },
  { key: 'bottom', label: '下装', icon: '👖' },
  { key: 'accessory', label: '配饰', icon: '🎩' },
]

// 预览方向
const previewFacing = ref('front')
const FACING_OPTIONS = [
  { key: 'front', label: '前' },
  { key: 'back', label: '后' },
  { key: 'left', label: '左' },
  { key: 'right', label: '右' },
]

// 预览用的临时 pawn（指定方向）
function getPreviewPawnForFacing(facing) {
  if (!props.pawn) return null
  return {
    ...props.pawn,
    sprite: {
      ...props.pawn.sprite,
      outfit: currentOutfit.value,
      facing,
      style: undefined,
    },
  }
}

const getPreviewSpriteSrc = computed(() => {
  const p = getPreviewPawnForFacing(previewFacing.value)
  if (!p) return ''
  return spriteResolver.getPawnSpriteSrc(p)
})

const handleSelectOption = (key, value) => {
  currentOutfit.value[key] = value
  spriteResolver.clearCache()
}

// 本地调色板状态
const selectedPalette = ref(currentPalette.value)

const handleSelectPalette = (palette) => {
  selectedPalette.value = palette
  spriteResolver.clearCache()
}

const handleSave = () => {
  emit('save', { outfit: { ...currentOutfit.value }, palette: selectedPalette.value })
}

const handleClose = () => {
  emit('close')
}

const handleResetToDefault = () => {
  currentOutfit.value = { hair: 'short', eyes: 'normal', top: 'robe', bottom: 'boots', accessory: 'none' }
  spriteResolver.clearCache()
}
</script>

<template>
  <div v-if="visible" class="pawn-outfit-panel" @click.self="handleClose">
    <div class="outfit-panel-content">
      <div class="outfit-panel-header">
        <span class="outfit-title">换装</span>
        <button class="outfit-close-btn" @click="handleClose">✕</button>
      </div>

      <div class="outfit-panel-body">
        <!-- 预览区 -->
        <div class="outfit-preview">
          <div class="facing-toggle">
            <button
              v-for="dir in FACING_OPTIONS"
              :key="dir.key"
              class="facing-btn"
              :class="{ active: previewFacing === dir.key }"
              @click="previewFacing = dir.key"
            >{{ dir.label }}</button>
          </div>
          <div class="preview-frame">
            <img v-if="getPreviewSpriteSrc" :src="getPreviewSpriteSrc" alt="预览" />
          </div>
          <span class="preview-name">{{ pawn?.name || '小人' }} · {{ previewFacing === 'front' ? '前' : previewFacing === 'back' ? '后' : previewFacing === 'left' ? '左' : '右' }}</span>
        </div>

        <!-- 调色板选择 -->
        <div class="outfit-section">
          <div class="section-label">🎨 调色板</div>
          <div class="palette-grid">
            <button
              v-for="pal in PALETTE_LIST"
              :key="pal"
              class="palette-btn"
              :class="{ active: selectedPalette === pal }"
              @click="handleSelectPalette(pal)"
            >
              <span class="palette-swatch" :style="{ background: PALETTE_COLORS[pal] || '#666' }"></span>
              <span class="palette-label">{{ PALETTE_LABELS[pal] }}</span>
            </button>
          </div>
        </div>

        <!-- 部件类别标签 -->
        <div class="outfit-categories">
          <button
            v-for="cat in CATEGORIES"
            :key="cat.key"
            class="category-btn"
            :class="{ active: selectedCategory === cat.key }"
            @click="selectedCategory = cat.key"
          >
            <span class="category-icon">{{ cat.icon }}</span>
            <span class="category-label">{{ cat.label }}</span>
          </button>
        </div>

        <!-- 部件选项列表 -->
        <div class="outfit-section">
          <div class="section-label">{{ CATEGORIES.find(c => c.key === selectedCategory)?.label }}</div>
          <div class="options-grid">
            <button
              v-for="(def, key) in outfitDefs[selectedCategory]"
              :key="key"
              class="option-btn"
              :class="{ active: currentOutfit[selectedCategory] === key }"
              @click="handleSelectOption(selectedCategory, key)"
            >
              <span class="option-label">{{ def.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="outfit-panel-footer">
        <button class="footer-btn reset" @click="handleResetToDefault">重置默认</button>
        <button class="footer-btn save" @click="handleSave">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pawn-outfit-panel {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 2000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.outfit-panel-content {
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  background: #1a1a22;
  color: #eaeaea;
  border-radius: 12px 12px 0 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.outfit-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #2a2a32;
  position: sticky;
  top: 0;
  background: #1a1a22;
  z-index: 1;
}

.outfit-title {
  font-size: 16px;
  font-weight: 600;
}

.outfit-close-btn {
  background: transparent;
  border: none;
  color: #aaa;
  font-size: 18px;
  padding: 4px 8px;
  cursor: pointer;
}

.outfit-panel-body {
  padding: 16px;
  flex: 1;
}

/* 预览 */
.outfit-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 16px;
}

.facing-toggle {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.facing-btn {
  width: 32px;
  height: 28px;
  background: #2a2a32;
  border: none;
  border-radius: 4px;
  color: #aaa;
  font-size: 12px;
  cursor: pointer;
}

.facing-btn.active {
  background: #3a4a3a;
  color: #eaeaea;
}

.preview-frame {
  width: 96px;
  height: 96px;
  background: #2a2a32;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.preview-frame img {
  width: 96px;
  height: 96px;
  object-fit: contain;
  image-rendering: pixelated;
}

.preview-name {
  font-size: 12px;
  color: #aaa;
  margin-top: 4px;
}

/* 区块 */
.outfit-section {
  margin-bottom: 16px;
}

.section-label {
  font-size: 13px;
  color: #aaa;
  margin-bottom: 8px;
}

/* 调色板 */
.palette-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.palette-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: #2a2a32;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #eaeaea;
}

.palette-btn.active {
  border-color: #6a8a6a;
  background: #3a4a3a;
}

.palette-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid #444;
}

.palette-label {
  font-size: 10px;
  color: #aaa;
}

/* 类别切换 */
.outfit-categories {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.category-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: #2a2a32;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #aaa;
}

.category-btn.active {
  background: #3a4a3a;
  color: #eaeaea;
}

.category-icon {
  font-size: 16px;
}

.category-label {
  font-size: 10px;
}

/* 选项列表 */
.options-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.option-btn {
  padding: 12px 8px;
  background: #2a2a32;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #eaeaea;
  text-align: center;
}

.option-btn.active {
  border-color: #6a8a6a;
  background: #3a4a3a;
}

.option-btn:hover {
  background: #3a3a42;
}

/* 底部 */
.outfit-panel-footer {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid #2a2a32;
  position: sticky;
  bottom: 0;
  background: #1a1a22;
}

.footer-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.footer-btn.reset {
  background: #4a4a52;
  color: #eaeaea;
}

.footer-btn.save {
  background: #5a7a5a;
  color: #eaeaea;
}

.footer-btn.save:hover {
  background: #6a8a6a;
}

/* 移动端优化 */
@media (pointer: coarse) {
  .outfit-panel-content {
    max-height: 95vh;
  }

  .palette-btn,
  .category-btn,
  .option-btn {
    padding: 12px 8px;
  }

  .footer-btn {
    padding: 14px;
  }
}
</style>
