/**
 * 按钮功能插件入口（模板）
 * 约定：Host 后续按 entry.module 动态加载此文件，并取 default 导出。
 */
const FeatureTemplateEntry = {
  id: 'feature-template',
  mount() {
    // 这里可以返回 Vue 组件、路由定义，或生命周期对象
    return {
      type: 'service',
      start() {
        // no-op
      },
      stop() {
        // no-op
      },
    }
  },
}

export default FeatureTemplateEntry

