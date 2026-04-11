# feature-settings

“设置”主菜单按钮插件化模块。

当前形态：

1. 通过 `plugin.json` 向主菜单注册按钮（标题/图标/排序/路由）
2. 由 Host 在 `src/features/localFeaturePluginManifests.js` 读取并校验
3. 页面已下沉到 `plugins/feature-settings/src/SettingsScreen.vue`

后续可演进：

1. 把设置项面板（`src/settings/*`）进一步内聚到插件目录或 `packages/game-core`
2. 将 `entry.module` 升级为真实组件挂载入口
3. 与平台配置能力做 API 边界收敛
