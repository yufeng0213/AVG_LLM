# handheld-xx-dungeon-adventure 维护说明

> 目标：后续改逻辑前，先查本文件定位关联代码，避免在超大 `index.vue` 里盲改。

全局规则参考：`docs/LLM_EDIT_PLAYBOOK.md`

## 1. 改动入口规则（先看这里）

1. 先读本文件的“功能-文件映射”，确认目标功能在哪些文件。
2. 逻辑改动优先只看脚本和 `logic/*.js`，不要把 `styles/split/*.css` 一起交给 LLM。
3. 纯视觉改动只动 `styles/split/*.css`，不改业务逻辑。
4. 既要改逻辑又要改样式时，先做逻辑改动并验证，再单独做样式改动。
5. 每次改完至少执行一次构建验证：`npm run build`。

## 2. 目录结构（当前）

- `index.vue`
  - 插件主界面、交互状态、事件流、LLM 调用整合、存档读写。
  - 只保留页面结构与核心流程编排，不再承载大段样式。
- `styles/split/index-01.css` ~ `styles/split/index-03.css`
  - 插件全部样式（含 Android 适配样式），按分片顺序加载。
  - 逻辑迭代时默认不需要阅读这个文件。
- `logic/roleEngine.js`
  - 角色职业文本规范化与回退策略：
  - `ROLE_FALLBACK_LIST`
  - `resolveClassicRole(...)`
- `logic/dungeonMapEngine.js`
  - 地下城地图相关常量与运行时逻辑工厂：
  - 地图规范化、地图可用性检查、本地 fallback 地图生成、格子查找、深拷贝等。

## 3. 功能-文件映射

- 世界书角色同步到篝火/队伍：`index.vue`
  - 关键词：`ensureCampfireCompanions`、`mergeGeneratedCompanions`、`applyCompanionRolesToTeammates`
- 职业生成/回退：`logic/roleEngine.js`
  - 在 `index.vue` 通过 `resolveClassicRole` 调用
- 地下城地图生成与本地 fallback：`logic/dungeonMapEngine.js` + `index.vue`
  - `index.vue` 中通过 `createDungeonMapRuntime(...)` 解构使用
  - 关键词：`buildDungeonMapForFloor`、`exploreDungeon`、`moveDungeon`
- 抽装备与保底：`index.vue`
  - 关键词：`drawEquipmentOne`、`drawEquipment`
- 存档隔离（世界书 + 存档槽）：`index.vue`
  - 关键词：`resolveStorageScopeKey`、`restoreState`、`schedulePersist`
- 篝火像素角色、气泡轮播、拖拽：`index.vue`
  - 关键词：`buildCampfireSpriteUri`、`startCampfireBubbleLoop`、`startCampfireDrag`

## 4. 推荐改动流程

1. 按“功能-文件映射”定位文件。
2. 先改 `logic/*.js`（如果是纯规则/算法改动），再改 `index.vue` 调用层。
3. 保持 `index.vue` 只做编排，避免再把大段可复用逻辑塞回去。
4. 样式问题最后处理，并只在 `styles/split/*.css` 修改。
5. 构建验证 + 核心行为回归（见下节）。

## 5. 最小回归清单

1. 构建通过：`npm run build`。
2. 插件可正常打开/关闭，左上触发按钮正常。
3. 首页默认只显示篝火 + 功能按钮（进入子页才切页）。
4. 地下城“推进”后能生成地图，且每层有 boss 与小怪。
5. 战报只在战斗时新增，不因普通移动刷日志。
6. Android 下标题栏与关闭按钮不变形，按钮可点击。
7. 存档隔离有效：不同世界书/存档槽互不串档。

## 6. 给 LLM 的上下文建议

- 逻辑任务：只提供 `index.vue` 的 `<script setup>` 相关片段 + `logic/*.js`。
- 样式任务：只提供 `styles/split/*.css` + 必要模板片段。
- 避免把整个 `index.vue`（尤其样式）一次性喂给 LLM，减少无关上下文与生成耗时。
