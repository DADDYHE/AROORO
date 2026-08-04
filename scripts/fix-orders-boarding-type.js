#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 历史寄养单补 type:'boarding' 迁移脚本
 *
 * 背景：
 *   2026-08-02 type/orderType 双字段分裂治理前，寄养订单（orderService.createOrder）写入 orders 集合时
 *   既不写 type 也不写 orderType。治理后新单已补 type:'boarding'，但存量历史寄养单仍缺 type，
 *   导致按 type:'boarding' 的聚合（合作伙伴寄养收入、用户统计等）漏算这些老单。
 *
 *   本脚本把「type 缺失 且 orderType 缺失 且 具备 bookingKey（寄养专属字段）」的历史订单回填 type:'boarding'，
 *   使数据彻底一致，且对新写入路径零影响（仅更新缺失文档，幂等）。
 *
 * 凭证（从环境变量读取，绝不硬编码）：
 *   TENCENTCLOUD_SECRETID  腾讯云 SecretId
 *   TENCENTCLOUD_SECRETKEY 腾讯云 SecretKey
 *
 * 用法（务必先 --dry 预览）：
 *   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy \
 *     node scripts/fix-orders-boarding-type.js --env=<envId> --dry
 *   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy \
 *     node scripts/fix-orders-boarding-type.js --env=<envId>
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
  const app = tcb.init({
    env: envId,
    secretId,
    secretKey,
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
  const _ = db.command

  const PAGE = 100
  let skip = 0
  let scanned = 0
  let updated = 0
  let failed = 0

  console.log(`[INFO] env=${envId} mode=${dry ? 'DRY-RUN' : 'APPLY'}  开始扫描历史寄养单(type缺 & orderType缺 & bookingKey存在)`)

  while (true) {
    const res = await db
      .collection('orders')
      .where({ type: _.exists(false), orderType: _.exists(false), bookingKey: _.exists(true) })
      .field({ _id: true, type: true, orderType: true, bookingKey: true, createdAt: true })
      .skip(skip)
      .limit(PAGE)
      .get()
    const list = res.data || []
    scanned += list.length
    if (list.length === 0) break

    for (const doc of list) {
      if (dry) {
        updated += 1
        continue
      }
      try {
        await db.collection('orders').doc(doc._id).update({
          data: { type: 'boarding', updatedAt: db.serverDate() },
        })
        updated += 1
      } catch (e) {
        failed += 1
        console.error(`[ERR] 更新失败 _id=${doc._id}: ${e && e.message}`)
      }
    }

    if (list.length < PAGE) break
    skip += PAGE
  }

  console.log('[DONE] 扫描命中:', scanned)
  console.log('[DONE] 已更新/将更新:', updated)
  if (!dry) console.log('[DONE] 失败:', failed)
  if (dry) console.log('[INFO] 以上为 dry-run 预览，未做实际写入。去掉 --dry 重新执行以落地。')
}

main().catch((e) => {
  console.error('[FATAL]', e && e.message)
  process.exit(1)
})
