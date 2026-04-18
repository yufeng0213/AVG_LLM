<script setup>
import { ref } from 'vue'
import { pickAudioFiles, createPlaylistFromFiles } from '../composables/useAudioPlayer.js'
import { parsePlaylist } from '../utils/playlistParser.js'

const emit = defineEmits(['import-tracks'])

const activeTab = ref('folder')
const urlInput = ref('')
const urlError = ref('')
const isLoading = ref(false)

const AUDIO_RE = /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i

const handleFolderImport = async () => {
  isLoading.value = true
  try {
    if (window.avgLLM?.bgm?.selectFolder) {
      const r = await window.avgLLM.bgm.selectFolder()
      if (r?.success && r.files?.length) {
        const tracks = r.files
          .filter(f => AUDIO_RE.test(f.fullName || f.name || ''))
          .map((f, i) => ({ id: `el-${Date.now()}-${i}`, name: f.name, path: f.path, source: 'electron-file', folderPath: r.folderPath }))
        if (tracks.length) emit('import-tracks', tracks)
      }
    } else {
      const { files, canceled } = await pickAudioFiles({ directory: true })
      if (!canceled && files.length) {
        const tracks = createPlaylistFromFiles(files)
        if (tracks.length) emit('import-tracks', tracks)
      }
    }
  } catch (e) { console.error('[import] folder failed', e) }
  finally { isLoading.value = false }
}

const handleUrlImport = () => {
  const url = urlInput.value.trim()
  if (!url) { urlError.value = '请输入音频 URL'; return }
  if (!/^https?:\/\//i.test(url)) { urlError.value = 'URL 需以 http:// 或 https:// 开头'; return }
  urlError.value = ''
  const name = decodeURIComponent(url.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '')) || '网络音频'
  emit('import-tracks', [{ id: `url-${Date.now()}`, name, path: url, source: 'url' }])
  urlInput.value = ''
}

const handlePlaylistFileImport = async (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const ext = file.name.split('.').pop().toLowerCase()
    const tracks = parsePlaylist(text, ext)
    if (tracks.length) emit('import-tracks', tracks)
  } catch (err) { console.error('[import] playlist parse failed', err) }
  e.target.value = ''
}
</script>

<template>
  <div class="import">
    <h2 class="imp-title">导入音乐</h2>

    <div class="imp-tabs">
      <button class="imp-tab" :class="{ on: activeTab === 'folder' }" @click="activeTab = 'folder'">文件夹</button>
      <button class="imp-tab" :class="{ on: activeTab === 'url' }" @click="activeTab = 'url'">URL</button>
      <button class="imp-tab" :class="{ on: activeTab === 'playlist' }" @click="activeTab = 'playlist'">歌单</button>
    </div>

    <div class="imp-body">
      <div v-if="activeTab === 'folder'" class="imp-folder">
        <div class="imp-icon">📁</div>
        <p class="imp-desc">从本地文件夹导入音频</p>
        <button class="imp-btn" :disabled="isLoading" @click="handleFolderImport">
          {{ isLoading ? '导入中...' : '选择文件夹' }}
        </button>
      </div>

      <div v-if="activeTab === 'url'" class="imp-url">
        <p class="imp-desc">输入音频 URL 直接播放</p>
        <div class="url-row">
          <input v-model="urlInput" type="text" class="url-in" placeholder="https://example.com/song.mp3" @keydown.enter="handleUrlImport" />
          <button class="imp-btn" @click="handleUrlImport">添加</button>
        </div>
        <p v-if="urlError" class="url-err">{{ urlError }}</p>
      </div>

      <div v-if="activeTab === 'playlist'" class="imp-playlist">
        <div class="imp-icon">📋</div>
        <p class="imp-desc">导入 .m3u / .pls / .json 歌单</p>
        <label class="imp-btn imp-file">
          选择文件
          <input type="file" accept=".m3u,.m3u8,.pls,.json" hidden @change="handlePlaylistFileImport" />
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 20px;
}

.imp-title {
  font-size: 18px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  margin: 0 0 20px;
  -webkit-font-smoothing: antialiased;
}

.imp-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  padding: 3px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.imp-tab {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.imp-tab:hover { color: rgba(255, 255, 255, 0.6); }

.imp-tab.on {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.imp-body {
  width: 100%;
  max-width: 340px;
  text-align: center;
}

.imp-desc {
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
  margin: 12px 0;
}

.imp-icon {
  font-size: 36px;
  margin-bottom: 4px;
  opacity: 0.6;
}

.imp-btn {
  padding: 9px 28px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-block;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.imp-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.9);
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.imp-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.imp-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.imp-file { cursor: pointer; }

.url-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.url-in {
  flex: 1;
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  -webkit-font-smoothing: antialiased;
}

.url-in::placeholder {
  color: rgba(255, 255, 255, 0.2);
}

.url-in:focus {
  border-color: rgba(120, 190, 255, 0.35);
  background: rgba(255, 255, 255, 0.06);
}

.url-err {
  color: rgba(255, 95, 87, 0.8);
  font-size: 11px;
  margin-top: 8px;
}
</style>
