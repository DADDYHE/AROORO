const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { buildSharePath } = require('../../utils/share')

Page({
  behaviors: [cloudImageBehavior],

  data: {
    activeTab: 0,
    serviceType: 'feeding',
    faqList: [
      {
        q: '服务人员是否经过审核？',
        a: '所有服务人员均经过实名认证、背景调查和专业培训，确保为您提供安全可靠的服务。',
        open: false,
      },
      {
        q: '可以临时取消预约吗？',
        a: '服务开始前2小时可免费取消，2小时内取消将收取订单金额30%的违约金。',
        open: false,
      },
      {
        q: '服务过程中宠物出现问题怎么办？',
        a: '服务人员均接受过应急处理培训，如遇紧急情况会第一时间联系您并协助送医。平台也提供服务保障，具体可查看保障条款。',
        open: false,
      },
      {
        q: '可以指定同一位服务人员吗？',
        a: '可以。在预约时选择您之前合作过的服务人员即可，也可以在服务人员列表中收藏喜欢的人员方便下次选择。',
        open: false,
      },
      {
        q: '上门服务需要我准备什么？',
        a: '请确保家中有人或已将钥匙妥善交给服务人员，并准备好宠物的食物、用品和注意事项说明。服务人员会自备基本清洁工具。',
        open: false,
      },
      {
        q: '服务时长是多久？',
        a: '上门喂养标准服务时长约30-45分钟，上门洗护约60-90分钟，遛狗按您选择的时长（30分钟或60分钟）为准。',
        open: false,
      },
    ],
  },

  onLoad(options) {
    const tab = parseInt(options.tab, 10) || 0
    this.setData({ activeTab: tab })
  },

  handleTabTap(e) {
    const tab = parseInt(e.currentTarget.dataset.tab, 10)
    this.setData({ activeTab: tab })
  },

  switchServiceType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ serviceType: type })
  },

  handleFaqToggle(e) {
    const index = e.currentTarget.dataset.index
    const key = `faqList[${index}].open`
    this.setData({
      [key]: !this.data.faqList[index].open,
    })
  },

  onShareAppMessage() {
    return {
      title: 'AROORO 宠物服务详情',
      path: buildSharePath('/subpackages/feeding/service-detail'),
    }
  },
})
