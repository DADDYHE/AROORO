/**
 * cloudfunctions/common/normalize.js 单元测试
 */

const {
  normalizeBase,
  normalizeOrder,
  denormalizeOrder,
  normalizeUser,
  normalizeHost,
  normalizePet,
  normalizeProduct,
  normalizeList,
  normalizeByCollection,
} = require('../cloudfunctions/common/normalize')

describe('normalize.js', () => {
  describe('normalizeBase', () => {
    test('应将 _id 复制为 id', () => {
      expect(normalizeBase({ _id: 'x1', name: 'a' })).toEqual({ _id: 'x1', id: 'x1', name: 'a' })
    })

    test('已存在 id 时不应覆盖', () => {
      const out = normalizeBase({ _id: 'x1', id: 'x2' })
      expect(out.id).toBe('x2')
    })

    test('应将 createAt → createdAt', () => {
      const ts = '2026-01-01T00:00:00.000Z'
      const out = normalizeBase({ createAt: ts, name: 'a' })
      expect(out.createdAt).toBe(ts)
    })

    test('应将 updateAt → updatedAt', () => {
      const ts = '2026-01-01T00:00:00.000Z'
      const out = normalizeBase({ updateAt: ts })
      expect(out.updatedAt).toBe(ts)
    })

    test('null / 非对象应原样返回', () => {
      expect(normalizeBase(null)).toBeNull()
      expect(normalizeBase('str')).toBe('str')
      expect(normalizeBase(123)).toBe(123)
    })
  })

  describe('normalizeOrder', () => {
    test('应同时归一化 id / createdAt / duration / petIds / petInfos / hostId / amount', () => {
      const input = {
        _id: 'ord_1',
        createAt: '2026-01-01T00:00:00.000Z',
        days: 3,
        petIds: ['p1', 'p2'],
        petsInfo: [{ _id: 'p1' }, { _id: 'p2' }],
        hostInfo: { _id: 'h1' },
        totalPrice: 12000,
      }
      const out = normalizeOrder(input)
      expect(out.id).toBe('ord_1')
      expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z')
      expect(out.duration).toBe(3)
      expect(out.petIds).toEqual(['p1', 'p2'])
      expect(out.petInfos).toEqual([{ _id: 'p1' }, { _id: 'p2' }])
      expect(out.hostId).toBe('h1')
      expect(out.amount).toBe(12000)
    })

    test('duration 优先级：duration > days > nights', () => {
      expect(normalizeOrder({ duration: 5, days: 3, nights: 2 }).duration).toBe(5)
      expect(normalizeOrder({ days: 3, nights: 2 }).duration).toBe(3)
      expect(normalizeOrder({ nights: 2 }).duration).toBe(2)
      expect(normalizeOrder({}).duration).toBe(1) // 默认
    })

    test('amount 优先级：amount > totalAmount > totalPrice > money', () => {
      expect(normalizeOrder({ amount: 100, totalAmount: 200, totalPrice: 300, money: 400 }).amount).toBe(100)
      expect(normalizeOrder({ totalAmount: 200, totalPrice: 300 }).amount).toBe(200)
      expect(normalizeOrder({ totalPrice: 300 }).amount).toBe(300)
      expect(normalizeOrder({ money: 400 }).amount).toBe(400)
      expect(normalizeOrder({}).amount).toBe(0)
    })

    test('petIds 兼容 petIDs（驼峰 / 全大写）', () => {
      expect(normalizeOrder({ petIDs: ['p1'] }).petIds).toEqual(['p1'])
    })

    test('hostId 可显式传入', () => {
      expect(normalizeOrder({ hostId: 'h_x', hostInfo: { _id: 'h_y' } }).hostId).toBe('h_x')
    })
  })

  describe('denormalizeOrder', () => {
    test('应剔除已废弃字段', () => {
      const input = {
        petIDs: ['p1'],
        pets: [{ _id: 'p1' }],
        petsInfo: [],
        days: 3,
        nights: 3,
        totalAmount: 100,
        totalPrice: 100,
        money: 100,
        createAt: 'x',
        updateAt: 'x',
        petIds: ['p1'], // 保留
        duration: 3, // 保留
      }
      const out = denormalizeOrder(input)
      expect(out.petIDs).toBeUndefined()
      expect(out.pets).toBeUndefined()
      expect(out.petsInfo).toBeUndefined()
      expect(out.days).toBeUndefined()
      expect(out.nights).toBeUndefined()
      expect(out.totalAmount).toBeUndefined()
      expect(out.totalPrice).toBeUndefined()
      expect(out.money).toBeUndefined()
      expect(out.createAt).toBeUndefined()
      expect(out.updateAt).toBeUndefined()
      expect(out.petIds).toEqual(['p1'])
      expect(out.duration).toBe(3)
    })
  })

  describe('normalizeUser', () => {
    test('应将 nickname 归一为 nickName', () => {
      const out = normalizeUser({ nickname: '老王', _id: 'u1' })
      expect(out.nickName).toBe('老王')
    })

    test('avatarUrl 兼容 avatar / headImg', () => {
      expect(normalizeUser({ avatar: 'a' }).avatarUrl).toBe('a')
      expect(normalizeUser({ headImg: 'h' }).avatarUrl).toBe('h')
      expect(normalizeUser({ avatarUrl: 'x', avatar: 'a' }).avatarUrl).toBe('x')
    })
  })

  describe('normalizeHost', () => {
    test('pricePerDay 兼容 price / dayPrice', () => {
      expect(normalizeHost({ price: 100 }).pricePerDay).toBe(100)
      expect(normalizeHost({ dayPrice: 200 }).pricePerDay).toBe(200)
      expect(normalizeHost({ pricePerDay: 300, price: 100 }).pricePerDay).toBe(300)
    })
  })

  describe('normalizePet', () => {
    test('应将 sex 归一为 gender', () => {
      expect(normalizePet({ sex: 'male' }).gender).toBe('male')
      expect(normalizePet({ gender: 'female', sex: 'male' }).gender).toBe('female')
    })
  })

  describe('normalizeProduct', () => {
    test('coverUrl 兼容 coverImage / cover', () => {
      expect(normalizeProduct({ coverImage: 'a' }).coverUrl).toBe('a')
      expect(normalizeProduct({ cover: 'b' }).coverUrl).toBe('b')
    })
  })

  describe('normalizeList', () => {
    test('应批量归一化', () => {
      const list = [{ _id: 'a' }, { _id: 'b' }]
      const out = normalizeList(list)
      expect(out).toEqual([{ _id: 'a', id: 'a' }, { _id: 'b', id: 'b' }])
    })

    test('应支持自定义归一化器', () => {
      const list = [{ sex: 'male' }, { sex: 'female' }]
      const out = normalizeList(list, normalizePet)
      expect(out[0].gender).toBe('male')
    })

    test('非数组应返回空数组', () => {
      expect(normalizeList(null)).toEqual([])
      expect(normalizeList('str')).toEqual([])
    })
  })

  describe('normalizeByCollection', () => {
    test('orders → normalizeOrder', () => {
      const out = normalizeByCollection('orders', { _id: 'o1', days: 2 })
      expect(out.id).toBe('o1')
      expect(out.duration).toBe(2)
    })

    test('users → normalizeUser', () => {
      const out = normalizeByCollection('users', { nickname: '王' })
      expect(out.nickName).toBe('王')
    })

    test('未知集合 → normalizeBase', () => {
      const out = normalizeByCollection('xxx', { _id: 'x' })
      expect(out.id).toBe('x')
    })

    test('批量模式', () => {
      const list = normalizeByCollection('orders', [{ _id: 'a' }, { _id: 'b' }])
      expect(Array.isArray(list)).toBe(true)
      expect(list).toHaveLength(2)
    })
  })
})
