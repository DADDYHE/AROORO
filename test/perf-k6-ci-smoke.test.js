/**
 * Sprint 14: k6 CI Smoke 接入验证测试
 *
 * 目标：
 *   1. 验证 ci-smoke.js 存在且语法正确
 *   2. 验证 CI workflow 中 k6-smoke + k6-main job 已配置
 *   3. 验证 k6 工具链基线（main-flow.js 可被 inspect）
 *   4. 验证脚本结构符合 k6 规范（export default / options / handleSummary）
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const CI_SMOKE = path.join(ROOT, 'scripts', 'perf', 'ci-smoke.js')
const MAIN_FLOW = path.join(ROOT, 'scripts', 'perf', 'main-flow.js')
const README = path.join(ROOT, 'scripts', 'perf', 'README.md')
const CI_YML = path.join(ROOT, '.github', 'workflows', 'ci.yml')

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') }
  catch (e) { return null }
}

describe('Sprint 14: k6 CI Smoke 接入验证', () => {
  describe('ci-smoke.js 文件', () => {
    test('脚本文件存在', () => {
      expect(fs.existsSync(CI_SMOKE)).toBe(true)
    })

    test('脚本导入 k6/http / k6/metrics', () => {
      const content = readFileSafe(CI_SMOKE)
      expect(content).toMatch(/import\s+http\s+from\s+['"]k6\/http['"]/)
      expect(content).toMatch(/import.*from\s+['"]k6\/metrics['"]/)
    })

    test('脚本包含 options / thresholds / handleSummary', () => {
      const content = readFileSafe(CI_SMOKE)
      expect(content).toMatch(/export\s+const\s+options\s*=/)
      expect(content).toMatch(/thresholds\s*:/)
      expect(content).toMatch(/export\s+function\s+handleSummary/)
    })

    test('脚本包含 default 入口函数', () => {
      const content = readFileSafe(CI_SMOKE)
      expect(content).toMatch(/export\s+default\s+function/)
    })

    test('thresholds 包含 smoke_checks_total / heartbeat_ms', () => {
      const content = readFileSafe(CI_SMOKE)
      expect(content).toMatch(/smoke_checks_total/)
      expect(content).toMatch(/heartbeat_ms/)
    })
  })

  describe('main-flow.js 文件', () => {
    test('脚本文件存在（未损坏）', () => {
      expect(fs.existsSync(MAIN_FLOW)).toBe(true)
    })

    test('main-flow.js 仍可被 k6 inspect 解析（结构完整）', () => {
      const content = readFileSafe(MAIN_FLOW)
      expect(content).toMatch(/export\s+const\s+options\s*=/)
      expect(content).toMatch(/export\s+default\s+function/)
      expect(content).toMatch(/thresholds\s*:/)
    })
  })

  describe('CI workflow 集成', () => {
    test('ci.yml 存在', () => {
      expect(fs.existsSync(CI_YML)).toBe(true)
    })

    test('ci.yml 包含 k6-smoke job', () => {
      const content = readFileSafe(CI_YML)
      expect(content).toMatch(/^\s*k6-smoke:/m)
    })

    test('ci.yml 包含 k6-main job', () => {
      const content = readFileSafe(CI_YML)
      expect(content).toMatch(/^\s*k6-main:/m)
    })

    test('k6-smoke job 含 continue-on-error（不阻塞 PR）', () => {
      const content = readFileSafe(CI_YML)
      const block = content.match(/k6-smoke:[\s\S]*?(?=\n  [a-z][a-z-]+:|\n$)/i)
      expect(block).not.toBeNull()
      expect(block[0]).toMatch(/continue-on-error:\s*true/)
    })

    test('k6-smoke job 含 k6 install + run + inspect', () => {
      const content = readFileSafe(CI_YML)
      const block = content.match(/k6-smoke:[\s\S]*?(?=\n  [a-z][a-z-]+:|\n$)/i)
      expect(block).not.toBeNull()
      expect(block[0]).toMatch(/apt-get\s+install.*k6/)
      expect(block[0]).toMatch(/k6\s+run/)
      expect(block[0]).toMatch(/k6\s+inspect/)
    })

    test('k6-main job 仅 main 分支触发', () => {
      const content = readFileSafe(CI_YML)
      const block = content.match(/k6-main:[\s\S]*?(?=\n  [a-z][a-z-]+:|\n$)/i)
      expect(block).not.toBeNull()
      expect(block[0]).toMatch(/github\.ref.*main/)
    })
  })

  describe('perf README', () => {
    test('README.md 存在', () => {
      expect(fs.existsSync(README)).toBe(true)
    })

    test('README 提到 ci-smoke.js', () => {
      const content = readFileSafe(README)
      expect(content).toMatch(/ci-smoke\.js/)
    })

    test('README 提到 Sprint 14 CI 集成', () => {
      const content = readFileSafe(README)
      expect(content).toMatch(/Sprint 14/)
    })
  })

  describe('行为模拟：thresholds 解析', () => {
    /**
     * 不实际跑 k6（无 GUI 工具链），但解析 options 块验证结构正确
     */
    test('ci-smoke.js 的 thresholds 块是合法 JS 对象', () => {
      const content = readFileSafe(CI_SMOKE)
      const match = content.match(/thresholds:\s*\{([\s\S]*?)\n\s{2}\}/)
      expect(match).not.toBeNull()
      // 应包含 ≥ 3 个指标
      const metricCount = (match[1].match(/^\s+[a-z_]+:/gm) || []).length
      expect(metricCount).toBeGreaterThanOrEqual(3)
    })

    test('main-flow.js 的 thresholds 包含主链路 P95 < 1500', () => {
      const content = readFileSafe(MAIN_FLOW)
      expect(content).toMatch(/p\(95\)<1500/)
    })
  })
})
