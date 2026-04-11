# feature-new-game

“新游戏”主菜单按钮插件化模块。

当前形态：

1. 通过 `plugin.json` 向主菜单注册按钮（标题/图标/排序）
2. 使用 `action.type = new-game-dialog` 触发宿主弹出开局配置对话框
3. 由 Host 在 `src/features/localFeaturePluginManifests.js` 读取并校验

后续可演进：

1. 把开局参数配置流程抽为可复用动作管线
2. 将 `entry.module` 升级为真实组件挂载入口
3. 统一 action 扩展点（带 payload/schema）
