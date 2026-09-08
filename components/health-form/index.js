// ================================================================
// components/health-form · 宠物健康信息表单（全场景共用）
// ----------------------------------------------------------------
// 使用场景：
//   1. 寄养开单邀请填写页（subpackages/booking/invitation-fill）
//   2. 宠物档案编辑页（subpackages/pet/update-profile）
// 字段（与 petService.PetHealthInfo 对齐，均选填）：
//   medicalHistory 既往病史 / medications 药品使用 / supplements 保健品使用
//     —— 2026-09-08 结构升级：{ has: 'yes'|'no', detail: string }
//       （是/否二选一，选「是」需填详情；向后兼容旧字符串数据）
//   allergies 过敏源 / vaccines 疫苗接种（多条）
//   neutered 绝育情况 / dewormed 驱虫情况 / behaviorNotes 行为习惯备注
// 接口：
//   properties.value  —— PetHealthInfo 对象（外部初始化，兼容旧字符串）
//   事件 change       —— 任一字段变更时冒泡 { healthInfo }
// ================================================================

const EMPTY_NEUTERED = 'unknown'

/** 三字段旧字符串 → { has, detail } 兼容转换（旧数据填了内容视为「是」） */
function toYesNo(val) {
  if (val && typeof val === 'object') {
    return { has: val.has === 'yes' ? 'yes' : 'no', detail: String(val.detail || '') }
  }
  const str = String(val || '').trim()
  if (!str || str === '无') { return { has: 'no', detail: '' } }
  return { has: 'yes', detail: str }
}

Component({
  options: {
    styleIsolation: 'isolated',
  },

  properties: {
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
    collapsed: { type: Boolean, value: false },
  },

  data: {
    medicalHistory: { has: 'no', detail: '' },
    allergies: '',
    medications: { has: 'no', detail: '' },
    supplements: { has: 'no', detail: '' },
    dewormed: '',
    behaviorNotes: '',
    neutered: EMPTY_NEUTERED,
    neuteredOptions: [
      { value: 'yes', label: '已绝育' },
      { value: 'no', label: '未绝育' },
      { value: 'unknown', label: '不确定' },
    ],
    neuteredLabel: '不确定',
    vaccinated: 'no',
    expanded: true,
  },

  methods: {
    _normalize(v) {
      const d = {
        medicalHistory: toYesNo(v.medicalHistory),
        allergies: v.allergies || '',
        medications: toYesNo(v.medications),
        supplements: toYesNo(v.supplements),
        dewormed: v.dewormed || '',
        behaviorNotes: v.behaviorNotes || '',
        neutered: v.neutered || EMPTY_NEUTERED,
        vaccinated: v.vaccinated === 'yes' ? 'yes' : (Array.isArray(v.vaccines) && v.vaccines.length > 0 ? 'yes' : 'no'),
      }
      const opt = this.data.neuteredOptions.find(o => o.value === d.neutered)
      d.neuteredLabel = opt ? opt.label : '不确定'
      // 不重置 expanded：value 回流（onHealthChange）时保持当前展开/收起状态
      return d
    },

    _emit() {
      const { medicalHistory, allergies, medications, supplements, dewormed, behaviorNotes, neutered, vaccinated } = this.data
      this.triggerEvent('change', {
        healthInfo: {
          medicalHistory: { has: medicalHistory.has, detail: medicalHistory.detail },
          allergies,
          medications: { has: medications.has, detail: medications.detail },
          supplements: { has: supplements.has, detail: supplements.detail },
          dewormed,
          behaviorNotes,
          neutered,
          vaccinated,
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

    /** 三字段是/否切换：选「否」清空详情 */
    onHasToggle(e) {
      const { field, val } = e.currentTarget.dataset
      if (!field) { return }
      this.setData({ [`${field}.has`]: val === 'yes' ? 'yes' : 'no' })
      if (val !== 'yes') {
        this.setData({ [`${field}.detail`]: '' })
      }
      this._emit()
    },

    /** 三字段「是」状态的详情输入 */
    onYesDetailInput(e) {
      const { field } = e.currentTarget.dataset
      this.setData({ [`${field}.detail`]: e.detail.value })
      this._emit()
    },

    onNeuteredChange(e) {
      const idx = Number(e.detail.value) || 0
      const opt = this.data.neuteredOptions[idx]
      if (!opt) { return }
      this.setData({ neutered: opt.value, neuteredLabel: opt.label })
      this._emit()
    },

    /** 疫苗情况：已接种/未接种 */
    onVacToggle(e) {
      const val = e.currentTarget.dataset.val
      this.setData({ vaccinated: val === 'yes' ? 'yes' : 'no' })
      this._emit()
    },
  },
})