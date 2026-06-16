Component({
  properties: {
    visible: { type: Boolean, value: false },
  },

  methods: {
    onLogin() {
      const { authService } = require('../../services/AuthService')
      this.triggerEvent('close')
      authService.startLogin()
    },

    onClose() {
      this.triggerEvent('close')
    },
  },
})
