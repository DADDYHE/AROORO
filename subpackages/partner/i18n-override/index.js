/**
 * 运营后台 - i18n 文案热覆盖（Sprint 23）
 *
 * 功能：
 *   - 列出当前所有覆盖（按更新时间倒序）
 *   - 按 key 前缀过滤
 *   - 单条编辑（key + locale + value + status + note）
 *   - 单条删除
 *   - 状态切换（active <-> disabled）
 *   - 多 locale 预览
 *   - Sprint 53 增强：统计概览 + 导出 + 缺失翻译视图
 *
 * 接入：
 *   - 后端：cloudfunctions/adminService/services/i18nOverride.js
 *   - 客户端：services/CloudFunctionService.js#AdminService
 *   - 拉取客户端：utils/i18n-hot-update.js
 *   - 应用客户端：utils/i18n.js#applyCustomOverrides
 */
const { AdminService } = require('../../../services/CloudFunctionService')
const { formatTime } = require('../../profile/utils/dateUtils')

const SUPPORTED_LOCALES = ['zh-CN', 'en-US', 'ja-JP']
const PAGE_SIZE = 30

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    isLoading: false,
    isSaving: false,
    list: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    hasMore: true,
    searchPrefix: '',
    statusFilter: 'all', // all / active / disabled
    supportedLocales: SUPPORTED_LOCALES,
    // 编辑器
    editorVisible: false,
    editorMode: 'create', // create | edit
    editorForm: {
      _id: '',
      key: '',
      locale: 'zh-CN',
      value: '',
      status: 'active',
      note: '',
    },
    // 预览
    previewVisible: false,
    previewData: null,
    // Sprint 53: 概览统计
    stats: {
      totalDocs: 0,
      activeDocs: 0,
      disabledDocs: 0,
      uniqueKeys: 0,
      byLocale: {},
      byStatus: { active: 0, disabled: 0, other: 0 },
      lastUpdatedAt: null,
    },
    // Sprint 53: 缺失翻译视图
    missingPanelVisible: false,
    missingStats: { totalKeys: 0, totalMissing: 0, missingByLocale: {} },
  },

  onLoad() {
    this._initNavbarHeight()
    this._loadData(true)
    this._loadStats()
  },

  onShow() {
    if (this.data.list.length > 0 && !this.data.isLoading) {
      this._loadData(false)
    }
  },

  onPullDownRefresh() {
    Promise.all([this._loadData(true), this._loadStats()])
      .finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this._loadData(false, true)
    }
  },

  // === 数据加载 ===

  async _loadData(isLoadMore = false) {
    if (this.data.isLoading) {return}
    this.setData({ isLoading: true })
    try {
      const nextPage = isLoadMore ? this.data.page + 1 : 1
      const res = await AdminService.listI18nOverrides({
        prefix: this.data.searchPrefix || undefined,
        status: this.data.statusFilter === 'all' ? undefined : this.data.statusFilter,
        page: nextPage,
        pageSize: this.data.pageSize,
      })
      if (!res || res.code !== 0) {
        this.errorDynamic((res && res.message), 'LOAD_FAILED')
        return
      }
      const data = res.data || {}
      const newList = data.list || []
      const merged = isLoadMore ? this.data.list.concat(newList) : newList
      this.setData({
        list: merged,
        total: data.total || 0,
        page: nextPage,
        hasMore: merged.length < (data.total || 0) && newList.length >= this.data.pageSize,
        isLoading: false,
      })
    } catch (e) {
      this.setData({ isLoading: false })
      this.errorDynamic(e.message, 'BIZ_GLEHGH')
    }
  },

  // === 搜索 / 过滤 ===

  onSearchInput(e) {
    this.setData({ searchPrefix: e.detail.value })
  },

  onSearchConfirm() {
    this._loadData(true)
  },

  onClearSearch() {
    this.setData({ searchPrefix: '' })
    this._loadData(true)
  },

  onStatusFilterChange(e) {
    const status = e.currentTarget.dataset.status || 'all'
    this.setData({ statusFilter: status })
    this._loadData(true)
  },

  // === 编辑器 ===

  onCreateNew() {
    this.setData({
      editorVisible: true,
      editorMode: 'create',
      editorForm: {
        _id: '',
        key: '',
        locale: 'zh-CN',
        value: '',
        status: 'active',
        note: '',
      },
    })
  },

  onEditItem(e) {
    const item = e.currentTarget.dataset.item
    if (!item) {return}
    this.setData({
      editorVisible: true,
      editorMode: 'edit',
      editorForm: {
        _id: item._id || '',
        key: item.key || '',
        locale: item.locale || 'zh-CN',
        value: item.value || '',
        status: item.status || 'active',
        note: item.note || '',
      },
    })
  },

  onCloseEditor() {
    this.setData({ editorVisible: false })
  },

  onEditorFieldChange(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`editorForm.${field}`]: e.detail.value })
  },

  onEditorLocaleChange(e) {
    this.setData({ 'editorForm.locale': e.currentTarget.dataset.locale })
  },

  onEditorStatusChange(e) {
    this.setData({ 'editorForm.status': e.currentTarget.dataset.status })
  },

  async onSaveEditor() {
    const form = this.data.editorForm
    if (!form.key || !form.key.trim()) {
      this.error('BIZ_TRMNPG')
      return
    }
    if (!SUPPORTED_LOCALES.includes(form.locale)) {
      this.error('BIZ_1MF0P9X')
      return
    }
    if (typeof form.value !== 'string' || form.value.length === 0) {
      this.error('BIZ_1GAJRYU')
      return
    }

    this.setData({ isSaving: true })
    try {
      const res = await AdminService.upsertI18nOverride({
        key: form.key.trim(),
        locale: form.locale,
        value: form.value,
        status: form.status,
        note: form.note,
      })
      if (!res || res.code !== 0) {
        this.errorDynamic((res && res.message), 'SAVE_FAILED')
        return
      }
      this.toast('SAVED')
      this.setData({ editorVisible: false, isSaving: false })
      this._loadData(true)
    } catch (e) {
      this.setData({ isSaving: false })
      this.errorDynamic(e.message, 'SAVE_FAILED')
    }
  },

  // === 删除 / 状态切换 ===

  onDeleteItem(e) {
    const { id, key, locale } = e.currentTarget.dataset
    if (!id) {return}
    this.showModal({
      titleKey: 'BIZ_FROTRU',
      content: `${key || ''} / ${locale || ''}`,
      success: async confirmed => {
        if (!confirmed) {return}
        try {
          const res = await AdminService.deleteI18nOverride(id)
          if (!res || res.code !== 0) {
            this.errorDynamic((res && res.message), 'DELETE_FAILED')
            return
          }
          this.toast('DELETED')
          this._loadData(true)
        } catch (err) {
          this.errorDynamic(err.message, 'DELETE_FAILED')
        }
      },
    })
  },

  async onToggleStatus(e) {
    const { id, status } = e.currentTarget.dataset
    if (!id) {return}
    const next = status === 'active' ? 'disabled' : 'active'
    try {
      const res = await AdminService.toggleI18nOverrideStatus(id, next)
      if (!res || res.code !== 0) {
        this.errorDynamic((res && res.message), 'OPERATION_FAILED')
        return
      }
      this.toast(next === 'active' ? 'BIZ_E6C0B' : 'BIZ_ECOJD')
      this._loadData(true)
    } catch (err) {
      this.errorDynamic(err.message, 'OPERATION_FAILED')
    }
  },

  // === 预览（查看当前 key 全部 locale）===

  async onPreviewItem(e) {
    const { key } = e.currentTarget.dataset
    if (!key) {return}
    try {
      const res = await AdminService.getI18nOverride(key)
      if (!res || res.code !== 0) {
        this.errorDynamic((res && res.message), 'LOAD_FAILED')
        return
      }
      const items = (res.data && res.data.items) || []
      const map = {}
      for (const it of items) {
        map[it.locale] = { value: it.value, status: it.status, updatedAt: it.updatedAt }
      }
      this.setData({
        previewVisible: true,
        previewData: { key, locales: map },
      })
    } catch (err) {
      this.errorDynamic(err.message, 'LOAD_FAILED')
    }
  },

  onClosePreview() {
    this.setData({ previewVisible: false, previewData: null })
  },

  // === Sprint 53: 统计概览 ===

  async _loadStats() {
    try {
      const res = await AdminService.getI18nOverrideStats()
      if (!res || res.code !== 0) {return}
      const d = res.data || {}
      this.setData({ stats: {
        totalDocs: d.totalDocs || 0,
        activeDocs: d.activeDocs || 0,
        disabledDocs: d.disabledDocs || 0,
        uniqueKeys: d.uniqueKeys || 0,
        byLocale: d.byLocale || {},
        byStatus: d.byStatus || { active: 0, disabled: 0, other: 0 },
        lastUpdatedAt: d.lastUpdatedAt || null,
      } })
    } catch (e) {
      // 静默失败，不阻塞列表
    }
  },

  formatTime(ts) { return formatTime(ts) },

  // === Sprint 53: 导出 JSON ===

  async onExportJson() {
    this.setData({ isLoading: true })
    try {
      const res = await AdminService.exportI18nOverrides({})
      if (!res || res.code !== 0) {
        this.errorDynamic((res && res.message), 'LOAD_FAILED')
        return
      }
      const d = res.data || {}
      const items = d.items || []
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        count: items.length,
        items,
      }
      const json = JSON.stringify(payload, null, 2)
      // 在小程序里没有直接下载文件 API，引导用户复制
      wx.setClipboardData({
        data: json,
        success: () => {
          this.toast(() => `已复制 ${items.length} 条到剪贴板`)
        },
        fail: err => {
          this.errorDynamic(err.message || '复制失败', 'OPERATION_FAILED')
        },
      })
    } catch (e) {
      this.errorDynamic(e.message, 'OPERATION_FAILED')
    } finally {
      this.setData({ isLoading: false })
    }
  },

  // === Sprint 53: 缺失翻译视图 ===

  async onOpenMissing() {
    this.setData({ missingPanelVisible: true, isLoading: true })
    try {
      const res = await AdminService.findMissingI18nTranslations({})
      if (!res || res.code !== 0) {
        this.errorDynamic((res && res.message), 'LOAD_FAILED')
        this.setData({ missingPanelVisible: false })
        return
      }
      const d = res.data || {}
      this.setData({
        missingStats: {
          totalKeys: d.totalKeys || 0,
          totalMissing: d.totalMissing || 0,
          missingByLocale: d.missingByLocale || {},
        },
        isLoading: false,
      })
    } catch (e) {
      this.errorDynamic(e.message, 'LOAD_FAILED')
      this.setData({ missingPanelVisible: false, isLoading: false })
    }
  },

  onCloseMissing() {
    this.setData({ missingPanelVisible: false })
  },

  // 跳到编辑器并预填 key + locale（用于补缺失）
  onFillMissing(e) {
    const { key, locale } = e.currentTarget.dataset
    if (!key || !locale) {return}
    this.setData({
      editorVisible: true,
      editorMode: 'create',
      editorForm: {
        _id: '',
        key,
        locale,
        value: '',
        status: 'active',
        note: '（补缺失翻译）',
      },
      missingPanelVisible: false,
    })
  },

  onClosePreview() {
    this.setData({ previewVisible: false, previewData: null })
  },
})
