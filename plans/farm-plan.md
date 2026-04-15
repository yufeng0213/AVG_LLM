# 我的农场 方案

## 概述

在寝室侧边栏新增 🌾 农场按钮，点击后进入全屏农场页面。可以开垦土地、播种、浇水、收获，作物成熟后出售换金币或用于合成新物品。结合现有商店 `plant` 类别作为种子来源，"阳台温室"好感度活动可给农场加 Buff。

## 核心玩法

### 土地系统

- **初始 3×3 = 9 格土地**，其中 3 格已开垦，其余需要花费金币解锁
- 每格土地状态：`locked` → `idle`(空闲) → `planted`(已播种) → `growing`(生长中) → `ready`(可收获)
- 解锁新地块消耗金币递增：第4格 50 → 第5格 80 → 第6格 120 → 第7格 170 → 第8格 230 → 第9格 300
- 土地有"肥沃度"属性，初始普通(1.0)，浇水可缓慢提升(最高1.5)，肥沃度越高生长越快

### 种植系统

- **种子来源**：商店 `plant` 类别购买（复用现有物品）
- 每颗种子有不同的成熟时间和回报：

| 作物 | 种子价格 | 成熟时间 | 基础收获 | 稀有产物(概率) |
|---|---|---|---|---|
| 多肉 | 15💰 | 10min | 80💰 | 大株多肉 200💰 (10%) |
| 薄荷 | 20💰 | 20min | 160💰 | 薄荷精油 350💰 (10%) |
| 向日葵 | 25💰 | 40min | 300💰 | 向日葵种子×3 (15%) |
| 玫瑰 | 30💰 | 1.5h | 500💰 | 稀有玫瑰 800💰 (20%) |
| 幸运草 | 35💰 | 3h | 800💰 | 四叶草 1500💰 (5%) |
| 金苹果 | 50💰 | 5h | 1500💰 | 金苹果×3 5000💰 (10%) |

- 种植流程：点击"种植模式" → 选择背包中的种子 → 点击空地 → 种下
- 金苹果种子为特殊种子，通过扭蛋机 SSR 奖品获得

### 生长系统

- **实时倒计时**：每格土地显示生长进度条和剩余时间
- 生长阶段可视化：种子🌰 → 发芽🌱 → 小苗🌿 → 开花/成熟🌾（CSS 动画表现）
- **浇水机制**：点击生长中土地浇水，减少剩余时间 20%
- **离线进度**：记录 `plantedAt` 时间戳，切走后回来按经过时间自动计算生长进度（不丢失）
  - `elapsed = Date.now() - plantedAt`
  - `progress = Math.min(elapsed / adjustedGrowTime, 1.0)`

### 收获系统

- 成熟后土地发光提示，点击收获
- 收获奖励：基础金币 + 稀有产物概率 + 随机额外种子
- 收获通过 `addToWorldBookInventory` 存入背包，金币通过 `updateWorldBookEconomy` 更新
- 可"一键收获"所有成熟作物
- 5% 概率出现"变异金色作物"，价值 ×5

### 天气系统（仅在页面内运行）

- 三种天气：☀️ 晴天 / 🌧️ 雨天 / ☀️🔥 干旱
- **仅在 FarmScreen 可见时运行**：`onMounted` 启动天气定时器，`onUnmounted` 清除
- 每 2~5 分钟随机变化一次天气（不在此页面时天气冻结）
- 效果：
  - ☀️ 晴天：正常生长速度
  - 🌧️ 雨天：所有作物生长速度 +50%（自动浇水效果），持续期间每 30 秒 Toast 提示
  - ☀️🔥 干旱：生长速度 -30%，需要额外浇水
- 初始默认晴天
- 天气切换时弹 Toast 通知

### 趣味机制

- **连种加成**：相邻（上下左右）同种作物 ≥ 3 块，全部收获 +20%
- **丰收成就**：累计收获 10/50/100/500 次解锁称号（小农 → 农夫 → 农场主 → 农业大亨）
- **连续种植天数**：每天都登录农场种植，连续天数增长获得额外收获加成

### 经济循环

- 投入：买种子(15~50💰) + 解锁土地(50~300💰)
- 产出：收获出售(80~5000💰)，平均利润率约 150%~300%
- 收获物进入背包，可在商店界面出售或用于合成
- 高价值作物（稀有玫瑰、四叶草）可用于扭蛋机作为特殊道具

## 趣味机制汇总表

| 机制 | 触发条件 | 效果 |
|---|---|---|
| 金色作物 | 5% 收获概率 | 价值 ×5 |
| 连种加成 | 相邻同种 ≥3 格 | 全部收获 +20% |
| 雨天 | 天气随机 | 生长速度 +50% |
| 干旱 | 天气随机 | 生长速度 -30% |
| 阳台温室联动 | 好感度活动"浇花" | 今日农场生长 +10% |
| 连续种植 | 每天登录农场 | 每+1天 → 收获 +2%（上限 50%） |
| 丰收成就 | 累计收获次数 | 解锁称号 |

## 技术实现

### 文件结构

```
plugins/feature-dormitory/src/
├── games/
│   ├── SlotMachineScreen.vue
│   ├── GachaScreen.vue
│   └── PachinkoScreen.vue
├── FarmScreen.vue          ← 新增（全屏农场页面）
├── Toast.vue               ← 已有，收获/成就反馈复用
├── DormitoryScreen.vue     ← 修改：加农场按钮 + 挂载 FarmScreen
└── composables/
    └── useDormShop.js      ← 已有，农场复用其 economy/inventory 接口
```

### 技术要点

- 纯 Vue + CSS 实现，不依赖 Canvas（每个地块用 div + CSS 动画）
- `localStorage` 持久化：`avg_llm_farm_state_v1`
  - 保存：土地状态数组（每格：状态、作物类型、播种时间、肥沃度）
  - 保存：已解锁土地数量、收获统计、连续天数、上次访问时间
- 离线进度计算：`elapsed = Date.now() - lastVisitAt`，回来时批量推进所有作物进度
- 用 `setInterval` 每秒刷新 UI 倒计时
- 生长阶段用 CSS `@keyframes` + 动态 class 切换
- 天气定时器在 `onMounted` 启动、`onUnmounted` 清除（不影响性能）

### 与现有系统的接口

```javascript
// 经济更新（复用 useDormShop 暴露的工具函数）
updateWorldBookEconomy(bookId, (prev) => ({
  ...prev,
  coins: clampInt(prev.coins + reward - cost, 0, 9999, prev.coins),
}))

// 背包操作
addToWorldBookInventory(bookId, {
  id: `farm_${cropType}_${Date.now()}`,
  name: cropName,
  icon: cropIcon,
  type: 'farm_produce',
  rarity: rarity,
  quantity: 1,
})

// 读取背包中的种子
const seeds = inventory.filter(item => item.type === 'seed' || item.category === 'plant')
```

### 通信模式（与现有游戏一致）

```javascript
// Props
const props = defineProps({
  coins: { type: Number, default: 0 },
  inventory: { type: Array, default: () => [] },
})

// Emits
const emit = defineEmits(['back', 'farm-harvest'])

// 收获事件
emit('farm-harvest', { cost: 0, earned: reward })
```

### localStorage 存储结构

```javascript
{
  plots: [
    { index: 0, state: 'growing', crop: 'sunflower', plantedAt: 1712345678901, fertility: 1.0 },
    { index: 1, state: 'idle', crop: null, plantedAt: null, fertility: 1.1 },
    // ... 9 plots
  ],
  unlockedPlots: 3,
  totalHarvests: 128,
  consecutiveDays: 5,
  lastVisitAt: 1712345678901,
  weather: 'sunny', // sunny | rainy | drought
  achievements: ['harvest_10', 'harvest_50'],
}
```

## UI 布局

```
┌─────────────────────────────┐
│  ←  我的农场       💰 1280  │ ← header
├─────────────────────────────┤
│ ☀️ 晴天 | 连续种植: 5天 🔥   │ ← 天气栏
├─────────────────────────────┤
│  ┌───┬───┬───┐              │
│  │🌹 │🌻 │🌾 │  ← 3×3 土地  │ ← 土地网格
│  │███│██░│░░░│  (进度条)    │
│  ├───┼───┼───┤              │
│  │🌱 │🔒 │🔒 │              │
│  ├───┼───┼───┤              │
│  │💧 │🌿 │🔒 │              │
│  └───┴───┴───┘              │
├─────────────────────────────┤
│ [种植模式] [一键浇水]         │ ← 操作按钮
│ [一键收获] [解锁土地]          │
├─────────────────────────────┤
│ 📊 累计收获: 128 | 称号: 小农 │ ← 统计栏
└─────────────────────────────┘
```

## 交互流程

```
[打开农场] → 看到土地网格 + 当前天气 + 金币数
    │
    ├─→ [买种子] → 打开商店 plant 类别 → 背包获得种子
    │
    ├─→ [种植] → 点击"种植模式" → 选择背包中的种子 → 点击空地 → 种下
    │
    ├─→ [浇水] → 点击生长中土地 → 减少 20% 时间
    │
    ├─→ [收获] → 成熟土地发光 → 点击 → 获得金币+物品（Toast 提示）
    │
    └─→ [一键收获] → 所有成熟土地一次性收获 → 汇总 Toast
```

## 开发优先级

1. 基础框架：FarmScreen.vue 骨架 + DormitoryScreen 接入
2. 土地系统：3×3 网格 + 解锁逻辑 + 持久化
3. 种植系统：种子选择 + 播种 + 生长计时
4. 浇水 + 收获 + Toast 反馈
5. 天气系统（页面内运行）
6. 连种加成 + 成就系统
7. 离线进度计算
8. 与现有系统联动（阳台温室、扭蛋机等）
