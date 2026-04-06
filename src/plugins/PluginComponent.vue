<script setup>
import { computed, ref, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import {
  getPluginComponents,
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

// 当前激活的组件列表（支持同类型多组件共存）
const activeComponents = ref([])
const hasActiveComponents = computed(() => activeComponents.value.length > 0)

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
    const pluginComponents = getPluginComponents(props.pluginType)
    const builtinPluginId = getBuiltinPluginIdByType(props.pluginType)
    const builtInEnabled = builtinPluginId ? isPluginEnabled(builtinPluginId) : false

    // 掌机类型支持共存：默认掌机 + 启用的掌机插件可同时渲染
    if (props.pluginType === PluginTypes.HANDHELD) {
      const nextComponents = []

      if (builtInEnabled && props.defaultComponent) {
        nextComponents.push({
          key: 'builtin-default',
          component: props.defaultComponent,
        })
      } else if (!builtinPluginId && props.defaultComponent) {
        nextComponents.push({
          key: 'default-fallback',
          component: props.defaultComponent,
        })
      }

      pluginComponents.forEach((component, index) => {
        nextComponents.push({
          key: `plugin-${index}`,
          component: defineAsyncComponent(() => Promise.resolve(component)),
        })
      })

      activeComponents.value = nextComponents
      emit('plugin-loaded', {
        usingPlugin: pluginComponents.length > 0,
        builtInEnabled,
        coexist: true,
        renderedCount: nextComponents.length,
      })
      return
    }

    // 非掌机类型维持单替换：优先使用第一个插件组件
    if (pluginComponents.length > 0) {
      const pluginComponent = pluginComponents[0]
      activeComponents.value = [{
        key: 'plugin-primary',
        component: defineAsyncComponent(() => Promise.resolve(pluginComponent)),
      }]
      emit('plugin-loaded', { usingPlugin: true, component: pluginComponent })
      return
    }

    // 若当前类型存在内置插件，是否渲染默认组件取决于内置插件开关状态
    if (builtinPluginId) {
      if (builtInEnabled && props.defaultComponent) {
        activeComponents.value = [{
          key: 'builtin-default',
          component: props.defaultComponent,
        }]
        emit('plugin-loaded', { usingPlugin: false, builtInEnabled: true })
      } else {
        // 内置插件被禁用时，不渲染任何组件
        activeComponents.value = []
        emit('plugin-loaded', { usingPlugin: false, builtInEnabled: false })
      }
      return
    }

    // 无内置插件类型时，回退到默认组件
    if (props.defaultComponent) {
      activeComponents.value = [{
        key: 'default-fallback',
        component: props.defaultComponent,
      }]
      emit('plugin-loaded', { usingPlugin: false })
    } else {
      activeComponents.value = []
    }
  } catch (e) {
    console.error('Failed to load plugin component:', e)
    error.value = e
    // 出错时回退到默认组件
    activeComponents.value = props.defaultComponent
      ? [{
          key: 'fallback-on-error',
          component: props.defaultComponent,
        }]
      : []
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
  <div v-if="loading || error || hasActiveComponents" class="plugin-component-wrapper">
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
    <template v-else-if="hasActiveComponents">
      <component
        v-for="entry in activeComponents"
        :key="entry.key"
        :is="entry.component"
        v-bind="componentProps"
      />
    </template>
  </div>
</template>

<style scoped src="./PluginComponent.css"></style>

