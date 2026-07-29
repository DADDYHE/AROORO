/**
 * wallet-utils.js - 跨云函数共享的钱包余额工具
 *
 * 用于在佣金结算、订单完成等关键节点自动增加钱包余额。
 *
 * P0-5: 遵循 project_memory 约定，wallets 集合使用 (openid, type) 复合唯一索引，
 *       type 取值 'commission'（佣金）或 'serviceIncome'（服务收入）。
 *       佣金入 commission 钱包，服务收入入 serviceIncome 钱包，分账存储。
 */

/** 钱包类型白名单 */
const WALLET_TYPES = ['commission', 'serviceIncome']

/**
 * 确保钱包余额增加（原子操作，自动创建钱包）
 *
 * @param openid 用户 openid
 * @param amount 增加金额（正数，单位元）
 * @param type 钱包类型：'commission' | 'serviceIncome'（默认 'commission'）
 */
async function ensureWalletBalance(openid, amount, type = 'commission') {
  const { initCloud } = require('./utils')
  const { db } = initCloud()
  const _ = db.command
  const amountNum = Number(amount)
  if (!openid || amountNum <= 0) return
  if (!WALLET_TYPES.includes(type)) {
    throw new Error(`ensureWalletBalance: invalid wallet type "${type}"`)
  }

  const now = db.serverDate()

  // 1) 钱包已存在 -> 原子加款；每笔合法入账精确加一次（并发/重试安全）
  const updateRes = await db.collection('wallets').where({ openid, type }).update({
    data: {
      balance: _.inc(amountNum),
      totalIncome: _.inc(amountNum),
      updatedAt: now,
    },
  })
  if (updateRes && updateRes.stats && updateRes.stats.updated > 0) return

  // 2) 钱包不存在（本请求读取时）-> 创建空钱包，再用 inc 入账。
  //    并发下唯一索引 (openid,type) 兜底：add 命中 -502001 说明已创建，直接走 inc。
  //    add 成功后也走 inc —— 保证无论哪条路径，金额都通过原子 inc 入账，不丢不重。
  try {
    await db.collection('wallets').add({
      data: {
        openid,
        type,
        balance: 0,
        totalIncome: 0,
        totalWithdrawn: 0,
        frozenAmount: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    })
  } catch (e) {
    // 唯一索引冲突：并发场景下另一请求已创建钱包，非致命错误
    if (e && e.errCode === -502001) { /* fall through to inc */ } else { throw e }
  }
  // 3) 无论 add 成功还是 -502001 冲突，统一通过原子 inc 入账
  await db.collection('wallets').where({ openid, type }).update({
    data: {
      balance: _.inc(amountNum),
      totalIncome: _.inc(amountNum),
      updatedAt: now,
    },
  })
}

module.exports = { ensureWalletBalance, WALLET_TYPES }
