# feature-load-save

“载入存档”主菜单按钮插件化模块。

当前形态：

1. 通过 `plugin.json` 向主菜单注册按钮（标题/图标/排序/路由）
2. 由 Host 在 `src/features/localFeaturePluginManifests.js` 读取并校验
3. 页面已下沉到 `plugins/feature-load-save/src/SaveLoadScreen.vue`

后续可演进：

1. 拆分“载入存档”和“载入备份”入口策略
2. 将 `entry.module` 升级为真实组件挂载入口
3. 与存档系统 API 统一插件能力契约
