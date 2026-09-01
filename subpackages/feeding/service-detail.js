const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { ListBehavior } = require('../../behaviors/listBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const { buildSharePath } = require('../../utils/share')

Page({
  behaviors: [ListBehavior, cloudImageBehavior, shareEntryBehavior],

  data: {
  ...__pageI18n.buildTMap(__i18n.getLocale()),
    activeTab: 0,
    serviceType: 'feeding',
    _workletTabEnabled: false,
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
    this._initNavbarHeight()
    const tab = parseInt(options.tab, 10) || 0
    this.setData({ activeTab: tab })
    this._initCardEnterAnimation()
    this._initTabIndicator()
    // tab 初始值非 0 时需要同步指示器位置
    if (tab !== 0) {
      setTimeout(() => this._moveTabIndicator(tab, false), 50)
    }
  },

  onUnload() {
    this._teardownCardEnterAnimation()
    this._teardownTabIndicator()
  },

  handleTabTap(e) {
    const tab = parseInt(e.currentTarget.dataset.tab, 10)
    this.setData({ activeTab: tab })
    this._moveTabIndicator(tab, true)
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

  // ================================================================
  // Worklet 服务卡片入场动画
  // ----------------------------------------------------------------
  // 页面加载后，section-card 从 scale 0.92 + opacity 0
  // 用 spring 物理弹性回弹到 scale 1 + opacity 1，产生轻盈入场感
  // 通过 scroll-view 的 scroll 事件检测卡片是否进入视口触发
  // 注意：部分 section-card 在 wx:if 条件块内（如 walking tab），
  // 首次渲染时可能不存在，需先查询 DOM 再绑定动画，避免 Skyline 警告
  // ================================================================
  _initCardEnterAnimation() {
    if (!wx.worklet || !this.applyAnimatedStyle) return
    const { shared } = wx.worklet
    this._cardProgress = []  // 每个卡片的入场进度 SharedValue
    this._cardCancels = []   // 每个卡片的样式解绑函数
    this._cardObserver = null

    // 先查询当前 DOM 中实际存在的 .section-card-N 元素
    const query = this.createSelectorQuery()
    const cardCount = 8
    for (let i = 0; i < cardCount; i++) {
      query.select(`.section-card-${i}`).boundingClientRect()
    }
    query.exec(rects => {
      if (!rects) return
      for (let i = 0; i < cardCount; i++) {
        // 仅对 DOM 中实际存在的元素绑定动画
        if (!rects[i]) {
          this._cardCancels[i] = null
          continue
        }
        const progress = shared(0)
        this._cardProgress[i] = progress
        const progressRef = progress
        try {
          const cancel = this.applyAnimatedStyle(`.section-card-${i}`, () => {
            'worklet'
            const p = progressRef.value
            return {
              transform: `scale(${0.92 + 0.08 * p})`,
              opacity: p,
            }
          })
          this._cardCancels[i] = cancel
        } catch (e) {
          this._cardCancels[i] = null
        }
      }
      this._workletReady = true

      // 延迟触发首屏可见卡片入场
      setTimeout(() => this._triggerCardsEnter(), 100)

      // 兜底：3s 后强制所有未入场的卡片显示，防止 query 失败导致永久不可见
      this._enterFallbackTimer = setTimeout(() => {
        if (!this._cardProgress) return
        this._cardProgress.forEach(p => {
          if (p && p.value < 1) {
            const { runOnUI } = wx.worklet || {}
            if (!runOnUI) { p.value = 1; return }
            runOnUI(() => {
              'worklet'
              p.value = 1
            })()
          }
        })
      }, 3000)
    })
  },

  // 通过 query 获取卡片位置，触发进入视口的卡片
  _triggerCardsEnter() {
    if (!this._workletReady) return
    const query = this.createSelectorQuery()
    query.selectAll('.section-card').boundingClientRect()
    query.selectViewport().boundingClientRect()
    query.exec(res => {
      if (!res || !res[0] || !res[1]) return
      const cards = res[0]
      const viewport = res[1]
      if (!viewport) return
      const viewportHeight = viewport.height
      cards.forEach((rect, i) => {
        if (!rect) return
        // 卡片顶部进入视口下方 80% 位置时触发
        if (rect.top < viewportHeight * 0.8 && this._cardProgress[i]) {
          this._animateCardEnter(i)
        }
      })
    })
  },

  _animateCardEnter(index) {
    const progress = this._cardProgress && this._cardProgress[index]
    if (!progress) return
    // 已入场则跳过
    if (progress.value >= 1) return
    const { spring, runOnUI } = wx.worklet || {}
    if (!runOnUI) { progress.value = 1; return }
    runOnUI(() => {
      'worklet'
      progress.value = spring(1, {
        stiffness: 80,
        damping: 12,
        mass: 0.8,
      })
    })()
  },

  // scroll-view 滚动时触发卡片入场检测（由 listBehavior._onScroll 路由）
  onPageScroll() {
    this._triggerCardsEnter()
  },

  _teardownCardEnterAnimation() {
    if (this._enterFallbackTimer) {
      clearTimeout(this._enterFallbackTimer)
      this._enterFallbackTimer = null
    }
    if (this._cardCancels) {
      this._cardCancels.forEach(c => c && c())
      this._cardCancels = null
    }
    this._cardProgress = null
    this._workletReady = false
  },

  // ================================================================
  // Worklet Tab 指示器丝滑滑动
  // ----------------------------------------------------------------
  // 3 个 tab 等宽（1/3），指示器 slider 宽度 33.333%
  // activeTab 变化时，spring 动画驱动 translateX(0% / 100% / 200%)
  // 比 CSS transition 更丝滑，带轻微弹性
  // ================================================================
  _initTabIndicator() {
    if (!wx.worklet || !this.applyAnimatedStyle) return
    const { shared } = wx.worklet
    // 指示器位置百分比：0, 1, 2（对应 translateX 0%, 100%, 200%）
    this._tabPos = shared(this.data.activeTab)

    const tabPos = this._tabPos
    const updateSliderStyle = () => {
      'worklet'
      return { transform: `translateX(${tabPos.value * 100}%)` }
    }

    wx.nextTick(() => {
      try {
        this._cancelTabSlider = this.applyAnimatedStyle('.tab-indicator-slider', updateSliderStyle)
        // 标记启用 worklet，WXML 加 worklet-driven class 禁用 CSS transition
        this.setData({ _workletTabEnabled: true })
      } catch (e) {
        this._cancelTabSlider = null
      }
    })
  },

  _moveTabIndicator(tabIndex, animated) {
    if (!this._tabPos) return
    const { spring, runOnUI } = wx.worklet || {}
    if (!runOnUI) return  // 非 Skyline 模式跳过 worklet 动画
    const target = tabIndex
    if (animated) {
      // spring 动画：带轻微弹性的丝滑滑动
      runOnUI(() => {
        'worklet'
        this._tabPos.value = spring(target, {
          stiffness: 300,
          damping: 30,
          mass: 1,
        })
      })()
    } else {
      // 无动画直接跳转（初始化）
      runOnUI(() => {
        'worklet'
        this._tabPos.value = target
      })()
    }
  },

  _teardownTabIndicator() {
    if (this._cancelTabSlider) {
      this._cancelTabSlider()
      this._cancelTabSlider = null
    }
    this._tabPos = null
  },

  onShareAppMessage() {
    return {
      title: __i18nT('BIZ_P8XTPQ'),
      path: buildSharePath('/subpackages/feeding/service-detail'),
    }
  },
})
