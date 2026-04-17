# 「陪学」APP 方案

## 概述

在 feature-phone 的手机界面新增一个名为「陪学」的 APP（ID: `quiz`，图标: 📖），是一个 LLM 驱动的角色化互动学习工具。用户可以通过测评、URL 导入、角色陪学三种方式学习，系统根据答题表现进行评级、积累经验、解锁成就。

---

# 「书城」APP 方案

## 概述

在 feature-phone 的手机界面新增一个名为「书城」的 APP（ID: `reader`，图标: 📜），是一个 LLM 驱动的小说阅读器。基于世界书角色和设定，以小说章节体叙事，用户输入方向推进剧情。

## 核心特性

- **书架首页**：展示所有已创建的故事，支持基于已有世界书新建
- **章节阅读**：小说体纯文本 + Markdown 渲染，沉浸式阅读体验
- **下一章生成**：用户输入方向 → LLM 以叙事者模式生成下一章
- **目录管理**：章节列表、阅读进度标记
- **阅读设置**：字体大小、行间距、主题（深色/浅色/羊皮纸）

## 输出格式（非 JSON，用分隔符协议）

```
|title=第一章：晨星的觉醒|
章节正文内容...（支持 Markdown）
|end|
|suggestions=方向A|方向B|方向C|
```

- `|title=...|` — 章节标题
- `|end|` — 正文结束标记
- `|suggestions=A|B|C|` — 下一章建议方向（`|` 分隔，3-4 个）

## 数据存储

```
'reader_stories'     // 所有故事
'reader_settings'    // 全局设置（字体、主题等）
```

## 文件结构

```
plugins/feature-reader/
  plugin.json
  src/
    entry.js
    ReaderScreen.vue                  # APP 入口
    components/reader/
      BookShelfView.vue               # 书架
      NewStoryView.vue                # 新建故事
      ReaderView.vue                  # 阅读器
      ChapterListView.vue             # 目录
      ReaderSettingsView.vue          # 设置
    composables/
      useReaderData.js                # kvStorage
    styles/
      reader.css                      # 阅读器样式

src/llm/
  llmService.reader.js               # LLM 服务
```

## 开发阶段

| 阶段 | 内容 |
|------|------|
| P0 | 插件骨架 + 书架首页 + 数据存储 + APP 注册 |
| P1 | 新建故事（选世界书 + 简介）+ 第一章生成 |
| P1 | 阅读器界面（Markdown 渲染 + 下一章生成） |
| P2 | 目录 + 阅读设置（字体/主题/行距） |

## 三条内容来源

| 来源 | 入口 | 流程 |
|------|------|------|
| **测评** | 首页 → 测评 | 输入主题 → LLM 出题 → 答题 → 评级 |
| **URL 导入** | 首页 → 导入链接 | 粘贴 URL → LLM 自行搜索解析 → 生成教学+测评 |
| **角色陪学** | 首页 → 角色陪学 | 选主题/URL + 选一个世界书角色 → 角色风格讲课 |

## 核心功能

### 1. 测评系统

- 用户输入学习主题（如 "Python基础"）
- LLM 生成 3-5 套不同难度题目（每套 3-5 题，选择题/判断题）
- 用户逐题作答
- LLM 评分 → 给出评级（D/C/B/A/S）
- 评级保存到 profile

### 2. URL 导入

- 用户粘贴 URL
- LLM 收到 URL，自行搜索/解析
- 返回 JSON: `{title, summary, keyPoints, teachingContent, quizQuestions}`
- 用户可选择「先看教学」或「直接做题」
- URL 解析结果缓存到 kvStorage，避免重复解析

### 3. 角色陪学（核心）

- 用户选择学习来源：输入自由主题 或 粘贴 URL
- 从世界书角色列表中选择一位讲师（或选「默认不使用角色」）
- LLM 以角色身份**一次性生成**大段教学内容 + 随堂测试题
- 展示教学内容，底部有输入框
- 用户阅读后可以追问，追问后进入对话模式（携带上下文 + 角色信息）
- 随堂测试题可作答，答完出解析

### 4. 练习系统

- 根据当前评级生成对应难度题目
- 答完即时评判 + LLM 生成讲解
- 记录答题结果到历史

### 5. 评级与成长

- **评级**：D/C/B/A/S 五档，根据正确率、题目难度加权计算
- **经验值（XP）**：答对获得 XP，难度加成，Combo 加成
- **等级（Level）**：XP 累积升级
- **成就系统**：初次尝试、连胜 5 题、满分通关、名师高徒、博采众长等
- **成长统计**：近 7 天答题数、正确率趋势

## UI 设计

### 首页

```
┌───────────────────────────┐
│  📖 陪学           ⚙️ 📊  │
├───────────────────────────┤
│                           │
│  ╭─────────────────────╮  │
│  │  🧠 评级: B  Lv.7   │  │
│  │  ████████░░ 67% XP  │  │
│  ╰─────────────────────┘  │
│                           │
│  ┌───────────┐ ┌───────┐  │
│  │ 🎓        │ │ 📝    │  │
│  │ 角色陪学   │ │ 练习  │  │
│  └───────────┘ └───────┘  │
│  ┌───────────┐ ┌───────┐  │
│  │ 🔗        │ │ 📋    │  │
│  │ 导入链接   │ │ 历史  │  │
│  └───────────┘ └───────┘  │
│                           │
│  ── 最近 ──                │
│  ✓ Python 答对 +12XP      │
│  🎓 亚瑟讲了骑士精神      │
│  🔗 解析了一个 URL         │
│                           │
└───────────────────────────┘
```

### 陪学设置页

```
┌───────────────────────────┐
│ ← 返回    设置陪学         │
├───────────────────────────┤
│                           │
│  学习内容                  │
│  ┌─────────────────────┐  │
│  │ ○ 自由主题          │  │
│  │ ┌─────────────────┐ │  │
│  │ │ Python基础...    │ │  │
│  │ └─────────────────┘ │  │
│  │ ○ 导入链接          │  │
│  │ ┌─────────────────┐ │  │
│  │ │ https://...      │ │  │
│  │ └─────────────────┘ │  │
│  └─────────────────────┘  │
│                           │
│  选择讲师                  │
│  ┌─────────────────────┐  │
│  │ 🔍 搜索角色...       │  │
│  ├─────────────────────┤  │
│  │ ▸ 奇幻学院           │  │
│  │  🧙亚瑟 ⚔️露娜 🧝艾琳│  │
│  │ ▸ 都市谜谭           │  │
│  │  🕵️老K 👩‍💻苏苏       │  │
│  ├─────────────────────┤  │
│  │ 🤖 不使用角色        │  │
│  └─────────────────────┘  │
│                           │
│       ┌──────────┐        │
│       │  开始陪学 │        │
│       └──────────┘        │
└───────────────────────────┘
```

### 陪学进行中

```
┌───────────────────────────┐
│ ← 结束    亚瑟的陪学       │
├───────────────────────────┤
│  ┌────┐                    │
│  │🧙  │ 好了，听好了！     │
│  │亚瑟│                    │
│  └────│ 骑士精神的核心有   │
│       │ 三点：             │
│       │                    │
│       │ 第一，勇气。不是   │
│       │ 不害怕，而是害怕   │
│       │ 时仍然前行...      │
│       │ （大段讲解内容）   │
│       │                    │
│       │ ── 随堂小测 ──     │
│       │ 以下哪项体现骑士   │
│       │ 精神？             │
│       │ [A] [B] [C] [D]    │
│       │                    │
│       │ [确认答案]         │
├───────┴───────────────────┤
│  💬 有什么疑问？可以问我  │
└───────────────────────────┘
```

## 技术实现

### 文件结构

```
plugins/feature-phone/src/
  phone/
    PhoneQuizApp.vue                  # APP 入口（view 路由分发）
    components/quiz/
      QuizHomeView.vue                # 首页（评级展示 + 功能入口）
      QuizAssessmentView.vue          # 测评流程
      QuizUrlImportView.vue           # URL 导入页面
      QuizTeachingSetupView.vue       # 陪学设置（选来源 + 选讲师）
      QuizTeachingView.vue            # 陪学进行中（角色讲解 + 互动）
      QuizQuestionView.vue            # 答题界面
      QuizExplanationView.vue         # 答案解析
      QuizPracticeView.vue            # 自由练习
      QuizStatsView.vue               # 成长统计
      QuizAchievementsView.vue        # 成就列表
      QuizHistoryView.vue             # 历史记录 / 错题本
      QuizCharacterPicker.vue         # 角色选择器（可复用组件）
    composables/
      useQuizEngine.js                # LLM 交互（出题、评分、解析URL、角色教学）
      useQuizProgress.js              # XP、等级、成就管理
      useQuizData.js                  # kvStorage 数据层

src/llm/
  llmService.quiz.js                  # 新增：Quiz 相关 LLM 服务
```

### LLM 服务函数（`llmService.quiz.js`）

| 函数 | 用途 |
|------|------|
| `generateQuizQuestions(params)` | 生成题目（测评/练习通用） |
| `parseUrlContent(url)` | 解析 URL → 教学+测评 JSON |
| `generateTeachingContent(params)` | 角色风格教学（一次性生成大段） |
| `generateTeachingReply(params)` | 追问回复（对话模式，携带上下文） |
| `gradeAnswer(params)` | 判分 + 生成解析 |
| `calculateRating(params)` | 计算评级 |

### kvStorage 键

```
'phone_quiz_profile'          // 评级、XP、等级
'phone_quiz_history'          // 答题记录
'phone_quiz_achievements'     // 成就状态
'phone_quiz_topics'           // 已学主题列表
'phone_quiz_stats'            // 每日统计（答题数、正确率、学习时长）
'phone_quiz_wrong'            // 错题本
'phone_quiz_url_cache'        // URL 解析缓存
'phone_quiz_teaching_sessions' // 陪学会话记录
```

### APP 注册

在 `PhoneScreen.vue` 的 `APP_MAP` 中添加：

```js
quiz: { component: PhoneQuizApp, icon: '📖', name: '陪学' }
```

### LLM Prompt 设计

#### URL_PARSE_SYSTEM_PROMPT

LLM 收到 URL 后自行搜索解析，返回严格 JSON：

```json
{
  "title": "主题名称",
  "summary": "200字以内摘要",
  "keyPoints": ["知识点1", "知识点2"],
  "difficulty": "beginner",
  "teachingContent": "800字以内完整教学",
  "quizQuestions": [
    {
      "type": "multiple_choice",
      "question": "题目",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "解析"
    }
  ]
}
```

#### TEACHING_SYSTEM_PROMPT

扮演指定角色讲解知识。规则：
1. 保持角色一致性（语气、用词、态度）
2. 知识点必须准确
3. 可以举角色世界观中的例子
4. 一次性生成大段讲解 + 随堂测试题

#### 追问模式

用户追问后切换为对话模式，携带：
- 角色完整信息（name, identity, personalityProfile, background, notes）
- 已生成的教学内容（作为上下文）
- 用户追问内容

### 角色数据复用

复用 `usePhoneData.js` 已有的 `getGroupedContacts()` 获取世界书角色列表，`getWorldBookById()` 获取完整世界书信息。

### LLM 调用方式

参考 `llmService.phone.js` 中的 `generatePhoneSmsReply` 模式，使用 `callChatCompletion()` 调用。

## 开发阶段

| 阶段 | 内容 |
|------|------|
| **P0** | APP 注册 + 首页 UI + kvStorage 基础结构 |
| **P1** | 测评系统：主题输入 → LLM 出题 → 答题 → 评级 |
| **P1** | URL 导入：粘贴 URL → LLM 解析 → 展示 |
| **P1** | 角色选择器 + 陪学设置页 + 陪学进行页 |
| **P2** | 陪学追问（对话模式切换） |
| **P2** | 自由练习（根据评级出题） |
| **P2** | XP + 等级 + 成就系统 |
| **P3** | 成长统计图表 |
| **P3** | 错题本 + 历史回顾 |
