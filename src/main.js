import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import './style.css'
import './theme/defaultThemeVariables.css'
import App from './App.vue'
import { initTheme, initCustomFonts } from './theme/themeManager'
import { runStorageMigration } from './storage/storageMigration'
import { openDatabase, createTables } from './db/connection.js'

// 初始化 SQLite 数据库（Android 端）
openDatabase()
  .then(async (ok) => {
    if (ok) {
      await createTables()
      console.log('[db] SQLite initialized')
    }
  })
  .catch((e) => console.warn('[db] SQLite init failed:', e.message))

// 在 Capacitor 操作之前清理 localStorage 中的 base64 图片数据
// 防止 Android OOM（Capacitor Bridge 序列化 localStorage 时内存翻倍）
runStorageMigration()

initTheme()
  .then(() => initCustomFonts())
  .catch(console.error)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App).use(pinia).mount('#app')
