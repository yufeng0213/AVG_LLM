# 游戏中心方案

## 概述

将宿舍侧栏的 9 个游戏按钮（🎰🎁🎯🌾🐕🍳🎵🎶💎）收敛为 1 个 🎮 游戏厅按钮，点击进入游戏选择中心（GameCenterScreen），再从中心进入具体游戏。

签到按钮（📋七日签到、📅日历签到）保留在原界面不动。

## 架构

```
DormitoryScreen (宿舍主页)
  ├── 🎮 游戏厅 ──▶ GameCenterScreen (游戏选择中心)
  │                       │
  │                  点击任一个游戏 ──▶ 对应游戏 Screen
  │                       │              (返回回到 GameCenter)
  │                  点返回 ──────────▶ 回到 Dormitory
  │
  └── 📋 七日签到 (不动)
  └── 📅 日历签到 (不动)
```

## 返回逻辑

```
Dormitory ──🎮──▶ GameCenter ──点击──▶ GameScreen
                                              │
                                        点返回
                                              ▼
                                       GameCenter
                                              │
                                        点返回
                                              ▼
                                       Dormitory
```

实现方式：GameScreen 的 `back` 事件不再 emit 给 Dormitory，而是由 GameCenter 拦截。GameCenter 内部维护 `activeGame` 状态：
- `activeGame = null` → 显示游戏选择网格
- `activeGame = 'slot'` → 挂载对应游戏 Screen

## UI 设计

### GameCenterScreen

```
┌──────────────────────────────┐
│  ←  🎮 游戏厅          💰888 │
├──────────────────────────────┤
│  📂 经典街机                 │
│  ┌──────┬──────┬──────┐     │
│  │ 🎰   │ 🎁   │ 🎯   │     │
│  │ 5💰  │      │      │     │
│  │老虎机│扭蛋机 │弹珠台│     │
│  ├──────┼──────┼──────┤     │
│  │ 🌾   │ 🐕   │      │     │
│  │      │      │      │     │
│  │ 农场 │ 赛狗 │      │     │
│  └──────┴──────┴──────┘     │
│                              │
│  🎨 互动娱乐                 │
│  ┌──────┬──────┬──────┐     │
│  │ 🍳   │ 🎵   │ 🎶   │     │
│  │      │      │      │     │
│  │ 厨房 │ 木琴 │ 口琴 │     │
│  ├──────┼──────┼──────┤     │
│  │ 💎   │      │      │     │
│  │      │      │      │     │
│  │ 三消 │      │      │     │
│  └──────┴──────┴──────┘     │
└──────────────────────────────┘
```

### 游戏格子

```
┌──────────────┐
│     🎰       │  图标 48px
│              │
│   老虎机      │  名称
│   5💰        │  入场费(如有)
└──────────────┘
```

- 不可点（钱不够）：opacity: 0.4 + 不可点状态
- hover：发光 + 放大

## 游戏分类

### 经典街机
| 游戏 | 图标 | 入场费 | 文件 |
|------|------|--------|------|
| 老虎机 | 🎰 | 5💰 | SlotMachineScreen.vue |
| 扭蛋机 | 🎁 | - | GachaScreen.vue |
| 弹珠台 | 🎯 | 3💰 | PachinkoScreen.vue |
| 农场 | 🌾 | - | FarmScreen.vue |
| 赛狗 | 🐕 | - | DogRaceScreen.vue |

### 互动娱乐
| 游戏 | 图标 | 入场费 | 文件 |
|------|------|--------|------|
| 厨房 | 🍳 | - | KitchenScreen.vue |
| 木琴 | 🎵 | - | XylophoneScreen.vue |
| 口琴 | 🎶 | - | HarmonicaScreen.vue |
| 三消 | 💎 | - | Match3Screen.vue |

## 数据存储

无额外存储，只使用 `activeGame` 内部状态。

## 文件清单

| 文件 | 操作 |
|------|------|
| `plugins/feature-dormitory/src/GameCenterScreen.vue` | **新建**：游戏选择中心 |
| `plugins/feature-dormitory/src/DormitoryScreen.vue` | **修改**：9个按钮→1个🎮，挂载GameCenter |
| 各游戏 Screen | **不变**：back 仍 emit 给父组件，由 GameCenter 接管 |

## 实现步骤

1. 创建 GameCenterScreen.vue（分类网格 + 游戏格子 + 内部游戏挂载）
2. 修改 DormitoryScreen.vue（删 8 个游戏按钮 + handler，只留 🎮）
3. 注册 GameCenterScreen 到 DormitoryScreen
