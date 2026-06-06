/**
 * 存量数据迁移核心逻辑（可独立测试）
 *
 * 与 CLI 入口分离，方便 jest 直接调用 runMigrate() 测试。
 */

const TASKS_ALL = ['organizerId', 'nickName', 'createdAt', 'petInfo']

/**
 * 主入口
 * @param {object} opts
 * @param {boolean} opts.apply - true 写入；false 仅扫描
 * @param {string|null} opts.only - 过滤单个任务
 * @param {number} opts.batch - 批大小
 * @param {string} opts.envId - CloudBase env
 * @param {object} [opts.db] - 可选：注入 db（测试用）
 * @returns {Promise<{results: object[]}>}
 */
async function runMigrate(opts) {
  const { apply, only, batch, envId, db: injectedDb } = opts
  const db = injectedDb || (await initDb(envId))
  const tasks = TASKS_ALL.filter(t => !only || only === t)
  logSection(`Sprint 9 存量数据迁移 【${apply ? 'APPLY' : 'DRY-RUN'}】`)
  // eslint-disable-next-line no-console
  console.log(`任务清单: ${tasks.join(', ')}`)
  // eslint-disable-next-line no-console
  console.log(`批大小: ${batch}`)
  // eslint-disable-next-line no-console
  console.log(`环境: ${envId}`)

  const results = []
  for (const t of tasks) {
    const fn = {
      organizerId: () => migrateOrganizerId(db, apply, batch),
      nickName: () => migrateNickName(db, apply, batch),
      createdAt: () => migrateCreatedAt(db, apply, batch),
      petInfo: () => migratePetInfo(db, apply, batch),
    }[t]
    if (fn) {
      const r = await fn()
      results.push({ task: t, ...r })
    }
  }

  logSection('迁移完成')
  if (!apply) {
    // eslint-disable-next-line no-console
    console.log('【提示】当前为 dry-run 模式，未实际写入。')
    // eslint-disable-next-line no-console
    console.log('请使用 --apply --env=<envId> 重新执行以应用变更。')
  }
  return { results }
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
  // eslint-disable-next-line no-console
  console.log(`[INIT] 已连接 CloudBase env=${envId}`)
  return app.database()
}

function logSection(title) {
  // eslint-disable-next-line no-console
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`)
}

// ===== 任务 1: orders.organizerId 回填 =====
async function migrateOrganizerId(db, apply, _batch) {
  logSection('[1/4] orders.organizerId 回填')

  const filterMissing = { organizerId: db.command.exists(false) }
  const res = await db.collection('orders').where(filterMissing).field({ _id: true, hostId: true }).limit(1000).get()
  const missingDocs = res.data || []
  // eslint-disable-next-line no-console
  console.log(`  [SCAN] organizerId 缺失的订单: ${missingDocs.length} 条`)

  if (missingDocs.length === 0) {
    // eslint-disable-next-line no-console
    console.log('  [SKIP] 无需处理')
    return { scanned: 0, updated: 0, skipped: 0, failed: 0 }
  }

  const hostIds = [...new Set(missingDocs.map(d => d.hostId).filter(Boolean))]
  // eslint-disable-next-line no-console
  console.log(`  [SCAN] 涉及 hostProfile 数: ${hostIds.length}`)

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log(`  [DRY-RUN] 预计将更新 ${missingDocs.length} 条订单的 organizerId`)
    if (missingDocs.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`  [DRY-RUN] 样例（前 3 条）:`)
      missingDocs.slice(0, 3).forEach(d => {
        // eslint-disable-next-line no-console
        console.log(`    - order ${d._id}: hostId=${d.hostId}`)
      })
    }
    return { scanned: missingDocs.length, updated: 0, skipped: 0, failed: 0, dryRun: true }
  }

  // apply: 加载 host.openid 映射
  const hostRes = await db.collection('hostProfiles')
    .where({ _id: db.command.in(hostIds) })
    .field({ _id: true, openid: true })
    .limit(1000)
    .get()
  const hostMap = {}
  for (const h of (hostRes.data || [])) {
    hostMap[h._id] = h.openid
  }
  // eslint-disable-next-line no-console
  console.log(`  [MAP] 已加载 host.openid 映射: ${Object.keys(hostMap).length} 条`)

  let updated = 0
  let skipped = 0
  const failed = []
  for (const order of missingDocs) {
    const openid = hostMap[order.hostId]
    if (!openid) {
      skipped += 1
      // eslint-disable-next-line no-console
      console.warn(`  [WARN] 订单 ${order._id} 找不到 hostProfile.openid，跳过`)
      continue
    }
    try {
      await db.collection('orders').doc(order._id).update({
        data: { organizerId: openid, migrated_organizerId: true },
      })
      updated += 1
    } catch (e) {
      failed.push({ _id: order._id, err: e.message })
    }
  }
  // eslint-disable-next-line no-console
  console.log(`  [DONE] organizerId 回填: updated=${updated}, skipped=${skipped}, failed=${failed.length}`)
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`  [FAIL] 失败清单:`)
    failed.forEach(f => console.error(`    - ${f._id}: ${f.err}`))
  }
  return { scanned: missingDocs.length, updated, skipped, failed: failed.length }
}

// ===== 任务 2: users.nickName 回填 =====
async function migrateNickName(db, apply, batch) {
  logSection('[2/4] users.nickName 回填（nickname → nickName）')

  if (!apply) {
    const res = await db.collection('users')
      .where({ nickName: db.command.exists(false), nickname: db.command.exists(true) })
      .count()
    // eslint-disable-next-line no-console
    console.log(`  [DRY-RUN] 预计将更新 ${res.total} 条用户记录`)
    return { scanned: res.total, updated: 0, dryRun: true }
  }

  const countRes = await db.collection('users')
    .where({ nickName: db.command.exists(false), nickname: db.command.exists(true) })
    .count()
  const total = countRes.total
  // eslint-disable-next-line no-console
  console.log(`  [SCAN] 命中用户数: ${total}`)

  if (total === 0) return { scanned: 0, updated: 0, failed: 0 }

  let lastId = null
  let updated = 0
  const failed = []
  while (true) {
    const filter = lastId
      ? { nickName: db.command.exists(false), nickname: db.command.exists(true), _id: db.command.gt(lastId) }
      : { nickName: db.command.exists(false), nickname: db.command.exists(true) }
    const res = await db.collection('users').where(filter)
      .orderBy('_id', 'asc').limit(batch)
      .field({ _id: true, nickname: true })
      .get()
    const docs = res.data || []
    if (docs.length === 0) break
    for (const u of docs) {
      try {
        await db.collection('users').doc(u._id).update({
          data: { nickName: u.nickname, migrated_nickName: true },
        })
        updated += 1
      } catch (e) {
        failed.push({ _id: u._id, err: e.message })
      }
    }
    lastId = docs[docs.length - 1]._id
    if (docs.length < batch) break
  }
  // eslint-disable-next-line no-console
  console.log(`  [DONE] nickName 回填: updated=${updated}, failed=${failed.length}`)
  failed.forEach(f => console.error(`    - ${f._id}: ${f.err}`))
  return { scanned: total, updated, failed: failed.length }
}

// ===== 任务 3: createdAt 字段统一 =====
async function migrateCreatedAt(db, apply, batch) {
  logSection('[3/4] createdAt 字段统一（createAt → createdAt）')

  const collections = ['orders', 'pets', 'hostProfiles', 'users', 'notifications']
  const results = []
  for (const c of collections) {
    if (!apply) {
      try {
        const res = await db.collection(c)
          .where({ createdAt: db.command.exists(false), createAt: db.command.exists(true) })
          .count()
        // eslint-disable-next-line no-console
        console.log(`  [DRY-RUN] ${c}: 预计 ${res.total} 条`)
        results.push({ collection: c, scanned: res.total, dryRun: true })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(`  [SKIP] ${c}: 集合不存在或查询失败 (${e.errCode || e.message})`)
        results.push({ collection: c, skipped: true })
      }
      continue
    }

    let updated = 0
    const failed = []
    let lastId = null
    while (true) {
      const filter = lastId
        ? { createdAt: db.command.exists(false), createAt: db.command.exists(true), _id: db.command.gt(lastId) }
        : { createdAt: db.command.exists(false), createAt: db.command.exists(true) }
      const res = await db.collection(c).where(filter)
        .orderBy('_id', 'asc').limit(batch)
        .field({ _id: true, createAt: true })
        .get()
      const docs = res.data || []
      if (docs.length === 0) break
      for (const d of docs) {
        try {
          await db.collection(c).doc(d._id).update({
            data: { createdAt: d.createAt, migrated_createdAt: true },
          })
          updated += 1
        } catch (e) {
          failed.push({ _id: d._id, err: e.message })
        }
      }
      lastId = docs[docs.length - 1]._id
      if (docs.length < batch) break
    }
    // eslint-disable-next-line no-console
    console.log(`  [DONE] ${c}: updated=${updated}, failed=${failed.length}`)
    failed.forEach(f => console.error(`    - ${f._id}: ${f.err}`))
    results.push({ collection: c, updated, failed: failed.length })
  }
  return { results }
}

// ===== 任务 4: petInfo → petsInfo =====
async function migratePetInfo(db, apply, batch) {
  logSection('[4/4] pets.petInfo → petsInfo（兼容旧字段）')

  if (!apply) {
    try {
      const res = await db.collection('pets')
        .where({ petsInfo: db.command.exists(false), petInfo: db.command.exists(true) })
        .count()
      // eslint-disable-next-line no-console
      console.log(`  [DRY-RUN] pets: 预计 ${res.total} 条`)
      return { scanned: res.total, dryRun: true }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`  [SKIP] pets: ${e.errCode || e.message}`)
      return { skipped: true }
    }
  }

  const countRes = await db.collection('pets')
    .where({ petsInfo: db.command.exists(false), petInfo: db.command.exists(true) })
    .count()
  const total = countRes.total
  // eslint-disable-next-line no-console
  console.log(`  [SCAN] pets: 命中 ${total} 条`)

  let lastId = null
  let updated = 0
  const failed = []
  while (true) {
    const filter = lastId
      ? { petsInfo: db.command.exists(false), petInfo: db.command.exists(true), _id: db.command.gt(lastId) }
      : { petsInfo: db.command.exists(false), petInfo: db.command.exists(true) }
    const res = await db.collection('pets').where(filter)
      .orderBy('_id', 'asc').limit(batch)
      .field({ _id: true, petInfo: true })
      .get()
    const docs = res.data || []
    if (docs.length === 0) break
    for (const d of docs) {
      try {
        // petInfo 旧值可能是数组或单对象，统一为数组
        const petsInfo = Array.isArray(d.petInfo) ? d.petInfo : [d.petInfo]
        await db.collection('pets').doc(d._id).update({
          data: { petsInfo, migrated_petInfo: true },
        })
        updated += 1
      } catch (e) {
        failed.push({ _id: d._id, err: e.message })
      }
    }
    lastId = docs[docs.length - 1]._id
    if (docs.length < batch) break
  }
  // eslint-disable-next-line no-console
  console.log(`  [DONE] pets: updated=${updated}, failed=${failed.length}`)
  failed.forEach(f => console.error(`    - ${f._id}: ${f.err}`))
  return { scanned: total, updated, failed: failed.length }
}

module.exports = {
  runMigrate,
  migrateOrganizerId,
  migrateNickName,
  migrateCreatedAt,
  migratePetInfo,
}
