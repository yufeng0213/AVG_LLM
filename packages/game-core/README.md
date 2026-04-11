# game-core

预留给可复用的“纯逻辑层”（无 UI / 无平台 API 依赖）：

1. 地图生成、战斗结算、掉落算法
2. 数值平衡函数
3. 可测试的 deterministic 逻辑

迁移原则：

1. 先搬 `logic/*.js` 纯函数
2. 再从 `index.vue` 去耦调用层

