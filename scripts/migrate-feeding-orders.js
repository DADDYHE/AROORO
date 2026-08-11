#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 上门服务（feeding）订单历史数据迁移脚本
 *
 * 背景：
 *   三端统一上门服务订单状态机（pending_payment → paid → confirmed → in_progress → completed，
 *   终态 rejected/cancelled/refunded）。此前支付回调将 feeding 订单支付成功直接置为 confirmed，
 *   跳过 paid；本次恢复"支付→确认"顺序，支付成功置 paid，后台确认后转 confirmed。
 *   存量数据仍存在：status='confirmed' 且 paymentStatus='paid' 的订单（跳过 paid 阶段），
 *   需回退为 paid，以进入正常状态机路径。
 *
 * 迁移边界（重要）：
 *   - 本脚本只回退「confirmed + paid」且**尚未进入后续流程**的订单
 *     （即 inProgressAt / completedAt / cancelledAt / refundedAt 均不存在）。
 *   - 已进入 in_progress/completed/cancelled/refunded 的订单不受影响。
 *   - **已知影响**：若某单是"管理员在支付前点过确认、用户之后才支付"，也会被回退为 paid。
 *     这类订单影响极小——管理员在后台重新确认一次即可，但请在迁移前知会相关后台操作人员。
 *
 * 本脚本幂等：仅更新命中脏数据的文档，正常文档零影响。
 *
 * 凭证（从环境变量读取，绝不硬编码）：
 *   TENCENTCLOUD_SECRETID  腾讯云 SecretId
 *   TENCENTCLOUD_SECRETKEY 腾讯云 SecretKey
 *
 * 用法（务必先 --dry 预览）：
 *   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy \
 *     node scripts/migrate-feeding-orders.js --env=<envId> --dry
 *   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy \
 *     node scripts/migrate-feeding-orders.js --env=<envId>
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
  const app = tcb.init({ env: envId, secretId, secretKey })
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

  const stats = { toPaid: 0, skippedExisting: 0, failed: [] }

  // 命中条件：confirmed + paid，且未进入任何后续流程（避免误伤进行中/已完成/已取消/已退款）
  const where = {
    status: 'confirmed',
    paymentStatus: 'paid',
    inProgressAt: _.exists(false),
    completedAt: _.exists(false),
    cancelledAt: _.exists(false),
    refundedAt: _.exists(false),
  }
  const docs = await fetchAll(db, _, 'feedingOrders', where, {
    _id: true, status: true, paymentStatus: true, orderNo: true,
  })
  console.log(`[INFO] 命中 confirmed+paid 且未进入后续流程的订单数: ${docs.length}`)

  for (const d of docs) {
    if (dry) {
      console.log(`  [DRY] feeding ${d._id} (${d.orderNo || ''}) confirmed+paid → paid`)
      stats.toPaid++
      continue
    }
    try {
      await db.collection('feedingOrders').doc(d._id).update({
        data: {
          status: 'paid',
          updatedAt: db.serverDate(),
          migrateNote: 'confirmed+paid → paid (feeding 状态机统一)',
        },
      })
      stats.toPaid++
    } catch (e) {
      stats.failed.push({ doc: d._id, err: e.message })
    }
  }

  console.log('\n[SUMMARY]')
  console.log('  confirmed+paid → paid:', stats.toPaid)
  console.log('  失败(APPLY 才计入):', stats.failed.length)
  if (stats.failed.length > 0) {
    console.log('  失败明细:', JSON.stringify(stats.failed, null, 2))
  }
  console.log('  迁移边界提醒：管理员在支付前确认、用户之后支付的订单也被回退，需重新确认一次。')
  if (dry) console.log('[INFO] 以上为 dry-run 预览，未做实际写入。去掉 --dry 重新执行以落地。')
}

main().catch((e) => {
  console.error('[FATAL]', e && e.message)
  process.exit(1)
})