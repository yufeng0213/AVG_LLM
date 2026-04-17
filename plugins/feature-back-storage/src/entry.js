/**
 * feature-back-storage 插件入口
 *
 * 纯逻辑插件，不注册路由。在加载时自动初始化全局存储。
 * 其他 feature 通过 import 使用 useBackStorage composable。
 */

const BackStorageFeatureEntry = {
  id: 'back-storage',
  mount() {
    return { type: 'service' }
  },
}

export default BackStorageFeatureEntry
