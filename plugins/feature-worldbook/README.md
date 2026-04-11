# feature-worldbook

“世界书”主菜单按钮插件化模块。

当前形态：

1. 通过 `plugin.json` 向主菜单注册按钮（标题/图标/排序/路由）
2. 由 Host 在 `src/features/localFeaturePluginManifests.js` 读取并校验
3. 页面已下沉到 `plugins/feature-worldbook/src/WorldBookScreen.vue` 与 `plugins/feature-worldbook/src/WorldBookEditorScreen.vue`

后续可演进：

1. 把世界书数据访问与编辑逻辑从 `src/worldbook/*` 进一步抽成可复用 package
2. 将 `entry.module` 升级为真实组件挂载入口
3. 再评估是否需要远程化发布
