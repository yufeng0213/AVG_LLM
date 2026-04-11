# electron-main

预留给 Electron `main/preload` 进程代码。

后续迁移步骤：

1. 将 `electron/main.js` 与 `electron/preload.cjs` 挪入本目录。
2. 提供独立构建与启动脚本（dev/prod）。
3. 由 desktop-host 在开发态注入 URL，生产态注入打包资源路径。

