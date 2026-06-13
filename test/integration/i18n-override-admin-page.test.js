/**
 * Sprint 23：admin i18n-override 页面集成测试
 *
 * 覆盖：
 *   - _loadData 正常路径（list 合并 / 分页 / 失败 toast）
 *   - onCreateNew / onEditItem 打开编辑器
 *   - onSaveEditor 校验 + 成功保存
 *   - onDeleteItem 二次确认 + 成功删除
 *   - onToggleStatus 切换 active <-> disabled
 *   - onPreviewItem 拉取并展示所有 locale
 */

// mock AdminService
const mockAdminService = {
  listI18nOverrides: jest.fn(),
  getI18nOverride: jest.fn(),
  upsertI18nOverride: jest.fn(),
  deleteI18nOverride: jest.fn(),
  toggleI18nOverrideStatus: jest.fn(),
}

jest.mock('../../services/CloudFunctionService', () => ({
  AdminService: mockAdminService,
}))

// mock pageI18n - 提供与真实 mixin 一致的方法，使 this.toast / this.error 等可调用
jest.mock('../../utils/page-i18n', () => {
  const i18nUtil = require('../../utils/i18n')
  const t = key => i18nUtil.t(key, 'zh-CN')
  return {
    mixin: () => ({
      data: { t: {} },
      onLoad() {},
      $t: t,
      $em: code => i18nUtil.getErrorMessage(code, 'zh-CN'),
      toast(keyOrFn, opts) {
        const title = typeof keyOrFn === 'function' ? keyOrFn() : t(keyOrFn)
        global.wx.showToast({ title, icon: 'success', duration: 2000, ...(opts || {}) })
      },
      error(keyOrFn, opts) {
        const title = typeof keyOrFn === 'function' ? keyOrFn() : t(keyOrFn)
        global.wx.showToast({ title, icon: 'none', duration: 2000, ...(opts || {}) })
      },
      errorDynamic(text, fallbackKey, opts) {
        const title = (text && String(text)) || t(fallbackKey)
        global.wx.showToast({ title, icon: 'none', duration: 2000, ...(opts || {}) })
      },
      toastDynamic(text, fallbackKey, opts) {
        const title = (text && String(text)) || t(fallbackKey)
        global.wx.showToast({ title, icon: 'success', duration: 2000, ...(opts || {}) })
      },
      showModal(opts = {}) {
        const { titleKey, content, contentKey, success, ...rest } = opts
        const finalTitle = titleKey ? t(titleKey) : opts.title || ''
        const finalContent = contentKey ? t(contentKey) : content || ''
        global.wx.showModal({
          title: finalTitle,
          content: finalContent,
          ...rest,
          success(res) {
            if (typeof success === 'function') {
              success(Boolean(res && res.confirm), res)
            }
          },
        })
      },
      setLocale() {},
      _getLocale() { return 'zh-CN' },
    }),
  }
})

describe('partner i18n-override page', () => {
  let Page
  let pageInstance
  let showToastMock
  let showModalMock

  beforeEach(() => {
    jest.resetModules()
    // 重置 mock
    mockAdminService.listI18nOverrides.mockReset()
    mockAdminService.getI18nOverride.mockReset()
    mockAdminService.upsertI18nOverride.mockReset()
    mockAdminService.deleteI18nOverride.mockReset()
    mockAdminService.toggleI18nOverrideStatus.mockReset()

    showToastMock = jest.fn()
    showModalMock = jest.fn(opts => opts && opts.success && opts.success({ confirm: true }))

    global.wx = {
      ...(global.wx || {}),
      showToast: showToastMock,
      showModal: showModalMock,
    }

    // mock Page 构造
    let capturedConfig
    global.Page = jest.fn(config => {
      capturedConfig = config
    })
    global.getApp = jest.fn(() => ({ globalData: { locale: 'zh-CN' } }))

    require('../../subpackages/partner/i18n-override/index')
    pageInstance = {
      data: capturedConfig.data,
      setData: jest.fn(function (patch) {
        // WX 风格 setData：'a.b.c' 路径展开为嵌套对象赋值
        function applyPath(obj, path, value) {
          const parts = path.split('.')
          let cursor = obj
          for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i]
            if (cursor[key] === null || typeof cursor[key] !== 'object') {
              cursor[key] = {}
            }
            cursor = cursor[key]
          }
          cursor[parts[parts.length - 1]] = value
        }
        const next = JSON.parse(JSON.stringify(this.data || {}))
        for (const k of Object.keys(patch)) {
          if (k.indexOf('.') >= 0) {
            applyPath(next, k, patch[k])
          } else {
            next[k] = patch[k]
          }
        }
        this.data = next
      }),
    }
    // 把所有方法挂到 instance
    Object.assign(pageInstance, capturedConfig)
  })

  it('初始 data 应有 supportedLocales', () => {
    expect(pageInstance.data.supportedLocales).toEqual(['zh-CN', 'en-US', 'ja-JP'])
    expect(pageInstance.data.pageSize).toBe(30)
  })

  it('_loadData 初次加载 - 替换 list', async () => {
    mockAdminService.listI18nOverrides.mockResolvedValue({
      code: 0,
      data: {
        list: [
          { _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'A 中', status: 'active' },
        ],
        total: 1,
      },
    })
    await pageInstance._loadData(true)
    expect(pageInstance.data.list.length).toBe(1)
    expect(pageInstance.data.total).toBe(1)
    expect(pageInstance.data.page).toBe(1)
    expect(pageInstance.data.hasMore).toBe(false)
  })

  it('_loadData 加载更多 - 追加 list', async () => {
    // 第一页
    pageInstance.data.list = [
      { _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'A', status: 'active' },
    ]
    pageInstance.data.page = 1
    mockAdminService.listI18nOverrides.mockResolvedValue({
      code: 0,
      data: {
        list: [
          { _id: 'a2', key: 'B_TITLE', locale: 'zh-CN', value: 'B', status: 'active' },
        ],
        total: 2,
      },
    })
    await pageInstance._loadData(false, true)
    expect(pageInstance.data.list.length).toBe(2)
    expect(pageInstance.data.page).toBe(2)
  })

  it('_loadData 失败时 toast 错误', async () => {
    mockAdminService.listI18nOverrides.mockResolvedValue({
      code: 500,
      message: 'server error',
    })
    await pageInstance._loadData(true)
    expect(showToastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'server error' }))
  })

  it('onCreateNew 打开编辑器', () => {
    pageInstance.onCreateNew()
    expect(pageInstance.data.editorVisible).toBe(true)
    expect(pageInstance.data.editorMode).toBe('create')
    expect(pageInstance.data.editorForm.key).toBe('')
  })

  it('onEditItem 加载已有数据', () => {
    const item = { _id: 'a1', key: 'A_TITLE', locale: 'en-US', value: 'A en', status: 'active', note: '' }
    pageInstance.onEditItem({ currentTarget: { dataset: { item } } })
    expect(pageInstance.data.editorVisible).toBe(true)
    expect(pageInstance.data.editorMode).toBe('edit')
    expect(pageInstance.data.editorForm.key).toBe('A_TITLE')
    expect(pageInstance.data.editorForm.locale).toBe('en-US')
  })

  it('onSaveEditor - 缺少 key 拦截', async () => {
    pageInstance.onCreateNew()
    pageInstance.setData({ 'editorForm.key': '' })
    await pageInstance.onSaveEditor()
    expect(showToastMock).toHaveBeenCalledWith(expect.objectContaining({ title: '请填写 key' }))
    expect(mockAdminService.upsertI18nOverride).not.toHaveBeenCalled()
  })

  it('onSaveEditor - 成功保存并刷新', async () => {
    pageInstance.onCreateNew()
    pageInstance.setData({
      'editorForm.key': 'NEW_KEY',
      'editorForm.locale': 'en-US',
      'editorForm.value': 'New text',
      'editorForm.status': 'active',
    })
    mockAdminService.upsertI18nOverride.mockResolvedValue({ code: 0, data: { action: 'created' } })
    mockAdminService.listI18nOverrides.mockResolvedValue({ code: 0, data: { list: [], total: 0 } })
    await pageInstance.onSaveEditor()
    expect(mockAdminService.upsertI18nOverride).toHaveBeenCalledWith(expect.objectContaining({
      key: 'NEW_KEY',
      locale: 'en-US',
      value: 'New text',
    }))
    expect(showToastMock).toHaveBeenCalledWith(expect.objectContaining({ title: '已保存' }))
  })

  it('onDeleteItem 二次确认 + 删除', async () => {
    mockAdminService.deleteI18nOverride.mockResolvedValue({ code: 0 })
    mockAdminService.listI18nOverrides.mockResolvedValue({ code: 0, data: { list: [], total: 0 } })
    await pageInstance.onDeleteItem({
      currentTarget: { dataset: { id: 'a1', key: 'A_TITLE', locale: 'zh-CN' } },
    })
    expect(showModalMock).toHaveBeenCalled()
    expect(mockAdminService.deleteI18nOverride).toHaveBeenCalledWith('a1')
  })

  it('onToggleStatus 切换状态', async () => {
    mockAdminService.toggleI18nOverrideStatus.mockResolvedValue({ code: 0 })
    mockAdminService.listI18nOverrides.mockResolvedValue({ code: 0, data: { list: [], total: 0 } })
    await pageInstance.onToggleStatus({
      currentTarget: { dataset: { id: 'a1', status: 'active' } },
    })
    expect(mockAdminService.toggleI18nOverrideStatus).toHaveBeenCalledWith('a1', 'disabled')
  })

  it('onPreviewItem 拉取全部 locale', async () => {
    mockAdminService.getI18nOverride.mockResolvedValue({
      code: 0,
      data: {
        key: 'A_TITLE',
        items: [
          { _id: 'a1', key: 'A_TITLE', locale: 'zh-CN', value: 'A 中', status: 'active' },
          { _id: 'a2', key: 'A_TITLE', locale: 'en-US', value: 'A en', status: 'active' },
        ],
      },
    })
    await pageInstance.onPreviewItem({ currentTarget: { dataset: { key: 'A_TITLE' } } })
    expect(pageInstance.data.previewVisible).toBe(true)
    expect(pageInstance.data.previewData.key).toBe('A_TITLE')
    expect(pageInstance.data.previewData.locales['zh-CN'].value).toBe('A 中')
    expect(pageInstance.data.previewData.locales['en-US'].value).toBe('A en')
  })

  it('onStatusFilterChange 触发重新加载', async () => {
    mockAdminService.listI18nOverrides.mockResolvedValue({ code: 0, data: { list: [], total: 0 } })
    await pageInstance.onStatusFilterChange({ currentTarget: { dataset: { status: 'active' } } })
    expect(pageInstance.data.statusFilter).toBe('active')
  })
})
