import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'fix-mascot-paths',
      closeBundle() {
        // Fix absolute paths in mascot overlay HTML for file:// protocol
        const htmlPath = resolve(__dirname, 'dist/src/mascot-overlay/index.html')
        try {
          let html = readFileSync(htmlPath, 'utf-8')
          html = html.replace(/(src|href)="\/assets\//g, '$1="../../assets/')
          writeFileSync(htmlPath, html)
        } catch (e) {
          // silently ignore if file doesn't exist (dev mode)
        }
      },
    },
  ],
  server: {
    // Allow Vite to serve multiple HTML entry points in dev mode
    fs: {
      allow: ['./src', './public', './index.html', './plugins', './packages'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        mascot: './src/mascot-overlay/index.html',
      },
    },
  },
})
