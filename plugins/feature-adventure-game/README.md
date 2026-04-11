# feature-adventure-game

“冒险游戏”主菜单按钮插件化模块。

当前形态：

1. 通过 `plugin.json` 向主菜单注册按钮（标题/图标/排序/路由）
2. 由 Host 在 `src/features/localFeaturePluginManifests.js` 读取并校验
3. 页面已下沉到 `plugins/feature-adventure-game/src/AdventureGameScreen.vue`

后续可演进：

1. 把战斗与地图子模块按包边界进一步拆分
2. 将 `entry.module` 升级为真实组件挂载入口
3. 评估独立发布节奏后再决定是否远程化
