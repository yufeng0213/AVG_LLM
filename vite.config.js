import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { resolve, extname } from 'path'

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
    {
      name: 'serve-data-folder',
      configureServer(server) {
        // Serve /data/* from project root's data/ directory
        server.middlewares.use('/data', (req, res, next) => {
          const filePath = resolve(__dirname, 'data', req.url)
          if (existsSync(filePath) && statSync(filePath).isFile()) {
            const content = readFileSync(filePath)
            const ext = extname(filePath)
            const mimes = { '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }
            res.writeHead(200, { 'Content-Type': mimes[ext] || 'text/plain' })
            res.end(content)
          } else {
            next()
          }
        })
      },
    },
  ],
  server: {
    // Allow Vite to serve multiple HTML entry points in dev mode
    fs: {
      allow: ['./src', './public', './index.html', './plugins', './packages', './data'],
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
