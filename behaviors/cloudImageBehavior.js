module.exports = Behavior({
  methods: {
    onCloudImageError(e) {
      const path = e.currentTarget.dataset.path
      if (!path || !this) return
      this.setData({ [path]: '/images/default-avatar.svg' })
    },
  },
})
