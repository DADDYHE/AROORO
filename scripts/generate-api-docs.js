#!/usr/bin/env node
/**
 * scripts/generate-api-docs.js - API 文档自动生成脚本
 *
 * 用途：
 *   - 扫描所有云函数的 SUPPORTED_ACTIONS 和 handler 定义
 *   - 生成 Markdown 格式的 API 文档
 *   - 集成到 CI（每次部署自动更新）
 *
 * 用法：
 *   node scripts/generate-api-docs.js
 *   node scripts/generate-api-docs.js --output docs/API_REFERENCE.md
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CLOUD_FUNCTIONS_DIR = path.join(ROOT, 'cloudfunctions')

// 云函数配置
const CLOUD_FUNCTIONS = [
  { name: 'userService', description: '用户服务', timeout: 10, memory: 256 },
  { name: 'orderService', description: '订单服务', timeout: 10, memory: 256 },
  { name: 'paymentService', description: '支付服务', timeout: 10, memory: 256 },
  { name: 'hostService', description: '寄养家庭服务', timeout: 10, memory: 128 },
  { name: 'petService', description: '宠物服务', timeout: 10, memory: 128 },
  { name: 'activityService', description: '活动服务', timeout: 10, memory: 128 },
  { name: 'mallService', description: '商城服务', timeout: 10, memory: 128 },
  { name: 'feedingService', description: '喂养服务', timeout: 10, memory: 128 },
  { name: 'adminService', description: '管理后台服务', timeout: 10, memory: 256 },
  { name: 'couponService', description: '优惠券服务', timeout: 10, memory: 128 },
  { name: 'tuanService', description: '团购服务', timeout: 10, memory: 128 },
  { name: 'partnerService', description: '合作伙伴服务', timeout: 10, memory: 256 },
  { name: 'favoriteService', description: '收藏服务', timeout: 10, memory: 128 },
  { name: 'utilityService', description: '通用工具服务', timeout: 10, memory: 128 },
  { name: 'i18nOverride', description: '国际化覆盖服务', timeout: 10, memory: 128 },
  { name: 'orderTimeoutService', description: '订单超时处理', timeout: 30, memory: 256 },
  { name: 'couponExpiryCheck', description: '优惠券过期检查', timeout: 30, memory: 128 },
  { name: 'tuanExpiryCheck', description: '团购过期检查', timeout: 30, memory: 128 },
  { name: 'rateLimitCleanup', description: '限流清理', timeout: 30, memory: 128 },
  { name: 'apiProxy', description: 'API 代理服务', timeout: 30, memory: 256 },
  { name: 'orderReconcileService', description: '订单对账服务', timeout: 30, memory: 256 },
]

/**
 * 扫描云函数的 action 定义
 */
function scanCloudFunctionActions(serviceName) {
  const serviceDir = path.join(CLOUD_FUNCTIONS_DIR, serviceName)
  const indexFile = path.join(serviceDir, 'index.ts')
  const indexJsFile = path.join(serviceDir, 'index.js')

  // 优先读取 .ts 文件
  const targetFile = fs.existsSync(indexFile) ? indexFile : indexJsFile

  if (!fs.existsSync(targetFile)) {
    return { actions: [], noAuthActions: [] }
  }

  const content = fs.readFileSync(targetFile, 'utf-8')

  // 提取 SUPPORTED_ACTIONS
  let actions = []
  const supportedActionsMatch = content.match(/SUPPORTED_ACTIONS\s*(?::\s*readonly\s+string\[\])?\s*[=:]\s*\[([\s\S]*?)\]/)
  if (supportedActionsMatch) {
    actions = supportedActionsMatch[1]
      .match(/'([^']+)'/g)
      ?.map(a => a.replace(/'/g, '')) || []
  }

  // 提取 NO_AUTH_ACTIONS
  let noAuthActions = []
  const noAuthActionsMatch = content.match(/NO_AUTH_ACTIONS\s*[=:]\s*(?:new\s+Set\s*\(\s*)?\[([\s\S]*?)\]/)
  if (noAuthActionsMatch) {
    noAuthActions = noAuthActionsMatch[1]
      .match(/'([^']+)'/g)
      ?.map(a => a.replace(/'/g, '')) || []
  }

  // 如果没有找到 SUPPORTED_ACTIONS，尝试从 handler 定义中提取
  if (actions.length === 0) {
    // 查找 handlers 对象定义的起始位置
    const handlersStart = content.indexOf('const handlers:')
    if (handlersStart !== -1) {
      // 从 handlers 开始位置提取内容，直到找到闭合的 }
      let braceCount = 0
      let handlersEnd = -1
      for (let i = handlersStart; i < content.length; i++) {
        if (content[i] === '{') {braceCount++}
        if (content[i] === '}') {
          braceCount--
          if (braceCount === 0) {
            handlersEnd = i
            break
          }
        }
      }
      
      if (handlersEnd !== -1) {
        const handlerContent = content.substring(handlersStart, handlersEnd + 1)
        // 提取 key: value 或 key 模式
        const actionMatches = handlerContent.match(/(\w+)\s*[:(,]/g) || handlerContent.match(/(\w+)\s*\n/g)
        if (actionMatches) {
          actions = actionMatches
            .map(a => a.replace(/[:(,\n]/g, '').trim())
            .filter(a => {
              // 排除常见非 action 名称
              const excluded = ['Object', 'function', 'exports', 'module', 'require', 'const', 'let', 'var', 'Record', 'string', 'unknown', 'Promise', 'event', '_context', '_auth', 'handlers']
              return !excluded.includes(a) && a.length > 2 && /^[a-z]/.test(a)
            })
        }
      }
    }
  }

  // 如果还是没有找到，尝试从文件头部注释中提取
  if (actions.length === 0) {
    // 匹配格式：1. actionName - 说明 或 actionName：说明
    const commentMatch = content.match(/共\s*\d+\s*个\s*action[：:]([\s\S]*?)(?=\n\s*\*\/|\n\s*\/\/)/)
    if (commentMatch) {
      const actionList = commentMatch[1]
      // 匹配 actionName - 或 actionName：格式
      const actionItems = actionList.match(/\d+\.\s*(\w+)\s*[-–：:]/g)
      if (actionItems) {
        actions = actionItems.map(a => {
          const match = a.match(/\d+\.\s*(\w+)/)
          return match ? match[1] : ''
        }).filter(a => a && /^[a-z]/.test(a))
      }
    }
  }

  return { actions, noAuthActions }
}

/**
 * 生成 API 文档
 */
function generateApiDocs() {
  let md = `# AROORO API 参考文档

> 自动生成于 ${new Date().toISOString().split('T')[0]}
> 
> 本文档列出所有云函数的 action 接口，供前端和管理后台调用参考。

## 目录

`

  // 生成目录
  CLOUD_FUNCTIONS.forEach(cf => {
    md += `- [${cf.name}](#${cf.name})\n`
  })

  md += `\n---\n\n`

  // 生成每个云函数的文档
  CLOUD_FUNCTIONS.forEach(cf => {
    const { actions, noAuthActions } = scanCloudFunctionActions(cf.name)

    md += `## ${cf.name}\n\n`
    md += `| 属性 | 值 |\n`
    md += `|------|-----|\n`
    md += `| 描述 | ${cf.description} |\n`
    md += `| 超时 | ${cf.timeout}s |\n`
    md += `| 内存 | ${cf.memory}MB |\n`
    md += `| Actions 数量 | ${actions.length} |\n\n`

    if (actions.length > 0) {
      md += `### Actions 列表\n\n`
      md += `| Action | 需要登录 | 说明 |\n`
      md += `|--------|----------|------|\n`

      actions.forEach(action => {
        const requireLogin = !noAuthActions.includes(action)
        md += `| ${action} | ${requireLogin ? '是' : '否'} | - |\n`
      })

      md += `\n`
    }

    md += `### 调用示例\n\n`
    md += `\`\`\`javascript\n`
    md += `// 小程序端调用\n`
    md += `const result = await wx.cloud.callFunction({\n`
    md += `  name: '${cf.name}',\n`
    md += `  data: {\n`
    md += `    action: '${actions[0] || 'actionName'}',\n`
    md += `    // ... 其他参数\n`
    md += `  }\n`
    md += `})\n`
    md += `\`\`\`\n\n`
    md += `---\n\n`
  })

  // 添加通用说明
  md += `## 通用说明\n\n`

  md += `### 响应格式\n\n`
  md += `所有云函数返回统一格式：\n\n`
  md += `\`\`\`json\n`
  md += `{\n`
  md += `  "code": 0,\n`
  md += `  "message": "操作成功",\n`
  md += `  "data": { ... }\n`
  md += `}\n`
  md += `\`\`\`\n\n`

  md += `### 错误码\n\n`
  md += `| 错误码 | 说明 |\n`
  md += `|--------|------|\n`
  md += `| 0 | 成功 |\n`
  md += `| 1001 | 参数错误 |\n`
  md += `| 1002 | 数据错误 |\n`
  md += `| 1003 | 鉴权失败 |\n`
  md += `| 1004 | 资源不存在 |\n`
  md += `| 1005 | 权限不足 |\n`
  md += `| 1006 | 业务错误 |\n`
  md += `| 5001 | 服务器错误 |\n`
  md += `| 9999 | 未知错误 |\n\n`

  md += `### 鉴权方式\n\n`
  md += `- **小程序端**: 通过 wx.cloud.callFunction 自动携带 openid\n`
  md += `- **Web 管理端**: 通过 HTTP 请求 Header 携带 JWT Token\n\n`

  return md
}

// 主函数
function main() {
  const args = process.argv.slice(2)
  const outputIndex = args.indexOf('--output')
  const outputPath = outputIndex !== -1
    ? path.resolve(args[outputIndex + 1])
    : path.join(ROOT, 'docs', 'API_REFERENCE.md')

  console.log('开始生成 API 文档...')

  const content = generateApiDocs()

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(outputPath, content, 'utf-8')
  console.log(`API 文档已生成: ${outputPath}`)
}

main()
