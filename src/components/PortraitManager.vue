<script setup>
import { computed, ref, watch } from 'vue'
import { EMOTION_PRESETS, getEmotionLabel } from '../worldbook/emotionPresets'
import { createNewPortrait } from '../worldbook/worldBookStore'

const props = defineProps({
  portraits: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update'])

// 本地状态
const localPortraits = ref([])
const previewPortrait = ref(null)
const isLoading = ref(false)
const imageCache = ref(new Map())

// 同步外部传入的立绘数据
watch(
  () => props.portraits,
  (newPortraits) => {
    localPortraits.value = [...newPortraits]
  },
  { immediate: true, deep: true }
)

// 检查是否在 Electron 环境
const isElectronEnv = computed(() => {
  return typeof window !== 'undefined' && window.avgLLM?.dialog?.selectPortrait
})

const canAddPortrait = computed(() => {
  if (isElectronEnv.value) {
    return true
  }
  return typeof document !== 'undefined'
})

const pickImageFile = () => {
  if (typeof document === 'undefined') {
    return Promise.resolve({ canceled: true, file: null })
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.position = 'fixed'
    input.style.left = '-9999px'

    let settled = false

    const finish = (file, canceled = false) => {
      if (settled) {
        return
      }
      settled = true
      window.removeEventListener('focus', handleFocus)
      input.remove()
      resolve({ canceled, file })
    }

    const handleFocus = () => {
      window.setTimeout(() => {
        if (!settled) {
          const file = input.files?.[0] || null
          finish(file, !file)
        }
      }, 320)
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0] || null
      finish(file, !file)
    }, { once: true })

    input.addEventListener('cancel', () => {
      finish(null, true)
    }, { once: true })

    window.addEventListener('focus', handleFocus, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

const readFileAsDataUrl = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('无法读取图片数据'))
      }
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

// 获取立绘预览 URL（通过 Electron API 或直接路径）
const getPortraitUrl = async (portrait) => {
  if (!portrait?.filePath) return ''

  if (portrait.filePath.startsWith('data:image')) {
    return portrait.filePath
  }

  // 检查缓存
  if (imageCache.value.has(portrait.filePath)) {
    return imageCache.value.get(portrait.filePath)
  }

  // Electron 环境：读取文件为 Base64
  if (window.avgLLM?.file?.readImage) {
    try {
      const result = await window.avgLLM.file.readImage(portrait.filePath)
      if (result?.base64) {
        const url = `data:${result.mimeType};base64,${result.base64}`
        imageCache.value.set(portrait.filePath, url)
        return url
      }
    } catch {
      return ''
    }
  }

  // 非 Electron 环境：直接使用文件路径（仅用于开发测试）
  return portrait.filePath
}

// 添加立绘
const addPortrait = async () => {
  if (!canAddPortrait.value) {
    console.warn('Portrait selection is not available')
    return
  }

  isLoading.value = true
  try {
    if (isElectronEnv.value) {
      const result = await window.avgLLM.dialog.selectPortrait()
      if (result.canceled || result.filePaths.length === 0) {
        return
      }

      const filePath = result.filePaths[0]
      const fileName = filePath.split(/[\\/]/).pop()
      const newPortrait = createNewPortrait(filePath, fileName, 'default')

      localPortraits.value = [...localPortraits.value, newPortrait]
      emit('update', localPortraits.value)
      return
    }

    const pickResult = await pickImageFile()
    if (pickResult.canceled || !pickResult.file) {
      return
    }

    const file = pickResult.file
    const dataUrl = await readFileAsDataUrl(file)
    const newPortrait = createNewPortrait(dataUrl, file.name || 'portrait.png', 'default')
    localPortraits.value = [...localPortraits.value, newPortrait]
    emit('update', localPortraits.value)
  } catch (error) {
    console.error('Portrait import failed:', error)
  } finally {
    isLoading.value = false
  }
}

// 更新立绘表情
const updatePortraitEmotion = (portraitId, newEmotion) => {
  const portrait = localPortraits.value.find((p) => p.id === portraitId)
  if (!portrait) return

  portrait.emotion = newEmotion
  portrait.label = getEmotionLabel(newEmotion)

  // 如果是自定义表情，保持用户可能已输入的自定义标签
  if (newEmotion !== 'custom') {
    emit('update', localPortraits.value)
  }
}

// 更新自定义表情标签
const updateCustomLabel = (portraitId, customLabel) => {
  const portrait = localPortraits.value.find((p) => p.id === portraitId)
  if (!portrait) return

  portrait.label = customLabel
  emit('update', localPortraits.value)
}

// 删除立绘
const removePortrait = (portraitId) => {
  localPortraits.value = localPortraits.value.filter((p) => p.id !== portraitId)
  // 清除缓存
  const portrait = props.portraits.find((p) => p.id === portraitId)
  if (portrait?.filePath) {
    imageCache.value.delete(portrait.filePath)
  }
  emit('update', localPortraits.value)
}

// 显示预览
const showPreview = async (portrait) => {
  const url = await getPortraitUrl(portrait)
  if (url) {
    previewPortrait.value = { ...portrait, previewUrl: url }
  }
}

// 关闭预览
const closePreview = () => {
  previewPortrait.value = null
}

// 获取缩略图 URL
const getThumbnailUrl = (portrait) => {
  return getPortraitUrl(portrait)
}
</script>

<template>
  <div class="portrait-manager">
    <div class="portrait-header">
      <span class="portrait-title">立绘配置</span>
      <span class="portrait-hint">为角色添加不同表情的立绘图片</span>
    </div>

    <div class="portrait-list" v-if="localPortraits.length > 0">
      <div
        v-for="portrait in localPortraits"
        :key="portrait.id"
        class="portrait-item"
      >
        <div class="portrait-thumbnail" @click="showPreview(portrait)">
          <img
            :src="getThumbnailUrl(portrait)"
            :alt="portrait.label"
            loading="lazy"
          />
          <span class="preview-hint">点击预览</span>
        </div>

        <div class="portrait-info">
          <label class="emotion-select-label">表情类型</label>
          <select
            class="emotion-select"
            :value="portrait.emotion"
            @change="updatePortraitEmotion(portrait.id, $event.target.value)"
          >
            <option
              v-for="preset in EMOTION_PRESETS"
              :key="preset.id"
              :value="preset.id"
            >
              {{ preset.label }}
            </option>
          </select>

          <input
            v-if="portrait.emotion === 'custom'"
            class="custom-label-input"
            type="text"
            :value="portrait.label"
            placeholder="输入自定义表情名称"
            @input="updateCustomLabel(portrait.id, $event.target.value)"
          />

          <span class="portrait-file-name">{{ portrait.fileName }}</span>
        </div>

        <button
          type="button"
          class="portrait-remove-btn"
          @click="removePortrait(portrait.id)"
          title="删除此立绘"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="portrait-empty" v-else>
      <p class="empty-message">暂无立绘配置</p>
      <p class="empty-hint">点击下方按钮添加角色立绘</p>
    </div>

    <button
      type="button"
      class="portrait-add-btn"
      :disabled="isLoading || !canAddPortrait"
      @click="addPortrait"
    >
      <span v-if="isLoading">加载中...</span>
      <span v-else-if="!canAddPortrait">当前环境不可用</span>
      <span v-else>＋ 添加立绘</span>
    </button>

    <!-- 预览弹窗 -->
    <div
      v-if="previewPortrait"
      class="portrait-preview-modal"
      @click="closePreview"
    >
      <div class="preview-content">
        <img
          :src="previewPortrait.previewUrl"
          :alt="previewPortrait.label"
          class="preview-image"
        />
        <div class="preview-info">
          <span class="preview-label">{{ previewPortrait.label }}</span>
          <span class="preview-file">{{ previewPortrait.fileName }}</span>
        </div>
        <button type="button" class="preview-close" @click="closePreview">
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./PortraitManager.css"></style>

