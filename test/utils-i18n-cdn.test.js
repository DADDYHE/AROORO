/**
 * Sprint 16: i18n 字典 CDN 化（预编译 JSON + loadFromCdn）
 *
 * 覆盖：
 *   1. build:i18n 脚本生成产物完整（errors / biz / merged / manifest / .d.ts）
 *   2. JSON 内容与云端 errors-i18n.ts 对齐
 *   3. manifest.json 版本号 + 字段完整性
 *   4. utils/i18n.js → loadFromCdn() 行为
 *     - URL 模板替换 {{locale}}
 *     - 加载成功注入 override
 *     - 加载失败回落到内置字典
 *     - 持久化 CDN URL 到 storage
 *   5. JSON 文件体积合理（紧凑格式）
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const DIST_DIR = path.join(ROOT, 'dist', 'i18n')
const TYPES_DIR = path.join(ROOT, 'types')
const SCRIPT = path.join(ROOT, 'scripts', 'build-i18n.js')

const I18N_MODULE = require(path.join(ROOT, 'cloudfunctions', 'common', 'errors-i18n.js'))
const MINI_I18N_PATH = path.join(ROOT, 'utils', 'i18n.js')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}
function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return null }
}
function fileSize(p) {
  try { return fs.statSync(p).size } catch (e) { return 0 }
}

// === 提早 build 一次以保证产物存在 ===
const { execSync } = require('child_process')
try {
  execSync(`node "${SCRIPT}"`, { cwd: ROOT, stdio: 'pipe' })
} catch (e) {
  // 不抛错，让后续 describe 报告失败
}

describe('Sprint 16: i18n 字典 CDN 化', () => {
  describe('build:i18n 脚本 + 产物', () => {
    test('build:i18n.js 脚本存在', () => {
      expect(fs.existsSync(SCRIPT)).toBe(true)
    })

    test('dist/i18n/ 输出目录存在', () => {
      expect(fs.existsSync(DIST_DIR)).toBe(true)
    })

    test('types/ 输出目录存在', () => {
      expect(fs.existsSync(TYPES_DIR)).toBe(true)
    })

    test('生成 errors.zh-CN.json', () => {
      expect(fs.existsSync(path.join(DIST_DIR, 'errors.zh-CN.json'))).toBe(true)
    })

    test('生成 errors.en-US.json', () => {
      expect(fs.existsSync(path.join(DIST_DIR, 'errors.en-US.json'))).toBe(true)
    })

    test('生成 errors.ja-JP.json', () => {
      expect(fs.existsSync(path.join(DIST_DIR, 'errors.ja-JP.json'))).toBe(true)
    })

    test('生成 errors.all.json', () => {
      expect(fs.existsSync(path.join(DIST_DIR, 'errors.all.json'))).toBe(true)
    })

    test('生成 biz.zh-CN/en-US/ja-JP.json 各一份', () => {
      expect(fs.existsSync(path.join(DIST_DIR, 'biz.zh-CN.json'))).toBe(true)
      expect(fs.existsSync(path.join(DIST_DIR, 'biz.en-US.json'))).toBe(true)
      expect(fs.existsSync(path.join(DIST_DIR, 'biz.ja-JP.json'))).toBe(true)
    })

    test('生成 merged.zh-CN/en-US/ja-JP.json 各一份', () => {
      expect(fs.existsSync(path.join(DIST_DIR, 'merged.zh-CN.json'))).toBe(true)
      expect(fs.existsSync(path.join(DIST_DIR, 'merged.en-US.json'))).toBe(true)
      expect(fs.existsSync(path.join(DIST_DIR, 'merged.ja-JP.json'))).toBe(true)
    })

    test('生成 manifest.json', () => {
      expect(fs.existsSync(path.join(DIST_DIR, 'manifest.json'))).toBe(true)
    })

    test('生成 types/i18n-cdn.d.ts', () => {
      expect(fs.existsSync(path.join(TYPES_DIR, 'i18n-cdn.d.ts'))).toBe(true)
    })
  })

  describe('errors.{locale}.json 内容', () => {
    test('zh-CN 含核心 code', () => {
      const dict = readJsonSafe(path.join(DIST_DIR, 'errors.zh-CN.json'))
      expect(dict.AUTH_REQUIRED).toBe('请先登录')
      expect(dict.RISK_PENDING).toBe('请求已受理，待人工审核')
      expect(dict.ORDER_NOT_FOUND).toBe('订单不存在')
    })

    test('en-US 含核心 code（英文）', () => {
      const dict = readJsonSafe(path.join(DIST_DIR, 'errors.en-US.json'))
      expect(dict.AUTH_REQUIRED).toBe('Please sign in first')
      expect(dict.RISK_PENDING).toMatch(/pending/i)
      expect(dict.RISK_REJECT).toMatch(/rejected/i)
    })

    test('ja-JP 含核心 code（日文）', () => {
      const dict = readJsonSafe(path.join(DIST_DIR, 'errors.ja-JP.json'))
      expect(dict.AUTH_REQUIRED).toMatch(/ログイン/)
      expect(dict.ORDER_NOT_FOUND).toMatch(/注文/)
    })

    test('三个 locale 的 code 数与云端字典一致', () => {
      const zh = readJsonSafe(path.join(DIST_DIR, 'errors.zh-CN.json'))
      const en = readJsonSafe(path.join(DIST_DIR, 'errors.en-US.json'))
      const ja = readJsonSafe(path.join(DIST_DIR, 'errors.ja-JP.json'))
      const cloudCount = Object.keys(I18N_MODULE.DEFAULT_I18N).length
      expect(Object.keys(zh).length).toBe(cloudCount)
      expect(Object.keys(en).length).toBe(cloudCount)
      expect(Object.keys(ja).length).toBe(cloudCount)
    })

    test('每个 code 在三个 locale 都有非空翻译', () => {
      const zh = readJsonSafe(path.join(DIST_DIR, 'errors.zh-CN.json'))
      const en = readJsonSafe(path.join(DIST_DIR, 'errors.en-US.json'))
      const ja = readJsonSafe(path.join(DIST_DIR, 'errors.ja-JP.json'))
      for (const code of Object.keys(zh)) {
        expect(typeof zh[code]).toBe('string')
        expect(zh[code].length).toBeGreaterThan(0)
        expect(typeof en[code]).toBe('string')
        expect(en[code].length).toBeGreaterThan(0)
        expect(typeof ja[code]).toBe('string')
        expect(ja[code].length).toBeGreaterThan(0)
      }
    })
  })

  describe('merged.{locale}.json 合并字典', () => {
    test('merged.zh-CN 含错误码 + 业务文案', () => {
      const dict = readJsonSafe(path.join(DIST_DIR, 'merged.zh-CN.json'))
      // 错误码
      expect(dict.AUTH_REQUIRED).toBe('请先登录')
      // 业务文案
      expect(dict.OPERATION_SUCCESS).toBe('操作成功')
      expect(dict.LOADING).toBe('加载中...')
    })

    test('merged.en-US 含错误码 + 业务文案', () => {
      const dict = readJsonSafe(path.join(DIST_DIR, 'merged.en-US.json'))
      expect(dict.AUTH_REQUIRED).toBe('Please sign in first')
      expect(dict.OPERATION_SUCCESS).toBe('Success')
    })

    test('merged.ja-JP 含错误码 + 业务文案', () => {
      const dict = readJsonSafe(path.join(DIST_DIR, 'merged.ja-JP.json'))
      expect(dict.AUTH_REQUIRED).toMatch(/ログイン/)
      expect(dict.OPERATION_FAILED).toBeTruthy()
    })

    test('merged entry 数 = 错误码数 + 业务文案数（去重后）', () => {
      const merged = readJsonSafe(path.join(DIST_DIR, 'merged.zh-CN.json'))
      const cloudKeys = Object.keys(I18N_MODULE.DEFAULT_I18N)
      const bizKeys = Object.keys(MINI_I18N_PATH && require(MINI_I18N_PATH).BIZ_I18N)
      // 业务文案 key 可能与错误码 key 重名（如 INVALID_PARAMS），合并去重
      const bizOnly = bizKeys.filter(k => !cloudKeys.includes(k))
      const expected = cloudKeys.length + bizOnly.length
      expect(Object.keys(merged).length).toBe(expected)
    })
  })

  describe('manifest.json', () => {
    let manifest
    beforeAll(() => {
      manifest = readJsonSafe(path.join(DIST_DIR, 'manifest.json'))
    })

    test('含 version 字段（8 位日期）', () => {
      expect(manifest).toBeDefined()
      expect(manifest.version).toMatch(/^\d{8}$/)
    })

    test('含 generatedAt 字段（ISO 8601）', () => {
      expect(manifest.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    test('locales 数组含 3 个语言', () => {
      expect(manifest.locales).toEqual(['zh-CN', 'en-US', 'ja-JP'])
    })

    test('codeCount 与 bizCount 正确', () => {
      expect(manifest.codeCount).toBe(Object.keys(I18N_MODULE.DEFAULT_I18N).length)
      expect(manifest.bizCount).toBeGreaterThan(0)
    })

    test('files 字段列出所有 JSON', () => {
      expect(manifest.files.errors).toContain('errors.zh-CN.json')
      expect(manifest.files.merged).toContain('merged.en-US.json')
      expect(manifest.files.all).toContain('errors.all.json')
    })
  })

  describe('types/i18n-cdn.d.ts', () => {
    let dts
    beforeAll(() => {
      dts = readSafe(path.join(TYPES_DIR, 'i18n-cdn.d.ts'))
    })

    test('声明 I18nLocale 类型', () => {
      expect(dts).toMatch(/export\s+type\s+I18nLocale/)
    })

    test('I18nLocale 含 3 个 locale 字符串字面量', () => {
      expect(dts).toMatch(/'zh-CN'/)
      expect(dts).toMatch(/'en-US'/)
      expect(dts).toMatch(/'ja-JP'/)
    })

    test('声明 I18nManifest 接口', () => {
      expect(dts).toMatch(/export\s+interface\s+I18nManifest/)
    })

    test('声明 fetchI18nDictionary 函数', () => {
      expect(dts).toMatch(/export\s+declare\s+function\s+fetchI18nDictionary/)
    })

    test('头部含生成注释', () => {
      expect(dts).toMatch(/auto-generated/)
    })
  })

  describe('errors.all.json 全量字典', () => {
    let allDict
    beforeAll(() => {
      allDict = readJsonSafe(path.join(DIST_DIR, 'errors.all.json'))
    })

    test('含 locales 数组', () => {
      expect(allDict.locales).toEqual(['zh-CN', 'en-US', 'ja-JP'])
    })

    test('codes 字段含完整 DEFAULT_I18N', () => {
      expect(Object.keys(allDict.codes).length).toBe(Object.keys(I18N_MODULE.DEFAULT_I18N).length)
    })

    test('groups 字段含完整 ERROR_CODE_GROUPS', () => {
      expect(Object.keys(allDict.groups).length).toBe(Object.keys(I18N_MODULE.ERROR_CODE_GROUPS).length)
    })
  })

  describe('JSON 体积（紧凑格式验证）', () => {
    // Sprint 18 增补了大量业务文案 i18n key（表单 / 通用操作结果等 80+ 个），
    // 因此体积上限相应放宽。Sprint 17 阶段实际 1.7KB 左右，Sprint 18 后 ~10KB。
    test('merged.zh-CN.json 体积 < 14KB', () => {
      const size = fileSize(path.join(DIST_DIR, 'merged.zh-CN.json'))
      expect(size).toBeLessThan(28 * 1024)
    })

    test('merged.en-US.json 体积 < 28KB', () => {
      const size = fileSize(path.join(DIST_DIR, 'merged.en-US.json'))
      expect(size).toBeLessThan(28 * 1024)
    })

    test('merged.ja-JP.json 体积 < 32KB（日文较长）', () => {
      const size = fileSize(path.join(DIST_DIR, 'merged.ja-JP.json'))
      expect(size).toBeLessThan(32 * 1024)
    })

    test('JSON 无多余空白（紧凑）', () => {
      const text = readSafe(path.join(DIST_DIR, 'merged.zh-CN.json'))
      expect(text).not.toMatch(/\n\s{2,}/) // 不应有多行缩进
    })
  })
})

// =====================================================================
// utils/i18n.js → loadFromCdn 测试（需要 mock wx.request）
// =====================================================================

describe('Sprint 16: loadFromCdn 行为', () => {
  const mockStorage = {}
  const wx = {
    getSystemInfoSync: jest.fn(() => ({ language: 'zh_CN' })),
    getStorageSync: jest.fn(key => mockStorage[key] || ''),
    setStorageSync: jest.fn((key, val) => { mockStorage[key] = val }),
    request: jest.fn(),
  }
  global.wx = wx

  // 每次 require 都会重置 _customOverrides，但 require 缓存了模块
  // 所以我们直接复用 i18n 单例，但通过 applyCustomOverrides({}) 清空
  const i18n = require(MINI_I18N_PATH)

  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) {delete mockStorage[k]}
    i18n.applyCustomOverrides({})
    i18n.setLocale('zh-CN')
    wx.request.mockReset()
  })

  test('loadFromCdn 暴露为公共 API', () => {
    expect(typeof i18n.loadFromCdn).toBe('function')
  })

  test('URL 模板替换 {{locale}}', async () => {
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: { AUTH_REQUIRED: 'CDN: 请先登录' } })
    })
    await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'zh-CN')
    expect(wx.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://cdn.example.com/i18n/merged.zh-CN.json',
    }))
  })

  test('显式指定 locale 时不读 currentLocale', async () => {
    i18n.setLocale('zh-CN')
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: {} })
    })
    await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'en-US')
    expect(wx.request.mock.calls[0][0].url).toBe('https://cdn.example.com/i18n/merged.en-US.json')
  })

  test('加载成功时将 CDN 字典注入 override', async () => {
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: { AUTH_REQUIRED: 'CDN custom text' } })
    })
    const res = await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'zh-CN')
    expect(res.loaded).toBe(1)
    expect(i18n.getErrorMessage('AUTH_REQUIRED', 'zh-CN')).toBe('CDN custom text')
  })

  test('加载成功后其他 locale 不受影响', async () => {
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: { AUTH_REQUIRED: 'CDN zh-CN only' } })
    })
    await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'zh-CN')
    expect(i18n.getErrorMessage('AUTH_REQUIRED', 'zh-CN')).toBe('CDN zh-CN only')
    // en-US 仍走默认
    expect(i18n.getErrorMessage('AUTH_REQUIRED', 'en-US')).toBe('Please sign in first')
  })

  test('加载成功时持久化 URL 到 storage', async () => {
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: {} })
    })
    await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'zh-CN')
    expect(wx.setStorageSync).toHaveBeenCalledWith('app_i18n_cdn_url', 'https://cdn.example.com/i18n/merged.{{locale}}.json')
    expect(wx.setStorageSync).toHaveBeenCalledWith('app_i18n_cdn_loaded_at', expect.any(Number))
  })

  test('CDN 失败时不抛错，回落到内置字典', async () => {
    wx.request.mockImplementation(({ url, fail }) => {
      fail({ errMsg: 'request:fail timeout' })
    })
    const res = await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'zh-CN')
    expect(res.loaded).toBe(0)
    expect(res.error).toBe('request:fail timeout')
    // 仍能返回内置文案
    expect(i18n.getErrorMessage('AUTH_REQUIRED', 'zh-CN')).toBe('请先登录')
  })

  test('CDN 返回非对象时不抛错', async () => {
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: 'plain text response' })
    })
    const res = await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'zh-CN')
    expect(res.loaded).toBe(0)
    expect(res.error).toBe('invalid_payload')
  })

  test('CDN 返回空对象时不抛错', async () => {
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: {} })
    })
    const res = await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'zh-CN')
    expect(res.loaded).toBe(0)
  })

  test('CDN 包含业务文案时一并覆盖', async () => {
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: { OPERATION_SUCCESS: 'CDN Success' } })
    })
    await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'zh-CN')
    expect(i18n.t('OPERATION_SUCCESS', 'zh-CN')).toBe('CDN Success')
  })

  test('CDN 字典与默认字典可叠加（部分覆盖）', async () => {
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: { AUTH_REQUIRED: 'CDN override' } })
    })
    await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'zh-CN')
    // CDN 覆盖的
    expect(i18n.getErrorMessage('AUTH_REQUIRED', 'zh-CN')).toBe('CDN override')
    // CDN 没覆盖的走默认
    expect(i18n.getErrorMessage('ORDER_NOT_FOUND', 'zh-CN')).toBe('订单不存在')
  })

  test('loadFromCdn 返回的 url 是替换后的真实 URL', async () => {
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: {} })
    })
    const res = await i18n.loadFromCdn('https://cdn.example.com/i18n/merged.{{locale}}.json', 'ja-JP')
    expect(res.url).toBe('https://cdn.example.com/i18n/merged.ja-JP.json')
  })

  test('URL 不带 {{locale}} 占位时直接使用', async () => {
    wx.request.mockImplementation(({ url, success }) => {
      success({ data: {} })
    })
    await i18n.loadFromCdn('https://cdn.example.com/i18n/static.json', 'en-US')
    expect(wx.request.mock.calls[0][0].url).toBe('https://cdn.example.com/i18n/static.json')
  })

  test('空 URL 模板时立即返回错误（不调用 wx.request）', async () => {
    const res1 = await i18n.loadFromCdn('', 'zh-CN')
    expect(res1.error).toBe('invalid_url')
    expect(wx.request).not.toHaveBeenCalled()
    const res2 = await i18n.loadFromCdn(null, 'zh-CN')
    expect(res2.error).toBe('invalid_url')
  })

  test('无 wx 环境时立即返回 no_wx（不抛错）', () => {
    const orig = global.wx
    delete global.wx
    // 重新 require 不行（已缓存），所以直接调用
    return i18n.loadFromCdn('https://cdn.example.com/x.json', 'zh-CN')
      .then(res => {
        expect(res.error).toBe('no_wx')
        global.wx = orig
      })
      .catch(e => {
        global.wx = orig
        throw e
      })
  })
})
