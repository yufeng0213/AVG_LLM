import { createApp } from 'vue'
import './style.css'
import './theme/defaultThemeVariables.css'
import App from './App.vue'
import { initTheme, initCustomFonts } from './theme/themeManager'
import { runStorageMigration } from './storage/storageMigration'

// 在 Capacitor 操作之前清理 localStorage 中的 base64 图片数据
// 防止 Android OOM（Capacitor Bridge 序列化 localStorage 时内存翻倍）
runStorageMigration()

initTheme()
  .then(() => initCustomFonts())
  .catch(console.error)

createApp(App).mount('#app')
