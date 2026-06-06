import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'

export default defineConfig(({ command, mode }) => {
  const isProduction = command === 'build'

  return {
    plugins: [
      vue(),
      AutoImport({ resolvers: [ElementPlusResolver()] }),
      Components({ resolvers: [ElementPlusResolver()] }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      port: 3000,
    },
    build: {
      target: 'es2020',
      minify: 'esbuild',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-vue': ['vue', 'vue-router', 'pinia'],
            'vendor-element': ['element-plus'],
            'vendor-chart': ['echarts'],
            'vendor-utils': ['axios', 'dayjs'],
          },
        },
      },
      sourcemap: !isProduction,
      reportCompressedSize: true,
    },
    esbuild: {
      drop: isProduction ? ['console', 'debugger'] : [],
    },
  }
})
