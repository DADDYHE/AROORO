/**
 * 存量数据迁移脚本 - 单元测试
 *
 * 通过直接调用 core 模块的 runMigrate() 注入 mock db，避免 process.exit 时序问题
 */

const { runMigrate, migrateOrganizerId } = require('./../scripts/migrate-legacy-data-core')

// ===== Mock db 工厂 =====
function makeDb(docs = {}) {
  const collections = {
    orders: docs.orders || [],
    hostProfiles: docs.hostProfiles || [],
    users: docs.users || [],
    pets: docs.pets || [],
    notifications: docs.notifications || [],
  }
  return {
    _collections: collections,
    collection(name) {
      if (!collections[name]) {collections[name] = []}
      const coll = collections[name]
      return {
        where(filter) {
          return {
            count: async () => ({ total: filterDocs(coll, filter).length }),
            field() { return this },
            orderBy() { return this },
            limit(n) {
              return {
                get: async () => ({ data: filterDocs(coll, filter).slice(0, n) }),
                field() { return this },
              }
            },
            get: async () => ({ data: filterDocs(coll, filter) }),
          }
        },
        doc(id) {
          return {
            get: async () => ({ data: coll.find(d => d._id === id) || null }),
            update: async ({ data }) => {
              const doc = coll.find(d => d._id === id)
              if (doc) {Object.assign(doc, data)}
              return { updated: 1 }
            },
          }
        },
      }
    },
    command: {
      exists: v => ({ _op: 'exists', v }),
      gt: v => ({ _op: 'gt', v }),
      in: v => ({ _op: 'in', v }),
    },
  }
}

function filterDocs(docs, filter) {
  return docs.filter(d => {
    for (const [k, v] of Object.entries(filter || {})) {
      if (v && typeof v === 'object' && v._op) {
        if (v._op === 'exists') {
          if ((d[k] !== undefined) !== v.v) {return false}
        } else if (v._op === 'gt') {
          if (!(d[k] > v.v)) {return false}
        } else if (v._op === 'in') {
          if (!v.v.includes(d[k])) {return false}
        }
        continue
      }
      if (d[k] !== v) {return false}
    }
    return true
  })
}

describe('存量数据迁移 core 模块', () => {
  describe('organizerId 回填', () => {
    test('dry-run 模式：不写入 organizerId，仅扫描', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', hostId: 'h1' },
          { _id: 'o2', hostId: 'h2', organizerId: 'openid-h2' },
        ],
        hostProfiles: [
          { _id: 'h1', openid: 'openid-h1' },
        ],
      })

      const { results } = await runMigrate({
        apply: false, only: 'organizerId', batch: 100, envId: 'test-env', db,
      })

      expect(results[0].dryRun).toBe(true)
      expect(results[0].scanned).toBe(1)
      // dry-run 绝对不应写入
      expect(db._collections.orders.find(o => o._id === 'o1').organizerId).toBeUndefined()
    })

    test('apply 模式：organizerId 缺失订单被回填', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', hostId: 'h1' },
          { _id: 'o2', hostId: 'h2', organizerId: 'existing' },
        ],
        hostProfiles: [
          { _id: 'h1', openid: 'openid-h1' },
          { _id: 'h2', openid: 'openid-h2' },
        ],
      })

      const { results } = await runMigrate({
        apply: true, only: 'organizerId', batch: 100, envId: 'test-env', db,
      })

      const o1 = db._collections.orders.find(o => o._id === 'o1')
      expect(o1.organizerId).toBe('openid-h1')
      expect(o1.migrated_organizerId).toBe(true)
      // 已有的不应该被覆盖
      expect(db._collections.orders.find(o => o._id === 'o2').organizerId).toBe('existing')
      expect(results[0].updated).toBe(1)
      expect(results[0].skipped).toBe(0)
    })

    test('找不到 hostProfile 的订单：跳过', async () => {
      const db = makeDb({
        orders: [{ _id: 'o1', hostId: 'missing-host' }],
        hostProfiles: [],
      })

      const { results } = await runMigrate({
        apply: true, only: 'organizerId', batch: 100, envId: 'test-env', db,
      })

      expect(db._collections.orders.find(o => o._id === 'o1').organizerId).toBeUndefined()
      expect(results[0].updated).toBe(0)
      expect(results[0].skipped).toBe(1)
    })
  })

  describe('nickName 回填', () => {
    test('apply 模式：nickname → nickName', async () => {
      const db = makeDb({
        users: [
          { _id: 'u1', nickname: '小明' },
          { _id: 'u2', nickName: '小红' },
          { _id: 'u3' },
        ],
      })

      await runMigrate({
        apply: true, only: 'nickName', batch: 100, envId: 'test-env', db,
      })

      const u1 = db._collections.users.find(u => u._id === 'u1')
      expect(u1.nickName).toBe('小明')
      expect(u1.migrated_nickName).toBe(true)
      expect(db._collections.users.find(u => u._id === 'u2').nickName).toBe('小红')
    })

    test('dry-run 模式：仅报告数量', async () => {
      const db = makeDb({
        users: [
          { _id: 'u1', nickname: '小明' },
        ],
      })

      const { results } = await runMigrate({
        apply: false, only: 'nickName', batch: 100, envId: 'test-env', db,
      })

      expect(results[0].dryRun).toBe(true)
      expect(results[0].scanned).toBe(1)
      expect(db._collections.users.find(u => u._id === 'u1').nickName).toBeUndefined()
    })
  })

  describe('petInfo → petsInfo 数组化', () => {
    test('apply 模式：单对象包装为数组', async () => {
      const db = makeDb({
        pets: [
          { _id: 'p1', petInfo: { name: '豆豆' } },
          { _id: 'p2', petInfo: [{ name: '毛毛' }, { name: '花花' }] },
        ],
      })

      await runMigrate({
        apply: true, only: 'petInfo', batch: 100, envId: 'test-env', db,
      })

      expect(db._collections.pets.find(p => p._id === 'p1').petsInfo).toEqual([{ name: '豆豆' }])
      expect(db._collections.pets.find(p => p._id === 'p2').petsInfo).toEqual([{ name: '毛毛' }, { name: '花花' }])
    })
  })

  describe('createAt → createdAt 字段统一', () => {
    test('apply 模式：补全 createdAt 字段，已有值不覆盖', async () => {
      const db = makeDb({
        orders: [
          { _id: 'o1', createAt: 1700000000000 },
          { _id: 'o2', createdAt: 1700000001000 },
        ],
      })

      await runMigrate({
        apply: true, only: 'createdAt', batch: 100, envId: 'test-env', db,
      })

      expect(db._collections.orders.find(o => o._id === 'o1').createdAt).toBe(1700000000000)
      expect(db._collections.orders.find(o => o._id === 'o2').createdAt).toBe(1700000001000)
    })
  })

  describe('--only 过滤', () => {
    test('只处理指定任务，其他集合不被扫描', async () => {
      const db = makeDb({
        users: [{ _id: 'u1', nickname: '小明' }],
        orders: [{ _id: 'o1', hostId: 'h1' }],
        hostProfiles: [],
      })

      await runMigrate({
        apply: true, only: 'nickName', batch: 100, envId: 'test-env', db,
      })

      // users 被处理
      expect(db._collections.users.find(u => u._id === 'u1').nickName).toBe('小明')
      // orders 不被处理
      expect(db._collections.orders.find(o => o._id === 'o1').organizerId).toBeUndefined()
    })

    test('不传 --only：执行全部任务', async () => {
      const db = makeDb({
        users: [{ _id: 'u1', nickname: '小明' }],
        orders: [{ _id: 'o1', hostId: 'h1' }],
        hostProfiles: [{ _id: 'h1', openid: 'openid-h1' }],
        pets: [],
        notifications: [],
      })

      const { results } = await runMigrate({
        apply: true, only: null, batch: 100, envId: 'test-env', db,
      })

      // 4 个任务全部执行
      expect(results.length).toBe(4)
      expect(results.map(r => r.task).sort()).toEqual(['createdAt', 'nickName', 'organizerId', 'petInfo'])
    })
  })

  describe('CLI 入口 parseArgs', () => {
    const { parseArgs } = require('./../scripts/migrate-legacy-data')
    test('解析 --apply / --only / --batch / --env', () => {
      const opts = parseArgs(['node', 'migrate', '--apply', '--only=nickName', '--batch=200', '--env=prod-1'])
      expect(opts).toEqual({
        apply: true,
        only: 'nickName',
        batch: 200,
        envId: 'prod-1',
      })
    })

    test('默认值：apply=false, only=null, batch=100', () => {
      const origEnv = process.env.CLOUDBASE_ENV
      delete process.env.CLOUDBASE_ENV
      const opts = parseArgs(['node', 'migrate'])
      expect(opts).toEqual({
        apply: false,
        only: null,
        batch: 100,
        envId: '',
      })
      if (origEnv !== undefined) {process.env.CLOUDBASE_ENV = origEnv}
    })
  })
})
