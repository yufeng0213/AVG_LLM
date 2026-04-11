# feature-card-collection

首个“主菜单按钮功能插件化”样板。

当前形态：

1. 通过 `plugin.json` 向主菜单注册按钮（标题/图标/排序/路由）
2. 由 Host 在 `src/features/localFeaturePluginManifests.js` 读取并校验
3. 页面已下沉到 `plugins/feature-card-collection/src/CardCollectionScreen.vue`

后续可演进：

1. 把卡片服务依赖（`src/cards/*`）进一步抽成可复用 package
2. 将 `entry.module` 升级为真实组件挂载入口
3. 再决定是否升级为 Module Federation remote
