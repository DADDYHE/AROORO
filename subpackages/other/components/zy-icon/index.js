// ================================================================
// components/zy-icon · Skyline 兼容图标组件
// 替代 van-icon，使用 image src 切换图标
// 图标资源存放在 /images/icons/ 目录，SVG 格式
// ================================================================

// 图标名称 → 文件路径映射（统一管理）
const ICON_MAP = {
  // 基础图标
  'home': '/images/icons/home-line.svg',
  'home-active': '/images/icons/home-white.svg',
  'discover': '/images/icons/discover-line.svg',
  'discover-active': '/images/icons/discover-white.svg',
  'service': '/images/icons/service-line.svg',
  'service-active': '/images/icons/service-white.svg',
  'profile': '/images/icons/profile-line.svg',
  'profile-active': '/images/icons/profile-white.svg',
  // 功能图标
  'calendar': '/images/icons/calendar-icon.svg',
  'calendar-white': '/images/icons/calendar-white.svg',
  'search': '/images/icons/search-line.svg',
  'message': '/images/icons/message-circle-line.svg',
  'heart': '/images/icons/heart-line.svg',
  'star': '/images/icons/target-line.svg',
  'clock': '/images/icons/time-line.svg',
  'map': '/images/icons/map-pin-line.svg',
  'shopping-cart': '/images/icons/shopping-cart-2-line.svg',
  'user': '/images/icons/user-line.svg',
  'users': '/images/icons/users-line.svg',
  'video': '/images/icons/video-line.svg',
  // 操作图标
  'plus': '/images/icons/plus-circle-line.svg',
  'trash': '/images/icons/trash-2-line.svg',
  'lock': '/images/icons/lock-line.svg',
  'shield': '/images/icons/shield-line.svg',
  'check': '/images/icons/check-white.svg',
  'check-circle': '/images/icons/check-circle-white.svg',
  'alert': '/images/icons/alert-triangle-line.svg',
  'info': '/images/icons/info-circle-line.svg',
  'help': '/images/icons/help-circle-line.svg',
  // 文件类
  'file-text': '/images/icons/file-text-line.svg',
  'file-text-white': '/images/icons/file-text-white.svg',
  'book': '/images/icons/book-open-line.svg',
  'ticket': '/images/icons/ticket-line.svg',
  'dollar': '/images/icons/dollar-sign-line.svg',
  'cup': '/images/icons/cup-line.svg',
  'door-lock': '/images/icons/door-lock-line.svg',
  'key': '/images/icons/key-white.svg',
  'smile': '/images/icons/smile-line.svg',
  'zap': '/images/icons/zap-line.svg',
  'play': '/images/icons/play-white.svg',
  'tool': '/images/icons/tool-white.svg',
}

Component({
  properties: {
    // 图标名称（优先级高于 src）
    name: { type: String, value: '' },
    // 直接指定图片路径（覆盖 name）
    src: { type: String, value: '' },
    // 图标尺寸（rpx）
    size: { type: null, value: 48 },
    // 颜色（仅对支持着色的 SVG 有效，部分 SVG 写死了颜色）
    color: { type: String, value: '' },
    // 点击事件名
    bindtap: { type: String, value: '' },
  },

  data: {
    _src: '',
  },

  observers: {
    'name, src': function(name, src) {
      if (src) {
        this.setData({ _src: src })
      } else if (name && ICON_MAP[name]) {
        this.setData({ _src: ICON_MAP[name] })
      } else if (name) {
        // 直接用 name 作为路径
        this.setData({ _src: name })
      } else {
        this.setData({ _src: '' })
      }
    },
  },

  lifetimes: {
    attached() {
      // 初始化
      const { name, src } = this.data
      if (src) {
        this.setData({ _src: src })
      } else if (name && ICON_MAP[name]) {
        this.setData({ _src: ICON_MAP[name] })
      } else if (name) {
        this.setData({ _src: name })
      }
    },
  },

  methods: {
    onTap(e) {
      this.triggerEvent('tap', e.detail)
    },
  },
})
