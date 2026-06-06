class ErrorStats {
  constructor() {
    this.total = 0
    this.byType = {}
    this.byLevel = {}
    this.byDay = {}
    this.recentErrors = []
    this.lastErrorReportTime = 0
  }

  record(errorInfo) {
    this.total++

    const { type, level, timestamp } = errorInfo
    const day = new Date(timestamp).toISOString().split('T')[0]

    this.byType[type] = (this.byType[type] || 0) + 1
    this.byLevel[level] = (this.byLevel[level] || 0) + 1
    this.byDay[day] = (this.byDay[day] || 0) + 1

    this.recentErrors.push({
      type,
      message: errorInfo.message,
      timestamp,
      level,
    })

    if (this.recentErrors.length > 100) {
      this.recentErrors = this.recentErrors.slice(-100)
    }
  }

  cleanOldStats(maxDays = 30) {
    try {
      const cutoffDate = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000)
      const cutoffStr = cutoffDate.toISOString().split('T')[0]
      const oldKeys = Object.keys(this.byDay).filter(day => day < cutoffStr)
      oldKeys.forEach(key => { delete this.byDay[key] })
      if (oldKeys.length > 0) {
        console.log(`[ErrorStats] 已清理 ${oldKeys.length} 天前的数据`)
      }
    } catch (error) {
      console.error('[ErrorStats] 数据清理失败:', error)
    }
  }

  toJSON() {
    return {
      total: this.total,
      byType: { ...this.byType },
      byLevel: { ...this.byLevel },
      byDay: { ...this.byDay },
      recentCount: this.recentErrors.length,
    }
  }
}

module.exports = { ErrorStats }
