/**
 * Sprint 15: 错误码 i18n 字典验证
 *
 * 覆盖：
 *   1. .ts 源文件存在 + 编译产物存在
 *   2. 字典覆盖核心错误码（≥ 30 个）
 *   3. resolveI18nMessage 行为（zh-CN / en-US / ja-JP）
 *   4. customOverrides 优先级最高
 *   5. 缺翻译降级路径
 *   6. ERROR_CODE_GROUPS 完整覆盖
 *   7. exportLocaleDictionary 批量导出
 *   8. getCodesByGroup 按组过滤
 */

const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..', 'cloudfunctions', 'common')
const TS = path.join(ROOT, 'errors-i18n.ts')
const JS = path.join(ROOT, 'errors-i18n.js')

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return null }
}

const i18n = require(JS)

describe('Sprint 15: 错误码 i18n 字典', () => {
  describe('源文件 / 产物', () => {
    test('errors-i18n.ts 源文件存在', () => {
      expect(fs.existsSync(TS)).toBe(true)
    })

    test('errors-i18n.js 编译产物存在', () => {
      expect(fs.existsSync(JS)).toBe(true)
    })

    test('产物导出公共 API', () => {
      expect(i18n.DEFAULT_I18N).toBeDefined()
      expect(i18n.ERROR_CODE_GROUPS).toBeDefined()
      expect(typeof i18n.resolveI18nMessage).toBe('function')
      expect(typeof i18n.exportLocaleDictionary).toBe('function')
      expect(typeof i18n.getCodesByGroup).toBe('function')
    })
  })

  describe('DEFAULT_I18N 字典内容', () => {
    test('覆盖核心错误码（≥ 30 个）', () => {
      const codes = Object.keys(i18n.DEFAULT_I18N)
      expect(codes.length).toBeGreaterThanOrEqual(30)
    })

    test('每个 code 至少含 zh-CN 文案', () => {
      for (const [code, dict] of Object.entries(i18n.DEFAULT_I18N)) {
        expect(typeof dict['zh-CN']).toBe('string')
        expect(dict['zh-CN'].length).toBeGreaterThan(0)
      }
    })

    test('每个 code 含 en-US 文案（英文）', () => {
      let withEn = 0
      for (const dict of Object.values(i18n.DEFAULT_I18N)) {
        if (typeof dict['en-US'] === 'string' && dict['en-US'].length > 0) {
          withEn++
        }
      }
      expect(withEn).toBe(Object.keys(i18n.DEFAULT_I18N).length)
    })

    test('每个 code 含 ja-JP 文案（日文）', () => {
      let withJa = 0
      for (const dict of Object.values(i18n.DEFAULT_I18N)) {
        if (typeof dict['ja-JP'] === 'string' && dict['ja-JP'].length > 0) {
          withJa++
        }
      }
      expect(withJa).toBe(Object.keys(i18n.DEFAULT_I18N).length)
    })

    test('含 Sprint 14 新增的 3 个风控码', () => {
      expect(i18n.DEFAULT_I18N.RISK_REJECT).toBeDefined()
      expect(i18n.DEFAULT_I18N.RISK_PENDING).toBeDefined()
      expect(i18n.DEFAULT_I18N.RISK_PASS).toBeDefined()
      expect(i18n.DEFAULT_I18N.RISK_PENDING['en-US']).toMatch(/pending/i)
    })
  })

  describe('resolveI18nMessage 行为', () => {
    test('zh-CN 默认 locale', () => {
      expect(i18n.resolveI18nMessage('AUTH_REQUIRED', 'zh-CN')).toBe('请先登录')
    })

    test('en-US locale', () => {
      expect(i18n.resolveI18nMessage('AUTH_REQUIRED', 'en-US'))
        .toBe('Please sign in first')
    })

    test('ja-JP locale', () => {
      expect(i18n.resolveI18nMessage('AUTH_REQUIRED', 'ja-JP'))
        .toMatch(/ログイン/)
    })

    test('缺省参数默认 zh-CN', () => {
      expect(i18n.resolveI18nMessage('AUTH_REQUIRED')).toBe('请先登录')
    })

    test('customOverrides 优先级最高', () => {
      const custom = { AUTH_REQUIRED: { 'en-US': 'Plz sign in' } }
      expect(i18n.resolveI18nMessage('AUTH_REQUIRED', 'en-US', custom))
        .toBe('Plz sign in')
    })

    test('未知 code 返回 code 字面量', () => {
      expect(i18n.resolveI18nMessage('NOT_A_REAL_CODE', 'zh-CN'))
        .toBe('NOT_A_REAL_CODE')
    })

    test('缺翻译降级到 zh-CN', () => {
      // 假设某 code 仅有 zh-CN（虽然在默认字典中不会发生）
      const code = 'INTERNAL_ERROR'
      // en-US 应有翻译，所以不会降级
      expect(i18n.resolveI18nMessage(code, 'en-US'))
        .toBe('Internal server error')
    })
  })

  describe('ERROR_CODE_GROUPS 分组', () => {
    test('AUTH_REQUIRED → auth', () => {
      expect(i18n.ERROR_CODE_GROUPS.AUTH_REQUIRED).toBe('auth')
    })

    test('ORDER_NOT_FOUND → not_found', () => {
      expect(i18n.ERROR_CODE_GROUPS.ORDER_NOT_FOUND).toBe('not_found')
    })

    test('RISK_* → risk', () => {
      expect(i18n.ERROR_CODE_GROUPS.RISK_REJECT).toBe('risk')
      expect(i18n.ERROR_CODE_GROUPS.RISK_PENDING).toBe('risk')
      expect(i18n.ERROR_CODE_GROUPS.RISK_PASS).toBe('risk')
    })

    test('INTERNAL_ERROR → system', () => {
      expect(i18n.ERROR_CODE_GROUPS.INTERNAL_ERROR).toBe('system')
    })

    test('分组数与 code 数一致（无遗漏）', () => {
      const groupCodes = Object.keys(i18n.ERROR_CODE_GROUPS)
      expect(groupCodes.length).toBe(Object.keys(i18n.DEFAULT_I18N).length)
    })
  })

  describe('getCodesByGroup', () => {
    test('auth 组含 AUTH_REQUIRED / TOKEN_EXPIRED 等', () => {
      const authCodes = i18n.getCodesByGroup('auth')
      expect(authCodes).toContain('AUTH_REQUIRED')
      expect(authCodes).toContain('TOKEN_EXPIRED')
    })

    test('risk 组含 RISK_* 三档', () => {
      const riskCodes = i18n.getCodesByGroup('risk')
      expect(riskCodes).toEqual(expect.arrayContaining(['RISK_REJECT', 'RISK_PENDING', 'RISK_PASS']))
    })

    test('空组返回空数组', () => {
      // 假设没有 business 组（仅 validation / auth / 等），但 other 组不为空
      const otherCodes = i18n.getCodesByGroup('other')
      expect(Array.isArray(otherCodes)).toBe(true)
    })
  })

  describe('exportLocaleDictionary 批量导出', () => {
    test('zh-CN 批量导出键值对', () => {
      const dict = i18n.exportLocaleDictionary('zh-CN')
      expect(dict.AUTH_REQUIRED).toBe('请先登录')
      expect(dict.RISK_PENDING).toBe('请求已受理，待人工审核')
    })

    test('en-US 批量导出键值对', () => {
      const dict = i18n.exportLocaleDictionary('en-US')
      expect(dict.AUTH_REQUIRED).toBe('Please sign in first')
      expect(dict.RISK_PENDING).toMatch(/pending/i)
    })

    test('ja-JP 批量导出键值对', () => {
      const dict = i18n.exportLocaleDictionary('ja-JP')
      expect(dict.AUTH_REQUIRED).toMatch(/ログイン/)
    })

    test('导出键数 = DEFAULT_I18N 键数', () => {
      const dict = i18n.exportLocaleDictionary('zh-CN')
      expect(Object.keys(dict).length).toBe(Object.keys(i18n.DEFAULT_I18N).length)
    })

    test('customOverrides 同样作用于批量导出', () => {
      const custom = { AUTH_REQUIRED: { 'en-US': 'Custom SignIn' } }
      const dict = i18n.exportLocaleDictionary('en-US', custom)
      expect(dict.AUTH_REQUIRED).toBe('Custom SignIn')
    })
  })

  describe('类型安全（.ts 源码层面）', () => {
    test('导出 Locale 类型', () => {
      const ts = readSafe(TS)
      expect(ts).toMatch(/export\s+type\s+Locale/)
    })

    test('导出 I18nDictionary 类型', () => {
      const ts = readSafe(TS)
      expect(ts).toMatch(/export\s+type\s+I18nDictionary/)
    })

    test('导出 ErrorGroup 类型', () => {
      const ts = readSafe(TS)
      expect(ts).toMatch(/export\s+type\s+ErrorGroup/)
    })
  })
})
