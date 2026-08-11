#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 寄养（boarding）订单历史数据迁移脚本
 *
 * 背景：
 *   三端统一寄养订单状态机（pending_payment → paid → confirmed → in_progress → completed，
 *   终态 rejected/cancelled/refunded/deleted）。此前 adminService 状态机用死状态 'pending'，
 *   而订单创建写的是 'pending_payment'。本脚本将历史脏状态归一，并报告矛盾组合。
 *
 * 迁移内容：
 *   1. 寄养订单 status='pending' → 'pending_payment'（与创建口径一致）
 *   2. 寄养订单 paymentStatus 为 null / 缺失 → 'unpaid'（与创建口径一致）
 *   3. 矛盾组合【只报告不自动改】：
 *      - cancelled + paid                    （资损组合，需人工核查退款）
 *      - rejected + paymentStatus ≠ paid
 *      - confirmed + paymentStatus ≠ paid
 *      - paid + paymentStatus ≠ paid
 *
 * 迁移边界（严格只处理 boarding）：
 *   - 仅 `orders` 集合；甄别条件：type='boarding' 或 orderType='boarding'，
 *     或（无 type 且 bookingKey 以 'booking_' 开头）
 *   - 不碰 activity 镜像（orderType='activity'）与其他类型
 *   - 绝不扫入 failed_operations 集合
 *
 * 本脚本幂等：仅更新命中的脏文档，正常文档零影响；重复执行不产生副作用。
 *
 * 凭证（从环境变量读取，绝不硬编码）：
 *   TENCENTCLOUD_SECRETID  腾讯云 SecretId
 *   TENCENTCLOUD_SECRETKEY 腾讯云 SecretKey
 *
 * 用法（务必先 --dry 预览）：
 *   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy \
 *     node scripts/migrate-boarding-orders.js --env=<envId> --dry
 *   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy \
 *     node scripts/migrate-boarding-orders.js --env=<envId>
 */

function getArg(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

function parseFlags() {
  return {
    envId: getArg('env') || process.env.CLOUDBASE_ENV || '',
    dry: process.argv.includes('--dry'),
  }
}

async function initDb(envId) {
  const tcb = require('@cloudbase/node-sdk')
  const secretId = process.env.TENCENTCLOUD_SECRETID
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY
  if (!secretId || !secretKey) {
    throw new Error('缺少凭证：请设置环境变量 TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY')
  }
  const sessionToken = process.env.TENCENTCLOUD_SESSIONTOKEN
  const app = tcb.init({ env: envId, secretId, secretKey, sessionToken })
  return app.database()
}

// 分页取集合
async function fetchAll(db, _command, collection, where, field) {
  const PAGE = 100
  const all = []
  let skip = 0
  while (true) {
    const res = await db.collection(collection)
      .where(where)
      .field(field)
      .skip(skip)
      .limit(PAGE)
      .get()
    const list = res.data || []
    all.push(...list)
    if (list.length < PAGE) break
    skip += PAGE
  }
  return all
}

// 判断是否为寄养订单（严格 boarding 甄别）
function isBoardingOrder(doc) {
  if (doc.orderType === 'activity') return false // 活动镜像不处理
  if (doc.type === 'boarding') return true
  if (doc.orderType === 'boarding') return true
  // 无 type 且 bookingKey 以 booking_ 开头
  if (!doc.type && typeof doc.bookingKey === 'string' && doc.bookingKey.startsWith('booking_')) return true
  return false
}

async function main() {
  const { envId, dry } = parseFlags()
  if (!envId) {
    console.error('[FAIL] 必须指定 --env=<envId>（或设置 CLOUDBASE_ENV）')
    process.exit(1)
  }
  const db = await initDb(envId)
  const _ = db.command
  const mode = dry ? 'DRY-RUN' : 'APPLY'
  console.log(`[INFO] env=${envId} mode=${mode}`)

  // 候选：status='pending' 或 paymentStatus 缺失/为 null 的寄养单；矛盾组合单独扫描
  const orCond = _.or([
    { type: 'boarding' },
    { orderType: 'boarding' },
    { type: _.exists(false), bookingKey: db.RegExp({ regexp: '^booking_' }) },
  ])
  const candidates = await fetchAll(db, _, 'orders', orCond, {
    _id: true, status: true, paymentStatus: true, orderNo: true, bookingKey: true, type: true, orderType: true,
  })
  console.log(`[INFO] 扫描到寄养候选订单数: ${candidates.length}`)

  const stats = { toPendingPayment: 0, toUnpaid: 0, skipped: 0, failed: [], conflicts: [] }

  for (const d of candidates) {
    if (!isBoardingOrder(d)) { stats.skipped++; continue }
    const hasPaymentStatus = d.paymentStatus !== undefined && d.paymentStatus !== null

    // 1) status='pending' → 'pending_payment'
    if (dry) {
      if (d.status === 'pending') {
        console.log(`  [DRY] ${d._id} (${d.orderNo || ''}) pending → pending_payment`)
        stats.toPendingPayment++
      }
    } else if (d.status === 'pending') {
      try {
        await db.collection('orders').doc(d._id).update({
          data: {
            status: 'pending_payment',
            updatedAt: db.serverDate(),
            migrateNote: 'pending → pending_payment (boarding 状态机统一)',
          },
        })
        stats.toPendingPayment++
      } catch (e) {
        stats.failed.push({ doc: d._id, step: 'pending→pending_payment', err: e.message })
      }
    }

    // 2) paymentStatus 缺失/为 null → 'unpaid'
    if (dry) {
      if (!hasPaymentStatus) {
        console.log(`  [DRY] ${d._id} (${d.orderNo || ''}) paymentStatus 缺失 → unpaid`)
        stats.toUnpaid++
      }
    } else if (!hasPaymentStatus) {
      try {
        await db.collection('orders').doc(d._id).update({
          data: {
            paymentStatus: 'unpaid',
            updatedAt: db.serverDate(),
            migrateNote: 'paymentStatus 缺失 → unpaid (boarding 状态机统一)',
          },
        })
        stats.toUnpaid++
      } catch (e) {
        stats.failed.push({ doc: d._id, step: 'paymentStatus→unpaid', err: e.message })
      }
    }
  }

  // 3) 矛盾组合【只报告，不自动改】
  for (const d of candidates) {
    if (!isBoardingOrder(d)) continue
    const st = d.status
    const pay = d.paymentStatus
    const flag = []
    if (st === 'cancelled' && pay === 'paid') flag.push('cancelled+paid（资损组合，需核查退款）')
    if (st === 'rejected' && pay !== 'paid') flag.push(`rejected+paymentStatus=${pay || '(空)'}`)
    if (st === 'confirmed' && pay !== 'paid') flag.push(`confirmed+paymentStatus=${pay || '(空)'}`)
    if (st === 'paid' && pay !== 'paid') flag.push(`paid+paymentStatus=${pay || '(空)'}`)
    if (flag.length > 0) {
      stats.conflicts.push({ doc: d._id, orderNo: d.orderNo || '', issue: flag.join('；') })
    }
  }

  console.log('\n[SUMMARY]')
  console.log('  pending → pending_payment:', stats.toPendingPayment)
  console.log('  paymentStatus 缺失 → unpaid:', stats.toUnpaid)
  console.log('  跳过（非寄养）:', stats.skipped)
  console.log('  失败(APPLY 才计入):', stats.failed.length)
  if (stats.failed.length > 0) {
    console.log('  失败明细:', JSON.stringify(stats.failed, null, 2))
  }
  console.log('\n[矛盾组合清单（只报告，未自动修改）]')
  if (stats.conflicts.length === 0) {
    console.log('  无')
  } else {
    for (const c of stats.conflicts) {
      console.log(`  - ${c.doc} (${c.orderNo || ''}): ${c.issue}`)
    }
  }
  if (dry) console.log('[INFO] 以上为 dry-run 预览，未做实际写入。去掉 --dry 重新执行以落地。')
}

main().catch((e) => {
  console.error('[FATAL]', e && e.message)
  process.exit(1)
})