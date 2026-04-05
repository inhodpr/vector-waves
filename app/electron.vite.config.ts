import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@visual-map': resolve(__dirname, '../../visual_map/src')
      }
    },
    plugins: [react()],
    server: {
      port: 3002
    }
  }
})
