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

  let walletRes = await db.collection('wallets').where({ openid }).limit(1).get()
  if (!walletRes.data || walletRes.data.length === 0) {
    await db.collection('wallets').add({
      data: {
        openid,
        balance: 0,
        totalIncome: 0,
        totalWithdrawn: 0,
        frozenAmount: 0,
        status: 'active',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })
    walletRes = await db.collection('wallets').where({ openid }).limit(1).get()
  }

  const wallet = walletRes.data[0]
  await db.collection('wallets').doc(wallet._id).update({
    data: {
      balance: _.inc(amountNum),
      totalIncome: _.inc(amountNum),
      updatedAt: db.serverDate(),
    },
  })
}

module.exports = { ensureWalletBalance }
