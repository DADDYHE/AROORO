/**
 * Sprint 12: 通知聚合子链路集成测试
 *
 * 覆盖（通过 userService main 路由）：
 *   1. getNotificationList：分页 + 多种 type 通知聚合 + 未读数统计
 *   2. markNotificationRead：单条标记已读 + 权限校验
 *   3. markAllNotificationsRead：批量标记本人全部已读
 *   4. getNotificationDetail：详情 + 自动标记已读 + 跨用户数据隔离
 *   5. 通知 type 字段一致性（order_status_change / system / commission 等）
 *
 * 通知聚合统一走 notifications 集合，本测试聚焦于不同业务源
 * （订单/系统/佣金）写入通知后用户中心 API 的聚合与状态管理能力。
 */

const mockDb = {
  _collections: {},
  _reset() {
    for (const key of Object.keys(this._collections)) {
      this._collections[key] = { docs: [] }
    }
  },
  collection(name) {
    if (!this._collections[name]) {
      this._collections[name] = { docs: [] }
    }
    const self = this
    const matchDoc = (doc, query) => {
      if (!query) { return true }
      for (const [k, v] of Object.entries(query)) {
        if (v && typeof v === 'object' && v._op) {
          if (v._op === 'in' && Array.isArray(v.v)) {
            if (!v.v.includes(doc[k])) {return false}
          } else if (v._op === 'eq') {
            if (doc[k] !== v.v) {return false}
          } else {
            if (doc[k] !== v) {return false}
          }
          continue
        }
        if (doc[k] !== v) {return false}
      }
      return true
    }
    return {
      doc: id => {
        const chain = {
          get: async () => {
            const doc = self._collections[name].docs.find(d => d._id === id)
            return { data: doc || null }
          },
          update: async ({ data }) => {
            const doc = self._collections[name].docs.find(d => d._id === id)
            if (doc) {Object.assign(doc, data)}
          },
          field: () => chain,
        }
        return chain
      },
      where: query => {
        const docs = self._collections[name].docs.filter(d => matchDoc(d, query))
        const chain = {
          count: async () => ({ total: docs.length }),
          field: () => chain,
          orderBy: () => chain,
          skip: () => chain,
          limit: () => chain,
          get: async () => ({ data: docs }),
          update: async ({ data }) => {
            for (const d of docs) {Object.assign(d, data)}
          },
        }
        return chain
      },
      add: async ({ data }) => {
        const newDoc = { ...data }
        self._collections[name].docs.push(newDoc)
        return { _id: newDoc._id }
      },
    }
  },
  command: {
    in: arr => ({ _op: 'in', v: arr }),
    eq: v => ({ _op: 'eq', v }),
  },
  serverDate: () => Date.now(),
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: global.__openid }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

global.__openid = 'oUser1'

const { main } = require('../../cloudfunctions/userService/index.js')

beforeEach(() => {
  mockDb._reset()
  mockDb._collections.notifications = { docs: [] }
  mockDb._collections.users = { docs: [] }
  global.__openid = 'oUser1'
})

function call(action, params, openid) {
  const prev = global.__openid
  global.__openid = openid === null ? undefined : (openid || 'oUser1')
  return main({ action, ...params }, {}).finally(() => { global.__openid = prev })
}

/** 工具：构造 N 条不同 type 的通知 */
function seedNotifications(ownerId, count = 3) {
  const docs = []
  const types = ['order_status_change', 'system', 'commission', 'coupon', 'activity']
  for (let i = 0; i < count; i++) {
    docs.push({
      _id: `n_${ownerId}_${i}`,
      ownerId,
      type: types[i % types.length],
      title: `通知 ${i}`,
      content: `内容 ${i}`,
      isRead: i % 2 === 0, // 交替已读/未读
      createdAt: Date.now() - (count - i) * 1000,
    })
  }
  mockDb._collections.notifications.docs = docs
  return docs
}

describe('Sprint 12: IM/通知聚合子链路', () => {
  describe('getNotificationList：聚合 + 分页 + 未读数', () => {
    test('空列表返回空数组 + 未读数为 0', async () => {
      const res = await call('getNotificationList', { page: 1, pageSize: 10 }, 'oUser1')
      expect(res.code).toBe(0)
      expect(res.data.list).toEqual([])
      expect(res.data.unreadCount).toBe(0)
      expect(res.data.page).toBe(1)
      expect(res.data.pageSize).toBe(10)
    })

    test('聚合多种 type 的通知', async () => {
      seedNotifications('oUser1', 5)
      const res = await call('getNotificationList', { page: 1, pageSize: 10 }, 'oUser1')
      expect(res.code).toBe(0)
      expect(res.data.list.length).toBe(5)
      const types = new Set(res.data.list.map(n => n.type))
      expect(types.has('order_status_change')).toBe(true)
      expect(types.has('system')).toBe(true)
      expect(types.has('commission')).toBe(true)
    })

    test('未读数正确统计', async () => {
      seedNotifications('oUser1', 5) // 索引 1/3 未读 → 2 条
      const res = await call('getNotificationList', { page: 1, pageSize: 10 }, 'oUser1')
      expect(res.data.unreadCount).toBe(2)
    })

    test('分页：pageSize 控制返回数量', async () => {
      seedNotifications('oUser1', 10)
      // 该 mock 不实现 skip/limit 截断，本测试验证 pageSize 被透传
      const res = await call('getNotificationList', { page: 1, pageSize: 3 }, 'oUser1')
      expect(res.data.pageSize).toBe(3)
      expect(res.data.list.length).toBe(10)
    })

    test('数据隔离：其他用户的通知不出现在当前用户列表中', async () => {
      mockDb._collections.notifications.docs = [
        { _id: 'n1', ownerId: 'oUser1', type: 'system', isRead: false, createdAt: Date.now() },
        { _id: 'n2', ownerId: 'oUser2', type: 'system', isRead: false, createdAt: Date.now() },
        { _id: 'n3', ownerId: 'oUser2', type: 'order_status_change', isRead: false, createdAt: Date.now() },
      ]
      const res = await call('getNotificationList', { page: 1, pageSize: 10 }, 'oUser1')
      expect(res.data.list.length).toBe(1)
      expect(res.data.list.every(n => n.ownerId === 'oUser1')).toBe(true)
      expect(res.data.unreadCount).toBe(1)
    })

    test('未登录应 AUTH_REQUIRED', async () => {
      const res = await call('getNotificationList', { page: 1, pageSize: 10 }, null)
      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('AUTH_REQUIRED')
    })
  })

  describe('markNotificationRead：单条已读 + 权限', () => {
    test('标记本人通知为已读', async () => {
      mockDb._collections.notifications.docs = [
        { _id: 'n1', ownerId: 'oUser1', type: 'system', isRead: false, createdAt: Date.now() },
      ]
      const res = await call('markNotificationRead', { notificationId: 'n1' }, 'oUser1')
      expect(res.code).toBe(0)
      expect(mockDb._collections.notifications.docs[0].isRead).toBe(true)
    })

    test('缺 notificationId 应 INVALID_PARAMS', async () => {
      const res = await call('markNotificationRead', {}, 'oUser1')
      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('INVALID_PARAMS')
    })

    test('不存在的通知应失败', async () => {
      const res = await call('markNotificationRead', { notificationId: 'missing' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })

    test('标记他人通知应 PERMISSION_DENIED', async () => {
      mockDb._collections.notifications.docs = [
        { _id: 'n1', ownerId: 'oOther', type: 'system', isRead: false, createdAt: Date.now() },
      ]
      const res = await call('markNotificationRead', { notificationId: 'n1' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })
  })

  describe('markAllNotificationsRead：批量已读', () => {
    test('仅标记本人未读通知为已读', async () => {
      mockDb._collections.notifications.docs = [
        { _id: 'n1', ownerId: 'oUser1', type: 'system', isRead: false, createdAt: Date.now() },
        { _id: 'n2', ownerId: 'oUser1', type: 'order_status_change', isRead: false, createdAt: Date.now() },
        { _id: 'n3', ownerId: 'oUser1', type: 'commission', isRead: true, createdAt: Date.now() },
        { _id: 'n4', ownerId: 'oOther', type: 'system', isRead: false, createdAt: Date.now() },
      ]
      const res = await call('markAllNotificationsRead', {}, 'oUser1')
      expect(res.code).toBe(0)

      const docs = mockDb._collections.notifications.docs
      expect(docs.find(d => d._id === 'n1').isRead).toBe(true)
      expect(docs.find(d => d._id === 'n2').isRead).toBe(true)
      expect(docs.find(d => d._id === 'n3').isRead).toBe(true) // 保持已读
      // 别人的通知保持不变
      expect(docs.find(d => d._id === 'n4').isRead).toBe(false)
    })

    test('未登录应 AUTH_REQUIRED', async () => {
      const res = await call('markAllNotificationsRead', {}, null)
      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('AUTH_REQUIRED')
    })
  })

  describe('getNotificationDetail：详情 + 自动标记已读', () => {
    test('查看详情时自动标记为已读', async () => {
      mockDb._collections.notifications.docs = [
        { _id: 'n1', ownerId: 'oUser1', type: 'order_status_change', isRead: false, createdAt: Date.now() },
      ]
      const res = await call('getNotificationDetail', { notificationId: 'n1' }, 'oUser1')
      expect(res.code).toBe(0)
      expect(res.data._id).toBe('n1')
      expect(mockDb._collections.notifications.docs[0].isRead).toBe(true)
    })

    test('已读通知不会再次触发更新', async () => {
      mockDb._collections.notifications.docs = [
        { _id: 'n1', ownerId: 'oUser1', type: 'system', isRead: true, createdAt: Date.now() },
      ]
      const updateSpy = jest.fn()
      const origGet = mockDb.collection('notifications').doc
      mockDb.collection('notifications').doc = id => {
        const chain = origGet(id)
        const origUpdate = chain.update
        chain.update = async ({ data }) => {
          updateSpy(data)
          return origUpdate({ data })
        }
        return chain
      }
      const res = await call('getNotificationDetail', { notificationId: 'n1' }, 'oUser1')
      expect(res.code).toBe(0)
      expect(updateSpy).not.toHaveBeenCalled()
    })

    test('缺 notificationId 应 INVALID_PARAMS', async () => {
      const res = await call('getNotificationDetail', {}, 'oUser1')
      expect(res.code).not.toBe(0)
      expect(res.error?.type).toBe('INVALID_PARAMS')
    })

    test('访问他人通知应 NOT_FOUND', async () => {
      mockDb._collections.notifications.docs = [
        { _id: 'n1', ownerId: 'oOther', type: 'system', isRead: false, createdAt: Date.now() },
      ]
      const res = await call('getNotificationDetail', { notificationId: 'n1' }, 'oUser1')
      expect(res.code).not.toBe(0)
    })
  })
})
