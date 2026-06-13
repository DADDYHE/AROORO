/**
 * Sprint 15: risk-control.ts TypeScript 迁移验证
 *
 * 覆盖：
 *   1. .ts 源文件存在
 *   2. 编译产物 .js 存在且与 .ts 同步
 *   3. 关键类型与导出函数校验（接口契约稳定）
 *   4. .ts / .js 双导出一致（同一组导出符号）
 *   5. tsconfig.common.json 与 build:common 已纳入 risk-control
 *   6. Sprint 14 新增 API 仍在（mapActionToErrorCode / assertRiskDecision）
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-control.ts')
const JS = path.join(ROOT, 'cloudfunctions', 'common', 'risk-control.js')
const DTS = path.join(ROOT, 'cloudfunctions', 'common', 'types.d.ts')
const TSCONFIG = path.join(ROOT, 'tsconfig.common.json')
const BUILD_SCRIPT = path.join(ROOT, 'scripts', 'build-all-services.js')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

describe('Sprint 15: risk-control.ts TypeScript 迁移', () => {
  describe('源文件 / 产物', () => {
    test('risk-control.ts 源文件存在', () => {
      expect(fs.existsSync(TS)).toBe(true)
    })

    test('risk-control.js 编译产物存在', () => {
      expect(fs.existsSync(JS)).toBe(true)
    })

    test('risk-control.js 是 tsc 产物（顶部含模块系统代码）', () => {
      const content = readSafe(JS)
      // 编译产物通常含 "use strict" 与 require 引入
      expect(content).toMatch(/["']use strict["']/)
      expect(content).toMatch(/require\(["']crypto["']\)/)
    })
  })

  describe('.ts 源码：类型与导出契约', () => {
    test('导出 RiskReport / RiskLevel / RiskAction 类型', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+type\s+RiskLevel/)
      expect(content).toMatch(/export\s+type\s+RiskAction/)
      expect(content).toMatch(/export\s+interface\s+RiskReport/)
    })

    test('导出 EvaluationSnapshot / RefundSnapshot', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+interface\s+EvaluationSnapshot/)
      expect(content).toMatch(/export\s+interface\s+RefundSnapshot/)
    })

    test('导出 detectReviewSpam / detectRefundAbuse', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+async\s+function\s+detectReviewSpam/)
      expect(content).toMatch(/export\s+async\s+function\s+detectRefundAbuse/)
    })

    test('导出单项检测函数（评价 5 项）', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+function\s+detectHighFrequency/)
      expect(content).toMatch(/export\s+function\s+detectHostConcentration/)
      expect(content).toMatch(/export\s+function\s+detectDuplicateComment/)
      expect(content).toMatch(/export\s+function\s+detectCommentLength/)
      expect(content).toMatch(/export\s+function\s+detectFiveStarRatio/)
    })

    test('导出单项检测函数（退款 4 项）', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+function\s+detectRefundHighFrequency/)
      expect(content).toMatch(/export\s+function\s+detectRefundRate/)
      expect(content).toMatch(/export\s+function\s+detectFullRefund/)
      expect(content).toMatch(/export\s+function\s+detectSameAmountPattern/)
    })

    test('导出辅助函数 mapActionToErrorCode / assertRiskDecision（Sprint 14）', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+function\s+mapActionToErrorCode/)
      expect(content).toMatch(/export\s+function\s+assertRiskDecision/)
    })

    test('导出配置常量 CONFIG / REFUND_CONFIG', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+const\s+CONFIG/)
      expect(content).toMatch(/export\s+const\s+REFUND_CONFIG/)
    })

    test('commentFingerprint 是 export function', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+function\s+commentFingerprint/)
    })

    test('levelToAction 是 export function', () => {
      const content = readSafe(TS)
      expect(content).toMatch(/export\s+function\s+levelToAction/)
    })
  })

  describe('.js 产物：行为接口一致', () => {
    // 加载 .js（动态 require，验证产物可被消费）
    let risk
    beforeAll(() => {
      // 清缓存以确保拿到最新 .js
      const reqPath = require.resolve(JS)
      delete require.cache[reqPath]
      risk = require(JS)
    })

    test('产物导出了全部公共 API', () => {
      const expected = [
        'detectReviewSpam', 'detectRefundAbuse', 'commentFingerprint',
        'CONFIG', 'REFUND_CONFIG',
        'detectHighFrequency', 'detectHostConcentration', 'detectDuplicateComment',
        'detectCommentLength', 'detectFiveStarRatio',
        'detectRefundHighFrequency', 'detectRefundRate', 'detectFullRefund',
        'detectSameAmountPattern', 'levelToAction',
        'mapActionToErrorCode', 'assertRiskDecision',
      ]
      for (const name of expected) {
        expect(risk[name]).toBeDefined()
      }
    })

    test('mapActionToErrorCode 行为正确（与 .ts 一致）', () => {
      expect(risk.mapActionToErrorCode('reject')).toBe('RISK_REJECT')
      expect(risk.mapActionToErrorCode('review')).toBe('RISK_PENDING')
      expect(risk.mapActionToErrorCode('allow')).toBe('RISK_PASS')
    })

    test('commentFingerprint 行为正确', () => {
      const fp1 = risk.commentFingerprint('  非常好  ')
      const fp2 = risk.commentFingerprint('非常好')
      expect(fp1).toBe(fp2)
      expect(fp1.length).toBe(32) // md5 hex
    })

    test('assertRiskDecision 行为正确', () => {
      const baseRisk = action => ({ level: 'low', action, reasons: ['x'], details: {}, target: {} })
      // allow
      expect(risk.assertRiskDecision(baseRisk('allow'))).toEqual({
        passed: true, code: 'RISK_PASS', reasons: ['x'],
      })
      // reject
      try { risk.assertRiskDecision(baseRisk('reject')); throw new Error('should throw') } catch (e) { expect(e.code).toBe('RISK_REJECT') }
      // review
      try { risk.assertRiskDecision(baseRisk('review')); throw new Error('should throw') } catch (e) { expect(e.code).toBe('RISK_PENDING') }
    })
  })

  describe('tsconfig / build 工具链', () => {
    test('tsconfig.common.json 包含 risk-control.ts', () => {
      const content = readSafe(TSCONFIG)
      expect(content).toMatch(/cloudfunctions\/common\/risk-control\.ts/)
    })

    test('scripts/build-all-services.js 包含 risk-control.js', () => {
      const content = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
      expect(content).toMatch(/risk-control\.js/)
    })
  })

  describe('types.d.ts 兼容', () => {
    test('types.d.ts 含 CloudBaseDB（risk-control 依赖）', () => {
      const content = readSafe(DTS)
      expect(content).toMatch(/export\s+interface\s+CloudBaseDB/)
    })
  })
})
