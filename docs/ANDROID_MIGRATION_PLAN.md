# AVG_LLM 安卓移植方案

## 一、项目现状分析

### 1.1 技术栈
- **前端框架**: Vue 3 + Vite
- **桌面端**: Electron
- **存储**: localStorage + Electron 文件系统
- **API**: fetch 调用 LLM API

### 1.2 Electron 特有功能（需要替换）
| 功能 | Electron 实现 | 安卓替代方案 |
|------|--------------|-------------|
| 存档系统 | Node.js fs 模块 | Capacitor Filesystem API |
| 备份系统 | 文件系统读写 | Capacitor Filesystem API |
| 窗口管理 | BrowserWindow | 原生安卓窗口 |
| IPC 通信 | ipcMain/ipcRenderer | 移除或用插件替代 |
| 文件对话框 | dialog.showSaveDialog | Capacitor FilePicker/Camera |

### 1.3 可复用的代码
- ✅ 所有 Vue 组件（`src/` 目录）
- ✅ LLM 服务（`src/llm/`）
- ✅ 世界书逻辑（`src/worldbook/`）
- ✅ 主题系统（`src/theme/`）
- ✅ 插件系统（`src/plugins/`）
- ⚠️ 存档系统（需要适配存储层）

---

## 二、推荐方案：Capacitor

### 2.1 为什么选择 Capacitor？

| 特性 | Capacitor | Cordova | PWA |
|------|-----------|---------|-----|
| Vue 3 支持 | ✅ 原生支持 | ✅ 支持 | ✅ 支持 |
| 文件系统 API | ✅ 完善 | ✅ 完善 | ❌ 受限 |
| 原生插件 | ✅ 丰富 | ✅ 丰富 | ❌ 无 |
| 热更新 | ✅ 支持 | ⚠️ 复杂 | ✅ 天然支持 |
| 学习成本 | 低 | 中 | 最低 |
| 性能 | 高 | 中 | 中 |
| 应用商店发布 | ✅ 支持 | ✅ 支持 | ⚠️ 受限 |

### 2.2 架构对比

```
┌─────────────────────────────────────────────────────────┐
│                    现有 Electron 架构                     │
├─────────────────────────────────────────────────────────┤
│  Vue 3 前端  ←→  Electron IPC  ←→  Node.js 文件系统      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    目标 Capacitor 架构                    │
├─────────────────────────────────────────────────────────┤
│  Vue 3 前端  ←→  Capacitor Bridge  ←→  原生安卓 API      │
└─────────────────────────────────────────────────────────┘
```

---

## 三、实施步骤

### 阶段一：项目初始化（1-2天）

#### 1. 安装 Capacitor
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android
npx cap init "AVG LLM" "com.avgllm.app"
```

#### 2. 添加安卓平台
```bash
npm run build
npx cap add android
```

#### 3. 安装必要插件
```bash
# 文件系统
npm install @capacitor/filesystem

# 存储（替代 localStorage 的敏感数据）
npm install @capacitor/preferences

# 状态栏和导航栏
npm install @capacitor/status-bar
npm install @capacitor/navigation-bar

# 分享功能
npm install @capacitor/share

# 文件选择器
npm install @capacitor/file-picker
```

### 阶段二：存储层重构（2-3天）

#### 1. 创建存储抽象层

创建 `src/storage/` 目录，统一存储接口：

```javascript
// src/storage/index.js
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory } from '@capacitor/filesystem'

// 检测运行环境
const isNative = () => {
  return typeof window !== 'undefined' && 
         window.Capacitor?.isNativePlatform()
}

// 统一存储接口
export const storage = {
  // 键值存储
  async get(key) {
    if (isNative()) {
      const { value } = await Preferences.get({ key })
      return value ? JSON.parse(value) : null
    }
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : null
  },
  
  async set(key, value) {
    if (isNative()) {
      await Preferences.set({ key, value: JSON.stringify(value) })
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  },
  
  async remove(key) {
    if (isNative()) {
      await Preferences.remove({ key })
    } else {
      localStorage.removeItem(key)
    }
  },
  
  // 文件存储（存档）
  async saveFile(filename, data) {
    if (isNative()) {
      await Filesystem.writeFile({
        path: `saves/${filename}`,
        data: JSON.stringify(data),
        directory: Directory.Documents,
        recursive: true
      })
    } else {
      // Electron 或 Web 环境的降级处理
      localStorage.setItem(`file_${filename}`, JSON.stringify(data))
    }
  },
  
  async readFile(filename) {
    if (isNative()) {
      const result = await Filesystem.readFile({
        path: `saves/${filename}`,
        directory: Directory.Documents
      })
      return JSON.parse(result.data)
    }
    const data = localStorage.getItem(`file_${filename}`)
    return data ? JSON.parse(data) : null
  }
}
```

#### 2. 迁移存档系统

修改 `src/save/saveManager.js`，使用新的存储抽象层：

```javascript
// 原代码（Electron IPC）
const result = await window.electronAPI.saveGame(saveData)

// 新代码（跨平台）
import { storage } from '../storage'
const result = await storage.saveFile(`save_${Date.now()}.json`, saveData)
```

### 阶段三：Electron 依赖移除（1-2天）

#### 1. 创建环境检测工具

```javascript
// src/utils/platform.js
export const platform = {
  isElectron: () => {
    return typeof window !== 'undefined' && 
           window.electronAPI !== undefined
  },
  isAndroid: () => {
    return typeof window !== 'undefined' && 
           window.Capacitor?.getPlatform() === 'android'
  },
  isWeb: () => {
    return !platform.isElectron() && !platform.isAndroid()
  }
}
```

#### 2. 条件渲染 Electron 功能

```javascript
// 示例：文件对话框
async function exportData(data) {
  if (platform.isElectron()) {
    // Electron 原生对话框
    await window.electronAPI.exportData(data)
  } else if (platform.isAndroid()) {
    // 安卓分享功能
    await Share.share({
      title: '导出数据',
      text: JSON.stringify(data),
      dialogTitle: '导出存档'
    })
  } else {
    // Web 下载
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'save.json'
    a.click()
  }
}
```

### 阶段四：UI 适配（2-3天）

#### 1. 响应式布局调整

```css
/* 安卓设备适配 */
@media (max-width: 768px) {
  .game-container {
    /* 移动端全屏 */
    width: 100vw;
    height: 100vh;
  }
  
  .dialogue-box {
    /* 对话框适配小屏幕 */
    font-size: 14px;
    padding: 12px;
  }
  
  .menu-buttons {
    /* 按钮增大触摸区域 */
    min-height: 48px;
    min-width: 48px;
  }
}
```

#### 2. 触摸事件处理

```javascript
// 添加触摸手势支持
import { createGesture } from '@ionic/vue'

// 示例：滑动切换存档页
const gesture = createGesture({
  el: elementRef.value,
  threshold: 15,
  direction: 'x',
  onMove: (detail) => {
    // 处理滑动
  }
})
```

#### 3. 安全区域适配

```javascript
import { StatusBar, Style } from '@capacitor/status-bar'
import { NavigationBar } from '@capacitor/navigation-bar'

// 设置状态栏
await StatusBar.setStyle({ style: Style.Dark })
await StatusBar.setBackgroundColor({ color: '#1a1a2e' })

// 设置导航栏
await NavigationBar.setBackgroundColor({ color: '#1a1a2e' })
```

### 阶段五：构建与发布（1-2天）

#### 1. 配置 capacitor.config.json

```json
{
  "appId": "com.avgllm.app",
  "appName": "AVG LLM",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  },
  "android": {
    "backgroundColor": "#1a1a2e",
    "allowMixedContent": true
  },
  "plugins": {
    "Filesystem": {
      "directory": "DOCUMENTS"
    }
  }
}
```

#### 2. 构建流程

```bash
# 构建 Vue 项目
npm run build

# 同步到安卓
npx cap sync android

# 打开 Android Studio
npx cap open android

# 或直接构建 APK
cd android
./gradlew assembleDebug
```

#### 3. 签名发布

```bash
# 生成签名密钥
keytool -genkey -v -keystore avgllm.keystore \
  -alias avgllm \
  -keyalg RSA -keysize 2048 -validity 10000

# 构建 release APK
cd android
./gradlew assembleRelease
```

---

## 四、目录结构变化

```
avg_llm/
├── android/                    # 新增：安卓原生项目
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/
│   │   │   ├── res/
│   │   │   └── AndroidManifest.xml
│   │   └── build.gradle
│   └── ...
├── electron/                   # 保留：桌面端代码
├── src/
│   ├── storage/               # 新增：存储抽象层
│   │   └── index.js
│   ├── utils/
│   │   └── platform.js        # 新增：平台检测
│   └── ...
├── capacitor.config.json      # 新增：Capacitor 配置
└── package.json
```

---

## 五、风险与注意事项

### 5.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 文件系统权限 | 存档可能无法保存 | 使用 Documents 目录，运行时请求权限 |
| API 跨域问题 | LLM 调用失败 | 配置 androidScheme: https |
| 性能差异 | 低端设备卡顿 | 优化渲染，减少动画 |
| 存储容量限制 | 存档过多时失败 | 实现存档清理功能 |

### 5.2 兼容性处理

```javascript
// 保持 Electron 桌面端兼容
if (platform.isElectron()) {
  // 使用 Electron IPC
} else if (platform.isAndroid()) {
  // 使用 Capacitor API
} else {
  // Web 降级方案
}
```

### 5.3 测试清单

- [ ] 存档/读档功能
- [ ] 世界书编辑保存
- [ ] API 配置保存
- [ ] 主题切换
- [ ] 音乐播放
- [ ] 插件加载
- [ ] 横竖屏切换
- [ ] 低内存恢复
- [ ] 后台切换恢复

---

## 六、时间估算

| 阶段 | 工作量 | 时间 |
|------|--------|------|
| 项目初始化 | 低 | 1-2 天 |
| 存储层重构 | 中 | 2-3 天 |
| Electron 依赖移除 | 中 | 1-2 天 |
| UI 适配 | 中 | 2-3 天 |
| 构建发布 | 低 | 1-2 天 |
| 测试调试 | 高 | 2-3 天 |
| **总计** | | **9-15 天** |

---

## 七、替代方案对比

### 方案 B：PWA（渐进式 Web 应用）

**优点**：
- 改动最小，几乎无需修改代码
- 可通过浏览器添加到主屏幕
- 支持离线使用

**缺点**：
- 文件系统访问受限
- 无法发布到应用商店
- 存储空间有限

**适用场景**：快速验证，不需要应用商店发布

### 方案 C：React Native 重写

**优点**：
- 原生性能最佳
- 可充分利用安卓特性

**缺点**：
- 需要完全重写前端代码
- 开发成本极高
- 维护两套代码

**适用场景**：长期规划，需要极致性能

---

## 八、推荐实施路径

```

---

## 九、Android UI 开发注意事项

### 9.1 常见问题及原因

#### 问题 1：文字被挤压/溢出显示范围

**现象**：
- 对话框标题文字被垂直挤压，显示不完整
- 标签页文字超出显示范围，看不见
- 关闭按钮变形

**原因**：
1. **CSS选择器不匹配**：Vue模板使用的class与CSS选择器不一致，导致Android专用样式未生效
   - 错误示例：`:class="{ 'is-android': isAndroidPlatform }"` 但CSS使用 `.platform-android.android-portrait`
   - 正确示例：`:class="{ 'platform-android': isAndroidPlatform, 'android-portrait': isAndroidPlatform }"`

2. **缺少flex布局约束**：
   - 父容器没有设置 `display: flex` 和正确的 `flex-direction`
   - 子元素没有设置 `flex-shrink: 0` 防止被压缩
   - 没有设置 `min-width: 0` 允许flex子元素正确收缩

3. **文字溢出处理缺失**：
   - 没有设置 `white-space: nowrap` 防止换行
   - 没有设置 `overflow: hidden` 和 `text-overflow: ellipsis` 处理溢出

#### 问题 2：按钮变形/文字截断

**现象**：
- 按钮文字被截断
- 按钮高度不一致
- 按钮超出容器宽度

**原因**：
1. **没有固定按钮尺寸**：Android端需要明确设置按钮的 `min-height` 和 `height`
2. **缺少box-sizing**：没有设置 `box-sizing: border-box` 导致padding计算错误
3. **没有white-space处理**：长文字导致按钮宽度超出

### 9.2 解决方案

#### 方案 1：修复CSS选择器匹配

```vue
<!-- Vue模板 -->
<main class="save-load-screen" :class="{ 'platform-android': isAndroidPlatform, 'android-portrait': isAndroidPlatform }">
```

```css
/* CSS选择器 */
.platform-android.android-portrait .screen-header {
  /* Android竖屏专用样式 */
}
```

#### 方案 2：使用!important强制覆盖

Android竖屏专用样式需要添加 `!important` 确保覆盖默认样式：

```css
.platform-android.android-portrait .dialog-header {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  overflow: hidden !important;
}

.platform-android.android-portrait .dialog-title {
  flex: 1 !important;
  min-width: 0 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.platform-android.android-portrait .dialog-close {
  flex-shrink: 0 !important;
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
}
```

#### 方案 3：按钮样式规范

```css
.platform-android.android-portrait .dialog-btn {
  min-height: 48px !important;
  height: 48px !important;
  padding: 10px 8px !important;
  font-size: 0.85rem !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  width: 100% !important;
  box-sizing: border-box !important;
}
```

### 9.3 Android UI 开发检查清单

- [ ] **CSS选择器匹配**：确保Vue模板的class与CSS选择器一致
- [ ] **flex布局约束**：
  - 父容器设置 `display: flex` 和正确的 `flex-direction`
  - 固定尺寸的元素设置 `flex-shrink: 0`
  - 需要收缩的元素设置 `min-width: 0` 或 `min-height: 0`
- [ ] **文字溢出处理**：
  - 单行文字：`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`
  - 多行文字：`display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical`
- [ ] **按钮尺寸固定**：设置 `min-height`、`height`、`width: 100%`
- [ ] **box-sizing**：所有元素设置 `box-sizing: border-box`
- [ ] **使用!important**：Android竖屏专用样式添加 `!important` 确保覆盖
- [ ] **视口单位**：使用 `dvh` 代替 `vh` 适配移动端
- [ ] **安全区域**：使用 `env(safe-area-inset-bottom)` 适配刘海屏

### 9.4 调试技巧

1. **使用Chrome DevTools远程调试**：
   ```
   chrome://inspect
   ```

2. **检查CSS选择器是否生效**：
   - 在DevTools中检查元素，查看应用的样式
   - 确认 `.platform-android.android-portrait` 选择器是否匹配

3. **临时添加边框调试布局**：
   ```css
   .debug * { outline: 1px solid red; }
   ```
第一步：PWA 验证（1天）
    ↓
验证核心功能可用
    ↓
第二步：Capacitor 移植（2周）
    ↓
安卓应用发布
    ↓
第三步：持续优化
```

建议先实现 PWA 版本验证移动端适配，确认无问题后再进行完整的 Capacitor 移植。