/**
 * scripts/sync-cloud-common.js 测试
 * 验证同步脚本能正确识别 / 创建 / 跳过 / 更新
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SCRIPT = path.resolve(__dirname, '../scripts/sync-cloud-common.js')
const ROOT = path.resolve(__dirname, '..')

describe('scripts/sync-cloud-common.js', () => {
  // 备份原始 common 目录的快照
  let snapshot

  beforeAll(() => {
    snapshot = {}
    const source = path.join(ROOT, 'cloudfunctions', 'common')
    const sourceFiles = fs.readdirSync(source).filter(f => f.endsWith('.js'))
    for (const f of sourceFiles) {
      const srcPath = path.join(source, f)
      const content = fs.readFileSync(srcPath)
      snapshot[f] = content
    }
  })

  // 每次测试后恢复 common 目录的 md5 同步状态
  afterAll(() => {
    // 重新同步以保持一致性
    execSync(`node ${SCRIPT}`, { cwd: ROOT })
  })

  test('--check 模式在没有差异时应退出码 0', () => {
    // 先执行一次完整同步确保一致
    execSync(`node ${SCRIPT}`, { cwd: ROOT })
    // 再 check 应该无差异
    const output = execSync(`node ${SCRIPT} --check`, { cwd: ROOT, encoding: 'utf8' })
    expect(output).toMatch(/跳过\s+\d+/)
    expect(output).toMatch(/汇总：新建 0，更新 0/)
  })

  test('同步后所有 service 的 common/ 都包含源文件', () => {
    const services = fs
      .readdirSync(path.join(ROOT, 'cloudfunctions'), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .filter(n => n !== 'common' && n !== '_shared')
      .filter(n => fs.existsSync(path.join(ROOT, 'cloudfunctions', n, 'common')))

    const sourceFiles = Object.keys(snapshot)
    expect(services.length).toBeGreaterThan(0)
    for (const svc of services) {
      for (const f of sourceFiles) {
        const target = path.join(ROOT, 'cloudfunctions', svc, 'common', f)
        expect(fs.existsSync(target)).toBe(true)
      }
    }
  })

  test('同步后源文件与目标文件 md5 应一致', () => {
    const crypto = require('crypto')
    const md5 = content => crypto.createHash('md5').update(content).digest('hex')

    const sampleSvc = fs
      .readdirSync(path.join(ROOT, 'cloudfunctions'), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .find(n => n !== 'common' && n !== '_shared'
        && fs.existsSync(path.join(ROOT, 'cloudfunctions', n, 'common')))

    expect(sampleSvc).toBeDefined()
    const sampleFile = Object.keys(snapshot)[0]
    const targetPath = path.join(ROOT, 'cloudfunctions', sampleSvc, 'common', sampleFile)
    const targetContent = fs.readFileSync(targetPath)
    expect(md5(targetContent)).toBe(md5(snapshot[sampleFile]))
  })

  test('--service=<name> 只同步指定 service', () => {
    const output = execSync(`node ${SCRIPT} --service=orderService`, { cwd: ROOT, encoding: 'utf8' })
    expect(output).toMatch(/限定 service：orderService/)
    // 不会有其他 service 的更新项
    expect(output).not.toMatch(/\[新建\] \w+/)
  })

  test('文件被修改时 --check 应检测到差异并退出码 1', () => {
    const sampleSvc = 'orderService'
    const target = path.join(ROOT, 'cloudfunctions', sampleSvc, 'common', 'utils.js')
    const original = fs.readFileSync(target, 'utf8')
    const tampered = `${original}\n// tampered by test\n`
    fs.writeFileSync(target, tampered)
    try {
      let exitCode = 0
      try {
        execSync(`node ${SCRIPT} --check`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })
      } catch (e) {
        exitCode = e.status
      }
      expect(exitCode).toBe(1)
    } finally {
      // 恢复（通过脚本同步）
      execSync(`node ${SCRIPT}`, { cwd: ROOT })
    }
  })
})
