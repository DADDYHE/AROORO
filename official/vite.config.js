import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 官网部署到 CloudBase manageApps 的 official 子域名（子路径），
// 必须用相对路径 base:'./'，否则资源会 404。
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 4096
  }
})
