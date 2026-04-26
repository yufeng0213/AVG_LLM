<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  activityId: { type: String, required: true },
  activityData: { type: Object, required: true },
  // Android/Capacitor: activity files stored in kvStorage
  activityFiles: { type: Array, default: null },
})

// 调试 props
console.log('[ActivityRenderer] props:', {
  activityId: props.activityId,
  activityData: props.activityData,
  storyConfig: props.activityData?.storyConfig,
  portraits: props.activityData?.storyConfig?.portraits,
})

const emit = defineEmits(['close', 'open-story'])

const loading = ref(true)
const error = ref(null)
const debugInfo = ref([]) // 调试信息数组，直接显示在界面上
const containerRef = ref(null)
const iframeRef = ref(null)
const blobUrl = ref(null)

// 添加调试信息（Android可见）
function addDebug(msg) {
  console.log('[ActivityRenderer] ' + msg)
  debugInfo.value.push(msg)
}

const CONTENT_W = 1536
const CONTENT_H = 2720

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

// Electron: activity:// protocol; Web: /data/activities/; Android kvStorage: blob URL
const iframeSrc = computed(() => {
  if (blobUrl.value) return blobUrl.value
  if (isElectron) {
    return `activity://${props.activityId}/activity/index.html`
  }
  return `/data/activities/${props.activityId}/activity/index.html`
})

// Build blob URL from kvStorage activity files for Android/Capacitor
// Handles SPA-style activities: index.html + signin.html + gacha.html + missions.html
async function buildBlobUrl() {
  addDebug('buildBlobUrl start, files: ' + (props.activityFiles?.length || 0))

  if (!props.activityFiles?.length) {
    addDebug('No activityFiles!')
    blobUrl.value = null
    return
  }

  try {
    // 1. 为每个文件创建独立的 blob URL（而不是 data URI）
    // 这样 blob URL 只有 ~50 字符，不会让 JSON 变大
    const blobUrls = {}      // filename -> blob URL
    const blobUrlsByPath = {} // relativePath -> blob URL
    const portraitBlobUrls = {} // 角色名 -> blob URL (用于 gacha)

    // 先处理图片文件，创建 blob URL
    for (const f of props.activityFiles) {
      if (f.path.includes('activity/') && !f.path.endsWith('.html')) {
        const fileName = f.path.split('/').pop()
        const ext = fileName.split('.').pop().toLowerCase()
        const mimeType = ext === 'png' ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'webp' ? 'image/webp'
          : ext === 'gif' ? 'image/gif'
          : ext === 'css' ? 'text/css'
          : ext === 'js' ? 'application/javascript'
          : 'application/octet-stream'

        // 创建 blob URL
        let blob
        if (f.encoding === 'base64') {
          const binary = atob(f.content)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          blob = new Blob([bytes], { type: mimeType })
        } else {
          blob = new Blob([f.content], { type: mimeType })
        }
        const blobUrlStr = URL.createObjectURL(blob)

        // 存储多种映射方式
        blobUrls[fileName] = blobUrlStr

        // 相对路径映射
        let relativePath = f.path
        if (relativePath.startsWith('activity/')) {
          relativePath = relativePath.substring('activity/'.length)
        }
        blobUrlsByPath[relativePath] = blobUrlStr
        blobUrlsByPath['./' + relativePath] = blobUrlStr

        // 角色名映射（用于 gacha.html 动态加载）
        if (relativePath.startsWith('portraits/')) {
          const charName = fileName.replace(/\.[^.]+$/, '') // 陆野.png -> 陆野
          portraitBlobUrls[charName] = blobUrlStr
        }
      }
    }
    addDebug('Created ' + Object.keys(blobUrls).length + ' blob URLs for images')

    // 2. Find all HTML files
    const htmlFiles = {}
    for (const f of props.activityFiles) {
      if (f.path.includes('activity/') && f.path.endsWith('.html')) {
        const fileName = f.path.split('/').pop()
        htmlFiles[fileName] = f
      }
    }
    addDebug('htmlFiles: ' + Object.keys(htmlFiles).join(', '))

    // 3. Find index.html
    const indexFile = htmlFiles['index.html'] || props.activityFiles.find(f => f.path.endsWith('/activity/index.html') || f.path === 'activity/index.html')
    addDebug('indexFile: ' + (indexFile ? indexFile.path : 'NOT FOUND'))
    if (!indexFile) {
      error.value = '活动缺少 index.html'
      return
    }

    // 4. Process sub-pages: replace image paths with blob URLs (NOT base64!)
    const subPages = {}
    for (const [fileName, f] of Object.entries(htmlFiles)) {
      if (fileName === 'index.html') continue
      let html = f.encoding === 'base64'
        ? new TextDecoder().decode(Uint8Array.from(atob(f.content), c => c.charCodeAt(0)))
        : f.content

      // 替换图片路径为 blob URL（blob URL 只有 ~50 字符，很小）
      for (const [path, blobUrlStr] of Object.entries(blobUrlsByPath)) {
        html = html.replace(new RegExp(`['"]${path.replace(/\./g, '\\.')}['"]`, 'g'), `"${blobUrlStr}"`)
      }
      for (const [fileName, blobUrlStr] of Object.entries(blobUrls)) {
        html = html.replace(new RegExp(`['"]\\./?${fileName}['"]`, 'g'), `"${blobUrlStr}"`)
      }

      subPages[fileName.replace('.html', '')] = html
    }
    addDebug('subPages: ' + Object.keys(subPages).join(', ') + ', total size: ~' + Math.ceil(JSON.stringify(subPages).length / 1024) + 'KB')

    // 5. Process index.html
    let indexHtml = indexFile.encoding === 'base64'
      ? new TextDecoder().decode(Uint8Array.from(atob(indexFile.content), c => c.charCodeAt(0)))
      : indexFile.content

    // 替换图片路径（如果有）
    for (const [path, blobUrlStr] of Object.entries(blobUrlsByPath)) {
      indexHtml = indexHtml.replace(new RegExp(`['"]${path.replace(/\./g, '\\.')}['"]`, 'g'), `"${blobUrlStr}"`)
    }
    for (const [fileName, blobUrlStr] of Object.entries(blobUrls)) {
      indexHtml = indexHtml.replace(new RegExp(`['"]\\./?${fileName}['"]`, 'g'), `"${blobUrlStr}"`)
    }

    // 6. Inject __PAGES__
    if (Object.keys(subPages).length > 0) {
      const pagesJson = JSON.stringify(subPages).replace(/\x3c\/script\x3e/gi, '\x3c\\x2fscript\x3e')
      addDebug('__PAGES__ json size: ' + Math.ceil(pagesJson.length / 1024) + 'KB')

      // 用字符拼接生成 HTML 标签，绕过 Vue 编译器
      // 运行时这些字符串会被拼接成 <script> 和 </head> 等
      const lt = '\x3c'  // < 的十六进制编码
      const gt = '\x3e'  // > 的十六进制编码
      const slash = '\x2f' // / 的十六进制编码

      const scriptOpen = lt + 'script' + gt
      const scriptClose = lt + slash + 'script' + gt
      const headClose = lt + slash + 'head' + gt

      // 原始 HTML 里有真正的 </head>，需要匹配实际字符
      const realHeadClose = lt + slash + 'head' + gt

      if (indexHtml.indexOf(realHeadClose) >= 0) {
        indexHtml = indexHtml.replace(realHeadClose, scriptOpen + 'window.__PAGES__=' + pagesJson + scriptClose + headClose)
      } else {
        indexHtml = scriptOpen + 'window.__PAGES__=' + pagesJson + scriptClose + indexHtml
      }
      addDebug('Injected __PAGES__')
    }

    // 7. Inject portrait blob URLs for gacha
    if (Object.keys(portraitBlobUrls).length > 0) {
      const portraitJson = JSON.stringify(portraitBlobUrls)
      addDebug('portraitBlobUrls: ' + Object.keys(portraitBlobUrls).join(', '))

      const lt = '\x3c'
      const gt = '\x3e'
      const slash = '\x2f'

      const scriptOpen = lt + 'script' + gt
      const scriptClose = lt + slash + 'script' + gt
      const headClose = lt + slash + 'head' + gt

      if (indexHtml.indexOf(headClose) >= 0) {
        indexHtml = indexHtml.replace(headClose, scriptOpen + 'window.__PORTRAIT_BLOBURLS__=' + portraitJson + scriptClose + headClose)
      } else {
        indexHtml = scriptOpen + 'window.__PORTRAIT_BLOBURLS__=' + portraitJson + scriptClose + indexHtml
      }
    }

    // Clean up old blob URL
    if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)

    addDebug('Creating blob, html len: ' + indexHtml.length)
    const htmlBlob = new Blob([indexHtml], { type: 'text/html' })
    blobUrl.value = URL.createObjectURL(htmlBlob)
    addDebug('Blob URL: ' + blobUrl.value.substring(0, 50))
  } catch (err) {
    console.error('[ActivityRenderer] buildBlobUrl failed:', err)
    error.value = `加载活动失败：${err.message}`
  }
}

watch(() => props.activityFiles, () => {
  buildBlobUrl()
}, { immediate: true })

onMounted(() => {
  setTimeout(() => { loading.value = false }, 3000)

  // 监听 iframe 发来的消息
  window.addEventListener('message', handleIframeMessage)
})

onUnmounted(() => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
  window.removeEventListener('message', handleIframeMessage)
})

function handleIframeMessage(e) {
  if (!e.data || !e.data.__avgLLM) return

  // iframe 请求配置
  if (e.data.type === 'requestConfig') {
    console.log('[ActivityRenderer] 收到配置请求')
    sendActivityConfig()
    return
  }

  // 处理活动故事打开事件
  if (e.data.type === 'activityEvent' && e.data.eventType === 'openStory') {
    console.log('[ActivityRenderer] open-story event')
    emit('open-story', {
      activityId: props.activityId,
      storyConfig: props.activityData?.storyConfig || {}
    })
    return
  }

  // 注意：其他 API 调用（storage, economy, activity, cardCollection）由 globalApi.js 的 initIframeBridge 统一处理
  // 这里不再转发，避免重复调用
}

// 发送活动配置
function sendActivityConfig() {
  // 使用 JSON 序列化清理不可传递的数据
  const config = JSON.parse(JSON.stringify({
    activityId: props.activityId,  // 传递正确的活动 ID
    worldBookId: props.activityData?.worldBookId || 'default_world_book',  // 活动绑定的世界书
    gacha: props.activityData?.gacha || null,
    missions: props.activityData?.missions || null,
    signups: props.activityData?.signups || null,
    storyConfig: props.activityData?.storyConfig || null,
  }))

  console.log('[ActivityRenderer] 发送配置:', config)

  // 发送给 iframe
  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.postMessage({
      __avgLLM: true,
      type: 'activityConfig',
      config: config
    }, '*')
  } else {
    // 通过 parent 发送（适配 blob URL 场景）
    window.postMessage({
      __avgLLM: true,
      type: 'activityConfig',
      config: config
    }, '*')
  }
}
</script>

<template>
  <div class="activity-renderer">
    <!-- 调试面板（Android可见） -->
    <div v-if="debugInfo.length > 0" class="debug-panel">
      <div class="debug-header">调试信息</div>
      <div class="debug-content">
        <div v-for="(msg, i) in debugInfo" :key="i" class="debug-line">{{ msg }}</div>
      </div>
    </div>

    <div v-if="loading" class="activity-loading">
      <div class="loading-spinner"></div>
      <p>正在加载活动...</p>
    </div>

    <div v-else-if="error" class="activity-error">
      <span class="error-icon">⚠️</span>
      <h3>活动加载失败</h3>
      <p>{{ error }}</p>
      <button class="retry-btn" @click="$emit('close')">返回</button>
    </div>

    <div v-else ref="containerRef" class="activity-iframe-wrap">
      <iframe
        ref="iframeRef"
        :src="iframeSrc"
        class="activity-iframe"
        frameborder="0"
      ></iframe>
    </div>
  </div>
</template>

<style scoped>
.activity-renderer {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--background, #0a0a0a);
}

/* 调试面板样式 */
.debug-panel {
  position: fixed;
  top: 50px;
  left: 10px;
  right: 10px;
  max-height: 200px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid #ff6b9d;
  border-radius: 8px;
  z-index: 9999;
  overflow: hidden;
}

.debug-header {
  padding: 8px 12px;
  background: #ff6b9d;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.debug-content {
  padding: 8px 12px;
  overflow-y: auto;
  max-height: 160px;
}

.debug-line {
  font-size: 11px;
  color: #0f0;
  margin-bottom: 4px;
  word-break: break-all;
}

.activity-loading,
.activity-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 40px 20px;
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

.activity-loading p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
}

.error-icon { font-size: 48px; margin-bottom: 12px; }

.activity-error h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 8px;
  color: #fff;
}

.activity-error p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 20px;
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

.activity-iframe-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #000;
}

.activity-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
</style>
