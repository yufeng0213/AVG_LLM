<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  activityId: { type: String, required: true },
  activityData: { type: Object, required: true },
  activityFiles: { type: Array, default: null }, // Web/kvStorage 环境的备用
})

const emit = defineEmits(['close', 'open-story'])

const loading = ref(true)
const error = ref(null)
const iframeRef = ref(null)
const iframeSrc = ref(null)

// 检测环境
const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron
const isCapacitor = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()

console.log('[ActivityRenderer] 环境检测: electron=' + isElectron + ', capacitor=' + isCapacitor)
console.log('[ActivityRenderer] activityId:', props.activityId)
console.log('[ActivityRenderer] activityData:', props.activityData)

// 初始化 iframe src
async function initIframeSrc() {
  console.log('[ActivityRenderer] initIframeSrc 开始')

  if (isElectron) {
    // Electron: activity:// 协议
    iframeSrc.value = `activity://${props.activityId}/activity/index.html`
    console.log('[ActivityRenderer] Electron 路径:', iframeSrc.value)
  } else if (isCapacitor) {
    // Capacitor/Android: 从文件系统获取 URL
    console.log('[ActivityRenderer] Capacitor 环境，尝试获取文件 URL')
    try {
      if (!window.__avgLLM?.activity?.getFileUrl) {
        console.error('[ActivityRenderer] __avgLLM.activity.getFileUrl 不存在')
        error.value = 'getFileUrl API 未初始化'
        return
      }
      const url = await window.__avgLLM.activity.getFileUrl(props.activityId, 'activity/index.html')
      console.log('[ActivityRenderer] getFileUrl 返回:', url)
      if (url) {
        iframeSrc.value = url
      } else {
        console.error('[ActivityRenderer] getFileUrl 返回 null')
        error.value = '无法获取活动文件 URL'
      }
    } catch (e) {
      console.error('[ActivityRenderer] 加载失败:', e.message)
      error.value = `加载活动失败：${e.message}`
    }
  } else {
    // Web: /data/activities/ 路径
    iframeSrc.value = `/data/activities/${props.activityId}/activity/index.html`
    console.log('[ActivityRenderer] Web 路径:', iframeSrc.value)
  }
}

onMounted(async () => {
  await initIframeSrc()
  setTimeout(() => { loading.value = false }, 1000)
  window.addEventListener('message', handleIframeMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', handleIframeMessage)
})

function handleIframeMessage(e) {
  if (!e.data || !e.data.__avgLLM) return

  if (e.data.type === 'requestConfig') {
    sendActivityConfig()
    return
  }

  if (e.data.type === 'activityEvent' && e.data.eventType === 'openStory') {
    emit('open-story', {
      activityId: props.activityId,
      storyConfig: props.activityData?.storyConfig || {}
    })
    return
  }
}

function sendActivityConfig() {
  const config = JSON.parse(JSON.stringify({
    activityId: props.activityId,
    worldBookId: props.activityData?.worldBookId || 'default_world_book',
    gacha: props.activityData?.gacha || null,
    missions: props.activityData?.missions || null,
    signups: props.activityData?.signups || null,
    storyConfig: props.activityData?.storyConfig || null,
  }))

  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.postMessage({
      __avgLLM: true,
      type: 'activityConfig',
      config: config
    }, '*')
  }
}

function onIframeLoad() {
  console.log('[ActivityRenderer] iframe load 事件触发')
  console.log('[ActivityRenderer] iframe src:', iframeSrc.value)
  try {
    const iframeDoc = iframeRef.value?.contentDocument
    if (iframeDoc) {
      console.log('[ActivityRenderer] iframe document 可访问')
      console.log('[ActivityRenderer] iframe body innerHTML:', iframeDoc.body?.innerHTML?.substring(0, 200))
      console.log('[ActivityRenderer] iframe body 内容长度:', iframeDoc.body?.innerHTML?.length || 0)

      // 尝试读取实际的 HTML 源码
      if (iframeDoc.documentElement) {
        console.log('[ActivityRenderer] iframe documentElement outerHTML 长度:', iframeDoc.documentElement.outerHTML?.length)
      }
    } else {
      console.log('[ActivityRenderer] iframe contentDocument 不可访问')
    }
  } catch (e) {
    console.log('[ActivityRenderer] iframe 访问异常:', e.message)
  }

  // 检查文件是否真的存在
  checkFileExists()
}

async function checkFileExists() {
  if (!window.__avgLLM?.activity?.getFileUrl) return

  try {
    // 尝试获取目录列表
    const { Filesystem, Directory } = await import('@capacitor/filesystem')

    console.log('[ActivityRenderer] 检查 activities 目录...')

    try {
      const result = await Filesystem.readdir({
        path: 'activities',
        directory: Directory.Data
      })
      console.log('[ActivityRenderer] activities 目录内容:', result.files)
    } catch (e) {
      console.log('[ActivityRenderer] activities 目录不存在或读取失败:', e.message)
    }

    // 检查具体活动目录
    try {
      const result = await Filesystem.readdir({
        path: `activities/${props.activityId}`,
        directory: Directory.Data
      })
      console.log('[ActivityRenderer] 活动目录内容:', result.files)
    } catch (e) {
      console.log('[ActivityRenderer] 活动目录不存在:', e.message)
    }

    // 检查 activity 子目录
    try {
      const result = await Filesystem.readdir({
        path: `activities/${props.activityId}/activity`,
        directory: Directory.Data
      })
      console.log('[ActivityRenderer] activity 子目录内容:', result.files)
    } catch (e) {
      console.log('[ActivityRenderer] activity 子目录不存在:', e.message)
    }

    // 尝试直接读取 index.html
    try {
      const result = await Filesystem.readFile({
        path: `activities/${props.activityId}/activity/index.html`,
        directory: Directory.Data
      })
      console.log('[ActivityRenderer] index.html 内容长度:', result.data?.length)
      console.log('[ActivityRenderer] index.html 前100字符:', result.data?.substring(0, 100))
    } catch (e) {
      console.log('[ActivityRenderer] index.html 读取失败:', e.message)
    }

  } catch (e) {
    console.log('[ActivityRenderer] Filesystem 模块加载失败:', e.message)
  }
}

function onIframeError(e) {
  console.error('[ActivityRenderer] iframe error 事件:', e.message || '未知错误')
  error.value = 'iframe 加载失败'
}
</script>

<template>
  <div class="activity-renderer">
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

    <div v-else class="activity-iframe-wrap">
      <iframe
        ref="iframeRef"
        :src="iframeSrc"
        class="activity-iframe"
        frameborder="0"
        @load="onIframeLoad"
        @error="onIframeError"
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