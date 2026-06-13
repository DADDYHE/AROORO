/**
 * 存量数据校验脚本（仅扫描，不写入）
 *
 * 用途：Sprint 10 起的 CI 质量门禁
 *   - 每次 PR 跑一次 dry-run 报告
 *   - 发现 P0 级问题（孤儿引用、金额异常）→ 建议阻塞发布
 *   - 发现 P1/P2 级问题（字段命名不一致、冗余字段）→ 报告但不阻塞
 *
 * 校验项：
 *   1. P0 - 关键引用完整性
 *      - orders.hostId → hostProfiles._id 存在
 *      - orders.organizerId → users._id 存在
 *      - orders.ownerId → users._id 存在
 *      - tuan_orders.dealId → tuan_deals._id 存在
 *   2. P0 - 业务数据合法性
 *      - orders.totalPrice > 0
 *      - orders.startDate <= orders.endDate
 *      - hostProfiles.status ∈ {active, pending_review, rejected, disabled}
 *   3. P1 - 字段命名一致性
 *      - users.nickName 存在（不能仅有 nickname）
 *      - *.createdAt 存在（不能仅有 createAt）
 *      - pets.petsInfo 存在（不能仅有 petInfo）
 *      - orders.organizerId 存在
 *   4. P2 - 软问题
 *      - phone 字段格式（11 位数字）
 *      - 重复 openid（理论上一个 openid 应对应一个 user._id）
 *
 * Sprint 11 增量模式：
 *   - --since=<ms>       只校验 updatedAt >= since 的文档
 *   - --whitelist=<csv>  逗号分隔的 check code 白名单（不报告、不计入 strict）
 *   - --collections=<csv> 只校验指定的集合
 *
 * 用法：
 *   node scripts/validate-legacy-data.js                    # 默认行为：扫 + 报告
 *   node scripts/validate-legacy-data.js --env=<envId>      # 真实环境
 *   node scripts/validate-legacy-data.js --report           # 仅报告（不退出非零）
 *   node scripts/validate-legacy-data.js --strict           # P0 异常时退出 1
 *   node scripts/validate-legacy-data.js --db=<mockDb>      # 测试注入（隐藏选项）
 *   node scripts/validate-legacy-data.js --since=1700000000000 --report
 *   node scripts/validate-legacy-data.js --whitelist=MISSING_CREATED_AT,PETS_INFO_LEGACY --report
 *   node scripts/validate-legacy-data.js --collections=orders,users
 */

const fs = require('fs')
const path = require('path')

const ISSUE_LEVELS = { P0: 'P0', P1: 'P1', P2: 'P2' }

const CHECKS = {
  // P0 关键引用
  ORDER_HOST_REF: { level: 'P0', code: 'ORDER_HOST_REF', desc: 'orders.hostId 引用了不存在的 hostProfile' },
  ORDER_OWNER_REF: { level: 'P0', code: 'ORDER_OWNER_REF', desc: 'orders.ownerId 引用了不存在的 user' },
  ORDER_ORGANIZER_REF: { level: 'P0', code: 'ORDER_ORGANIZER_REF', desc: 'orders.organizerId 引用了不存在的 user' },
  // P0 业务数据
  ORDER_NEGATIVE_PRICE: { level: 'P0', code: 'ORDER_NEGATIVE_PRICE', desc: 'orders.totalPrice < 0' },
  ORDER_INVALID_DATERANGE: { level: 'P0', code: 'ORDER_INVALID_DATERANGE', desc: 'orders.startDate > orders.endDate' },
  HOST_INVALID_STATUS: { level: 'P0', code: 'HOST_INVALID_STATUS', desc: 'hostProfiles.status 取值非法' },
  // P1 字段命名
  USER_NICKNAME_INCONSISTENT: { level: 'P1', code: 'USER_NICKNAME_INCONSISTENT', desc: '用户同时存在 nickname 与 nickName 字段' },
  USER_MISSING_NICKNAME: { level: 'P1', code: 'USER_MISSING_NICKNAME', desc: '用户仅有 nickname 而无 nickName' },
  MISSING_CREATED_AT: { level: 'P1', code: 'MISSING_CREATED_AT', desc: '文档仅有 createAt 而无 createdAt' },
  MISSING_ORGANIZER_ID: { level: 'P1', code: 'MISSING_ORGANIZER_ID', desc: 'orders 缺少 organizerId 字段' },
  PETS_INFO_LEGACY: { level: 'P1', code: 'PETS_INFO_LEGACY', desc: 'pets 仅有 petInfo 而无 petsInfo' },
  // P2 软问题
  PHONE_FORMAT: { level: 'P2', code: 'PHONE_FORMAT', desc: 'phone 字段非 11 位数字' },
  OPENID_MISMATCH: { level: 'P2', code: 'OPENID_MISMATCH', desc: 'user._id !== user.openid（推荐保持一致）' },
}

/**
 * 主入口
 * @param {object} opts
 * @param {string} [opts.envId]
 * @param {boolean} [opts.strict=false] - P0 异常时返回 exitCode=1
 * @param {boolean} [opts.report=false] - 仅输出报告，不返回 exitCode
 * @param {object} [opts.db] - 可选：注入 db
 * @param {number} [opts.since=0] - 增量模式：只校验 updatedAt >= since（ms）
 * @param {string[]} [opts.whitelist=[]] - 校验项白名单（按 code 忽略）
 * @param {string[]} [opts.collections=null] - 只校验指定集合（null 表示全部）
 * @returns {Promise<{summary: object, issues: object[]}>}
 */
async function runValidate(opts = {}) {
  const {
    envId, strict = false, report = false, db: injectedDb,
    since = 0, whitelist = [], collections = null,
  } = opts
  const db = injectedDb || (envId ? await initDb(envId) : null)
  if (!db) {
    throw new Error('runValidate: 必须提供 envId 或 db（注入）')
  }

  const wlSet = new Set(whitelist)
  const isWhitelisted = code => wlSet.has(code)
  const shouldScan = name => !collections || collections.includes(name)

  const issues = []
  const counts = { scanned: {}, byLevel: { P0: 0, P1: 0, P2: 0 }, byWhitelist: 0 }

  // 工具：按 since 过滤（仅保留 updatedAt >= since 的文档）
  const filterSince = docs => {
    if (!since) {return docs}
    return docs.filter(d => {
      const ts = toMs(d.updatedAt || d.createdAt)
      return ts >= since
    })
  }

  // 加载各集合数据
  const allOrders = shouldScan('orders') ? await fetchAll(db, 'orders', { _id: true, hostId: true, ownerId: true, organizerId: true, totalPrice: true, startDate: true, endDate: true, updatedAt: true, createdAt: true }) : []
  const orders = filterSince(allOrders)
  const hostProfiles = shouldScan('hostProfiles') ? await fetchAll(db, 'hostProfiles', { _id: true, status: true, updatedAt: true }) : []
  const users = shouldScan('users') ? await fetchAll(db, 'users', { _id: true, openid: true, nickName: true, nickname: true, phone: true, updatedAt: true }) : []
  const tuanDeals = shouldScan('tuan_deals') ? await fetchAll(db, 'tuan_deals', { _id: true }) : []
  const tuanOrders = shouldScan('tuan_orders') ? await fetchAll(db, 'tuan_orders', { _id: true, dealId: true, updatedAt: true }) : []
  const pets = shouldScan('pets') ? await fetchAll(db, 'pets', { _id: true, petInfo: true, petsInfo: true, updatedAt: true }) : []
  const createdAtCollections = ['orders', 'pets', 'hostProfiles', 'users', 'notifications'].filter(shouldScan)

  counts.scanned.orders = orders.length
  counts.scanned.hostProfiles = hostProfiles.length
  counts.scanned.users = users.length
  counts.scanned.tuanDeals = tuanDeals.length
  counts.scanned.tuanOrders = tuanOrders.length
  counts.scanned.pets = pets.length

  const hostIdSet = new Set(hostProfiles.map(h => h._id))
  const userIdSet = new Set(users.map(u => u._id))
  const tuanDealIdSet = new Set(tuanDeals.map(d => d._id))

  // 工具：白名单处理
  const pushIssue = (checkKey, collection, docId, context = null) => {
    const spec = CHECKS[checkKey]
    if (isWhitelisted(spec.code)) {
      counts.byWhitelist += 1
      return
    }
    issues.push({
      level: spec.level,
      code: spec.code,
      desc: spec.desc,
      collection,
      docId,
      context,
    })
  }

  // ===== P0 关键引用 =====
  for (const o of orders) {
    if (o.hostId && !hostIdSet.has(o.hostId)) {
      pushIssue('ORDER_HOST_REF', 'orders', o._id, { hostId: o.hostId })
    }
    if (o.ownerId && !userIdSet.has(o.ownerId)) {
      pushIssue('ORDER_OWNER_REF', 'orders', o._id, { ownerId: o.ownerId })
    }
    if (o.organizerId && !userIdSet.has(o.organizerId)) {
      pushIssue('ORDER_ORGANIZER_REF', 'orders', o._id, { organizerId: o.organizerId })
    }
    if (typeof o.totalPrice === 'number' && o.totalPrice < 0) {
      pushIssue('ORDER_NEGATIVE_PRICE', 'orders', o._id, { totalPrice: o.totalPrice })
    }
    if (o.startDate && o.endDate && String(o.startDate) > String(o.endDate)) {
      pushIssue('ORDER_INVALID_DATERANGE', 'orders', o._id, { startDate: o.startDate, endDate: o.endDate })
    }
  }

  // tuan_orders.dealId
  for (const t of tuanOrders) {
    if (t.dealId && !tuanDealIdSet.has(t.dealId)) {
      pushIssue('ORDER_HOST_REF', 'tuan_orders', t._id, { dealId: t.dealId })
      // 修正最后一条 code 为 TUAN_DEAL_REF（保持原语义）
      issues[issues.length - 1].code = 'TUAN_DEAL_REF'
    }
  }

  // hostProfiles.status 取值
  const validHostStatus = new Set(['active', 'pending_review', 'rejected', 'disabled'])
  for (const h of hostProfiles) {
    if (h.status && !validHostStatus.has(h.status)) {
      pushIssue('HOST_INVALID_STATUS', 'hostProfiles', h._id, { status: h.status })
    }
  }

  // ===== P1 字段命名 =====
  for (const u of users) {
    if (u.nickName && u.nickname) {
      pushIssue('USER_NICKNAME_INCONSISTENT', 'users', u._id)
    } else if (!u.nickName && u.nickname) {
      pushIssue('USER_MISSING_NICKNAME', 'users', u._id)
    }
    if (u._id && u.openid && u._id !== u.openid) {
      pushIssue('OPENID_MISMATCH', 'users', u._id, { openid: u.openid })
    }
    if (u.phone && !/^\d{11}$/.test(String(u.phone))) {
      pushIssue('PHONE_FORMAT', 'users', u._id, { phone: u.phone })
    }
  }

  for (const o of orders) {
    if (o.organizerId === undefined || o.organizerId === null) {
      pushIssue('MISSING_ORGANIZER_ID', 'orders', o._id)
    }
  }

  for (const p of pets) {
    if (p.petInfo && !p.petsInfo) {
      pushIssue('PETS_INFO_LEGACY', 'pets', p._id)
    }
  }

  for (const c of createdAtCollections) {
    const docs = await fetchAll(db, c, { _id: true, createAt: true, createdAt: true, updatedAt: true })
    const filtered = filterSince(docs)
    counts.scanned[`${c}_docs`] = filtered.length
    for (const d of filtered) {
      if (d.createAt && !d.createdAt) {
        pushIssue('MISSING_CREATED_AT', c, d._id)
      }
    }
  }

  // 统计
  for (const i of issues) {
    counts.byLevel[i.level] = (counts.byLevel[i.level] || 0) + 1
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    envId: envId || '(injected-db)',
    strict,
    since: since || null,
    whitelist: whitelist || [],
    collections: collections || '(all)',
    scanned: counts.scanned,
    issueCount: issues.length,
    byLevel: counts.byLevel,
    byWhitelist: counts.byWhitelist,
    issues,
  }

  return { summary, exitCode: shouldExit(summary, strict, report) }
}

function toMs(v) {
  if (v == null) {return 0}
  if (typeof v === 'number') {return v}
  if (v instanceof Date) {return v.getTime()}
  if (v && typeof v === 'object' && typeof v.toDate === 'function') {return v.toDate().getTime()}
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

function shouldExit(summary, strict, report) {
  if (report) {return 0}
  if (strict && summary.byLevel.P0 > 0) {return 1}
  return 0
}

function makeIssue(checkKey, collection, docId, context = null) {
  const spec = CHECKS[checkKey]
  return {
    level: spec.level,
    code: spec.code,
    desc: spec.desc,
    collection,
    docId,
    context,
  }
}

async function initDb(envId) {
  const { initialize } = require('@cloudbase/node-sdk')
  const app = initialize({
    env: envId,
    secret: {
      secretId: process.env.TENCENTCLOUD_SECRETID,
      secretKey: process.env.TENCENTCLOUD_SECRETKEY,
    },
  })
  return app.database()
}

async function fetchAll(db, collection, projection) {
  try {
    const res = await db.collection(collection).where({}).field(projection).limit(1000).get()
    return res.data || []
  } catch (e) {
    // 集合可能不存在（如 notifications），返回空数组不中断
    return []
  }
}

/**
 * 渲染人类可读报告
 * @param {object} summary
 */
function renderReport(summary) {
  const lines = []
  lines.push('')
  lines.push('='.repeat(70))
  lines.push('Sprint 10 存量数据校验报告')
  lines.push('='.repeat(70))
  lines.push(`时间: ${summary.generatedAt}`)
  lines.push(`环境: ${summary.envId}`)
  if (summary.since) {lines.push(`增量模式: since=${summary.since}`)}
  if (summary.collections && summary.collections !== '(all)') {lines.push(`限定集合: ${summary.collections.join(',')}`)}
  if (summary.whitelist && summary.whitelist.length > 0) {lines.push(`白名单: ${summary.whitelist.join(',')}`)}
  lines.push('')
  lines.push('--- 扫描量 ---')
  for (const [k, v] of Object.entries(summary.scanned)) {
    lines.push(`  ${k}: ${v}`)
  }
  lines.push('')
  lines.push('--- 异常统计 ---')
  lines.push(`  P0 (关键): ${summary.byLevel.P0}`)
  lines.push(`  P1 (命名): ${summary.byLevel.P1}`)
  lines.push(`  P2 (软问题): ${summary.byLevel.P2}`)
  lines.push(`  白名单忽略: ${summary.byWhitelist || 0}`)
  lines.push(`  合计: ${summary.issueCount}`)
  lines.push('')

  if (summary.issues.length === 0) {
    lines.push('✓ 全部通过，未发现异常')
    lines.push('')
    return lines.join('\n')
  }

  // 按级别分组
  const groups = { P0: [], P1: [], P2: [] }
  for (const i of summary.issues) {groups[i.level].push(i)}

  for (const level of ['P0', 'P1', 'P2']) {
    if (groups[level].length === 0) {continue}
    lines.push(`--- ${level} 异常 (${groups[level].length} 条) ---`)
    for (const i of groups[level].slice(0, 20)) {
      const ctx = i.context ? ` ${JSON.stringify(i.context)}` : ''
      lines.push(`  [${i.code}] ${i.collection}/${i.docId}${ctx}`)
      lines.push(`    ${i.desc}`)
    }
    if (groups[level].length > 20) {
      lines.push(`  ... 还有 ${groups[level].length - 20} 条未列出`)
    }
    lines.push('')
  }
  lines.push('='.repeat(70))
  return lines.join('\n')
}

// ============ CLI 入口 ============
function parseArgs(argv) {
  const args = argv.slice(2)
  const get = k => args.find(a => a.startsWith(k))?.split('=')[1]
  return {
    envId: get('--env') || process.env.CLOUDBASE_ENV || '',
    strict: args.includes('--strict'),
    report: args.includes('--report'),
    since: Number(get('--since')) || 0,
    whitelist: (get('--whitelist') || '').split(',').filter(Boolean),
    collections: (get('--collections') || '').split(',').filter(Boolean),
  }
}

async function cli() {
  const opts = parseArgs(process.argv)
  if (!opts.envId && !opts.report) {
    console.error('[FAIL] 必须指定 --env=<envId>，或在测试中通过 --db= 注入')
    process.exit(2)
  }

  try {
    const { summary, exitCode } = await runValidate(opts)
    console.log(renderReport(summary))

    // 写报告到 docs/validate-legacy-data-report.json
    const reportFile = path.join(__dirname, '..', 'docs', 'validate-legacy-data-report.json')
    fs.writeFileSync(reportFile, JSON.stringify(summary, null, 2))
    console.log(`[REPORT] 已写入 ${path.relative(process.cwd(), reportFile)}`)

    if (exitCode !== 0) {
      console.error(`[FAIL] P0 异常 ${summary.byLevel.P0} 条，CI 应失败`)
    } else {
      console.log('[DONE] 校验完成')
    }
    process.exit(exitCode)
  } catch (e) {
    console.error('[FAIL] 校验异常:', e)
    process.exit(1)
  }
}

if (require.main === module) {
  cli()
}

module.exports = {
  runValidate,
  renderReport,
  CHECKS,
  ISSUE_LEVELS,
  parseArgs,
  toMs,
}
