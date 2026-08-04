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

  methods: {
    handleToggle() {
      if (this.properties.loading) {
        return
      }
      this.triggerEvent('toggle')
    },
  },
})
