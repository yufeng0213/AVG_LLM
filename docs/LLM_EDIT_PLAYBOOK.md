# LLM Edit Playbook

目标：减少每次改动时的无关读取，优先把上下文限定在最小文件集合。

先定位上下文（推荐）：

```bash
npm run ctx -- --task "你的需求" --mode logic
```

系统级模块边界见：`docs/SYSTEM_CODE_MAP.md`

## 1. 样式外置约定

项目内所有 Vue 组件统一使用“同目录同名 CSS”：

- `Foo.vue` -> `Foo.css`
- Vue 内只保留：

```vue
<style scoped src="./Foo.css"></style>
```

这样做的收益：

- 逻辑改动时可以默认不读取 CSS 文件。
- 样式改动时可以不读取完整脚本逻辑。
- 大型页面的上下文体积显著下降。

## 2. 按任务类型读取文件

逻辑改动（状态、计算、事件、LLM 调用、存档）：

1. 先读目标 `.vue` 的 `<script setup>` 和关联 `*.js`（`llm/`、`logic/`、`store/`）。
2. 默认不要读取对应 `.css`。
3. 仅当改动涉及 class 命名变化时，再补读最小 CSS 片段。

样式/布局改动（视觉、间距、Android 适配）：

1. 先读目标 `.css`。
2. 只补读 `.vue` 的最小模板片段（class 结构附近）。
3. 不需要通读脚本逻辑。

混合改动（逻辑 + 样式）：

1. 先完成逻辑并构建验证。
2. 再单独处理样式。
3. 两次改动分开提交，避免互相污染。

## 3. 重点大文件（优先控制读取范围）

- `src/components/HandheldConsole.vue`
- `src/components/Phone.vue`
- `src/screens/GameScreen.vue`
- `src/plugins/handheld-xx-dungeon-adventure/index.vue`

这些文件改动前，先确定功能边界，尽量不要整文件读取。

## 4. 插件专项说明

`handheld-xx-dungeon-adventure` 插件的详细映射与规则见：

- `src/plugins/handheld-xx-dungeon-adventure/MAINTENANCE.md`

## 5. 最小验证

每次改动后至少执行一次：

```bash
npm run build
```
