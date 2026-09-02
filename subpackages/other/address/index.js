const __i18n = require('../../../utils/i18n.js')
const __pageI18n = require('../../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { AddressService } = require('../../../utils/AddressService')
const app = getApp()

const pageI18n = require('../../../utils/page-i18n.js')
const { ListBehavior } = require('../../../behaviors/listBehavior')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    addresses: [],
    selectedAddressId: '',
    isLoading: false,
    showEditPopup: false,
    editingAddress: null,
    regionValue: [],
  },

  onLoad(options) {
    this._initNavbarHeight()
    this.loadAddresses()
    if (options.selectedId) {
      this.setData({ selectedAddressId: options.selectedId })
    }
  },

  onShow() {
    this.loadAddresses(true)
  },

  goBack() {
    wx.navigateBack()
  },

  async loadAddresses(forceRefresh = false) {
    this.setData({ isLoading: true })
    try {
      const result = await AddressService.getList(forceRefresh)
      if (result && result.code === 0) {
        this.setData({ addresses: result.data || [] })
      }
    } catch (error) {
      console.error('[APP] 加载地址列表失败:', error)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  selectAddress(e) {
    const addressId = e.currentTarget.dataset.id
    const address = this.data.addresses.find(item => item._id === addressId)
    if (address) {
      app.globalData.selectedAddress = address
      wx.navigateBack({
        delta: 1,
        success: () => {
          setTimeout(() => {
            const pages = getCurrentPages()
            const prevPage = pages[pages.length - 1]
            if (prevPage && typeof prevPage.onAddressSelected === 'function') {
              prevPage.onAddressSelected(address)
            }
          }, 100)
        },
      })
    }
  },

  addManual() {
    this.setData({
      editingAddress: {
        name: '',
        phone: '',
        province: '',
        city: '',
        district: '',
        detail: '',
        isDefault: this.data.addresses.length === 0,
      },
      regionValue: [],
      showEditPopup: true,
    })
  },

  editAddress(e) {
    const addressId = e.currentTarget.dataset.id
    const address = this.data.addresses.find(item => item._id === addressId)
    if (address) {
      const regionValue = [address.province || '', address.city || '', address.district || '']
      this.setData({
        editingAddress: { ...address },
        regionValue,
        showEditPopup: true,
      })
    }
  },

  closeEditPopup() {
    this.setData({
      showEditPopup: false,
      editingAddress: null,
      regionValue: [],
    })
  },

  onNameChange(e) {
    this.setData({ 'editingAddress.name': e.detail.value })
  },

  onPhoneChange(e) {
    this.setData({ 'editingAddress.phone': e.detail.value })
  },

  onRegionChange(e) {
    const region = e.detail.value
    this.setData({
      'editingAddress.province': region[0],
      'editingAddress.city': region[1],
      'editingAddress.district': region[2],
      regionValue: region,
    })
  },

  onDetailChange(e) {
    this.setData({ 'editingAddress.detail': e.detail.value })
  },

  onDefaultChange(e) {
    this.setData({ 'editingAddress.isDefault': e.detail.value })
  },

  async saveAddress() {
    const { editingAddress } = this.data

    if (!editingAddress.name || !editingAddress.name.trim()) {
      this.error('NAME_REQUIRED')
      return
    }

    if (!editingAddress.phone || !/^1[3-9]\d{9}$/.test(editingAddress.phone)) {
      this.error('PHONE_INVALID')
      return
    }

    if (!editingAddress.province || !editingAddress.city) {
      this.error('REGION_REQUIRED')
      return
    }

    if (!editingAddress.detail || !editingAddress.detail.trim()) {
      this.error('ADDRESS_DETAIL_REQUIRED')
      return
    }

    const address = {
      name: editingAddress.name.trim(),
      phone: editingAddress.phone.trim(),
      province: editingAddress.province,
      city: editingAddress.city,
      district: editingAddress.district || '',
      detail: editingAddress.detail.trim(),
      fullAddress: `${editingAddress.province}${editingAddress.city}${editingAddress.district || ''}${editingAddress.detail.trim()}`,
      isDefault: editingAddress.isDefault || false,
    }

    wx.showLoading({ title: __i18nT('BIZ_VTS3P8') })

    try {
      let result
      if (editingAddress._id) {
        result = await AddressService.update(editingAddress._id, address)
      } else {
        result = await AddressService.add(address)
      }

      if (result && result.code === 0) {
        this.setData({
          showEditPopup: false,
          editingAddress: null,
          regionValue: [],
        })
        await this.loadAddresses(true)
        this.toast('SAVE_SUCCESS')
      } else {
        this.errorDynamic(result?.message, 'SAVE_FAILED')
      }
    } catch (error) {
      this.error('SAVE_FAILED')
    } finally {
      wx.hideLoading()
    }
  },

  async setDefault(e) {
    const addressId = e.currentTarget.dataset.id
    try {
      const result = await AddressService.setDefault(addressId)
      if (result && result.code === 0) {
        await this.loadAddresses(true)
        this.toast('SET_DEFAULT_SUCCESS')
      }
    } catch (error) {
      this.error('SET_FAILED')
    }
  },

  deleteAddress(e) {
    const addressId = e.currentTarget.dataset.id
    const address = this.data.addresses.find(item => item._id === addressId)
    if (!addressId) {return}

    this.showModal({
      titleKey: 'BIZ_FROTRU',
      contentKey: 'BIZ_1IBQW7L',
      success: (confirmed) => {
        if (!confirmed) {return}
        this._doDeleteAddress(addressId)
      },
    })
  },

  async _doDeleteAddress(addressId) {
    try {
      const result = await AddressService.remove(addressId)
      if (result && result.code === 0) {
        this.toast('DELETE_SUCCESS')
        await this.loadAddresses(true)
      } else {
        this.errorDynamic(result?.message, 'DELETE_FAILED')
      }
    } catch (error) {
      console.error('[APP] 删除地址失败:', error)
      this.error('DELETE_FAILED')
    }
  },
})
