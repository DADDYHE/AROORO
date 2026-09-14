const BookingData = {
  _data: {
    // flow：当前数据流来源标记（'' 空 / 'booking' 寄养 / 'feeding' 上门喂养）
    // P0 隔离（2026-09-14）：BookingData 为全局内存单例，被寄养与上门板块共用，
    //   无来源标记时残留数据会跨板块串扰（寄养页显示上门服务内容/价格 或反之）。
    //   各板块入口写入数据前必须设置 flow，读取方校验 flow 后才读取。
    flow: '',
    selectedDates: null,
    selectedDatesTimestamp: null,
    selectedPets: [],
    selectedPetDetails: [],
    selectedHost: null,
    bookingRequirements: null,
    petServices: {},
  },

  get(key) {
    if (!key) {return { ...this._data }}
    const value = this._data[key]
    if (value && typeof value === 'object') {
      return Array.isArray(value) ? [...value] : { ...value }
    }
    return value
  },

  set(key, value) {
    this._data[key] = value
  },

  reset() {
    this._data = {
      flow: '',
      selectedDates: null,
      selectedDatesTimestamp: null,
      selectedPets: [],
      selectedPetDetails: [],
      selectedHost: null,
      bookingRequirements: null,
      petServices: {},
    }
  },
}

module.exports = { BookingData }
