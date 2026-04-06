# 系统代码地图（最小上下文版）

目标：改任意功能前，先定位最小文件集合，避免整仓库扫描。

## 1. 全局规则

1. 先运行：

```bash
npm run ctx -- --task "你的需求" --mode logic
```

2. 只读取 `Must Read` 文件；需要时再补 `Optional Read`。
3. 逻辑任务默认不读 CSS。
4. 样式任务默认先读 CSS，再补最小模板片段。
5. 目录默认跳过：`node_modules/`、`dist/`、`android/app/build/`、`android/app/src/main/assets/public/`。

## 2. 模块边界

1. 应用壳层与启动
  - `src/main.js`
  - `src/App.vue`
  - `src/style.css`
2. LLM 与剧情
  - `src/llm/llmService.js`
  - `src/llm/promptGenerator.js`
  - `src/llm/storyParser.js`
  - `src/llm/index.js`
3. 世界书
  - `src/worldbook/worldBookStore.js`
  - `src/screens/WorldBookScreen.vue`
  - `src/screens/WorldBookEditorScreen.vue`
4. 手机系统
  - `src/components/Phone.vue`
5. 掌机系统
  - `src/components/HandheldConsole.vue`
  - `src/plugins/pluginManager.js`
6. 插件系统
  - `src/plugins/pluginManager.js`
  - `src/plugins/PluginComponent.vue`
  - `src/screens/PluginManagerScreen.vue`
7. RPG 地下城插件
  - `src/plugins/handheld-xx-dungeon-adventure/index.vue`
  - `src/plugins/handheld-xx-dungeon-adventure/logic/dungeonMapEngine.js`
  - `src/plugins/handheld-xx-dungeon-adventure/logic/roleEngine.js`
  - `src/plugins/handheld-xx-dungeon-adventure/MAINTENANCE.md`
8. 存档与本地存储
  - `src/save/saveManager.js`
  - `src/storage/index.js`
  - `src/screens/SaveLoadScreen.vue`
9. 设置与主题
  - `src/screens/SettingsScreen.vue`
  - `src/settings/ApiSettingsPanel.vue`
  - `src/settings/DisplaySettingsPanel.vue`
  - `src/settings/ThemeSettingsPanel.vue`
  - `src/theme/themeManager.js`
  - `src/theme/themeProfiles.css`
10. 立绘与 CG
  - `src/components/PortraitManager.vue`
  - `src/components/CGGeneratorModal.vue`
  - `src/comfyui/comfyuiService.js`
11. 音乐播放器
  - `src/components/MusicPlayer.vue`
  - `src/components/musicPlayerSkinManager.js`
12. 平台构建（Electron/Android）
  - `package.json`
  - `vite.config.js`
  - `electron/main.js`

## 3. 读取策略

逻辑改动：

1. `npm run ctx -- --task "..." --mode logic`
2. 按 `Must Read` 读取。
3. 如果涉及跨模块依赖，再读取 `Optional Read`。
4. 最后再决定是否需要样式文件。

样式改动：

1. `npm run ctx -- --task "..." --mode style`
2. 先读 `.css`。
3. 只补 class 对应的最小模板片段。

混合改动：

1. 先 `--mode logic` 做逻辑并验证。
2. 再 `--mode style` 做视觉并验证。

## 4. 命令示例

```bash
# 自动匹配模块
npm run ctx -- --task "世界书角色同步失败" --mode logic

# 指定模块
npm run ctx -- --area worldbook,plugin-system --mode logic

# 样式模式（默认不带逻辑文件）
npm run ctx -- --task "Android 按钮变形" --mode style

# 查看可用模块 ID
npm run ctx:list
```
