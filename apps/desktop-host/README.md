# desktop-host

预留给 Vue Host（主壳应用）。

后续迁移步骤：

1. 将当前根目录 `src` / `vite.config.js` 挪入本目录。
2. 保留根目录入口脚本做兼容转发，避免一次性破坏现有命令。
3. 当 `pnpm dev --filter desktop-host` 稳定后，再清理旧入口。

