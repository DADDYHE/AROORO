#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 只读审计：orders 集合 type / orderType 字段分布
 *
 * 目的：验证 2026-08-02「orders 类型字段治理（type/orderType 双字段分裂）」后的数据状态。
 *   - 按 type 分组统计（mall / group_buy / boarding / __MISSING__ 等）
 *   - 按 orderType 分组统计（activity / __MISSING__ 等）
 *   - 统计「两者皆缺」文档数（理论上应为历史寄养单）
 *   - 统计「两者皆缺且具备 bookingKey」文档数（= 待回填 type:'boarding' 的历史寄养单）
 *
 * 仅读取，绝不写入。
 *
 * 凭证（从环境变量读取，绝不硬编码）：
 *   TENCENTCLOUD_SECRETID  腾讯云 SecretId
 *   TENCENTCLOUD_SECRETKEY 腾讯云 SecretKey
 *
 * 用法：
 *   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy \
 *     node scripts/audit-orders-type-distribution.js --env=<envId>
 *   # 也可指定集合（默认 orders）：--collection=orders
 */

function getArg(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

function parseFlags() {
  return {
    envId: getArg('env') || process.env.CLOUDBASE_ENV || '',
    collection: getArg('collection') || 'orders',
  }
}

async function initDb(envId) {
  const tcb = require('@cloudbase/node-sdk')
  const secretId = process.env.TENCENTCLOUD_SECRETID
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY
  if (!secretId || !secretKey) {
    throw new Error('缺少凭证：请设置环境变量 TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY')
  }
  const app = tcb.init({
    env: envId,
    secretId,
    secretKey,
  })
  return app.database()
}

async function groupBy(db, collection, field) {
  const res = await db
    .collection(collection)
    .aggregate()
    .group({ _id: { $ifNull: [`$${field}`, '__MISSING__'] }, count: { $sum: 1 } })
    .end()
  return (res.data || []).sort((a, b) => b.count - a.count)
}

async function main() {
  const { envId, collection } = parseFlags()
  if (!envId) {
    console.error('[FAIL] 必须指定 --env=<envId>（或设置 CLOUDBASE_ENV）')
    process.exit(1)
  }
  const db = await initDb(envId)
  const _ = db.command

  console.log(`[INFO] env=${envId} collection=${collection} 只读审计开始`)

  const byType = await groupBy(db, collection, 'type')
  const byOrderType = await groupBy(db, collection, 'orderType')

  const bothMissing = await db
    .collection(collection)
    .where({ type: _.exists(false), orderType: _.exists(false) })
    .count()
  const historicalBoarding = await db
    .collection(collection)
    .where({ type: _.exists(false), orderType: _.exists(false), bookingKey: _.exists(true) })
    .count()

  console.log('\n========== type 分组 ==========')
  for (const row of byType) {
    console.log(`  ${String(row._id).padEnd(16)} : ${row.count}`)
  }
  console.log('\n========== orderType 分组 ==========')
  for (const row of byOrderType) {
    console.log(`  ${String(row._id).padEnd(16)} : ${row.count}`)
  }
  console.log('\n========== 异常诊断 ==========')
  console.log(`  两者皆缺文档数            : ${bothMissing.total}`)
  console.log(`  其中(具备 bookingKey)寄养 : ${historicalBoarding.total}  ← 待回填 type:'boarding' 的历史寄养单`)

  const hasMissingType = byType.some((r) => r._id === '__MISSING__')
  const hasMissingOrderType = byOrderType.some((r) => r._id === '__MISSING__')
  console.log('\n[DIAG] type 存在 __MISSING__:', hasMissingType)
  console.log('[DIAG] orderType 存在 __MISSING__:', hasMissingOrderType)
  if (historicalBoarding.total > 0) {
    console.log(`\n[ACTION] 发现 ${historicalBoarding.total} 条历史寄养单缺 type，建议执行：`)
    console.log('  node scripts/fix-orders-boarding-type.js --env=<envId> --dry   # 先预览')
    console.log('  node scripts/fix-orders-boarding-type.js --env=<envId>          # 再落地')
  } else {
    console.log('\n[OK] 无历史寄养单缺 type，数据干净。')
  }
}

main().catch((e) => {
  console.error('[FATAL]', e && e.message)
  process.exit(1)
})
