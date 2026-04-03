# AVG_LLM 插件开发指南

## 概述

AVG_LLM 插件系统允许开发者创建自定义插件来扩展或替换程序功能。例如，你可以创建一个自定义的音乐播放器来替换默认的播放器组件。

## 插件类型

目前支持的插件类型：

| 类型 | 说明 | 替换目标 |
|------|------|----------|
| `music-player` | 音乐播放器 | `MusicPlayer` 组件 |
| `component` | 通用组件 | 自定义组件 |
| `theme` | 主题样式 | 主题配置 |

## 插件结构

每个插件必须是一个独立的文件夹，包含以下文件：

```
plugins/
└── your-plugin-id/
    ├── plugin.json    # 插件元数据（必需）
    └── index.vue      # 插件组件入口（必需）
```

### plugin.json 元数据

```json
{
  "id": "your-plugin-id",           // 插件唯一标识（必需）
  "name": "插件名称",                // 显示名称（必需）
  "version": "1.0.0",               // 版本号（必需）
  "author": "作者名",                // 作者（必需）
  "description": "插件描述",         // 描述信息（必需）
  "type": "music-player",           // 插件类型（必需）
  "entry": "index.vue",             // 入口组件文件（默认 index.vue）
  "icon": "🎵",                     // 显示图标（emoji 或图片路径）
  "replaces": ["MusicPlayer"],      // 要替换的组件列表
  "config": {                       // 插件配置项（可选）
    "theme": {
      "type": "string",
      "default": "dark",
      "options": ["dark", "light", "neon"]
    }
  }
}
```

### index.vue 组件

插件组件是一个标准的 Vue 3 组件，使用 `<script setup>` 语法：

```vue
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

// 插件状态和逻辑
const isPlaying = ref(false)
const volume = ref(80)

// 方法
const togglePlay = () => {
  isPlaying.value = !isPlaying.value
}

onMounted(() => {
  console.log('Plugin mounted')
})

onUnmounted(() => {
  console.log('Plugin unmounted')
})
</script>

<template>
  <div class="my-plugin">
    <!-- 插件 UI -->
    <button @click="togglePlay">
      {{ isPlaying ? '暂停' : '播放' }}
    </button>
  </div>
</template>

<style scoped>
.my-plugin {
  /* 插件样式 */
}
</style>
```

## 可用的 API

插件可以使用以下 Electron API：

### BGM API
```javascript
// 选择音乐文件夹
window.avgLLM.bgm.selectFolder()
  .then(result => {
    if (result.success) {
      console.log(result.files) // [{ name, path }, ...]
    }
  })

// 加载指定文件夹
window.avgLLM.bgm.loadFolder(folderPath)

// 读取音频文件（返回 Base64）
window.avgLLM.bgm.readAudio(filePath)
  .then(result => {
    // result: { base64, mimeType, path }
    const audioSrc = `data:${result.mimeType};base64,${result.base64}`
  })
```

### 文件 API
```javascript
// 读取图片文件
window.avgLLM.file.readImage(filePath)
```

### 存档 API
```javascript
// 获取存档列表
window.avgLLM.save.getSaveList()

// 保存游戏
window.avgLLM.save.saveGame(saveData, slotId)

// 加载游戏
window.avgLLM.save.loadGame(slotId)
```

## 音乐播放器插件示例

以下是一个完整的音乐播放器插件示例：

### plugin.json
```json
{
  "id": "custom-music-player",
  "name": "自定义音乐播放器",
  "version": "1.0.0",
  "author": "开发者",
  "description": "一个自定义的音乐播放器",
  "type": "music-player",
  "entry": "index.vue",
  "icon": "🎵",
  "replaces": ["MusicPlayer"]
}
```

### index.vue
```vue
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const isPlaying = ref(false)
const playlist = ref([])
const currentTrackIndex = ref(0)
const volume = ref(80)

let audioElement = null

const currentTrack = computed(() => {
  return playlist.value[currentTrackIndex.value] || null
})

const loadBgmFolder = async () => {
  const result = await window.avgLLM.bgm.selectFolder()
  if (result.success) {
    playlist.value = result.files.map((file, index) => ({
      id: index,
      name: file.name,
      path: file.path
    }))
  }
}

const playCurrent = async () => {
  if (!currentTrack.value) return
  const audioData = await window.avgLLM.bgm.readAudio(currentTrack.value.path)
  if (audioData) {
    audioElement.src = `data:${audioData.mimeType};base64,${audioData.base64}`
    audioElement.play()
    isPlaying.value = true
  }
}

const togglePlay = () => {
  if (isPlaying.value) {
    audioElement.pause()
    isPlaying.value = false
  } else {
    playCurrent()
  }
}

onMounted(() => {
  audioElement = new Audio()
  audioElement.volume = volume.value / 100
})

onUnmounted(() => {
  if (audioElement) {
    audioElement.pause()
    audioElement.src = ''
  }
})
</script>

<template>
  <div class="custom-player">
    <button @click="loadBgmFolder">加载音乐</button>
    <button @click="togglePlay">
      {{ isPlaying ? '暂停' : '播放' }}
    </button>
    <p v-if="currentTrack">{{ currentTrack.name }}</p>
  </div>
</template>

<style scoped>
.custom-player {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 16px;
  background: #1a1a2e;
  border-radius: 12px;
}
</style>
```

## 安装插件

### 方法一：通过插件管理界面
1. 在主界面点击"插件管理"
2. 点击"安装插件"按钮
3. 选择包含 `plugin.json` 的插件目录

### 方法二：手动安装
将插件文件夹复制到用户数据目录的 `plugins` 文件夹：
- Windows: `%APPDATA%/avg_llm/plugins/`
- macOS: `~/Library/Application Support/avg_llm/plugins/`
- Linux: `~/.config/avg_llm/plugins/`

## 插件生命周期

1. **扫描阶段**：程序启动时扫描插件目录
2. **加载阶段**：读取 `plugin.json` 元数据
3. **启用阶段**：用户启用插件时加载组件
4. **运行阶段**：组件被渲染并替换目标组件
5. **禁用阶段**：用户禁用时卸载组件，恢复默认组件

## 最佳实践

1. **唯一 ID**：使用有意义的唯一标识符，如 `com.yourname.plugin-name`
2. **版本管理**：使用语义化版本号（semver）
3. **错误处理**：妥善处理 API 调用失败的情况
4. **资源清理**：在 `onUnmounted` 中清理音频、定时器等资源
5. **样式隔离**：使用 `scoped` 样式避免污染全局样式
6. **响应式设计**：考虑不同屏幕尺寸的适配

## 调试插件

在开发环境中，可以使用 Vue DevTools 调试插件组件。插件加载错误会在控制台显示。

## 注意事项

- 插件组件必须是 Vue 3 兼容的
- 避免使用 Node.js 特有 API（如 `require`）
- 插件运行在渲染进程，无法直接访问文件系统
- 使用 `window.avgLLM` API 与 Electron 通信

## 示例插件

查看 `data/plugins/example-music-player/` 目录中的示例插件，了解完整的插件实现。