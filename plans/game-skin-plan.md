# 小游戏皮肤系统 方案

## Context

目前各个小游戏（扭蛋机、老虎机、弹珠机、赛狗、厨房）都是固定的视觉风格，用户没有动力持续消费金币。新增皮肤系统可以让用户用金币购买个性化外观，让金币流通起来。

## 核心设计思路

**不做复杂的自定义皮肤系统**，而是做"游戏主题包"——每个小游戏有 2-3 套可选主题，用金币购买，购买后可切换。

## 皮肤定义

### 1. 老虎机 SlotMachine（3套主题）

| 主题 | 价格 | 变化内容 |
|---|---|---|
| 🌸 樱花风（默认） | 免费 | 当前样式，紫色+金色配色 |
| 🔮 赛博朋克 | 800💰 | 深蓝色机身+霓虹粉/青配色+LED风格灯光 |
| 🎴 和风妖怪 | 1200💰 | 红色鸟居机身+金色装饰灯+妖怪主题符号替换 |

### 2. 扭蛋机 Gacha（3套主题）

| 主题 | 价格 | 变化内容 |
|---|---|---|
| 🎪 经典风（默认） | 免费 | 当前样式，紫色+金色 |
| 🏰 魔法城堡 | 800💰 | 城堡塔楼机身+水晶球胶囊+蓝色调 |
| 🍄 蘑菇小屋 | 1200💰 | 蘑菇形机身+棕色/绿色调+可爱风 |

### 3. 弹珠机 Pachinko（3套主题）

| 主题 | 价格 | 变化内容 |
|---|---|---|
| 🌙 经典风（默认） | 免费 | 当前样式，深蓝+金色 |
| 🌌 星空宇宙 | 800💰 | 黑色背景+白色钉子+紫色弹珠+星空格子 |
| 🎪 马戏团 | 1200💰 | 红白条纹背景+彩色钉子+彩色弹珠+小丑格子 |

### 4. 赛狗 DogRace（3套主题）

| 主题 | 价格 | 变化内容 |
|---|---|---|
| 🌿 草地风（默认） | 免费 | 当前样式，绿色草地 |
| 🏜️ 沙漠 | 800💰 | 沙色跑道+棕色背景 |
| ❄️ 雪地 | 1200💰 | 白色跑道+蓝色背景+雪花效果 |

### 5. 厨房 Kitchen（3套主题）

| 主题 | 价格 | 变化内容 |
|---|---|---|
| 🍳 经典风（默认） | 免费 | 当前样式，暖棕色 |
| 🏠 日式食堂 | 800💰 | 木质色调+暖光+日式格子装饰 |
| 🏖️ 海边餐厅 | 1200💰 | 蓝色海洋风+白色+贝壳装饰 |

## 技术方案

### 皮肤数据结构

```js
// 每个游戏的皮肤定义
const GAME_SKINS = {
  slotMachine: [
    { id: 'slot_classic', name: '🌸 樱花风', price: 0, theme: { bodyBg: '...', borderColor: '...', lightColor: '#ffd700', cellBg: '...', buttonBg: '...' }},
    { id: 'slot_cyber', name: '🔮 赛博朋克', price: 800, theme: { bodyBg: '...', borderColor: '...', lightColor: '#ff0080', cellBg: '...', buttonBg: '...' }},
    { id: 'slot_waifu', name: '🎴 和风妖怪', price: 1200, theme: { bodyBg: '...', borderColor: '...', lightColor: '#ff4444', cellBg: '...', buttonBg: '...' }},
  ],
  gacha: [ ... ],
  pachinko: [ ... ],
  dogRace: [ ... ],
  kitchen: [ ... ],
}
```

### 皮肤选择器 UI

每个游戏页面 Header 区域新增一个 **"🎨 主题"** 按钮，点击弹出底部面板：

```
┌──────────────────────────────┐
│ ←  🎪 扭蛋机       💰 1280 🎨│ ← Header 新增主题按钮
├──────────────────────────────┤
│ 选择主题：                    │ ← 底部弹出面板
│ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │🌸当前│ │🔮800│ │🏰1200│    │ ← 主题卡片网格
│ │已拥有│ │ 购买 │ │ 购买 │    │
│ └─────┘ └─────┘ └─────┘    │
└──────────────────────────────┘
```

### 持久化

```js
// localStorage key: avg_llm_game_skins_v1
{
  slotMachine: { owned: ['slot_classic'], active: 'slot_classic' },
  gacha: { owned: ['gacha_classic'], active: 'gacha_classic' },
  pachinko: { owned: ['pachinko_classic'], active: 'pitchinko_classic' },
  dogRace: { owned: ['dograce_classic'], active: 'dograce_classic' },
  kitchen: { owned: ['kitchen_classic'], active: 'kitchen_classic' },
}
```

### 皮肤应用方式

每个游戏通过 CSS 变量或动态 class 应用主题。以 SlotMachine 为例：

```vue
<script setup>
const { activeSkin, selectSkin, ownedSkins, buySkin } = useGameSkin('slotMachine')
</script>

<template>
  <div class="slot-machine" :class="`theme-${activeSkin.id}`">
    <!-- 内容不变，CSS 根据不同 theme class 切换 -->
  </div>
</template>

<style scoped>
.slot-machine {
  background: var(--skin-body-bg, linear-gradient(180deg, #2a1a3a, #1a0a2a));
  border-color: var(--skin-border, rgba(255, 215, 0, 0.3));
}
</style>
```

## 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `composables/useGameSkin.js` | 新增 | 皮肤选择 composable |
| `games/SlotMachineScreen.vue` | 修改 | 接入皮肤系统 |
| `games/GachaScreen.vue` | 修改 | 接入皮肤系统 |
| `games/PachinkoScreen.vue` | 修改 | 接入皮肤系统 |
| `DogRaceScreen.vue` | 修改 | 接入皮肤系统 |
| `games/KitchenScreen.vue` | 修改 | 接入皮肤系统 |

## 经济平衡

- 总共 5 个游戏 × (2 个付费皮肤) = 10 个付费皮肤
- 总价约：5×800 + 5×1200 = 10000💰
- 以扭蛋单抽 50💰 计算，需要约 200 抽才够买全部皮肤
- 皮肤只改变外观不影响数值，不会破坏经济平衡

## 验证

1. 打开任意小游戏，点击主题按钮应弹出选择器
2. 未拥有的皮肤显示购买按钮，点击后扣除金币并拥有
3. 已拥有的皮肤显示"使用中"/"切换"按钮
4. 切换皮肤后游戏外观立即变化
5. 关闭游戏再打开，皮肤状态保留
