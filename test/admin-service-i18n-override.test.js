/**
 * Sprint 23：adminService i18nOverride 服务单元测试
 *
 * 覆盖：
 *   - listI18nOverrides：分页 / 前缀过滤 / 状态过滤
 *   - getI18nOverride：按 key 拉取所有 locale
 *   - upsertI18nOverride：单条 upsert（创建 / 更新）
 *   - batchUpsertI18nOverrides：批量 upsert（含错误收集）
 *   - deleteI18nOverride：删除
 *   - fetchActiveOverrides：拉取 active 覆盖
 *   - toggleI18nOverrideStatus：状态切换
 *   - 参数校验：非法 key / locale / status / value
 */

// 必须在 require 业务模块前重置 module 缓存
jest.resetModules()

// ===== 真实 wx-server-sdk mock（带可控 db）=====
let mockDocs = []
function resetDocs(docs = []) { mockDocs = docs.slice() }
function pushDoc(d) { mockDocs.push(d) }

// M6：aggregate 简化 mock，覆盖 group({ _id, count: { $sum: 1 } }) 与 sort+limit 模式
// 命名以 mock 前缀，允许 jest.mock() factory 引用
function mockBuildAggregateChain(docs) {
  let _sort = null
  let _limit = null
  const chain = {
    group(spec) {
      const idField = (spec && spec._id && typeof spec._id === 'string') ? spec._id.slice(1) : null
      const buckets = {}
      for (const d of docs) {
        const k = idField ? d[idField] : null
        if (!buckets[k === undefined ? null : k]) { buckets[k === undefined ? null : k] = 0 }
        buckets[k === undefined ? null : k]++
      }
      const list = Object.entries(buckets).map(([_id, count]) => ({ _id: _id === 'null' ? null : _id, count }))
      // group 是终点，返回新 chain 仅支持 end
      return { end: async () => ({ list }) }
    },
    sort(spec) {
      if (spec && typeof spec === 'object') {
        const [field, dir] = Object.entries(spec)[0]
        _sort = { field, dir }
      }
      return chain
    },
    limit(n) { _limit = n; return chain },
    end: async () => {
      let arr = docs.slice()
      if (_sort) {
        arr.sort((a, b) => {
          const av = a[_sort.field]
          const bv = b[_sort.field]
          if (av === bv) { return 0 }
          if (av === undefined || av === null) { return 1 }
          if (bv === undefined || bv === null) { return -1 }
          const at = av instanceof Date ? av.getTime() : av
          const bt = bv instanceof Date ? bv.getTime() : bv
          return _sort.dir === -1 ? (bt - at) : (at - bt)
        })
      }
      if (_limit !== null) { arr = arr.slice(0, _limit) }
      return { list: arr }
    },
  }
  return chain
}

jest.mock('wx-server-sdk', () => {
  const collection = name => {
    const matchDoc = (doc, query) => {
      if (!query) {return true}
      for (const [k, v] of Object.entries(query)) {
        if (v && typeof v === 'object' && v._op) {
          if (v._op === 'gte') {
            const dv = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
            const cv = v.v instanceof Date ? v.v.getTime() : v.v
            if (!(dv >= cv)) {return false}
          }
          continue
        }
        if (v && typeof v === 'object' && v.regexp) {
          if (typeof doc[k] !== 'string' || !doc[k].startsWith(v.regexp.replace('^', ''))) {return false}
          continue
        }
        if (doc[k] !== v) {return false}
      }
      return true
    }
    const where = query => {
      const filtered = mockDocs.filter(d => matchDoc(d, query))
      let skip = 0
      let limit = 200
      const chain = {
        orderBy() { return this },
        skip(n) { skip = n; return this },
        limit(n) { limit = n; return this },
        count: async () => ({ total: filtered.length }),
        get: async () => ({ data: filtered.slice(skip, skip + limit) }),
      }
      return chain
    }
    return {
      where,
      doc: id => {
        const idx = mockDocs.findIndex(d => d._id === id)
        return {
          get: async () => ({ data: idx >= 0 ? mockDocs[idx] : null }),
          update: async ({ data }) => {
            if (idx < 0) {return { updated: 0 }}
            mockDocs[idx] = { ...mockDocs[idx], ...data }
            return { updated: 1 }
          },
          remove: async () => {
            if (idx < 0) {return { deleted: 0 }}
            mockDocs.splice(idx, 1)
            return { deleted: 1 }
          },
        }
      },
      add: async ({ data }) => {
        const newDoc = { ...data }
        mockDocs.push(newDoc)
        return { _id: newDoc._id }
      },
      aggregate: () => mockBuildAggregateChain(mockDocs.slice()),
    }
  }
  return {
    init: jest.fn(),
    database: jest.fn(() => ({
      collection,
      command: {
        aggregate: {
          sum: (n) => ({ $sum: n }),
        },
      },
      serverDate: jest.fn(() => new Date('2026-06-06T00:00:00Z')),
      RegExp: jest.fn(({ regexp, options }) => ({ regexp, options })),
    })),
    DYNAMIC_CURRENT_ENV: 'mock-env',
  }
})

function reloadService() {
  jest.resetModules()
  // 重新注入 wx-server-sdk mock（resetModules 会清掉 mock）
  jest.doMock('wx-server-sdk', () => {
    const collection = name => {
      const matchDoc = (doc, query) => {
        if (!query) {return true}
        for (const [k, v] of Object.entries(query)) {
          if (v && typeof v === 'object' && v._op) {
            if (v._op === 'gte') {
              const dv = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
              const cv = v.v instanceof Date ? v.v.getTime() : v.v
              if (!(dv >= cv)) {return false}
            }
            continue
          }
          if (v && typeof v === 'object' && v.regexp) {
            if (typeof doc[k] !== 'string' || !doc[k].startsWith(v.regexp.replace('^', ''))) {return false}
            continue
          }
          if (doc[k] !== v) {return false}
        }
        return true
      }
      const where = query => {
        const filtered = mockDocs.filter(d => matchDoc(d, query))
        let skip = 0
        let limit = 200
        const chain = {
          orderBy() { return this },
          skip(n) { skip = n; return this },
          limit(n) { limit = n; return this },
          count: async () => ({ total: filtered.length }),
          get: async () => ({ data: filtered.slice(skip, skip + limit) }),
        }
        return chain
      }
      return {
        where,
        doc: id => {
          const idx = mockDocs.findIndex(d => d._id === id)
          return {
            get: async () => ({ data: idx >= 0 ? mockDocs[idx] : null }),
            update: async ({ data }) => {
              if (idx < 0) {return { updated: 0 }}
              mockDocs[idx] = { ...mockDocs[idx], ...data }
              return { updated: 1 }
            },
            remove: async () => {
              if (idx < 0) {return { deleted: 0 }}
              mockDocs.splice(idx, 1)
              return { deleted: 1 }
            },
          }
        },
        add: async ({ data }) => {
          const newDoc = { ...data }
          mockDocs.push(newDoc)
          return { _id: newDoc._id }
        },
        aggregate: () => mockBuildAggregateChain(mockDocs.slice()),
      }
    }
    return {
      init: jest.fn(),
      database: jest.fn(() => ({
        collection,
        command: {
          aggregate: {
            sum: (n) => ({ $sum: n }),
          },
        },
        serverDate: jest.fn(() => new Date('2026-06-06T00:00:00Z')),
        RegExp: jest.fn(({ regexp, options }) => ({ regexp, options })),
      })),
      DYNAMIC_CURRENT_ENV: 'mock-env',
    }
  })
  return require('../cloudfunctions/adminService/services/i18nOverride')
}

describe('i18nOverride - listI18nOverrides', () => {
  beforeEach(() => {
    resetDocs([
      { _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'A 中', status: 'active', updatedAt: new Date() },
      { _id: 'a2', key: 'A_TITLE', locale: 'en-US', value: 'A en', status: 'active', updatedAt: new Date() },
      { _id: 'a3', key: 'B_TITLE', locale: 'zh-CN', value: 'B 中', status: 'disabled', updatedAt: new Date() },
    ])
  })

  it('分页 + 状态过滤', async () => {
    const svc = reloadService()
    const res = await svc.listI18nOverrides({ status: 'active', page: 1, pageSize: 10 })
    expect(res.code).toBe(0)
    expect(res.data.total).toBe(2)
    expect(res.data.list.length).toBe(2)
  })

  it('按 key 前缀过滤', async () => {
    const svc = reloadService()
    const res = await svc.listI18nOverrides({ prefix: 'A_' })
    expect(res.code).toBe(0)
    expect(res.data.list.every(x => x.key.startsWith('A_'))).toBe(true)
  })
})

describe('i18nOverride - getI18nOverride', () => {
  beforeEach(() => {
    resetDocs([
      { _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'A 中' },
      { _id: 'a2', key: 'A_TITLE', locale: 'en-US', value: 'A en' },
    ])
  })

  it('按 key 拉取所有 locale', async () => {
    const svc = reloadService()
    const res = await svc.getI18nOverride({ key: 'A_TITLE' })
    expect(res.code).toBe(0)
    expect(res.data.items.length).toBe(2)
  })

  it('缺少 key 返回 INVALID_PARAMS 响应', async () => {
    const svc = reloadService()
    const res = await svc.getI18nOverride({})
    expect(res.code).toBe(1001)
    expect(res.error && res.error.type).toBe('INVALID_PARAMS')
  })
})

describe('i18nOverride - upsertI18nOverride', () => {
  beforeEach(() => {
    resetDocs()
  })

  it('创建新记录', async () => {
    const svc = reloadService()
    const res = await svc.upsertI18nOverride(
      { key: 'NEW_KEY', locale: 'en-US', value: 'New text', status: 'active' },
      null,
      { openid: 'admin-1' }
    )
    expect(res.code).toBe(0)
    expect(res.data.action).toBe('created')
    expect(mockDocs.length).toBe(1)
    expect(mockDocs[0].key).toBe('NEW_KEY')
  })

  it('更新已存在记录', async () => {
    resetDocs([
      { _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'old', status: 'active', updatedBy: 'old-admin' },
    ])
    const svc = reloadService()
    const res = await svc.upsertI18nOverride(
      { key: 'A_TITLE', locale: 'zh-CN', value: 'new' },
      null,
      { openid: 'admin-2' }
    )
    expect(res.code).toBe(0)
    expect(res.data.action).toBe('updated')
    expect(mockDocs[0].value).toBe('new')
    expect(mockDocs[0].updatedBy).toBe('admin-2')
  })

  it('非法 locale 返回 INVALID_PARAMS 响应', async () => {
    const svc = reloadService()
    const res = await svc.upsertI18nOverride({ key: 'X', locale: 'fr-FR', value: 'x' })
    expect(res.code).toBe(1001)
    expect(res.error && res.error.type).toBe('INVALID_PARAMS')
  })

  it('value 过长返回 INVALID_PARAMS 响应', async () => {
    const svc = reloadService()
    const res = await svc.upsertI18nOverride({ key: 'X', locale: 'zh-CN', value: 'x'.repeat(2001) })
    expect(res.code).toBe(1001)
    expect(res.error && res.error.type).toBe('INVALID_PARAMS')
  })

  it('非法 status 返回 INVALID_PARAMS 响应', async () => {
    const svc = reloadService()
    const res = await svc.upsertI18nOverride({ key: 'X', locale: 'zh-CN', value: 'x', status: 'banned' })
    expect(res.code).toBe(1001)
    expect(res.error && res.error.type).toBe('INVALID_PARAMS')
  })
})

describe('i18nOverride - batchUpsertI18nOverrides', () => {
  it('批量新建 / 更新混合', async () => {
    resetDocs([
      { _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'old A', status: 'active' },
    ])
    const svc = reloadService()
    const res = await svc.batchUpsertI18nOverrides(
      {
        items: [
          { key: 'A_TITLE', locale: 'zh-CN', value: 'new A' },
          { key: 'B_TITLE', locale: 'en-US', value: 'new B en' },
          { key: 'INVALID_KEY', locale: 'fr-FR', value: 'skip me' },
        ],
      },
      null,
      { openid: 'admin-1' }
    )
    expect(res.code).toBe(0)
    expect(res.data.created).toBe(1)
    expect(res.data.updated).toBe(1)
    expect(res.data.skipped).toBe(1)
    expect(res.data.errors.length).toBe(1)
  })

  it('空数组返回 INVALID_PARAMS 响应', async () => {
    const svc = reloadService()
    const res = await svc.batchUpsertI18nOverrides({ items: [] })
    expect(res.code).toBe(1001)
    expect(res.error && res.error.type).toBe('INVALID_PARAMS')
  })

  it('超过 200 条返回 INVALID_PARAMS 响应', async () => {
    const svc = reloadService()
    const items = Array.from({ length: 201 }, (_, i) => ({ key: `K${i}`, locale: 'zh-CN', value: 'v' }))
    const res = await svc.batchUpsertI18nOverrides({ items })
    expect(res.code).toBe(1001)
    expect(res.error && res.error.type).toBe('INVALID_PARAMS')
  })
})

describe('i18nOverride - deleteI18nOverride', () => {
  it('删除已存在记录', async () => {
    resetDocs([{ _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'x' }])
    const svc = reloadService()
    const res = await svc.deleteI18nOverride({ overrideId: 'a1' })
    expect(res.code).toBe(0)
    expect(mockDocs.length).toBe(0)
  })

  it('缺少 overrideId 返回 INVALID_PARAMS 响应', async () => {
    const svc = reloadService()
    const res = await svc.deleteI18nOverride({})
    expect(res.code).toBe(1001)
    expect(res.error && res.error.type).toBe('INVALID_PARAMS')
  })
})

describe('i18nOverride - fetchActiveOverrides', () => {
  beforeEach(() => {
    resetDocs([
      { _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'A 中', status: 'active' },
      { _id: 'a2', key: 'A_TITLE', locale: 'en-US', value: 'A en', status: 'active' },
      { _id: 'a3', key: 'B_TITLE', locale: 'zh-CN', value: 'B 中', status: 'disabled' },
    ])
  })

  it('返回 { KEY: { locale: value } } 格式', async () => {
    const svc = reloadService()
    const res = await svc.fetchActiveOverrides({})
    expect(res.code).toBe(0)
    expect(res.data.overrides).toEqual({
      A_TITLE: { 'zh-CN': 'A 中', 'en-US': 'A en' },
    })
    expect(res.data.count).toBe(1)
  })

  it('可按 locale 过滤', async () => {
    const svc = reloadService()
    const res = await svc.fetchActiveOverrides({ locale: 'zh-CN' })
    expect(res.code).toBe(0)
    expect(res.data.overrides).toEqual({ A_TITLE: { 'zh-CN': 'A 中' } })
  })
})

describe('i18nOverride - toggleI18nOverrideStatus', () => {
  beforeEach(() => {
    resetDocs([{ _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'A', status: 'active' }])
  })

  it('切换 status', async () => {
    const svc = reloadService()
    const res = await svc.toggleI18nOverrideStatus(
      { overrideId: 'a1', status: 'disabled' },
      null,
      { openid: 'admin-1' }
    )
    expect(res.code).toBe(0)
    expect(mockDocs[0].status).toBe('disabled')
  })

  it('非法 status 返回 INVALID_PARAMS 响应', async () => {
    const svc = reloadService()
    const res = await svc.toggleI18nOverrideStatus({ overrideId: 'a1', status: 'banned' })
    // withErrorHandling 把错误包装为响应：{ code: 1001, error: { type: 'INVALID_PARAMS' } }
    expect(res.code).toBe(1001)
    expect(res.error && res.error.type).toBe('INVALID_PARAMS')
  })
})

// =============================================================================
// Sprint 53: exportI18nOverrides / findMissingTranslations / getI18nOverrideStats
// =============================================================================

describe('Sprint 53 i18nOverride - exportI18nOverrides', () => {
  beforeEach(() => {
    resetDocs([
      { _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'A 中', status: 'active', updatedAt: new Date('2026-06-01') },
      { _id: 'a2', key: 'A_TITLE', locale: 'en-US', value: 'A en', status: 'active', updatedAt: new Date('2026-06-02') },
      { _id: 'a3', key: 'B_TITLE', locale: 'zh-CN', value: 'B 中', status: 'disabled', updatedAt: new Date('2026-06-03') },
    ])
  })

  it('导出全部（不传过滤）', async () => {
    const svc = reloadService()
    const res = await svc.exportI18nOverrides({})
    expect(res.code).toBe(0)
    expect(res.data.count).toBe(3)
    expect(res.data.items.length).toBe(3)
    // 每条都包含 key/locale/value/status/note/updatedAt/updatedBy
    expect(res.data.items[0].key).toBeDefined()
    expect(res.data.items[0].locale).toBeDefined()
  })

  it('按 locale 过滤', async () => {
    const svc = reloadService()
    const res = await svc.exportI18nOverrides({ locale: 'en-US' })
    expect(res.code).toBe(0)
    expect(res.data.count).toBe(1)
    expect(res.data.items[0].locale).toBe('en-US')
  })

  it('按 status 过滤', async () => {
    const svc = reloadService()
    const res = await svc.exportI18nOverrides({ status: 'active' })
    expect(res.code).toBe(0)
    expect(res.data.count).toBe(2)
    res.data.items.forEach(i => expect(i.status).toBe('active'))
  })

  it('非法 locale 视为不过滤', async () => {
    const svc = reloadService()
    const res = await svc.exportI18nOverrides({ locale: 'fr-FR' })
    expect(res.code).toBe(0)
    expect(res.data.count).toBe(3)
  })

  it('note 字段缺失时返回空串', async () => {
    const svc = reloadService()
    const res = await svc.exportI18nOverrides({})
    expect(res.data.items.every(i => typeof i.note === 'string')).toBe(true)
  })
})

describe('Sprint 53 i18nOverride - findMissingTranslations', () => {
  beforeEach(() => {
    resetDocs([
      { _id: 'a1', key: 'FULL_KEY', locale: 'zh-CN', value: '中' },
      { _id: 'a2', key: 'FULL_KEY', locale: 'en-US', value: 'en' },
      { _id: 'a3', key: 'FULL_KEY', locale: 'ja-JP', value: '日' },
      { _id: 'b1', key: 'PARTIAL_KEY', locale: 'zh-CN', value: '中' },
      { _id: 'b2', key: 'PARTIAL_KEY', locale: 'en-US', value: 'en' },
      // PARTIAL_KEY 在 ja-JP 缺失
    ])
  })

  it('识别全部翻译齐的 key', async () => {
    const svc = reloadService()
    const res = await svc.findMissingTranslations({})
    expect(res.code).toBe(0)
    expect(res.data.totalKeys).toBe(2)
    // FULL_KEY 在 3 个 locale 都有
    expect(res.data.missingByLocale['ja-JP'].every(m => m.key !== 'FULL_KEY')).toBe(true)
  })

  it('识别缺失翻译的 key', async () => {
    const svc = reloadService()
    const res = await svc.findMissingTranslations({})
    expect(res.code).toBe(0)
    // PARTIAL_KEY 在 ja-JP 缺失
    const jaMissing = res.data.missingByLocale['ja-JP']
    expect(jaMissing.find(m => m.key === 'PARTIAL_KEY')).toBeTruthy()
    expect(jaMissing.find(m => m.key === 'PARTIAL_KEY').availableIn).toEqual(expect.arrayContaining(['zh-CN', 'en-US']))
  })

  it('返回每个 locale 的缺失数量', async () => {
    const svc = reloadService()
    const res = await svc.findMissingTranslations({})
    // zh-CN: 0 (两个 key 都有), en-US: 0, ja-JP: 1
    expect(res.data.missingByLocale['zh-CN'].length).toBe(0)
    expect(res.data.missingByLocale['en-US'].length).toBe(0)
    expect(res.data.missingByLocale['ja-JP'].length).toBe(1)
  })

  it('totalMissing 统计所有 locale 的缺失总和', async () => {
    const svc = reloadService()
    const res = await svc.findMissingTranslations({})
    expect(res.data.totalMissing).toBe(1)
  })

  it('baseLocale 非法时回退到 zh-CN', async () => {
    const svc = reloadService()
    const res = await svc.findMissingTranslations({ baseLocale: 'fr-FR' })
    expect(res.data.baseLocale).toBe('zh-CN')
  })

  it('空集合返回 0 / 0', async () => {
    resetDocs()
    const svc = reloadService()
    const res = await svc.findMissingTranslations({})
    expect(res.code).toBe(0)
    expect(res.data.totalKeys).toBe(0)
    expect(res.data.totalMissing).toBe(0)
  })
})

describe('Sprint 53 i18nOverride - getI18nOverrideStats', () => {
  beforeEach(() => {
    resetDocs([
      { _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'A 中', status: 'active', updatedAt: new Date('2026-06-01') },
      { _id: 'a2', key: 'A_TITLE', locale: 'en-US', value: 'A en', status: 'active', updatedAt: new Date('2026-06-02') },
      { _id: 'a3', key: 'B_TITLE', locale: 'zh-CN', value: 'B 中', status: 'disabled', updatedAt: new Date('2026-06-03') },
    ])
  })

  it('统计总数 / 状态数 / 唯一 key 数', async () => {
    const svc = reloadService()
    const res = await svc.getI18nOverrideStats()
    expect(res.code).toBe(0)
    expect(res.data.totalDocs).toBe(3)
    expect(res.data.activeDocs).toBe(2)
    expect(res.data.disabledDocs).toBe(1)
    expect(res.data.uniqueKeys).toBe(2)
  })

  it('按 locale 分组', async () => {
    const svc = reloadService()
    const res = await svc.getI18nOverrideStats()
    expect(res.data.byLocale['zh-CN']).toBe(2)
    expect(res.data.byLocale['en-US']).toBe(1)
  })

  it('记录最新更新时间', async () => {
    const svc = reloadService()
    const res = await svc.getI18nOverrideStats()
    // 三条数据中 B_TITLE 的 updatedAt = 2026-06-03 最大
    const ts = res.data.lastUpdatedAt
    expect(ts).toBeTruthy()
    const d = new Date(ts)
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-03')
  })

  it('空集合返回 0 / null', async () => {
    resetDocs()
    const svc = reloadService()
    const res = await svc.getI18nOverrideStats()
    expect(res.data.totalDocs).toBe(0)
    expect(res.data.activeDocs).toBe(0)
    expect(res.data.uniqueKeys).toBe(0)
    expect(res.data.lastUpdatedAt).toBeNull()
  })
})
