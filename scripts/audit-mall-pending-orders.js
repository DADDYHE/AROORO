#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 只读审计：待支付订单的 type / paymentStatus 字段完整性
 *
 * 目的：定位「商城订单几天前未支付却未被超时取消」的根因。
 *
 *   当前 orderTimeoutService.cancelMallOrders 查询条件为：
 *     { type: 'mall', status: 'pending_payment', paymentStatus: 'unpaid', createdAt: _.lte(mallTimeout) }
 *   这是「精确匹配」。若历史订单（部署前创建）缺失 type 或 paymentStatus 字段，
 *   则 CloudBase 的 field:value 查询无法命中缺失字段的文档 → 永不扫描 → 永不取消。
 *
 *   历史证据：mallService 在 H6 才补上 paymentStatus:'unpaid'（"新增订单须初始化"），
 *            而 type/orderType 治理（mall 写 type）也是 2026-08-02 才确立。
 *            因此「部署前」的订单很可能既没有 type:'mall' 也没有 paymentStatus。
 *
 *   本脚本只读取，绝不写入。统计：
 *   1) status='pending_payment' 订单按 type 分桶
 *   2) type='mall' 的待支付订单中 paymentStatus 各值分布（含 __MISSING__）
 *   3) 缺 type 的待支付订单按业务键(bookingKey/dealId/productId)推断本来类型
 *   4) 打印若干样本 _id/createdAt/type/paymentStatus，便于肉眼确认
 *
 * 凭证（从环境变量读取，绝不硬编码）：
 *   TENCENTCLOUD_SECRETID  腾讯云 SecretId
 *   TENCENTCLOUD_SECRETKEY 腾讯云 SecretKey
 *
 * 用法：
 *   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy \
 *     node scripts/audit-mall-pending-orders.js --env=<envId>
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
  const app = tcb.init({ env: envId, secretId, secretKey })
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

async function countWhere(db, collection, where) {
  const res = await db.collection(collection).where(where).count()
  return res.total || 0
}

async function main() {
  const { envId, collection } = parseFlags()
  if (!envId) {
    console.error('[FAIL] 必须指定 --env=<envId>（或设置 CLOUDBASE_ENV）')
    process.exit(1)
  }
  const db = await initDb(envId)
  const _ = db.command
  const PP = 'pending_payment'

  console.log(`[INFO] env=${envId} collection=${collection} 只读审计开始`)

  // 1) 待支付订单按 type 分桶
  const byTypeRes = await db
    .collection(collection)
    .aggregate()
    .match({ status: PP })
    .group({ _id: { $ifNull: ['$type', '__MISSING__'] }, count: { $sum: 1 } })
    .end()
  const byTypeRows = (byTypeRes.data || []).sort((a, b) => b.count - a.count)

  console.log('\n========== 待支付订单 type 分布 ==========')
  for (const row of byTypeRows) {
    console.log(`  ${String(row._id).padEnd(16)} : ${row.count}`)
  }

  // 2) type='mall' 待支付订单的 paymentStatus 分布
  const psRows = await db
    .collection(collection)
    .aggregate()
    .match({ status: PP, type: 'mall' })
    .group({ _id: { $ifNull: ['$paymentStatus', '__MISSING__'] }, count: { $sum: 1 } })
    .end()
  const psDist = (psRows.data || []).sort((a, b) => b.count - a.count)
  const mallPP = await countWhere(db, collection, { status: PP, type: 'mall' })
  console.log('\n========== type=mall 待支付订单 paymentStatus 分布 ==========')
  console.log(`  (type='mall' & pending 总数: ${mallPP})`)
  for (const row of psDist) {
    console.log(`  ${String(row._id).padEnd(16)} : ${row.count}`)
  }

  // 3) 缺 type 的待支付订单，按业务键推断本来类型
  const missTypeTotal = await countWhere(db, collection, {
    status: PP,
    type: _.exists(false),
  })
  const missTypeBoarding = await countWhere(db, collection, {
    status: PP,
    type: _.exists(false),
    bookingKey: _.exists(true),
  })
  const missTypeGroup = await countWhere(db, collection, {
    status: PP,
    type: _.exists(false),
    dealId: _.exists(true),
  })
  const missTypeMall = await countWhere(db, collection, {
    status: PP,
    type: _.exists(false),
    productId: _.exists(true),
    dealId: _.exists(false),
  })
  console.log('\n========== 缺 type 的待支付订单（历史单推断） ==========')
  console.log(`  缺 type 待支付总数        : ${missTypeTotal}`)
  console.log(`    其内 bookingKey 存在    : ${missTypeBoarding}  ← 疑似历史 boarding`)
  console.log(`    其内 dealId 存在        : ${missTypeGroup}     ← 疑似历史 group_buy`)
  console.log(`    其内 productId 存在(无deal): ${missTypeMall}   ← 疑似历史 mall`)

  // 4) paymentStatus 缺失（被 mall 查询精确过滤排除的直接证据）
  const mallPsMissing = await countWhere(db, collection, {
    status: PP,
    type: 'mall',
    paymentStatus: _.exists(false),
  })
  const mallTypeMissingPsMissing = await countWhere(db, collection, {
    status: PP,
    type: _.exists(false),
    paymentStatus: _.exists(false),
  })
  console.log('\n========== 根因直接证据 ==========')
  console.log(`  type='mall' 待支付 但缺 paymentStatus : ${mallPsMissing}  ← mall 查询 paymentStatus:'unpaid' 精确匹配会排除这些`)
  console.log(`  type缺失 且 缺 paymentStatus         : ${mallTypeMissingPsMissing}`)

  // 5) 样本（最老的若干待支付订单）
  console.log('\n========== 样本（最老 10 条待支付订单） ==========')
  const sample = await db
    .collection(collection)
    .where({ status: PP })
    .field({ _id: true, type: true, paymentStatus: true, createdAt: true, productId: true, dealId: true, bookingKey: true })
    .orderBy('createdAt', 'asc')
    .limit(10)
    .get()
  for (const o of sample.data || []) {
    const ca = o.createdAt && o.createdAt.$date ? o.createdAt.$date : (o.createdAt || '')
    console.log(
      `  ${String(o._id).padEnd(24)} type=${String(o.type || '∅').padEnd(10)} pay=${String(o.paymentStatus || '∅').padEnd(10)} createdAt=${ca}`
    )
  }

  console.log('\n[DIAG] 结论提示：')
  if (mallPsMissing > 0 || mallTypeMissingPsMissing > 0) {
    console.log('  存在历史待支付订单缺失 type / paymentStatus，被超时查询的精确过滤排除 → 这是未取消的根因。')
    console.log('  建议修复：① 数据回填脚本补字段；② cancelMallOrders 等查询放宽 paymentStatus: _.in([\'unpaid\', null])。')
  } else {
    console.log('  未发现字段缺失，问题可能在别处（timer 未触发 / 已支付 / 其他状态）。')
  }
}

main().catch((e) => {
  console.error('[FATAL]', e && e.message)
  process.exit(1)
})
