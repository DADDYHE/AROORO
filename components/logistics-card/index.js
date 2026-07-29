/**
 * logistics-card - 物流卡片组件
 *
 * 展示快递单号 + 发货时间，支持复制快递单号。
 */
Component({
  options: {
    multipleSlots: false,
    addGlobalClass: true,
  },

  properties: {
    expressCompany: { type: String, value: '' },
    expressNo: { type: String, value: '' },
    shippedAt: { type: String, value: '' },
  },

  methods: {
    onCopyExpressNo() {
      if (!this.data.expressNo) {return}
      wx.setClipboardData({
        data: this.data.expressNo,
        success: () => wx.showToast({ title: '已复制', icon: 'success', duration: 2000 }),
      })
    },
  },
})
