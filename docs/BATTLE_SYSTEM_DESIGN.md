# 组队战斗系统设计文档

## 1. 概述

在 TaskBoardModal 接受任务后、提交结果前，增加"组队战斗"按钮作为任务执行方式之一（与原有的对话执行方式并行）。点击后进入组队战斗界面，选择队友后进入战斗，战斗胜利后自动标记任务为可完成状态（`completable`）。

战斗灵感来自《黑暗地牢》的半自动回合制 + 卡片展示方式，改为手机竖屏的卡片对战形式。**LLM 只负责生成战斗数据（敌人/队友属性、技能、背景剧情、战斗掉落道具），不参与实际战斗计算。战斗由前端根据 LLM 返回的数据执行，玩家手动选择技能和目标。**

### 关键决策（已全部确认）
- 战斗是任务的执行方式之一，与对话执行并行
- 带策略的回合制：玩家每回合手动选择目标 + 技能 + 可选道具
- 队友从当前世界书的角色中选择（User + 世界书角色）
- 奖励为任务原有奖励，不额外增加战斗掉落
- 战斗失败 → 任务失败，退回到初始状态，可重新战斗或用对话模式
- 三场连续战斗，无场间休息/恢复
- 战斗中使用独立的**战斗背包**，道具来源为战斗掉落，跨世界书通用
- 站位：从左到右横排，4 个位置（对应 4 人队伍）
- 掉落：每场战斗结束后立即获得，可在后续战斗中使用
- 敌方 AI：前端全自动规则驱动
- LLM 超时：100s
- 无角色养成系统（无经验值/升级），每次战斗由 LLM 重新分配属性

---

## 2. 整体流程

```
TaskBoardModal (已接受任务)
    |
    | 点击「组队战斗」按钮
    ▼
TeamSelectModal.vue (组队界面)
    - 显示可选队友列表（User + 世界书角色，最多4人）
    - 点击「进入战斗」
    ▼
BattleScreen.vue (战斗界面)
    |
    | 弹窗：「正在生成战斗信息中...」
    | LLM 生成 Boss、小怪、队友属性、背景剧情、战斗掉落表
    ▼
  ┌─ 第一场战斗 (小怪 x 3+) ──────────────────┐
  │  战斗胜利 → 获得掉落道具 → 存入战斗背包    │
  │  战斗失败 → 任务失败 → 回到初始状态         │
  └───────────────────────────────────────────┘
    │ 胜利
    ▼
  ┌─ 第二场战斗 (小怪 x 3+) ──────────────────┐
  │  战斗胜利 → 获得掉落道具 → 存入战斗背包    │
  │  战斗失败 → 任务失败 → 回到初始状态         │
  └───────────────────────────────────────────┘
    │ 胜利
    ▼
  ┌─ 第三场战斗 (Boss + 小怪 x 3+) ───────────┐
  │  战斗胜利 → 获得掉落道具 → 存入战斗背包    │
  │                → 标记任务 completable      │
  │  战斗失败 → 任务失败 → 回到初始状态         │
  └───────────────────────────────────────────┘
    │ 胜利
    ▼
回到 TaskBoardModal（任务已可提交）
```

---

## 3. 数据模型

### 3.1 战斗角色基类 (BattleCharacter)
```javascript
{
  id: string,           // 唯一标识
  name: string,         // 显示名称
  portrait: string,     // 立绘/头像 URL
  isPlayer: boolean,    // true=玩家方, false=敌方

  // 基础属性
  hp: number,           // 当前生命值
  maxHp: number,        // 最大生命值
  attack: number,       // 攻击力
  defense: number,      // 防御力
  speed: number,        // 速度（决定行动顺序）
  critRate: number,     // 暴击率 (0-1)
  critDmg: number,      // 暴击倍率 (默认 1.5)

  // 位置（从左到右横排，0-3）
  position: number,     // 0=最左, 3=最右

  // 状态效果
  buffs: Buff[],        // 增益效果
  debuffs: Debuff[],    // 减益效果

  // 技能
  skills: Skill[]       // 攻击/防御/辅助技能

  // 战斗用元数据
  isHighlighted: boolean, // 当前是否正在攻击（UI高亮）
  isAlive: boolean        // 是否存活
}
```

### 3.2 技能 (Skill)
```javascript
{
  id: string,
  name: string,         // 技能名，如 "火焰冲击"
  icon: string,         // 技能图标
  description: string,  // 技能描述
  type: 'attack' | 'defense' | 'support' | 'heal',
  targetMode: 'single' | 'all' | 'front' | 'back' | 'random' | 'self',
  damageType: 'physical' | 'fire' | 'poison' | 'ice' | 'lightning' | 'dark',
  damageMultiplier: number,  // 伤害倍率（基于攻击力）, 1.0 = 普通攻击
  hitCount: number,     // 命中次数（多段攻击）
  cooldown: number,     // 冷却回合
  currentCooldown: number, // 当前冷却剩余
  effects: Effect[],    // 额外效果（上毒、灼烧等）
}
```

### 3.3 效果 (Effect) — 用于 debuff/buff
```javascript
{
  id: string,
  name: string,         // 如 "中毒"、"灼烧"
  type: 'poison' | 'burn' | 'bleed' | 'stun' | 'defenseDown' | 'attackUp' | 'healOverTime' | 'shield',
  duration: number,     // 持续回合数
  valuePerTick: number, // 每回合数值（伤害或治疗量）
  stackable: boolean,   // 是否可叠加
  stacks: number        // 当前层数
}
```

### 3.4 Buff / Debuff
```javascript
{
  ...Effect,
  source: string,       // 施加者 ID
  isBuff: boolean       // true=增益, false=减益
}
```

### 3.5 战斗掉落道具 (BattleItem)
```javascript
{
  id: string,           // 道具唯一ID
  name: string,         // 道具名，如 "生命药水"
  icon: string,         // 道具图标
  description: string,  // 道具描述
  category: 'consumable' | 'equipment',  // 消耗品或装备
  effectType: 'heal' | 'damage' | 'buff' | 'debuff_cleanse' | 'shield' | 'attackUp' | 'defenseUp',
  value: number,        // 效果数值（如治疗量、伤害量）
  damageType: string,   // 如果是伤害道具，元素类型
  targetMode: 'self' | 'ally_single' | 'ally_all' | 'enemy_single' | 'enemy_all',
  duration: number,     // 如果是 buff，持续回合数
  usageCount: number,   // 可使用次数（默认 1）
}
```

### 3.6 战斗背包 (BattleBackpack)
```javascript
// 存储在 localStorage，跨世界书通用
{
  items: BattleItem[]   // 当前持有的战斗道具
}
```

### 3.7 战斗波次 (BattleWave)
```javascript
{
  waveIndex: number,    // 0, 1, 2
  isBossWave: boolean,  // 第三波为 Boss 波
  enemies: BattleCharacter[],  // 敌方阵容
  backgroundStory: string,     // 本场背景剧情
  dropTable: BattleItem[],     // 本场掉落道具表
  battleLog: string[]          // 战斗日志文本
}
```

### 3.8 完整战斗数据 (BattleData) — LLM 返回结构
```javascript
{
  teamMembers: BattleCharacter[],   // 我方队伍 (1-4人)
  waves: [BattleWave, BattleWave, BattleWave],  // 三场战斗
  globalStoryContext: string        // 整体背景故事
}
```

### 3.9 战斗会话状态 (BattleSession)
```javascript
{
  taskId: string,                   // 关联的任务ID
  boardId: string,                  // 关联的任务板ID
  battleData: BattleData,           // LLM 生成的战斗数据
  currentWave: number,              // 当前波次 (0-2)
  teamMembers: BattleCharacter[],   // 当前队伍状态（HP会随战斗变化）
  battleBackpack: BattleItem[],     // 当前战斗背包
  turnOrder: string[],              // 当前回合行动顺序（角色ID列表）
  currentTurnIndex: number,         // 当前行动到的角色在 turnOrder 中的索引
  isPlayerChoosing: boolean,        // 是否等待玩家选择
  waveDropHistory: BattleItem[],    // 已获得的掉落道具历史
  status: 'generating' | 'battle' | 'wave_clear' | 'victory' | 'defeat'
}
```

---

## 4. LLM 生成机制

### 4.1 生成时机
点击「进入战斗」后立即弹窗「正在生成战斗信息中...」，此时调用 LLM。

### 4.2 Prompt 设计

**System Prompt**:
```
你是一个游戏战斗设计师。根据提供的世界书背景、任务信息、角色资料，生成三场战斗的数据。
请严格按照 JSON 格式返回，不要返回其他内容。

战斗设计规则：
1. 共三场战斗，第一场和第二场是普通战斗（各至少3个小怪），第三场是 Boss 战（1个Boss + 至少3个小怪）
2. 怪物的属性要与队伍实力匹配，难度递增
3. 怪物需要有黑暗地牢风格的命名和外观描述
4. 每场战斗需要有一段背景剧情描述
5. 我方队员需要分配 2-4 个技能，包含物理和元素类型
6. 属性数值范围：HP 200-2000, Attack 30-200, Defense 10-100, Speed 5-50
7. Boss 的属性应为普通怪物的 2-3 倍
8. 每场战斗需要生成 2-4 个掉落道具，道具类型为：生命药水、攻击药水、防御药水、炸弹（伤害）、解毒剂等
   - 消耗品道具 effectType: 'heal'/'damage'/'buff'/'debuff_cleanse'
   - 效果数值合理：治疗类 50-300，伤害类 80-200
   - 每个道具包含：name, icon, description, category, effectType, value, damageType(如果是伤害), targetMode, usageCount
9. 技能 targetMode 中的 'front'/'back' 指从左到右站位的前排（position 0-1）和后排（position 2-3）
```

**User Prompt**:
```
世界书：{worldBook JSON}
任务信息：{task JSON}
队员列表：{selectedCharacters JSON}
玩家信息：{userProfile JSON}

请生成战斗数据。
```

### 4.3 响应处理
- LLM 返回 JSON → 解析为 BattleData
- 校验数据结构完整性
- 将 teamMembers 的初始状态绑定到前端
- 每场的 dropTable 中的道具存入 localStorage 的战斗背包
- 开始第一场战斗

### 4.4 失败回退
- LLM 生成超时（100s）→ 提示重试
- LLM JSON 解析失败 → 提示重试
- 两次重试仍失败 → 退回到组队界面

---

## 5. 战斗界面设计 (BattleScreen.vue)

### 5.1 布局 — 手机竖屏

```
┌──────────────────────────────┐
│ ◀  波次 1/3  Boss战    [背包] │  ← 顶部信息栏
├──────────────────────────────┤
│                              │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐   │
│  │敌1│ │敌2│ │敌3│ │敌4│   │  ← 敌方横排卡片
│  │HP█│ │HP█│ │HP█│ │HP█│   │
│  └───┘ └───┘ └───┘ └───┘   │
│                              │
├──────────────────────────────┤
│  ⚔️ 莉莉安 使用 [火焰冲击]   │  ← 战斗日志
│     对 暗影狼 造成 85 伤害!  │
├──────────────────────────────┤
│                              │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐   │
│  │队1│ │队2│ │队3│ │队4│   │  ← 我方横排卡片
│  │HP█│ │HP█│ │HP█│ │HP█│   │
│  └───┘ └───┘ └───┘ └───┘   │
│                              │
├──────────────────────────────┤
│  [火焰] [冰锥] [治疗] [背包] │  ← 技能/道具选择栏
│                              │  ← 当前行动角色为我方时显示
└──────────────────────────────┘
```

### 5.2 卡片设计

**敌方卡片**:
- 怪物名称 + 立绘/图标
- HP 条（带百分比数字）
- 状态效果图标（中毒、灼烧等）
- 当前行动中的卡片放大 + 高亮边框 + 呼吸动画
- 死亡后卡片灰化/淡出

**我方卡片**:
- 角色名称 + 立绘
- HP 条
- 状态效果图标
- 当前行动中的卡片放大 + 高亮边框 + 呼吸动画
- 点击可选择为目标（当需要选择目标时）

### 5.3 战斗日志区域
- 滚动显示战斗文本，如 "莉莉安 使用 [火焰冲击] 对 暗影狼 造成 85 点伤害！"
- 暴击时文字变红色 + 放大
- 状态变化显示图标 + 文字

### 5.4 技能/道具选择面板
当前行动角色为我方时，底部弹出选择面板：
- 显示该角色的所有可用技能按钮（带冷却、类型图标）
- [背包] 按钮展开战斗背包道具列表
- 选择技能后，如果技能需要目标，高亮可选目标区域

### 5.5 战斗背包面板
点击右上角 [背包] 按钮展开：
- 列出当前持有的所有 BattleItem
- 显示道具名、效果描述、剩余使用次数
- 点击道具后可选择使用目标
- 使用后的道具从背包移除（usageCount 归零时）

---

## 6. 战斗流程

### 6.1 行动顺序
每回合开始时根据所有存活角色的 `speed` 属性排序，速度高的先行动。速度相同则随机决定。生成 `turnOrder` 数组。

### 6.2 单个角色的行动回合
```
1. 高亮该角色卡片（放大 + 发光边框）
2. 如果是玩家方角色：
   a. 底部弹出技能选择面板（显示技能 + 背包按钮）
   b. 玩家选择技能或道具
   c. 如果技能/道具需要选择目标，高亮可选目标
   d. 玩家选择目标
   e. 播放技能动画 + 伤害计算 + 结算
   f. 扣除技能冷却
3. 如果是敌方角色：
   a. 前端 AI 自动选择目标和技能（见 6.6）
   b. 播放技能动画 + 伤害计算 + 结算
4. 处理 debuff tick（中毒、灼烧等持续伤害）
5. 检查是否有角色死亡
6. 推进到 turnOrder 中的下一个角色
7. 如果所有角色都行动完毕，开始新回合（重新排序）
8. 检查战斗是否结束
```

### 6.3 伤害计算公式
```
基础伤害 = 攻击力 × 技能倍率
防御减免 = 基础伤害 × (100 / (100 + 防御力))
最终伤害 = max(1, 防御减免 × 元素克制系数 × 暴击倍率)

元素克制:
  火 → 冰: 1.5x
  冰 → 火: 1.5x
  毒 → 无克制
  雷 → 水: 1.5x
  暗 → 光: 1.5x
  其他组合: 1.0x

持续伤害 (Poison/Burn/Bleed):
  每回合伤害 = valuePerTick × stacks × (1 - 目标防御/200)
  最小为 1

治疗:
  治疗量 = value (固定值，来自技能或道具)
  实际治疗量 = min(治疗量, maxHp - 当前hp)
```

### 6.4 波次切换
一场战斗全部敌方死亡后：
1. 显示「战斗胜利」动画
2. 将该波次 dropTable 中的道具加入战斗背包
3. 短暂显示掉落道具提示
4. 自动进入下一场战斗（无休息恢复）

### 6.5 战斗结束
- **全部三场胜利**: 标记任务为 `completable`，证据为战斗结果摘要，回到 TaskBoardModal
- **任意一场全员阵亡**: 任务失败，状态重置为 `accepted`，回到 TaskBoardModal。玩家可重新点战斗（LLM 重新生成）或使用对话模式

### 6.6 敌方 AI
前端简单规则驱动：
```javascript
function enemyAiAction(enemy, playerTeam) {
  // 1. 优先攻击最低 HP 的目标
  // 2. 如果有冷却就绪的特殊技能，30% 概率使用
  // 3. 否则使用普通攻击
  const aliveTargets = playerTeam.filter(c => c.isAlive);
  if (aliveTargets.length === 0) return null;
  const target = aliveTargets.sort((a, b) => a.hp - b.hp)[0];
  const skill = (Math.random() < 0.3 && enemy.skills.length > 1)
    ? enemy.skills.find(s => s.currentCooldown <= 0 && s.damageMultiplier > 1) || enemy.skills[0]
    : enemy.skills[0];
  return { target, skill };
}
```

---

## 7. 文件结构

### 新增文件
```
plugins/feature-dormitory/src/components/
├── TeamSelectModal.vue          # 组队选择界面
├── BattleScreen.vue             # 战斗主界面（核心）
├── BattleSkillPanel.vue         # 技能选择面板
└── BattleBackpackPanel.vue      # 战斗背包面板

plugins/feature-dormitory/src/composables/
└── useDormBattle.js             # 战斗核心逻辑（状态管理、伤害计算、回合管理）

plugins/feature-dormitory/src/services/
├── battleGenerationService.js   # LLM 战斗生成服务
└── battleBackpackService.js     # 战斗背包存储服务
```

### 修改文件
```
plugins/feature-dormitory/src/components/TaskBoardModal.vue
  - 添加「组队战斗」按钮（仅在任务状态为 accepted/completable 时显示）
  - 添加 handleTeamBattle() 方法
  - 引入 TeamSelectModal 组件

plugins/feature-dormitory/src/composables/useDormTask.js
  - 添加 handleTeamBattle() 处理函数
  - 战斗胜利后调用 markTaskCompletable
  - 战斗失败后重置任务状态为 accepted
```

---

## 8. 组队选择界面 (TeamSelectModal.vue)

### 8.1 数据来源
- 玩家（User）：自动加入，始终在队中
- 世界书角色：`worldBook.characters[]`
- 队伍上限：4 人（含玩家），如果世界书角色不足 3 个则少于 4 人也可以

### 8.2 UI 设计
```
┌──────────────────────────┐
│      选择队友 (0/3)       │
│                          │
│  ┌──────┐ ┌──────┐       │
│  │ 头像 │ │ 头像 │  ...  │
│  │ 名字 │ │ 名字 │       │
│  │ [✓]  │ │ [ ]  │       │
│  └──────┘ └──────┘       │
│                          │
│  已选: [玩家] [角色A]     │
│                          │
│     [  进入战斗  ]        │
└──────────────────────────┘
```

### 8.3 交互
- 点击角色卡片切换选中状态
- 已选区域实时显示当前队伍
- 至少选 1 个队友（不含玩家）才能点击「进入战斗」
- 点击后关闭 Modal，打开 BattleScreen

---

## 9. 与现有系统的集成

### 9.1 TaskBoardModal 修改
- 在任务详情区域（已有 Accept/Submit 按钮旁）增加「组队战斗」按钮
- 按钮样式：红色系（与 combat 任务类型颜色一致）
- 仅在任务状态为 `accepted` 或 `completable` 时显示

### 9.2 useDormTask 修改
新增 `handleTeamBattle(task, selectedCharacters)` 函数：
```javascript
async function handleTeamBattle(task, selectedCharacters) {
  // 1. 保存战斗会话到 localStorage
  // 2. 打开 BattleScreen
  // 3. 监听战斗完成事件
  // 4. 战斗胜利 → markTaskCompletable(board, taskId, battleEvidence)
  // 5. 战斗失败 → reset task status to 'accepted'
}
```

### 9.3 任务类型适配
- 所有任务类型都可以走战斗路线（不限制为 combat 类型）
- 战斗证据格式：`{ type: 'battle', waves: 3, victory: true, summary: '...' }`

### 9.4 存储
- 当前战斗会话存 localStorage: `avg_llm_battle_session_v1`
- 战斗背包存 localStorage: `avg_llm_battle_backpack_v1`（跨世界书通用，不关联 bookId）
- 战斗历史存 localStorage: `avg_llm_battle_history_v1`

---

## 10. 技术实现要点

### 10.1 战斗动画
- 使用 CSS transitions + keyframes 实现卡片高亮/放大效果
- 攻击动画：从攻击者卡片向目标卡片发射粒子/光束
- 受击动画：目标卡片震动 + 红色闪烁
- 死亡动画：卡片淡出 + 缩小
- 伤害数字飘字动画（从目标位置向上飘出）

### 10.2 性能考虑
- 战斗计算全部在前端同步执行，不需要等待 LLM
- 动画使用 CSS transitions（GPU 加速）
- 战斗日志使用滚动区域，限制最大条目数（如 200 条，超出自动清理旧条目）

### 10.3 错误处理
- LLM 生成超时（100s）→ 提示重试
- LLM JSON 解析失败 → 提示重试
- 战斗过程中页面刷新 → 尝试恢复上次战斗状态
- 战斗数据缺失字段 → 使用默认值填充

### 10.4 战斗背包持久化
- 战斗背包独立于世界书，存储在 `avg_llm_battle_backpack_v1`
- 每场战斗胜利后将掉落道具合并到背包
- 战斗中使用的道具从当前会话背包扣除
- 未来可扩展：战斗背包中的道具可以在不同世界书的战斗间共享

---

## 11. 实施步骤

1. **Phase 1: 数据结构 + LLM 生成** (battleGenerationService.js)
   - 定义 BattleData、BattleItem 等数据结构
   - 实现 LLM Prompt 和解析
   - 实现战斗背包存储服务
   - 测试生成质量

2. **Phase 2: 组队界面** (TeamSelectModal.vue)
   - 角色选择 UI
   - 与 TaskBoardModal 对接

3. **Phase 3: 战斗核心逻辑** (useDormBattle.js)
   - 战斗状态管理
   - 伤害计算（含元素克制、暴击、持续伤害）
   - 回合管理（速度排序、行动顺序）
   - 波次切换
   - 敌方 AI

4. **Phase 4: 战斗 UI** (BattleScreen.vue + BattleSkillPanel.vue + BattleBackpackPanel.vue)
   - 横排卡片布局
   - 动画效果（高亮、攻击、受击、死亡、伤害数字）
   - 技能选择面板
   - 战斗背包面板
   - 战斗日志

5. **Phase 5: 集成** (useDormTask.js + TaskBoardModal.vue)
   - 按钮接入
   - 任务状态流转（胜利 → completable，失败 → accepted）
   - 战斗证据提交
   - 战斗失败回退

---

## 12. 不在本次实现范围

- 角色经验值和升级系统
- PVP 对战
- 难度选择（普通/困难/地狱）
- 战斗回放功能
- 多队伍阵容保存/预设
- 世界书背包道具接入战斗（当前仅使用战斗掉落道具）
