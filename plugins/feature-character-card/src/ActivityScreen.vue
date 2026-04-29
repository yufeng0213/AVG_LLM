<script setup>
import { ref, computed, onMounted } from 'vue'
import JSZip from 'jszip'
import { kvStorage } from '../../../src/storage/index.js'
import { saveCoverFile, loadCoverFile, deleteCoverFile } from '../../../src/features/activityCover.js'
import { useActivityEntry } from '../../../src/stores/activityEntry.store.js'
import ActivityRenderer from './components/ActivityRenderer.vue'

const emit = defineEmits(['back', 'open-activity-story'])

const activityEntry = useActivityEntry()

// ─── 数据 ────────────────────────────────────────────────
const activities = ref([])     // 内置活动 + 导入活动
const enabledActivityId = ref(null) // 当前启用的活动 ID
const loading = ref(true)
const importing = ref(false)
const error = ref(null)
const selectedActivity = ref(null)

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

// ─── 常量 ────────────────────────────────────────────────
const ACTIVITIES_BASE = '/data/activities'
const ENABLED_KEY = 'avg_llm_enabled_activity_v1'
const IMPORTED_KEY = 'avg_llm_imported_activities_v1'
const FALLBACK_ACTIVITIES = [
  { id: 'summer_festival', name: '夏日祭限定活动', icon: '🎆' },
]

// ─── 世界书绑定 ─────────────────────────────────────────
import { getActiveWorldBookId } from '../../../src/worldbook/worldBookStore.js'

// ─── 计算 ────────────────────────────────────────────────
const enabledActivity = computed(() =>
  activities.value.find(a => a.id === enabledActivityId.value) || null
)

// ─── 存储操作 ────────────────────────────────────────────
async function loadEnabledId() {
  const id = await kvStorage.get(ENABLED_KEY)
  if (id && typeof id === 'string') enabledActivityId.value = id
}

async function saveEnabledId() {
  await kvStorage.set(ENABLED_KEY, enabledActivityId.value)
}

async function loadImported() {
  const list = await kvStorage.get(IMPORTED_KEY)
  return Array.isArray(list) ? list : []
}

async function saveImported(list) {
  await kvStorage.set(IMPORTED_KEY, list)
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 从 URL 下载图片并保存到本地文件
 * @param {string} url - 图片 URL
 * @param {string} filename - 保存文件名
 * @param {string} activityId - 活动 ID
 */
async function downloadAssetFromUrl(url, filename, activityId) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const base64 = await readFileAsBase64(new File([blob], filename, { type: blob.type }))
    const saved = await saveCoverFile(`${activityId}_${filename}`, base64)
    return saved
  } catch (e) {
    console.warn(`[ActivityScreen] 下载资源失败 ${url}:`, e)
    return null
  }
}

// ─── 扫描内置活动 ──────────────────────────────────────
function isHtmlResponse(res) {
  const ct = res.headers.get('content-type') || ''
  return ct.includes('text/html')
}

async function scanActivities() {
  try {
    const res = await fetch(ACTIVITIES_BASE + '/')
    if (!res.ok) return FALLBACK_ACTIVITIES
    if (isHtmlResponse(res)) {
      // Vite 目录扫描不可用，尝试逐个探测
      console.log('[ActivityScreen] 目录扫描不可用，尝试逐个探测')
      const known = [...FALLBACK_ACTIVITIES]
      for (const item of known) {
        try {
          const encodedId = encodeURIComponent(item.id)
          const metaUrl = `${ACTIVITIES_BASE}/${encodedId}/activity.json`
          console.log('[ActivityScreen] 探测:', metaUrl)
          const metaRes = await fetch(metaUrl)
          console.log('[ActivityScreen] 响应状态:', metaRes.status, metaRes.ok)
          if (metaRes.ok && !isHtmlResponse(metaRes)) {
            const meta = await metaRes.json()
            console.log('[ActivityScreen] 获取到 meta:', meta.name)
            item.name = meta.name || item.name
            item.icon = meta.bannerIcon || item.icon
          } else {
            console.warn('[ActivityScreen] 探测失败:', metaRes.status)
          }
        } catch (e) {
          console.warn('[ActivityScreen] 探测异常:', item.id, e)
        }
      }
      return known
    }
    const text = await res.text()
    const matches = text.match(/href="([^"]+)"/g) || []
    const ids = matches
      .map(m => m.replace('href="', '').replace('"', '').replace(/\/$/, ''))
      .filter(id => id && id !== '..' && id !== '.' && !id.startsWith('@'))

    if (ids.length === 0) return FALLBACK_ACTIVITIES
    return ids.map(id => ({ id, name: null, icon: null }))
  } catch {
    return FALLBACK_ACTIVITIES
  }
}

async function loadActivityMeta(id) {
  try {
    const encodedId = encodeURIComponent(id)
    const res = await fetch(`${ACTIVITIES_BASE}/${encodedId}/activity.json`)
    const contentType = res.headers.get('content-type') || ''
    console.log('[ActivityScreen] loadActivityMeta:', id, 'status:', res.status, 'contentType:', contentType)
    if (!res.ok) return null
    if (contentType.includes('text/html')) return null
    const meta = await res.json()
    console.log('[ActivityScreen] meta loaded:', id, 'has storyConfig:', !!meta?.storyConfig, 'has portraits:', !!meta?.storyConfig?.portraits)
    return meta
  } catch (e) {
    console.warn('[ActivityScreen] loadActivityMeta error:', id, e)
    return null
  }
}

// ─── 加载全部 ────────────────────────────────────────────
async function load() {
  loading.value = true
  error.value = null
  activities.value = []

  await loadEnabledId()

  // 只加载用户导入的活动（不自动扫描目录）
  const imported = await loadImported()
  console.log('[ActivityScreen] imported from kvStorage:', imported.length, 'items')

  for (const imp of imported) {
    // Electron 环境：从磁盘加载完整配置
    if (isElectron) {
      // 只存储 ID，从文件系统读取完整 meta
      const meta = await loadActivityMeta(imp.id)
      if (!meta) {
        console.warn('[ActivityScreen] 无法加载活动配置:', imp.id)
        continue
      }
      console.log('[ActivityScreen] loaded from disk:', imp.id, 'has storyConfig:', !!meta?.storyConfig)
      const coverUrl = await loadCoverFile(imp.id)

      // 解析卡片背景图片路径
      const cardBackgroundUrl = resolveImagePath(meta.cardBackground, imp.id)

      activities.value.push({
        id: imp.id,
        name: meta.name || imp.id,
        description: meta.description || '',
        bannerColor: meta.bannerColor || '#4a9eff',
        bannerIcon: meta.bannerIcon || '📦',
        coverImage: coverUrl,
        coverGradient: meta.coverGradient || null,
        cardBackground: cardBackgroundUrl,
        startTime: meta.startTime,
        endTime: meta.endTime,
        meta,
        imported: true,
      })
    }
    // Web/Android 环境：使用 kvStorage 中的数据
    else {
      const meta = { ...(imp.json || {}) }
      const coverUrl = imp.json?.coverImage || await loadCoverFile(imp.id)

      // 从 files 中构建图片 URL（Android/Web 环境）
      const cardBackgroundUrl = resolveImagePathFromFiles(meta.cardBackground, imp.files)

      activities.value.push({
        id: imp.id,
        name: meta.name || imp.id,
        description: meta.description || '',
        bannerColor: meta.bannerColor || '#4a9eff',
        bannerIcon: meta.bannerIcon || '📦',
        coverImage: coverUrl,
        coverGradient: meta.coverGradient || null,
        cardBackground: cardBackgroundUrl,
        startTime: meta.startTime,
        endTime: meta.endTime,
        meta,
        imported: true,
        files: imp.files || null,
      })
    }
  }

  // 如果当前启用的活动不在列表中，清除
  if (enabledActivityId.value && !activities.value.some(a => a.id === enabledActivityId.value)) {
    enabledActivityId.value = null
    await saveEnabledId()
  }

  loading.value = false
}

// 解析图片路径（Electron 环境）
function resolveImagePath(relativePath, activityId) {
  if (!relativePath) return null
  if (relativePath.startsWith('./')) {
    return `/data/activities/${activityId}/${relativePath.substring(2)}`
  }
  if (relativePath.startsWith('/') || relativePath.startsWith('http')) {
    return relativePath
  }
  return `/data/activities/${activityId}/${relativePath}`
}

// 从 files 数组中解析图片路径（Android/Web 环境）
function resolveImagePathFromFiles(relativePath, files) {
  if (!relativePath || !files || !files.length) return null

  // 标准化路径：去掉 ./ 前缀
  let normalizedPath = relativePath
  if (normalizedPath.startsWith('./')) {
    normalizedPath = normalizedPath.substring(2)
  }

  // 在 files 中查找
  const file = files.find(f => {
    // 尝试多种匹配方式
    const filePath = f.path || ''
    return filePath === normalizedPath ||
           filePath.endsWith('/' + normalizedPath) ||
           filePath.endsWith(normalizedPath) ||
           normalizedPath.endsWith(filePath)
  })

  if (!file) return null

  // 构建 data URI
  const ext = file.path.split('.').pop().toLowerCase()
  const mimeType = ext === 'png' ? 'image/png'
    : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'webp' ? 'image/webp'
    : ext === 'gif' ? 'image/gif'
    : 'application/octet-stream'

  if (file.encoding === 'base64') {
    return `data:${mimeType};base64,${file.content}`
  } else {
    // UTF-8 编码的文本文件，不适用于图片
    return null
  }
}


// ─── 启用/禁用活动 ─────────────────────────────────────
async function enableActivity(activity) {
  if (enabledActivityId.value === activity.id) {
    // 取消启用
    enabledActivityId.value = null
  } else {
    enabledActivityId.value = activity.id
  }
  await saveEnabledId()
}

// ─── 导入活动 ──────────────────────────────────────────
function triggerImport() {
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

  if (isElectron && window.avgLLM?.activity?.selectAndImport) {
    // Electron 新方式：直接选择文件夹拷贝（不传 base64）
    triggerElectronImport()
  } else if (isElectron) {
    // Electron 旧方式：文件夹选择（已废弃，传 base64）
    triggerFolderImport()
  } else {
    // Android / Web：zip 文件选择
    triggerZipImport()
  }
}

// Electron 新导入方式
async function triggerElectronImport() {
  importing.value = true
  try {
    const result = await window.avgLLM.activity.selectAndImport()
    if (!result.success) {
      if (result.error !== '未选择文件夹') {
        error.value = `导入失败：${result.error}`
      }
      importing.value = false
      return
    }

    // 检查世界书绑定
    const activeWorldBookId = await getActiveWorldBookId()
    const newActivityWorldBookId = result.json?.worldBookId || activeWorldBookId
    if (enabledActivityId.value) {
      const enabledActivity = activities.value.find(a => a.id === enabledActivityId.value)
      if (enabledActivity) {
        const existingWorldBookId = enabledActivity.meta?.worldBookId || activeWorldBookId
        if (existingWorldBookId !== newActivityWorldBookId) {
          // 删除已拷贝的文件夹
          await window.avgLLM.activity.remove(result.activityId)
          error.value = `已启用的活动「${enabledActivity.name}」绑定到世界书「${existingWorldBookId}」，与当前世界书不一致。`
          importing.value = false
          return
        }
      }
    }

    // 只存储 ID 到 kvStorage（作为导入记录），不存完整 JSON
    const imported = await loadImported()
    const idx = imported.findIndex(i => i.id === result.activityId)
    if (idx >= 0) {
      imported[idx] = { id: result.activityId }
    } else {
      imported.push({ id: result.activityId })
    }
    await saveImported(imported)

    // 重新加载活动列表
    await load()
  } catch (err) {
    console.error('[ActivityScreen] Electron 导入失败:', err)
    error.value = `导入失败：${err.message}`
  } finally {
    importing.value = false
  }
}

// Electron 文件夹导入
function triggerFolderImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.webkitdirectory = true
  input.multiple = true
  input.accept = '.json,.js,.html,.png,.jpg,.jpeg,.webp,.gif'

  input.onchange = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    await processFolderFiles(files)
  }

  input.click()
}

// Android / Web zip 文件导入
function triggerZipImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip'
  input.multiple = false

  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    importing.value = true
    try {
      const zip = await JSZip.loadAsync(file)

      // 找 activity.json 和 activity/index.html（可能带顶层文件夹名）
      const allPaths = Object.keys(zip.files).filter(p => !zip.files[p].dir)
      const jsonPath = allPaths.find(p => p.endsWith('activity.json'))
      const htmlPath = allPaths.find(p => /activity[/\\]index\.html$/.test(p))

      if (!jsonPath) throw new Error('zip 中缺少 activity.json')
      if (!htmlPath) throw new Error('zip 中缺少 activity/index.html')

      // 读取 JSON
      const jsonText = await zip.file(jsonPath).async('string')
      const json = JSON.parse(jsonText)
      if (!json.id) throw new Error('activity.json 缺少 id 字段')

      // 检查世界书绑定
      const activeWorldBookId = await getActiveWorldBookId()
      const newActivityWorldBookId = json.worldBookId || activeWorldBookId
      if (enabledActivityId.value) {
        const enabledActivity = activities.value.find(a => a.id === enabledActivityId.value)
        if (enabledActivity) {
          const existingWorldBookId = enabledActivity.meta?.worldBookId || activeWorldBookId
          if (existingWorldBookId !== newActivityWorldBookId) {
            throw new Error(`已启用的活动「${enabledActivity.name}」绑定到世界书「${existingWorldBookId}」，与当前世界书不一致。`)
          }
        }
      }

      const savedWorldBookId = json.worldBookId || activeWorldBookId

      // 归一化路径：去掉顶层文件夹名
      const topLevelDirs = new Set()
      for (const p of allPaths) {
        const parts = p.split('/').filter(Boolean)
        if (parts.length > 0) topLevelDirs.add(parts[0])
      }
      const stripPrefix = topLevelDirs.size === 1 ? Array.from(topLevelDirs)[0] + '/' : ''

      // 构建文件列表
      const fileList = []
      for (const p of allPaths) {
        const relPath = p.startsWith(stripPrefix) ? p.slice(stripPrefix.length) : p
        const ext = p.split('.').pop().toLowerCase()
        const isBinary = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
        const content = isBinary
          ? await zip.file(p).async('base64')
          : await zip.file(p).async('string')
        fileList.push({ relPath, content, encoding: isBinary ? 'base64' : 'utf-8' })
      }

      console.log('[ActivityScreen] zip 导入 - fileList 长度:', fileList.length)
      console.log('[ActivityScreen] zip 导入 - fileList 前3个:', fileList.slice(0, 3))

      // Electron：通过 IPC 拷贝文件到 data/activities/
      if (window.avgLLM?.activity?.import && window.electronAPI?.isElectron) {
        console.log('[ActivityScreen] zip 导入 - 使用 Electron activity.import')
        const result = await window.avgLLM.activity.import(json.id, fileList)
        if (!result.success) throw new Error(result.error || '拷贝失败')
      }
      // Capacitor/Android：写入到文件系统
      else if (window.Capacitor?.isNativePlatform?.() || window.__avgLLM?.activity?.import) {
        console.log('[ActivityScreen] zip 导入 - 使用 Capacitor activity.import')
        const importFn = window.__avgLLM?.activity?.import
        if (importFn) {
          console.log('[ActivityScreen] 调用 importFn, activityId:', json.id, 'files:', fileList.length)
          const result = await importFn(json.id, fileList)
          console.log('[ActivityScreen] importFn 返回:', result)
          if (!result?.success) throw new Error(result?.error || '拷贝失败')
        } else {
          throw new Error('Capacitor activity.import 未初始化')
        }
      }
      // Web：回退到 kvStorage
      else {
        console.log('[ActivityScreen] zip 导入 - 使用 kvStorage')
        const imported = await loadImported()
        const idx = imported.findIndex(i => i.id === json.id)
        if (idx >= 0) {
          imported[idx] = { id: json.id, json: { ...json, coverImage: null, worldBookId: savedWorldBookId }, files: fileList }
        } else {
          imported.push({ id: json.id, json: { ...json, coverImage: null, worldBookId: savedWorldBookId }, files: fileList })
        }
        await saveImported(imported)
      }

      // 重新加载
      await load()
    } catch (err) {
      console.error('[ActivityScreen] 导入失败:', err)
      error.value = `导入失败：${err.message}`
    } finally {
      importing.value = false
    }
  }

  input.click()
}

// 处理文件夹选择的文件列表
async function processFolderFiles(files) {
  importing.value = true
  try {
    // 找 activity.json 和 activity/index.html
    const jsonFile = files.find(f => f.name === 'activity.json')
    const indexHtmlFile = files.find(f => f.name === 'index.html' && f.webkitRelativePath.includes('/activity/'))

    if (!jsonFile) throw new Error('文件夹中缺少 activity.json')
    if (!indexHtmlFile) throw new Error('activity/ 目录下缺少 index.html')

    // 读取 JSON
    const jsonText = await jsonFile.text()
    const json = JSON.parse(jsonText)
    if (!json.id) throw new Error('activity.json 缺少 id 字段')

    // 检查世界书绑定
    const activeWorldBookId = await getActiveWorldBookId()
    const newActivityWorldBookId = json.worldBookId || activeWorldBookId
    if (enabledActivityId.value) {
      const enabledActivity = activities.value.find(a => a.id === enabledActivityId.value)
      if (enabledActivity) {
        const existingWorldBookId = enabledActivity.meta?.worldBookId || activeWorldBookId
        if (existingWorldBookId !== newActivityWorldBookId) {
          throw new Error(`已启用的活动「${enabledActivity.name}」绑定到世界书「${existingWorldBookId}」，与当前世界书不一致。`)
        }
      }
    }

    const savedWorldBookId = json.worldBookId || activeWorldBookId

    // Electron：通过 IPC 拷贝文件到 data/activities/
    if (window.avgLLM?.activity?.import) {
      const activityFiles = files.filter(f => {
        const relPath = f.webkitRelativePath.split('/').slice(1).join('/')
        return !relPath.includes('..')
      })
      const fileList = []
      for (const f of activityFiles) {
        const relPath = f.webkitRelativePath.split('/').slice(1).join('/')
        const ext = f.name.split('.').pop().toLowerCase()
        const isBinary = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
        if (isBinary) {
          const buf = await f.arrayBuffer()
          const bytes = new Uint8Array(buf)
          let binary = ''
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          fileList.push({ relPath, content: btoa(binary), encoding: 'base64' })
        } else {
          fileList.push({ relPath, content: await f.text(), encoding: 'utf-8' })
        }
      }

      const result = await window.avgLLM.activity.import(json.id, fileList)
      if (!result.success) throw new Error(result.error || '拷贝失败')
    }
    // Capacitor/Android：使用 Capacitor Filesystem API
    else if (window.Capacitor?.isNativePlatform?.() || window.__avgLLM?.activity?.import) {
      // Capacitor 环境下，activity.import 在 globalApi.js 里定义
      const importFn = window.__avgLLM?.activity?.import || window.avgLLM?.activity?.import
      if (importFn) {
        const result = await importFn(json.id, fileList)
        if (!result.success) throw new Error(result.error || '拷贝失败')
      } else {
        // 如果 activity.import 还没初始化，等待一下再尝试
        console.warn('[ActivityScreen] activity.import 未定义，等待初始化...')
        await new Promise(resolve => setTimeout(resolve, 500))
        if (window.__avgLLM?.activity?.import) {
          const result = await window.__avgLLM.activity.import(json.id, fileList)
          if (!result.success) throw new Error(result.error || '拷贝失败')
        } else {
          throw new Error('Capacitor activity.import 未初始化')
        }
      }
    }
    // Web：回退到 kvStorage
    else {
      const imported = await loadImported()
      const idx = imported.findIndex(i => i.id === json.id)
      if (idx >= 0) {
        imported[idx] = { id: json.id, json: { ...json, coverImage: null, worldBookId: savedWorldBookId }, files: fileList }
      } else {
        imported.push({ id: json.id, json: { ...json, coverImage: null, worldBookId: savedWorldBookId }, files: fileList })
      }
      await saveImported(imported)
    }

    // 重新加载
    await load()
  } catch (err) {
    console.error('[ActivityScreen] 导入失败:', err)
    error.value = `导入失败：${err.message}`
  } finally {
    importing.value = false
  }
}

// ─── 删除导入的活动 ────────────────────────────────────
async function removeImported(activity) {
  if (!confirm(`确定要删除活动「${activity.name}」吗？`)) return

  // Electron：通过 IPC 删除文件
  if (window.avgLLM?.activity?.remove) {
    const result = await window.avgLLM.activity.remove(activity.id)
    if (!result.success) {
      error.value = `删除失败：${result.error}`
      return
    }
  }
  // Capacitor/Android：使用 Capacitor Filesystem API
  else if (window.Capacitor?.isNativePlatform?.() || window.__avgLLM?.activity?.remove) {
    const removeFn = window.__avgLLM?.activity?.remove || window.avgLLM?.activity?.remove
    if (removeFn) {
      const result = await removeFn(activity.id)
      if (!result.success) {
        error.value = `删除失败：${result.error}`
        return
      }
    }
  }
  // Web：从 kvStorage 删除
  else {
    const imported = await loadImported()
    const filtered = imported.filter(i => i.id !== activity.id)
    await saveImported(filtered)
    await deleteCoverFile(activity.id)
  }

  // 如果删除的是当前启用的，清除启用状态
  if (enabledActivityId.value === activity.id) {
    enabledActivityId.value = null
    await saveEnabledId()
  }

  await load()
}

// ─── 打开活动 ──────────────────────────────────────────
function openActivity(activity) {
  console.log('[ActivityScreen] openActivity:', {
    id: activity.id,
    imported: activity.imported,
    metaStoryConfig: activity.meta?.storyConfig,
    metaPortraits: activity.meta?.storyConfig?.portraits,
    // 检查是否有 base64 大数据
    hasFiles: !!activity.files,
    filesCount: activity.files?.length,
    metaSize: JSON.stringify(activity.meta || {}).length,
  })
  selectedActivity.value = activity
}

function closeActivity() {
  selectedActivity.value = null
}

function handleOpenStory(data) {
  // 找到对应的活动，传递 files 数组给 ActivityStoryScreen
  const activity = activities.value.find(a => a.id === data.activityId)
  emit('open-activity-story', {
    activityId: data.activityId,
    storyConfig: data.storyConfig,
    activityFiles: activity?.files || null,
  })
}

function isActivityActive(activity) {
  const now = Date.now()
  if (activity.startTime && now < activity.startTime) return false
  if (activity.endTime && now > activity.endTime) return false
  return true
}

onMounted(async () => {
  await load()
  const pendingId = activityEntry.consumePendingActivityId()
  if (pendingId) {
    const found = activities.value.find(a => a.id === pendingId)
    if (found) selectedActivity.value = found
  }
})
</script>

<template>
  <div class="activity-screen">
    <!-- 活动详情渲染 -->
    <template v-if="selectedActivity">
      <button class="floating-back-btn" @click="closeActivity" title="返回">≪</button>
      <ActivityRenderer
        :activity-id="selectedActivity.id"
        :activity-data="selectedActivity.meta"
        :activity-files="selectedActivity.files"
        @close="closeActivity"
        @open-story="handleOpenStory"
      />
    </template>

    <!-- 活动列表 -->
    <template v-else>
      <header class="activity-header">
        <button class="activity-back-btn" @click="emit('back')">
          <span>←</span> 返回
        </button>
        <h2 class="activity-title">活动</h2>
        <div class="header-actions">
          <button class="import-btn" :disabled="importing" @click="triggerImport">
            <span class="import-icon">{{ importing ? '⏳' : '➕' }}</span>
          </button>
        </div>
      </header>

      <!-- 当前启用状态提示 -->
      <div v-if="enabledActivity" class="enabled-banner">
        <span class="enabled-icon">{{ enabledActivity.bannerIcon }}</span>
        <div class="enabled-info">
          <span class="enabled-label">当前活动</span>
          <span class="enabled-name">{{ enabledActivity.name }}</span>
        </div>
        <button class="enabled-toggle" @click="enableActivity(null)">取消启用</button>
      </div>

      <div class="activity-body">
        <!-- 加载中 -->
        <div v-if="loading" class="activity-loading">
          <div class="loading-spinner"></div>
          <p>正在加载活动...</p>
        </div>

        <!-- 错误 -->
        <div v-else-if="error" class="activity-error">
          <p>{{ error }}</p>
          <div class="error-actions">
            <button class="retry-btn" @click="error = null; load()">重试</button>
            <button class="retry-btn" @click="error = null; load()">清除错误</button>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="activities.length === 0" class="activity-empty">
          <span class="empty-icon">🎪</span>
          <p>暂无活动</p>
          <p v-if="!isElectron" class="empty-hint">点击 ➕ 选择活动 zip 文件导入</p>
          <p v-else class="empty-hint">点击 ➕ 导入活动文件夹，或将活动放到 data/activities/ 下</p>
        </div>

        <!-- 活动列表 -->
        <div v-else class="activity-list">
          <div
            v-for="activity in activities"
            :key="activity.id"
            class="activity-card"
            :class="{ enabled: activity.id === enabledActivityId }"
          >
            <!-- 上半部分：卡片背景图 -->
            <div class="card-image-section" @click="openActivity(activity)">
              <img v-if="activity.cardBackground" :src="activity.cardBackground" class="card-bg-image" alt="" />
              <div v-else class="card-bg-gradient" :style="{ background: activity.coverGradient ? `linear-gradient(135deg, ${activity.coverGradient.join(',')})` : `linear-gradient(135deg, ${activity.bannerColor || '#4a9eff'}, ${activity.bannerColor || '#4a9eff'}cc)` }"></div>
            </div>

            <!-- 下半部分：信息区域（纯色背景） -->
            <div class="card-info-section">
              <!-- 名称 -->
              <h3 class="card-name">{{ activity.name }}</h3>

              <!-- 描述 -->
              <p class="card-desc">{{ activity.description || '暂无描述' }}</p>

              <!-- 标签行：状态 + 世界书 + 按钮 -->
              <div class="tag-row">
                <span class="status-badge" :class="{ active: isActivityActive(activity), enabled: activity.id === enabledActivityId }">
                  <template v-if="activity.id === enabledActivityId">启用中</template>
                  <template v-else-if="isActivityActive(activity)">进行中</template>
                  <template v-else>未开始</template>
                </span>

                <span v-if="activity.meta?.worldBookId" class="worldbook-badge">📖 {{ activity.meta.worldBookId }}</span>

                <div class="action-tags">
                  <span
                    class="action-tag enable-tag"
                    :class="{ enabled: activity.id === enabledActivityId }"
                    @click.stop="enableActivity(activity)"
                  >
                    {{ activity.id === enabledActivityId ? '已启用' : '启用' }}
                  </span>
                  <span
                    v-if="activity.imported"
                    class="action-tag remove-tag"
                    @click.stop="removeImported(activity)"
                    title="删除"
                  >✕</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.activity-screen {
  min-height: 100vh;
  background: var(--background, #0a0a0a);
  color: var(--foreground, #ffffff);
  display: flex;
  flex-direction: column;
}

/* 悬浮返回按钮 */
.floating-back-btn {
  position: fixed;
  top: 48px;
  left: 12px;
  z-index: 1000;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24px;
  font-weight: 300;
  cursor: pointer;
  padding: 8px;
  transition: color 0.15s;
  user-select: none;
}

.floating-back-btn:hover {
  color: #fff;
}

.activity-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.activity-back-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 8px;
  transition: background 0.15s;
}

.activity-back-btn:hover { background: rgba(255, 255, 255, 0.1); }

.activity-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.spacer { width: 44px; }

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.import-btn {
  background: rgba(74, 158, 255, 0.2);
  border: 1px solid rgba(74, 158, 255, 0.4);
  color: #4a9eff;
  font-size: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.import-btn:hover {
  background: rgba(74, 158, 255, 0.3);
}

.import-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 当前启用状态 */
.enabled-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.02));
  border-bottom: 1px solid rgba(34, 197, 94, 0.2);
}

.enabled-icon { font-size: 20px; }

.enabled-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.enabled-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.enabled-name {
  font-size: 13px;
  font-weight: 600;
  color: #22c55e;
}

.enabled-toggle {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.enabled-toggle:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.activity-body {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.activity-loading,
.activity-error,
.activity-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #ff6b9d;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.activity-loading p,
.activity-error p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
}

.error-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.retry-btn {
  padding: 8px 24px;
  background: rgba(255, 107, 157, 0.2);
  border: 1px solid rgba(255, 107, 157, 0.4);
  border-radius: 8px;
  color: #ff6b9d;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.empty-icon { font-size: 48px; margin-bottom: 12px; }

.empty-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 4px;
}

/* 活动列表 */
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.activity-card {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
}

.activity-card.enabled {
  border-color: rgba(34, 197, 94, 0.5);
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.15);
}

/* 上半部分：图片区域 */
.card-image-section {
  height: 140px;
  overflow: hidden;
  cursor: pointer;
}

.card-bg-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.activity-card:hover .card-bg-image {
  transform: scale(1.05);
}

.card-bg-gradient {
  width: 100%;
  height: 100%;
}

/* 下半部分：信息区域 */
.card-info-section {
  background: rgba(20, 20, 20, 0.95);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 名称 */
.card-name {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: #fff;
}

/* 描述 */
.card-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin: 0;
  line-height: 1.35;
}

/* 标签行 */
.tag-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

/* 状态标签 */
.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
  font-weight: 600;
}

.status-badge.active {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.status-badge.enabled {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

/* 世界书 */
.worldbook-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  color: #a78bfa;
  font-weight: 600;
}

/* 操作标签 */
.action-tags {
  display: flex;
  gap: 6px;
  margin-left: auto;
  align-items: center;
}

.action-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.enable-tag {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.enable-tag:hover {
  background: rgba(34, 197, 94, 0.25);
}

.enable-tag.enabled {
  background: rgba(34, 197, 94, 0.25);
  color: #4ade80;
}

.remove-tag {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.remove-tag:hover {
  background: rgba(239, 68, 68, 0.25);
}

/* Android 刘海屏适配 */
.platform-android.android-portrait .activity-header {
  padding-top: max(12px, var(--safe-area-inset-top, 12px));
  padding-left: 14px;
  padding-right: 14px;
}

.platform-android.android-portrait .activity-title {
  font-size: 1.1rem;
}

.platform-android.android-portrait .activity-back-btn,
  .platform-android.android-portrait .retry-btn,
  .platform-android.android-portrait .activity-back-btn,
  .platform-android.android-portrait .import-btn,
   .platform-android.android-portrait .floating-back-btn {
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
