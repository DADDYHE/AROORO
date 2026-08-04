#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 寄养佣金 orderType 统一迁移脚本（hosting → boarding）
 *
 * 背景：
 *   commissions 集合里寄养类佣金的 orderType 历史上存在 'hosting' 与 'boarding' 两种值
 *   （两个订单完成路径分别写入，详见 docs/boarding-hosting-unification-analysis.md）。
 *   现统一为 'boarding'（与 orders.type / service_incomes.business 规范值一致，且保留 RBAC 权限键 'hosting' 不变）。
 *   本脚本把数据库中已存在的 orderType === 'hosting' 的佣金记录改写为 'boarding'，
 *   使数据彻底一致。
 *
 *   读取侧（partnerService getMyIncomeDetails / getReferralOrders）已用 _.in(['hosting','boarding']) 兼容，
 *   故本脚本为「干净化」性质——不执行也不影响线上查询；但建议执行一次以彻底消除双值。
 *
 * 凭证（从环境变量读取，绝不硬编码）：
 *   TENCENTCLOUD_SECRETID  腾讯云 SecretId
 *   TENCENTCLOUD_SECRETKEY 腾讯云 SecretKey
 *
 * 用法：
 *   # 先 dry-run 看看有多少条待迁移
 *   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy \
 *     node scripts/migrate-commission-hosting-to-boarding.js --env=<envId> --dry
 *   # 确认无误后真正执行
 *   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy \
 *     node scripts/migrate-commission-hosting-to-boarding.js --env=<envId>
 */

function getArg(name) {
  const prefix = `--${name}=`
  const found = process.argv.find(a => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

function parseFlags() {
  return {
    envId: getArg('env') || process.env.CLOUDBASE_ENV || '',
    dry: process.argv.includes('--dry'),
  }
}

async function initDb(envId) {
  const { initialize } = require('@cloudbase/node-sdk')
  const secretId = process.env.TENCENTCLOUD_SECRETID
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY
  if (!secretId || !secretKey) {
    throw new Error('缺少凭证：请设置环境变量 TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY')
  }
  const app = initialize({
    env: envId,
    credentials: { secretId, secretKey },
  })
  return app.database()
}

async function main() {
  const { envId, dry } = parseFlags()
  if (!envId) {
    console.error('[FAIL] 必须指定 --env=<envId>（或设置 CLOUDBASE_ENV）')
    process.exit(1)
  }
  const db = await initDb(envId)

  const PAGE = 100
  let skip = 0
  let scanned = 0
  let migrated = 0
  let failed = 0

  console.log(`[INFO] env=${envId} mode=${dry ? 'DRY-RUN' : 'APPLY'}  开始扫描 commissions(orderType='hosting')`)

  while (true) {
    const res = await db
      .collection('commissions')
      .where({ orderType: 'hosting' })
      .field({ _id: true, orderType: true, orderId: true, inviterId: true })
      .skip(skip)
      .limit(PAGE)
      .get()
    const list = res.data || []
    scanned += list.length
    if (list.length === 0) break

    for (const doc of list) {
      if (dry) {
        migrated += 1
        continue
      }
      try {
        await db.collection('commissions').doc(doc._id).update({
          data: { orderType: 'boarding', updatedAt: db.serverDate() },
        })
        migrated += 1
      } catch (e) {
        failed += 1
        console.error(`[ERR] 更新失败 _id=${doc._id}: ${e && e.message}`)
      }
    }

    if (list.length < PAGE) break
    skip += PAGE
  }

  console.log('[DONE] 扫描命中:', scanned)
  console.log('[DONE] 已迁移/将迁移:', migrated)
  if (!dry) console.log('[DONE] 失败:', failed)
  if (dry) console.log('[INFO] 以上为 dry-run 预览，未做实际写入。去掉 --dry 重新执行以落地。')
}

main().catch((e) => {
  console.error('[FATAL]', e && e.message)
  process.exit(1)
})
