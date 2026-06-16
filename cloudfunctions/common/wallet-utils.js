/**
 * wallet-utils.js - 跨云函数共享的钱包余额工具
 *
 * 用于在佣金结算、订单完成等关键节点自动增加钱包余额。
 */
const { initCloud } = require('./utils')

async function ensureWalletBalance(openid, amount) {
  const { db } = initCloud()
  const _ = db.command
  const amountNum = Number(amount)
  if (!openid || amountNum <= 0) return

  // 先尝试原子更新（钱包已存在）
  const updateRes = await db.collection('wallets').where({ openid }).update({
    data: {
      balance: _.inc(amountNum),
      totalIncome: _.inc(amountNum),
      updatedAt: db.serverDate(),
    },
  })

  // 如果更新命中 0 条，说明钱包不存在，需要初始化
  if (updateRes.stats && updateRes.stats.updated === 0) {
    try {
      await db.collection('wallets').add({
        data: {
          openid,
          balance: amountNum,
          totalIncome: amountNum,
          totalWithdrawn: 0,
          frozenAmount: 0,
          status: 'active',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    } catch (e) {
      // 并发场景下可能其他请求已创建钱包，再次尝试原子更新
      if (e && e.errCode === -502001) {
        await db.collection('wallets').where({ openid }).update({
          data: {
            balance: _.inc(amountNum),
            totalIncome: _.inc(amountNum),
            updatedAt: db.serverDate(),
          },
        })
      } else {
        throw e
      }
    }
  }
}

module.exports = { ensureWalletBalance }
