# 世界主界面（World Hub）重构方案

## 1. 概述

移除当前 StartScreen（L0），将 App 启动直接指向 **世界主界面（WorldHubScreen）**。所有原 StartScreen 的功能（新游戏、存档、设置、插件管理等）全部收敛到 WorldHubScreen 的按钮体系中。核心原则：**不删除任何现有功能，只做位置调整 + 数据作用域重构**。

## 2. 导航架构

### 2.1 App 启动流程

```
App 启动 → currentScreen = 'world-hub'（默认）
              ↓
    ┌─────────────────────────────────────────────┐
    │  [头像框] 用户名              💰5000 💎100 ⚙️ │
    │                                              │
    │              [全屏背景图]                      │
    │                                              │
    │   📱手机      🎮游戏厅     📋任务             │
    │   🛏️寝室      🛒商店       📅签到             │
    │   🎲TRPG      📮信箱                          │
    │                                              │
    │   ┌────────────────────────────────────┐    │
    │   │        📖  主 线（大按钮）           │    │
    │   └────────────────────────────────────┘    │
    │   🌐世界书  🃏卡牌  🗡️冒险                  │
    │   🎙️叙事者  🔌插件                          │
    └─────────────────────────────────────────────┘
```

### 2.2 按钮完整映射

| 按钮 | 原所在 | 新位置 | 打开方式 |
|------|--------|--------|----------|
| **📖 主线** | 新游戏按钮 | 底部大按钮 | 主线入口界面 → 世界书选择 → 角色选择 → GameScreen |
| **🛏️ 寝室** | StartScreen 菜单 | 左侧区域 | 寝室选择（含面对面按钮） → 角色网格 → CharacterRoomView |
| **📱 手机** | 无（新增） | 左侧区域 | 预留，可扩展为通讯/通知入口 |
| **🎮 游戏厅** | Dormitory 侧边栏 | 右侧区域 | GameCenterScreen |
| **🛒 商店** | Dormitory 内 | 右侧区域 | GlobalShopModal（弹出） |
| **🎲 TRPG** | Dormitory 侧边栏 | 左侧区域 | TRPGPanel（弹出） |
| **📋 任务** | Dormitory 内 | 右侧区域 | GlobalTaskBoard（弹出/面板） |
| **📅 签到** | Dormitory 侧边栏 | 右侧区域 | CheckIn7Screen / CheckInScreen |
| **📮 信箱** | Dormitory 侧边栏 | 右侧区域 | GlobalMailbox（面板） |
| **🌐 世界书** | StartScreen 菜单 | 底部小按钮 | WorldBook 编辑管理 |
| **🃏 卡牌收集** | StartScreen 菜单 | 底部小按钮 | CardCollectionScreen |
| **🗡️ 冒险游戏** | StartScreen 菜单 | 底部小按钮 | AdventureGameScreen |
| **🎙️ 叙事者** | StartScreen 菜单 | 底部小按钮 | NarratorManagerScreen |
| **🔌 插件管理** | StartScreen 菜单 | 底部小按钮 | PluginManagerScreen |
| **⚙️ 设置** | StartScreen 菜单 | 右上角 | SettingsScreen |
| **💾 存档/读档** | StartScreen 菜单 | 主线入口界面内 | 点击"📖 主线"后选择新游戏或继续存档 |
| **🤝 面对面** | StartScreen 菜单 | 寝室选择界面内（临时） | 寝室选择时附带面对面按钮，后期集成到寝室房间 |

### 2.3 屏幕层级

| 层级 | 屏幕 | 职责 |
|------|------|------|
| L0 | WorldHubScreen | 唯一主界面：所有功能的视觉入口 + 全局用户管理 |
| L1 | 各功能子屏幕 | 寝室、商店、任务、信箱、游戏厅、存档、设置等 |
| L2 | 角色房间/游戏 | CharacterRoomView、GameScreen、各游戏 Screen |

**不再有 StartScreen**。App.vue 的 `currentScreen` 初始值从 `'start'` 改为 `'world-hub'`。

## 3. 数据模型重构

### 3.1 核心范式

从"世界书是数据边界"改为"世界书是剧情滤镜"：
- **角色永远绑定世界书**：A世界书的 Baba 和 B世界书的 Baba 是不同的人
- **用户身份分层**：全局用户是父节点，世界书 User 设定是覆写层
- **经济/背包全局化**：用户资源是统一的，不被世界书限制

### 3.2 存储结构

#### 新增：全局用户身份

```js
// 存储 key: 'avg_llm_global_user_v1'
{
  username: "yufeng",              // 全局用户名
  avatar: "default",               // 全局头像
  avatarFrame: "gold_frame",       // 全局头像框
  economy: { coins: 5000, crystals: 100 },
  inventory: [
    { id: 'avatar_frame_gold', name: '金色头像框', quantity: 1, scope: 'global', ... },
    { id: 'gift_chocolate', name: '巧克力', quantity: 5, scope: 'global', ... },
  ],
  mailbox: [
    { id: 'msg_001', to: 'char_baba', bookId: 'book_a', content: '...', sentAt: 1234567890, ... },
    { id: 'msg_002', to: 'char_xiaohong', bookId: 'book_b', content: '...', sentAt: 1234567891, ... },
  ],
  createdAt: 1744675200000,
}
```

#### 新增：世界书级数据

```js
// 存储 key: 'avg_llm_world_book_data_v1'
// 结构: { [bookId]: { ... } }
{
  'book_a': {
    userName: "林凡",              // 玩家在这个世界的名字
    userDescription: "大一新生...", // 玩家在这个世界的角色设定
    mainStory: { progress: 3, ... },
    tasks: [ ... ],               // 任务板（随机刷新时可能关联这个世界）
    plotItems: [                  // 剧情道具（仅限该书使用）
      { id: 'plot_key_a01', name: 'A世界的钥匙', quantity: 1, scope: 'book' },
    ],
  },
  'book_b': {
    userName: "林同学",
    userDescription: "转学生...",
    mainStory: { progress: 1, ... },
    tasks: [ ... ],
    plotItems: [ ... ],
  },
}
```

#### 保持：角色数据（绑定世界书+角色）

```js
// 存储 key: 'avg_llm_dormitory_runtime_v1'（不改）
// 结构: { [bookId::charId]: { ... } }
{
  'book_a::char_baba': {
    affection: 65,
    energy: 80,
    mood: "happy",
    chatHistory: [...],
    journal: [...],
    diaries: [...],
    sceneData: {...},
  },
  'book_b::char_baba': {          // 完全不同的 Baba
    affection: 20,
    energy: 90,
    mood: "neutral",
    chatHistory: [...],
    journal: [...],
    diaries: [...],
    sceneData: {...},
  },
}
```

### 3.3 数据作用域总表

| 系统 | 作用域 | 存储 key | 变更 |
|------|--------|----------|------|
| 全局用户身份 | 全局 | `avg_llm_global_user_v1` | **新增** |
| 金币/钻石 | 全局 | 从 economy 移入 global_user | **迁移** |
| 背包（通用物品） | 全局 | 从 inventory 移入 global_user | **迁移** |
| 剧情道具 | per-book | `avg_llm_world_book_data_v1[bookId].plotItems` | **新增** |
| 角色数据 | book+char | `avg_llm_dormitory_runtime_v1[bookId::charId]` | **不变** |
| 用户身份覆写 | per-book | `avg_llm_world_book_data_v1[bookId].userName` | **新增** |
| 任务板 | per-book（随机刷新） | `avg_llm_world_book_data_v1[bookId].tasks` | **改刷新逻辑** |
| 商店 | 全局 | 新增全局商店存储 | **新增** |
| 信箱 | 全局 cross-book | 从 mailbox 移入 global_user | **迁移** |
| 红包 | 全局 | `avg_llm_dormitory_red_packets_v1` | **不变** |
| 漂流瓶 | 全局 | `avg_llm_dormitory_drift_bottle_pool_v1` | **不变** |
| 签到 | 全局 | `avg_llm_dormitory_checkin_7day_v1` | **改 hardcode** |
| 小游戏 | 全局 | 各自独立存储 | **不变** |
| 头像框/头像 | 全局 | `dormitory:avatarFrames`, `dormitory:avatars` | **不变** |

## 4. 用户身份系统

### 4.1 身份合成逻辑

```
┌──────────────────────────────────┐
│ Global User (父节点)              │
│   username: "yufeng"             │
│   avatar: "default"              │
│   economy, inventory, ...        │
│                                  │
│   └── 进入世界书 A                │
│       覆写层:                     │
│         userName: "林凡"          │
│         userDescription: "..."   │
│       ↓                          │
│       有效身份 = { ...global,     │
│         name: "林凡",             │
│         description: "..." }      │
│                                  │
│   └── 进入世界书 B                │
│       覆写层:                     │
│         userName: "林同学"        │
│         userDescription: "..."   │
│       ↓                          │
│       有效身份 = { ...global,     │
│         name: "林同学",           │
│         description: "..." }      │
└──────────────────────────────────┘
```

### 4.2 LLM 交互时的身份使用

```js
// 当角色与玩家对话时
const globalUser = loadGlobalUser()
const bookData = loadBookData(activeBookId)

const effectiveUserForLLM = {
  ...globalUser,
  name: bookData?.userName || globalUser.username,  // 覆写
  description: bookData?.userDescription || '',     // 覆写
}

// LLM prompt 示例
`你是《${book.title}》里的${character.name}。
玩家的名字是"${effectiveUserForLLM.name}"。
${effectiveUserForLLM.description ? `玩家设定：${effectiveUserForLLM.description}` : ''}
...`
```

### 4.3 世界书 User 设定编辑

- 在主线选择世界书时，如果该书还没有 user 设定，提供默认值
- 在 WorldHubScreen 的"主线"入口，可以对已选世界书的 user 设定进行编辑
- 编辑内容：name、description、及其他角色卡属性

## 5. 商店系统

### 5.1 商店改为全局

```
WorldHubScreen → 点击"商店" → 弹出全局商店面板
  ├── 顶部显示：💰 全局金币  💎 全局钻石
  ├── 分类标签：[全部] [头像框] [家具] [礼物] [道具] [剧情专属]
  └── 商品网格：通用商品 + 随机世界书剧情道具混排
```

### 5.2 商品 scope 设计

每个商品增加 `scope` 字段：

```js
{
  // 全局商品
  { id: 'avatar_frame_gold', name: '金色头像框', icon: '✨', price: 100, scope: 'global', category: 'avatar_frame' },
  { id: 'gift_chocolate', name: '巧克力', icon: '🍫', price: 20, scope: 'global', category: 'gift' },
  { id: 'furniture_lamp', name: '台灯', icon: '💡', price: 50, scope: 'global', category: 'furniture' },

  // 剧情道具（专属某个世界书）
  { id: 'plot_key_a01', name: 'A世界的钥匙', icon: '🔑', price: 50, scope: 'book', bookId: 'book_a', category: 'plot_item' },
}
```

### 5.3 商店刷新逻辑

- **通用商品**：每次刷新都从全局商品池中随机选取
- **剧情道具**：随机选一个世界书，从该世界书的道具池中抽 1-2 个出来展示
- 剧情道具标注："《XXX世界书》专属道具"
- 购买时，全局物品进 `globalUser.inventory`，剧情道具进 `bookData.plotItems`

## 6. 任务系统

### 6.1 任务刷新逻辑

```js
// 当前：只刷新 activeWorldBookId 的任务
// 改成：随机选一个世界书，生成该世界书上下文的任务

const allBooks = await loadWorldBooks()
const randomBook = allBooks[Math.floor(Math.random() * allBooks.length)]
const tasks = generateTasksForBook(randomBook)
// 任务显示时标注来源："[《XXX世界书》] 完成某个事件"
```

### 6.2 任务板体验

- 任务板中可能同时存在来自不同世界书的任务
- 每个任务标注来源世界书
- 完成任务的奖励存入全局经济

## 7. 寝室交互重构

### 7.1 从"角色滑动"改为"寝室滑动"

```
当前：
[世界书卡片] → 点击"进入寝室" → [角色左右滑动] → 点击角色 → [角色房间]

改成：
[寝室选择界面（含面对面临时入口）] → 进入寝室滑动 → [角色网格列表] → 点击角色 → [角色房间]
```

### 7.2 寝室选择界面

```
┌──────────────────────────────────┐
│  ← 返回主界面                     │
│                                  │
│         🛏️ 选择寝室               │
│                                  │
│  ┌────────────────────────────┐ │
│  │                            │ │
│  │  [书B] [🏠书A] [书C]       │ │  ← 左右滑动切换世界书寝室
│  │                            │ │
│  │  点击任一寝室进入            │ │
│  └────────────────────────────┘ │
│                                  │
│  ┌────────────────────────────┐ │
│  │  🤝 面对面（临时入口）       │ │  ← 临时放置，后期集成到寝室房间
│  │                            │ │
│  │  点击进入面对面功能          │ │
│  └────────────────────────────┘ │
└──────────────────────────────────┘
```

- **面对面按钮**：临时放在寝室选择界面底部，作为过渡方案
- 后期规划：面对面功能集成到寝室房间内部（如角色房间里的互动功能之一）

### 7.3 进入寝室后的角色网格

```
┌──────────────────────────────────┐
│  ← 返回寝室选择    《XXX世界书》   │
│                                  │
│  ┌────────────────────────────┐ │
│  │  👤 Baba    👤 小红         │ │  ← 该世界的角色网格
│  │  👤 小明                   │ │
│  │                            │ │
│  │  点击角色进入房间            │ │
│  └────────────────────────────┘ │
└──────────────────────────────────┘
```

### 7.3 角色数据独立性

- 角色数据存储在 `bookId::charId` key 下
- 即使两个世界书有同名角色（如都叫 Baba），数据也是独立的
- 好感度、聊天记录、日记等都不跨世界书

## 8. 信箱系统

### 8.1 改为全局跨世界

```
WorldHubScreen → 点击"信箱" → 全局信箱
  ├── 收件人选择：先选世界书，再选角色
  │     [世界书A ▼] → [Baba, 小红, ...]
  │     [世界书B ▼] → [小明, ...]
  └── 写信内容输入
```

### 8.2 LLM 解析

```
系统提示词 = "你是《XXX世界书》里的{角色名}。
              玩家的名字是'{该世界书的userName}'。"
+ 玩家发送的信件内容
→ LLM 以该角色在该世界书的语境下回信
```

## 9. 签到系统

- 7日签到和日历签到从 `hardcoded 'default'` 改为全局
- 签到奖励存入全局经济
- 签到记录存储 key 保持不变，但不再按 worldBookId 分片

## 10. 主线（新游戏/存档）流程

### 10.1 主线入口界面

```
WorldHubScreen → 点击"📖 主线"
  ↓
┌──────────────────────────────────┐
│  ← 返回主界面                     │
│                                  │
│         📖 主线剧情               │
│                                  │
│  ┌────────────────────────────┐ │
│  │                            │ │
│  │      🆕 新游戏              │ │  ← 大按钮：新游戏
│  │                            │ │
│  └────────────────────────────┘ │
│                                  │
│  ┌────────────────────────────┐ │
│  │      💾 存档/读档            │ │  ← 大按钮：存档列表
│  │                            │ │
│  │  [存档1] 世界A - 第3章      │ │
│  │  [存档2] 世界B - 第1章      │ │
│  │  [空存档]                   │ │
│  └────────────────────────────┘ │
└──────────────────────────────────┘
```

### 10.2 新游戏流程

```
点击"🆕 新游戏"
  ↓
世界书选择对话框
  ├── 展示所有世界书卡片
  ├── 可点击编辑 User 设定（name/description）
  └── 点击确认后进入角色选择
  ↓
角色选择（该世界书下的角色列表）
  ↓
GameScreen（开始游戏/主线剧情）
```

### 10.3 存档/读档流程

```
点击"💾 存档/读档"
  ↓
存档列表（按世界书+时间排序）
  ├── 点击存档 → 加载该存档 → GameScreen
  ├── 点击删除 → 删除该存档
  └── 返回 → 回到主线入口界面
```

- 存档与剧情（世界书）相关，所以放在主线流程内部
- 存档列表按世界书分组显示，方便识别

## 11. 需要新建/修改的文件

### 11.1 新建文件

| 文件 | 用途 |
|------|------|
| `src/screens/WorldHubScreen.vue` | 世界主界面（替代 StartScreen 成为唯一主界面） |
| `src/screens/WorldHubScreen.css` | 世界主界面样式 |
| `plugins/feature-dormitory/src/composables/useGlobalUser.js` | 全局用户身份管理 |
| `plugins/feature-dormitory/src/composables/useBookData.js` | 世界书数据管理（userName等） |
| `plugins/feature-dormitory/src/components/NestSelectorView.vue` | 寝室选择视图（滑动切换+面对面按钮） |
| `plugins/feature-dormitory/src/components/MainStoryEntry.vue` | 主线入口界面（新游戏/存档选择） |
| `plugins/feature-dormitory/src/components/GlobalShopModal.vue` | 全局商店面板 |
| `plugins/feature-dormitory/src/components/GlobalTaskBoard.vue` | 全局任务板（随机刷新） |
| `plugins/feature-dormitory/src/components/GlobalMailbox.vue` | 全局信箱 |
| `plugins/feature-dormitory/src/components/CharacterSelectView.vue` | 角色选择视图（网格列表） |
| `plugins/feature-dormitory/src/composables/useEffectiveUser.js` | 身份合成 composable |

### 11.2 修改文件

| 文件 | 改动 |
|------|------|
| `src/screens/StartScreen.vue` | **废弃** — 不再使用，功能全部迁移到 WorldHubScreen |
| `src/App.vue` | `currentScreen` 默认值改为 `'world-hub'`，移除 `'start'` 分支 |
| `src/features/startMenuRegistry.js` | **废弃或重构** — 不再需要 start menu，改为 world-hub button registry |
| `src/features/localFeaturePluginManifests.js` | 新增 world-hub manifest |
| `src/features/localFeaturePluginEntries.js` | 新增 world-hub entry |
| `src/features/pluginScreenRegistry.js` | 移除 start screen 相关映射 |
| `plugins/feature-dormitory/src/DormitoryScreen.vue` | 入口改为从寝室选择进入，移除世界书卡片视图 |
| `plugins/feature-dormitory/src/DormitoryScreen.css` | 调整样式适配新流程 |
| `plugins/feature-dormitory/src/composables/useDormShop.js` | 改为全局商店逻辑 |
| `plugins/feature-dormitory/src/composables/useDormTask.js` | 改为随机世界书刷新 |
| `plugins/feature-dormitory/src/components/CharacterRoomView.vue` | LLM prompt 改用有效身份合成 |
| `plugins/feature-dormitory/src/components/WorldBookCardView.vue` | 可能简化或合并 |

### 11.3 数据迁移

在 App 首次加载时执行一次性迁移：

```js
// 从 per-book economy 合并为全局
const allEconomies = JSON.parse(localStorage.getItem(ECONOMY_KEY) || '{}')
let totalCoins = 0, totalCrystals = 0
for (const bookId of Object.keys(allEconomies)) {
  totalCoins += allEconomies[bookId]?.coins || 0
  totalCrystals += allEconomies[bookId]?.crystals || 0
}
globalUser.economy = { coins: totalCoins, crystals: totalCrystals }
localStorage.setItem(GLOBAL_USER_KEY, JSON.stringify(globalUser))

// 从 per-book inventory 合并为全局（标记 scope）
const allInventories = JSON.parse(localStorage.getItem(INVENTORY_KEY) || '{}')
const globalInventory = []
const perBookPlotItems = {}
for (const bookId of Object.keys(allInventories)) {
  for (const item of allInventories[bookId]) {
    if (item.category === 'plot_item' || item.bookId) {
      // 剧情道具保留分书
      if (!perBookPlotItems[bookId]) perBookPlotItems[bookId] = []
      perBookPlotItems[bookId].push({ ...item, scope: 'book' })
    } else {
      // 其他物品合并到全局，去重
      const existing = globalInventory.find(i => i.id === item.id)
      if (existing) {
        existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
      } else {
        globalInventory.push({ ...item, scope: 'global' })
      }
    }
  }
}
globalUser.inventory = globalInventory

// 标记迁移完成
localStorage.setItem(MIGRATION_FLAG_KEY, 'done')
```

## 12. 实现步骤（分阶段）

### Phase 1: 基础设施
1. 创建 `useGlobalUser.js` composable
2. 创建 `useBookData.js` composable
3. 创建 `useEffectiveUser.js` composable
4. 创建 `WorldHubScreen.vue` 基础框架（顶部状态栏+按钮网格）
5. 在 App.vue 注册 `'world-hub'` screen，设为默认

### Phase 2: 数据迁移
6. 实现经济合并迁移逻辑
7. 实现背包合并迁移逻辑
8. 验证数据完整性

### Phase 3: 核心 UI
9. 完善 WorldHubScreen 完整 UI（背景图+按钮布局+动画）
10. 实现 `MainStoryEntry.vue`（主线入口界面：新游戏/存档选择）
11. 实现 `NestSelectorView.vue`（寝室滑动选择+面对面按钮）
12. 实现 `CharacterSelectView.vue`（角色网格选择）

### Phase 4: 功能对接
12. 改造 DormitoryScreen：从寝室选择直接进入角色网格
13. 改造 CharacterRoomView：LLM prompt 使用有效身份合成
14. 实现 GlobalShopModal（全局商店+随机剧情道具）
15. 实现 GlobalTaskBoard（随机世界书刷新）
16. 实现 GlobalMailbox（跨世界通信）

### Phase 5: 迁移原有功能
17. 将原 StartScreen 的存档、世界书、卡牌、冒险、面对面、叙事者、插件管理接入 WorldHubScreen 底部按钮
18. 改造签到为全局
19. 废弃 StartScreen 及 startMenuRegistry

### Phase 6: 收尾
20. 全链路测试
21. 样式打磨
22. 清理废弃代码

## 13. 返回逻辑

```
App 启动 ────────────▶ WorldHubScreen（唯一主界面）
                             │
             ┌───────────────┼────────────────┐
             │               │                 │
             ▼               ▼                 ▼
           主线            寝室              其他功能
             │               │                 │
      主线入口界面      寝室选择界面         弹出Modal
      ┌─🆕新游戏        │(含面对面)          或子Screen
      │                  │
      │                  ▼
      │            角色网格
      └─💾存档/读档       │
                             ▼
                       CharacterRoomView
```

- WorldHubScreen 是 App 的根界面，不返回上一级
- 主线入口界面 → 新游戏 → 世界书选择 → 角色选择 → GameScreen → 逐层返回 → 主线入口 → WorldHubScreen
- 主线入口界面 → 存档/读档 → 选择存档 → GameScreen → 返回 → 存档列表 → 返回 → 主线入口
- 寝室选择界面（含面对面按钮） → 选择寝室 → 角色网格 → CharacterRoomView → 逐层返回 → 寝室选择 → WorldHubScreen
- 面对面 → FaceToFaceScreen → 返回 → 寝室选择界面
- Modal 类功能关闭 → 回到触发它的界面

## 14. 技术要点

### 14.1 App.vue 改造

```js
// 当前
const currentScreen = ref('start')

// 改为
const currentScreen = ref('world-hub')

// template 中：
// 移除 <StartScreen> 分支
// 新增 <WorldHubScreen> 分支
```

### 14.2 WorldHub 内部状态管理

```js
// WorldHubScreen 内部维护
const activeWorldBookId = ref('')    // 当前查看的世界书上下文
const globalUser = reactive({...})   // 全局用户数据（从 composable 加载）

// 各按钮点击事件直接调用对应功能
const handleMainStory = () => { ... }  // 世界书选择 → GameScreen
const handleDormitory = () => { ... }  // 进入寝室选择
const handleShop = () => { showShop.value = true }
// ...
```

### 14.3 身份合成 composable

```js
// useEffectiveUser.js
export function useEffectiveUser(bookId) {
  const globalUser = useGlobalUser()
  const bookData = useBookData(bookId)

  return computed(() => ({
    ...globalUser,
    name: bookData.value?.userName || globalUser.username,
    description: bookData.value?.userDescription || '',
  }))
}
```

### 14.4 背景图配置

- 每个世界书可配置一张主界面背景图
- 在 world book manifest 中新增 `hubBackground` 字段
- WorldHubScreen 根据 activeWorldBookId 切换背景
- 未配置时使用默认背景

### 14.5 按钮注册体系

考虑到后续扩展，WorldHubScreen 的按钮不建议硬编码，而是采用类似当前 startMenuRegistry 的动态注册机制：

```js
// worldHubRegistry.js
export const WORLD_HUB_BUTTONS = [
  { id: 'main-story', icon: '📖', label: '主线', position: 'bottom-primary', action: { type: 'main-story' } },
  { id: 'dormitory', icon: '🛏️', label: '寝室', position: 'left', action: { type: 'dormitory' } },
  { id: 'phone', icon: '📱', label: '手机', position: 'left', action: { type: 'phone' } },
  { id: 'game-center', icon: '🎮', label: '游戏厅', position: 'right', action: { type: 'screen', screen: 'game-center' } },
  // 底部管理按钮
  { id: 'worldbook', icon: '🌐', label: '世界书', position: 'bottom', action: { type: 'screen', screen: 'worldbook' } },
  { id: 'card-collection', icon: '🃏', label: '卡牌', position: 'bottom', action: { type: 'screen', screen: 'card-collection' } },
  { id: 'adventure', icon: '🗡️', label: '冒险', position: 'bottom', action: { type: 'screen', screen: 'adventure' } },
  { id: 'narrator', icon: '🎙️', label: '叙事者', position: 'bottom', action: { type: 'screen', screen: 'narrator' } },
  { id: 'plugin', icon: '🔌', label: '插件', position: 'bottom', action: { type: 'screen', screen: 'plugin' } },
]

// 注意：存档和面对面不在主界面按钮中
// 存档 → 主线入口界面内的"存档/读档"按钮
// 面对面 → 寝室选择界面底部的临时入口
```

## 15. 风险点

| 风险 | 应对 |
|------|------|
| 数据迁移丢失 | 迁移前做全量备份，迁移后校验 |
| 角色数据 key 变更 | 保持 `bookId::charId` 不变，不需要迁移 |
| 迁移后 per-book 数据残留 | 标记迁移完成后清理旧数据 |
| LLM prompt 身份混淆 | 严格使用 useEffectiveUser 合成，不直接传 global user |
| StartScreen 废弃后 plugin 依赖断裂 | 清理 startMenuRegistry 前确保所有 plugin 已适配 |
| WorldHubScreen 首次加载性能 | 懒加载各子组件（Modal 类延迟挂载） |
