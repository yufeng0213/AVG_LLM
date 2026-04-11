<script setup>
/**
 * 日记详情模态框组件
 * 以书本样式显示日记详情
 */

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  diary: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

function handleClose() {
  emit('close')
}

function formatDateForDiary(dateStr) {
  if (!dateStr) return '未知日期'
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN')
  } catch {
    return dateStr
  }
}
</script>

<template>
  <Transition name="diary-modal">
    <section v-if="isOpen && diary" class="diary-modal-overlay" @click.self="handleClose">
      <div class="diary-book">
        <!-- 关闭按钮 -->
        <button type="button" class="diary-close-btn" @click="handleClose" aria-label="关闭日记">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>

        <!-- 书本主体 -->
        <div class="diary-book-body">
          <!-- 书脊 -->
          <div class="diary-spine"></div>

          <!-- 书页容器 -->
          <div class="diary-pages">
            <!-- 日记内容 -->
            <div class="diary-page">
              <div class="diary-page-content">
                <!-- 日记标题和日期 -->
                <div class="diary-header">
                  <time class="diary-date">{{ formatDateForDiary(diary.date) }}</time>
                  <h4 class="diary-title-text">{{ diary.title || '无题' }}</h4>
                </div>

                <!-- 日记正文 -->
                <div class="diary-content">
                  <p class="diary-text">{{ diary.content || diary.text || '暂无内容' }}</p>
                </div>

                <!-- 装饰线 -->
                <div class="diary-divider"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.diary-modal-enter-active,
.diary-modal-leave-active {
  transition: opacity 0.3s ease;
}

.diary-modal-enter-from,
.diary-modal-leave-to {
  opacity: 0;
}

.diary-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.diary-book {
  position: relative;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  background: #f5f0e8;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.diary-close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  cursor: pointer;
  color: #666;
  z-index: 10;
  padding: 4px;
  transition: color 0.2s;
}

.diary-close-btn:hover {
  color: #333;
}

.diary-book-body {
  display: flex;
  padding: 24px;
  min-height: 400px;
}

.diary-spine {
  width: 20px;
  background: linear-gradient(to right, #8b7355, #a0896b);
  border-radius: 4px 0 0 4px;
  margin-right: 16px;
}

.diary-pages {
  flex: 1;
  background: #fffef8;
  border-radius: 4px;
  padding: 20px;
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.1);
}

.diary-page {
  min-height: 300px;
}

.diary-page-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.diary-header {
  border-bottom: 1px solid #d4c5b0;
  padding-bottom: 12px;
}

.diary-date {
  font-size: 12px;
  color: #999;
  display: block;
  margin-bottom: 4px;
}

.diary-title-text {
  font-size: 18px;
  color: #333;
  margin: 0;
  font-weight: 500;
}

.diary-content {
  flex: 1;
}

.diary-text {
  font-size: 14px;
  line-height: 1.8;
  color: #444;
  white-space: pre-wrap;
}

.diary-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, #d4c5b0, transparent);
  margin-top: 16px;
}

/* Android竖屏适配 */
.platform-android.android-portrait .diary-book {
  width: 95% !important;
  max-height: 90vh !important;
}

.platform-android.android-portrait .diary-book-body {
  padding: 16px !important;
  min-height: 280px !important;
}

.platform-android.android-portrait .diary-spine {
  width: 12px !important;
  margin-right: 10px !important;
}

.platform-android.android-portrait .diary-pages {
  padding: 16px !important;
}

.platform-android.android-portrait .diary-page {
  min-height: 240px !important;
}

.platform-android.android-portrait .diary-title-text {
  font-size: 1rem !important;
}

.platform-android.android-portrait .diary-text {
  font-size: 0.85rem !important;
  line-height: 1.6 !important;
}

.platform-android.android-portrait .diary-close-btn {
  top: 8px !important;
  right: 8px !important;
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  padding: 6px !important;
  flex-shrink: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 50% !important;
  background: rgba(0, 0, 0, 0.06) !important;
}

.platform-android.android-portrait .diary-close-btn svg {
  width: 16px !important;
  height: 16px !important;
}
</style>
