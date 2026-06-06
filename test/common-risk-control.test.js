/**
 * cloudfunctions/common/risk-control.js 单元测试（Sprint 11）
 *
 * 覆盖：
 *   - commentFingerprint：标准化 + 哈希稳定
 *   - 5 个独立检测器
 *   - levelToAction 映射
 *   - detectReviewSpam 主入口：
 *     - 短时间高频 → medium/high
 *     - host 集中好评 → medium/high
 *     - 重复模板 → medium/high
 *     - 长度异常 → medium/high
 *     - 全 5 星比例 → medium
 *     - 全部命中 → high + reject
 *     - 正常评价 → low + allow
 */

const {
  detectReviewSpam,
  commentFingerprint,
  detectHighFrequency,
  detectHostConcentration,
  detectDuplicateComment,
  detectCommentLength,
  detectFiveStarRatio,
  levelToAction,
  CONFIG,
} = require('../cloudfunctions/common/risk-control')

// ============ In-memory db mock ============
function createMockDb(evaluations = []) {
  return {
    collection(name) {
      return {
        where(query) {
          const filterFn = doc => {
            for (const [k, v] of Object.entries(query || {})) {
              if (v && typeof v === 'object' && v._op) {
                if (v._op === 'gte') {
                  const dv = doc[k] instanceof Date ? doc[k].getTime() : doc[k]
                  const cv = v.v instanceof Date ? v.v.getTime() : v.v
                  if (!(dv >= cv)) return false
                }
                continue
              }
              if (doc[k] !== v) return false
            }
            return true
          }
          const chain = {
            limit: () => chain,
            get: async () => ({ data: evaluations.filter(filterFn) }),
          }
          return chain
        },
      }
    },
  }
}

const NOW = new Date('2026-06-04T12:00:00Z').getTime()

const ev = (overrides = {}) => ({
  _id: 'e_' + Math.random().toString(36).slice(2, 8),
  ownerId: 'oU1',
  hostId: 'h1',
  orderId: 'o_' + Math.random().toString(36).slice(2, 8),
  rating: 5,
  comment: '好评',
  createdAt: NOW - 1000,
  ...overrides,
})

describe('risk-control.js', () => {
  describe('commentFingerprint', () => {
    test('应去除首尾空白 + 合并中间空白', () => {
      const a = commentFingerprint('  好评   很好  ')
      const b = commentFingerprint('好评 很好')
      expect(a).toBe(b)
    })

    test('应忽略大小写', () => {
      const a = commentFingerprint('Hello World')
      const b = commentFingerprint('hello world')
      expect(a).toBe(b)
    })

    test('应去除 emoji', () => {
      const a = commentFingerprint('推荐这家店 😊👍')
      const b = commentFingerprint('推荐这家店')
      expect(a).toBe(b)
    })

    test('空字符串 / 极短文案 → 返回空串', () => {
      expect(commentFingerprint('')).toBe('')
      expect(commentFingerprint('  ')).toBe('')
      expect(commentFingerprint('好')).toBe('') // 1 字 < minLen
    })

    test('同一字符串两次调用应得到相同指纹', () => {
      const fp1 = commentFingerprint('非常满意的一次寄养体验')
      const fp2 = commentFingerprint('非常满意的一次寄养体验')
      expect(fp1).toBe(fp2)
      expect(fp1).toMatch(/^[a-f0-9]{32}$/)
    })
  })

  describe('detectHighFrequency（短时间高频）', () => {
    test('1 分钟内 0 条 → low', () => {
      const r = detectHighFrequency([], NOW)
      expect(r.level).toBe('low')
    })

    test('1 分钟内 2 条 → low', () => {
      const list = [
        ev({ createdAt: NOW - 1000 }),
        ev({ createdAt: NOW - 2000 }),
      ]
      const r = detectHighFrequency(list, NOW)
      expect(r.level).toBe('low')
    })

    test('1 分钟内 3 条 → medium', () => {
      const list = [
        ev({ createdAt: NOW - 1000 }),
        ev({ createdAt: NOW - 2000 }),
        ev({ createdAt: NOW - 3000 }),
      ]
      const r = detectHighFrequency(list, NOW)
      expect(r.level).toBe('medium')
    })

    test('1 分钟内 5 条 → high', () => {
      const list = Array.from({ length: 5 }, (_, i) => ev({ createdAt: NOW - i * 1000 }))
      const r = detectHighFrequency(list, NOW)
      expect(r.level).toBe('high')
    })

    test('窗口外的不计入', () => {
      const list = [
        ev({ createdAt: NOW - 1000 }),
        ev({ createdAt: NOW - 61 * 1000 }), // 1 分 1 秒前
        ev({ createdAt: NOW - 120 * 1000 }),
      ]
      const r = detectHighFrequency(list, NOW)
      expect(r.count).toBe(1)
      expect(r.level).toBe('low')
    })
  })

  describe('detectHostConcentration（host 集中好评）', () => {
    test('非 5 星 → 不触发', () => {
      const list = Array.from({ length: 10 }, () => ev({ rating: 4 }))
      const r = detectHostConcentration(list, 4, NOW)
      expect(r.hit).toBe(false)
    })

    test('24h 内 5 星 < 3 条 → low', () => {
      const list = Array.from({ length: 2 }, (_, i) => ev({ rating: 5, createdAt: NOW - i * 1000 }))
      const r = detectHostConcentration(list, 5, NOW)
      expect(r.level).toBe('low')
    })

    test('24h 内 5 星 3 条 → medium', () => {
      const list = Array.from({ length: 3 }, (_, i) => ev({ rating: 5, createdAt: NOW - i * 1000 }))
      const r = detectHostConcentration(list, 5, NOW)
      expect(r.level).toBe('medium')
    })

    test('24h 内 5 星 6 条 → high', () => {
      const list = Array.from({ length: 6 }, (_, i) => ev({ rating: 5, createdAt: NOW - i * 1000 }))
      const r = detectHostConcentration(list, 5, NOW)
      expect(r.level).toBe('high')
    })

    test('超过 24h 的不计入', () => {
      const list = [
        ev({ rating: 5, createdAt: NOW - 1 * 1000 }),
        ev({ rating: 5, createdAt: NOW - 1 * 1000 }),
        ev({ rating: 5, createdAt: NOW - 25 * 60 * 60 * 1000 }),
        ev({ rating: 5, createdAt: NOW - 48 * 60 * 60 * 1000 }),
      ]
      const r = detectHostConcentration(list, 5, NOW)
      expect(r.count).toBe(2)
    })
  })

  describe('detectDuplicateComment（重复模板）', () => {
    test('评论为空 → 不触发', () => {
      const r = detectDuplicateComment([], '', NOW)
      expect(r.hit).toBe(false)
    })

    test('7 天内同文案 0 次 → low', () => {
      const r = detectDuplicateComment([], '非常好', NOW)
      expect(r.level).toBe('low')
    })

    test('7 天内同文案 1 次 → low', () => {
      const list = [ev({ comment: '非常好', createdAt: NOW - 1000 })]
      const r = detectDuplicateComment(list, '非常好', NOW)
      expect(r.count).toBe(1)
      expect(r.level).toBe('low')
    })

    test('7 天内同文案 2 次 → medium', () => {
      const list = [
        ev({ comment: '非常好', createdAt: NOW - 1000 }),
        ev({ comment: '非常好', createdAt: NOW - 2000 }),
      ]
      const r = detectDuplicateComment(list, '非常好', NOW)
      expect(r.count).toBe(2)
      expect(r.level).toBe('medium')
    })

    test('7 天内同文案 4 次 → high', () => {
      const list = Array.from({ length: 4 }, (_, i) =>
        ev({ comment: '非常好', createdAt: NOW - i * 1000 })
      )
      const r = detectDuplicateComment(list, '非常好', NOW)
      expect(r.level).toBe('high')
    })

    test('大小写 / 空白差异应被识别为同模板', () => {
      const list = [ev({ comment: '非 常 好', createdAt: NOW - 1000 })]
      const r = detectDuplicateComment(list, '非  常  好', NOW)
      expect(r.count).toBe(1)
    })
  })

  describe('detectCommentLength（评论长度）', () => {
    test('空评论 → low（允许）', () => {
      const r = detectCommentLength('')
      expect(r.level).toBe('low')
    })

    test('正常长度 → low', () => {
      const r = detectCommentLength('这是一段正常的评论，包含十几个字以上')
      expect(r.level).toBe('low')
    })

    test('极短（< 2 字）→ medium', () => {
      const r = detectCommentLength('好')
      expect(r.level).toBe('medium')
    })

    test('超长（> 500 字）→ high', () => {
      const r = detectCommentLength('a'.repeat(501))
      expect(r.level).toBe('high')
    })
  })

  describe('detectFiveStarRatio（全 5 星比例）', () => {
    test('样本不足 → low', () => {
      const list = Array.from({ length: 5 }, () => ev({ rating: 5 }))
      const r = detectFiveStarRatio(list)
      expect(r.level).toBe('low')
    })

    test('样本 ≥ 10 且全 5 星 → medium', () => {
      const list = Array.from({ length: 10 }, () => ev({ rating: 5 }))
      const r = detectFiveStarRatio(list)
      expect(r.level).toBe('medium')
    })

    test('样本 100 但 90% 是 5 星 → low（未达阈值）', () => {
      const list = [
        ...Array.from({ length: 90 }, () => ev({ rating: 5 })),
        ...Array.from({ length: 10 }, () => ev({ rating: 4 })),
      ]
      const r = detectFiveStarRatio(list)
      expect(r.level).toBe('low')
    })

    test('样本 100 且 95% 是 5 星 → medium', () => {
      const list = [
        ...Array.from({ length: 95 }, () => ev({ rating: 5 })),
        ...Array.from({ length: 5 }, () => ev({ rating: 4 })),
      ]
      const r = detectFiveStarRatio(list)
      expect(r.level).toBe('medium')
    })
  })

  describe('levelToAction', () => {
    test('low → allow', () => {
      expect(levelToAction('low')).toBe('allow')
    })

    test('medium → review', () => {
      expect(levelToAction('medium')).toBe('review')
    })

    test('high → reject', () => {
      expect(levelToAction('high')).toBe('reject')
    })
  })

  describe('detectReviewSpam（主入口）', () => {
    test('正常评价 → low / allow', async () => {
      const db = createMockDb([])
      const r = await detectReviewSpam({
        db, userId: 'oU1', hostId: 'h1', orderId: 'o1',
        rating: 5, comment: '不错', now: NOW,
      })
      expect(r.level).toBe('low')
      expect(r.action).toBe('allow')
      expect(r.reasons.length).toBe(0)
    })

    test('1 分钟 3 次 → medium / review', async () => {
      const list = Array.from({ length: 3 }, (_, i) =>
        ev({ comment: 'unique' + i, createdAt: NOW - i * 1000 })
      )
      const db = createMockDb(list)
      const r = await detectReviewSpam({
        db, userId: 'oU1', hostId: 'h1', orderId: 'o4',
        rating: 4, comment: '本次评价', now: NOW,
      })
      expect(r.level).toBe('medium')
      expect(r.action).toBe('review')
      expect(r.reasons.some(x => x.startsWith('HIGH_FREQ'))).toBe(true)
    })

    test('host 24h 集中 5 星 → medium / review', async () => {
      const list = Array.from({ length: 3 }, (_, i) =>
        ev({ hostId: 'h1', rating: 5, comment: 'h_' + i, createdAt: NOW - i * 1000 })
      )
      const db = createMockDb(list)
      const r = await detectReviewSpam({
        db, userId: 'oU1', hostId: 'h1', orderId: 'o99',
        rating: 5, comment: 'h_test', now: NOW,
      })
      expect(r.reasons.some(x => x.startsWith('HOST_CONCENTRATION'))).toBe(true)
    })

    test('重复模板 → medium', async () => {
      const list = [
        ev({ comment: '完全一样', createdAt: NOW - 1000 }),
        ev({ comment: '完全一样', createdAt: NOW - 2000 }),
      ]
      const db = createMockDb(list)
      const r = await detectReviewSpam({
        db, userId: 'oU1', hostId: 'h1', orderId: 'o8',
        rating: 5, comment: '完全一样', now: NOW,
      })
      expect(r.reasons.some(x => x.startsWith('DUP_COMMENT'))).toBe(true)
    })

    test('全 5 星比例 100% / 10 样本 → medium', async () => {
      const list = Array.from({ length: 10 }, (_, i) =>
        ev({ comment: 'i_' + i, rating: 5, createdAt: NOW - (i + 1) * 60 * 1000 })
      )
      const db = createMockDb(list)
      const r = await detectReviewSpam({
        db, userId: 'oU1', hostId: 'h1', orderId: 'o7',
        rating: 5, comment: 'new comment', now: NOW,
      })
      expect(r.reasons.some(x => x.startsWith('FIVE_STAR_RATIO'))).toBe(true)
    })

    test('多检测项同时触发 → 取最高等级', async () => {
      // 1 分钟 4 条 + 重复模板 4 次 + host 集中 5 星
      const list = [
        ev({ comment: '刷评', rating: 5, createdAt: NOW - 1000 }),
        ev({ comment: '刷评', rating: 5, createdAt: NOW - 2000 }),
        ev({ comment: '刷评', rating: 5, createdAt: NOW - 3000 }),
        ev({ comment: '刷评', rating: 5, createdAt: NOW - 4000 }),
      ]
      const db = createMockDb(list)
      const r = await detectReviewSpam({
        db, userId: 'oU1', hostId: 'h1', orderId: 'oX',
        rating: 5, comment: '刷评', now: NOW,
      })
      expect(r.level).toBe('high')
      expect(r.action).toBe('reject')
      expect(r.reasons.length).toBeGreaterThanOrEqual(3)
    })

    test('report.details 应包含每个检测项', async () => {
      const list = Array.from({ length: 3 }, (_, i) =>
        ev({ comment: '高频', rating: 5, createdAt: NOW - i * 1000 })
      )
      const db = createMockDb(list)
      const r = await detectReviewSpam({
        db, userId: 'oU1', hostId: 'h1', orderId: 'oY',
        rating: 5, comment: '高频', now: NOW,
      })
      expect(r.details.highFreq).toBeDefined()
      expect(r.details.hostConcentration).toBeDefined()
      expect(r.details.dupComment).toBeDefined()
    })

    test('report.target 应回填本次评价关键字段', async () => {
      const db = createMockDb([])
      const r = await detectReviewSpam({
        db, userId: 'oU1', hostId: 'h1', orderId: 'oZ',
        rating: 4, comment: '不错', now: NOW,
      })
      expect(r.target).toEqual({
        userId: 'oU1', hostId: 'h1', orderId: 'oZ',
        rating: 4, comment: '不错',
      })
    })
  })

  describe('CONFIG 暴露', () => {
    test('应暴露关键阈值（便于运营 / 监控）', () => {
      expect(CONFIG.HIGH_FREQ_WINDOW_MS).toBeDefined()
      expect(CONFIG.HOST_CONCENTRATION_THRESHOLD).toBeDefined()
      expect(CONFIG.DUP_COMMENT_THRESHOLD).toBeDefined()
    })
  })
})
