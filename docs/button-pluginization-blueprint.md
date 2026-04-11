# 主界面按钮插件化 + Monorepo 迁移蓝图

## 1. 目标

把“主界面按钮关联功能”拆成独立模块（workspace），Host 只负责：

1. 按钮菜单编排
2. 全局状态与存档能力
3. 平台桥接（Electron/Capacitor）

## 2. 适用范围（当前 App 路由键）

当前 `src/App.vue` 中可插件化的功能入口：

1. `settings`
2. `save-load`
3. `worldbook-shelf` / `worldbook-editor`
4. `plugin-manager`
5. `narrator-manager`
6. `card-collection`
7. `adventure-game`

建议暂不插件化：

1. `start`（壳层入口）
2. `game`（主流程壳层与核心上下文）

## 3. Monorepo 目录建议

```text
apps/
  desktop-host/            # 当前 Vue 宿主应用
  electron-main/           # Electron main/preload
packages/
  plugin-sdk/              # 插件契约与校验
  game-core/               # 通用游戏规则与纯逻辑
  llm-client/              # LLM 调用与提示词管理
plugins/
  feature-settings/
  feature-save-load/
  feature-worldbook/
  feature-narrator/
  feature-cards/
  feature-adventure/
```

## 4. 按钮插件契约（建议）

最小必填字段：

1. `id/name/version/apiVersion/runtime`
2. `menu.key/menu.title`
3. `entry.type/entry.module`
4. `storage.namespace`

说明：

1. `menu` 决定主界面按钮如何渲染和排序。
2. `entry` 决定加载方式（组件、路由或服务）。
3. `storage.namespace` 保证插件存档隔离，避免串档。

## 5. Host 提供给插件的能力边界

插件只通过 Host API 访问能力，不直接耦合全局实现：

1. `storage`：命名空间读写
2. `llm`：统一模型调用层
3. `events`：跨插件事件总线
4. `platform`：Electron/Android 能力代理
5. `save-system`：统一存档入口

## 6. 渐进迁移顺序（低风险）

1. `feature-card-collection`（读多写少）
2. `feature-narrator`（中等复杂度）
3. `feature-worldbook`（编辑器 + 数据模型）
4. `feature-save-load`（需对齐 host 存档协议）
5. `feature-adventure`（复杂交互）
6. 最后考虑 `handheld-xx-dungeon-adventure` 全插件化/远程化

## 7. 何时启用 Module Federation

仅在以下条件满足时启用：

1. 功能模块需要独立发布节奏
2. 模块体积明显拖慢 host 构建
3. 模块边界已稳定（API 变化低）

否则保持 workspace 本地依赖即可。

## 8. 里程碑验收标准

1. Host 可根据注册表动态渲染按钮，不写死按钮列表。
2. 任意按钮功能可独立启用/禁用，不影响其他模块。
3. 插件存档隔离（按 `storage.namespace`）。
4. Electron/Android 构建流程不回归。
5. `npm run build` 与后续 `pnpm -r build` 均可通过。

## 9. 当前进度（2026-04-09）

已完成样板：

1. `card-collection` 已迁为本地功能插件清单：`plugins/feature-card-collection/plugin.json`
2. `narrator-manager` 已迁为本地功能插件清单：`plugins/feature-narrator-manager/plugin.json`
3. `plugin-manager` 已迁为本地功能插件清单：`plugins/feature-plugin-manager/plugin.json`
4. `settings` 已迁为本地功能插件清单：`plugins/feature-settings/plugin.json`
5. `worldbook` 已迁为本地功能插件清单：`plugins/feature-worldbook/plugin.json`
6. `adventure-game` 已迁为本地功能插件清单：`plugins/feature-adventure-game/plugin.json`
7. `continue` 已迁为本地功能插件清单：`plugins/feature-continue/plugin.json`
8. `load-save` 已迁为本地功能插件清单：`plugins/feature-load-save/plugin.json`
9. `new-game` 已迁为本地功能插件清单：`plugins/feature-new-game/plugin.json`（通过 `action.type=new-game-dialog`）
10. `StartMenu` 已通过注册中心 + 本地插件清单注入按钮（无内置业务按钮）
11. `card-collection` 页面已下沉到插件目录：`plugins/feature-card-collection/src/CardCollectionScreen.vue`
12. `plugin-manager` 页面已下沉到插件目录：`plugins/feature-plugin-manager/src/PluginManagerScreen.vue`
13. `settings` 页面已下沉到插件目录：`plugins/feature-settings/src/SettingsScreen.vue`
14. `narrator-manager` 页面已下沉到插件目录：`plugins/feature-narrator-manager/src/NarratorManagerScreen.vue`
15. `save-load` 页面已下沉到插件目录：`plugins/feature-load-save/src/SaveLoadScreen.vue`
16. `worldbook-shelf/worldbook-editor` 页面已下沉到插件目录：`plugins/feature-worldbook/src/*`
17. `adventure-game` 页面已下沉到插件目录：`plugins/feature-adventure-game/src/AdventureGameScreen.vue`
18. `src/screens` 仅保留壳层页面：`StartScreen.vue`、`GameScreen.vue`
19. `adventure-game` 已改为异步加载 `handheld-xx-dungeon-adventure`，拆出独立 chunk
20. `App.vue` 已改为通过 `src/features/pluginScreenRegistry.js` 动态渲染插件页面（保留 `start/game` 壳层）
21. `StartScreen` 已改为按 `action.type` 分发菜单点击（`new-game-dialog` 不再依赖 `id==='new-game'`）
22. `pluginScreenRegistry` 已支持按本地插件 manifest 自动装配 route->screen（仍保留 `worldbook-editor` 扩展路由）
23. 插件 `entry.js` 已可声明 `resolveRouteConfig/resolveExtraRouteConfigs`，Host 通过 `src/features/localFeaturePluginEntries.js` 装配页面组件与事件
24. 新增 `src/features/featurePluginRuntimeState.js`，支持功能插件启用状态本地持久化与事件通知
25. `App.vue` 已按功能插件启用状态动态过滤启动菜单与页面路由；插件管理页已增加“功能按钮插件”开关并可实时生效
26. 插件管理页已增加“恢复默认”按钮，可一键清除功能插件启用覆盖并回到 manifest 默认值
27. 功能插件支持“单个恢复默认”操作（仅清除目标插件 override，不影响其他插件）
28. 插件管理页新增“运行时覆盖诊断（JSON）”视图与“复制覆盖JSON”按钮，便于排查功能插件启用覆盖状态
29. 插件管理页新增“应用覆盖JSON”能力（粘贴 JSON 一次性写入运行时开关，支持格式/值校验与未知插件忽略提示）
30. 插件管理页新增“导入JSON文件 / 导出JSON文件”能力，支持覆盖配置文件化备份与恢复
