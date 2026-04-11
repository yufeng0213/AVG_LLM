<script setup>
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { Filesystem, Directory } from '@capacitor/filesystem'

const emit = defineEmits(['back', 'complete'])
const props = defineProps({
  characterName: {
    type: String,
    default: '角色'
  }
})

const videoRef = ref(null)
const canvasRef = ref(null)
const stream = ref(null)
const capturedImage = ref(null)
const selectedTemplate = ref('classic')
const isCameraReady = ref(false)
const cameraError = ref('')
const isCapturing = ref(false)

// 导入功能相关状态
const fileInputRef = ref(null)
const customTemplates = ref([])
const showImportMenu = ref(false)

// 拍立得模板样式
const polaroidTemplates = [
  { id: 'classic', name: '经典白边', style: 'classic' },
  { id: 'vintage', name: '复古棕调', style: 'vintage' },
  { id: 'neon', name: '霓虹赛博', style: 'neon' },
  { id: 'sakura', name: '樱花粉恋', style: 'sakura' },
  { id: 'ocean', name: '海洋蓝调', style: 'ocean' },
  { id: 'sunset', name: '黄昏暮光', style: 'sunset' },
  { id: 'forest', name: '森林绿意', style: 'forest' },
  { id: 'monochrome', name: '黑白胶片', style: 'monochrome' },
  { id: 'dreamy', name: '梦幻紫调', style: 'dreamy' },
  { id: 'warm', name: '暖光回忆', style: 'warm' },
  { id: 'cool', name: '冷色物语', style: 'cool' },
  { id: 'comic', name: '漫画风格', style: 'comic' },
]

// 合并内置模板和自定义模板
const allTemplates = computed(() => {
  return [{ id: 'import', name: '导入素材', style: 'import', isImport: true }, ...polaroidTemplates, ...customTemplates.value]
})

// 触发文件选择
const triggerImport = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// 处理文件导入
const handleFileImport = async (event) => {
  console.log('[DEBUG] handleFileImport 被调用')
  const file = event.target.files[0]
  if (!file) {
    console.log('[DEBUG] 没有选择文件')
    return
  }
  console.log('[DEBUG] 选择文件:', file.name)

  const fileName = file.name.toLowerCase()
  
  if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
    // 处理PNG/JPG图片导入
    console.log('[DEBUG] 开始导入PNG/JPG图片')
    await importPolaroidImage(file)
  } else if (fileName.endsWith('.json')) {
    // 处理JSON格式导入
    console.log('[DEBUG] 开始导入JSON模板')
    await importPolaroidJson(file)
  } else {
    alert('不支持的文件格式，请导入PNG、JPG或JSON文件')
  }
  
  // 清空input以便重复选择同一文件
  event.target.value = ''
  console.log('[DEBUG] handleFileImport 完成')
}

// 导入拍立得图片
const importPolaroidImage = async (file) => {
  console.log('[DEBUG] importPolaroidImage 开始')
  try {
    const reader = new FileReader()
    reader.onload = async (e) => {
      console.log('[DEBUG] FileReader onload 触发')
      const base64Data = e.target.result
      const templateId = 'custom_' + Date.now()
      const templateName = file.name.replace(/\.[^.]+$/, '')
      
      console.log('[DEBUG] 创建模板:', templateId)
      // 创建自定义模板
      const newTemplate = {
        id: templateId,
        name: templateName,
        style: templateId,
        isCustom: true,
        backgroundImage: base64Data
      }
      
      console.log('[DEBUG] 添加模板到 customTemplates')
      customTemplates.value.push(newTemplate)
      console.log('[DEBUG] 设置 selectedTemplate:', templateId)
      selectedTemplate.value = templateId
      
      // 动态注入CSS样式
      console.log('[DEBUG] 注入CSS样式')
      injectCustomTemplateStyle(templateId, base64Data)
      
      // 等待DOM更新后恢复摄像头
      console.log('[DEBUG] 等待 nextTick')
      await nextTick()
      console.log('[DEBUG] nextTick 完成，准备恢复摄像头')
      await resumeCamera()
      
      console.log('[DEBUG] 拍立得素材导入成功！')
    }
    reader.onerror = () => {
      console.error('[DEBUG] 读取图片文件失败')
    }
    reader.readAsDataURL(file)
  } catch (err) {
    console.error('[DEBUG] 导入图片失败:', err)
  }
}

// 导入JSON格式拍立得模板
const importPolaroidJson = async (file) => {
  console.log('[DEBUG] importPolaroidJson 开始')
  try {
    console.log('[DEBUG] 读取文件内容')
    const text = await file.text()
    console.log('[DEBUG] 文件内容:', text.substring(0, 100))
    let jsonData
    
    try {
      jsonData = JSON.parse(text)
      console.log('[DEBUG] JSON.parse 成功')
    } catch (parseErr) {
      // 尝试解析 name:xx;css:xx 格式
      console.log('[DEBUG] JSON.parse 失败，尝试自定义格式')
      jsonData = parseCustomFormat(text)
    }
    
    if (!jsonData || !jsonData.name || !jsonData.css) {
      throw new Error('JSON格式不正确，需要包含name和css字段')
    }
    
    const templateId = 'custom_' + Date.now()
    console.log('[DEBUG] 创建模板:', templateId)
    
    const newTemplate = {
      id: templateId,
      name: jsonData.name,
      style: templateId,
      isCustom: true,
      customCss: jsonData.css
    }
    
    console.log('[DEBUG] 添加模板到 customTemplates')
    customTemplates.value.push(newTemplate)
    console.log('[DEBUG] 设置 selectedTemplate:', templateId)
    selectedTemplate.value = templateId
    
    // 动态注入CSS样式
    console.log('[DEBUG] 注入CSS样式')
    injectCustomTemplateStyle(templateId, null, jsonData.css)
    
    // 等待DOM更新后恢复摄像头
    console.log('[DEBUG] 等待 nextTick')
    await nextTick()
    console.log('[DEBUG] nextTick 完成，准备恢复摄像头')
    await resumeCamera()
    
    console.log(`[DEBUG] 拍立得模板 "${jsonData.name}" 导入成功！`)
  } catch (err) {
    console.error('[DEBUG] 导入JSON模板失败:', err)
  }
}

// 重启摄像头流
const restartCameraStream = async () => {
  console.log('[DEBUG] restartCameraStream 开始')
  
  if (capturedImage.value) {
    console.log('[DEBUG] 跳过重启：已拍照')
    return
  }
  
  try {
    // 停止旧流
    if (stream.value) {
      console.log('[DEBUG] 停止旧流')
      stream.value.getTracks().forEach(track => track.stop())
      stream.value = null
    }
    
    // 获取新流
    console.log('[DEBUG] 获取新流')
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    })
    
    // 设置到video元素
    if (videoRef.value) {
      console.log('[DEBUG] 设置srcObject')
      videoRef.value.srcObject = stream.value
      isCameraReady.value = true
      
      // 等待加载
      await new Promise((resolve) => {
        videoRef.value.onloadedmetadata = () => {
          console.log('[DEBUG] 视频元数据加载完成')
          resolve()
        }
        // 如果已经加载完成
        if (videoRef.value.readyState >= 2) {
          resolve()
        }
      })
      
      // 播放
      console.log('[DEBUG] 开始播放')
      await videoRef.value.play()
      console.log('[DEBUG] 播放成功')
    }
  } catch (err) {
    console.error('[DEBUG] 重启摄像头流失败:', err)
    cameraError.value = '重启摄像头失败，请重试'
  }
  console.log('[DEBUG] restartCameraStream 完成')
}

// 恢复摄像头播放（保留旧函数兼容性）
const resumeCamera = async () => {
  console.log('[DEBUG] resumeCamera 开始')
  console.log('[DEBUG] videoRef.value:', videoRef.value ? '存在' : '不存在')
  console.log('[DEBUG] capturedImage.value:', capturedImage.value ? '存在' : '不存在')
  
  if (!videoRef.value || capturedImage.value) {
    console.log('[DEBUG] 跳过恢复摄像头：videoRef不存在或已拍照')
    return
  }
  
  // 直接重启流而不是尝试恢复
  await restartCameraStream()
  
  console.log('[DEBUG] resumeCamera 完成')
}

// 解析自定义格式 name:xx;css:xx
const parseCustomFormat = (text) => {
  const nameMatch = text.match(/name\s*:\s*([^;]+)/)
  const cssMatch = text.match(/css\s*:\s*(.+)$/s)
  
  if (nameMatch && cssMatch) {
    return {
      name: nameMatch[1].trim(),
      css: cssMatch[1].trim()
    }
  }
  return null
}

// 动态注入自定义模板CSS样式
const injectCustomTemplateStyle = (templateId, backgroundImage, customCss) => {
  const styleId = `custom-style-${templateId}`
  
  // 如果已存在则移除
  const existingStyle = document.getElementById(styleId)
  if (existingStyle) {
    existingStyle.remove()
  }
  
  const styleEl = document.createElement('style')
  styleEl.id = styleId
  
  let cssContent = ''
  
  if (backgroundImage) {
    // PNG图片作为完整的拍立得相框模板
    // 使用新的 .custom-template-overlay 元素而不是伪元素
    // z-index: 相机画面(1) < PNG覆盖层(2) < 标题文字(3)
    cssContent = `
      .polaroid-template-${templateId} {
        position: relative;
        overflow: visible;
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
      .polaroid-template-${templateId} .polaroid-camera-viewport {
        position: relative;
        z-index: 1;
        background: transparent !important;
      }
      .polaroid-template-${templateId} .custom-template-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-image: url(${backgroundImage});
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        z-index: 2;
        pointer-events: none;
      }
      .polaroid-template-${templateId} .polaroid-caption {
        position: relative;
        z-index: 3;
      }
    `
  } else if (customCss) {
    // JSON自定义CSS作为覆盖层
    cssContent = `
      .polaroid-template-${templateId} {
        position: relative;
        overflow: visible;
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
      .polaroid-template-${templateId} .polaroid-camera-viewport {
        position: relative;
        z-index: 1;
        background: transparent !important;
      }
      .polaroid-template-${templateId} .custom-template-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        ${customCss}
        z-index: 2;
        pointer-events: none;
      }
      .polaroid-template-${templateId} .polaroid-caption {
        position: relative;
        z-index: 3;
      }
    `
  }
  
  styleEl.textContent = cssContent
  document.head.appendChild(styleEl)
}

const startCamera = async () => {
  try {
    cameraError.value = ''
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    })
    if (videoRef.value) {
      videoRef.value.srcObject = stream.value
      isCameraReady.value = true
    }
  } catch (err) {
    console.error('摄像头启动失败:', err)
    cameraError.value = '无法启动摄像头，请检查权限设置'
  }
}

const stopCamera = () => {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
    stream.value = null
  }
  isCameraReady.value = false
}

const capturePhoto = () => {
  if (!videoRef.value || !canvasRef.value || !isCameraReady.value) return
  
  isCapturing.value = true
  const video = videoRef.value
  const canvas = canvasRef.value
  
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0)
  
  capturedImage.value = canvas.toDataURL('image/png')
  
  // 暂停视频以冻结画面
  video.pause()
  
  setTimeout(() => {
    isCapturing.value = false
  }, 300)
}

const retakePhoto = async () => {
  capturedImage.value = null
  // 重启相机流以更新画面
  await restartCameraStream()
}

const confirmPhoto = () => {
  if (!capturedImage.value) return
  
  const photoData = {
    image: capturedImage.value,
    template: selectedTemplate.value,
    characterName: props.characterName,
    timestamp: Date.now()
  }
  
  emit('complete', photoData)
}

// 清理文件名（参考卡片保存实现）
const sanitizePngFilename = (rawName) => {
  const fallback = `polaroid_${Date.now()}.png`
  const name = String(rawName || fallback).trim() || fallback
  const safe = name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  const normalized = safe || fallback
  return normalized.toLowerCase().endsWith('.png') ? normalized : `${normalized}.png`
}

// 提取base64数据
const extractBase64Payload = (dataUrl) => {
  if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) return ''
  return dataUrl.split(',')[1] || ''
}

// 辅助函数：以cover模式绘制图片（保持比例，填充区域，裁剪多余部分）
const drawImageCover = (ctx, img, x, y, width, height) => {
  const imgRatio = img.videoWidth ? img.videoWidth / img.videoHeight : img.width / img.height
  const targetRatio = width / height
  
  let drawWidth, drawHeight, offsetX, offsetY
  
  if (imgRatio > targetRatio) {
    drawHeight = height
    drawWidth = height * imgRatio
    offsetX = x + (width - drawWidth) / 2
    offsetY = y
  } else {
    drawWidth = width
    drawHeight = width / imgRatio
    offsetX = x
    offsetY = y + (height - drawHeight) / 2
  }
  
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
}

// 保存拍立得为PNG到系统相册
// 直接使用canvas手动绘制，避免html2canvas的缓冲区问题
const savePolaroid = async () => {
  const frameEl = document.querySelector('.polaroid-frame')
  const viewportEl = frameEl?.querySelector('.polaroid-camera-viewport')
  
  if (!frameEl || !viewportEl) {
    console.error('[DEBUG] 相框或视口元素不存在')
    alert('保存失败：相框元素未找到')
    return
  }
  
  try {
    console.log('[DEBUG] 开始保存拍立得...')
    
    // 获取相框和视口的实际尺寸
    const frameRect = frameEl.getBoundingClientRect()
    const vpRect = viewportEl.getBoundingClientRect()
    
    // 使用设备像素比提高清晰度
    const dpr = window.devicePixelRatio || 2
    const frameWidth = Math.round(frameRect.width * dpr)
    const frameHeight = Math.round(frameRect.height * dpr)
    const vpWidth = Math.round(vpRect.width * dpr)
    const vpHeight = Math.round(vpRect.height * dpr)
    
    // 计算视口在相框中的位置
    const vpX = Math.round((vpRect.left - frameRect.left) * dpr)
    const vpY = Math.round((vpRect.top - frameRect.top) * dpr)
    
    console.log('[DEBUG] 相框尺寸:', frameWidth, 'x', frameHeight)
    console.log('[DEBUG] 视口位置:', vpX, vpY, vpWidth, vpHeight)
    
    // 创建输出canvas
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = frameWidth
    outputCanvas.height = frameHeight
    const ctx = outputCanvas.getContext('2d')
    
    // 第一步：绘制相机画面（在视口区域内）
    if (capturedImage.value) {
      const img = new Image()
      img.src = capturedImage.value
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })
      // 裁剪到视口区域
      ctx.save()
      ctx.beginPath()
      ctx.rect(vpX, vpY, vpWidth, vpHeight)
      ctx.clip()
      drawImageCover(ctx, img, vpX, vpY, vpWidth, vpHeight)
      ctx.restore()
    } else {
      const videoEl = videoRef.value
      if (videoEl && videoEl.readyState >= 2) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(vpX, vpY, vpWidth, vpHeight)
        ctx.clip()
        drawImageCover(ctx, videoEl, vpX, vpY, vpWidth, vpHeight)
        ctx.restore()
      }
    }
    
    // 第二步：绘制相框背景（视口外部区域）
    const frameStyle = window.getComputedStyle(frameEl)
    const frameBgColor = frameStyle.backgroundColor
    
    ctx.fillStyle = frameBgColor || '#fff'
    // 上区域
    ctx.fillRect(0, 0, frameWidth, vpY)
    // 下区域
    ctx.fillRect(0, vpY + vpHeight, frameWidth, frameHeight - vpY - vpHeight)
    // 左区域
    ctx.fillRect(0, vpY, vpX, vpHeight)
    // 右区域
    ctx.fillRect(vpX + vpWidth, vpY, frameWidth - vpX - vpWidth, vpHeight)
    
    // 第三步：绘制边框（如果有）
    const borderColor = frameStyle.borderColor
    const borderTop = Math.round(parseFloat(frameStyle.borderTopWidth) * dpr)
    const borderBottom = Math.round(parseFloat(frameStyle.borderBottomWidth) * dpr)
    const borderLeft = Math.round(parseFloat(frameStyle.borderLeftWidth) * dpr)
    const borderRight = Math.round(parseFloat(frameStyle.borderRightWidth) * dpr)
    
    if ((borderTop > 0 || borderLeft > 0 || borderRight > 0 || borderBottom > 0) &&
        borderColor && borderColor !== 'transparent' && borderColor !== 'initial') {
      ctx.fillStyle = borderColor
      ctx.fillRect(0, 0, frameWidth, borderTop)
      ctx.fillRect(0, frameHeight - borderBottom, frameWidth, borderBottom)
      ctx.fillRect(0, 0, borderLeft, frameHeight)
      ctx.fillRect(frameWidth - borderRight, 0, borderRight, frameHeight)
    }
    
    // 第四步：应用圆角（如果有）
    const borderRadius = parseFloat(frameStyle.borderRadius) || 0
    if (borderRadius > 0) {
      // 创建圆角裁剪路径
      const radius = Math.round(borderRadius * dpr)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.beginPath()
      ctx.roundRect(0, 0, frameWidth, frameHeight, radius)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
    
    // 第五步：绘制自定义模板覆盖层（如果有PNG背景图）
    const selectedTpl = allTemplates.value.find(t => t.id === selectedTemplate.value)
    if (selectedTpl?.backgroundImage) {
      const img = new Image()
      img.src = selectedTpl.backgroundImage
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })
      ctx.drawImage(img, 0, 0, frameWidth, frameHeight)
    }
    
    // 转换为PNG
    const dataUrl = outputCanvas.toDataURL('image/png', 1.0)
    console.log('[DEBUG] dataUrl 长度:', dataUrl.length)
    
    const base64Data = extractBase64Payload(dataUrl)
    if (!base64Data) {
      console.error('[DEBUG] base64Data 为空')
      alert('保存失败：图片数据无效')
      return
    }
    
    const fileName = sanitizePngFilename(`polaroid_${Date.now()}.png`)
    const exportDir = 'avg_llm_polaroid'
    const relativePath = `${exportDir}/${fileName}`
    
    const result = await Filesystem.writeFile({
      path: relativePath,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    })
    
    console.log('[DEBUG] 文件已保存:', result.uri)
    alert(`拍立得已保存！\n文件位置: ${result.uri || `Documents/${relativePath}`}`)
    
    await restartCameraStream()
  } catch (err) {
    console.error('[DEBUG] 保存失败:', err)
    alert(`保存失败：${err.message || '请重试'}`)
  }
}

const getTemplateClass = (templateId) => {
  return `polaroid-template-${templateId}`
}

onMounted(() => {
  startCamera()
})

onBeforeUnmount(() => {
  stopCamera()
})
</script>

<template>
  <div class="polaroid-screen">
    <header class="polaroid-header">
      <button type="button" class="polaroid-back-btn" @click="emit('back')" aria-label="返回寝室">
        <svg class="polaroid-back-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="polaroid-title">和 {{ characterName }} 的出游时光</h2>
    </header>

    <main class="polaroid-body">
      <section class="polaroid-camera-view" :class="{ 'flash-active': isCapturing }">
        <!-- 拍立得相框预览 -->
        <div class="polaroid-preview-area">
          <div class="polaroid-frame" :class="getTemplateClass(selectedTemplate)">
            <!-- 自定义模板覆盖层（只显示在边框区域） -->
            <div v-if="selectedTemplate.startsWith('custom-')" class="custom-template-overlay"></div>
            <!-- 摄像头画面作为相框背景 -->
            <div class="polaroid-camera-viewport">
              <video
                ref="videoRef"
                autoplay
                playsinline
                class="polaroid-video"
                v-show="!capturedImage"
              ></video>
              <canvas ref="canvasRef" style="display: none;"></canvas>
              <!-- 拍摄后的照片 -->
              <img v-if="capturedImage" :src="capturedImage" alt="拍摄的照片" class="polaroid-photo" />
            </div>
            <!-- 拍立得底部文字（已移除） -->
          </div>
        </div>

        <!-- 摄像头错误提示 -->
        <div v-if="cameraError" class="polaroid-camera-error">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          <p>{{ cameraError }}</p>
        </div>

        <!-- 拍照按钮 -->
        <div class="polaroid-controls">
          <button
            v-if="!capturedImage && isCameraReady"
            type="button"
            class="polaroid-capture-btn"
            @click="capturePhoto"
          >
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="12" r="6"/>
            </svg>
          </button>
          
          <template v-if="capturedImage">
            <button type="button" class="polaroid-retake-btn" @click="retakePhoto">
              重拍
            </button>
            <button type="button" class="polaroid-save-btn" @click="savePolaroid">
              保存
            </button>
          </template>
        </div>
      </section>

      <!-- 模板选择区域 -->
      <section class="polaroid-templates">
        <h3 class="templates-title">选择拍立得模板</h3>
        <div class="templates-grid">
          <!-- 导入按钮 -->
          <button
            type="button"
            class="template-item template-import-btn"
            @click="triggerImport"
          >
            <span class="import-icon">+</span>
            <span class="template-name">导入素材</span>
          </button>
          
          <button
            v-for="template in allTemplates"
            :key="template.id"
            type="button"
            class="template-item"
            :class="{ active: selectedTemplate === template.id }"
            @click="selectedTemplate = template.id"
          >
            <div class="template-preview" :class="getTemplateClass(template.style)">
              <div class="template-preview-photo"></div>
              <div class="template-preview-caption">
                <span>示例</span>
              </div>
            </div>
            <span class="template-name">{{ template.name }}</span>
          </button>
        </div>
      </section>
    </main>
    
    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".png,.jpg,.jpeg,.json"
      style="display: none"
      @change="handleFileImport"
    />
  </div>
</template>

<style scoped>
.polaroid-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.polaroid-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.polaroid-back-btn {
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

.polaroid-back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.polaroid-back-icon {
  display: block;
}

.polaroid-title {
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

.polaroid-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.polaroid-camera-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 16px;
  min-height: 0;
  gap: 16px;
}

.polaroid-camera-view.flash-active {
  animation: flash 0.3s ease-out;
}

@keyframes flash {
  0% { filter: brightness(1); }
  50% { filter: brightness(3); }
  100% { filter: brightness(1); }
}

/* 拍立得预览区域 */
.polaroid-preview-area {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  min-height: 0;
  width: 100%;
}

/* 拍立得相框 */
.polaroid-frame {
  background: #fff;
  padding: 12px 12px 55px 12px;
  border-radius: 4px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  transform: rotate(-2deg);
  transition: all 0.3s ease;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 320px;
  width: 100%;
}

/* 摄像头可视区域（相框内部） */
.polaroid-camera-viewport {
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 2px;
  background: #000;
  position: relative;
}

.polaroid-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.polaroid-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.polaroid-caption {
  position: absolute;
  bottom: 10px;
  left: 0;
  right: 0;
  text-align: center;
  font-family: 'Georgia', serif;
  color: #666;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.polaroid-date {
  font-size: 10px;
  color: #999;
}

.polaroid-controls {
  display: flex;
  gap: 16px;
  margin-top: 20px;
  justify-content: center;
}

.polaroid-capture-btn {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
  border: 4px solid #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: all 0.2s ease;
  box-shadow: 0 4px 20px rgba(238, 90, 90, 0.4);
}

.polaroid-capture-btn:hover {
  transform: scale(1.05);
}

.polaroid-capture-btn:active {
  transform: scale(0.95);
}

.polaroid-retake-btn,
.polaroid-confirm-btn,
.polaroid-save-btn {
  padding: 12px 28px;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.polaroid-retake-btn {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.polaroid-retake-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.polaroid-save-btn {
  background: linear-gradient(135deg, #4ecdc4, #44b09e);
  color: #fff;
  box-shadow: 0 4px 15px rgba(78, 205, 196, 0.4);
}

.polaroid-save-btn:hover {
  transform: translateY(-2px);
}

.polaroid-camera-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #ff6b6b;
  text-align: center;
  padding: 40px;
}

.polaroid-camera-error svg {
  opacity: 0.6;
}

.polaroid-templates {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  max-height: 220px;
  overflow-y: auto;
}

.templates-title {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 12px 0;
  text-align: center;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.template-item {
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
}

.template-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.template-item.active {
  border-color: #4ecdc4;
  background: rgba(78, 205, 196, 0.15);
}

.template-preview {
  width: 80px;
  background: #fff;
  padding: 6px 6px 24px 6px;
  border-radius: 3px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  position: relative;
}

.template-preview-photo {
  width: 100%;
  height: 56px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 2px;
}

.template-preview-caption {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  text-align: center;
  font-family: 'Georgia', serif;
  font-size: 8px;
  color: #888;
}

.template-name {
  color: #ccc;
  font-size: 11px;
}

/* 导入按钮样式 */
.template-import-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
  border: 2px dashed rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  padding: 16px 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 120px;
}

.template-import-btn:hover {
  border-color: #4ecdc4;
  background: rgba(78, 205, 196, 0.1);
}

.import-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  font-size: 32px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.5);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
}

.template-import-btn:hover .import-icon {
  color: #4ecdc4;
  border-color: rgba(78, 205, 196, 0.5);
}

.template-import-btn .template-name {
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
}

.template-import-btn:hover .template-name {
  color: #4ecdc4;
}

/* 拍立得模板样式 */

/* 经典白边 */
.polaroid-template-classic {
  background: #fff;
}

.polaroid-template-classic .polaroid-caption {
  color: #666;
}

/* 复古棕调 */
.polaroid-template-vintage {
  background: #f5e6d3;
  border: 2px solid #d4a574;
}

.polaroid-template-vintage .polaroid-photo {
  filter: sepia(0.4) contrast(1.1);
}

.polaroid-template-vintage .polaroid-caption {
  color: #8b6f47;
  font-style: italic;
}

/* 霓虹赛博 */
.polaroid-template-neon {
  background: #0a0a0a;
  border: 2px solid #0ff;
  box-shadow: 0 0 20px rgba(0, 255, 255, 0.3), inset 0 0 20px rgba(255, 0, 255, 0.1);
}

.polaroid-template-neon .polaroid-photo {
  filter: saturate(1.5) hue-rotate(10deg);
}

.polaroid-template-neon .polaroid-caption {
  color: #0ff;
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
}

/* 樱花粉恋 */
.polaroid-template-sakura {
  background: linear-gradient(135deg, #fff5f5, #ffe0e6);
  border: 2px solid #ffb6c1;
}

.polaroid-template-sakura .polaroid-photo {
  filter: saturate(1.2) brightness(1.05);
}

.polaroid-template-sakura .polaroid-caption {
  color: #d4728c;
}

/* 海洋蓝调 */
.polaroid-template-ocean {
  background: linear-gradient(135deg, #e8f4f8, #d1ecf1);
  border: 2px solid #5bc0de;
}

.polaroid-template-ocean .polaroid-photo {
  filter: saturate(1.1) hue-rotate(-10deg);
}

.polaroid-template-ocean .polaroid-caption {
  color: #31708f;
}

/* 黄昏暮光 */
.polaroid-template-sunset {
  background: linear-gradient(135deg, #fff3e0, #ffe0b2);
  border: 2px solid #ff9800;
}

.polaroid-template-sunset .polaroid-photo {
  filter: saturate(1.3) contrast(1.05) brightness(0.95);
}

.polaroid-template-sunset .polaroid-caption {
  color: #e65100;
}

/* 森林绿意 */
.polaroid-template-forest {
  background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
  border: 2px solid #4caf50;
}

.polaroid-template-forest .polaroid-photo {
  filter: saturate(1.2) hue-rotate(20deg);
}

.polaroid-template-forest .polaroid-caption {
  color: #2e7d32;
}

/* 黑白胶片 */
.polaroid-template-monochrome {
  background: #2a2a2a;
  border: 2px solid #555;
}

.polaroid-template-monochrome .polaroid-photo {
  filter: grayscale(1) contrast(1.2);
}

.polaroid-template-monochrome .polaroid-caption {
  color: #aaa;
  font-family: 'Courier New', monospace;
}

/* 梦幻紫调 */
.polaroid-template-dreamy {
  background: linear-gradient(135deg, #f3e5f5, #e1bee7);
  border: 2px solid #9c27b0;
}

.polaroid-template-dreamy .polaroid-photo {
  filter: saturate(1.1) brightness(1.05) hue-rotate(-5deg);
}

.polaroid-template-dreamy .polaroid-caption {
  color: #7b1fa2;
}

/* 暖光回忆 */
.polaroid-template-warm {
  background: linear-gradient(135deg, #fff8e1, #ffecb3);
  border: 2px solid #ffc107;
}

.polaroid-template-warm .polaroid-photo {
  filter: saturate(1.2) sepia(0.2) brightness(1.05);
}

.polaroid-template-warm .polaroid-caption {
  color: #f57f17;
}

/* 冷色物语 */
.polaroid-template-cool {
  background: linear-gradient(135deg, #e3f2fd, #bbdefb);
  border: 2px solid #2196f3;
}

.polaroid-template-cool .polaroid-photo {
  filter: saturate(0.9) hue-rotate(15deg) brightness(1.05);
}

.polaroid-template-cool .polaroid-caption {
  color: #1565c0;
}

/* 漫画风格 */
.polaroid-template-comic {
  background: #fff;
  border: 4px solid #000;
}

.polaroid-template-comic .polaroid-photo {
  filter: contrast(1.4) saturate(1.5) posterize(4);
}

.polaroid-template-comic .polaroid-caption {
  color: #000;
  font-weight: bold;
  font-family: 'Arial Black', sans-serif;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .polaroid-header {
    padding: 10px 12px;
  }
  
  .polaroid-title {
    font-size: 14px;
  }
  
  .polaroid-video {
    max-width: 100%;
    border-radius: 12px;
  }
  
  .polaroid-frame {
    padding: 12px 12px 50px 12px;
    transform: rotate(0deg);
  }
  
  .polaroid-photo {
    max-width: 260px;
    max-height: 260px;
  }
  
  .templates-grid {
    grid-template-columns: repeat(auto-fill, minmax(85px, 1fr));
    gap: 8px;
  }
  
  .template-preview {
    width: 70px;
  }
  
  .template-preview-photo {
    height: 48px;
  }
}

@media (max-width: 480px) {
  .polaroid-capture-btn {
    width: 64px;
    height: 64px;
  }
  
  .polaroid-retake-btn,
  .polaroid-confirm-btn {
    padding: 10px 20px;
    font-size: 14px;
  }
  
  .templates-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Android 竖屏专用样式 - 使用 !important 确保覆盖 */
.platform-android.android-portrait .polaroid-screen {
  width: 100vw !important;
  height: 100dvh !important;
  max-width: 100% !important;
  overflow: hidden !important;
}

.platform-android.android-portrait .polaroid-header {
  padding: 12px !important;
  padding-top: calc(12px + env(safe-area-inset-top)) !important;
  flex-shrink: 0 !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 0 !important;
}

.platform-android.android-portrait .polaroid-back-btn {
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  min-height: 44px !important;
  padding: 8px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;
  border-radius: 8px !important;
  flex-shrink: 0 !important;
  background: transparent !important;
  border: none !important;
  color: rgba(255, 255, 255, 0.7) !important;
}

.platform-android.android-portrait .polaroid-back-btn:hover {
  background: rgba(255, 255, 255, 0.1) !important;
  color: #fff !important;
}

.platform-android.android-portrait .polaroid-back-icon {
  display: block !important;
  width: 24px !important;
  height: 24px !important;
}

.platform-android.android-portrait .polaroid-title {
  font-size: 15px !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  flex: 1 !important;
  min-width: 0 !important;
  text-align: center !important;
}

.platform-android.android-portrait .polaroid-body {
  flex: 1 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}

.platform-android.android-portrait .polaroid-camera-view {
  flex: 1 !important;
  min-height: 0 !important;
  padding: 12px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 12px !important;
  overflow: hidden !important;
}

.platform-android.android-portrait .polaroid-preview-area {
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
}

.platform-android.android-portrait .polaroid-frame {
  padding: 10px 10px 50px 10px !important;
  transform: rotate(0deg) !important;
  max-width: 85vw !important;
  max-height: 50vh !important;
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
}

.platform-android.android-portrait .polaroid-camera-viewport {
  width: 100% !important;
  aspect-ratio: 1 / 1 !important;
  overflow: hidden !important;
  border-radius: 2px !important;
  background: #000 !important;
  position: relative !important;
}

.platform-android.android-portrait .polaroid-video {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
}

.platform-android.android-portrait .polaroid-photo {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
}

.platform-android.android-portrait .polaroid-controls {
  display: flex !important;
  gap: 12px !important;
  margin-top: 16px !important;
  justify-content: center !important;
  flex-wrap: nowrap !important;
}

.platform-android.android-portrait .polaroid-capture-btn {
  width: 64px !important;
  height: 64px !important;
  min-width: 64px !important;
  min-height: 64px !important;
  flex-shrink: 0 !important;
}

.platform-android.android-portrait .polaroid-retake-btn,
.platform-android.android-portrait .polaroid-confirm-btn {
  min-height: 44px !important;
  height: 44px !important;
  padding: 0 20px !important;
  font-size: 14px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
  border-radius: 22px !important;
  min-width: 70px !important;
}

.platform-android.android-portrait .polaroid-templates {
  max-height: 160px !important;
  padding: 10px !important;
  padding-bottom: calc(10px + env(safe-area-inset-bottom)) !important;
  flex-shrink: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}

.platform-android.android-portrait .templates-title {
  font-size: 13px !important;
  margin: 0 0 8px 0 !important;
}

.platform-android.android-portrait .templates-grid {
  display: grid !important;
  grid-template-columns: repeat(4, 1fr) !important;
  gap: 6px !important;
}

.platform-android.android-portrait .template-item {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  gap: 4px !important;
  padding: 6px !important;
}

.platform-android.android-portrait .template-preview {
  width: 65px !important;
  padding: 5px 5px 20px 5px !important;
}

.platform-android.android-portrait .template-preview-photo {
  height: 42px !important;
}

.platform-android.android-portrait .template-name {
  font-size: 10px !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  max-width: 100% !important;
}

.platform-android.android-portrait .polaroid-camera-error {
  padding: 20px !important;
}

.platform-android.android-portrait .polaroid-camera-error svg {
  width: 36px !important;
  height: 36px !important;
}

.platform-android.android-portrait .polaroid-camera-error p {
  font-size: 13px !important;
}

.platform-android.android-portrait .polaroid-caption {
  font-size: 11px !important;
}

.platform-android.android-portrait .polaroid-date {
  font-size: 9px !important;
}
</style>
