import { createApp } from 'vue'
import './style.css'
import './theme/themeProfiles.css'
import App from './App.vue'
import { initTheme } from './theme/themeManager'

initTheme().catch(console.error)

createApp(App).mount('#app')
