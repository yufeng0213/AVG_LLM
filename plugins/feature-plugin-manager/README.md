# feature-plugin-manager

“插件管理”主菜单按钮插件化模块。

当前形态：

1. 通过 `plugin.json` 向主菜单注册按钮（标题/图标/排序/路由）
2. 由 Host 在 `src/features/localFeaturePluginManifests.js` 读取并校验
3. 页面已下沉到 `plugins/feature-plugin-manager/src/PluginManagerScreen.vue`

后续可演进：

1. 把插件清单读写逻辑从 `src/plugins/pluginManager.js` 进一步抽成可复用 package
2. 将 `entry.module` 升级为真实组件挂载入口
3. 再按发布节奏决定是否上 Module Federation
