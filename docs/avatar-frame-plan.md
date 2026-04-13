# 换头像框功能方案（修订版）

## 1. 需求概述

用户在寝室界面点击左上角的圆形用户头像后，进入头像框选择界面。用户可以选择已导入的头像框，也可以通过网格第一个的 `+` 按钮导入新的 PNG 头像框（外框有装饰，中间圆形透明区域用于显示头像）。头像框全局生效，不绑定特定世界书。

## 2. 现有代码分析

### 2.1 头像当前位置
- `DormitoryScreen.vue:3299-3301`：用户头像通过 `.user-avatar` 显示在 `.worldbook-top-bar` 中
- 当前样式（`DormitoryScreen.css:2791-2814`）：`48x48px`，`border-radius: 6px`（圆角矩形）
- 头像数据来自 `activeBook.userProfile.portraits`，取 `emotion === 'default'` 的肖像
- `userPortraitUrl` ref 存储 base64 data URL

### 2.2 头像框叠加方式
头像框 PNG 作为 `position: absolute` 覆盖层叠在头像 `<img>` 上方。头像容器 `.user-avatar` 改为圆形（`border-radius: 50%`），头像框 PNG 的中间圆形透明区域露出下方头像。

### 2.3 存储机制
- 使用 `localStorage` 持久化
- 头像框数据独立存储，key 为 `dormitory:avatarFrames`（不与现有存储混用）
- 单张 PNG 限制大小（≤ 2MB），总数不设上限

## 3. 技术方案

### 3.1 文件变更

**新增：**

| 文件 | 用途 |
|------|------|
| `src/components/AvatarFrameScreen.vue` | 头像框选择/管理全屏界面 |
| `src/composables/useAvatarFrame.js` | 头像框业务逻辑（加载、保存、选择、导入、删除） |

**修改：**

| 文件 | 改动 |
|------|------|
| `src/DormitoryScreen.vue` | 1. 引入 `AvatarFrameScreen` 和 `useAvatarFrame`<br>2. `.user-avatar` 改为圆形 + 添加点击事件<br>3. 头像叠加显示选中的头像框 PNG<br>4. `isAvatarFrameScreenOpen` ref 控制显隐 |
| `src/DormitoryScreen.css` | `.user-avatar` 的 `border-radius` 从 `6px` 改为 `50%` |

### 3.2 渲染路径

```
DormitoryScreen
  ├── .worldbook-top-bar
  │     └── .user-avatar (圆形, 点击触发打开头像框界面)
  │           ├── <img> 用户肖像
  │           └── <img> 头像框覆盖层 (v-if="activeFrameDataUrl")
  └── <AvatarFrameScreen> (v-if="isAvatarFrameScreenOpen")
```

与 `CharacterRoomView` 完全无关，不涉及它的任何逻辑。

### 3.3 数据结构

```javascript
// 单个头像框对象
{
  id: string,          // 'custom_1712345678' (时间戳后缀)
  name: string,        // 文件名去掉扩展名，如 '金色光环'
  dataUrl: string,     // PNG 的完整 base64 data URL
  createdAt: number,   // 导入时间戳 (Date.now())
}

// localStorage key: 'dormitory:avatarFrames'
{
  frames: [ /* 自定义头像框数组 */ ],
  activeFrameId: string | null,  // 当前选中的框 ID，null 表示不使用头像框
}
```

没有内置 CSS 头像框，所有头像框都是 PNG 文件。初始状态 `frames` 为空，`activeFrameId` 为 `null`。

### 3.4 头像框导入流程

1. 用户点击 `+` 格子 → 触发隐藏的 `<input type="file" accept=".png">`
2. 选择 PNG 文件
3. 校验：
   - 文件扩展名：仅 `.png`
   - 文件大小：≤ 2MB（超限时 alert 提示）
4. `FileReader.readAsDataURL()` 读取为 base64
5. 生成 `custom_{timestamp}` ID，名称取文件名（去扩展名）
6. 追加到 `frames` 数组，写入 localStorage
7. 自动选中新导入的头像框

### 3.5 UI 布局

```
┌─────────────────────────────────┐
│  ←  头像框选择                   │  ← 顶栏（返回 + 标题）
├─────────────────────────────────┤
│                                 │
│     ┌─────────────────┐         │
│     │                 │         │
│     │   圆形预览区域   │         │  ← 用户头像 + 当前选中框的叠加效果
│     │                 │         │
│     └─────────────────┘         │
│        [ 应用头像框 ]            │  ← 确认按钮
│                                 │
├─────────────────────────────────┤
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐      │  ← 头像框网格（可滚动）
│  │ + │ │框1│ │框2│ │框3│      │  ← 第一个是导入按钮
│  │导 │ └───┘ └───┘ └───┘      │
│  │入 │                        │
│  └───┘ ┌───┐ ┌───┐ ┌───┐      │
│        │框4│ │框5│ │框6│      │
│        └───┘ └───┘ └───┘      │
│                                 │
│     [ 编辑模式 ]                │  ← 底部编辑切换按钮
└─────────────────────────────────┘

编辑模式：
┌─────────────────────────────────┐
│  ←  头像框选择         [完成]    │  ← 顶栏出现完成按钮
├─────────────────────────────────┤
│  ... (预览区域不变)              │
├─────────────────────────────────┤
│  ┌───┐ ┌☑──┐ ┌☑──┐ ┌☑──┐      │  ← 每个格子左上角出现复选框
│  │ + │ │框1│ │框2│ │框3│      │  ← 导入按钮不可选中
│  │导 │ └───┘ └───┘ └───┘      │
│  │入 │                        │
│  └───┘ ┌☑──┐ ┌☑──┐ ┌☑──┐      │
│        │框4│ │框5│ │框6│      │
│        └───┘ └───┘ └───┘      │
│                                 │
│     [ 删除选中 (3) ]            │  ← 底部删除按钮，显示选中数量
└─────────────────────────────────┘
```

- **网格格子**：每个显示头像框 PNG 的缩略预览（圆形裁剪展示）
- **选中状态**：圆形边框高亮发光
- **`+` 导入按钮**：虚线边框圆形，与其他格子同尺寸，固定在第一个位置
- **编辑模式**：格子左上角显示复选标记（小圆圈），导入按钮不可勾选
- 删除选中后，若删除的框包含当前选中的框，则 `activeFrameId` 重置为 `null`

### 3.6 useAvatarFrame.js composable

```javascript
// src/composables/useAvatarFrame.js
import { ref, computed } from 'vue'

const STORAGE_KEY = 'dormitory:avatarFrames'
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

const frames = ref([])
const activeFrameId = ref(null)

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      frames.value = data.frames || []
      activeFrameId.value = data.activeFrameId || null
    }
  } catch (e) { /* ignore */ }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    frames: frames.value,
    activeFrameId: activeFrameId.value,
  }))
}

function selectFrame(id) {
  activeFrameId.value = id
  persist()
}

function importFrame(file) {
  return new Promise((resolve, reject) => {
    if (!file.name.toLowerCase().endsWith('.png')) {
      reject(new Error('仅支持 PNG 格式'))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error('文件大小不能超过 2MB'))
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const frame = {
        id: `custom_${Date.now()}`,
        name: file.name.replace(/\.png$/i, ''),
        dataUrl: e.target.result,
        createdAt: Date.now(),
      }
      frames.value.push(frame)
      activeFrameId.value = frame.id
      persist()
      resolve(frame)
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

function deleteFrame(ids) {
  frames.value = frames.value.filter(f => !ids.includes(f.id))
  if (ids.includes(activeFrameId.value)) {
    activeFrameId.value = null
    persist()
  }
}

const activeFrame = computed(() =>
  frames.value.find(f => f.id === activeFrameId.value) || null
)

// 模块加载时自动读取
load()

export function useAvatarFrame() {
  return { frames, activeFrameId, activeFrame, selectFrame, importFrame, deleteFrame }
}
```

### 3.7 DormitoryScreen.vue 改动详情

**1. 引入依赖：**
```javascript
import AvatarFrameScreen from './components/AvatarFrameScreen.vue'
import { useAvatarFrame } from './composables/useAvatarFrame'
```

**2. 初始化 composable：**
```javascript
const { activeFrame } = useAvatarFrame()
const isAvatarFrameScreenOpen = ref(false)
```

**3. 头像改为圆形 + 点击事件 + 叠加头像框：**
```html
<span class="user-avatar" @click="isAvatarFrameScreenOpen = true">
  <template v-if="userPortraitUrl">
    <img :src="userPortraitUrl" alt="用户头像" />
    <img
      v-if="activeFrame?.dataUrl"
      :src="activeFrame.dataUrl"
      class="avatar-frame-overlay"
      alt=""
    />
  </template>
  <span v-else class="user-avatar-placeholder">👤</span>
</span>
```

**4. 渲染 AvatarFrameScreen：**
```html
<AvatarFrameScreen
  v-if="isAvatarFrameScreenOpen"
  @close="isAvatarFrameScreenOpen = false"
/>
```

**5. CSS 改动（DormitoryScreen.css）：**
```css
/* 修改 .user-avatar */
.user-avatar {
  /* ... 保持现有属性 ... */
  border-radius: 50%;  /* 从 6px 改为 50% */
  cursor: pointer;     /* 新增：提示可点击 */
  position: relative;  /* 新增：作为覆盖层的定位参考 */
}

/* 新增：头像框覆盖层 */
.avatar-frame-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
```

### 3.8 AvatarFrameScreen.vue 结构要点

- 全屏 fixed 覆盖（`z-index: 10001`，高于拍立得的 10000）
- `defineEmits(['close'])` 通知父组件关闭
- 复用 `useAvatarFrame()` composable（同一模块实例，数据共享）
- 文件导入：隐藏 `<input type="file" accept=".png">` + `+` 格子触发 click
- 网格滚动区域 `overflow-y: auto`
- 编辑模式：`ref(false)` 切换，复选状态用 `Set` 管理
- 导入/删除时自动更新 UI（响应式）

## 4. 开发步骤

1. 创建 `src/composables/useAvatarFrame.js` — 数据模型、持久化、CRUD
2. 创建 `src/components/AvatarFrameScreen.vue` — 全屏界面（预览、网格、导入、编辑删除）
3. 修改 `src/DormitoryScreen.vue` — 引入新组件和 composable，头像改为圆形 + 点击 + 叠加头像框
4. 修改 `src/DormitoryScreen.css` — `.user-avatar` 改为圆形，新增 `.avatar-frame-overlay` 样式
5. 测试：导入 PNG → 选择 → 返回看效果 → 编辑 → 批量删除 → 持久化恢复
