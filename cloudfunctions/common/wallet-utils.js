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

  // 2) 钱包不存在（本请求读取时）-> 尝试创建并直接以余额入账。
  //    唯一索引 (openid,type) 兜底并发：至多一个请求 add 成功。
  //    并发下其它请求 add 命中 -502001（已被创建并带余额入账）-> 直接返回，绝不再加款，杜绝重复入账。
  try {
    await db.collection('wallets').add({
      data: {
        openid,
        type,
        balance: amountNum,
        totalIncome: amountNum,
        totalWithdrawn: 0,
        frozenAmount: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    })
  } catch (e) {
    // 唯一索引冲突：并发场景下另一请求已创建并带余额入账，本请求不再加款
    if (e && e.errCode === -502001) return
    throw e
  }
}

module.exports = { ensureWalletBalance, WALLET_TYPES }
