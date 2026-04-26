# 角色卡牌系统设计文档

> 类似灵犀、恋与等乙女向游戏的角色卡牌系统：收集、养成、出战、专属剧情。

---

## 核心概念

```
角色（固定存在）
  ├── 角色·海岛风情（SR，夏日主题）
  ├── 角色·暗夜迷情（SSR，哥特主题）
  ├── 角色·校园日常（R，普通主题）
  └── 角色·未来纪元（UR，科幻主题）
        ├── 等级培养（1→100，消耗资源）
        ├── 进阶/突破（星级1→6，消耗同名卡或碎片）
        ├── 卡牌剧情（LLM生成专属故事线）
        ├── 活动限定（限时获取）
        └── 好感度（约会/互动提升）
```

## 数据模型

### 1. 卡牌定义 (CharacterCard)
```js
{
  id: "card_li_zechen_summer_sr",
  characterId: "character_li_zechen",  // 关联的固定角色
  name: "李泽言·海岛风情",
  shortName: "海岛风情",
  rarity: "SR",                         // N, R, SR, SSR, UR
  theme: "summer",                      // 主题标签
  tags: ["夏日", "海边", "度假"],       // 卡牌标签
  artwork: "dataUrl_or_path",           // 卡面图
  // 基础属性（稀有度决定初始值）
  baseStats: {
    attack: 120,
    defense: 80,
    charm: 150,
    luck: 60,
  },
  // 养成上限
  maxLevel: 80,                         // 稀有度决定
  maxStar: 4,                           // 稀有度决定
  // 技能
  skills: [
    { id: "skill_1", name: "海风守护", type: "active", effect: "defense_boost", value: 30, cooldown: 3 }
  ],
  // 卡牌剧情
  cardStories: [
    { id: "story_1", title: "海边的约定", unlockCondition: { affinity: 50 }, llmSeed: "海边度假时..." }
  ],
  // 获取方式
  obtainMethod: "gacha" | "story" | "event" | "shop",
  obtainSource: "夏日卡池",
}
```

### 2. 玩家卡牌实例 (PlayerCard)
```js
{
  cardId: "card_li_zechen_summer_sr",   // 指向卡牌定义
  instanceId: "instance_xxx",           // 唯一实例ID
  level: 35,
  exp: 1200,
  stars: 2,                             // 进阶星级
  affinity: 120,                        // 好感度 (0-200)
  storiesUnlocked: ["story_1"],         // 已解锁剧情
  obtainedAt: 1713000000000,            // 获取时间
  // 培养消耗记录
  resourceCost: {
    gold: 5000,
    crystal: 200,
    training_book: 10,
  },
}
```

### 3. 卡池定义 (CardPool)
```js
{
  id: "pool_summer_2025",
  name: "夏日限定卡池",
  description: "海风拂过...",
  type: "limited",                      // standard | limited | event
  startTime: 1713000000000,
  endTime: 1715592000000,
  cards: [
    { cardId: "card_xxx", rate: 0.03, guaranteed: true },  // UP卡
    { cardId: "card_yyy", rate: 0.12 },
  ],
  currency: "crystal",                  // 消耗货币
  costPerPull: 160,                     // 单次抽取消耗
  guaranteedPity: 60,                   // 保底抽数
  guaranteedCardId: "card_xxx",         // 保底卡牌
}
```

### 4. 卡牌剧情 (CardStory)
```js
{
  cardId: "card_xxx",
  storyId: "story_1",
  title: "海边的约定",
  // LLM 生成字段
  dialogue: [
    { speaker: "李泽言", text: "...", emotion: "smile" },
    { speaker: "你", text: "...", emotion: "happy" },
  ],
  // 解锁后固定
  unlocked: true,
  // 养成加成
  reward: {
    affinity: 20,
    gold: 500,
  },
}
```

## 系统关系图

```
┌─────────────────────────────────────────────────┐
│              世界聚合页 (WorldHub)                │
│  主线  │  回忆卡  │  角色卡  │  手机  │  ...     │
└────────────┬────────────────────────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌─────────┐    ┌──────────────────┐
│ 回忆卡   │    │ 角色卡牌系统      │
│ (原剧情卡)│    │                  │
│ 收藏/展示│    │ ┌──────────────┐ │
│ 导出PNG │    │ │ 卡池/抽卡    │ │
└─────────┘    │ │ 卡牌列表/详情│ │
               │ │ 等级培养      │ │
               │ │ 进阶/突破    │ │
               │ │ 卡牌剧情     │ │
               │ │ 出战编队     │ │
               │ └──────┬───────┘ │
               └────────┼─────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ 战斗系统 │  │ 主线剧情 │  │ 基建系统 │
    │ (属性加成)│  │ (专属线) │  │ (产出加成)│
    └──────────┘  └──────────┘  └──────────┘
```

## 与已有系统的交互

| 已有系统 | 交互方式 |
|----------|----------|
| **经济系统** | 抽卡消耗金币/钻石，培养消耗资源 |
| **战斗系统** | 出战选卡牌，卡牌属性影响战斗数值 |
| **基建系统** | 卡牌好感度影响设施产出加成 |
| **社交/任务** | 卡牌解锁专属约会/线索收集事件 |
| **LLM** | 卡牌剧情、活动事件、约会对话由LLM生成 |

## 实施计划

### 阶段1：卡牌数据模型 + 收集 + 展示
- [x] 插件骨架创建（`feature-character-card`）
- [x] 卡牌定义数据模型 + 存储
- [x] 卡牌展示UI（列表、详情、卡面展示）
- [x] 测试用预设卡牌
- [x] 卡池入口按钮（主页→抽卡）

### 阶段2：抽卡系统
- [x] 卡池配置（gacha卡牌过滤）
- [x] 抽卡动画 + 概率逻辑（单抽/10连）
- [x] 保底机制（60抽SSR+，递增概率）
- [x] 获取记录（历史存储）
- [x] 钻石消耗联动

### 阶段3：养成系统
- [x] 等级培养（经验值、升级消耗）
- [x] 进阶/突破（星级、升星）
- [x] 好感度系统（自动解锁剧情）

### 阶段4：出战编队
- [ ] 编队界面（选择3-5张卡牌）
- [ ] 卡牌属性接入战斗系统
- [ ] 卡牌技能在战斗中释放

### 阶段5：卡牌剧情（LLM驱动）
- [ ] 卡牌专属剧情生成
- [ ] 好感度解锁机制
- [ ] 剧情阅读UI

### 阶段6：活动系统
- [ ] 限时活动框架
- [ ] 活动限定卡牌
- [ ] 活动任务/奖励

## 稀有度设计

| 稀有度 | 颜色 | 卡面效果 | 初始属性 | 等级上限 | 星级上限 | 抽卡概率 |
|--------|------|----------|----------|----------|----------|----------|
| N | 灰色 | 无特效 | 基础 | 40 | 1 | 40% |
| R | 白色 | 微光 | 基础×2 | 60 | 2 | 35% |
| SR | 蓝色 | 流光 | 基础×5 | 80 | 4 | 18% |
| SSR | 金色 | 粒子特效 | 基础×10 | 90 | 5 | 5.5% |
| UR | 彩虹 | 全息动画 | 基础×15 | 100 | 6 | 1.5% |

## 培养资源类型

| 资源 | 用途 | 来源 |
|------|------|------|
| **金币** | 基础升级消耗 | 日常产出、战斗掉落 |
| **经验书** | 卡牌经验值直接注入 | 任务奖励、商店 |
| **突破石** | 进阶/突破消耗 | 关卡、活动 |
| **同名卡/碎片** | 星级突破 | 抽卡重复获得、活动 |
| **好感道具** | 提升卡牌好感度 | 约会、任务 |

## 文件结构（预期）

```
plugins/feature-character-card/
  plugin.json
  src/
    entry.js                           # 路由入口
    CharacterCardScreen.vue            # 主界面（Tab: 卡池/卡牌/编队）
    components/
      CardPoolScreen.vue               # 卡池/抽卡界面
      CardDetailScreen.vue             # 卡牌详情
      CardLevelUpScreen.vue            # 等级培养
      CardEvolutionScreen.vue          # 进阶突破
      CardStoryScreen.vue              # 卡牌剧情阅读
      TeamEditScreen.vue               # 编队编辑
      PullAnimation.vue                # 抽卡动画
    composables/
      useCardCollection.js             # 玩家卡牌集合管理
      useCardPool.js                   # 卡池/抽卡逻辑
      useCardLeveling.js               # 培养逻辑
      useTeamEdit.js                   # 编队管理
    services/
      cardData.js                      # 卡牌定义数据
      cardStoryGeneration.js           # LLM卡牌剧情生成
```
