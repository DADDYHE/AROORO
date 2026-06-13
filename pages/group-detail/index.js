const { TuanService } = require('../../services/TuanService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const pageI18n = require('../../utils/page-i18n.js')
const { buildSharePath } = require('../../utils/share')
const { CLOUD_ICONS } = require('../../utils/cloudIcons')
const skuHelper = require('../../utils/skuHelper')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior],

  data: {
    dealId: '',
    deal: null,
    products: [],
    totalSkuCount: 0,
    selectedProductIndex: -1,
    selectedSkuId: '',
    quantity: 1,
    loading: true,
    showBuyModal: false,
    totalPrice: '0.00',
    popupSpecGroups: [],
    selectedSpecs: {},
    allSpecsSelected: false,
    skuPopupPrice: '',
    skuPopupStock: 0,
    skuPopupImage: '',
    selectedSkuText: '',
    iconShoppingCart: CLOUD_ICONS.SHOPPING_CART,
    iconService: CLOUD_ICONS.SERVICE,
  },

  onLoad(options) {
    const dealId = options.dealId || options.id || ''
    if (dealId) {
      this.setData({ dealId })
      this._loadDealDetail(dealId)
    } else {
      this.error('INVALID_PARAMS')
      wx.navigateBack()
    }
  },

  onShareAppMessage() {
    const deal = this.data.deal
    const basePath = `/pages/group-detail/index?dealId=${this.data.dealId}`
    return {
      title: deal ? `${deal.title} - 拼团优惠` : '超值拼团',
      path: buildSharePath(basePath),
    }
  },

  async _loadDealDetail(dealId) {
    this.setData({ loading: true })
    try {
      const res = await TuanService.getTuanDealDetail({ dealId })
      const data = res?.data || res || {}
      const deal = data.code === 0 ? data.data : data
      const products = (deal.products || []).map(p => {
        let displayPrice = ''
        if (p.skuType === 'multi' && p.skus && p.skus.length > 0) {
          const enabledSkus = p.skus.filter(s => s.enabled !== false)
          const prices = enabledSkus.map(s => Number(s.tuanPrice) || Number(s.price) || 0).filter(v => v > 0)
          if (prices.length > 0) {
            const min = Math.min(...prices)
            const max = Math.max(...prices)
            displayPrice = min === max ? String(min) : `${min}-${max}`
          } else {
            displayPrice = String(Number(p.tuanPrice) || Number(p.price) || 0)
          }
        } else {
          displayPrice = String(Number(p.tuanPrice) || Number(p.price) || 0)
        }
        return {
          ...p,
          price: p.tuanPrice || p.price || 0,
          tuanStock: p.stock || p.tuanStock || 0,
          displayPrice,
        }
      })
      const totalSkuCount = products.reduce((sum, p) => {
        if (p.skuType === 'multi' && p.skus && p.skus.length > 0) {
          return sum + p.skus.filter(s => s.enabled !== false).length
        }
        return sum + 1
      }, 0)
      this.setData({ deal, products, totalSkuCount, loading: false })
    } catch (e) {
      this.error('LOAD_FAILED')
      this.setData({ loading: false })
    }
  },

  onProductTap(e) {
    const { index } = e.currentTarget.dataset
    const product = this.data.products[index]
    if (product.productId) {
      wx.navigateTo({ url: `/subpackages/mall/product-detail?productId=${product.productId}` })
      return
    }
    this._openBuyModal(index)
  },

  onBuyTap(e) {
    const { index } = e.currentTarget.dataset
    this._openBuyModal(index)
  },

  _openBuyModal(index) {
    const product = this.data.products[index]
    let popupSpecGroups = []

    if (product.skuType === 'multi' && product.specGroups && product.specGroups.length > 0) {
      popupSpecGroups = skuHelper.buildPopupSpecGroups(product)
    } else if (product.skuType === 'multi' && product.skus && product.skus.length > 0) {
      popupSpecGroups = skuHelper.buildFallbackSpecGroups(product)
    }

    this.setData({
      selectedProductIndex: index,
      selectedSkuId: '',
      quantity: 1,
      showBuyModal: true,
      popupSpecGroups,
      selectedSpecs: {},
      allSpecsSelected: popupSpecGroups.length === 0,
      selectedSkuText: '',
      skuPopupPrice: skuHelper.formatPrice(product.tuanPrice || product.price || 0),
      skuPopupStock: product.tuanStock || product.stock || 0,
      skuPopupImage: product.image || '',
    })

    if (popupSpecGroups.length > 0) {
      this._updateDisabledValues()
      this._updateSkuPopupState()
    } else {
      this._updateTotalPrice()
    }
  },

  _updateDisabledValues() {
    const { products, selectedProductIndex, popupSpecGroups, selectedSpecs } = this.data
    const product = products[selectedProductIndex]
    if (!product) { return }

    const updatedGroups = skuHelper.updateDisabledValues(product, popupSpecGroups, selectedSpecs)
    this.setData({ popupSpecGroups: updatedGroups })
  },

  _findMatchedSku() {
    const { products, selectedProductIndex, selectedSpecs, popupSpecGroups } = this.data
    const product = products[selectedProductIndex]
    return skuHelper.findMatchedSku(product, selectedSpecs, popupSpecGroups)
  },

  _updateSkuPopupState() {
    const { products, selectedProductIndex, popupSpecGroups, selectedSpecs } = this.data
    const product = products[selectedProductIndex]
    if (!product) { return }

    const allSelected = popupSpecGroups.every(g => selectedSpecs[g.specId] && selectedSpecs[g.specId] !== '')
    const matchedSku = allSelected ? this._findMatchedSku() : null

    let skuPopupPrice = skuHelper.formatPrice(product.tuanPrice || product.price || 0)
    let skuPopupStock = product.tuanStock || product.stock || 0
    let skuPopupImage = product.image || ''
    let selectedSkuText = ''
    let selectedSkuId = ''

    if (matchedSku) {
      skuPopupPrice = skuHelper.formatPrice(Number(matchedSku.tuanPrice) || Number(matchedSku.price) || 0)
      skuPopupStock = Number(matchedSku.tuanStock || matchedSku.stock || 0)
      if (matchedSku.image) { skuPopupImage = matchedSku.image }
      selectedSkuText = popupSpecGroups.map(g => selectedSpecs[g.specId]).join(' / ')
      selectedSkuId = matchedSku.skuId || ''
    } else if (allSelected) {
      skuPopupStock = 0
    } else {
      const parts = popupSpecGroups
        .filter(g => selectedSpecs[g.specId] && selectedSpecs[g.specId] !== '')
        .map(g => selectedSpecs[g.specId])
      selectedSkuText = parts.length > 0 ? `已选: ${parts.join(' / ')}` : ''
    }

    this.setData({
      allSpecsSelected: allSelected && Boolean(matchedSku),
      skuPopupPrice,
      skuPopupStock,
      skuPopupImage,
      selectedSkuText,
      selectedSkuId,
    })
    this._updateTotalPrice()
  },

  onPopupSelectSpec(e) {
    const { specId, value } = e.currentTarget.dataset
    const { selectedSpecs, popupSpecGroups } = this.data
    const group = popupSpecGroups.find(g => g.specId === specId)
    if (!group) { return }

    const currentVal = selectedSpecs[specId] || ''
    const newSpecs = { ...selectedSpecs }

    if (currentVal === value) {
      newSpecs[specId] = ''
    } else {
      newSpecs[specId] = value
      const groupIndex = popupSpecGroups.findIndex(g => g.specId === specId)
      for (let i = groupIndex + 1; i < popupSpecGroups.length; i++) {
        newSpecs[popupSpecGroups[i].specId] = ''
      }
    }

    this.setData({ selectedSpecs: newSpecs })
    const updatedGroups = this.data.popupSpecGroups.map(g => ({
      ...g,
      selectedValue: newSpecs[g.specId] || '',
    }))
    this.setData({ popupSpecGroups: updatedGroups })
    this._updateDisabledValues()
    this._updateSkuPopupState()
  },

  onQuantityMinus() {
    if (this.data.quantity <= 1) { return }
    const quantity = this.data.quantity - 1
    this.setData({ quantity })
    this._updateTotalPrice()
  },

  onQuantityPlus() {
    const product = this.data.products[this.data.selectedProductIndex]
    let maxStock = product.tuanStock || product.stock || 99
    const matchedSku = this._findMatchedSku()
    if (matchedSku) {
      maxStock = Number(matchedSku.tuanStock || matchedSku.stock || 0) || 99
    }
    if (this.data.quantity >= maxStock) {
      this.error('STOCK_INSUFFICIENT')
      return
    }
    const quantity = this.data.quantity + 1
    this.setData({ quantity })
    this._updateTotalPrice()
  },

  onQuantityInput(e) {
    const val = parseInt(e.detail.value, 10) || 1
    const quantity = Math.max(1, val)
    this.setData({ quantity })
    this._updateTotalPrice()
  },

  _updateTotalPrice() {
    const product = this.data.products[this.data.selectedProductIndex]
    if (!product) {
      this.setData({ totalPrice: '0.00' })
      return
    }
    let price = Number(product.tuanPrice || product.price || 0)
    const matchedSku = this._findMatchedSku()
    if (matchedSku) {
      price = Number(matchedSku.tuanPrice) || Number(matchedSku.price) || price
    }
    const total = price * this.data.quantity
    this.setData({ totalPrice: total.toFixed(2) })
  },

  onCloseBuyModal() {
    this.setData({ showBuyModal: false })
  },

  onSubmitOrder() {
    const product = this.data.products[this.data.selectedProductIndex]
    if (!product) { return }
    const quantity = this.data.quantity
    let tuanPrice = Number(product.tuanPrice || product.price || 0)
    let specText = ''
    let skuId = ''

    if (product.skuType === 'multi') {
      const matchedSku = this._findMatchedSku()
      if (matchedSku) {
        tuanPrice = Number(matchedSku.tuanPrice) || Number(matchedSku.price) || tuanPrice
        specText = matchedSku.specText || ''
        skuId = matchedSku.skuId || ''
      } else if (!this.data.allSpecsSelected) {
        this.error('SPEC_REQUIRED')
        return
      }
    }

    const params = {
      orderType: 'tuan',
      dealId: this.data.dealId,
      productId: product.productId || '',
      skuId,
      specText,
      quantity,
      tuanPrice,
      productName: product.name || '',
      productImage: product.image || '',
    }
    const encoded = encodeURIComponent(JSON.stringify(params))
    this.setData({ showBuyModal: false })
    wx.navigateTo({ url: `/subpackages/mall/order-confirm?fromTuan=1&tuanData=${encoded}` })
  },

  onImagePreview(e) {
    const { urls, index } = e.currentTarget.dataset
    wx.previewImage({ urls: urls || [], current: urls[index] || '' })
  },

  onBack() {
    wx.navigateBack()
  },
})
