const i18n = require('../../utils/i18n')

Component({
  properties: {
    item: {
      type: Object,
      value: {},
    },
    locale: {
      type: String,
      value: '',
    },
  },

  observers: {
    'item.category, locale': function(category, locale) {
      const categoryMap = {
        outdoor: i18n.t('CATEGORY_OUTDOOR', locale),
        social: i18n.t('CATEGORY_SOCIAL', locale),
        training: i18n.t('CATEGORY_TRAINING', locale),
        health: i18n.t('CATEGORY_HEALTH', locale),
      }
      this.setData({
        categoryText: categoryMap[category] || category,
        statusText: this._getStatusText(locale),
        priceText: this._getPriceText(locale),
      })
    },
  },

  data: {
    categoryText: '',
    statusText: '',
    priceText: '',
  },

  methods: {
    _getStatusText(locale) {
      const { item } = this.data
      if (item.isEnded) {
        return i18n.t('ACTIVITY_ENDED', locale) || '已结束'
      }
      if (item.registrationEnded) {
        return i18n.t('REGISTRATION_ENDED', locale) || '已截止'
      }
      return i18n.t('REGISTRATION_OPEN', locale) || '报名中'
    },

    _getPriceText(locale) {
      const { item } = this.data
      if (item.pricePerPerson > 0 && item.pricePerPet > 0) {
        return `¥${item.pricePerPerson}${i18n.t('PRICE_PERSON', locale) || '/人'} ¥${item.pricePerPet}${i18n.t('PRICE_PET', locale) || '/宠'}`
      }
      if (item.pricePerPerson > 0) {
        return `¥${item.pricePerPerson}${i18n.t('PRICE_PERSON', locale) || '/人'}`
      }
      if (item.pricePerPet > 0) {
        return `¥${item.pricePerPet}${i18n.t('PRICE_PET', locale) || '/宠'}`
      }
      return i18n.t('FREE', locale) || '免费'
    },

    onTap() {
      const { item } = this.data
      if (item && item._id) {
        this.triggerEvent('tap', { id: item._id })
      }
    },
  },
})
