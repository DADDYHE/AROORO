/**
 * Sprint 15: 评价风控子链路集成测试
 *
 * 端到端：detectReviewSpam 拉真实 db 快照，输出风险报告，
 *   联动 assertRiskDecision 抛出 / 透传。
 *
 * 覆盖：
 *   1. 正常评价：低风险 → allow → RISK_PASS
 *   2. 短时间高频：5 条 1 分钟内 → high → RISK_REJECT
 *   3. 同一 host 集中 5 星：6 条 24h → high → RISK_REJECT
 *   4. 重复模板：4 条同文案 → high → RISK_REJECT
 *   5. 评论长度异常：> 500 → high → RISK_REJECT
 *   6. 全 5 星比例：10/10 全 5 星 → medium → RISK_PENDING
 *   7. 复合：高频 + 重复文案 → level 升级取 max
 *   8. action 映射：mapActionToErrorCode 三档映射
 *   9. 边界：空 db 集合 → allow
 */

const path = require('path')
const riskControl = require(path.join(__dirname, '..', '..', 'cloudfunctions', 'common', 'risk-control.js'))
const { err, BusinessError } = require(path.join(__dirname, '..', '..', 'cloudfunctions', 'common', 'errors.js'))

const {
  detectReviewSpam,
  detectHighFrequency,
  detectHostConcentration,
  detectDuplicateComment,
  detectCommentLength,
  detectFiveStarRatio,
  levelToAction,
  mapActionToErrorCode,
  assertRiskDecision,
  commentFingerprint,
  CONFIG,
} = riskControl

// ===== Mock DB =====
// 兼容 detectReviewSpam 的 safeList 接口
function makeMockDb(initial = {}) {
  const collections = {}
  for (const [name, docs] of Object.entries(initial)) {
    collections[name] = { docs: [...docs] }
  }
  const db = {
    collection: name => {
      if (!collections[name]) {collections[name] = { docs: [] }}
      const col = collections[name]
      return {
        where: q => makeQuery(col, q),
      }
    },
  }
  function makeQuery(col, q) {
    const matchFn = doc => {
      for (const [k, v] of Object.entries(q || {})) {
        if (v && typeof v === 'object' && v._op === 'gte') {
          if (doc[k] < v.v) {return false}
        } else if (doc[k] !== v) {
          return false
        }
      }
      return true
    }
    return {
      where: q2 => makeQuery(col, { ...q, ...q2 }),
      limit: () => makeQuery(col, q),
      get: () => Promise.resolve({ data: col.docs.filter(matchFn) }),
    }
  }
  return db
}

function makeEvaluation(overrides) {
  const o = overrides || {}
  return {
    _id: o._id || `e_${Math.random().toString(36).slice(2, 8)}`,
    ownerId: o.ownerId || 'u1',
    hostId: o.hostId || 'h1',
    orderId: o.orderId || 'o1',
    rating: o.rating != null ? o.rating : 5,
    comment: o.comment != null ? o.comment : '非常好',
    createdAt: o.createdAt != null ? o.createdAt : Date.now() - 60_000,
  }
}

const NOW = 1_700_000_000_000

describe('Sprint 15: 评价风控子链路', () => {
  describe('单项检测（unit-like）', () => {
    test('detectHighFrequency 5 条 1 分钟内 → high', () => {
      const recent = Array.from({ length: 5 }, () =>
        makeEvaluation({ createdAt: NOW - 10_000 }))
      const r = detectHighFrequency(recent, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
      expect(r.count).toBe(5)
    })

    test('detectHighFrequency 3 条 → medium', () => {
      const recent = Array.from({ length: 3 }, () =>
        makeEvaluation({ createdAt: NOW - 10_000 }))
      const r = detectHighFrequency(recent, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })

    test('detectHighFrequency 1 条 → low', () => {
      const r = detectHighFrequency([makeEvaluation()], NOW)
      expect(r.hit).toBe(false)
      expect(r.level).toBe('low')
    })

    test('detectHostConcentration 仅作用于 5 星', () => {
      const recent = Array.from({ length: 5 }, () =>
        makeEvaluation({ rating: 4, createdAt: NOW - 10_000 }))
      const r = detectHostConcentration(recent, 4, NOW)
      expect(r.hit).toBe(false)
    })

    test('detectHostConcentration 6 条 5 星 → high', () => {
      const recent = Array.from({ length: 6 }, () =>
        makeEvaluation({ rating: 5, createdAt: NOW - 10_000 }))
      const r = detectHostConcentration(recent, 5, NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
    })

    test('detectDuplicateComment 4 条同文案 → high', () => {
      const recent = Array.from({ length: 4 }, () =>
        makeEvaluation({ comment: '非常好！', createdAt: NOW - 10_000 }))
      const r = detectDuplicateComment(recent, '非常好！', NOW)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
      expect(r.fingerprint.length).toBe(32)
    })

    test('detectCommentLength > 500 → high', () => {
      const long = '好'.repeat(501)
      const r = detectCommentLength(long)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('high')
    })

    test('detectCommentLength < 2 → medium', () => {
      const r = detectCommentLength('a')
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })

    test('detectFiveStarRatio 10/10 全 5 星 → medium', () => {
      const all = Array.from({ length: 10 }, () => makeEvaluation({ rating: 5 }))
      const r = detectFiveStarRatio(all)
      expect(r.hit).toBe(true)
      expect(r.level).toBe('medium')
    })

    test('detectFiveStarRatio 样本不足（5 条）→ low', () => {
      const all = Array.from({ length: 5 }, () => makeEvaluation({ rating: 5 }))
      const r = detectFiveStarRatio(all)
      expect(r.hit).toBe(false)
    })
  })

  describe('主入口 detectReviewSpam（集成）', () => {
    test('空 db：低风险 → action=allow', async () => {
      const db = makeMockDb({ evaluations: [] })
      const r = await detectReviewSpam({
        db, userId: 'u1', hostId: 'h1', orderId: 'o1', rating: 5, comment: '非常棒',
        now: NOW,
      })
      expect(r.level).toBe('low')
      expect(r.action).toBe('allow')
      expect(r.reasons).toEqual([])
    })

    test('高频 5 条 + 普通评价：high → action=reject', async () => {
      const recent = Array.from({ length: 5 }, () =>
        makeEvaluation({ createdAt: NOW - 10_000 }))
      const db = makeMockDb({ evaluations: recent })
      const r = await detectReviewSpam({
        db, userId: 'u1', hostId: 'h1', orderId: 'o1', rating: 5, comment: '好评',
        now: NOW,
      })
      expect(r.level).toBe('high')
      expect(r.action).toBe('reject')
      expect(r.reasons.some(s => s.startsWith('HIGH_FREQ'))).toBe(true)
    })

    test('复合：高频 medium + 重复文案 medium → max → medium', async () => {
      const recent = Array.from({ length: 3 }, () =>
        makeEvaluation({
          createdAt: NOW - 10_000,
          comment: '非常好！',
        }))
      const db = makeMockDb({ evaluations: recent })
      const r = await detectReviewSpam({
        db, userId: 'u1', hostId: 'h1', orderId: 'o1', rating: 5, comment: '非常好！',
        now: NOW,
      })
      expect(r.action).toBe('review')
      expect(r.reasons.some(s => s.startsWith('HIGH_FREQ'))).toBe(true)
      expect(r.reasons.some(s => s.startsWith('DUP_COMMENT'))).toBe(true)
    })

    test('复合：5 星 + 24h 6 次集中 → high', async () => {
      const recent = Array.from({ length: 6 }, () =>
        makeEvaluation({
          rating: 5,
          createdAt: NOW - 60 * 60_000, // 1h 前
        }))
      const db = makeMockDb({ evaluations: recent })
      const r = await detectReviewSpam({
        db, userId: 'u1', hostId: 'h1', orderId: 'o1', rating: 5, comment: '好',
        now: NOW,
      })
      expect(r.action).toBe('reject')
      expect(r.reasons.some(s => s.startsWith('HOST_CONCENTRATION'))).toBe(true)
    })

    test('details 含各子项结果（便于审计）', async () => {
      const db = makeMockDb({ evaluations: [] })
      const r = await detectReviewSpam({
        db, userId: 'u1', hostId: 'h1', orderId: 'o1', rating: 5, comment: '好',
        now: NOW,
      })
      expect(r.details).toBeDefined()
      expect(r.target).toBeDefined()
      expect(r.target.orderId).toBe('o1')
    })
  })

  describe('action → 错误码联动（assertRiskDecision）', () => {
    test('allow 路径：返回 RISK_PASS', () => {
      const risk = { level: 'low', action: 'allow', reasons: [], details: {}, target: {} }
      const r = assertRiskDecision(risk)
      expect(r.passed).toBe(true)
      expect(r.code).toBe('RISK_PASS')
    })

    test('review 路径：抛 RISK_PENDING', () => {
      const risk = { level: 'medium', action: 'review', reasons: ['HIGH_FREQ:3次/60秒'], details: {}, target: {} }
      try {
        assertRiskDecision(risk)
        throw new Error('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessError)
        expect(e.code).toBe('RISK_PENDING')
        expect(e.details.reasons).toEqual(['HIGH_FREQ:3次/60秒'])
      }
    })

    test('reject 路径：抛 RISK_REJECT', () => {
      const risk = { level: 'high', action: 'reject', reasons: ['DUP_COMMENT:4次'], details: {}, target: {} }
      try {
        assertRiskDecision(risk)
        throw new Error('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessError)
        expect(e.code).toBe('RISK_REJECT')
      }
    })
  })

  describe('mapActionToErrorCode 一致性', () => {
    test.each([
      ['reject', 'RISK_REJECT'],
      ['review', 'RISK_PENDING'],
      ['allow', 'RISK_PASS'],
    ])('levelToAction(%s) → mapActionToErrorCode → %s', (action, expectedCode) => {
      const level = action === 'allow' ? 'low' : action === 'review' ? 'medium' : 'high'
      expect(levelToAction(level)).toBe(action)
      expect(mapActionToErrorCode(levelToAction(level))).toBe(expectedCode)
    })
  })

  describe('commentFingerprint 稳定性', () => {
    test('首尾空白不影响指纹', () => {
      expect(commentFingerprint('  非常好  ')).toBe(commentFingerprint('非常好'))
    })

    test('emoji 不影响指纹', () => {
      expect(commentFingerprint('非常好 😊')).toBe(commentFingerprint('非常好'))
    })

    test('空 / 1 字符返回空串（无效指纹）', () => {
      expect(commentFingerprint('')).toBe('')
      expect(commentFingerprint('a')).toBe('')
    })
  })
})
