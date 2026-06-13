Component({
  properties: {
    isActive: {
      type: Boolean,
      value: false,
    },
    loading: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    iconColor: '#999999',
  },

  observers: {
    isActive(isActive) {
      this.setData({
        iconColor: isActive ? '#000000' : '#999999',
      })
    },
  },

  lifetimes: {
    ready() {
      this.setData({
        iconColor: this.properties.isActive ? '#000000' : '#999999',
      })
    },
  },

  methods: {
    handleToggle() {
      if (this.properties.loading) {
        return
      }
      this.triggerEvent('toggle')
    },
  },
})
