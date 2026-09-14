// =============================================================================
// BookingDataService —— 全局预订数据服务（命名空间隔离版）
// =============================================================================
// P0 隔离（2026-09-14）：BookingData 是全局内存单例，曾被寄养与上门喂养板块
//   共用同一组字段，导致跨板块串扰（寄养页显示上门服务内容/价格，或反之）。
//
// 统一方案：按板块命名空间物理隔离 —— 每个板块的数据存各自的命名空间，
//   get/set 只读写「当前激活板块」的命名空间，跨板块在数据层即不可能串扰。
//   页面无需再各自写守卫逻辑，只需在入口声明归属：
//     - 流程起点页（pet-select）：BookingData.startFlow('feeding' | 'booking')
//     - 非起点页（confirm / confirm-service）：BookingData.enter('feeding' | 'booking')
//   其余 get/set 调用保持原签名，自动作用于当前板块命名空间。
// =============================================================================

const initNamespaces = () => ({
  // 寄养板块
  booking: {
    selectedDates: null,
    selectedDatesTimestamp: null,
    selectedPets: [],
    selectedPetDetails: [],
    selectedHost: null,
    bookingRequirements: null,
    petServices: {},
  },
  // 上门喂养板块
  feeding: {
    selectedPets: [],
    selectedPetDetails: [],
    petServices: {},
  },
})

const BookingData = {
  _data: Object.assign({ flow: '' }, initNamespaces()),

  /**
   * 声明/切换当前板块（不重置数据）。
   * 用于非流程起点页（确认页等）：仅切换读写目标命名空间。
   */
  enter(flow) {
    if (flow === 'booking' || flow === 'feeding') {
      this._data.flow = flow
    }
  },

  /**
   * 开始新流程：重置目标板块命名空间并激活。
   * 用于流程起点页（pet-select）：清空该板块上一单的残留数据。
   */
  startFlow(flow) {
    if (flow === 'booking' || flow === 'feeding') {
      this._data[flow] = initNamespaces()[flow]
      this._data.flow = flow
    }
  },

  /**
   * 读取当前板块命名空间中的数据。
   * 无参返回整个命名空间浅拷贝；key='flow' 返回当前板块标记。
   */
  get(key) {
    const ns = this._data[this._data.flow] || {}
    if (key === undefined) {return { ...ns }}
    if (key === 'flow') {return this._data.flow}
    const value = ns[key]
    if (value && typeof value === 'object') {
      return Array.isArray(value) ? [...value] : { ...value }
    }
    return value
  },

  /**
   * 写入当前板块命名空间。flow 只能通过 enter/startFlow 切换，防止误写。
   */
  set(key, value) {
    const ns = this._data[this._data.flow]
    if (!ns) {return}
    ns[key] = value
  },

  /**
   * 清空当前板块命名空间（下单成功/流程结束）。
   */
  reset() {
    const flow = this._data.flow === 'feeding' ? 'feeding' : 'booking'
    this._data[flow] = initNamespaces()[flow]
  },
}

module.exports = { BookingData }
