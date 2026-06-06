const { AdminService } = require('../../../services/CloudFunctionService')
const { parseDate } = require('../../../utils/dateUtils')

const pageI18n = require('../../../utils/page-i18n.js')

function formatDateTime(dateValue) {
  const d = parseDate(dateValue)
  if (!d) return '—'
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

Page({
  ...pageI18n.mixin(),
  data: {
    isLoading: true,
    isPartner: false,
    hasPendingApplication: false,
    application: null,
    showApplyForm: false,
    formData: { realName: '', phone: '', reason: '' },
  },

  onLoad() {
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const [permRes, appRes] = await Promise.all([
        AdminService.getMyPermissions(),
        AdminService.getApplicationStatus(),
      ])

      const isPartner = permRes.code === 0 && permRes.data && permRes.data.isPartner === true
      const hasPending = appRes.code === 0 && appRes.data ? appRes.data.hasPending || false : false
      const application = appRes.code === 0 && appRes.data ? appRes.data.application || null : null
      if (application && application.createdAt) {
        application.createdAt = formatDateTime(application.createdAt)
      }

      this.setData({
        isLoading: false,
        isPartner,
        hasPendingApplication: hasPending,
        application,
      })
    } catch (e) {
      console.error('[partner/application] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  onApplyTap() {
    this.setData({ showApplyForm: true })
  },

  onCloseForm() {
    this.setData({ showApplyForm: false })
  },

  onInputRealName(e) {
    this.setData({ 'formData.realName': e.detail.value })
  },

  onInputPhone(e) {
    this.setData({ 'formData.phone': e.detail.value })
  },

  onInputReason(e) {
    this.setData({ 'formData.reason': e.detail.value })
  },

  noop() {},

  async onSubmitApply() {
    const { realName, phone, reason } = this.data.formData
    if (!realName.trim()) {
      this.error('REAL_NAME_REQUIRED')
      return
    }
    if (!phone.trim()) {
      this.error('PHONE_REQUIRED')
      return
    }
    if (!reason.trim()) {
      this.error('REASON_REQUIRED')
      return
    }

    try {
      const res = await AdminService.submitApplication({ realName, phone, reason })
      if (res.code === 0) {
        this.toast('APPLICATION_SUBMITTED')
        this.setData({ showApplyForm: false, formData: { realName: '', phone: '', reason: '' } })
        this._loadData()
      } else {
        this.errorDynamic(res.message, 'SUBMIT_FAILED')
      }
    } catch (e) {
      this.error('SUBMIT_RETRY')
    }
  },
})
