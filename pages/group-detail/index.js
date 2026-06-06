const { TuanService } = require('../../services/TuanService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')

const pageI18n = require('../../utils/page-i18n.js')

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
    iconShoppingCart: 'cloud://cloudbase-d7getcjqy33b13475.636c-cloudbase-d7getcjqy33b13475-1433773870/icons/shopping-cart-2-line.svg',
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

  onShow() {
  },

  onHide() {
  },

  onUnload() {
  },

  onShareAppMessage() {
    const deal = this.data.deal
    const inviterId = ((getApp().globalData.userInfo?.isPartner || getApp().globalData.userInfo?.permissions?.length) && getApp().globalData.userInfo?.openid) ? getApp().globalData.userInfo.openid : ''
    const basePath = `/pages/group-detail/index?dealId=${this.data.dealId}`
    return {
      title: deal ? `${deal.title} - 拼团优惠` : '超值拼团',
      path: inviterId ? `${basePath}&inviterId=${inviterId}` : basePath,
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
      console.error('[团购详情] 加载失败:', e)
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
    if (product.skuType === 'multi' && product.specGroups && product.specGroups.length > 0) {
      const popupSpecGroups = this._buildPopupSpecGroups(product)
      this.setData({
        selectedProductIndex: index,
        selectedSkuId: '',
        quantity: 1,
        showBuyModal: true,
        popupSpecGroups,
        selectedSpecs: {},
        allSpecsSelected: false,
        selectedSkuText: '',
        skuPopupPrice: this._formatPrice(product.tuanPrice || product.price || 0),
        skuPopupStock: product.tuanStock || product.stock || 0,
        skuPopupImage: product.image || '',
      })
      this._updateDisabledValues()
      this._updateSkuPopupState()
    } else if (product.skuType === 'multi' && product.skus && product.skus.length > 0) {
      const popupSpecGroups = this._buildFallbackSpecGroups(product)
      this.setData({
        selectedProductIndex: index,
        selectedSkuId: '',
        quantity: 1,
        showBuyModal: true,
        popupSpecGroups,
        selectedSpecs: {},
        allSpecsSelected: false,
        selectedSkuText: '',
        skuPopupPrice: this._formatPrice(product.tuanPrice || product.price || 0),
        skuPopupStock: product.tuanStock || product.stock || 0,
        skuPopupImage: product.image || '',
      })
      this._updateDisabledValues()
      this._updateSkuPopupState()
    } else {
      this.setData({
        selectedProductIndex: index,
        selectedSkuId: '',
        quantity: 1,
        showBuyModal: true,
        popupSpecGroups: [],
        selectedSpecs: {},
        allSpecsSelected: true,
        selectedSkuText: '',
        skuPopupPrice: this._formatPrice(product.tuanPrice || product.price || 0),
        skuPopupStock: product.tuanStock || product.stock || 0,
        skuPopupImage: product.image || '',
      })
      this._updateTotalPrice()
    }
  },

  _buildPopupSpecGroups(product) {
    if (!product.specGroups) return []
    return product.specGroups.map((group, index) => ({
      specId: group.specId || group.name || `spec_${index}`,
      name: group.name,
      values: group.values,
      selectedValue: '',
      disabledValues: {},
    }))
  },

  _buildFallbackSpecGroups(product) {
    if (!product.skus || product.skus.length === 0) return []
    const specTexts = product.skus
      .filter(s => s.enabled !== false)
      .map(s => s.specText || '')
      .filter(t => t)
    if (specTexts.length === 0) return []
    const uniqueTexts = [...new Set(specTexts)]
    return [{
      specId: 'fallback_spec',
      name: '规格',
      values: uniqueTexts,
      selectedValue: '',
      disabledValues: {},
    }]
  },

  _updateDisabledValues() {
    const { products, selectedProductIndex, popupSpecGroups, selectedSpecs } = this.data
    const product = products[selectedProductIndex]
    if (!product) return
    const enabledSkus = (product.skus || []).filter(s => s.enabled !== false && (Number(s.tuanStock || s.stock || 0) > 0))
    const updatedGroups = popupSpecGroups.map((group) => {
      const disabledValues = {}
      const otherSpecs = { ...selectedSpecs }
      delete otherSpecs[group.specId]
      const hasOtherSelections = Object.values(otherSpecs).some(v => v !== '')
      group.values.forEach(val => {
        if (hasOtherSelections) {
          const candidate = { ...otherSpecs, [group.specId]: val }
          const hasMatch = enabledSkus.some(sku => {
            if (sku.specIds) {
              return Object.keys(candidate).every(specId =>
                candidate[specId] === '' || sku.specIds[specId] === candidate[specId]
              )
            }
            return candidate[group.specId] === '' || (sku.specText || '').includes(candidate[group.specId])
          })
          disabledValues[val] = !hasMatch
        } else {
          if (group.specId === 'fallback_spec') {
            const hasMatch = enabledSkus.some(sku => (sku.specText || '') === val)
            disabledValues[val] = !hasMatch
          } else {
            const hasMatch = enabledSkus.some(sku => sku.specIds && sku.specIds[group.specId] === val)
            disabledValues[val] = !hasMatch
          }
        }
      })
      return { ...group, disabledValues }
    })
    this.setData({ popupSpecGroups: updatedGroups })
  },

  _findMatchedSku() {
    const { products, selectedProductIndex, selectedSpecs, popupSpecGroups } = this.data
    const product = products[selectedProductIndex]
    if (!product || !product.skus) return null
    const allSelected = popupSpecGroups.every(g => selectedSpecs[g.specId] && selectedSpecs[g.specId] !== '')
    if (!allSelected) return null

    if (popupSpecGroups.length === 1 && popupSpecGroups[0].specId === 'fallback_spec') {
      const specText = selectedSpecs['fallback_spec']
      return product.skus.find(sku => (sku.specText || '') === specText && sku.enabled !== false) || null
    }

    return product.skus.find(sku => {
      if (!sku.specIds) return false
      return popupSpecGroups.every(g => sku.specIds[g.specId] === selectedSpecs[g.specId])
    }) || null
  },

  _updateSkuPopupState() {
    const { products, selectedProductIndex, popupSpecGroups, selectedSpecs } = this.data
    const product = products[selectedProductIndex]
    if (!product) return

    const allSelected = popupSpecGroups.every(g => selectedSpecs[g.specId] && selectedSpecs[g.specId] !== '')
    const matchedSku = allSelected ? this._findMatchedSku() : null

    let skuPopupPrice = this._formatPrice(product.tuanPrice || product.price || 0)
    let skuPopupStock = product.tuanStock || product.stock || 0
    let skuPopupImage = product.image || ''
    let selectedSkuText = ''
    let selectedSkuId = ''

    if (matchedSku) {
      skuPopupPrice = this._formatPrice(Number(matchedSku.tuanPrice) || Number(matchedSku.price) || 0)
      skuPopupStock = Number(matchedSku.tuanStock || matchedSku.stock || 0)
      if (matchedSku.image) skuPopupImage = matchedSku.image
      selectedSkuText = popupSpecGroups.map(g => selectedSpecs[g.specId]).join(' / ')
      selectedSkuId = matchedSku.skuId || ''
    } else if (allSelected) {
      skuPopupStock = 0
    } else {
      const parts = popupSpecGroups
        .filter(g => selectedSpecs[g.specId] && selectedSpecs[g.specId] !== '')
        .map(g => selectedSpecs[g.specId])
      selectedSkuText = parts.length > 0 ? '已选: ' + parts.join(' / ') : ''
    }

    this.setData({
      allSpecsSelected: allSelected && !!matchedSku,
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
    if (!group) return

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

  _formatPrice(price) {
    const num = Number(price) || 0
    return num % 1 === 0 ? String(num) : num.toFixed(2)
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
    if (!product) return
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
