#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sprint 22: 风控接入更多业务点审计脚本
 *
 * 检查项：
 *   1. cloudfunctions/common/risk-control.{ts,js,d.ts} 存在
 *   2. risk-control.ts 导出 detectMallOrderRisk / detectActivityApplyRisk
 *   3. mallService/index.js 集成 performMallOrderRiskCheck（或直接调用 detectMallOrderRisk）
 *   4. activityService/index.js 集成 performActivityApplyRiskCheck
 *   5. mallService/index.js + activityService/index.js 都调用 initGlobalRateLimitFromDb
 *   6. order 落库带 riskDecision / pendingReview 字段（Sprint 22 标识）
 *   7. 单测：common-risk-control-order.test.js
 *   8. 集成测试：integration/risk-business-points-flow.test.js
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 至少 1 项不通过
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

let failed = 0
const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) {failed++}
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. 文件存在性
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-control.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-control.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-control.d.ts')
check('risk-control.ts 存在', fs.existsSync(TS))
check('risk-control.js 存在', fs.existsSync(JS))
check('risk-control.d.ts 存在', fs.existsSync(DTS))

// 2. 导出 detectMallOrderRisk / detectActivityApplyRisk
const rcTs = readSafe(TS)
check(
  'risk-control.ts 导出 detectMallOrderRisk',
  /export\s+async\s+function\s+detectMallOrderRisk/.test(rcTs || '')
)
check(
  'risk-control.ts 导出 detectActivityApplyRisk',
  /export\s+async\s+function\s+detectActivityApplyRisk/.test(rcTs || '')
)
check(
  'risk-control.ts 导出 detectLargeAmount',
  /export\s+function\s+detectLargeAmount/.test(rcTs || '')
)
check(
  'risk-control.ts 导出 ORDER_RISK_CONFIG',
  /export\s+const\s+ORDER_RISK_CONFIG/.test(rcTs || '')
)

// 3. mallService 集成
const mallIdx = readSafe(path.join(ROOT, 'cloudfunctions', 'mallService', 'index.js'))
check('mallService/index.js 调用 performMallOrderRiskCheck', /performMallOrderRiskCheck\s*\(/.test(mallIdx || ''))
check('mallService/index.js 调用 detectMallOrderRisk', /detectMallOrderRisk/.test(mallIdx || ''))
check('mallService/index.js 注入全局限流', /initGlobalRateLimitFromDb\s*\(|bootstrapRateLimit\s*\(/.test(mallIdx || ''))
check('mallService/index.js 订单字段含 pendingReview', /pendingReview/.test(mallIdx || ''))
check('mallService/index.js 订单字段含 riskDecision', /riskDecision/.test(mallIdx || ''))

// 4. activityService 集成
const actIdx = readSafe(path.join(ROOT, 'cloudfunctions', 'activityService', 'index.js'))
check('activityService/index.js 调用 performActivityApplyRiskCheck', /performActivityApplyRiskCheck\s*\(/.test(actIdx || ''))
check('activityService/index.js 调用 detectActivityApplyRisk', /detectActivityApplyRisk/.test(actIdx || ''))
check('activityService/index.js 注入全局限流', /initGlobalRateLimitFromDb\s*\(|bootstrapRateLimit\s*\(/.test(actIdx || ''))
check('activityService/index.js 报名字段含 pendingReview', /pendingReview/.test(actIdx || ''))

// 5. 风控错误码注册
const errorsTs = readSafe(path.join(ROOT, 'cloudfunctions', 'common', 'errors.ts'))
check('errors.ts 注册 RISK_REJECT', /RISK_REJECT:\s*\{/.test(errorsTs || ''))
check('errors.ts 注册 RISK_PENDING', /RISK_PENDING:\s*\{/.test(errorsTs || ''))
check('errors.ts 注册 RISK_PASS', /RISK_PASS:\s*\{/.test(errorsTs || ''))

// 6. 单元测试存在
const unitTest = path.join(ROOT, 'test', 'common-risk-control-order.test.js')
check('单元测试 common-risk-control-order.test.js 存在', fs.existsSync(unitTest))

// 7. 集成测试存在
const intTest = path.join(ROOT, 'test', 'integration', 'risk-business-points-flow.test.js')
check('集成测试 risk-business-points-flow.test.js 存在', fs.existsSync(intTest))

// 8. 大额阈值合理性（避免误改）
//   - HUGE = 100 * 100 * 100 = 10_000_000 分
//   - LARGE = 50 * 100 * 100 = 5_000_000 分
const HUGE_RE = /HUGE_AMOUNT_FEN:\s*100\s*\*\s*100\s*\*\s*100/
const LARGE_RE = /LARGE_AMOUNT_FEN:\s*50\s*\*\s*100\s*\*\s*100/
check('ORDER_RISK_CONFIG.HUGE_AMOUNT_FEN = 10 万元（分）', HUGE_RE.test(rcTs || ''))
check('ORDER_RISK_CONFIG.LARGE_AMOUNT_FEN = 5 万元（分）', LARGE_RE.test(rcTs || ''))

// 9. 业务点 RATE_LIMITED 透传
check('mallService 透传 RATE_LIMITED（限流保护）', /RATE_LIMITED/.test(mallIdx || ''))
check('activityService 透传 RATE_LIMITED（限流保护）', /RATE_LIMITED/.test(actIdx || ''))

// 总结
console.log()
console.log(`[${failed === 0 ? 'PASS' : 'FAIL'}] ${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) {process.exit(1)}
