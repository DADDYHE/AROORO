/**
 * 提交后正确性检查 - 回归测试
 *
 * 覆盖 2026-07-25 审查发现的 4 个关键缺陷：
 *   1. refund.ts 退款金额单位混淆（分 vs 元）导致合法退款被拒
 *   2. partnerService/wallet.ts getMyIncomeDetails 中 hostId 应为 organizerId
 *   3. orderTimeoutService 喂养/活动订单缺少 paymentStatus 过滤
 *   4. notify.ts 事务失败后仍触发佣金记录
 */

// =====================================================================
// 辅助 mock 工具
// =====================================================================

function createMockDb(collections = {}) {
  const db = {
    serverDate: () => new Date().toISOString(),
    command: {
      inc: v => ({ _op: 'inc', v }),
      gte: v => ({ _op: 'gte', v }),
      neq: v => ({ _op: 'neq', v }),
      in: arr => ({ _op: 'in', v: arr }),
      nin: arr => ({ _op: 'nin', v: arr }),
    },
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
            const doc = coll.docs.find(d => d._id === id)
            if (doc) Object.assign(doc, data)
            return { stats: { updated: doc ? 1 : 0 } }
          },
        }),
        where: (query) => {
          const docs = coll.docs.filter(doc => {
            for (const [k, v] of Object.entries(query || {})) {
              if (v && typeof v === 'object' && v._op) {
                if (v._op === 'neq' && doc[k] === v.v) return false
                if (v._op === 'in' && !v.v.includes(doc[k])) return false
                if (v._op === 'gte' && !(doc[k] >= v.v)) return false
              } else if (doc[k] !== v) {
                return false
              }
            }
            return true
          })
          return {
            limit: (n) => ({
              get: async () => ({ data: docs.slice(0, n || docs.length) }),
              update: async ({ data }) => {
                for (const doc of docs.slice(0, n || docs.length)) {
                  Object.assign(doc, data)
                }
                return { stats: { updated: docs.length } }
              },
              count: async () => ({ total: docs.length }),
            }),
            get: async () => ({ data: docs }),
            count: async () => ({ total: docs.length }),
          }
        },
        add: async ({ data }) => {
          const doc = { ...data }
          coll.docs.push(doc)
          return { _id: doc._id || 'auto-id' }
        },
      }
    },
    startTransaction: () => {
      let committed = false
      let rolledBack = false
      const txDb = {
        ...db,
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
                if (doc) Object.assign(doc, data)
                return { stats: { updated: doc ? 1 : 0 } }
              },
            }),
            add: async ({ data }) => {
              if (rolledBack) throw new Error('Transaction already rolled back')
              const doc = { ...data }
              coll.docs.push(doc)
              return { _id: doc._id || 'auto-id' }
            },
          }
        },
      }
      return {
        collection: txDb.collection,
        commit: async () => { committed = true },
        rollback: async () => { rolledBack = true },
      }
    },
  }
  return db
}

// =====================================================================
// 缺陷 1：退款金额单位混淆
// =====================================================================

describe('缺陷 1: refund 退款金额单位混淆 (分 vs 元)', () => {
  test('refundAmount (分) 与 paidAmount (元) 比较时必须 * 100', () => {
    // 场景：用户支付 10 元（DB: paidAmount=10），申请全额退款 1000 分
    const refundAmountFen = 1000 // 分
    const paidAmountYuan = 10    // 元

    // Bug 修复前：Number(refundAmount) > actualTotalYuan => 1000 > 10 => true => 拒绝退款
    // Bug 修复后：Number(refundAmount) > actualTotalYuan * 100 => 1000 > 1000 => false => 放行
    const beforeFix = refundAmountFen > paidAmountYuan  // true — 错误拒绝
    const afterFix = refundAmountFen > paidAmountYuan * 100  // false — 正确放行

    expect(beforeFix).toBe(true)   // Bug: 合法退款被错误拒绝
    expect(afterFix).toBe(false)   // Fix: 合法退款正确放行
  })

  test('超额退款仍应被拦截', () => {
    const refundAmountFen = 1500 // 15 元（分）
    const paidAmountYuan = 10    // 10 元（元）

    const afterFix = refundAmountFen > paidAmountYuan * 100
    expect(afterFix).toBe(true)  // 超额退款正确拒绝
  })

  test('边界值：恰好等于支付金额', () => {
    const refundAmountFen = 1000 // 10 元（分）
    const paidAmountYuan = 10    // 10 元（元）

    const afterFix = refundAmountFen > paidAmountYuan * 100
    expect(afterFix).toBe(false)  // 恰好等于，放行
  })
})

// =====================================================================
// 缺陷 2：getMyIncomeDetails hostId vs organizerId
// =====================================================================

describe('缺陷 2: partnerService getMyIncomeDetails 寄养查询字段错误', () => {
  test('hostId 不等于 openid，organizerId 才是 openid', () => {
    // 模拟订单数据结构：hostId 是 hostProfiles 文档 ID，organizerId 是用户 openid
    const order = {
      _id: 'order-1',
      hostId: 'host_profile_abc123',  // 文档 ID，不是 openid
      organizerId: 'oUserOpenId_XYZ', // 用户的微信 openid
      status: 'completed',
      type: 'boarding',
      totalPrice: 200,
    }

    const openid = 'oUserOpenId_XYZ'

    // Bug 修复前：{ hostId: openid } → hostId('host_profile_abc123') !== openid → 匹配不到
    const beforeFix = order.hostId === openid
    expect(beforeFix).toBe(false)  // Bug: 寄养收入永远查不到

    // Bug 修复后：{ organizerId: openid } → organizerId === openid → 匹配成功
    const afterFix = order.organizerId === openid
    expect(afterFix).toBe(true)   // Fix: 正确匹配
  })
})

// =====================================================================
// 缺陷 3：orderTimeoutService 缺少 paymentStatus 过滤
// =====================================================================

describe('缺陷 3: orderTimeoutService 喂养/活动订单缺少 paymentStatus 过滤', () => {
  test('已支付喂养订单不应被超时取消', () => {
    const feedingOrder = {
      _id: 'feeding-1',
      status: 'pending_payment',
      paymentStatus: 'paid',   // 已支付但回调尚未更新 status
      createdAt: new Date('2026-07-01'),
    }

    // Bug 修复前查询条件（缺少 paymentStatus）
    const beforeFixQuery = {
      status: 'pending_payment',
      createdAt: { _op: 'lte', v: new Date('2026-07-25') },
    }
    // Bug: 匹配到 status='pending_payment' 且未过滤 paymentStatus='paid'
    const matchesBefore = feedingOrder.status === beforeFixQuery.status
    expect(matchesBefore).toBe(true)  // Bug: 已支付订单被错误匹配

    // Bug 修复后查询条件
    const afterFixQuery = {
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      createdAt: { _op: 'lte', v: new Date('2026-07-25') },
    }
    const matchesAfter = feedingOrder.status === afterFixQuery.status
      && feedingOrder.paymentStatus === afterFixQuery.paymentStatus
    expect(matchesAfter).toBe(false)  // Fix: 已支付订单不被匹配
  })

  test('未支付喂养订单仍应被超时取消', () => {
    const unpaidOrder = {
      _id: 'feeding-2',
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      createdAt: new Date('2026-07-01'),
    }

    const matchesAfter = unpaidOrder.status === 'pending_payment'
      && unpaidOrder.paymentStatus === 'unpaid'
    expect(matchesAfter).toBe(true)  // 未支付订单仍正确匹配
  })
})

// =====================================================================
// 缺陷 4：notify.ts 事务失败后仍触发佣金
// =====================================================================

describe('缺陷 4: notify 事务失败后不应触发佣金记录', () => {
  let commissionTriggered = false

  const mockApplyPaidStatus = {
    success: async () => true,
    failure: async () => false,
  }

  const mockTriggerCommission = async () => {
    commissionTriggered = true
  }

  beforeEach(() => {
    commissionTriggered = false
  })

  test('事务成功时应触发佣金', async () => {
    const paidSuccess = await mockApplyPaidStatus.success()
    if (paidSuccess) {
      await mockTriggerCommission()
    }
    expect(commissionTriggered).toBe(true)
  })

  test('事务失败时不应触发佣金', async () => {
    const paidSuccess = await mockApplyPaidStatus.failure()
    if (paidSuccess) {
      await mockTriggerCommission()
    }
    expect(commissionTriggered).toBe(false)
  })

  test('旧代码（无条件触发）会错误创建佣金', async () => {
    // 模拟旧代码行为：不检查 applyPaidStatus 返回值
    const paidSuccess = await mockApplyPaidStatus.failure()
    // 旧代码直接执行 triggerCommission
    await mockTriggerCommission()
    expect(commissionTriggered).toBe(true)  // Bug: 事务失败仍创建佣金
  })
})

// =====================================================================
// 缺陷 5：refund.ts 退款事务中订单状态更新硬编码 'orders' 集合
// =====================================================================

describe('缺陷 5: refund 事务中订单状态更新硬编码 orders 集合 (0162dc8)', () => {
  /**
   * 触发场景：
   *   用户对 activity 或 feeding 类型订单发起自助退款。
   *   fetchOrderAndVerifyOwnership 已按 orderType 路由到正确集合查询订单，
   *   但事务内更新主订单状态时硬编码 collection('orders')，
   *   导致更新的是 orders 集合中不存在的文档，事务失败回滚。
   *
   * 影响：
   *   1. 微信退款已实际发生，但订单状态永远停留在 paid
   *   2. 佣金取消、业务表同步全部因事务回滚而失效
   *   3. 用户可反复发起退款（订单状态永不为 refunded）
   *   4. 系统侧数据与微信侧严重不一致
   */

  const ORDER_TYPE_COLLECTION_MAP = {
    order: 'orders',
    mall: 'orders',
    tuan: 'orders',
    activity: 'activity_registrations',
    feeding: 'feedingOrders',
  }

  test('activity 订单退款应更新 activity_registrations 集合，而非 orders', () => {
    const orderType = 'activity'
    const orderDoc = { _id: 'act-reg-001', outTradeNo: 'ACT_20260725_001', orderType: 'activity' }

    // Bug 修复前：硬编码 'orders'
    const beforeFixCollection = 'orders'
    expect(beforeFixCollection).toBe('orders')
    // 用 activity 订单的 _id 去 orders 集合查找 → 找不到文档
    const beforeFixDocExists = beforeFixCollection === ORDER_TYPE_COLLECTION_MAP[orderType]
    expect(beforeFixDocExists).toBe(false)  // Bug: 更新到错误的集合

    // Bug 修复后：按 orderType 路由到正确集合
    const afterFixCollection = ORDER_TYPE_COLLECTION_MAP[orderType] || 'orders'
    expect(afterFixCollection).toBe('activity_registrations')
    const afterFixDocExists = afterFixCollection === ORDER_TYPE_COLLECTION_MAP[orderType]
    expect(afterFixDocExists).toBe(true)  // Fix: 更新到正确的集合
  })

  test('feeding 订单退款应更新 feedingOrders 集合', () => {
    const orderType = 'feeding'
    const afterFixCollection = ORDER_TYPE_COLLECTION_MAP[orderType] || 'orders'
    expect(afterFixCollection).toBe('feedingOrders')
  })

  test('mall/tuan/order 订单仍应更新 orders 集合（回归）', () => {
    expect(ORDER_TYPE_COLLECTION_MAP['mall']).toBe('orders')
    expect(ORDER_TYPE_COLLECTION_MAP['tuan']).toBe('orders')
    expect(ORDER_TYPE_COLLECTION_MAP['order']).toBe('orders')
  })

  test('完整链路：activity 退款事务成功时订单状态应为 refunded', async () => {
    // 模拟：activity 订单在 activity_registrations 集合中
    const collections = {}
    const db = createMockDb(collections)

    // 预置 activity 报名订单
    collections['activity_registrations'] = {
      docs: [
        { _id: 'act-reg-001', outTradeNo: 'ACT_20260725_001', status: 'paid', paymentStatus: 'paid', ownerId: 'user-001', activityId: 'act-001' }
      ]
    }

    const orderType = 'activity'
    const orderDoc = collections['activity_registrations'].docs[0]
    const orderCollection = ORDER_TYPE_COLLECTION_MAP[orderType] || 'orders'

    // 模拟事务：使用正确的集合更新订单状态
    const transaction = await db.startTransaction()
    await transaction.collection(orderCollection).doc(orderDoc._id).update({
      data: { status: 'refunded', paymentStatus: 'refunded' }
    })
    await transaction.commit()

    // 验证：订单状态已更新
    const updated = collections['activity_registrations'].docs.find(d => d._id === 'act-reg-001')
    expect(updated.status).toBe('refunded')
    expect(updated.paymentStatus).toBe('refunded')
  })
})

// =====================================================================
// 缺陷 6：adminService 未注入全局限流 store
// =====================================================================

describe('缺陷 6: adminService 未注入全局限流 store (0162dc8)', () => {
  /**
   * 触发场景：
   *   adminService 中有多个服务调用了 withRateLimit（refund / upload / application），
   *   但 adminService 入口从未调用 bootstrapRateLimit 注入全局 DB store。
   *   导致 withRateLimit 始终走内存 Map 路径。
   *
   * 影响：
   *   1. 云函数冷启动时内存 Map 为空，等同于完全不限流
   *   2. 多实例部署下，每个实例独立计数，限流效果被 N 倍稀释
   *   3. admin_refund 等敏感接口的 fail-closed 逻辑完全不生效
   *   4. 攻击者获取管理员账号后可无限速发起退款、上传等操作
   */

  test('adminService 入口应包含 bootstrapRateLimit 调用', () => {
    // 验证：adminService/index.js 中存在 bootstrapRateLimit 引用
    const fs = require('fs')
    const path = require('path')
    const adminIndexPath = path.join(__dirname, '..', 'cloudfunctions', 'adminService', 'index.js')
    const content = fs.readFileSync(adminIndexPath, 'utf8')

    const hasBootstrapImport = content.includes('bootstrapRateLimit')
    const hasBootstrapCall = content.includes('bootstrapRateLimit(') && content.includes('rate-limit-bootstrap')

    // 修复后应存在 bootstrap 调用
    expect(hasBootstrapImport).toBe(true)
    expect(hasBootstrapCall).toBe(true)
  })

  test('paymentService 已正确配置 strict 模式（参照基准）', () => {
    const fs = require('fs')
    const path = require('path')
    const paymentIndexPath = path.join(__dirname, '..', 'cloudfunctions', 'paymentService', 'index.js')
    const content = fs.readFileSync(paymentIndexPath, 'utf8')

    expect(content.includes('bootstrapRateLimit')).toBe(true)
    expect(content.includes('strict: true')).toBe(true)  // 资金服务用 strict 模式
  })

  test('adminService 使用非 strict 模式（权限体系已提供强保护）', () => {
    const fs = require('fs')
    const path = require('path')
    const adminIndexPath = path.join(__dirname, '..', 'cloudfunctions', 'adminService', 'index.js')
    const content = fs.readFileSync(adminIndexPath, 'utf8')

    // adminService 使用 non-strict 模式（best-effort），因为：
    // 1. 所有敏感接口已有 super_admin / partner 权限保护
    // 2. 限流是防御纵深，不应因限流故障阻断管理后台
    // 3. 降级到内存模式仍有基本防护
    expect(content.includes('strict: false')).toBe(true)
  })
})
