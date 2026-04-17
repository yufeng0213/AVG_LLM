<script setup>
import { ref, onMounted } from 'vue'
import { isNative } from '../../../../src/utils/platform.js'
import { useAvatarFrame } from '../composables/useAvatarFrame'
import { useAvatar } from '../composables/useAvatar'
import AvatarCropModal from './AvatarCropModal.vue'

const emit = defineEmits(['close'])
const { frames, activeFrameId, activeFrame, selectFrame, importFrame, deleteFrames, loadFrameDataUrl } = useAvatarFrame()
const { avatars, activeAvatarId, activeAvatarDataUrl, selectAvatar, importAvatar, deleteAvatars } = useAvatar()

const activeTab = ref('frame') // 'frame' | 'avatar'

const frameFileInputRef = ref(null)
const avatarFileInputRef = ref(null)
const frameEditMode = ref(false)
const avatarEditMode = ref(false)
const frameSelectedForDeletion = ref(new Set())
const avatarSelectedForDeletion = ref(new Set())

const isCropModalOpen = ref(false)
const cropModalRef = ref(null)
const pendingAvatarFile = ref(null)

// 原生环境：异步加载图片 dataUrl
// 为每个头像/头像框创建独立的 ref 存储 dataUrl
const avatarDataUrls = ref({})
const frameDataUrls = ref({})

async function loadAvatarUrl(avatar) {
  if (avatar.dataUrl) return avatar.dataUrl
  if (avatarDataUrls.value[avatar.id]) return avatarDataUrls.value[avatar.id]

  if (isNative()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    try {
      const path = `avg_llm_avatars/${avatar.id}.png`
      const result = await Filesystem.readFile({
        path,
        directory: Directory.Documents,
        encoding: Encoding.Base64,
      })
      const url = `data:image/png;base64,${result.data}`
      avatarDataUrls.value[avatar.id] = url
      return url
    } catch (e) {
      console.warn('[AvatarFrameScreen] Failed to load avatar:', e)
      return null
    }
  }
  return null
}

async function loadFrameUrl(frame) {
  if (frame.dataUrl) return frame.dataUrl
  if (frameDataUrls.value[frame.id]) return frameDataUrls.value[frame.id]

  if (isNative()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    try {
      const ext = frame.fileType || 'png'
      const path = `avg_llm_frames/${frame.id}.${ext}`
      const result = await Filesystem.readFile({
        path,
        directory: Directory.Documents,
        encoding: Encoding.Base64,
      })
      const mime = ext === 'gif' ? 'image/gif' : 'image/png'
      const url = `data:${mime};base64,${result.data}`
      frameDataUrls.value[frame.id] = url
      return url
    } catch (e) {
      console.warn('[AvatarFrameScreen] Failed to load frame:', e)
      return null
    }
  }
  return null
}

// 获取头像的显示 URL
function getAvatarDisplayUrl(avatar) {
  return avatar?.dataUrl || avatarDataUrls.value[avatar?.id] || null
}

// 获取头像框的显示 URL
function getFrameDisplayUrl(frame) {
  return frame?.dataUrl || frameDataUrls.value[frame?.id] || null
}

// 组件挂载时：原生环境下预加载所有图片
onMounted(async () => {
  if (!isNative()) return

  // 预加载所有头像的图片（用于列表显示）
  const loadPromises = []
  for (const avatar of avatars.value) {
    if (!avatar.dataUrl) {
      loadPromises.push(loadAvatarUrl(avatar))
    }
  }

  // 预加载所有头像框的图片（用于列表显示）
  for (const frame of frames.value) {
    if (!frame.dataUrl) {
      loadPromises.push(loadFrameUrl(frame))
    }
  }

  // 等待所有图片加载完成
  await Promise.all(loadPromises)

  // 通过 activeAvatarId 找到当前激活头像并设置 dataUrl
  if (activeAvatarId.value) {
    const activeAvatar = avatars.value.find(a => a.id === activeAvatarId.value)
    if (activeAvatar) {
      const url = await loadAvatarUrl(activeAvatar)
      if (url) activeAvatarDataUrl.value = url
    }
  }
})

// ── 头像框操作 ──

const triggerFrameImport = () => {
  if (frameFileInputRef.value) frameFileInputRef.value.click()
}

const handleFrameFileImport = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  try {
    await importFrame(file)
  } catch (err) {
    alert(err.message || '导入失败，请重试')
  }
  event.target.value = ''
}

const handleSelectFrame = (id) => { selectFrame(id) }

const handleToggleFrameDeletion = (id) => {
  const set = frameSelectedForDeletion.value
  if (set.has(id)) set.delete(id); else set.add(id)
  frameSelectedForDeletion.value = new Set(set)
}

const handleDeleteFrames = () => {
  if (frameSelectedForDeletion.value.size === 0) return
  if (!confirm(`确定要删除选中的 ${frameSelectedForDeletion.value.size} 个头像框吗？`)) return
  deleteFrames(Array.from(frameSelectedForDeletion.value))
  frameSelectedForDeletion.value = new Set()
}

const toggleFrameEditMode = () => {
  frameEditMode.value = !frameEditMode.value
  if (!frameEditMode.value) frameSelectedForDeletion.value = new Set()
}

// ── 头像操作 ──

const triggerAvatarImport = () => {
  if (avatarFileInputRef.value) avatarFileInputRef.value.click()
}

const handleAvatarFileImport = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  // 校验
  if (!file.name.toLowerCase().endsWith('.png')) {
    alert('仅支持 PNG 格式')
    event.target.value = ''
    return
  }
  if (file.size > 1.5 * 1024 * 1024) {
    alert('文件大小不能超过 1.5MB')
    event.target.value = ''
    return
  }

  pendingAvatarFile.value = file
  // 打开裁剪弹窗
  isCropModalOpen.value = true
  // 等待 DOM 渲染后加载图片
  requestAnimationFrame(() => {
    if (cropModalRef.value) {
      cropModalRef.value.loadImage(file)
    }
  })

  event.target.value = ''
}

const handleCropConfirm = async (croppedDataUrl) => {
  isCropModalOpen.value = false
  try {
    const base64 = croppedDataUrl.split(',')[1] || ''
    if (!base64) {
      alert('裁剪结果无效')
      return
    }

    if (isNative()) {
      // 原生环境：保存到文件系统
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      const avatarId = `avatar_${Date.now()}`

      // 确保目录存在
      try {
        await Filesystem.mkdir({
          path: 'avg_llm_avatars',
          directory: Directory.Documents,
          recursive: true,
        })
      } catch {
        // 目录可能已存在
      }

      // 保存文件
      await Filesystem.writeFile({
        path: `avg_llm_avatars/${avatarId}.png`,
        data: base64,
        directory: Directory.Documents,
        encoding: Encoding.Base64,
      })

      const avatar = {
        id: avatarId,
        name: pendingAvatarFile.value?.name.replace(/\.png$/i, '') || '头像',
        dataUrl: null,
        createdAt: Date.now(),
      }
      avatars.value.push(avatar)
      activeAvatarId.value = avatarId
      activeAvatarDataUrl.value = croppedDataUrl
      persistAvatarsNative()
    } else {
      // Web / Electron 环境
      const avatar = {
        id: `avatar_${Date.now()}`,
        name: pendingAvatarFile.value?.name.replace(/\.png$/i, '') || '头像',
        dataUrl: croppedDataUrl,
        createdAt: Date.now(),
      }
      avatars.value.push(avatar)
      activeAvatarId.value = avatar.id
      activeAvatarDataUrl.value = avatar.dataUrl
      persistAvatarsNative()
    }
  } catch (err) {
    alert(err.message || '导入失败，请重试')
  }
  pendingAvatarFile.value = null
}

function persistAvatarsNative() {
  try {
    const dataToSave = {
      avatars: avatars.value.map(a => ({
        id: a.id,
        name: a.name,
        createdAt: a.createdAt,
        ...(isNative() ? {} : { dataUrl: a.dataUrl }),
      })),
      activeAvatarDataUrl: isNative() ? null : activeAvatarDataUrl.value,
    }
    localStorage.setItem('dormitory:avatars', JSON.stringify(dataToSave))
  } catch (e) {
    console.error('[Avatar] Failed to persist:', e)
  }
}

const handleCropClose = () => {
  isCropModalOpen.value = false
  pendingAvatarFile.value = null
}

const handleSelectAvatar = (id) => { selectAvatar(id) }

const handleToggleAvatarDeletion = (id) => {
  const set = avatarSelectedForDeletion.value
  if (set.has(id)) set.delete(id); else set.add(id)
  avatarSelectedForDeletion.value = new Set(set)
}

const handleDeleteAvatars = () => {
  if (avatarSelectedForDeletion.value.size === 0) return
  if (!confirm(`确定要删除选中的 ${avatarSelectedForDeletion.value.size} 个头像吗？`)) return
  deleteAvatars(Array.from(avatarSelectedForDeletion.value))
  avatarSelectedForDeletion.value = new Set()
}

const toggleAvatarEditMode = () => {
  avatarEditMode.value = !avatarEditMode.value
  if (!avatarEditMode.value) avatarSelectedForDeletion.value = new Set()
}

// ── 预览 ──

function switchTab(tab) {
  activeTab.value = tab
}

function isFrameActive(frame) {
  return activeTab.value === 'frame' && activeFrameId.value === frame.id
}

function isAvatarActive(avatar) {
  // 优先通过 ID 匹配（原生环境），回退到 dataUrl 比较（Web 环境）
  if (activeAvatarId.value) {
    return activeTab.value === 'avatar' && avatar.id === activeAvatarId.value
  }
  return activeTab.value === 'avatar' && activeAvatarDataUrl.value === avatar.dataUrl
}
</script>

<template>
  <Teleport to="body">
    <div class="avatar-frame-screen">
      <!-- 顶部栏 -->
      <header class="avatar-frame-header">
        <button type="button" class="avatar-frame-back-btn" @click="emit('close')" aria-label="返回">
          <svg class="avatar-frame-back-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 class="avatar-frame-title">头像设置</h2>
        <!-- 编辑/完成按钮（根据当前 tab 切换） -->
        <template v-if="activeTab === 'frame'">
          <button
            v-if="!frameEditMode && frames.length > 0"
            type="button"
            class="avatar-frame-edit-btn"
            @click="toggleFrameEditMode"
          >编辑</button>
          <button
            v-if="frameEditMode"
            type="button"
            class="avatar-frame-done-btn"
            @click="toggleFrameEditMode"
          >完成</button>
        </template>
        <template v-else>
          <button
            v-if="!avatarEditMode && avatars.length > 0"
            type="button"
            class="avatar-frame-edit-btn"
            @click="toggleAvatarEditMode"
          >编辑</button>
          <button
            v-if="avatarEditMode"
            type="button"
            class="avatar-frame-done-btn"
            @click="toggleAvatarEditMode"
          >完成</button>
        </template>
      </header>

      <!-- 主体区域 -->
      <main class="avatar-frame-body">
        <!-- 预览区域 -->
        <section class="avatar-frame-preview-section">
          <div class="avatar-frame-preview-container">
            <div class="avatar-frame-preview-circle">
              <!-- 头像层 -->
              <img
                v-if="activeAvatarDataUrl"
                :src="activeAvatarDataUrl"
                class="avatar-frame-preview-avatar"
                alt="头像预览"
              />
              <span v-else class="avatar-frame-preview-empty">无头像</span>
              <!-- 头像框层 -->
              <img
                v-if="activeFrame?.dataUrl || getFrameDisplayUrl(activeFrame)"
                :src="activeFrame.dataUrl || getFrameDisplayUrl(activeFrame)"
                class="avatar-frame-preview-frame"
                alt="头像框预览"
              />
            </div>
          </div>
          <button
            type="button"
            class="avatar-frame-apply-btn"
            :class="{ active: !!activeFrame || !!activeAvatarDataUrl }"
            @click="emit('close')"
          >
            <template v-if="activeTab === 'frame'">
              {{ activeFrame ? `已选择: ${activeFrame.name}` : '不使用头像框' }}
            </template>
            <template v-else>
              {{ activeAvatarDataUrl ? '已选择头像' : '未选择头像' }}
            </template>
          </button>
        </section>

        <!-- Tab 切换 -->
        <section class="avatar-frame-tabs">
          <button
            type="button"
            class="avatar-frame-tab"
            :class="{ active: activeTab === 'frame' }"
            @click="switchTab('frame')"
          >头像框</button>
          <button
            type="button"
            class="avatar-frame-tab"
            :class="{ active: activeTab === 'avatar' }"
            @click="switchTab('avatar')"
          >头像</button>
        </section>

        <!-- 头像框网格 -->
        <section v-if="activeTab === 'frame'" class="avatar-frame-grid-section">
          <div class="avatar-frame-grid">
            <!-- 导入按钮 -->
            <button
              type="button"
              class="avatar-frame-item avatar-frame-import-item"
              @click="triggerFrameImport"
            >
              <span class="avatar-frame-import-plus">+</span>
              <span class="avatar-frame-item-name">导入</span>
            </button>

            <!-- 头像框列表 -->
            <button
              v-for="frame in frames"
              :key="frame.id"
              type="button"
              class="avatar-frame-item"
              :class="{
                'avatar-frame-item-active': isFrameActive(frame),
                'avatar-frame-item-edit': frameEditMode,
                'avatar-frame-item-selected': frameSelectedForDeletion.has(frame.id),
              }"
              @click="frameEditMode ? handleToggleFrameDeletion(frame.id) : handleSelectFrame(frame.id)"
            >
              <span
                v-if="frameEditMode"
                class="avatar-frame-checkbox"
                :class="{ 'avatar-frame-checkbox-checked': frameSelectedForDeletion.has(frame.id) }"
              >
                <svg v-if="frameSelectedForDeletion.has(frame.id)" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="white" stroke-width="2">
                  <polyline points="2 6 5 9 10 3"/>
                </svg>
              </span>
              <img :src="frame.dataUrl || getFrameDisplayUrl(frame)" class="avatar-frame-item-img" :alt="frame.name" />
              <span class="avatar-frame-item-name">{{ frame.name }}</span>
            </button>
          </div>
        </section>

        <!-- 头像网格 -->
        <section v-if="activeTab === 'avatar'" class="avatar-frame-grid-section">
          <div class="avatar-frame-grid">
            <!-- 导入按钮 -->
            <button
              type="button"
              class="avatar-frame-item avatar-frame-import-item"
              @click="triggerAvatarImport"
            >
              <span class="avatar-frame-import-plus">+</span>
              <span class="avatar-frame-item-name">导入</span>
            </button>

            <!-- 头像列表 -->
            <button
              v-for="avatarItem in avatars"
              :key="avatarItem.id"
              type="button"
              class="avatar-frame-item"
              :class="{
                'avatar-frame-item-active': isAvatarActive(avatarItem),
                'avatar-frame-item-edit': avatarEditMode,
                'avatar-frame-item-selected': avatarSelectedForDeletion.has(avatarItem.id),
              }"
              @click="avatarEditMode ? handleToggleAvatarDeletion(avatarItem.id) : handleSelectAvatar(avatarItem.id)"
            >
              <span
                v-if="avatarEditMode"
                class="avatar-frame-checkbox"
                :class="{ 'avatar-frame-checkbox-checked': avatarSelectedForDeletion.has(avatarItem.id) }"
              >
                <svg v-if="avatarSelectedForDeletion.has(avatarItem.id)" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="white" stroke-width="2">
                  <polyline points="2 6 5 9 10 3"/>
                </svg>
              </span>
              <img :src="avatarItem.dataUrl || getAvatarDisplayUrl(avatarItem)" class="avatar-frame-item-img" :alt="avatarItem.name" />
              <span class="avatar-frame-item-name">{{ avatarItem.name }}</span>
            </button>
          </div>
        </section>
      </main>

      <!-- 底部操作栏（根据 tab 切换） -->
      <footer v-if="frameEditMode && activeTab === 'frame'" class="avatar-frame-footer">
        <button
          type="button"
          class="avatar-frame-delete-btn"
          :disabled="frameSelectedForDeletion.size === 0"
          @click="handleDeleteFrames"
        >
          删除选中 ({{ frameSelectedForDeletion.size }})
        </button>
      </footer>
      <footer v-if="avatarEditMode && activeTab === 'avatar'" class="avatar-frame-footer">
        <button
          type="button"
          class="avatar-frame-delete-btn"
          :disabled="avatarSelectedForDeletion.size === 0"
          @click="handleDeleteAvatars"
        >
          删除选中 ({{ avatarSelectedForDeletion.size }})
        </button>
      </footer>

      <!-- 隐藏的文件输入 -->
      <input
        ref="frameFileInputRef"
        type="file"
        accept=".png,.gif"
        style="display: none"
        @change="handleFrameFileImport"
      />
      <input
        ref="avatarFileInputRef"
        type="file"
        accept=".png"
        style="display: none"
        @change="handleAvatarFileImport"
      />
    </div>

    <!-- 头像裁剪弹窗 -->
    <AvatarCropModal
      ref="cropModalRef"
      :is-open="isCropModalOpen"
      @close="handleCropClose"
      @confirm="handleCropConfirm"
    />
  </Teleport>
</template>

<style scoped>
.avatar-frame-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #0a0a0a;
  z-index: 10001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部栏 */
.avatar-frame-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.avatar-frame-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
}

.avatar-frame-back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.avatar-frame-back-icon { display: block; }

.avatar-frame-title {
  flex: 1;
  text-align: center;
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.avatar-frame-edit-btn,
.avatar-frame-done-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  flex-shrink: 0;
}

.avatar-frame-edit-btn:hover,
.avatar-frame-done-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* 主体区域 */
.avatar-frame-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* 预览区域 */
.avatar-frame-preview-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 16px;
  gap: 16px;
  flex-shrink: 0;
}

.avatar-frame-preview-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.avatar-frame-preview-circle {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.avatar-frame-preview-avatar {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 75px;
  height: 75px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  object-fit: cover;
  display: block;
  z-index: 1;
}

.avatar-frame-preview-frame {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
  z-index: 2;
}

.avatar-frame-preview-empty {
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
}

.avatar-frame-apply-btn {
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
}

.avatar-frame-apply-btn.active {
  border-color: rgba(0, 212, 255, 0.5);
  background: rgba(0, 212, 255, 0.1);
  color: rgba(0, 212, 255, 0.9);
}

.avatar-frame-apply-btn:hover { background: rgba(255, 255, 255, 0.1); }
.avatar-frame-apply-btn.active:hover { background: rgba(0, 212, 255, 0.15); }

/* Tab 切换 */
.avatar-frame-tabs {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 0 16px 12px;
  flex-shrink: 0;
}

.avatar-frame-tab {
  padding: 8px 24px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.5);
}

.avatar-frame-tab.active {
  border-color: rgba(0, 212, 255, 0.5);
  background: rgba(0, 212, 255, 0.1);
  color: rgba(0, 212, 255, 0.9);
}

.avatar-frame-tab:hover:not(.active) {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

/* 头像框网格 */
.avatar-frame-grid-section {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
  min-height: 0;
}

.avatar-frame-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.avatar-frame-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 12px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.avatar-frame-item:hover { background: rgba(255, 255, 255, 0.05); }

.avatar-frame-item-active {
  border-color: rgba(0, 212, 255, 0.6);
  background: rgba(0, 212, 255, 0.1);
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.2);
}

.avatar-frame-item-edit { cursor: pointer; }

.avatar-frame-item-selected {
  border-color: rgba(255, 80, 80, 0.6);
  background: rgba(255, 80, 80, 0.1);
}

/* 导入按钮 */
.avatar-frame-import-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
  border: 2px dashed rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 12px 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 100px;
}

.avatar-frame-import-item:hover {
  border-color: rgba(0, 212, 255, 0.5);
  background: rgba(0, 212, 255, 0.05);
}

.avatar-frame-import-plus {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 28px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.4);
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
}

.avatar-frame-import-item:hover .avatar-frame-import-plus {
  color: rgba(0, 212, 255, 0.8);
  border-color: rgba(0, 212, 255, 0.4);
}

/* 格子图片 */
.avatar-frame-item-img {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  background: rgba(255, 255, 255, 0.03);
}

.avatar-frame-item-name {
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.avatar-frame-import-item .avatar-frame-item-name {
  color: rgba(255, 255, 255, 0.4);
}

/* 复选标记 */
.avatar-frame-checkbox {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 1;
}

.avatar-frame-checkbox-checked {
  background: rgba(255, 80, 80, 0.8);
  border-color: rgba(255, 80, 80, 0.9);
}

/* 底部操作栏 */
.avatar-frame-footer {
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.avatar-frame-delete-btn {
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid rgba(255, 80, 80, 0.4);
  background: rgba(255, 80, 80, 0.1);
  color: rgba(255, 80, 80, 0.8);
}

.avatar-frame-delete-btn:hover:not(:disabled) {
  background: rgba(255, 80, 80, 0.2);
  color: rgba(255, 80, 80, 1);
}

.avatar-frame-delete-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Android 竖屏适配 */
.platform-android.android-portrait .avatar-frame-header {
  padding-top: calc(12px + env(safe-area-inset-top)) !important;
}

.platform-android.android-portrait .avatar-frame-footer {
  padding-bottom: calc(12px + env(safe-area-inset-bottom)) !important;
}
</style>
