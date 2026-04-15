# 木琴 (Xylophone) 小游戏开发计划

## 概述

在 `plugins/feature-dormitory/src/games/` 下新增 `XylophoneScreen.vue`，一个 8 键可弹奏的木琴小游戏。

## 技术选型

- **音频**：Web Audio API（`OscillatorNode` + `GainNode`），无需外部音频文件
- **频率映射**：C4=261.63, D4=293.66, E4=329.63, F4=349.23, G4=392.00, A4=440.00, B4=493.88, C5=523.25
- **音色模拟**：正弦波 + 快速衰减包络（Attack 5ms / Decay 200ms），模拟木琴敲击感
- **交互**：点击琴键触发，支持多点触控

## 功能模块

### 1. 核心弹奏
- 8 个琴键竖排，每个键对应一个音高
- 琴键用彩虹色渐变，点击时有弹跳动画 + 高亮
- 支持连续快速弹奏（不阻塞）

### 2. 录音回放
- 录制玩家弹奏的旋律（记录音高 + 时间戳）
- 最多录 20 个音符
- 回放功能：按录制的时间间隔重新播放

### 3. 跟弹挑战（赚金币模式）
- 系统随机生成一段 4~6 音符的旋律
- 逐个提示，玩家复现
- 全部正确 → 奖励金币（如 15💰）
- 失败 → 消耗少量金币（如 5💰）
- 难度递增：旋律长度随连胜增加

### 4. 模式切换
- **自由弹奏**（无消耗，纯玩）
- **跟弹挑战**（消耗 5💰/局，赢奖 15💰）

### 5. UI 风格
- 和现有游戏统一：全屏 fixed overlay、header + back btn + coin display
- Toast 反馈
- 主题系统（皮肤预留）

### 6. 注册到 DormitoryScreen
- import + 状态管理 + 启动按钮 + 事件处理

## 文件清单

- 新建：`plugins/feature-dormitory/src/games/XylophoneScreen.vue`
- 修改：`plugins/feature-dormitory/src/DormitoryScreen.vue`（注册新游戏入口）

## 开发步骤

1. 写 XylophoneScreen.vue 骨架 + Web Audio 引擎
2. 实现 8 键弹奏 UI + 动画
3. 录音/回放功能
4. 跟弹挑战逻辑
5. 注册到 DormitoryScreen
6. 自测
