import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
app.mount('#mascot-app')

// Android: if native service already injected mascot data before Vue mounted,
// apply it now (DOMContentLoaded may have already fired before this script loads)
if (window.__mascotInitData__) {
  try {
    const state = JSON.parse(window.__mascotInitData__)
    if (window.__mascotStateUpdate__) {
      window.__mascotStateUpdate__(state)
    }
  } catch (e) {
    console.warn('[MascotOverlay] Failed to parse injected mascot data:', e)
  }
}
