const { CartService } = require('./CartService')
const { requireLogin } = require('../../utils/require-login')

const pageI18n = require('../../utils/page-i18n.js')
const { ListBehavior } = require('../../behaviors/listBehavior')
const { thumbUrl } = require('../../utils/cloudThumb')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior],
  data: {
    cartItems: [],
    isAllChecked: false,
    checkedCount: 0,
    totalPrice: '0.00',
    invalidCount: 0,
  },

  onLoad() {
    this._initNavbarHeight()
  },

  onShow() {
    this._refreshCart()
    this._validateCartItems()
  },

  _refreshCart() {
    const cartItems = CartService.getCart()
    const validItems = cartItems.filter(i => !i._invalid)
    const checkedItems = validItems.filter(i => i.checked)
    const total = checkedItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
    this.setData({
      cartItems,
      isAllChecked: validItems.length > 0 && checkedItems.length === validItems.length,
      checkedCount: checkedItems.length,
      totalPrice: total.toFixed(2),
      invalidCount: cartItems.filter(i => i._invalid).length,
    })
    this._resolveCloudUrls(cartItems)
  },

  async _resolveCloudUrls(cartItems) {
    const cloudIds = []
    const indexMap = {}
    for (let i = 0; i < cartItems.length; i++) {
      const url = cartItems[i].productImage || ''
      if (url.startsWith('cloud://')) {
        cloudIds.push(url)
        if (!indexMap[url]) {indexMap[url] = []}
        indexMap[url].push(i)
      }
    }
    if (cloudIds.length === 0) {return}

    const uniqueCloudIds = [...new Set(cloudIds)]
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: uniqueCloudIds })
      const updates = {}
      for (const f of res.fileList || []) {
        if (f.tempFileURL && indexMap[f.fileID]) {
          for (const idx of indexMap[f.fileID]) {
            updates[`cartItems[${idx}].productImage`] = thumbUrl(f.tempFileURL)
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        this.setData(updates)
      }
    } catch (e) {
      console.error('[Cart] 解析cloud URL失败:', e)
    }
  },

  async _validateCartItems() {
    const cartItems = CartService.getCart()
    if (cartItems.length === 0) {return}

    const productIds = [...new Set(cartItems.map(item => item.productId))]
    try {
      const res = await wx.cloud.callFunction({
        name: 'mallService',
        data: {
          action: 'checkCartItems',
          productIds,
        },
        timeout: 20000,
      })
      const result = res.result
      if (result && result.code === 0 && result.data) {
        const statusMap = result.data
        let changed = false
        for (const item of cartItems) {
          const info = statusMap[item.productId]
          const wasInvalid = item._invalid
          if (info === undefined) {
            item._invalid = true
            item._invalidReason = '商品已删除'
          } else if (info.status !== 'on_sale') {
            item._invalid = true
            item._invalidReason = info.status === 'off_sale' ? '商品已下架' : '商品不可购买'
          } else {
            item._invalid = false
            delete item._invalidReason
            if (info.coverUrl) {
              const currentIsCloud = (item.productImage || '').startsWith('cloud://')
              const currentIsEmpty = !item.productImage
              if (currentIsCloud || currentIsEmpty || item.productImage !== info.coverUrl) {
                item.productImage = info.coverUrl
                changed = true
              }
            }
            if (info.name && info.name !== item.productName) {
              item.productName = info.name
              changed = true
            }
            if (info.price && info.price !== item.price) {
              item.price = info.price
              changed = true
            }
          }
          if (item._invalid && item.checked) {
            item.checked = false
            changed = true
          }
          if (wasInvalid !== item._invalid) {changed = true}
        }
        if (changed) {CartService.saveCart(cartItems)}
        this._refreshCart()
      }
    } catch (e) {
      console.error('[Cart] 校验商品状态失败:', e)
    }
  },

  onToggleCheck(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.cartItems.find(i => i.cartItemId === id)
    if (item && item._invalid) {
      this.error('PRODUCT_INVALID')
      return
    }
    CartService.toggleCheck(id)
    this._refreshCart()
  },

  onToggleCheckAll() {
    const validItems = this.data.cartItems.filter(i => !i._invalid)
    const allChecked = validItems.length > 0 && validItems.every(i => i.checked)
    CartService.toggleCheckAll(!allChecked)
    const cartItems = CartService.getCart()
    for (const item of cartItems) {
      if (item._invalid) {item.checked = false}
    }
    CartService.saveCart(cartItems)
    this._refreshCart()
  },

  onChangeQuantity(e) {
    const { id, action } = e.currentTarget.dataset
    const item = this.data.cartItems.find(i => i.cartItemId === id)
    if (!item || item._invalid) {return}
    const newQty = action === 'plus' ? item.quantity + 1 : item.quantity - 1
    if (newQty < 1) {return}
    CartService.updateQuantity(id, newQty)
    this._refreshCart()
  },

  onDeleteItem(e) {
    CartService.removeItem(e.currentTarget.dataset.id)
    this._refreshCart()
  },

  onClearInvalid() {
    const cart = CartService.getCart().filter(i => !i._invalid)
    CartService.saveCart(cart)
    this._refreshCart()
  },

  onGoDetail(e) {
    const productId = e.currentTarget.dataset.id
    const item = this.data.cartItems.find(i => i.productId === productId)
    if (item && item._invalid) {return}
    wx.navigateTo({ url: `/subpackages/mall/product-detail?id=${productId}` })
  },

  onCartImageError(e) {
    const index = e.currentTarget.dataset.index
    if (index === undefined) {return}
    this.setData({ [`cartItems[${index}].productImage`]: '/images/default-product.svg' })
  },

  onGoShopping() {
    wx.navigateBack()
  },

  async onCheckout() {
    if (!(await requireLogin())) {return}
    const checkedItems = CartService.getCheckedItems().filter(i => !i._invalid)
    if (checkedItems.length === 0) {
      this.error('PRODUCT_SELECT_REQUIRED')
      return
    }
    const cartData = encodeURIComponent(JSON.stringify(checkedItems))
    wx.navigateTo({ url: `/subpackages/mall/order-confirm?fromCart=1&cartData=${cartData}` })
  },
})
