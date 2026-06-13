/**
 * 创建 adminService HTTP 网关路由
 *
 * 支持两种方式:
 *   方式一: 使用腾讯云 TCB SDK (需要 SecretId/SecretKey)
 *   方式二: 使用 CloudBase CLI (tcb routes add)
 *
 * 方式一用法:
 *   TENCENTCLOUD_SECRET_ID=xxx TENCENTCLOUD_SECRET_KEY=xxx node scripts/create-gateway-route.js
 *
 * 方式二用法 (推荐，已预装 CloudBase CLI):
 *   npx tcb routes add -e cloudbase-d7getcjqy33b13475 \
 *     --data '{"domain":"<域名>","routes":[{"path":"/adminService","upstreamResourceType":"SCF","upstreamResourceName":"adminService","enable":true,"enableAuth":false}]}'
 *
 * 查看现有路由:
 *   npx tcb routes list -e cloudbase-d7getcjqy33b13475 --json
 */

const tencentcloud = require('tencentcloud-sdk-nodejs')

const TcbClient = tencentcloud.tcb.v20180608.Client

const ENV_ID = 'cloudbase-d7getcjqy33b13475'
const REGION = 'ap-shanghai'

// 环境的两个域名
const DOMAINS = [
  `${ENV_ID}-1433773879.ap-shanghai.app.tcloudbase.com`,
  `${ENV_ID}-1433773870.ap-shanghai.app.tcloudbase.com`,
]

const ROUTE_CONFIG = {
  Path: '/adminService',
  UpstreamResourceType: 'SCF',
  UpstreamResourceName: 'adminService',
  EnableSafeDomain: true,
  EnableAuth: false,
  Enable: true,
}

async function describeExistingRoutes(client, domain) {
  console.log(`📋 查询域名 ${domain} 的现有路由...`)
  try {
    const res = await client.DescribeHTTPServiceRoute({
      EnvId: ENV_ID,
      Domain: domain,
    })
    if (res.Domain && res.Domain.Routes) {
      for (const route of res.Domain.Routes) {
        console.log(
          `   路径: ${route.Path} → ${route.UpstreamResourceType}:${route.UpstreamResourceName}`
        )
      }
    } else {
      console.log('   (无路由)')
    }
    return res
  } catch (e) {
    console.log('⚠️  查询路由失败:', e.message)
    return null
  }
}

async function createRouteForDomain(client, domain) {
  console.log(`\n🚀 为域名 ${domain} 创建 adminService 路由...`)
  try {
    const res = await client.CreateHTTPServiceRoute({
      EnvId: ENV_ID,
      Domain: {
        Domain: domain,
        Routes: [ROUTE_CONFIG],
      },
    })
    console.log('✅ 路由创建成功!')
    return res
  } catch (e) {
    if (
      e.message &&
      (e.message.includes('already exist') ||
        e.message.includes('已存在') ||
        e.code === 'ResourceInUse')
    ) {
      console.log('⚠️  路由已存在，尝试修改...')
      return await modifyRouteForDomain(client, domain)
    }
    console.log('❌ 创建路由失败:', e.message)
    throw e
  }
}

async function modifyRouteForDomain(client, domain) {
  console.log(`🔧 修改域名 ${domain} 的 adminService 路由...`)
  try {
    const res = await client.ModifyHTTPServiceRoute({
      EnvId: ENV_ID,
      Domain: {
        Domain: domain,
        Routes: [ROUTE_CONFIG],
      },
    })
    console.log('✅ 路由修改成功!')
    return res
  } catch (e) {
    console.log('❌ 修改路由失败:', e.message)
    throw e
  }
}

async function main() {
  const secretId = process.env.TENCENTCLOUD_SECRET_ID
  const secretKey = process.env.TENCENTCLOUD_SECRET_KEY

  if (!secretId || !secretKey) {
    console.error('❌ 缺少腾讯云 API 凭证!')
    console.error('')
    console.error('   方式一: 设置环境变量')
    console.error('   export TENCENTCLOUD_SECRET_ID="你的SecretId"')
    console.error('   export TENCENTCLOUD_SECRET_KEY="你的SecretKey"')
    console.error('   获取方式: https://console.cloud.tencent.com/cam/capi')
    console.error('')
    console.error('   方式二: 使用 CloudBase CLI (推荐)')
    for (const domain of DOMAINS) {
      console.error(
        `   echo "Y" | npx tcb routes add -e ${ENV_ID} --data '{"domain":"${domain}","routes":[{"path":"/adminService","upstreamResourceType":"SCF","upstreamResourceName":"adminService","enable":true,"enableAuth":false}]}'`
      )
    }
    process.exit(1)
  }

  const client = new TcbClient({
    credential: { secretId, secretKey },
    region: REGION,
    profile: {
      httpProfile: { endpoint: 'tcb.tencentcloudapi.com' },
    },
  })

  for (const domain of DOMAINS) {
    await describeExistingRoutes(client, domain)
    await createRouteForDomain(client, domain)
    await describeExistingRoutes(client, domain)
  }

  console.log('\n✅ 完成! 测试命令:')
  console.log(
    `   curl -s -X POST "https://${ENV_ID}.service.tcloudbase.com/adminService" -H "Content-Type: application/json" -d '{"action":"webLogin","data":{"username":"admin","password":"admin123"}}'`
  )
}

main().catch(err => {
  console.error('❌ 脚本执行失败:', err.message)
  process.exit(1)
})
