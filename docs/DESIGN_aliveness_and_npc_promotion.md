# 角色活人感 & NPC 转正机制 — 详细设计方案

> 日期: 2026-04-23
> 状态: 讨论后修订版

---

## 一、总览

### 1.1 核心目标

让 NPC 从"纯反应式"转变为"有自主生活"的角色，并在剧情推进中动态引入/淡出 NPC。

### 1.2 三个子方案 + 一项基础设施

| 编号 | 名称 | 复杂度 | 依赖 |
|------|------|--------|------|
| **Infra** | 角色状态抽取 (`feature-character-state`) | 中 | 无 |
| **A** | 日程结算消费 | 低 | Infra |
| **B** | NPC 关系自动演进 | 中 | Infra |
| **C** | NPC 曝光追踪 & 转正 | 中高 | B（可选） |

### 1.3 基础设施先行：角色状态抽取

当前 dormitory 的状态（affection/energy/mood/relationshipStage 等）散落在 `DormitoryScreen.vue` 组件内部和 `avg_llm_dormitory_runtime_v1` 存储中，其他模块无法直接读写。

**决策：** 将角色运行时状态从 dormitory 组件中抽取为独立模块 `plugins/feature-character-state/`，作为所有角色属性的单一数据源。

### 1.4 分阶段实施

```
Phase 0 (1-2 天): Infra — 角色状态抽取
Phase 1 (1 天):   方案 A — 日程结算消费
Phase 2 (2 天):   方案 B — 关系自动演进（基于世界记忆）
Phase 3 (1 天):   方案 C — 曝光追踪 + 转正
```

---

## 二、基础设施：角色状态抽取 (`feature-character-state`)

### 2.1 动机

- Dorm、Schedule、Relationship 三个系统各自维护角色状态，互不可见
- 方案 A 和 B 都需要一个统一的角色状态读写接口
- 当前 dorm 状态绑定在 Vue 组件 + localStorage 中，纯 JS 模块无法访问

### 2.2 新模块结构

```
plugins/feature-character-state/
├── plugin.json
├── src/
│   ├── entry.js
│   ├── composable/
│   │   └── useCharacterState.js       // Vue 组件用
│   ├── services/
│   │   └── characterStateStore.js     // 纯 JS 存储层
│   └── types.js                       // 数据结构定义
```

### 2.3 数据结构

**角色运行时状态（单一结构，替代原有的 dorm 分散状态）：**

```js
// kvStorage key: 'avg_llm_character_state_v1'
// 结构: { "worldBookId::charId": CharacterState }

{
  // === 基础属性 ===
  id: string,           // charId
  bookId: string,       // worldBookId
  name: string,

  // === 情感状态 ===
  affection: number,        // 0-100 (原 dorm.affection)
  energy: number,           // 0-100 (原 dorm.energy，映射自 relationship.trust)
  mood: string,             // 心情标签 (如 '平静', '开心', '专注')
  moodExpiresAt: string,    // 心情过期时间 ISO

  // === 关系状态 ===
  relationshipStage: string,   // 'stranger' | 'familiar' | 'intimate' | 'bond'
  favor: number,               // -100~100 (来自 relationshipStore)
  trust: number,               // -100~100
  stance: number,              // -100~100

  // === 行为统计 ===
  visitCount: number,
  chatCount: number,
  giftCount: number,
  lastInteractedAt: string,    // 最后互动时间 ISO
  lastScheduleDate: string,    // 最后生成日程的日期

  // === 日程关联 ===
  currentActivity: string,     // 当前日程活动类型
  currentLocation: string,     // 当前日程地点
  scheduleAffectionDelta: number,  // 日程结算累计好感变化

  // === 元数据 ===
  createdAt: string,
  updatedAt: string,
}
```

### 2.4 核心 API

**纯 JS 存储层（`characterStateStore.js`）：**

```js
// 不依赖 Vue，任何模块都可调用
export async function getCharacterState(bookId, charId)
export async function setCharacterState(bookId, charId, state)
export async function updateCharacterState(bookId, charId, partial)  // 增量更新
export async function getAllCharacterStates(bookId)                   // 获取某世界书所有角色
export async function applyDelta(bookId, charId, deltas, reason)     // 应用增量并记录日志
```

**Vue composable（`useCharacterState.js`）：**

```js
// 组件内使用，提供 reactive 状态
export function useCharacterState(bookId, charId) {
  // 返回 { state, update, applyDelta, ... } 响应式对象
}
```

### 2.5 迁移策略

1. 新建 `feature-character-state` 模块
2. `characterStateStore.js` 读取 `avg_llm_dormitory_runtime_v1` 中的已有数据，转换为新格式
3. DormitoryScreen 改为从 `characterStateStore` 读取/写入，不再直接操作 localStorage
4. RelationshipStore 在 `updateRelationship` 时同步写入 `characterStateStore`
5. ScheduleConsumer 写入角色状态时也通过 `characterStateStore`

### 2.6 改动文件

| 文件 | 改动类型 |
|------|----------|
| `plugins/feature-character-state/` | **新增模块** |
| `plugins/feature-dormitory/src/DormitoryScreen.vue` | 改为通过 `characterStateStore` 读写 |
| `src/relationship/relationshipStore.js` | `updateRelationship` 时调用 `characterStateStore.updateCharacterState` |
| `src/save/saveManager.js` | 保存/加载时包含 character state |

---

## 三、方案 A：日程结算消费

### 3.1 问题陈述

`useCharacterSchedule.js` 的 `executePassedHours()` 计算了 `executed` 数据但从未被消费。

### 3.2 数据流（使用新的角色状态系统）

```
executePassedHours(bookId, charId) 执行完毕
        │
        ▼
  dispatchScheduleEvent('hour:executed', { key, executedHours })
        │
        ▼
  ScheduleStateConsumer 监听事件
        │
        ├── 聚合已执行小时的效果（affection delta, mood, 活动列表）
        │
        ├── 1) 通过 characterStateStore 更新角色状态
        │   ├── affection += totalAffectionDelta
        │   ├── mood = latestMood
        │   ├── scheduleAffectionDelta += totalAffectionDelta
        │   └── updatedAt = now
        │
        ├── 2) 同步到 relationship runtime
        │   └── relationshipStore.updateRelationship(charId, { favor: delta }, reason)
        │
        └── 3) 写入世界记忆 event
            └── addEvent(bookId, { type: "daily_activity", ... })
```

### 3.3 改动文件

| 文件 | 改动 |
|------|------|
| `plugins/feature-character-state/src/services/characterStateStore.js` | Infra 新增，提供 `applyDelta()` |
| `src/services/scheduleStateConsumer.js` | **新增**，监听 `hour:executed` 事件 |
| `src/App.vue` 或游戏入口 | 调用 `initScheduleConsumer()` |

### 3.4 scheduleStateConsumer.js 核心逻辑

```js
import { onScheduleEvent } from '../../plugins/feature-character-schedule/src/composables/useCharacterSchedule.js'
import { applyDelta as applyStateDelta } from '../../plugins/feature-character-state/src/services/characterStateStore.js'
import { updateRelationship } from '../../src/relationship/relationshipStore.js'
import { addEvent } from '../../src/memory/worldMemoryStore.js'

export function initScheduleConsumer() {
  onScheduleEvent('hour:executed', async ({ key, executedHours, schedule }) => {
    const [bookId, charId] = key.split('::')
    await applyScheduleEffects(bookId, charId, schedule, executedHours)
  })
}

async function applyScheduleEffects(bookId, charId, schedule, executedHours) {
  const effects = aggregateEffects(schedule, executedHours)
  if (!effects.hasChanges) return

  // 1. 更新角色状态（通过新的统一存储）
  await applyStateDelta(bookId, charId, {
    affection: effects.totalAffectionDelta,
    mood: effects.mood,
  }, `日程结算: ${effects.summary}`)

  // 2. 更新 relationship
  if (effects.totalAffectionDelta !== 0) {
    await updateRelationship(charId, {
      favor: effects.totalAffectionDelta,
    }, `日程活动结算 (${effects.summary})`, null)
  }

  // 3. 写入世界记忆
  if (effects.summary) {
    await addEvent(bookId, {
      type: 'daily_activity',
      participants: [charId],
      summary: `${charName} ${effects.summary}`,
      emotionalImpact: Math.abs(effects.totalAffectionDelta) + 10,
      scene: effects.lastLocation,
    })
  }
}
```

---

## 四、方案 B：NPC 关系自动演进

### 4.1 核心变更

- **数据源**：从世界记忆数据库（`world_memories`）分析，不从 SMS/对话提取
- **触发方式**：世界记忆数据库更新 N 次后触发（不是新增 N 条对话）
- **分析区分**：NPC-NPC 和 NPC-Player 使用不同的分析策略
- **触发阈值**：可配置，不写死

### 4.2 为什么从世界记忆分析

| 对比 | 从对话分析（旧方案） | 从世界记忆分析（新方案） |
|------|---------------------|-------------------------|
| 数据量 | 原始对话多且杂，包含大量无效信息 | 已经是 LLM 提炼过的事件，信息密度高 |
| NPC-NPC | 只能分析玩家在场的对话 | 世界记忆已有 NPC 参与的 events |
| LLM 负担 | 需要理解大量原始对话 | 输入已经是结构化事件，prompt 更简单 |
| 成本 | maxTokens 8000 | 可降低到 3000-5000 |

### 4.3 触发机制

```
世界记忆更新计数器（每次 addEvent / addEvents / addCharacterMemory）
        │
        ▼
  计数器 >= 配置的阈值（默认 10 次更新）
        │
        ▼
  触发关系分析
        │
        ├── 从世界记忆取最近 events + characterMemories
        │
        ├── 调用 LLM 分析关系
        │
        └── 重置计数器
```

**配置存储在** `kvStorage` key `'avg_llm_relationship_auto_config'`：

```js
{
  enabled: true,
  triggerMode: 'updateCount',    // 固定为 updateCount
  triggerThreshold: 10,          // 世界记忆更新次数阈值（可配置）
  updateCount: 0,                // 当前累计更新次数
  lastAnalyzedAt: null,          // 上次分析时间
  lastAnalyzedEventCount: 0,     // 上次分析时的事件总数

  // NPC-NPC 分析配置
  npcNpc: {
    enabled: true,
    maxTokens: 3000,             // NPC-NPC 分析 token 上限较低
    temperature: 0.3,
  },

  // NPC-Player 分析配置
  npcPlayer: {
    enabled: true,
    maxTokens: 5000,             // NPC-Player 分析 token 上限较高（需要更细腻）
    temperature: 0.3,
  },

  // 显著变化阈值
  significanceThreshold: 50,     // score 变化超过此值才通知玩家
}
```

### 4.4 执行流程（区分 NPC-NPC vs NPC-Player）

```
触发条件满足（世界记忆更新 >= threshold）
        │
        ▼
1. 从世界记忆取最近 events（排除已分析的）
   └── 按参与者分类：
       ├── 含 __player__ 的 events → NPC-Player 组
       └── 不含 __player__ 的 events → NPC-NPC 组
        │
        ▼
2. NPC-Player 分析（如果该组有数据且 enabled）
   ├── 取含玩家的最近 events + 相关 characterMemories
   ├── 调用 generateRelationshipAnalysis（现有函数）
   │   └── maxTokens: config.npcPlayer.maxTokens (默认 5000)
   ├── 合并结果到 worldBook.relationships
   ├── 显著变化 → 同步到 runtime + Toast 通知
   └── 记录 analyzedEventIds
        │
        ▼
3. NPC-NPC 分析（如果该组有数据且 enabled）
   ├── 取 NPC 间 events + 共享记忆上下文
   ├── 调用新的 generateNpcNpcAnalysis()（轻量版）
   │   └── maxTokens: config.npcNpc.maxTokens (默认 3000)
   ├── 合并结果
   ├── 显著变化（delta > 200）→ 生成旁白事件
   └── 记录 analyzedEventIds
        │
        ▼
4. 保存 worldBook.relationships + 更新配置
```

### 4.5 NPC-NPC 轻量分析

NPC-NPC 关系分析不需要玩家视角的细腻判断，可以用更简单的 prompt：

```js
/**
 * NPC-NPC 关系分析（轻量版）
 * 输入已经是结构化的事件列表，不需要理解原始对话
 */
export async function generateNpcNpcAnalysis(params = {}) {
  const { worldBook, events, existingRelationships } = params

  const eventsText = events.map(e => {
    const participants = e.participants.map(id => resolveName(id, worldBook)).join('、')
    return `事件: ${participants} 参与了「${e.type}」— ${e.summary}`
  }).join('\n')

  const userPrompt = [
    `【任务】根据以下事件，分析 NPC 之间的关系变化。`,
    `【世界书】${worldBook.title}`,
    `【事件列表】`,
    eventsText,
    `【当前关系】`,
    ...formatExistingRelationships(existingRelationships, worldBook),
    `请输出 XML 格式的关系数据。只分析事件中出现的 NPC 之间的关系。`,
  ].join('\n')

  return callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('relationship:npc_npc_analysis'),
    userPrompt,
    temperature: 0.3,
    maxTokens: 3000,
  })
}
```

### 4.6 世界记忆更新钩子

需要一个统一入口来计数：

```js
// src/services/relationshipAutoScheduler.js

/**
 * 注册世界记忆更新钩子
 * 在 addEvent / addEvents / addCharacterMemory 之后调用
 */
export function notifyMemoryUpdate(worldBookId, updateCount = 1) {
  if (!_state) return
  _state.pendingUpdates += updateCount
  _check()  // 检查是否达到阈值
}
```

**集成方式**：修改 `src/memory/worldMemoryStore.js`，在 `addEvent`、`addEvents`、`addCharacterMemory`、`setWorldFlag` 等写入操作末尾调用 `notifyMemoryUpdate`。

或者更简单的方式：使用 CustomEvent。

```js
// worldMemoryStore.js 中
window.dispatchEvent(new CustomEvent('worldMemory:updated', {
  detail: { worldBookId, updateType: 'event', count: 1 }
}))

// relationshipAutoScheduler.js 中监听
window.addEventListener('worldMemory:updated', (e) => {
  notifyMemoryUpdate(e.detail.worldBookId, e.detail.count)
})
```

### 4.7 新增文件

**`src/services/relationshipAutoScheduler.js`**

```js
import { kvStorage } from '../storage/index.js'

const STORAGE_KEY = 'avg_llm_relationship_auto_config'
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 每 5 分钟检查一次

let _state = null

/**
 * 初始化调度器
 * @param {Object} api - 依赖注入
 * @param {Function} api.getWorldBook
 * @param {Function} api.getWorldMemory
 * @param {Function} api.runRelationshipAnalysis  // NPC-Player 分析
 * @param {Function} api.runNpcNpcAnalysis        // NPC-NPC 分析
 * @param {Function} api.saveRelationships
 * @param {Function} api.addWorldMemoryEvent
 * @param {Function} api.syncToRuntime
 * @param {Function} api.notifyPlayer
 * @param {Function} api.isGenerating             // 是否在生成中（用于推迟 LLM 调用）
 */
export function initRelationshipScheduler(api) {
  if (_state) return
  _state = { api, intervalId: null, running: false, pendingUpdates: 0 }

  // 监听世界记忆更新事件
  if (typeof window !== 'undefined') {
    window.addEventListener('worldMemory:updated', (e) => {
      _state.pendingUpdates += e.detail?.count || 1
    })
  }
}

export function startRelationshipScheduler() {
  if (!_state || _state.running) return
  _state.running = true
  _check()
  _state.intervalId = setInterval(_check, CHECK_INTERVAL_MS)
}

export function stopRelationshipScheduler() {
  if (!_state) return
  if (_state.intervalId) { clearInterval(_state.intervalId); _state.intervalId = null }
  _state.running = false
}

async function loadConfig() {
  const defaults = {
    enabled: true,
    triggerThreshold: 10,
    updateCount: 0,
    lastAnalyzedAt: null,
    lastAnalyzedEventCount: 0,
    npcNpc: { enabled: true, maxTokens: 3000, temperature: 0.3 },
    npcPlayer: { enabled: true, maxTokens: 5000, temperature: 0.3 },
    significanceThreshold: 50,
  }
  const stored = await kvStorage.get(STORAGE_KEY)
  return stored ? { ...defaults, ...stored } : defaults
}

async function saveConfig(config) {
  await kvStorage.set(STORAGE_KEY, config)
}

async function _check() {
  if (!_state?.running) return
  if (document?.visibilityState === 'hidden') return

  const config = await loadConfig()
  if (!config.enabled) return
  if (_state.pendingUpdates < config.triggerThreshold) return
  if (_state.api.isGenerating?.()) return  // LLM 正在生成，推迟

  await _runAnalysis(config)
}

async function _runAnalysis(config) {
  const { api } = _state
  const worldBook = api.getWorldBook()
  if (!worldBook) return

  const memory = await api.getWorldMemory(worldBook.id)
  const newEvents = memory.events.slice(config.lastAnalyzedEventCount || 0)
  if (newEvents.length === 0) {
    // 没有新事件，重置计数器
    _state.pendingUpdates = 0
    config.updateCount = 0
    await saveConfig(config)
    return
  }

  // 分类事件
  const playerEvents = newEvents.filter(e =>
    Array.isArray(e.participants) && e.participants.includes('__player__')
  )
  const npcOnlyEvents = newEvents.filter(e =>
    Array.isArray(e.participants) && !e.participants.includes('__player__') && e.participants.length >= 2
  )

  let allChanges = []

  // --- NPC-Player 分析 ---
  if (config.npcPlayer.enabled && playerEvents.length > 0) {
    const result = await api.runRelationshipAnalysis({
      worldBook,
      recentDialogue: eventsToDialogueLike(playerEvents, worldBook),
      existingRelationships: worldBook.relationships || {},
    })
    if (result.success && result.relationships) {
      allChanges.push(...mergeAndDetect(worldBook.relationships, result.relationships, config))
      Object.assign(worldBook.relationships, result.relationships)
    }
  }

  // --- NPC-NPC 分析 ---
  if (config.npcNpc.enabled && npcOnlyEvents.length > 0) {
    const result = await api.runNpcNpcAnalysis({
      worldBook,
      events: npcOnlyEvents,
      existingRelationships: worldBook.relationships || {},
    })
    if (result.success && result.relationships) {
      allChanges.push(...mergeAndDetect(worldBook.relationships, result.relationships, config))
      Object.assign(worldBook.relationships, result.relationships)
    }
  }

  // 保存
  await api.saveRelationships(worldBook)

  // 处理显著变化
  for (const change of allChanges) {
    // 写入世界记忆
    await api.addWorldMemoryEvent(worldBook.id, {
      type: 'relationship_shift',
      participants: [change.fromId, change.toId],
      summary: change.summary,
      emotionalImpact: Math.abs(change.delta) / 10,
    })

    // 同步到 runtime
    const favorDelta = scoreToFavorDelta(change.delta)
    if (favorDelta !== 0) {
      await api.syncToRuntime(change.fromId, { favor: favorDelta }, change.summary)
      // NPC-NPC 变化对另一方有溢出效应（减弱）
      if (change.isNpcNpc && change.toId !== '__player__') {
        await api.syncToRuntime(change.toId,
          { favor: Math.round(favorDelta * 0.3) },
          `受 ${change.fromName} 的影响`)
      }
    }

    // 通知玩家
    if (shouldNotify(change, config)) {
      api.notifyPlayer(buildNotificationText(change))
    }
  }

  // 重置计数器
  _state.pendingUpdates = 0
  config.updateCount = 0
  config.lastAnalyzedAt = new Date().toISOString()
  config.lastAnalyzedEventCount = memory.events.length
  await saveConfig(config)
}
```

### 4.8 改动文件

| 文件 | 改动 |
|------|------|
| `src/services/relationshipAutoScheduler.js` | **新增** |
| `src/llm/llmService.relationship.js` | 新增 `generateNpcNpcAnalysis()` 函数 |
| `src/llm/promptDefaults.js` 或 promptRegistry | 新增 `relationship:npc_npc_analysis` prompt |
| `src/memory/worldMemoryStore.js` | `addEvent` 等写入函数中 dispatch `worldMemory:updated` 事件 |
| `src/screens/GameScreen.vue` | 初始化时调用 `initRelationshipScheduler()` + `startRelationshipScheduler()` |

---

## 五、方案 C：NPC 曝光追踪 & 转正

### 5.1 核心变更

- 非角色名提及检测：使用方案 A（仅追踪已知角色）
- 触发阈值：可配置，不写死
- 允许 NPC 淡出
- 支持角色删除
- 不担心角色过多

### 5.2 整体架构

```
                    曝光追踪 (Step 1)
                    ├─ 监听对话生成
                    ├─ 统计已有角色的出场/提及次数
                    └─ 计算曝光分数（可配置权重）

                         │ 分数达标
                         ▼

                    角色卡生成 (Step 2)
                    ├─ LLM 从世界书提取背景
                    ├─ 生成基础角色卡
                    └─ 写入 worldBook.characters

                         │ 生成完成
                         ▼

                    自动初始化 (Step 3)
                    ├─ 生成日程
                    ├─ 建立初始关系
                    └─ 发送偶遇短信

                         │ 长期不互动
                         ▼

                    淡出机制 (Step 4)
                    ├─ 曝光分数持续衰减
                    ├─ 低于阈值 → stage 降级
                    └─ 玩家可主动删除角色
```

### 5.3 可配置参数

kvStorage key: `'avg_llm_exposure_config'`

```js
{
  enabled: true,

  // 曝光分数计算权重
  appearanceWeight: 10,    // 作为 speaker 出场的权重
  mentionWeight: 3,        // 被提及的权重

  // 阶段阈值
  thresholdToTracked: 1,         // 首次被提及 → 开始追踪
  thresholdToInteractive: 80,    // 路人 → 可互动
  thresholdToCore: 200,          // 可互动 → 核心

  // 衰减配置
  decayStartAfterLines: 50,      // 超过多少条没出现开始衰减
  decayRate: 0.005,              // 每条衰减率
  decayMinFactor: 0.5,           // 最低衰减系数

  // 淡出配置
  fadeOutThreshold: 30,          // 分数低于此值时触发淡出
  fadeOutStage: 1,               // 淡出回退到的阶段
}
```

### 5.4 Step 1: 曝光度追踪

#### 数据存储

kvStorage key: `'avg_llm_character_exposure'`

```js
{
  "worldBookId": {
    "charId": {
      "mentionCount": number,
      "appearanceCount": number,
      "lastSeenAt": string,
      "lastSeenLineIndex": number,
      "exposureScore": number,
      "stage": number,              // 0=未追踪, 1=路人, 2=可互动, 3=核心
      "mentionContexts": string[],  // 最近提及上下文
      "promotedAt": string | null,
      "fadedAt": string | null,     // 淡出时间
      "peakScore": number,          // 历史最高分
    }
  }
}
```

#### 核心逻辑

```js
// src/services/exposureTracker.js

/**
 * 处理新对话，更新曝光数据
 */
export async function processNewDialogue(worldBookId, newLines, startLineIndex, worldBook) {
  const data = await loadExposureData()
  const config = await loadExposureConfig()
  if (!data[worldBookId]) data[worldBookId] = {}

  const wbData = data[worldBookId]
  const knownChars = (worldBook?.characters || []).map(c => ({
    id: c.id,
    name: c.name,
    nickname: c.nickname,
  }))

  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i]
    const lineIndex = startLineIndex + i

    // speaker 出场计数
    for (const char of knownChars) {
      if (line.speaker === char.id || line.speaker === char.name) {
        const entry = ensureEntry(wbData, char.id)
        entry.appearanceCount++
        entry.lastSeenAt = new Date().toISOString()
        entry.lastSeenLineIndex = lineIndex
      }

      // 文本提及计数
      if (line.text && (line.text.includes(char.name) || (char.nickname && line.text.includes(char.nickname)))) {
        const entry = ensureEntry(wbData, char.id)
        entry.mentionCount++
        entry.lastSeenAt = new Date().toISOString()
        entry.lastSeenLineIndex = lineIndex
        entry.mentionContexts = entry.mentionContexts || []
        entry.mentionContexts.push(line.text.slice(0, 100))
        if (entry.mentionContexts.length > 10) entry.mentionContexts.shift()
      }
    }
  }

  // 计算分数 + 衰减
  for (const [id, entry] of Object.entries(wbData)) {
    entry.exposureScore = calculateExposureScore(entry, config, newLines.length)

    // 淡出检测
    if (entry.stage > 1 && entry.exposureScore < config.fadeOutThreshold) {
      entry.stage = Math.max(1, entry.stage - 1)
      entry.fadedAt = new Date().toISOString()
    }

    // 记录最高分
    entry.peakScore = Math.max(entry.peakScore || 0, entry.exposureScore)
  }

  await saveExposureData(data)

  // 检查转正
  return checkForPromotions(wbData, knownChars, config)
}

function calculateExposureScore(entry, config, currentBatchSize) {
  const baseScore = entry.appearanceCount * config.appearanceWeight
    + entry.mentionCount * config.mentionWeight

  const linesSinceLastSeen = (entry.lastSeenLineIndex || 0) > 0
    ? Math.max(0, currentBatchSize - (entry.lastSeenLineIndex % currentBatchSize || 0))
    : 0

  const decayFactor = linesSinceLastSeen > config.decayStartAfterLines
    ? Math.max(config.decayMinFactor, 1 - (linesSinceLastSeen - config.decayStartAfterLines) * config.decayRate)
    : 1

  return Math.round(baseScore * decayFactor)
}
```

### 5.5 Step 2 & 3: 角色卡生成 + 自动初始化

与原版设计一致，但需要加上：

```js
/**
 * 转正流程
 */
export async function promoteCharacter(worldBook, exposureEntry, characterCard) {
  // 1. 写入 worldBook.characters
  worldBook.characters.push(characterCard)
  await saveWorldBook(worldBook)

  // 2. 初始化角色状态（通过新的 characterStateStore）
  await setCharacterState(worldBook.id, characterCard.id, {
    id: characterCard.id,
    bookId: worldBook.id,
    name: characterCard.name,
    affection: 0,
    energy: 50,
    mood: '平静',
    relationshipStage: 'stranger',
    favor: 0, trust: 0, stance: 0,
    createdAt: new Date().toISOString(),
  })

  // 3. 初始化 relationship runtime
  await updateRelationship(characterCard.id, {
    favor: 0, trust: 0, stance: 0
  }, '新角色登场', null)

  // 4. 生成日程
  await generateScheduleForCharacter({ worldBook, character: characterCard })

  // 5. 建立初始关系（基于世界书 entries，LLM 推断）
  await initializeNpcRelationships(worldBook, characterCard.id)

  // 6. 发送偶遇短信
  await sendSpontaneousSms(characterCard.id, "我们好像在哪里见过……")

  // 7. 更新曝光数据
  exposureEntry.stage = 2
  exposureEntry.promotedAt = new Date().toISOString()
  await saveExposureData(exposureData)

  // 8. 通知
  showToast(`世界书中浮现出一个新的身影……${characterCard.name}`)
}
```

### 5.6 Step 4: 淡出机制

```js
/**
 * 处理角色淡出
 * 当 exposureScore 低于 fadeOutThreshold 时触发
 */
async function handleFadeOut(worldBook, charId, exposureEntry) {
  const oldStage = exposureEntry.stage
  exposureEntry.stage = Math.max(1, oldStage - 1)
  exposureEntry.fadedAt = new Date().toISOString()

  if (oldStage >= 3 && exposureEntry.stage < 3) {
    // 从核心降级：降低在 prompt 中的优先级
    // 不删除角色，只是降低出现频率
    await notifyPlayer(`${exposureEntry.name} 似乎渐渐淡出了你的视线……`)
  }
}

/**
 * 删除角色（玩家主动操作）
 */
export async function deleteCharacter(worldBook, charId) {
  // 1. 从 worldBook.characters 移除
  worldBook.characters = worldBook.characters.filter(c => c.id !== charId)

  // 2. 清理 relationships
  if (worldBook.relationships) {
    delete worldBook.relationships[charId]
    for (const [, targets] of Object.entries(worldBook.relationships)) {
      delete targets[charId]
    }
  }

  // 3. 清理角色状态
  await removeCharacterState(worldBook.id, charId)

  // 4. 清理日程
  await removeSchedule(worldBook.id, charId)

  // 5. 清理曝光数据
  const exposureData = await loadExposureData()
  if (exposureData[worldBook.id]) {
    delete exposureData[worldBook.id][charId]
    await saveExposureData(exposureData)
  }

  // 6. 保存
  await saveWorldBook(worldBook)
}
```

### 5.7 改动文件

| 文件 | 改动 |
|------|------|
| `src/services/exposureTracker.js` | **新增** |
| `src/services/npcPromotion.js` | **新增** |
| `src/screens/GameScreen.vue` | `generateStory` 完成后调用 `processNewDialogue()` |
| `plugins/feature-plugin-manager/` | 可能需要支持运行时角色删除的 UI 入口 |

---

## 六、虚拟时钟设计

### 6.1 决策：使用现实世界时间

不引入虚拟时钟，直接使用 `Date.now()` / `new Date()` 作为时间驱动。

### 6.2 各系统如何使用现实时间

| 系统 | 使用方式 |
|------|----------|
| **日程系统** | 已使用现实时间（`getScheduleDate()` 返回当前日期，`getCurrentHour()` 返回当前小时） |
| **关系调度器** | `lastAnalyzedAt` 存储 ISO 时间戳，检查 `Date.now() - lastAnalyzedAt` |
| **曝光衰减** | 使用对话行号 + 现实时间双重维度（`lastSeenAt` 时间戳 + `lastSeenLineIndex`） |
| **角色状态** | `lastInteractedAt`、`moodExpiresAt` 均为 ISO 时间戳 |
| **世界记忆衰减** | 已使用 `createdAt` ISO 时间戳判断事件是否 fading |

### 6.3 时间相关的数据统一

所有时间字段统一使用 ISO 8601 格式（`new Date().toISOString()`），在需要的地方转换为 `Date` 对象计算差值。

---

## 七、世界记忆事件类型扩展

### 7.1 新增事件类型

当前世界记忆事件类型：`conversation`, `conflict`, `agreement`, `discovery`, `departure`, `romance`, `gift`, `betrayal`, `milestone`, `other`

**新增：**

| 类型 | 说明 | 触发场景 |
|------|------|----------|
| `daily_activity` | 角色日程活动结算 | 方案 A 日程消费 |
| `relationship_shift` | 角色关系显著变化 | 方案 B 关系分析 |
| `npc_promotion` | 新 NPC 转正 | 方案 C 角色转正 |
| `npc_fade` | NPC 淡出 | 方案 C 淡出机制 |

### 7.2 改动

修改 `extractWorldMemory` 的 prompt（在 `promptDefaults.js` 中），在事件类型列表中追加上述新类型，让 LLM 在提取世界记忆时也能识别这些类型。

---

## 八、数据流图（修订版）

```
┌──────────────────────────────────────────────────────────────────┐
│                    feature-character-state (Infra)                │
│                    角色状态统一存储 & API                          │
└──────┬────────────┬──────────────┬───────────────────────────┬────┘
       │            │              │                           │
       ▼            ▼              ▼                           ▼
┌──────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐
│ 日程系统  │  │ 关系调度器  │  │ 曝光追踪      │  │ 世界记忆          │
│ (已有)    │  │ (方案 B)    │  │ (方案 C)      │  │ (已有 + 扩展)     │
└────┬─────┘  └──────┬─────┘  └──────┬───────┘  └────────┬─────────┘
     │               │               │                    │
     │ hour:executed │ 世界记忆更新   │ 新对话生成          │ 更新事件
     │               │ 达到阈值       │                    │
     ▼               ▼               ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                    角色状态更新（通过 Infra）                       │
│  affection / mood / favor / lastInteractedAt / currentActivity    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 九、存储变更

### 9.1 新增 kvStorage key

| Key | 数据类型 | 用途 |
|-----|----------|------|
| `avg_llm_character_state_v1` | Object | 角色运行时状态（Infra） |
| `avg_llm_relationship_auto_config` | Object | 关系自动调度配置 |
| `avg_llm_character_exposure` | Object | 角色曝光追踪数据 |
| `avg_llm_exposure_config` | Object | 曝光追踪配置 |

### 9.2 现有存储修改

| Key | 修改 |
|-----|------|
| `world_books` | `characters[]` 可在运行时动态增长/缩减 |
| `world_memories` | 新增 `daily_activity`、`relationship_shift`、`npc_promotion`、`npc_fade` 事件类型 |
| `avg_llm_dormitory_runtime_v1` | 逐步迁移到 `characterStateStore`，保留兼容 |

---

## 十、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| Infra 迁移影响现有 dorm 功能 | 回归 bug | 保留 `avg_llm_dormitory_runtime_v1` 作为 fallback，双写一段时间 |
| LLM 调用频率过高 | API 费用上升 | 所有阈值可配置；默认值偏保守；生成中时推迟 |
| NPC-NPC 分析质量不如 NPC-Player | 关系变化不自然 | NPC-NPC 使用更简单的 prompt，但增加事件上下文；阈值设高一些 |
| 角色删除导致数据不一致 | 关系/日程引用不存在的角色 | 删除时级联清理；查询时做 null 检查 |
| 曝光衰减误判 | 重要角色被误衰减 | 使用 peakScore 保底；核心角色（stage 3）衰减更慢 |

---

## 十一、Phase 详细实施计划

### Phase 0: Infra — 角色状态抽取

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `plugins/feature-character-state/plugin.json` | 新建 |
| 2 | `plugins/feature-character-state/src/services/characterStateStore.js` | 纯 JS 存储层 |
| 3 | `plugins/feature-character-state/src/composable/useCharacterState.js` | Vue composable |
| 4 | `plugins/feature-character-state/src/entry.js` | 插件入口 |
| 5 | `plugins/feature-dormitory/src/DormitoryScreen.vue` | 改为通过 characterStateStore 读写 |
| 6 | `src/relationship/relationshipStore.js` | `updateRelationship` 同步写入 characterStateStore |
| 7 | `src/features/localFeaturePluginManifests.js` | 注册新插件 |
| 8 | `src/features/localFeaturePluginEntries.js` | 注册新插件入口 |

### Phase 1: 方案 A — 日程结算消费

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `src/services/scheduleStateConsumer.js` | 新建，监听 hour:executed 事件 |
| 2 | `useCharacterSchedule.js` 或 App.vue | 调用 `initScheduleConsumer()` |
| 3 | `src/memory/worldMemoryStore.js` | `addEvent` 时 dispatch `worldMemory:updated` |

### Phase 2: 方案 B — 关系自动演进

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `src/services/relationshipAutoScheduler.js` | 新建调度器 |
| 2 | `src/llm/llmService.relationship.js` | 新增 `generateNpcNpcAnalysis()` |
| 3 | `src/llm/promptDefaults.js` | 新增 `relationship:npc_npc_analysis` prompt |
| 4 | `src/memory/worldMemoryStore.js` | 写入操作 dispatch `worldMemory:updated` |
| 5 | `src/screens/GameScreen.vue` | 初始化调度器，注入依赖 |

### Phase 3: 方案 C — 曝光追踪 + 转正

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `src/services/exposureTracker.js` | 新建曝光追踪 |
| 2 | `src/services/npcPromotion.js` | 新建角色卡生成 + 转正逻辑 |
| 3 | `src/screens/GameScreen.vue` | `generateStory` 后调用 `processNewDialogue()` |
| 4 | `src/llm/llmService.core.js` 或新增 | 角色卡生成的 LLM 调用 |
| 5 | `src/llm/promptDefaults.js` | 新增角色卡生成 prompt |

---

## 十二、讨论结论记录

| 讨论点 | 结论 |
|--------|------|
| Dorm 状态怎么管理？ | 抽取为 `feature-character-state` 独立模块，作为单一数据源 |
| 关系分析数据源？ | 从世界记忆数据库分析，不从 SMS 对话提取 |
| 关系分析触发方式？ | 世界记忆数据库更新 N 次后触发，不是新增 N 条对话 |
| 非角色名提及检测？ | 方案 A：仅追踪已知角色 ID |
| LLM 调用频率控制？ | 所有阈值可配置，不写死 |
| NPC 过多怎么办？ | 先不管，支持删除角色，手机性能不是瓶颈 |
| NPC 允许淡出吗？ | 允许，exposureScore 低于阈值时自动降级阶段 |
| 区分 NPC-NPC 和 NPC-Player 吗？ | 区分，不同 prompt、不同 maxTokens、不同通知策略 |
| 世界记忆事件扩展？ | 新增 `daily_activity`、`relationship_shift`、`npc_promotion`、`npc_fade` |
| 虚拟时钟怎么做？ | 使用现实世界时间（`Date.now()`），不引入虚拟时钟 |
