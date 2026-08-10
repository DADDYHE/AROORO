const { AdminService } = require('../../../services/CloudFunctionService')

const STATUS_MAP = {
  draft: { text: '待发布', color: '#9A9489' },
  published: { text: '报名中', color: '#4F5E35' },
  registration_stopped: { text: '报名截止', color: '#C9A24B' },
  ended: { text: '已结束', color: '#9A9489' },
  cancelled: { text: '已取消', color: '#A85B4A' },
}

const CATEGORY_MAP = {
  outdoor: '户外活动',
  indoor: '室内活动',
  social: '社交聚会',
  training: '培训课程',
  competition: '比赛赛事',
  adoption: '领养活动',
  other: '其他活动',
}

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    activity: null,
    isLoading: true,
    statusText: '',
    statusColor: '',
    categoryText: '',
    priceDisplayText: '',
    participantPct: 0,
    participantText: '',
    dateDisplay: '',
    timeDisplay: '',
    registrations: [],
    showRegList: false,
    statusActionText: '发布',
    regSummary: { totalGroups: 0, totalPets: 0, totalPeople: 0, signedGroups: 0 },
    regSummaryText: '',
    showExportSheet: false,
    exportFileName: '',
  },

  onLoad(options) {
    this._initNavbarHeight()
    if (options.id) {
      this._activityId = options.id
      this._loadActivity(options.id)
    }
  },

  onShow() {
    if (this._activityId) {
      this._loadActivity(this._activityId, true)
    }
  },

  async _loadActivity(activityId, silent) {
    if (!silent) {this.setData({ isLoading: true })}
    try {
      const res = await AdminService.getActivityDetail(activityId)
      if (res.code === 0 && res.data) {
        const activity = res.data
        const status = STATUS_MAP[activity.status] || { text: activity.status, color: '#9A9489' }
        const categoryText = CATEGORY_MAP[activity.category] || ''

        let statusActionText = '发布'
        if (activity.status === 'published') {
          statusActionText = '截止报名'
        } else if (activity.status === 'registration_stopped') {
          statusActionText = '结束活动'
        } else if (activity.status === 'ended' || activity.status === 'cancelled') {
          statusActionText = '重新发布'
        }

        let priceDisplayText = '免费'
        const ppp = activity.pricePerPerson || 0
        const ppet = activity.pricePerPet || 0
        if (ppp > 0 && ppet > 0) {
          priceDisplayText = `¥${ppp}/人  ¥${ppet}/宠`
        } else if (ppp > 0) {
          priceDisplayText = `¥${ppp}/人`
        } else if (ppet > 0) {
          priceDisplayText = `¥${ppet}/宠`
        }

        const maxP = activity.maxParticipants || 0
        const curP = activity.currentParticipants || 0
        const participantPct = maxP > 0 ? Math.min(curP / maxP * 100, 100) : 0
        const participantText = `${curP}/${maxP || '不限'}`

        const startTime = this._parseDate(activity.startTime)
        const endTime = this._parseDate(activity.endTime)
        let dateDisplay = '待定'
        let timeDisplay = ''
        if (startTime) {
          dateDisplay = `${startTime.getFullYear()}年${startTime.getMonth() + 1}月${startTime.getDate()}日`
          const sh = String(startTime.getHours()).padStart(2, '0')
          const sm = String(startTime.getMinutes()).padStart(2, '0')
          timeDisplay = `${sh}:${sm}`
          if (endTime) {
            const eh = String(endTime.getHours()).padStart(2, '0')
            const em = String(endTime.getMinutes()).padStart(2, '0')
            timeDisplay += ` - ${eh}:${em}`
          }
        }

        this.setData({
          activity,
          statusText: status.text,
          statusColor: status.color,
          categoryText,
          statusActionText,
          priceDisplayText,
          participantPct,
          participantText,
          regSummary: activity.registrationSummary || { totalGroups: 0, totalPets: 0, totalPeople: 0, signedGroups: 0 },
          regSummaryText: activity.registrationSummary ? `宠物${activity.registrationSummary.totalPets}只，人数${activity.registrationSummary.totalPeople}人` : '',
          dateDisplay,
          timeDisplay,
        })
      } else {
        this.error('ACTIVITY_NOT_FOUND')
      }
    } catch (e) {
      console.error('[partner/activity-detail] load error:', e)
      this.error('LOAD_FAILED')
    }
    if (!silent) {this.setData({ isLoading: false })}
  },

  _parseDate(str) {
    if (!str) {return null}
    const fixed = str.replace(/-/g, '/')
    const d = new Date(fixed)
    return isNaN(d.getTime()) ? null : d
  },

  onEdit() {
    wx.navigateTo({
      url: `/subpackages/partner/activity-create/index?id=${this._activityId}`,
      fail: err => {
        console.error('[partner/activity-detail] navigateTo fail:', err)
        this.error('NAVIGATE_FAILED')
      },
    })
  },

  onChangeStatus() {
    const { activity } = this.data
    if (!activity) {return}

    const status = activity.status
    let newStatus = ''
    let confirmMsg = ''

    if (status === 'draft') {
      newStatus = 'published'
      confirmMsg = '确定发布此活动？'
    } else if (status === 'published') {
      newStatus = 'registration_stopped'
      confirmMsg = '确定截止报名？'
    } else if (status === 'registration_stopped') {
      newStatus = 'ended'
      confirmMsg = '确定结束此活动？'
    } else if (status === 'ended' || status === 'cancelled') {
      newStatus = 'published'
      confirmMsg = '确定重新发布此活动？'
    } else {
      this.error('STATUS_INVALID')
      return
    }

    this.showModal({
      titleKey: 'BIZ_FRRM3P',
      content: confirmMsg,
      success: (confirmed) => {
        if (!confirmed) {return}
        this._updateStatus(newStatus)
      },
    })
  },

  async _updateStatus(newStatus) {
    wx.showLoading({ title: '处理中' })
    try {
      const res = await AdminService.updateActivity({
        activityId: this._activityId,
        status: newStatus,
      })
      if (res.code === 0) {
        this.toast('OPERATION_SUCCESS')
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        this.errorDynamic(res.message, 'OPERATION_FAILED')
      }
    } catch (e) {
      this.error('OPERATION_FAILED')
    }
    wx.hideLoading()
  },

  async onViewRegistrations() {
    wx.showLoading({ title: '加载中' })
    try {
      const res = await AdminService.getActivityRegistrations({
        activityId: this._activityId,
        page: 1,
        pageSize: 50,
      })
      if (res.code === 0 && res.data) {
        const summary = res.data.summary || { totalGroups: 0, totalPets: 0, totalPeople: 0, signedGroups: 0 }
        this.setData({
          registrations: res.data.list || [],
          showRegList: true,
          regSummary: summary,
          regSummaryText: `宠物${summary.totalPets}只，人数${summary.totalPeople}人`,
        })
      }
    } catch (e) {
      this.error('LOAD_FAILED')
    }
    wx.hideLoading()
  },

  onCloseRegList() {
    this.setData({ showRegList: false })
  },

  async onExportRegistrations() {
    if (!this._activityId) {return}
    wx.showLoading({ title: '导出中' })
    try {
      const res = await AdminService.exportActivityRegistrations({ activityId: this._activityId })
      if (res.code !== 0 || !res.data || !res.data.csvContent) {
        wx.hideLoading()
        this.errorDynamic(res.message, 'OPERATION_FAILED')
        return
      }
      const csvContent = res.data.csvContent
      this._exportCsv = csvContent // 始终缓存，供「复制内容」兜底（不依赖文件是否写入成功）
      // 文件名清洗：活动标题可能含 / \ : * ? " < > | 等非法字符，会导致 writeFile 失败
      const rawTitle = res.data.activityTitle || '活动'
      const safeTitle = String(rawTitle).replace(/[\\/:*?"<>|\n\r\t]/g, '_').slice(0, 30)
      const fileName = `报名表_${safeTitle}.csv`
      // 真机 wx.shareFileMessage 要求文件位于临时目录，持久目录（USER_DATA_PATH）转发会失败；PC 两者皆可
      const tmpDir = (wx.env.TEMP || '').replace(/\/$/, '')
      const baseDir = tmpDir || wx.env.USER_DATA_PATH
      const filePath = `${baseDir}/${fileName}`
      wx.getFileSystemManager().writeFile({
        filePath,
        data: csvContent,
        encoding: 'utf8',
        success: () => {
          wx.hideLoading()
          this._exportFilePath = filePath
          this.setData({ showExportSheet: true, exportFileName: fileName })
        },
        fail: () => {
          // 写文件失败（极端情况）：仍弹层，仅「复制内容」可用
          wx.hideLoading()
          this._exportFilePath = ''
          this.setData({ showExportSheet: true, exportFileName: fileName })
        },
      })
    } catch (e) {
      wx.hideLoading()
      this.error('OPERATION_FAILED')
    }
  },

  // 弹层按钮：转发到微信。必须在「用户 TAP 手势」中调用，
  // 否则真机 fail: "can only be invoked by user TAP gesture"（这是此前落剪贴板的真正原因）
  onExportShare() {
    const filePath = this._exportFilePath
    const fileName = this.data.exportFileName
    if (!filePath) { this.onExportCopy(); return }
    wx.shareFileMessage({
      filePath,
      fileName,
      success: () => {
        this._closeExportSheet()
        wx.showToast({ title: '已调起转发，发给「文件传输助手」即可在微信内打开', icon: 'none' })
      },
      fail: () => {
        // 部分机型不支持 .csv 转发，降级为 .txt 重试一次
        this._shareAsTxt(this._exportCsv, fileName, () => {
          this._closeExportSheet()
          wx.showToast({ title: '已调起转发，发给「文件传输助手」即可在微信内打开', icon: 'none' })
        })
      },
    })
  },

  _shareAsTxt(csvContent, csvFileName, onOk) {
    const txtName = (csvFileName || '报名表.csv').replace(/\.csv$/i, '.txt')
    const tmpDir = (wx.env.TEMP || '').replace(/\/$/, '')
    const baseDir = tmpDir || wx.env.USER_DATA_PATH
    const txtPath = `${baseDir}/${txtName}`
    wx.getFileSystemManager().writeFile({
      filePath: txtPath,
      data: csvContent,
      encoding: 'utf8',
      success: () => {
        wx.shareFileMessage({
          filePath: txtPath,
          fileName: txtName,
          success: onOk,
          fail: () => { wx.showToast({ title: '转发未唤起，请点「复制内容」', icon: 'none' }) },
        })
      },
      fail: () => { wx.showToast({ title: '转发未唤起，请点「复制内容」', icon: 'none' }) },
    })
  },

  // 弹层按钮：保存到本机（仅 PC 微信暴露该 API，移动端无）
  onExportSave() {
    if (typeof wx.saveFileToDisk !== 'function') {
      wx.showToast({ title: '移动端请用「转发到微信」', icon: 'none' })
      return
    }
    const filePath = this._exportFilePath
    if (!filePath) { this.onExportCopy(); return }
    wx.saveFileToDisk({
      filePath,
      success: () => {
        this._closeExportSheet()
        wx.showToast({ title: '已保存到本机', icon: 'none' })
      },
      fail: () => { wx.showToast({ title: '保存失败，请点「转发到微信」', icon: 'none' }) },
    })
  },

  // 弹层按钮：复制内容（用户手势中调用，最可靠兜底）
  onExportCopy() {
    const csv = this._exportCsv || ''
    if (!csv) { this.error('OPERATION_FAILED'); return }
    wx.setClipboardData({
      data: csv,
      success: () => {
        this._closeExportSheet()
        wx.showToast({ title: '已复制，可粘贴到 Excel / 微信发送给文件传输助手', icon: 'none' })
      },
      fail: () => { this.error('OPERATION_FAILED') },
    })
  },

  _closeExportSheet() {
    this.setData({ showExportSheet: false })
  },

  onCloseExportSheet() {
    this._closeExportSheet()
  },

  onCallParticipant(e) {
    const phone = e.currentTarget.dataset.phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone })
    }
  },

  onPreviewImage(e) {
    const src = e.currentTarget.dataset.src
    const { activity } = this.data
    if (!activity || !activity.images) {return}
    wx.previewImage({
      current: src,
      urls: activity.images,
    })
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/home/index' })
      },
    })
  },

})
