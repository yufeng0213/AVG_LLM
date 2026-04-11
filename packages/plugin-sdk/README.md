# @avg-llm/plugin-sdk

按钮功能插件化的最小 SDK（当前提供 manifest 校验与菜单排序）。

## API

1. `validateFeaturePluginManifest(manifest)`
2. `assertFeaturePluginManifest(manifest)`
3. `sortFeaturePluginMenus(pluginList)`

## 目标

1. 统一插件元数据格式
2. 在 Host 启动时提前发现插件配置错误
3. 为后续 Module Federation 远程插件做协议约束

