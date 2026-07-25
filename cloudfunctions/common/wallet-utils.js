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

  // 先尝试原子更新（钱包已存在）
  const updateRes = await db.collection('wallets').where({ openid, type }).update({
    data: {
      balance: _.inc(amountNum),
      totalIncome: _.inc(amountNum),
      updatedAt: db.serverDate(),
    },
  })

  // 如果更新命中 0 条，说明钱包不存在，需要初始化
  if (updateRes.stats && updateRes.stats.updated === 0) {
    // P1-C: 并发双入账修复 — add 设 balance: 0，统一通过 update(inc) 入账
    // 旧实现 add 包含 balance: amount，失败后 retry update(inc) 导致金额翻倍
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
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    } catch (e) {
      // 并发场景下其他请求已创建钱包，忽略 -502001 继续执行下面的 update
      if (e && e.errCode !== -502001) {
        throw e
      }
    }
    // 钱包创建成功或已存在（-502001），统一通过 inc 入账（金额只增加一次）
    await db.collection('wallets').where({ openid, type }).update({
      data: {
        balance: _.inc(amountNum),
        totalIncome: _.inc(amountNum),
        updatedAt: db.serverDate(),
      },
    })
  }
}

module.exports = { ensureWalletBalance, WALLET_TYPES }
