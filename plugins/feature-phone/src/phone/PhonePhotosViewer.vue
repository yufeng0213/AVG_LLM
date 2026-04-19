<script setup>
/**
 * PhonePhotosViewer.vue - 照片大图查看器
 * 支持左右滑动切换、设为手机壁纸、设为世界壁纸、删除照片。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'
import { getPhoneWallpaperCache, setPhoneWallpaperCache, getWorldWallpaperCache, setWorldWallpaperCache as setWorldWallpaperCacheData } from './composables/usePhoneData.js'

const props = defineProps({
  photos: { type: Array, default: () => [] },
  initialIndex: { type: Number, default: 0 },
})
const emit = defineEmits(['close'])

const currentIndex = ref(props.initialIndex)
const phoneWallpaperId = ref(null)
const worldWallpaper = ref(null)

// Swipe 状态
const touchStartX = ref(0)
const touchStartY = ref(0)
const touchDeltaX = ref(0)
const isSwiping = ref(false)

const currentPhoto = computed(() => props.photos[currentIndex.value] || null)
const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < props.photos.length - 1)

onMounted(async () => {
  const [wpId, wpWorld] = await Promise.all([
    kvStorage.get('phone_wallpaper_photo_id'),
    kvStorage.get('worldhub_wallpaper'),
  ])
  phoneWallpaperId.value = wpId
  worldWallpaper.value = wpWorld
})

function goPrev() {
  if (hasPrev.value) currentIndex.value--
}
function goNext() {
  if (hasNext.value) currentIndex.value++
}

// 触摸滑动
function onTouchStart(e) {
  touchStartX.value = e.touches[0].clientX
  touchStartY.value = e.touches[0].clientY
  touchDeltaX.value = 0
  isSwiping.value = true
}

function onTouchMove(e) {
  if (!isSwiping.value) return
  touchDeltaX.value = e.touches[0].clientX - touchStartX.value
}

function onTouchEnd() {
  if (!isSwiping.value) return
  isSwiping.value = false
  const threshold = 50
  if (touchDeltaX.value > threshold) {
    goPrev()
  } else if (touchDeltaX.value < -threshold) {
    goNext()
  }
  touchDeltaX.value = 0
}

// 键盘支持
function onKeyDown(e) {
  if (e.key === 'ArrowLeft') goPrev()
  else if (e.key === 'ArrowRight') goNext()
  else if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

// 设为手机壁纸
async function setPhoneWallpaper() {
  if (!currentPhoto.value) return
  await kvStorage.set('phone_wallpaper_photo_id', currentPhoto.value.id)
  phoneWallpaperId.value = currentPhoto.value.id
  setPhoneWallpaperCache({ dataUrl: currentPhoto.value.dataUrl, isVideo: !!currentPhoto.value.isVideo })
}

// 取消手机壁纸
async function unsetPhoneWallpaper() {
  await kvStorage.set('phone_wallpaper_photo_id', null)
  phoneWallpaperId.value = null
  setPhoneWallpaperCache(null)
}

// 设为世界壁纸
async function setWorldWallpaper() {
  if (!currentPhoto.value) return
  const data = {
    photoId: currentPhoto.value.id,
    dataUrl: currentPhoto.value.dataUrl,
    name: currentPhoto.value.name,
    isVideo: !!currentPhoto.value.isVideo,
  }
  await kvStorage.set('worldhub_wallpaper', data)
  worldWallpaper.value = data
  setWorldWallpaperCacheData(data)
}

// 恢复世界壁纸默认
async function restoreWorldWallpaperDefault() {
  await kvStorage.set('worldhub_wallpaper', null)
  worldWallpaper.value = null
  setWorldWallpaperCacheData(null)
}

const isPhoneWallpaper = computed(() => phoneWallpaperId.value === currentPhoto.value?.id)
const isWorldWallpaper = computed(() => worldWallpaper.value?.photoId === currentPhoto.value?.id)
</script>

<template>
  <Teleport to="body">
    <div
      class="photos-viewer-overlay"
      @click.self="emit('close')"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div class="photos-viewer">
        <!-- 关闭按钮 -->
        <button type="button" class="viewer-close" @click="emit('close')">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <!-- 左右切换按钮 -->
        <button
          v-if="hasPrev"
          type="button"
          class="viewer-nav viewer-prev"
          @click="goPrev"
        >
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <button
          v-if="hasNext"
          type="button"
          class="viewer-nav viewer-next"
          @click="goNext"
        >
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        <!-- 大图 -->
        <div class="viewer-image-wrap">
          <img
            v-if="currentPhoto && !currentPhoto.isVideo"
            :src="currentPhoto.dataUrl"
            :alt="currentPhoto.name"
            class="viewer-image"
          />
          <video
            v-else-if="currentPhoto && currentPhoto.isVideo"
            :src="currentPhoto.dataUrl"
            class="viewer-image viewer-video"
            controls
            autoplay
            muted
            loop
            playsinline
          />
        </div>

        <!-- 文件名 + 页码 -->
        <div class="viewer-info">
          <span class="viewer-filename">{{ currentPhoto?.name }}</span>
          <span class="viewer-counter">{{ currentIndex + 1 }} / {{ photos.length }}</span>
        </div>

        <!-- 操作按钮 -->
        <div v-if="currentPhoto" class="viewer-actions">
          <button
            type="button"
            class="viewer-action-btn"
            :class="{ active: isPhoneWallpaper }"
            @click="isPhoneWallpaper ? unsetPhoneWallpaper() : setPhoneWallpaper()"
          >
            {{ isPhoneWallpaper ? '取消手机壁纸' : '设为手机壁纸' }}
          </button>
          <button
            type="button"
            class="viewer-action-btn"
            :class="{ active: isWorldWallpaper }"
            @click="isWorldWallpaper ? restoreWorldWallpaperDefault() : setWorldWallpaper()"
          >
            {{ isWorldWallpaper ? '恢复世界默认' : '设为世界壁纸' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
