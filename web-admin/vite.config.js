import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'

const API_KEY = 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJhdWQiOiJjbG91ZGJhc2UtZDdnZXRjanF5MzNiMTM0NzUiLCJleHAiOjI1MzQwMjMwMDc5OSwiaWF0IjoxNzgwOTk5MDMzLCJhdF9oYXNoIjoiU2hmSEowbS1SeDY3SEVKQmtZNzg4dyIsInByb2plY3RfaWQiOiJjbG91ZGJhc2UtZDdnZXRjanF5MzNiMTM0NzUiLCJtZXRhIjp7InBsYXRmb3JtIjoiQXBpS2V5In0sImFkbWluaXN0cmF0b3JfaWQiOiIyMDU1NTcxNDE5MDY3MTA1MjgyIiwidXNlcl90eXBlIjoiIiwiY2xpZW50X3R5cGUiOiJjbGllbnRfc2VydmVyIiwiaXNfc3lzdGVtX2FkbWluIjp0cnVlfQ.EcVybfuRUbA19CjPTzx8XLavv-SxDWRfZE5_ZDFnCwIpVk74JEtnYk2Vp4J3hoLZ3G_cCJAWrcRzqs_lrd4boDjDnHstgw59wMnCbjO162K76I9JsL0pQUiiRcFUNo09Nt2vR_tCP4Z64bX4blxPjlFufSweAp0YVBjPl9n-PivoSzLqeDuYSD7OfcPHQCv68XXguhW3hlz9wjdImaB9oaAotv51S4RjF9qbZa1LrvMT1qsDFyse7m-6rn1j5RxL10UOe9aGL_5Vu4de-5Kuz7vr4syLUZjYqv9rSMqDFfhCb4ZRY__M7OdODJ8d8jfupSAIO0pJ6bBI_LJmL-dgGQ'

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
      proxy: {
        '/api': {
          target: 'https://cloudbase-d7getcjqy33b13475.api.tcloudbasegateway.com',
          changeOrigin: true,
          rewrite: (path) => '/v1/functions/adminService',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              // 1. 先提取原始请求中的用户 JWT
              const origAuth = req.headers.authorization || ''
              let userJwt = ''
              if (origAuth.startsWith('Bearer ')) {
                const token = origAuth.replace('Bearer ', '')
                try {
                  const payload = JSON.parse(atob(token.split('.')[1]))
                  if (!payload.platform) {
                    userJwt = token
                  }
                } catch (e) {}
              }
              // 2. 始终用 API Key 作为 Authorization（CloudBase 网关认证）
              proxyReq.setHeader('Authorization', API_KEY)
              // 3. 用户 JWT 通过 X-User-Token 传递
              if (userJwt) {
                proxyReq.setHeader('X-User-Token', userJwt)
              }
            })
          },
        },
      },
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