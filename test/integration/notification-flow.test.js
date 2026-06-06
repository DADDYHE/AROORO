/**
 * 集成测试 - 订单通知子链路
 *
 * 流程：订单状态变化 → 触发 _sendOrderNotification → 写入 notifications 集合
 *
 * 覆盖：
 *   - 不同状态变更对应不同 statusText
 *   - 同一状态变更产生 owner + host 两条通知
 *   - 通知创建失败不阻塞主流程
 */

const mockDb = {
  _collections: {},
  collection(name) {
    if (!this._collections[name]) {this._collections[name] = { docs: [] }}
    const self = this
    return {
      doc: id => ({
        get: async () => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          return { data: doc || null }
        },
        update: async ({ data }) => {
          const doc = self._collections[name].docs.find(d => d._id === id)
          if (doc) Object.assign(doc, data)
        },
        remove: async () => {
          self._collections[name].docs = self._collections[name].docs.filter(d => d._id !== id)
        },
      }),
      where: query => {
        const docs = self._collections[name].docs.filter(doc => {
          for (const [k, v] of Object.entries(query || {})) {
            if (v && typeof v === 'object' && v._op) {
              if (v._op === 'in' && Array.isArray(v.v)) {
                if (!v.v.includes(doc[k])) return false
              } else if (v._op === 'eq') {
                if (doc[k] !== v.v) return false
              }
              continue
            }
            if (doc[k] !== v) return false
          }
          return true
        })
        return {
          count: async () => ({ total: docs.length }),
          limit: () => ({ get: async () => ({ data: docs }) }),
          get: async () => ({ data: docs }),
        }
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
  serverDate: () => 'MOCK_DATE',
}

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  getWXContext: () => ({ OPENID: 'oNotifTest' }),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: () => mockDb,
}))

beforeEach(() => {
  for (const k of Object.keys(mockDb._collections)) {
    mockDb._collections[k] = { docs: [] }
  }
})

const orders = require('../../cloudfunctions/orderService/orders')

describe('集成测试：订单通知子链路', () => {
  const setupOrder = ({
    orderId = 'o1',
    ownerId = 'oOwner',
    hostOpenid = 'oHost',
    hostId = 'h1',
    initialStatus = 'pending',
  } = {}) => {
    mockDb._collections.users = { docs: [
      { _id: ownerId, openid: ownerId, nickName: '宠物主' },
      { _id: hostOpenid, openid: hostOpenid, nickName: '寄养家庭' },
    ]}
    mockDb._collections.hostProfiles = { docs: [
      { _id: hostId, openid: hostOpenid, hostName: '阳光之家' },
    ]}
    mockDb._collections.orders = { docs: [
      { _id: orderId, ownerId, hostId, organizerId: hostOpenid, status: initialStatus },
    ]}
    mockDb._collections.notifications = { docs: [] }
  }

  test('status 变更 → 写入 owner + host 两条通知', async () => {
    setupOrder()
    await orders.updateOrderStatus({ orderId: 'o1', status: 'confirmed' }, {}, { openid: 'oHost' })

    const notifs = mockDb._collections.notifications.docs
    expect(notifs.length).toBe(2)
    // 两条都标记 status=confirmed
    expect(notifs.every(n => n.status === 'confirmed')).toBe(true)
    // 一条发给 owner，一条发给 host
    expect(notifs.some(n => n.ownerId === 'oOwner')).toBe(true)
    expect(notifs.some(n => n.ownerId === 'oHost')).toBe(true)
  })

  test('通知 statusText 与状态一一对应', async () => {
    setupOrder()
    await orders.updateOrderStatus({ orderId: 'o1', status: 'cancelled' }, {}, { openid: 'oOwner' })

    const notifs = mockDb._collections.notifications.docs
    expect(notifs.every(n => n.statusText === '已取消')).toBe(true)
  })

  test('通知字段：包含 orderId / type=order_status_change / isRead=false', async () => {
    setupOrder()
    await orders.updateOrderStatus({ orderId: 'o1', status: 'paid' }, {}, { openid: 'oOwner' })

    const notifs = mockDb._collections.notifications.docs
    expect(notifs.every(n => n.orderId === 'o1')).toBe(true)
    expect(notifs.every(n => n.type === 'order_status_change')).toBe(true)
    expect(notifs.every(n => n.isRead === false)).toBe(true)
  })

  test('通知写入是 fire-and-forget：失败不阻塞主流程', async () => {
    setupOrder()
    // 让 notifications.add 抛错
    const origAdd = mockDb.collection('notifications').add
    mockDb.collection('notifications').add = async () => { throw new Error('SEND_FAILED') }

    const res = await orders.updateOrderStatus({ orderId: 'o1', status: 'confirmed' }, {}, { openid: 'oHost' })

    // 主流程仍然返回成功
    expect(res.code).toBe(0)
    expect(res.data.status).toBe('confirmed')
    mockDb.collection('notifications').add = origAdd
  })
})
