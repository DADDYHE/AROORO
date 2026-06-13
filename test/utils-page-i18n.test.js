/**
 * Sprint 17: page-i18n 助手 + codemod-page-i18n 测试
 *
 * 覆盖：
 *   1. page-i18n.mixin() 注入方法（toast / error / $t / setLocale）
 *   2. page-i18n.create() 工厂模式
 *   3. bindTData() 生成 wxml 友好的 t map
 *   4. codemod-page-i18n 替换模式
 *     - wx.showToast success → this.toast
 *     - wx.showToast none → this.error
 *     - wx.showToast 默认 → this.error
 *     - 注入 mixin
 *   5. 端到端：先 codemod 再执行替换后的代码
 */

const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT = path.join(__dirname, '..')
const PAGE_I18N_PATH = path.join(ROOT, 'utils', 'page-i18n.js')
const CODEMOD_PATH = path.join(ROOT, 'scripts', 'codemod-page-i18n.js')
const I18N_PATH = path.join(ROOT, 'utils', 'i18n.js')

const pageI18n = require(PAGE_I18N_PATH)
const { transform, ZH_LOOKUP } = require(CODEMOD_PATH)

const mockStorage = {}
let mockWxCalls = []

function resetWx() {
  mockWxCalls = []
  global.wx = {
    getSystemInfoSync: () => ({ language: 'zh_CN' }),
    getStorageSync: key => mockStorage[key] || '',
    setStorageSync: (key, val) => { mockStorage[key] = val },
    showToast: opts => { mockWxCalls.push({ type: 'showToast', ...opts }) },
    showModal: opts => { mockWxCalls.push({ type: 'showModal', ...opts }) },
  }
}

function clearStorage() {
  for (const k of Object.keys(mockStorage)) {delete mockStorage[k]}
}

beforeEach(() => {
  clearStorage()
  resetWx()
  // 重置 i18n locale
  const i18n = require(I18N_PATH)
  i18n.setLocale('zh-CN')
})

describe('Sprint 17: page-i18n 助手', () => {
  describe('mixin() 注入', () => {
    test('mixin 返回 data / onLoad / 5 个方法', () => {
      const m = pageI18n.mixin()
      expect(m.data.t).toBeDefined()
      expect(typeof m.onLoad).toBe('function')
      expect(typeof m.$t).toBe('function')
      expect(typeof m.$em).toBe('function')
      expect(typeof m.toast).toBe('function')
      expect(typeof m.error).toBe('function')
      expect(typeof m.setLocale).toBe('function')
    })

    test('mixin data.t 含核心 biz 文案', () => {
      const m = pageI18n.mixin()
      expect(m.data.t.OPERATION_SUCCESS).toBe('操作成功')
      expect(m.data.t.PAYMENT_SUCCESS).toBe('支付成功')
    })

    test('$t 翻译 key', () => {
      const m = pageI18n.mixin()
      const ctx = { _getLocale: m._getLocale }
      expect(m.$t.call(ctx, 'OPERATION_SUCCESS')).toBe('操作成功')
    })

    test('toast 触发 wx.showToast (success icon)', () => {
      const m = pageI18n.mixin()
      m.toast('OPERATION_SUCCESS')
      expect(mockWxCalls).toHaveLength(1)
      expect(mockWxCalls[0].type).toBe('showToast')
      expect(mockWxCalls[0].title).toBe('操作成功')
      expect(mockWxCalls[0].icon).toBe('success')
    })

    test('error 触发 wx.showToast (none icon)', () => {
      const m = pageI18n.mixin()
      m.error('NETWORK_ERROR')
      expect(mockWxCalls).toHaveLength(1)
      expect(mockWxCalls[0].icon).toBe('none')
    })

    test('toast 支持覆盖 icon', () => {
      const m = pageI18n.mixin()
      m.toast('OPERATION_SUCCESS', { icon: 'loading' })
      expect(mockWxCalls[0].icon).toBe('loading')
    })
  })

  describe('create() 工厂模式', () => {
    test('create 返回 6 个方法', () => {
      const app = { globalData: { locale: 'en-US' } }
      const p = pageI18n.create(app)
      expect(typeof p.t).toBe('function')
      expect(typeof p.getErrorMessage).toBe('function')
      expect(typeof p.getLocale).toBe('function')
      expect(typeof p.setLocale).toBe('function')
      expect(typeof p.showToast).toBe('function')
      expect(typeof p.showError).toBe('function')
    })

    test('create 使用 app.globalData.locale', () => {
      const app = { globalData: { locale: 'en-US' } }
      const p = pageI18n.create(app)
      expect(p.getLocale()).toBe('en-US')
      expect(p.t('OPERATION_SUCCESS')).toBe('Success')
    })

    test('create.setLocale 同步到 app', () => {
      const app = { globalData: { locale: 'zh-CN' } }
      const p = pageI18n.create(app)
      p.setLocale('ja-JP')
      expect(app.globalData.locale).toBe('ja-JP')
    })

    test('create.showToast', () => {
      const app = { globalData: { locale: 'zh-CN' } }
      const p = pageI18n.create(app)
      p.showToast('OPERATION_SUCCESS')
      expect(mockWxCalls[0].title).toBe('操作成功')
    })

    test('create.showError 用 none icon', () => {
      const app = { globalData: { locale: 'zh-CN' } }
      const p = pageI18n.create(app)
      p.showError('NETWORK_ERROR')
      expect(mockWxCalls[0].icon).toBe('none')
    })
  })

  describe('bindTData() wxml 友好', () => {
    test('生成 t map（zh-CN）', () => {
      const map = pageI18n.buildTMap('zh-CN')
      expect(map.OPERATION_SUCCESS).toBe('操作成功')
      expect(map.AUTH_REQUIRED).toBe('请先登录')
    })

    test('生成 t map（en-US）', () => {
      const map = pageI18n.buildTMap('en-US')
      expect(map.OPERATION_SUCCESS).toBe('Success')
      expect(map.AUTH_REQUIRED).toBe('Please sign in first')
    })

    test('biz 与 error 都包含', () => {
      const map = pageI18n.buildTMap('zh-CN')
      // 业务文案
      expect(map.PAYMENT_SUCCESS).toBe('支付成功')
      // 错误码
      expect(map.RISK_REJECT).toBe('请求被风控拒绝')
    })

    test('create().bindTData() 等价 buildTMap', () => {
      const app = { globalData: { locale: 'ja-JP' } }
      const p = pageI18n.create(app)
      const map = p.bindTData()
      expect(map.OPERATION_SUCCESS).toBe('操作成功') // ja-JP fall back
    })
  })
})

// =====================================================================
// codemod 测试
// =====================================================================

describe('Sprint 17: codemod-page-i18n', () => {
  let tmpDir
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-test-'))
  })
  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function makeFile(name, content) {
    const p = path.join(tmpDir, name)
    fs.writeFileSync(p, content)
    return p
  }

  test('替换 wx.showToast(success) → this.toast', () => {
    const p = makeFile('a.js', 'Page({\n  onLoad() {\n    wx.showToast({ title: \'操作成功\', icon: \'success\' })\n  }\n})')
    const r = transform(p)
    expect(r.changed).toBe(true)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/this\.toast\('OPERATION_SUCCESS'\)/)
    expect(out).toMatch(/pageI18n\.mixin/)
  })

  test('替换 wx.showToast(none) → this.error', () => {
    const p = makeFile('b.js', 'Page({\n  onLoad() {\n    wx.showToast({ title: \'参数错误\', icon: \'none\' })\n  }\n})')
    const r = transform(p)
    expect(r.changed).toBe(true)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/this\.error\('INVALID_PARAMS'\)/)
  })

  test('替换 wx.showToast 默认 → this.error', () => {
    const p = makeFile('c.js', 'Page({\n  onLoad() {\n    wx.showToast({ title: \'加载失败\' })\n  }\n})')
    const r = transform(p)
    expect(r.changed).toBe(true)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/this\.error\('LOAD_FAILED'\)/)
  })

  test('不替换未注册的中文文案', () => {
    const p = makeFile('d.js', 'Page({\n  onLoad() {\n    wx.showToast({ title: \'一些未注册的中文\' })\n  }\n})')
    const r = transform(p)
    expect(r.changed).toBe(false)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/wx\.showToast/)
  })

  test('自动注入 mixin 与 require', () => {
    const p = makeFile('e.js', 'Page({\n  onLoad() {\n    wx.showToast({ title: \'加载中...\' })\n  }\n})')
    const r = transform(p)
    expect(r.changed).toBe(true)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/page-i18n/)
    expect(out).toMatch(/\.\.\.pageI18n\.mixin\(\)/)
  })

  test('subpackages 路径推断', () => {
    const sub = path.join(tmpDir, 'subpackages', 'mall')
    fs.mkdirSync(sub, { recursive: true })
    const p = path.join(sub, 'cart.js')
    fs.writeFileSync(p, 'Page({\n  onLoad() {\n    wx.showToast({ title: \'加载中...\' })\n  }\n})')
    transform(p)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/page-i18n/)
    // 相对路径应以 ./ 开头或 .. 开头
    expect(out).toMatch(/require\(['"][./]+/)
  })

  test('不重复注入（已有 mixin 时跳过）', () => {
    const p = makeFile('f.js', 'const pageI18n = require(\'../../utils/page-i18n\')\nPage({\n  ...pageI18n.mixin(),\n  onLoad() {\n    wx.showToast({ title: \'操作成功\', icon: \'success\' })\n  }\n})')
    const r = transform(p)
    expect(r.changed).toBe(true)
    const out = fs.readFileSync(p, 'utf8')
    // 只有一个 ...pageI18n.mixin()
    const matches = out.match(/\.\.\.pageI18n\.mixin\(\)/g) || []
    expect(matches.length).toBe(1)
  })

  test('dry-run 不写文件', () => {
    const p = makeFile('g.js', 'Page({\n  onLoad() {\n    wx.showToast({ title: \'操作成功\', icon: \'success\' })\n  }\n})')
    const orig = fs.readFileSync(p, 'utf8')
    const r = transform(p, { dryRun: true })
    expect(r.changed).toBe(true)
    const after = fs.readFileSync(p, 'utf8')
    expect(after).toBe(orig)
  })

  test('ZH_LOOKUP 包含 BIZ_I18N zh-CN + 错误码 zh-CN', () => {
    expect(ZH_LOOKUP['操作成功']).toBe('OPERATION_SUCCESS')
    expect(ZH_LOOKUP['加载中...']).toBe('LOADING')
    expect(ZH_LOOKUP['参数错误']).toBe('INVALID_PARAMS')
    expect(ZH_LOOKUP['订单不存在']).toBe('ORDER_NOT_FOUND')
  })
})

// =====================================================================
// 端到端：模拟 codemod 替换后的代码可执行
// =====================================================================

describe('Sprint 17: 端到端 codemod + i18n', () => {
  test('替换后的代码调用 toast() 走 i18n 翻译', () => {
    const { transform: runTransform } = require(CODEMOD_PATH)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'))
    const p = path.join(tmpDir, 'page.js')
    fs.writeFileSync(p, 'Page({\n  onLoad() {\n    wx.showToast({ title: \'操作成功\', icon: \'success\' })\n    wx.showToast({ title: \'参数错误\', icon: \'none\' })\n  }\n})')
    runTransform(p)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/this\.toast\('OPERATION_SUCCESS'\)/)
    expect(out).toMatch(/this\.error\('INVALID_PARAMS'\)/)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('切换 locale 后文案变化', () => {
    const i18n = require(I18N_PATH)
    i18n.setLocale('zh-CN')
    expect(i18n.t('OPERATION_SUCCESS')).toBe('操作成功')
    i18n.setLocale('en-US')
    expect(i18n.t('OPERATION_SUCCESS')).toBe('Success')
    i18n.setLocale('ja-JP')
    expect(i18n.t('OPERATION_SUCCESS')).toBe('操作成功') // fallback
  })
})

// =====================================================================
// Sprint 18: 新方法（errorDynamic / toastDynamic / 函数形式）
// =====================================================================

describe('Sprint 18: page-i18n 动态错误方法', () => {
  describe('errorDynamic()', () => {
    test('text 存在时优先使用 text', () => {
      const m = pageI18n.mixin()
      m.errorDynamic('自定义错误', 'OPERATION_FAILED')
      expect(mockWxCalls).toHaveLength(1)
      expect(mockWxCalls[0].title).toBe('自定义错误')
      expect(mockWxCalls[0].icon).toBe('none')
    })

    test('text 为空时 fallback 到 i18n key', () => {
      const m = pageI18n.mixin()
      m.errorDynamic('', 'OPERATION_FAILED')
      expect(mockWxCalls[0].title).toBe('操作失败')
    })

    test('text 为 null/undefined 时 fallback', () => {
      const m = pageI18n.mixin()
      m.errorDynamic(null, 'OPERATION_FAILED')
      expect(mockWxCalls[0].title).toBe('操作失败')
      m.errorDynamic(undefined, 'OPERATION_FAILED')
      expect(mockWxCalls[1].title).toBe('操作失败')
    })

    test('支持 duration 等 opts', () => {
      const m = pageI18n.mixin()
      m.errorDynamic('x', 'OPERATION_FAILED', { duration: 5000 })
      expect(mockWxCalls[0].duration).toBe(5000)
    })
  })

  describe('toastDynamic()', () => {
    test('text 优先 / 空时 fallback', () => {
      const m = pageI18n.mixin()
      m.toastDynamic('done', 'OPERATION_SUCCESS')
      expect(mockWxCalls[0].title).toBe('done')
      expect(mockWxCalls[0].icon).toBe('success')
      m.toastDynamic('', 'OPERATION_SUCCESS')
      expect(mockWxCalls[1].title).toBe('操作成功')
    })
  })

  describe('函数形式', () => {
    test('toast(fn) 调用 fn 取文案', () => {
      const m = pageI18n.mixin()
      m.toast(() => 'dynamic text')
      expect(mockWxCalls[0].title).toBe('dynamic text')
    })

    test('error(fn) 走 none icon', () => {
      const m = pageI18n.mixin()
      m.error(() => 'something failed')
      expect(mockWxCalls[0].title).toBe('something failed')
      expect(mockWxCalls[0].icon).toBe('none')
    })
  })
})

// =====================================================================
// Sprint 18: codemod 新模式
// =====================================================================

describe('Sprint 18: codemod 新模式', () => {
  let tmpDir
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-s18-'))
  })
  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('多行 wx.showToast 替换', () => {
    const p = path.join(tmpDir, 'multi.js')
    fs.writeFileSync(p, 'Page({\n  onLoad() {\n    wx.showToast({\n      title: \'加载失败\',\n      icon: \'none\'\n    })\n  }\n})')
    transform(p)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/this\.error\('LOAD_FAILED'\)/)
  })

  test('动态 fallback: err.message || "X" → errorDynamic', () => {
    const p = path.join(tmpDir, 'dyn.js')
    fs.writeFileSync(p, 'Page({\n  onLoad() {\n    wx.showToast({ title: err.message || \'加载失败\', icon: \'none\' })\n  }\n})')
    transform(p)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/this\.errorDynamic\(err\.message,\s*'LOAD_FAILED'\)/)
  })

  test('字符串拼接: "X：" + expr → 函数形式', () => {
    const p = path.join(tmpDir, 'concat.js')
    fs.writeFileSync(p, 'Page({\n  onLoad() {\n    wx.showToast({ title: \'操作失败：\' + error.message, icon: \'none\' })\n  }\n})')
    transform(p)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/this\.error\(\(\) => '操作失败：' \+ error\.message\)/)
  })

  test('裸表达式: err.message → 函数形式', () => {
    const p = path.join(tmpDir, 'bare.js')
    fs.writeFileSync(p, 'Page({\n  onLoad() {\n    wx.showToast({ title: payErr.message, icon: \'none\', duration: 3000 })\n  }\n})')
    transform(p)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/this\.error\(\(\) => payErr\.message/)
    expect(out).toMatch(/duration: 3000/)
  })

  test('三元: cond ? "A" : "B" → 翻译 + 函数形式', () => {
    const p = path.join(tmpDir, 'ternary.js')
    fs.writeFileSync(p, 'Page({\n  onLoad() {\n    wx.showToast({ title: isEdit ? \'已保存\' : \'已发布\', icon: \'success\' })\n  }\n})')
    transform(p)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/this\.toast\(\(\) => isEdit \? 'SAVED' : 'PUBLISHED'\)/)
  })

  test('模板字符串: 整段无 key → 函数形式', () => {
    const p = path.join(tmpDir, 'tpl.js')
    fs.writeFileSync(p, 'Page({\n  onLoad() {\n    wx.showToast({ title: `已添加「${pet.name}」`, icon: \'success\' })\n  }\n})')
    transform(p)
    const out = fs.readFileSync(p, 'utf8')
    expect(out).toMatch(/this\.toast\(\(\) =>/)
  })
})
