<script setup>
/**
 * PhonePhotosApp.vue - 照片应用
 * 4列缩略图网格 + 导入按钮 + 大图查看器。
 */
import { onMounted, ref } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'
import PhonePhotosViewer from './PhonePhotosViewer.vue'

const emit = defineEmits(['back'])

const STORAGE_KEY = 'phone_photos'

const photos = ref([])
const viewerIndex = ref(-1)
const importing = ref(false)
const fileInput = ref(null)

onMounted(async () => {
  const saved = await kvStorage.get(STORAGE_KEY)
  photos.value = saved || []
})

async function handleFileChange(e) {
  const files = Array.from(e.target.files)
  if (files.length === 0) return
  importing.value = true

  const imageFiles = files.filter(f => /^image\/(png|jpeg|gif|webp|bmp)$/.test(f.type))
  if (imageFiles.length === 0) {
    alert('请选择 PNG、JPG、GIF、WebP 或 BMP 图片')
    importing.value = false
    e.target.value = ''
    return
  }

  const maxSize = 15 * 1024 * 1024 // 15MB
  for (const file of imageFiles) {
    if (file.size > maxSize) {
      alert(`文件 ${file.name} 超过 15MB，已跳过`)
      continue
    }
  }

  const validFiles = imageFiles.filter(f => f.size <= maxSize)
  const promises = validFiles.map(file => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        resolve({
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl: String(reader.result),
          mimeType: file.type,
          size: file.size,
          createdAt: new Date().toISOString(),
        })
      }
      reader.readAsDataURL(file)
    })
  })

  const newPhotos = await Promise.all(promises)
  photos.value.push(...newPhotos)
  await kvStorage.set(STORAGE_KEY, photos.value)
  importing.value = false
  e.target.value = ''
}

function openViewer(index) {
  viewerIndex.value = index
}

function closeViewer() {
  viewerIndex.value = -1
}

async function deletePhoto(photo) {
  if (!confirm(`确定删除「${photo.name}」？`)) return
  photos.value = photos.value.filter(p => p.id !== photo.id)
  await kvStorage.set(STORAGE_KEY, photos.value)

  // 如果删除的是手机壁纸，清空壁纸引用
  const wpId = await kvStorage.get('phone_wallpaper_photo_id')
  if (wpId === photo.id) {
    await kvStorage.set('phone_wallpaper_photo_id', null)
  }
}

function triggerImport() {
  if (fileInput.value) fileInput.value.click()
}
</script>

<template>
  <div class="photos-app">
    <div class="phone-app-header">
      <button type="button" class="phone-app-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <h2 class="phone-app-title">照片</h2>
      <div class="phone-app-header-spacer" />
    </div>

    <!-- 缩略图网格 -->
    <div class="photos-grid">
      <!-- 导入按钮格子 -->
      <div class="photo-import-tile" @click="triggerImport">
        <span class="import-plus">＋</span>
        <span class="import-label">导入</span>
        <input
          ref="fileInput"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
          multiple
          style="display:none"
          @change="handleFileChange"
        />
      </div>

      <!-- 缩略图 -->
      <div
        v-for="(photo, idx) in photos"
        :key="photo.id"
        class="photo-thumb"
        @click="openViewer(idx)"
      >
        <img :src="photo.dataUrl" :alt="photo.name" />
        <span class="photo-thumb-badge" @click.stop="deletePhoto(photo)">×</span>
      </div>
    </div>

    <div v-if="photos.length === 0" class="phone-loading" style="padding-top:40px">
      点击右上角 ＋ 导入照片
    </div>

    <!-- 大图查看器 -->
    <PhonePhotosViewer
      v-if="viewerIndex >= 0"
      :photos="photos"
      :initial-index="viewerIndex"
      @close="closeViewer"
    />
  </div>
</template>
