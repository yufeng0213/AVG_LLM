# AI 上下文减负拆分计划（Phase-based）

目标：降低 AI 改动时的读取体积与跨模块误读概率，优先处理高耦合/超大文件。

## Phase 0（已执行）

1. 修正上下文路由与代码地图的旧路径。
2. 让 `ctx` 输出与当前插件化目录一致，避免 AI 读到已迁移的废路径。

验收：

1. `npm run ctx -- --task "世界书编辑器" --mode logic` 命中 `plugins/feature-worldbook/*`。
2. `npm run ctx -- --task "插件管理页面按钮" --mode logic` 命中 `plugins/feature-plugin-manager/*`。

## Phase 1（最高优先，先做）

### 1. 地下城插件主文件拆分

目标文件：`src/plugins/handheld-xx-dungeon-adventure/index.vue`

进度（2026-04-09）：

1. 已拆 `logic/merchantEquipment.js`（商人卖出价区间、折价计算、全槽位卸装）。
2. 已拆 `logic/merchantItems.js`（商人商品存取、本地池子生成）。
3. 已拆 `logic/merchantGeneration.js`（LLM 商品生成 + 本地回退）。
4. 已拆 `logic/merchantTransactions.js`（购买/卖出交易计算）。
5. 已拆 `logic/dungeonMapGeneration.js`（楼层地图 LLM 生成 + 本地兜底）。
6. 已拆 `logic/bedroomGeneration.js`（卧室家具 LLM 草稿生成 + 本地回退）。
7. 已拆 `logic/bedroomPlacement.js`（碰撞判定、随机落位、本地家具草稿模板）。
8. 已拆 `logic/bedroomFurnitureApply.js`（家具草稿应用到状态树，含 z 排序规则）。
9. 已拆 `logic/worldbookRuntime.js`（世界书快照读取、角色签名、队友映射）。
10. 已拆 `logic/campfireCompanionRuntime.js`（篝火同伴回退、合并、队友角色同步）。
11. 已拆 `logic/campfireEnsure.js`（篝火同伴刷新主流程，含 LLM 分批生成策略）。
12. 已拆 `logic/battleProgression.js`（抽卡稀有度、单次出装、升级晋升、按层敌人生成）。
13. 已拆 `state/storageScope.js`（存档 key 作用域计算）。
14. 已拆 `state/persistence.js`（统一存档 payload 构建、restore/persist 封装）。
15. 已拆 `logic/dungeonSceneRuntime.js`（LLM 场景获取、本地回退、战利品归一化）。
16. 已拆 `logic/dungeonExploreResult.js`（探索事件结算：战斗/宝箱/陷阱）。
17. 已拆 `logic/campfireInput.js`（篝火布局 key、布局读取、拖拽坐标转换与布局裁剪）。
18. 已拆 `logic/bedroomInput.js`（卧室指针网格坐标、拖拽落点计算、拖拽状态构建）。
19. 已拆 `logic/dungeonLocalContent.js`（装备池与本地场景/闲聊文案数据）。
20. 已拆 `logic/campfireLoopRuntime.js`（篝火气泡与帧循环计时器运行时控制）。
21. 已拆 `render/pixelGrid.js`（像素网格基础函数与尺寸常量）。
22. 已拆 `render/campfireSprites.js`（篝火/队员像素小人渲染与样式映射）。
23. 已拆 `render/dungeonSprites.js`（地下城地形/物件像素 sprite 渲染与显示判定）。
24. 已拆 `logic/dungeonCellView.js`（格子 badge/class/title 展示逻辑）。

拆分到：

1. `src/plugins/handheld-xx-dungeon-adventure/state/`（state 构建、normalize、persist）
2. `src/plugins/handheld-xx-dungeon-adventure/logic/`（战斗、掉落、商店/卧室规则）
3. `src/plugins/handheld-xx-dungeon-adventure/render/`（sprite/tile 像素渲染）
4. `src/plugins/handheld-xx-dungeon-adventure/input/`（键盘与拖拽交互）

验收：

1. `index.vue` 降到 `< 2500` 行。
2. `npm run build` 通过。
3. 战斗、商店、卧室、地图移动回归可用。

### 2. LLM 手持服务拆分

目标文件：`src/llm/llmService.handheld.js`

拆分到：

1. `src/llm/handheld/dungeon*.js`
2. `src/llm/handheld/merchant*.js`
3. `src/llm/handheld/bedroom*.js`
4. `src/llm/handheld/shared-normalizers.js`

验收：

1. `llmService.handheld.js` 仅做聚合导出，行数显著下降。
2. 所有 `generateHandheld*` API 签名不变。

## Phase 2（中优先）

### 1. 剧情主屏拆 composables

目标文件：`src/screens/GameScreen.vue`

拆分建议：

1. `src/screens/game/composables/useRelationshipRuntime.js`
2. `src/screens/game/composables/useTtsPlayback.js`
3. `src/screens/game/composables/useLlmSettings.js`
4. `src/screens/game/composables/useCgAndCardPanels.js`

验收：

1. `GameScreen.vue` `< 2200` 行。
2. 存读档、旁白、关系系统、CG 生成不回归。

### 2. 掌机容器拆小游戏状态机

目标文件：`src/components/HandheldConsole.vue`

拆分建议：

1. `src/components/handheld/games/2048.js`
2. `src/components/handheld/games/minesweeper.js`
3. `src/components/handheld/games/tetris.js`
4. `src/components/handheld/games/brick.js`
5. `src/components/handheld/games/klotski.js`

验收：

1. `HandheldConsole.vue` `< 2200` 行。
2. 5 个小游戏功能一致。

## Phase 3（可选，按收益再做）

1. Phone 模块继续拆 `sms/moments/forum/news/map/shop` 子 composables。
2. `packages/game-core` 实际承接纯逻辑（地图、战斗、掉落）并补最小单测。
3. 再评估是否引入 Module Federation（仅在独立发布节奏强需求下）。

## 每阶段统一验证

1. `npm run plugins:validate`
2. `npm run build`
3. 手动冒烟：
   - 主菜单按钮跳转
   - 插件管理页开关/导入导出 JSON
   - 地下城进入战斗与掉落
