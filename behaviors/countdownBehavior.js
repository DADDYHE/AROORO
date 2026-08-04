// 支付倒计时复用行为
// 页面在需要显示"待支付剩余时间"时，调用 _startPayCountdown(deadlineTs) 即可：
// 行为会立即 tick 一次并每秒刷新，将剩余时间以 "mm:ss" 写入 data.payCountdown；
// 已超时则写入 "已超时" 并自动停止计时。页面在 onHide/onUnload 调 _stopPayCountdown() 清理定时器。
//
// 设计要点：
// - deadlineTs 由各页面自己计算（不同页 createdAt/timeoutMinutes 存放位置不同），行为只负责"给个截止时间戳就倒计时"。
// - 定时器句柄挂在实例属性 _payCountdownTimer 上（非 data），避免被 setData 序列化。
// - tick 做了"值未变不 setData"的冗余保护，降低每秒刷新带来的渲染开销。
// - lifetimes.detached 兜底清理，防止页面被销毁后定时器仍跑。
module.exports = Behavior({
  data: {
    // 支付倒计时（mm:ss），由行为写入；仅 pending_payment 且未超时时有值
    payCountdown: ''
  },

  methods: {
    // 启动倒计时：传入订单支付截止时间戳（ms）
    _startPayCountdown(deadlineTs) {
      this._stopPayCountdown()
      this._payCountdownDeadline = deadlineTs
      this._tickPayCountdown()
      this._payCountdownTimer = setInterval(() => this._tickPayCountdown(), 1000)
    },

    _tickPayCountdown() {
      const remainMs = (this._payCountdownDeadline || 0) - Date.now()
      if (remainMs <= 0) {
        if (this.data.payCountdown !== '已超时') {
          this.setData({ payCountdown: '已超时' })
        }
        this._stopPayCountdown()
        return
      }
      const totalSec = Math.floor(remainMs / 1000)
      const mm = String(Math.floor(totalSec / 60)).padStart(2, '0')
      const ss = String(totalSec % 60).padStart(2, '0')
      const text = `${mm}:${ss}`
      if (this.data.payCountdown !== text) {
        this.setData({ payCountdown: text })
      }
    },

    _stopPayCountdown() {
      if (this._payCountdownTimer) {
        clearInterval(this._payCountdownTimer)
        this._payCountdownTimer = null
      }
    }
  },

  lifetimes: {
    detached() {
      this._stopPayCountdown()
    }
  }
})
