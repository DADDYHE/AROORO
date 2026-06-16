const { MallService } = require('./MallService')
const { CartService } = require('./CartService')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const { buildSharePath } = require('../../utils/share')
const skuHelper = require('../../utils/skuHelper')

const pageI18n = require('../../utils/page-i18n.js')
const { CLOUD_ICONS } = require('../../utils/cloudIcons')

Page({
  ...pageI18n.mixin(),
  behaviors: [cloudImageBehavior, shareEntryBehavior],
  data: {
    product: null,
    isLoading: true,
    currentImageIndex: 0,
    selectedSkuId: '',
    selectedSkuText: '',
    quantity: 1,
    discount: 0,
    error: null,
    cartCount: 0,
    displayPrice: '',
    displayOriginalPrice: '',
    skuPopupVisible: false,
    skuPopupMode: 'buy',
    skuPopupPrice: '',
    skuPopupStock: 0,
    skuPopupImage: '',
    popupSpecGroups: [],
    selectedSpecs: {},
    allSpecsSelected: false,
    iconShare: CLOUD_ICONS.SHARE,
    iconService: CLOUD_ICONS.SERVICE,
    iconShoppingCart: CLOUD_ICONS.SHOPPING_CART,
  },

  onLoad(options) {
    if (options.id) {
      this._loadProduct(options.id)
    } else {
      this.setData({ isLoading: false, error: '参数错误' })
      this.error('INVALID_PARAMS')
    }
  },

  onShow() {
    this.setData({ cartCount: CartService.getTotalCount() })
  },

  async _loadProduct(productId) {
    this.setData({ isLoading: true, error: null })
    try {
      const result = await MallService.getProductDetail(productId)
      if (result && result.code === 0) {
        const product = result.data
        let discount = 0
        if (product.originalPrice && product.originalPrice > product.price) {
          discount = Math.round((1 - product.price / product.originalPrice) * 100)
        }
        this.setData({ product, discount })
        this._updateDisplayPrice()
      } else {
        throw new Error('商品不存在')
      }
    } catch {
      this.setData({ product: null, error: '商品不存在或加载失败' })
      this.error('PRODUCT_NOT_FOUND')
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onImageChange(e) {
    this.setData({ currentImageIndex: e.detail.current })
  },

  onPreviewGalleryImage(e) {
    const url = e.currentTarget.dataset.url
    const images = this.data.product.images || [this.data.product.coverUrl || this.data.product.coverImage]
    wx.previewImage({ current: url, urls: images })
  },

  onPreviewDetailImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({ current: url, urls: this.data.product.detailImages || [] })
  },

  _updateDisplayPrice() {
    const { product, selectedSkuId } = this.data
    if (!product) {return}

    if (product.skuType === 'multi' && product.skus && product.skus.length > 0) {
      if (selectedSkuId) {
        const selectedSku = product.skus.find(s => s.skuId === selectedSkuId)
        if (selectedSku) {
          this.setData({
            displayPrice: `¥${selectedSku.price}`,
            displayOriginalPrice: selectedSku.originalPrice ? `¥${selectedSku.originalPrice}` : '',
            discount: selectedSku.originalPrice && selectedSku.originalPrice > selectedSku.price
              ? Math.round((1 - selectedSku.price / selectedSku.originalPrice) * 100) : 0,
          })
        }
      } else {
        const prices = product.skus.map(s => s.price)
        const minPrice = Math.min(...prices)
        const maxPrice = Math.max(...prices)
        this.setData({
          displayPrice: minPrice === maxPrice ? `¥${minPrice}` : `¥${minPrice} - ¥${maxPrice}`,
          displayOriginalPrice: '',
          discount: 0,
        })
      }
    } else {
      this.setData({
        displayPrice: `¥${product.price}`,
        displayOriginalPrice: product.originalPrice && product.originalPrice > product.price ? `¥${product.originalPrice}` : '',
        discount: product.originalPrice && product.originalPrice > product.price
          ? Math.round((1 - product.price / product.originalPrice) * 100) : 0,
      })
    }
  },

  _buildPopupSpecGroups() {
    const { product } = this.data
    if (!product) {return []}

    // 优先使用 specGroups，否则从 skus 推断
    if (product.specGroups && product.specGroups.length > 0) {
      return skuHelper.buildPopupSpecGroups(product)
    }
    return skuHelper.buildFallbackSpecGroups(product)
  },

  _updateDisabledValues() {
    const { product, popupSpecGroups, selectedSpecs } = this.data
    if (!product || !product.skus || !popupSpecGroups.length) {return}

    const updatedGroups = skuHelper.updateDisabledValues(product, popupSpecGroups, selectedSpecs)
    this.setData({ popupSpecGroups: updatedGroups })
  },

  _findMatchedSku() {
    const { product, selectedSpecs, popupSpecGroups } = this.data
    return skuHelper.findMatchedSku(product, selectedSpecs, popupSpecGroups)
  },

  _updateSkuPopupState() {
    const { product, selectedSpecs, popupSpecGroups } = this.data
    if (!product || !product.skus) {return}

    const allSpecsSelected = popupSpecGroups.length > 0 && popupSpecGroups.every(g => g.selectedValue && g.selectedValue !== '')
    const matchedSku = this._findMatchedSku()

    if (matchedSku) {
      this.setData({
        selectedSkuId: matchedSku.skuId,
        selectedSkuText: matchedSku.specText,
        skuPopupPrice: `¥${matchedSku.price}`,
        skuPopupStock: matchedSku.stock || 0,
        skuPopupImage: matchedSku.image || '',
        allSpecsSelected,
      })
      this._updateDisplayPrice()
    } else {
      const prices = product.skus.map(s => s.price)
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const totalStock = product.skus.reduce((sum, s) => sum + (s.stock || 0), 0)

      const selectedParts = Object.values(selectedSpecs).filter(v => v !== '')
      this.setData({
        selectedSkuId: '',
        selectedSkuText: selectedParts.length > 0 ? selectedParts.join(' / ') : '',
        skuPopupPrice: minPrice === maxPrice ? `¥${minPrice}` : `¥${minPrice} - ¥${maxPrice}`,
        skuPopupStock: totalStock,
        skuPopupImage: '',
        allSpecsSelected,
      })
    }
  },

  onOpenSkuPopup() {
    const popupSpecGroups = this._buildPopupSpecGroups()
    this.setData({
      skuPopupVisible: true,
      skuPopupMode: 'buy',
      popupSpecGroups,
      selectedSpecs: {},
      selectedSkuId: '',
      selectedSkuText: '',
      quantity: 1,
    })
    this._updateDisabledValues()
    this._updateSkuPopupState()
  },

  onCloseSkuPopup() {
    this.setData({ skuPopupVisible: false })
  },

  onPopupSelectSpec(e) {
    const specId = e.currentTarget.dataset.specId
    const value = e.currentTarget.dataset.value
    const { popupSpecGroups, selectedSpecs } = this.data

    const group = popupSpecGroups.find(g => g.specId === specId)
    if (!group || (group.disabledValues && group.disabledValues[value])) {return}

    const currentVal = selectedSpecs[specId] || ''
    const newSelectedSpecs = { ...selectedSpecs }

    if (currentVal === value) {
      newSelectedSpecs[specId] = ''
    } else {
      newSelectedSpecs[specId] = value
      const groupIndex = popupSpecGroups.findIndex(g => g.specId === specId)
      for (let i = groupIndex + 1; i < popupSpecGroups.length; i++) {
        newSelectedSpecs[popupSpecGroups[i].specId] = ''
      }
    }

    const updatedGroups = popupSpecGroups.map(g => ({
      ...g,
      selectedValue: newSelectedSpecs[g.specId] || '',
    }))

    this.setData({
      selectedSpecs: newSelectedSpecs,
      popupSpecGroups: updatedGroups,
      quantity: 1,
    })

    this._updateDisabledValues()
    this._updateSkuPopupState()
  },

  onChangeQuantity(e) {
    const type = e.currentTarget.dataset.type
    let { quantity } = this.data
    const { selectedSkuId, product } = this.data
    const maxStock = selectedSkuId
      ? (product.skus.find(s => s.skuId === selectedSkuId)?.stock || 99)
      : (product.totalStock || product.stock || 99)

    if (type === 'plus' && quantity < maxStock) {
      quantity++
    } else if (type === 'minus' && quantity > 1) {
      quantity--
    }
    this.setData({ quantity })
  },

  onSkuConfirm() {
    const { skuPopupMode, product, selectedSkuId, quantity, allSpecsSelected } = this.data
    if (!allSpecsSelected || !selectedSkuId) {
      this.error('SPEC_REQUIRED')
      return
    }

    this.setData({ skuPopupVisible: false })

    if (skuPopupMode === 'cart') {
      CartService.addItem(product, selectedSkuId, quantity)
      this.setData({ cartCount: CartService.getTotalCount() })
      this.toast('PRODUCT_ADD_TO_CART')
    } else {
      const url = `/subpackages/mall/order-confirm?productId=${product._id}&quantity=${quantity}&skuId=${selectedSkuId}`
      wx.navigateTo({ url })
    }
  },

  onBuyNow() {
    const { product } = this.data
    if (!product) {return}

    if (product.skuType === 'multi' && product.skus && product.skus.length > 0) {
      this.onOpenSkuPopup()
      this.setData({ skuPopupMode: 'buy' })
    } else {
      const url = `/subpackages/mall/order-confirm?productId=${product._id}&quantity=${this.data.quantity}`
      wx.navigateTo({ url })
    }
  },

  onAddToCart() {
    const { product } = this.data
    if (!product) {return}

    if (product.skuType === 'multi' && product.skus && product.skus.length > 0) {
      this.onOpenSkuPopup()
      this.setData({ skuPopupMode: 'cart' })
    } else {
      CartService.addItem(product, '', this.data.quantity)
      this.setData({ cartCount: CartService.getTotalCount() })
      this.toast('PRODUCT_ADD_TO_CART')
    }
  },

  onOpenCart() {
    wx.navigateTo({ url: '/subpackages/mall/cart' })
  },

  onCustomerService() {
    this.showModal({ titleKey: 'BIZ_BZJPR5', contentKey: 'BIZ_A0MKA1', showCancel: false })
  },

  onRetry() {
    const productId = this.data.product?._id
    if (productId) {this._loadProduct(productId)}
  },

  onShare() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    })
  },

  onShareAppMessage() {
    const { product } = this.data
    const basePath = `/subpackages/mall/product-detail?id=${product?._id}`
    return {
      title: product?.name || '宠物好物',
      path: buildSharePath(basePath),
      imageUrl: product?.coverUrl || product?.coverImage,
    }
  },

  onShareTimeline() {
    const { product } = this.data
    return {
      title: product?.name || '宠物好物',
      imageUrl: product?.coverUrl || product?.coverImage,
    }
  },

})
