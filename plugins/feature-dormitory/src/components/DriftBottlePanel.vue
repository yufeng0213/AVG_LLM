<script setup>
/**
 * 漂流瓶面板组件
 * 显示漂流瓶列表和交互选项
 */

const props = defineProps({
  driftBottlePool: {
    type: Array,
    default: () => []
  },
  isDriftBottlePoolOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'close',
  'pick-bottle',
  'throw-bottle'
])

function handleClose() {
  emit('close')
}

function handlePickBottle(bottle) {
  emit('pick-bottle', bottle)
}

function handleThrowBottle() {
  emit('throw-bottle')
}
</script>

<template>
  <section class="drift-bottle-panel">
    <header class="panel-header">
      <h3>漂流瓶</h3>
      <button class="close-btn" @click="handleClose">✕</button>
    </header>

    <div class="bottle-actions">
      <button class="throw-bottle-btn" @click="handleThrowBottle">
        扔一个瓶子
      </button>
    </div>

    <div class="bottle-list" v-if="driftBottlePool.length > 0">
      <div
        v-for="(bottle, index) in driftBottlePool"
        :key="bottle.id || index"
        class="bottle-item"
        @click="handlePickBottle(bottle)"
      >
        <div class="bottle-icon">🍾</div>
        <div class="bottle-info">
          <span class="bottle-date">{{ bottle.date || '未知日期' }}</span>
          <span class="bottle-preview">{{ bottle.preview || '...' }}</span>
        </div>
      </div>
    </div>

    <div v-else class="empty-bottle-list">
      <p>还没有漂流瓶</p>
      <p>扔一个瓶子开始吧！</p>
    </div>
  </section>
</template>

<style scoped>
.drift-bottle-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e0e0e0;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #333;
  background: rgba(0, 0, 0, 0.06);
}

.bottle-actions {
  margin-bottom: 16px;
}

.throw-bottle-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.2s;
}

.throw-bottle-btn:hover {
  transform: scale(1.02);
}

.bottle-list {
  flex: 1;
  overflow-y: auto;
}

.bottle-item {
  display: flex;
  align-items: center;
  padding: 12px;
  margin-bottom: 8px;
  background: #f8f9fa;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.bottle-item:hover {
  background: #e9ecef;
}

.bottle-icon {
  font-size: 24px;
  margin-right: 12px;
}

.bottle-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bottle-date {
  font-size: 12px;
  color: #666;
}

.bottle-preview {
  font-size: 14px;
  color: #333;
}

.empty-bottle-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
  text-align: center;
}

.empty-bottle-list p {
  margin: 4px 0;
}

/* Android竖屏适配 */
.platform-android.android-portrait .close-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  font-size: 1.2rem !important;
  padding: 0 !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 50% !important;
}
</style>
