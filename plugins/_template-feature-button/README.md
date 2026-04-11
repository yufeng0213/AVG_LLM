# Feature Button Plugin Template

这个模板用于“主界面按钮 -> 独立功能模块”的插件化迁移。

## 结构

```text
plugins/_template-feature-button/
  plugin.json
  src/
    entry.js
```

## 使用方式

1. 复制模板目录为新目录，例如 `plugins/feature-worldbook`。
2. 修改 `plugin.json` 的 `id/name/menu/entry/storage`。
3. 在 `src/entry.js` 里导出插件入口组件或路由挂载函数。
4. 在 Host 的插件注册中心中注册该插件（后续接入）。

