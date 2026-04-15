# feature-game 拆分方案

## 背景

`feature-dormitory` 目前包含 86 个文件，其中 worldhub 游戏厅相关代码（9 个游戏 + 游戏中心 + 皮肤系统）被错误地堆积在寝室插件下。本方案将其拆分为独立的 `feature-game` 插件。

## 目标

- 将 worldhub 游戏厅代码移至 `feature-game` 新插件
- `feature-dormitory` 的 phone 子目录（手机模拟器及其内置游戏）保持不动
- 通过提升共享 composables 到 core，确保两插件零耦合
- Toast.vue 仅归属 feature-game；dormitory 中用到它的组件用 window.alert 替代

## 拆分范围

### 移至 feature-game 的文件（13个）

| 源路径 | 目标路径 | 说明 |
|--------|----------|------|
| `feature-dormitory/src/GameCenterScreen.vue` | `feature-game/src/GameCenterScreen.vue` | 游戏厅选择中心 |
| `feature-dormitory/src/FarmScreen.vue` | `feature-game/src/FarmScreen.vue` | 农场游戏 |
| `feature-dormitory/src/DogRaceScreen.vue` | `feature-game/src/DogRaceScreen.vue` | 赛狗游戏 |
| `feature-dormitory/src/Toast.vue` | `feature-game/src/Toast.vue` | 游戏 Toast 提示 |
| `feature-dormitory/src/games/SlotMachineScreen.vue` | `feature-game/src/games/SlotMachineScreen.vue` | 老虎机 |
| `feature-dormitory/src/games/GachaScreen.vue` | `feature-game/src/games/GachaScreen.vue` | 扭蛋机 |
| `feature-dormitory/src/games/PachinkoScreen.vue` | `feature-game/src/games/PachinkoScreen.vue` | 弹珠台 |
| `feature-dormitory/src/games/KitchenScreen.vue` | `feature-game/src/games/KitchenScreen.vue` | 厨房 |
| `feature-dormitory/src/games/XylophoneScreen.vue` | `feature-game/src/games/XylophoneScreen.vue` | 木琴 |
| `feature-dormitory/src/games/HarmonicaScreen.vue` | `feature-game/src/games/HarmonicaScreen.vue` | 口琴 |
| `feature-dormitory/src/games/Match3Screen.vue` | `feature-game/src/games/Match3Screen.vue` | 三消 |
| `feature-dormitory/src/components/GameSkinSelector.vue` | `feature-game/src/components/GameSkinSelector.vue` | 皮肤选择器 |
| `feature-dormitory/src/composables/useGameSkin.js` | `feature-game/src/composables/useGameSkin.js` | 皮肤系统逻辑 |

## 步骤

### Step 1：提升共享 composables 到 core

将以下 3 个文件复制到 `src/composables/`：

| 源路径 | 目标路径 |
|--------|----------|
| `feature-dormitory/src/composables/useGlobalUser.js` | `src/composables/useGlobalUser.js` |
| `feature-dormitory/src/composables/useBookData.js` | `src/composables/useBookData.js` |
| `feature-dormitory/src/composables/useEffectiveUser.js` | `src/composables/useEffectiveUser.js` |

**更新所有引用路径**：

| 文件 | 旧路径 | 新路径 |
|------|--------|--------|
| `src/screens/WorldHubScreen.vue` | `../../plugins/feature-dormitory/src/composables/useGlobalUser.js` | `../composables/useGlobalUser.js` |
| `src/screens/WorldHubScreen.vue` | `../../plugins/feature-dormitory/src/composables/useAvatar.js` | `../../plugins/feature-dormitory/src/composables/useAvatar.js` (不动) |
| `src/screens/WorldHubScreen.vue` | `../../plugins/feature-dormitory/src/composables/useAvatarFrame.js` | `../../plugins/feature-dormitory/src/composables/useAvatarFrame.js` (不动) |
| `feature-dormitory/src/entry.js` | `./composables/useGlobalUser.js` | `../../../src/composables/useGlobalUser.js` |
| `feature-dormitory/src/TRPGScreen.vue` | `./composables/useGlobalUser.js` | `../../../src/composables/useGlobalUser.js` |
| `feature-dormitory/src/DormitoryScreen.vue` | `./composables/useGlobalUser.js` | `../../../src/composables/useGlobalUser.js` |
| `feature-dormitory/src/components/GlobalMailbox.vue` | `../composables/useGlobalUser.js` | `../../../../src/composables/useGlobalUser.js` |
| `feature-dormitory/src/components/NestSelectorView.vue` | `../composables/useGlobalUser.js` | `../../../../src/composables/useGlobalUser.js` |
| `feature-dormitory/src/phone/PhoneCallsApp.vue` | `../composables/useGlobalUser.js` | `../../../../src/composables/useGlobalUser.js` |
| `feature-dormitory/src/composables/useGlobalShop.js` | `./useGlobalUser.js` | `./useGlobalUser.js` (需改为 `../../../src/composables/useGlobalUser.js`，因 useGlobalUser 已搬走) |
| `feature-dormitory/src/composables/useGlobalTaskBoard.js` | `./useGlobalUser.js` | `../../../src/composables/useGlobalUser.js` |

**删除 dormitory 中的副本**：`useGlobalUser.js`、`useBookData.js`、`useEffectiveUser.js`（提升后不再需要）。

### Step 2：创建 feature-game 骨架

**`plugins/feature-game/plugin.json`**：
```json
{
  "id": "game",
  "name": "游戏厅",
  "description": "世界书游戏厅，包含老虎机、扭蛋机、弹珠台等游戏。",
  "version": "0.1.0",
  "apiVersion": 1,
  "runtime": "local",
  "menu": {
    "key": "game",
    "title": "游戏厅",
    "icon": "🎮",
    "order": 37,
    "variant": "tone-purple border-solid"
  },
  "entry": {
    "type": "route",
    "module": "./src/entry.js",
    "route": "game-center"
  },
  "storage": {
    "namespace": "game"
  },
  "capabilities": [
    "storage"
  ],
  "enabledByDefault": true
}
```

**`plugins/feature-game/src/entry.js`**：
- 注册 `game-center` 主路由
- 导入 `useGlobalUser`（从 core 路径）
- 处理所有游戏经济事件（spin-result, gacha-result, pachinko-result 等）
- 处理游戏皮肤购买（game-skin-buy）
- 处理厨房产出/消耗（kitchen-produce, kitchen-consume）

### Step 3：更新 DormitoryScreen.vue

- 移除 `import GameCenterScreen from './GameCenterScreen.vue'`
- 移除 `isGameCenterOpen` ref 及相关处理函数（handleLaunchGameCenter, handleGameCenterBack, handleGameCenterSpinResult 等）
- 移除模板中的 `<GameCenterScreen>` 渲染块
- 保留 dormitory 核心功能不变

### Step 4：更新 feature-dormitory 的 entry.js

- 移除 `import GameCenterScreen from './GameCenterScreen.vue'`
- 从 `resolveExtraRouteConfigs` 中移除 `game-center` 路由及其所有事件处理
- 移除游戏相关的 coin/inventory 处理函数（updateCoins, addToInventory 等仅被 game-center 使用的部分）

### Step 5：处理 dormitory 中 Toast.vue 的使用

CheckInScreen.vue 和 CheckIn7Screen.vue 使用了 Toast.vue，Toast 搬走后：
- 移除 `import Toast from './Toast.vue'`
- 将 `<Toast>` 组件替换为 `window.alert()` 调用（极简方案，无需新组件）
- 移除 Toast 相关的 ref/state 和 CSS transition

### Step 6：注册新插件

- `src/features/localFeaturePluginEntries.js`：添加 `import gameEntry from '../../plugins/feature-game/src/entry.js'` 和数组中注册
- `src/features/localFeaturePluginManifests.js`：添加 `import gameManifest from '../../plugins/feature-game/plugin.json'` 和数组中注册

### Step 7：验证

- 游戏厅入口（WorldHubScreen 的 "游戏厅" 按钮）正常
- 各游戏能正常进入/退出
- 游戏经济事件（金币增减）正常工作
- 游戏皮肤系统正常
- 签到功能（CheckInScreen/CheckIn7Screen）正常工作
- dormitory 核心功能不受影响

## 不变的部分

- `feature-dormitory/src/phone/` 完整保留（手机模拟器及其内置游戏）
- `useAvatar.js`、`useAvatarFrame.js` 保留在 dormitory
- 签到系统、邮箱、商店、任务板、战斗系统、TRPG 等保留在 dormitory
- App.vue 中的 `runMigration`、`GlobalMailbox`、`CheckInScreen`、`CheckIn7Screen`、`AvatarFrameScreen` 引用不变
