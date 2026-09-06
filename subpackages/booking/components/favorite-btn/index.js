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
    // 深色底变体：'onDark' 时未选中态用 cream 描边心形（默认米灰描边在深底上不可见）
    variant: {
      type: String,
      value: '',
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
