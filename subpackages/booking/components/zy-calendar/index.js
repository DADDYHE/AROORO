// ================================================================
// components/zy-calendar · Skyline 兼容日历选择组件
// 替代 van-calendar
// ----------------------------------------------------------
// 设计要点：
// 1. 基于 zy-popup 弹层
// 2. scroll-view 横向滑月（Skyline 友好）
// 3. 支持 single / range / multiple 三种模式
// 4. 支持自定义日期格式化、禁用日期、快捷选择
// ================================================================

// 格式化日期 YYYY-MM-DD
function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 解析日期字符串为 Date 对象
// 支持：Date 对象 / 时间戳(number) / 'YYYY-MM-DD' 字符串
function parseDate(val) {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') return new Date(val)
  const str = String(val)
  // 纯数字字符串视为时间戳
  if (/^\d+$/.test(str)) return new Date(Number(str))
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 规范化 defaultDate：接受 Date | number | string | 数组
// range 模式可传 [start, end]；multiple 模式可传 [d1, d2, ...]
function normalizeDefaultDate(val, type) {
  if (!val) return null
  if (Array.isArray(val)) {
    if (type === 'range') {
      const [s, e] = val
      return [s ? parseDate(s) : null, e ? parseDate(e) : null]
    }
    // multiple / single 都按数组处理
    return val.map(v => v ? parseDate(v) : null).filter(Boolean)
  }
  return parseDate(val)
}

// 获取某月天数
function getMonthDays(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

// 判断是否同一天
function isSameDay(a, b) {
  if (!a || !b) return false
  return formatDate(a) === formatDate(b)
}

// 判断日期是否在范围内
function isDateInRange(date, start, end) {
  if (!start || !end) return false
  const t = new Date(date).getTime()
  return t >= new Date(start).getTime() && t <= new Date(end).getTime()
}

Component({
  properties: {
    // 是否显示（poppable=true 时控制弹层显隐）
    show: { type: Boolean, value: false },
    // 选择模式：single | range | multiple
    type: { type: String, value: 'single' },
    // 标题
    title: { type: String, value: '选择日期' },
    // 最小日期（控制显示范围）
    minDate: { type: null, value: null },
    // 最大日期（控制显示范围）
    maxDate: { type: null, value: null },
    // 可选最小日期（控制可选范围，默认与 minDate 一致）
    selectableMinDate: { type: null, value: null },
    // 可选最大日期（控制可选范围，默认与 maxDate 一致）
    selectableMaxDate: { type: null, value: null },
    // 默认选中的日期
    defaultDate: { type: null, value: null },
    // 行高
    rowHeight: { type: null, value: 128 },
    // 是否显示月份背景大字
    showMonthTitle: { type: Boolean, value: true },
    // 是否显示周标题
    showWeekTitle: { type: Boolean, value: true },
    // 确认按钮文字
    confirmText: { type: String, value: '确定' },
    // 是否显示确认按钮（range/multiple 模式默认显示）
    showConfirm: { type: Boolean, value: true },
    // 是否允许选择同一天（range 模式）
    allowSameDay: { type: Boolean, value: false },
    // 自定义 formatter 函数（通过 setData 传入）
    formatter: { type: null, value: null },
    // 弹层 z-index
    zIndex: { type: Number, value: 1000 },
    // 是否以弹层形式展示（false 时内联渲染，Vant 兼容）
    poppable: { type: Boolean, value: true },
    // 弹层位置：bottom | top | center | right | left
    position: { type: String, value: 'bottom' },
    // 是否圆角
    round: { type: Boolean, value: true },
    // 主题色（选中态背景）
    color: { type: String, value: '#4F5E35' },
    // 是否显示今日标记（背景大字）
    showMark: { type: Boolean, value: true },
  },

  data: {
    // 月份列表（横向滚动）
    months: [],
    // 选中日期（single: Date, range: [start, end], multiple: Date[]）
    currentValue: null,
    // 选中文本展示
    selectedText: '',
    // 周标题
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    // scroll-view 当前 scroll-into-view id
    scrollIntoView: '',
    // 内部 minDate/maxDate 处理后的时间戳
    _minTime: 0,
    _maxTime: 0,
    // 内联渲染标志
    _inline: false,
  },

  observers: {
    show(visible) {
      if (visible || this.data._inline) {
        this._initCalendar()
      }
    },
    defaultDate() {
      if (this.data.show || this.data._inline) {
        this._initCalendar()
      }
    },
    formatter() {
      if (this.data.show || this.data._inline) {
        this._applyFormatter()
      }
    },
  },

  lifetimes: {
    attached() {
      // poppable=false 时立即初始化（内联模式）
      if (!this.data.poppable) {
        this.setData({ _inline: true }, () => this._initCalendar())
      }
    },
  },

  methods: {
    // 初始化日历
    _initCalendar() {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      // 处理 minDate / maxDate 默认值（控制显示范围）
      let minDate = this.data.minDate ? parseDate(this.data.minDate) : new Date(today.getFullYear(), today.getMonth() - 6, 1)
      let maxDate = this.data.maxDate ? parseDate(this.data.maxDate) : new Date(today.getFullYear(), today.getMonth() + 6, 0)

      // 可选范围（默认与显示范围一致）
      const selectableMinDate = this.data.selectableMinDate ? parseDate(this.data.selectableMinDate) : minDate
      const selectableMaxDate = this.data.selectableMaxDate ? parseDate(this.data.selectableMaxDate) : maxDate
      const selectableMinTime = selectableMinDate.getTime()
      const selectableMaxTime = selectableMaxDate.getTime()

      // 处理 defaultDate（兼容 Date | number | string | 数组）
      const normalizedDefault = normalizeDefaultDate(this.data.defaultDate, this.data.type)

      // 生成月份列表
      const months = []
      const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
      while (cursor <= maxDate) {
        const y = cursor.getFullYear()
        const m = cursor.getMonth()
        const days = getMonthDays(y, m)
        const cells = []

        // 判断是否为首月/尾月
        const isFirstMonth = (y === minDate.getFullYear() && m === minDate.getMonth())
        const isLastMonth = (y === maxDate.getFullYear() && m === maxDate.getMonth())

        // 起始日：首月从 minDate 开始，否则从 1 号开始
        const startDay = isFirstMonth ? minDate.getDate() : 1
        // 结束日：尾月到 maxDate 结束，否则到月末
        const endDay = isLastMonth ? maxDate.getDate() : days

        // 前置空白：首月用 minDate 的星期对齐，否则用 1 号的星期
        const leadDay = isFirstMonth ? minDate : new Date(y, m, 1)
        const leadDow = leadDay.getDay()
        for (let i = 0; i < leadDow; i++) {
          cells.push({ type: 'empty', key: `e${i}` })
        }

        // 日期单元格
        for (let d = startDay; d <= endDay; d++) {
          const date = new Date(y, m, d)
          const dateStr = formatDate(date)
          const time = date.getTime()

          // disabled 基于 selectableMinDate/selectableMaxDate，与显示范围分离
          const disabled = (time < selectableMinTime || time > selectableMaxTime)
          const isToday = isSameDay(date, today)
          cells.push({
            type: 'day',
            date: dateStr,
            day: d,
            time,
            disabled,
            isToday,
            key: dateStr,
            // 状态：normal | selected | start | middle | end
            state: 'normal',
            // 自定义底部文字
            bottomInfo: '',
          })
        }

        months.push({
          id: `m${y}${String(m + 1).padStart(2, '0')}`,
          year: y,
          month: m + 1,
          title: `${y}年${m + 1}月`,
          cells,
        })

        cursor.setMonth(cursor.getMonth() + 1)
      }

      // 初始化选中值
      let currentValue = null
      if (this.data.type === 'single') {
        const d = Array.isArray(normalizedDefault) ? normalizedDefault[0] : normalizedDefault
        currentValue = d ? formatDate(d) : ''
      } else if (this.data.type === 'range') {
        if (Array.isArray(normalizedDefault) && normalizedDefault.length === 2) {
          const [s, e] = normalizedDefault
          currentValue = [
            s ? formatDate(s) : '',
            e ? formatDate(e) : '',
          ]
        } else if (normalizedDefault) {
          currentValue = [formatDate(normalizedDefault), '']
        } else {
          currentValue = ['', '']
        }
      } else if (this.data.type === 'multiple') {
        const arr = Array.isArray(normalizedDefault) ? normalizedDefault : (normalizedDefault ? [normalizedDefault] : [])
        currentValue = arr.map(d => formatDate(d))
      }

      this.setData({
        months,
        currentValue,
        _minTime: minDate.getTime(),
        _maxTime: maxDate.getTime(),
        scrollIntoView: '',
      }, () => {
        // 应用选中状态
        this._applySelection()
        // 滚动到当前月份
        const todayMonth = months.find(m => m.year === today.getFullYear() && m.month === today.getMonth() + 1)
        if (todayMonth) {
          this.setData({ scrollIntoView: todayMonth.id })
        }
      })
    },

    // 应用选中状态到 cells
    _applySelection() {
      const { months, currentValue, type } = this.data
      months.forEach(month => {
        month.cells.forEach(cell => {
          if (cell.type !== 'day') return
          cell.state = 'normal'

          if (type === 'single') {
            if (cell.date === currentValue) {
              cell.state = 'selected'
            }
          } else if (type === 'range') {
            const [start, end] = currentValue || ['', '']
            if (start && cell.date === start) {
              cell.state = 'start'
              if (end && start === end) {
                cell.state = 'start-end'
              }
            } else if (end && cell.date === end) {
              cell.state = 'end'
            } else if (start && end && isDateInRange(cell.date, start, end)) {
              cell.state = 'middle'
            }
          } else if (type === 'multiple') {
            if (Array.isArray(currentValue) && currentValue.includes(cell.date)) {
              cell.state = 'selected'
            }
          }
        })
      })
      // 应用 formatter（设置 bottomInfo / topInfo / className）
      this._applyFormatter(months)
      this.setData({ months })
      this._updateSelectedText()
    },

    // 应用自定义 formatter（Vant 兼容：接收 day 对象，返回 day 对象）
    _applyFormatter(monthsArr) {
      const formatter = this.data.formatter
      if (typeof formatter !== 'function') return
      const months = monthsArr || this.data.months
      months.forEach(month => {
        month.cells.forEach(cell => {
          if (cell.type !== 'day') return
          // 构造 Vant 兼容的 day 对象
          const dayObj = {
            type: cell.disabled ? 'disabled' : cell.state,
            date: new Date(cell.date),
            text: String(cell.day),
            topInfo: cell.topInfo || '',
            bottomInfo: cell.bottomInfo || '',
            className: cell.className || '',
          }
          try {
            const result = formatter(dayObj)
            if (result) {
              cell.topInfo = result.topInfo || ''
              cell.bottomInfo = result.bottomInfo || ''
              cell.className = result.className || ''
            }
          } catch (err) {
            console.warn('[zy-calendar] formatter error:', err)
          }
        })
      })
    },

    // 更新底部确认按钮文字
    _updateSelectedText() {
      const { currentValue, type } = this.data
      let text = ''
      if (type === 'single') {
        text = currentValue || ''
      } else if (type === 'range') {
        const [start, end] = currentValue || ['', '']
        if (start && end) {
          text = `${start} 至 ${end}`
        } else if (start) {
          text = `选择结束日期`
        }
      } else if (type === 'multiple') {
        const arr = currentValue || []
        text = arr.length ? `已选 ${arr.length} 天` : ''
      }
      this.setData({ selectedText: text })
    },

    // 点击日期
    // 事件载荷与 Vant calendar 对齐：
    //   - single:  event.detail = Date
    //   - range:   event.detail = [Date] | [Date, Date]
    //   - multiple:event.detail = [Date, ...]
    // select 在每次点击时触发；range 选满且 showConfirm=false 时触发 confirm 并关闭
    onDayTap(e) {
      const { date } = e.currentTarget.dataset
      const cell = this._findCell(date)
      if (!cell || cell.disabled) return

      const { type, allowSameDay } = this.data
      let currentValue = this.data.currentValue

      if (type === 'single') {
        currentValue = date
        this.setData({ currentValue })
        this._applySelection()
        this.triggerEvent('select', new Date(date))
        if (!this.data.showConfirm) {
          this.triggerEvent('confirm', new Date(date))
          this.onClose()
        }
      } else if (type === 'range') {
        let [start, end] = currentValue || ['', '']
        if (!start || (start && end)) {
          // 新一轮选择
          start = date
          end = ''
        } else {
          // 选择结束
          if (new Date(date).getTime() < new Date(start).getTime()) {
            // 比开始还早，重新开始
            start = date
            end = ''
          } else if (date === start && !allowSameDay) {
            // 同一天且不允许，重新开始
            start = date
            end = ''
          } else {
            end = date
          }
        }
        currentValue = [start, end]
        this.setData({ currentValue })
        this._applySelection()
        // select 事件：始终 emit 当前选择数组（含 0/1/2 个 Date）
        const selectPayload = end
          ? [new Date(start), new Date(end)]
          : [new Date(start)]
        this.triggerEvent('select', selectPayload)
        // range 选满后触发 change + 自动确认
        if (start && end) {
          this.triggerEvent('change', [new Date(start), new Date(end)])
          if (!this.data.showConfirm) {
            this.triggerEvent('confirm', [new Date(start), new Date(end)])
            this.onClose()
          }
        }
      } else if (type === 'multiple') {
        const arr = (currentValue || []).slice()
        const idx = arr.indexOf(date)
        if (idx > -1) {
          arr.splice(idx, 1)
        } else {
          arr.push(date)
          arr.sort()
        }
        currentValue = arr
        this.setData({ currentValue })
        this._applySelection()
        this.triggerEvent('select', arr.map(d => new Date(d)))
        this.triggerEvent('change', arr.map(d => new Date(d)))
      }
    },

    // 查找单元格
    _findCell(date) {
      for (const month of this.data.months) {
        for (const cell of month.cells) {
          if (cell.type === 'day' && cell.date === date) return cell
        }
      }
      return null
    },

    // 确认按钮
    onConfirm() {
      const { currentValue, type } = this.data
      let payload
      if (type === 'single') {
        payload = currentValue ? new Date(currentValue) : null
      } else if (type === 'range') {
        const [start, end] = currentValue || ['', '']
        if (!start || !end) {
          wx.showToast({ title: '请选择完整日期范围', icon: 'none' })
          return
        }
        payload = [new Date(start), new Date(end)]
      } else {
        payload = (currentValue || []).map(d => new Date(d))
      }
      this.triggerEvent('confirm', payload)
      this.onClose()
    },

    // 关闭
    onClose() {
      this.triggerEvent('close')
    },

    // 阻止冒泡
    noop() {},
  },
})
