# 文件拆分任务清单（按执行顺序）

- [x] 1. 拆分 `src/components/Phone.vue` 与 `src/components/Phone.css`
  - 目标：模板外置、样式分片，保持功能不变。
- [x] 2. 拆分 `src/components/HandheldConsole.vue` 与 `src/components/HandheldConsole.css`
  - 目标：模板外置、样式分片，保持功能不变。
- [x] 3. 拆分 `src/screens/GameScreen.vue` 与 `src/screens/GameScreen.css`
  - 目标：模板外置、样式分片，保持功能不变。
- [x] 4. 拆分 `src/plugins/handheld-xx-dungeon-adventure/index.vue` 与 `src/plugins/handheld-xx-dungeon-adventure/styles/index.css`
  - 目标：模板外置、样式分片，保持功能不变。
- [x] 5. 拆分 `src/theme/themeProfiles.css`（必要时联动 `src/style.css`）
  - 目标：主题样式模块化，降低单文件体积与冲突概率。
- [x] 6. 拆分 `src/screens/WorldBookEditorScreen.vue` 与 `src/screens/WorldBookEditorScreen.css`
  - 目标：模板外置、样式分片，保持功能不变。

## 执行记录

- 1 已完成：`Phone.vue` 模板外置到 `src/components/phone/Phone.template.html`，样式拆为 `src/components/phone/styles/phone-*.css`。
- 2 已完成：`HandheldConsole.vue` 模板外置到 `src/components/handheld/HandheldConsole.template.html`，样式拆为 `src/components/handheld/styles/handheld-*.css`。
- 3 已完成：`GameScreen.vue` 模板外置到 `src/screens/game/GameScreen.template.html`，样式拆为 `src/screens/game/styles/game-*.css`。
- 4 已完成：插件 `index.vue` 模板外置到 `src/plugins/handheld-xx-dungeon-adventure/view/index.template.html`，样式拆为 `styles/split/index-*.css`。
- 5 已完成：`src/theme/themeProfiles.css`、`src/style.css` 改为聚合入口并按模块 `@import` 分片文件。
- 6 已完成：`WorldBookEditorScreen.vue` 模板外置到 `src/screens/worldbook-editor/WorldBookEditorScreen.template.html`，样式拆为 `src/screens/worldbook-editor/styles/worldbook-editor-*.css`。
