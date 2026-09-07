// ================================================================
// components/health-form · 宠物健康信息表单（全场景共用）
// ----------------------------------------------------------------
// 使用场景：
//   1. 寄养开单邀请填写页（subpackages/booking/invitation-fill）
//   2. 宠物档案编辑页（subpackages/pet/update-profile）
//   3. 后续普通下单流程如需展示可复用
// 字段（与 petService.PetHealthInfo 对齐，均选填）：
//   medicalHistory 既往病史 / allergies 过敏源 / medications 药品使用
//   supplements 保养品使用 / vaccines 疫苗接种（多条）
//   neutered 绝育情况 / dewormed 驱虫情况 / behaviorNotes 行为习惯备注
// 接口：
//   properties.value  —— PetHealthInfo 对象（外部初始化）
//   事件 change       —— 任一字段变更时冒泡 { healthInfo }
// Skyline 兼容：picker/textarea 原生组件，无 clip-path/cursor
// ================================================================

const EMPTY_NEUTERED = 'unknown'

Component({
  options: {
    styleIsolation: 'isolated',
  },

  properties: {
    // 外部传入的已有健康信息（宠物档案回显）
    value: {
      type: Object,
      value: null,
      observer(val) {
        if (val && !this._synced) {
          this._synced = true
          this.setData(this._normalize(val))
        }
      },
    },
    // 是否折叠展示（默认展开）
    collapsed: { type: Boolean, value: false },
  },

  data: {
    medicalHistory: '',
    allergies: '',
    medications: '',
    supplements: '',
    dewormed: '',
    behaviorNotes: '',
    neutered: EMPTY_NEUTERED,
    neuteredOptions: [
      { value: 'yes', label: '已绝育' },
      { value: 'no', label: '未绝育' },
      { value: 'unknown', label: '不确定' },
    ],
    neuteredLabel: '不确定',
    vaccines: [], // [{ name, date }]
    expanded: false,
  },

  methods: {
    _normalize(v) {
      const d = {
        medicalHistory: v.medicalHistory || '',
        allergies: v.allergies || '',
        medications: v.medications || '',
        supplements: v.supplements || '',
        dewormed: v.dewormed || '',
        behaviorNotes: v.behaviorNotes || '',
        neutered: v.neutered || EMPTY_NEUTERED,
        vaccines: Array.isArray(v.vaccines) ? v.vaccines.map(x => ({ name: x.name || '', date: x.date || '' })) : [],
      }
      const opt = d.neuteredOptions.find(o => o.value === d.neutered)
      d.neuteredLabel = opt ? opt.label : '不确定'
      d.expanded = !this.data.collapsed
      return d
    },

    _emit() {
      const { medicalHistory, allergies, medications, supplements, dewormed, behaviorNotes, neutered, vaccines } = this.data
      this.triggerEvent('change', {
        healthInfo: {
          medicalHistory, allergies, medications, supplements, dewormed, behaviorNotes,
          neutered,
          vaccines: vaccines.filter(v => (v.name && v.name.trim()) || v.date),
        },
      })
    },

    onToggle() {
      this.setData({ expanded: !this.data.expanded })
    },

    onFieldInput(e) {
      const { field } = e.currentTarget.dataset
      this.setData({ [field]: e.detail.value })
      this._emit()
    },

    onNeuteredChange(e) {
      const idx = Number(e.detail.value) || 0
      const opt = this.data.neuteredOptions[idx]
      if (!opt) { return }
      this.setData({ neutered: opt.value, neuteredLabel: opt.label })
      this._emit()
    },

    onVaccineName(e) {
      const idx = e.currentTarget.dataset.index
      this.setData({ [`vaccines[${idx}].name`]: e.detail.value })
      this._emit()
    },

    onVaccineDate(e) {
      const idx = e.currentTarget.dataset.index
      this.setData({ [`vaccines[${idx}].date`]: e.detail.value })
      this._emit()
    },

    onAddVaccine() {
      if (this.data.vaccines.length >= 10) {
        wx.showToast({ title: '疫苗记录最多 10 条', icon: 'none' })
        return
      }
      this.setData({ vaccines: [...this.data.vaccines, { name: '', date: '' }] })
    },

    onRemoveVaccine(e) {
      const idx = e.currentTarget.dataset.index
      const vaccines = this.data.vaccines.filter((_, i) => i !== idx)
      this.setData({ vaccines })
      this._emit()
    },
  },
})
