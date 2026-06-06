import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import cloudbase from '@cloudbase/node-sdk'

const require = createRequire(import.meta.url)
const multer = require('multer')
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 80
const NODE_ENV = process.env.NODE_ENV || 'development'

const CB_ENV = process.env.CLOUDBASE_ENV || 'cloudbase-d7getcjqy33b13475'
const sdk = cloudbase.init({
  env: CB_ENV,
  secretId: process.env.CLOUDBASE_SECRET_ID || '',
  secretKey: process.env.CLOUDBASE_SECRET_KEY || '',
})

// 安全中间件
app.set('trust proxy', 1)
app.use((req, res, next) => {
  // CSP
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:;")
  // XSS防护
  res.setHeader('X-XSS-Protection', '1; mode=block')
  // 防止 MIME 类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

// 解析 JSON 和 URL 编码
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), version: process.env.npm_package_version || '1.0.0' })
})

// 静态文件缓存优化
const staticOptions = {
  maxAge: NODE_ENV === 'production' ? '1y' : 0,
  immutable: NODE_ENV === 'production',
  etag: true,
  lastModified: true,
}
app.use(express.static(path.join(__dirname, 'dist'), staticOptions))

// 日志中间件
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`)
  })
  next()
})

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: -1, message: '未选择文件' })
    }
    const cloudPath = `banners/${Date.now()}_${req.file.originalname}`
    const uploadResult = await sdk.uploadFile({
      cloudPath,
      fileContent: req.file.buffer,
    })
    let previewUrl = uploadResult.fileID
    if (uploadResult.fileID && uploadResult.fileID.startsWith('cloud://')) {
      try {
        const tmpResult = await sdk.getTempFileURL({ fileList: [uploadResult.fileID] })
        previewUrl = tmpResult.fileList[0].tempFileURL || uploadResult.fileID
      } catch (e) {
        console.error('[Upload] getTempFileURL failed:', e.message)
      }
    }
    res.json({ code: 0, data: { fileID: uploadResult.fileID, url: uploadResult.fileID, previewUrl } })
  } catch (err) {
    console.error('[Upload Error]', err)
    res.status(500).json({ code: -1, message: err.message || '上传失败' })
  }
})

async function convertCloudUrls(obj, urlMap = {}) {
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string' && obj.startsWith('cloud://') && urlMap[obj]) return urlMap[obj]
    return obj
  }
  if (Array.isArray(obj)) {
    // 先收集数组中的 cloud:// 字符串
    const cloudIds = []
    for (const item of obj) {
      if (typeof item === 'string' && item.startsWith('cloud://') && !urlMap[item]) {
        cloudIds.push(item)
      }
    }
    if (cloudIds.length > 0) {
      try {
        const BATCH_SIZE = 50
        for (let i = 0; i < cloudIds.length; i += BATCH_SIZE) {
          const chunk = cloudIds.slice(i, i + BATCH_SIZE)
          const tmpResult = await sdk.getTempFileURL({ fileList: chunk })
          for (const f of tmpResult.fileList || []) {
            if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL
          }
        }
      } catch (e) {
        console.error('[convertCloudUrls] getTempFileURL failed for array:', e.message)
      }
    }
    // 数组中的 cloud:// 保留原值（上层对象会生成 xxxPreviews 数组）
    return await Promise.all(obj.map(item => {
      if (typeof item === 'string' && item.startsWith('cloud://')) return item
      return convertCloudUrls(item, urlMap)
    }))
  }

  const cloudIds = []
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string' && obj[key].startsWith('cloud://') && !urlMap[obj[key]]) {
      cloudIds.push(obj[key])
    } else if (Array.isArray(obj[key])) {
      for (const item of obj[key]) {
        if (typeof item === 'string' && item.startsWith('cloud://') && !urlMap[item]) {
          cloudIds.push(item)
        }
      }
    }
  }

  if (cloudIds.length > 0) {
    try {
      const BATCH_SIZE = 50
      for (let i = 0; i < cloudIds.length; i += BATCH_SIZE) {
        const chunk = cloudIds.slice(i, i + BATCH_SIZE)
        const tmpResult = await sdk.getTempFileURL({ fileList: chunk })
        for (const f of tmpResult.fileList || []) {
          if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL
        }
      }
    } catch (e) {
      console.error('[convertCloudUrls] getTempFileURL failed:', e.message)
    }
  }

  const result = {}
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string' && obj[key].startsWith('cloud://') && urlMap[obj[key]]) {
      result[key] = obj[key] // 保留原始 cloud:// 值
      result[key + 'Preview'] = urlMap[obj[key]] // 添加 HTTP 预览 URL
    } else if (Array.isArray(obj[key])) {
      const hasCloudUrls = obj[key].some(item => typeof item === 'string' && item.startsWith('cloud://'))
      result[key] = await convertCloudUrls(obj[key], urlMap)
      if (hasCloudUrls) {
        result[key + 'Previews'] = obj[key].map(item => {
          if (typeof item === 'string' && item.startsWith('cloud://') && urlMap[item]) return urlMap[item]
          return item
        })
      }
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      result[key] = await convertCloudUrls(obj[key], urlMap)
    } else {
      result[key] = obj[key]
    }
  }
  return result
}

app.post('/api', async (req, res) => {
  try {
    const { action, data, accessToken } = req.body
    const token = accessToken || (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '').trim() : '')

    const result = await sdk.callFunction({
      name: 'adminService',
      data: { action, data, accessToken: token },
    })

    const converted = await convertCloudUrls(result.result)
    res.json(converted)
  } catch (err) {
    console.error('[API Error]', err)
    res.status(500).json({ code: -1, message: err.message || '服务错误' })
  }
})

// SPA 路由回退
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully')
  process.exit(0)
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}, NODE_ENV=${NODE_ENV}`)
})
