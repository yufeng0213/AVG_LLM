<script setup>
import { ref, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import {
  getPluginComponent,
  getBuiltinPluginIdByType,
  isPluginEnabled,
  PluginTypes,
  initPluginSystem
} from './pluginManager.js'

const props = defineProps({
  // 默认组件
  defaultComponent: {
    type: Object,
    required: true
  },
  // 插件类型
  pluginType: {
    type: String,
    required: true,
    validator: (value) => Object.values(PluginTypes).includes(value)
  },
  // 传递给组件的 props
  componentProps: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['plugin-loaded', 'plugin-error'])

// 当前激活的组件
const activeComponent = ref(null)

// 加载状态
const loading = ref(true)
const error = ref(null)

// 监听插件变化
const handlePluginEnabled = async () => {
  await loadActiveComponent()
}

const handlePluginDisabled = async () => {
  await loadActiveComponent()
}

// 加载当前应该使用的组件
const loadActiveComponent = async () => {
  loading.value = true
  error.value = null
  
  try {
    // 优先使用外部启用插件组件
    const pluginComponent = getPluginComponent(props.pluginType)
    
    if (pluginComponent) {
      activeComponent.value = defineAsyncComponent(() => Promise.resolve(pluginComponent))
      emit('plugin-loaded', { usingPlugin: true, component: pluginComponent })
      return
    }

    // 若当前类型存在内置插件，是否渲染默认组件取决于内置插件开关状态
    const builtinPluginId = getBuiltinPluginIdByType(props.pluginType)
    if (builtinPluginId) {
      if (isPluginEnabled(builtinPluginId)) {
        activeComponent.value = props.defaultComponent
        emit('plugin-loaded', { usingPlugin: false, builtInEnabled: true })
      } else {
        // 内置插件被禁用时，不渲染任何组件
        activeComponent.value = null
        emit('plugin-loaded', { usingPlugin: false, builtInEnabled: false })
      }
      return
    }

    // 无内置插件类型时，回退到默认组件
    if (props.defaultComponent) {
      activeComponent.value = props.defaultComponent
      emit('plugin-loaded', { usingPlugin: false })
    }
  } catch (e) {
    console.error('Failed to load plugin component:', e)
    error.value = e
    // 出错时回退到默认组件
    activeComponent.value = props.defaultComponent
    emit('plugin-error', { error: e })
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // 初始化插件系统
  try {
    await initPluginSystem()
  } catch (e) {
    console.error('Failed to init plugin system in PluginComponent:', e)
  }
  
  // 加载组件
  await loadActiveComponent()
  
  // 监听插件启用/禁用事件
  window.addEventListener('plugin-enabled', handlePluginEnabled)
  window.addEventListener('plugin-disabled', handlePluginDisabled)
})

onUnmounted(() => {
  window.removeEventListener('plugin-enabled', handlePluginEnabled)
  window.removeEventListener('plugin-disabled', handlePluginDisabled)
})
</script>

<template>
  <div v-if="loading || error || activeComponent" class="plugin-component-wrapper">
    <!-- 加载状态 -->
    <div v-if="loading" class="plugin-loading">
      <slot name="loading">
        <div class="plugin-loading-default">
          <span class="plugin-loading-spinner"></span>
          <span>加载中...</span>
        </div>
      </slot>
    </div>
    
    <!-- 错误状态 -->
    <div v-else-if="error" class="plugin-error">
      <slot name="error" :error="error">
        <div class="plugin-error-default">
          <span>⚠️ 组件加载失败</span>
          <button @click="loadActiveComponent">重试</button>
        </div>
      </slot>
    </div>
    
    <!-- 渲染组件 -->
    <component
      v-else-if="activeComponent"
      :is="activeComponent"
      v-bind="componentProps"
    />
  </div>
</template>

<style scoped>
.plugin-component-wrapper {
  width: 100%;
  height: 100%;
}

.plugin-loading,
.plugin-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 100px;
}

.plugin-loading-default,
.plugin-error-default {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
}

.plugin-loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.plugin-error-default button {
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.plugin-error-default button:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
