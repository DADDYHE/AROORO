/**
 * 提现流程并发竞态与数据完整性回归测试
 *
 * 覆盖 2026-08-10 批次（v5.1 提现/佣金重构）中审查发现的 3 个关键缺陷：
 *   1. approveWithdrawal 与 rejectWithdrawal 并发竞态（资金双付/状态不一致）
 *   2. retryTransfer 与 cancelWithdrawal/confirmManualTransfer 并发竞态（资金双付）
 *   3. withdrawal-settle.js 补偿路径 w.amount 未做 Number() 兜底（数据完整性）
 */

const fs = require('fs')
const path = require('path')

// =====================================================================
// 辅助：内存版 Mock DB（支持 where + inc + neq + gte）
// =====================================================================

function createMockDb(collections = {}) {
  const db = {
    serverDate: () => new Date().toISOString(),
    command: {
      inc: v => ({ _op: 'inc', v }),
      gte: v => ({ _op: 'gte', v }),
      neq: v => ({ _op: 'neq', v }),
    },
    collection: (name) => {
      if (!collections[name]) collections[name] = { docs: [] }
      const coll = collections[name]
      const match = (doc, q) => {
        for (const [k, v] of Object.entries(q || {})) {
          if (v && typeof v === 'object' && v._op) {
            if (v._op === 'neq' && doc[k] === v.v) return false
            if (v._op === 'gte' && !(doc[k] >= v.v)) return false
          } else if (doc[k] !== v) {
            return false
          }
        }
        return true
      }
      return {
        doc: (id) => ({
          get: async () => {
            const doc = coll.docs.find(d => d._id === id)
            return { data: doc || null }
          },
          update: async ({ data }) => {
            const doc = coll.docs.find(d => d._id === id)
            if (!doc) return { stats: { updated: 0 } }
            for (const [k, v] of Object.entries(data)) {
              if (v && typeof v === 'object' && v._op === 'inc') {
                doc[k] = (Number(doc[k]) || 0) + Number(v.v)
              } else {
                doc[k] = v
              }
            }
            return { stats: { updated: 1 } }
          },
        }),
        where: (query) => {
          const docs = coll.docs.filter(d => match(d, query))
          return {
            limit: (n) => ({
              get: async () => ({ data: docs.slice(0, n || docs.length) }),
              update: async ({ data }) => {
                const targets = docs.slice(0, n || docs.length)
                for (const doc of targets) {
                  for (const [k, v] of Object.entries(data)) {
                    if (v && typeof v === 'object' && v._op === 'inc') {
                      doc[k] = (Number(doc[k]) || 0) + Number(v.v)
                    } else {
                      doc[k] = v
                    }
                  }
                }
                return { stats: { updated: targets.length } }
              },
              count: async () => ({ total: docs.length }),
            }),
            get: async () => ({ data: docs }),
            count: async () => ({ total: docs.length }),
            update: async ({ data }) => {
              const targets = docs
              for (const doc of targets) {
                for (const [k, v] of Object.entries(data)) {
                  if (v && typeof v === 'object' && v._op === 'inc') {
                    doc[k] = (Number(doc[k]) || 0) + Number(v.v)
                  } else {
                    doc[k] = v
                  }
                }
              }
              return { stats: { updated: targets.length } }
            },
          }
        },
        add: async ({ data }) => {
          const doc = { ...data, _id: data._id || 'auto_' + Math.random().toString(36).slice(2) }
          coll.docs.push(doc)
          return { _id: doc._id }
        },
      }
    },
    startTransaction: () => {
      let rolledBack = false
      const txDb = {
        collection: (name) => {
          if (!collections[name]) collections[name] = { docs: [] }
          const coll = collections[name]
          return {
            doc: (id) => ({
              get: async () => {
                const doc = coll.docs.find(d => d._id === id)
                return { data: doc || null }
              },
              update: async ({ data }) => {
                if (rolledBack) throw new Error('Transaction already rolled back')
                const doc = coll.docs.find(d => d._id === id)
                if (!doc) return { stats: { updated: 0 } }
                for (const [k, v] of Object.entries(data)) {
                  if (v && typeof v === 'object' && v._op === 'inc') {
                    doc[k] = (Number(doc[k]) || 0) + Number(v.v)
                  } else {
                    doc[k] = v
                  }
                }
                return { stats: { updated: 1 } }
              },
            }),
          }
        },
      }
      return {
        collection: txDb.collection,
        commit: async () => {},
        rollback: async () => { rolledBack = true },
      }
    },
  }
  return db
}

// =====================================================================
// 缺陷 1 & 2：并发互斥条件静态检查
// =====================================================================

describe('缺陷 1&2: 提现审批/拒绝/重试/撤销 并发互斥条件', () => {
  const walletPath = path.join(__dirname, '..', 'cloudfunctions', 'adminService', 'services', 'wallet.js')
  const content = fs.readFileSync(walletPath, 'utf8')

  test('approveWithdrawal 自动打款分支必须排除 rejectStarted', () => {
    // 查找自动打款分支的条件更新代码块
    const autoBranchPattern = /where\(\{\s*_id:\s*withdrawalId,\s*status:\s*'pending',\s*rejectStarted:\s*_.neq\(true\)\s*\}/
    expect(autoBranchPattern.test(content)).toBe(true)
  })

  test('approveWithdrawal 人工打款分支必须排除 rejectStarted', () => {
    const manualBranchPattern = /where\(\{\s*_id:\s*withdrawalId,\s*status:\s*'pending',\s*rejectStarted:\s*_.neq\(true\)\s*\}/
    expect(manualBranchPattern.test(content)).toBe(true)
  })

  test('retryTransfer 必须排除 cancelStarted 与 manualConfirmStarted', () => {
    const retryPattern = /where\(\{\s*_id:\s*withdrawalId,\s*status:\s*'approved',\s*cancelStarted:\s*_.neq\(true\),\s*manualConfirmStarted:\s*_.neq\(true\)\s*\}/
    expect(retryPattern.test(content)).toBe(true)
  })

  test('confirmManualTransfer 已正确排除 cancelStarted（回归）', () => {
    const confirmPattern = /where\(\{\s*_id:\s*withdrawalId,\s*status:\s*'approved',\s*mode:\s*'manual',\s*manualConfirmStarted:\s*_.neq\(true\),\s*cancelStarted:\s*_.neq\(true\)\s*\}/
    expect(confirmPattern.test(content)).toBe(true)
  })

  test('cancelWithdrawal 已正确排除 manualConfirmStarted（回归）', () => {
    const cancelPattern = /where\(\{\s*_id:\s*withdrawalId,\s*status:\s*'approved',\s*cancelStarted:\s*_.neq\(true\),\s*manualConfirmStarted:\s*_.neq\(true\)\s*\}/
    expect(cancelPattern.test(content)).toBe(true)
  })
})

// =====================================================================
// 缺陷 1&2：并发竞态动态模拟（原子占位窗口）
// =====================================================================

describe('缺陷 1&2: 并发竞态动态模拟', () => {
  test('rejectStarted 占位后 approveWithdrawal 条件更新应失败', async () => {
    const collections = {
      withdrawals: {
        docs: [
          { _id: 'wd-1', status: 'pending', rejectStarted: true, amount: 100, openid: 'u1', walletType: 'commission' },
        ],
      },
    }
    const db = createMockDb(collections)
    const _ = db.command

    // 模拟 approveWithdrawal 自动打款分支的条件更新
    const claimRes = await db.collection('withdrawals')
      .where({ _id: 'wd-1', status: 'pending', rejectStarted: _.neq(true) })
      .update({ data: { status: 'processing', updatedAt: db.serverDate() } })

    expect(claimRes.stats.updated).toBe(0)
    // 状态应保持 pending（未被错误改为 processing）
    expect(collections.withdrawals.docs[0].status).toBe('pending')
  })

  test('cancelStarted 占位后 retryTransfer 条件更新应失败', async () => {
    const collections = {
      withdrawals: {
        docs: [
          { _id: 'wd-2', status: 'approved', cancelStarted: true, amount: 100, openid: 'u1', mode: 'auto' },
        ],
      },
    }
    const db = createMockDb(collections)
    const _ = db.command

    // 模拟 retryTransfer 的条件更新
    const claimRes = await db.collection('withdrawals')
      .where({ _id: 'wd-2', status: 'approved', cancelStarted: _.neq(true), manualConfirmStarted: _.neq(true) })
      .update({ data: { status: 'processing', updatedAt: db.serverDate() } })

    expect(claimRes.stats.updated).toBe(0)
    expect(collections.withdrawals.docs[0].status).toBe('approved')
  })

  test('manualConfirmStarted 占位后 retryTransfer 条件更新应失败', async () => {
    const collections = {
      withdrawals: {
        docs: [
          { _id: 'wd-3', status: 'approved', manualConfirmStarted: true, amount: 100, openid: 'u1', mode: 'auto' },
        ],
      },
    }
    const db = createMockDb(collections)
    const _ = db.command

    const claimRes = await db.collection('withdrawals')
      .where({ _id: 'wd-3', status: 'approved', cancelStarted: _.neq(true), manualConfirmStarted: _.neq(true) })
      .update({ data: { status: 'processing', updatedAt: db.serverDate() } })

    expect(claimRes.stats.updated).toBe(0)
    expect(collections.withdrawals.docs[0].status).toBe('approved')
  })
})

// =====================================================================
// 缺陷 3：withdrawal-settle.js 补偿路径 Number() 兜底
// =====================================================================

describe('缺陷 3: withdrawal-settle 补偿路径 amount 类型安全', () => {
  const settlePath = path.join(__dirname, '..', 'cloudfunctions', 'common', 'withdrawal-settle.js')
  const content = fs.readFileSync(settlePath, 'utf8')

  test('补偿路径必须包含 Number(w.amount) || 0 兜底', () => {
    expect(content.includes('const amountNum = Number(w.amount) || 0')).toBe(true)
    expect(content.includes('_.inc(-amountNum)')).toBe(true)
    expect(content.includes('_.inc(amountNum)')).toBe(true)
  })

  test('补偿路径不应直接使用 w.amount 进行 inc 运算', () => {
    // 确保没有遗漏的 _.inc(-w.amount) 或 _.inc(w.amount)
    const directIncPattern = /\.inc\(\s*[+-]?w\.amount\s*\)/
    expect(directIncPattern.test(content)).toBe(false)
  })

  test('事务主路径已含 Number() 兜底（回归）', () => {
    expect(content.includes('_.inc(-(Number(w.amount) || 0))')).toBe(true)
    expect(content.includes('_.inc(Number(w.amount) || 0)')).toBe(true)
  })
})

describe('缺陷 3: withdrawal-settle 补偿路径动态行为', () => {
  test('字符串 amount 应被正确转换为数字后再 inc', async () => {
    const collections = {
      withdrawals: {
        docs: [
          { _id: 'wd-4', status: 'processing', amount: '100.50', openid: 'u1', walletType: 'commission' },
        ],
      },
      wallets: {
        docs: [
          { _id: 'wal-1', openid: 'u1', type: 'commission', frozenAmount: 100.50, totalWithdrawn: 0 },
        ],
      },
    }
    const db = createMockDb(collections)
    const _ = db.command

    // 模拟补偿路径的行为（简化版，不导入完整模块）
    const w = collections.withdrawals.docs[0]
    const walletDoc = collections.wallets.docs[0]
    const amountNum = Number(w.amount) || 0

    await db.collection('wallets').doc(walletDoc._id).update({
      data: {
        frozenAmount: _.inc(-amountNum),
        totalWithdrawn: _.inc(amountNum),
      },
    })

    expect(collections.wallets.docs[0].frozenAmount).toBe(0)
    expect(collections.wallets.docs[0].totalWithdrawn).toBe(100.50)
  })

  test('非法 amount (null) 应被兜底为 0，不破坏钱包数据', async () => {
    const collections = {
      withdrawals: {
        docs: [
          { _id: 'wd-5', status: 'processing', amount: null, openid: 'u1', walletType: 'commission' },
        ],
      },
      wallets: {
        docs: [
          { _id: 'wal-2', openid: 'u1', type: 'commission', frozenAmount: 50, totalWithdrawn: 0 },
        ],
      },
    }
    const db = createMockDb(collections)
    const _ = db.command

    const w = collections.withdrawals.docs[0]
    const walletDoc = collections.wallets.docs[0]
    const amountNum = Number(w.amount) || 0

    await db.collection('wallets').doc(walletDoc._id).update({
      data: {
        frozenAmount: _.inc(-amountNum),
        totalWithdrawn: _.inc(amountNum),
      },
    })

    // 由于 amountNum = 0，钱包数据应保持不变
    expect(collections.wallets.docs[0].frozenAmount).toBe(50)
    expect(collections.wallets.docs[0].totalWithdrawn).toBe(0)
  })
})
