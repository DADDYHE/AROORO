#!/usr/bin/env node
// 只读审计：佣金系统配置键名 + commissions 数据一致性
// 用法: TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=yyy node scripts/audit-commission-config.js --env=cloudbase-d7getcjqy33b13475
// 仅读取，不写入任何数据。
const tcb = require('@cloudbase/node-sdk')

function parseEnv() {
  const args = process.argv.slice(2)
  let envId = ''
  for (const a of args) {
    if (a.startsWith('--env=')) envId = a.slice(6)
  }
  return envId || (process.env.TCB_ENV || '')
}

async function main() {
  const envId = parseEnv()
  const secretId = process.env.TENCENTCLOUD_SECRETID
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY
  if (!secretId || !secretKey) { console.error('missing TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY'); process.exit(1) }
  if (!envId) { console.error('missing --env'); process.exit(1) }

  const app = tcb.init({ env: envId, secretId, secretKey })
  const db = app.database()
  const _ = db.command

  console.log('=== ENV:', envId, '===\n')

  // 1) 全局默认费率键名
  console.log('--- 1) system_config.commission_rates (全局默认费率) ---')
  try {
    const r = await db.collection('system_config').doc('commission_rates').get()
    const data = r.data || {}
    const keys = Object.keys(data).filter(k => !['_id', '_createTime', '_updateTime'].includes(k))
    console.log('keys:', JSON.stringify(keys))
    console.log('values:', JSON.stringify(data))
    const suspicious = keys.filter(k => k === 'hosting' || k === 'order')
    if (suspicious.length) console.log('  !! 可疑键(理想应为 boarding):', suspicious.join(','))
  } catch (e) { console.log('  error:', e.message) }

  // 2) 合作伙伴自定义费率键分布
  console.log('\n--- 2) admins.commissionRates 键分布 (采样) ---')
  try {
    const res = await db.collection('admins').where({ commissionRates: _.exists(true) }).limit(200).get()
    const rows = res.data || []
    const keyCount = {}
    for (const a of rows) {
      const cr = a.commissionRates || {}
      for (const k of Object.keys(cr)) keyCount[k] = (keyCount[k] || 0) + 1
    }
    console.log('有自定义费率的合作伙伴数:', rows.length)
    console.log('commissionRates 键出现次数:', JSON.stringify(keyCount))
    const suspicious = Object.keys(keyCount).filter(k => k === 'hosting' || k === 'order')
    if (suspicious.length) console.log('  !! 可疑键(理想应为 boarding):', suspicious.join(','))
  } catch (e) { console.log('  error:', e.message) }

  // 3) commissions 按 orderType 分布
  console.log('\n--- 3) commissions 按 orderType 分布 ---')
  try {
    const r = await db.collection('commissions').aggregate()
      .group({ _id: { $ifNull: ['$orderType', '__MISSING__'] }, count: { $sum: 1 } })
      .end()
    const rows = (r.data || []).sort((a, b) => b.count - a.count)
    for (const x of rows) console.log(`  orderType=${x._id}: ${x.count}`)
    const dirty = rows.filter(x => x._id === 'order' || x._id === 'hosting')
    if (dirty.length) console.log('  !! 脏 orderType 值:', dirty.map(x => `${x._id}(${x.count})`).join(','))
  } catch (e) { console.log('  error:', e.message) }

  // 4) commissions 按 status 分布
  console.log('\n--- 4) commissions 按 status 分布 ---')
  try {
    const r = await db.collection('commissions').aggregate()
      .group({ _id: { $ifNull: ['$status', '__MISSING__'] }, count: { $sum: 1 } })
      .end()
    const rows = (r.data || []).sort((a, b) => b.count - a.count)
    for (const x of rows) console.log(`  status=${x._id}: ${x.count}`)
  } catch (e) { console.log('  error:', e.message) }

  // 5) 潜在重复佣金 (orderId+inviterId 计数>1)
  console.log('\n--- 5) 疑似重复佣金 (orderId+inviterId 计数>1) ---')
  try {
    const r = await db.collection('commissions').aggregate()
      .group({
        _id: { orderId: '$orderId', inviterId: '$inviterId' },
        cnt: { $sum: 1 },
        statuses: { $push: '$status' },
        amounts: { $push: '$commissionAmount' },
      })
      .match({ cnt: { $gt: 1 } })
      .limit(20)
      .end()
    const rows = r.data || []
    console.log('重复组数(前20):', rows.length)
    for (const x of rows) {
      console.log(`  orderId=${x._id.orderId} inviterId=${x._id.inviterId} cnt=${x.cnt} statuses=${JSON.stringify(x.statuses)} amounts=${JSON.stringify(x.amounts)}`)
    }
    if (rows.length === 0) console.log('  (无重复组)')
  } catch (e) { console.log('  error:', e.message) }

  console.log('\n=== DONE ===')
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
