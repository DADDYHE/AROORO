const __i18n = require('../../utils/i18n.js')
const __pageI18n = require('../../utils/page-i18n.js')
const __i18nT = (k) => __i18n.t(k, __i18n.getLocale())
const { MallService } = require('./MallService')
const { CouponService } = require('../../services/CouponService')
const { AddressService } = require('../../utils/AddressService')
const { TuanService } = require('../../services/TuanService')
const PaymentService = require('../../services/PaymentService')
const { ListBehavior } = require('../../behaviors/listBehavior')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const { computeFinalAmount } = require('../../utils/coupon-amount')
const couponSelectorBehavior = require('../../behaviors/couponSelectorBehavior')
const { requireLogin } = require('../../utils/require-login')

const pageI18n = require('../../utils/page-i18n.js')

Page({
  ...pageI18n.mixin(),
  behaviors: [ListBehavior, cloudImageBehavior, couponSelectorBehavior],
  data: {
    t: __pageI18n.buildTMap(__i18n.getLocale()),
    isLoading: true,
    error: null,

    fromCart: false,
    fromTuan: false,
    tuanData: null,
    product: null,
    skuId: '',
    skuText: '',
    unitPrice: 0,
    quantity: 1,
    cartItems: [],

    totalAmount: 0,
    remark: '',
    submitting: false,

    address: null,

    selectedCouponId: '',
    selectedCoupon: null,
    availableCoupons: [],
    couponDiscount: 0,
    finalAmount: 0,
    showCouponSelector: false,
    loadingCoupons: false,
  },

  onLoad(options) {
    this._initNavbarHeight()
    if (options.fromTuan === '1' && options.tuanData) {
      try {
        const tuanData = JSON.parse(decodeURIComponent(options.tuanData))
        this.setData({ fromTuan: true, tuanData })
        this._applyTuanData(tuanData)
      } catch (e) {
        this.setData({ isLoading: false, error: '团购数据异常' })
      }
    } else if (options.fromCart === '1' && options.cartData) {
      this.setData({ fromCart: true })
      try {
        const cartItems = JSON.parse(decodeURIComponent(options.cartData))
        this._applyCartData(cartItems)
      } catch (e) {
        this.setData({ isLoading: false, error: '购物车数据异常' })
      }
    } else if (options.productId) {
      const quantity = parseInt(options.quantity, 10) || 1
      const skuId = options.skuId || ''
      this.setData({ quantity, skuId })
      this._loadProduct(options.productId, skuId, quantity)
    } else {
      this.setData({ isLoading: false, error: '参数错误' })
    }

    this._loadDefaultAddress()
  },

  // P1-4/P1-5 修复：按下单场景传入正确的 business 与 items
  //   - 商城：business='mall'，items=商品/规格（购物车场景聚合全部商品）
  //   - 团购：business='tuan'，items=dealId/productId/skuId
  _couponQueryOpts() {
    if (this.data.fromTuan) {
      const td = this.data.tuanData || {}
      return {
        business: 'tuan',
        items: [td.dealId, td.productId, this.data.skuId].filter(Boolean),
      }
    }
    const items = []
    if (this.data.fromCart) {
      (this.data.cartItems || []).forEach(it => {
        if (it.productId) {items.push(it.productId)}
        if (it.skuId) {items.push(it.skuId)}
      })
    } else if (this.data.product) {
      if (this.data.product._id) {items.push(this.data.product._id)}
      if (this.data.skuId) {items.push(this.data.skuId)}
    }
    return { business: 'mall', items: [...new Set(items)] }
  },

  onShow() {
    const app = getApp()
    const globalAddress = app.globalData.selectedAddress
    if (globalAddress) {
      this.setData({ address: globalAddress })
      app.globalData.selectedAddress = null
    }
  },

  _applyTuanData(tuanData) {
    const unitPrice = Number(tuanData.tuanPrice) || 0
    const quantity = Number(tuanData.quantity) || 1
    const totalAmount = Math.round(unitPrice * quantity * 100) / 100
    this.setData({
      skuId: tuanData.skuId || '',
      skuText: tuanData.specText || '',
      unitPrice,
      quantity,
      totalAmount,
      finalAmount: totalAmount,
      isLoading: false,
    })
    this._loadAvailableCoupons(this._couponQueryOpts())
  },

  async _loadProduct(productId, skuId, quantity) {
    this.setData({ isLoading: true, error: null })
    try {
      const result = await MallService.getProductDetail(productId)
      if (result && result.code === 0) {
        const product = result.data
        let skuText = ''
        let unitPrice = product.price

        if (product.skuType === 'multi' && skuId && product.skus) {
          const sku = product.skus.find(s => s.skuId === skuId)
          if (sku) {
            skuText = sku.specText || ''
            unitPrice = sku.price
          }
        }

        const totalAmount = Math.round(unitPrice * quantity * 100) / 100
        this.setData({
          product,
          skuText,
          unitPrice,
          totalAmount,
          finalAmount: totalAmount,
          isLoading: false,
        })
        this._loadAvailableCoupons(this._couponQueryOpts())
      } else {
        this.setData({ isLoading: false, error: '商品不存在' })
      }
    } catch (e) {
      this.setData({ isLoading: false, error: '加载失败' })
    }
  },

  _applyCartData(cartItems) {
    if (!cartItems || cartItems.length === 0) {
      this.setData({ isLoading: false, error: '购物车为空' })
      return
    }
    const totalAmount = cartItems.reduce((sum, item) => sum + Math.round((item.price || 0) * (item.quantity || 1) * 100) / 100, 0)
    this.setData({
      cartItems,
      totalAmount: Math.round(totalAmount * 100) / 100,
      finalAmount: Math.round(totalAmount * 100) / 100,
      isLoading: false,
    })
    this._loadAvailableCoupons(this._couponQueryOpts())
  },

  async _loadDefaultAddress() {
    try {
      const addr = await AddressService.getDefault()
      if (addr) {this.setData({ address: addr })}
    } catch (e) {
      // 获取默认地址失败不阻断主流程，静默忽略
    }
  },

  onGoAddressEdit() {
    wx.navigateTo({
      url: '/subpackages/other/address/index',
    })
  },

  onAddressSelected(address) {
    if (address) {
      this.setData({ address })
    }
  },

  onDecreaseQuantity() {
    if (this.data.fromTuan) {return}
    if (this.data.quantity <= 1) {return}
    const q = this.data.quantity - 1
    this._updateQuantity(q)
  },

  onIncreaseQuantity() {
    if (this.data.fromTuan) {return}
    const q = this.data.quantity + 1
    this._updateQuantity(q)
  },

  onQuantityInput(e) {
    if (this.data.fromTuan) {return}
    const q = parseInt(e.detail.value, 10) || 1
    this._updateQuantity(q < 1 ? 1 : q)
  },

  _updateQuantity(q) {
    const product = this.data.product
    const unitPrice = product ? this._getUnitPrice(product) : 0
    const totalAmount = Math.round(unitPrice * q * 100) / 100
    const updateData = { quantity: q, totalAmount }
    if (!this.data.selectedCouponId) {
      updateData.finalAmount = totalAmount
    }
    this.setData(updateData)
    this._loadAvailableCoupons(this._couponQueryOpts())
  },

  _getUnitPrice(product) {
    if (this.data.skuId && product.skuType === 'multi' && product.skus) {
      const sku = product.skus.find(s => s.skuId === this.data.skuId)
      if (sku) {return sku.price}
    }
    return product.price || 0
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  // P2 修复：原方法误命名 onToggleCouponSelector 且漏掉事件参数 e（引用未定义变量），
  //   导致头部无法展开选券面板；改为 onSelectCoupon（wxml 券项绑定），
  //   面板开关回落到 couponSelectorBehavior 的 onToggleCouponSelector。
  onSelectCoupon(e) {
    const { id, amount } = e.currentTarget.dataset
    const coupon = this.data.availableCoupons.find(c => c._id === id)
    if (!coupon) {return}

    // P2 修复：locked 券（正在其他订单中使用）明确提示，不允许选中
    if (coupon.status === 'locked') {
      wx.showToast({ title: '该优惠券正在使用中', icon: 'none' })
      return
    }

    const discountAmount = parseFloat(amount)
    const { finalAmount, couponDiscount, shouldClear } = computeFinalAmount(this.data.totalAmount, discountAmount)
    if (shouldClear) {
      // 免费订单不允许用券
      this.setData({
        selectedCouponId: '',
        selectedCoupon: null,
        couponDiscount: 0,
        finalAmount: 0,
        showCouponSelector: false,
      })
      return
    }

    this.setData({
      selectedCouponId: id,
      selectedCoupon: coupon,
      couponDiscount,
      finalAmount,
      showCouponSelector: false,
    })
  },

  onRemoveCoupon() {
    this.setData({
      selectedCouponId: '',
      selectedCoupon: null,
      couponDiscount: 0,
      finalAmount: this.data.totalAmount,
    })
  },

  async onSubmit() {
    if (this.data.submitting) {return}

    // 强制登录守卫：未登录→记录来源页并跳品牌登录页（含本页 options，回跳不丢参数）；
    // 登录成功后 navigateBack 回本页，用户重点提交即可。
    if (!(await requireLogin())) {return}

    const { address, fromTuan, tuanData } = this.data

    if (!address) {
      this.error('PAYMENT_REQUIRED_ADDRESS')
      return
    }

    this.setData({ submitting: true })

    if (fromTuan) {
      await this._submitTuanOrder(address)
      return
    }

    const { product, cartItems, fromCart, quantity, skuId, remark, totalAmount, selectedCouponId, couponDiscount, finalAmount } = this.data

    let lockedCouponId = null
    const orderId = `mall_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`

    try {
      if (selectedCouponId) {
        const lockRes = await CouponService.lockCoupon(selectedCouponId, orderId, 'mall_order', 'mall')
        if (lockRes && lockRes.code !== 0) {
          this.errorDynamic(lockRes.message, 'COUPON_LOCK_FAILED')
          this.setData({ submitting: false })
          return
        }
        lockedCouponId = selectedCouponId
      }

      let lastOrderId = null
      let lastOrderNo = null

      if (fromCart) {
        // P1-C: 购物车多商品合并成一单（createMultiOrder），一次支付全部商品；
        //   原实现循环 createOrder 每件一单、只支付最后一单 → 多商品结算必失败
        const result = await wx.cloud.callFunction({
          name: 'mallService',
          data: {
            action: 'createMultiOrder',
            items: cartItems.map(item => ({
              productId: item.productId,
              skuId: item.skuId || '',
              quantity: item.quantity,
            })),
            receiverName: address.name,
            receiverPhone: address.phone,
            receiverAddress: address.fullAddress,
            // Sprint 27: 透传 finalAmount / couponId / couponDiscount
            totalAmount: finalAmount,
            originalAmount: totalAmount,
            couponId: selectedCouponId || '',
            couponDiscount: couponDiscount || 0,
          },
          timeout: 20000,
        })
        if (!result.result || result.result.code !== 0) {
          this.errorDynamic(result.result?.message, 'ORDER_PLACE_FAILED')
          if (lockedCouponId) {
            await CouponService.unlockCoupon(lockedCouponId).catch(() => {})
          }
          this.setData({ submitting: false })
          return
        }
        lastOrderId = result.result.data?.orderId
        lastOrderNo = result.result.data?.orderNo
      } else {
        if (!product) {
          this.error('PRODUCT_INFO_INVALID')
          this.setData({ submitting: false })
          return
        }
        const result = await wx.cloud.callFunction({
          name: 'mallService',
          data: {
            action: 'createOrder',
            productId: product._id,
            skuId: skuId || '',
            quantity,
            receiverName: address.name,
            receiverPhone: address.phone,
            receiverAddress: address.fullAddress,
            // Sprint 27: 透传 finalAmount / couponId / couponDiscount
            totalAmount: finalAmount,
            originalAmount: totalAmount,
            couponId: selectedCouponId || '',
            couponDiscount: couponDiscount || 0,
          },
          timeout: 20000,
        })

        if (!result.result || result.result.code !== 0) {
          if (lockedCouponId) {
            await CouponService.unlockCoupon(lockedCouponId).catch(() => {})
          }
          this.errorDynamic(result.result?.message, 'ORDER_PLACE_FAILED')
          this.setData({ submitting: false })
          return
        }
        lastOrderId = result.result.data?.orderId
        lastOrderNo = result.result.data?.orderNo
      }

      // P1-1: 券核销时机改为支付成功后由 paymentService 回调统一核销（对齐 feeding）。
      //   原逻辑此处立即 useCoupon 置 used，支付失败/取消时券不可退回。
      //   现在券保持 locked，支付成功回调核销；失败由取消/超时路径解锁。
      if (lastOrderId && finalAmount > 0) {
        try {
          await PaymentService.pay({
            type: 'mall',
            orderId: lastOrderId,
            amount: Math.round(finalAmount * 100),
            description: '商城订单',
          })
          this.toast('PAYMENT_SUCCESS')
        } catch (payErr) {
          if (payErr.isCancel) {
            this.error('PAYMENT_CANCELLED')
          } else if (payErr.isPending) {
            this.error(() => payErr.message, { duration: 3000 })
          } else {
            this.errorDynamic(payErr.message, 'PAYMENT_FAILED')
          }
          setTimeout(() => wx.navigateBack(), 1500)
          return
        }
      } else {
        // P3: 0 元订单不进入支付（会卡在 pending_payment），直接提示异常
        this.errorDynamic('订单金额异常，请重新下单', 'ORDER_AMOUNT_INVALID')
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      if (lockedCouponId) {
        await CouponService.unlockCoupon(lockedCouponId).catch(() => {})
      }
      this.error('NETWORK_ERROR_RETRY')
    } finally {
      this.setData({ submitting: false })
    }
  },

  async _submitTuanOrder(address) {
    const { tuanData, quantity, remark, totalAmount, selectedCouponId, couponDiscount, finalAmount } = this.data
    if (!tuanData) {
      this.error('GROUP_BUY_INVALID')
      this.setData({ submitting: false })
      return
    }

    let lockedCouponId = null
    const tempOrderId = `tuan_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`

    try {
      // 锁定优惠券
      if (selectedCouponId) {
        const lockRes = await CouponService.lockCoupon(selectedCouponId, tempOrderId, 'tuan_order', 'tuan')
        if (lockRes && lockRes.code !== 0) {
          this.errorDynamic(lockRes.message, 'COUPON_LOCK_FAILED')
          this.setData({ submitting: false })
          return
        }
        lockedCouponId = selectedCouponId
      }

      const orderData = {
        dealId: tuanData.dealId,
        productId: tuanData.productId || '',
        quantity,
        tuanPrice: tuanData.tuanPrice,
        totalAmount: finalAmount || totalAmount,
        originalAmount: totalAmount,
        couponId: selectedCouponId || undefined,
        couponDiscount: couponDiscount || 0,
        receiverName: address.name,
        receiverPhone: address.phone,
        receiverAddress: address.fullAddress,
        remark: remark || '',
      }
      if (tuanData.skuId) {
        orderData.skuId = tuanData.skuId
        orderData.specText = tuanData.specText || ''
      }

      const res = await TuanService.createTuanOrder(orderData)
      if (res && res.code === 0) {
        const unifiedOrderId = res.data?.unifiedOrderId

        // P1-1: 券核销时机改为支付成功后由 paymentService 回调统一核销（对齐 feeding）。
        //   券保持 locked，支付成功回调核销；失败由取消/超时路径解锁。
        const payAmount = finalAmount || totalAmount
        if (unifiedOrderId && payAmount > 0) {
          try {
            await PaymentService.pay({
              type: 'tuan',
              orderId: unifiedOrderId,
              amount: Math.round(payAmount * 100),
              description: '团购订单',
            })
            this.toast('PAYMENT_SUCCESS')
          } catch (payErr) {
            if (payErr.isCancel) {
              this.error('PAYMENT_CANCELLED')
            } else if (payErr.isPending) {
              this.error(() => payErr.message, { duration: 3000 })
            } else {
              this.errorDynamic(payErr.message, 'PAYMENT_FAILED')
            }
            setTimeout(() => wx.navigateBack(), 1500)
            return
          }
        } else {
          this.toast('ORDER_PLACE_SUCCESS')
        }
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        // 下单失败，退回优惠券
        if (lockedCouponId) {
          await CouponService.unlockCoupon(lockedCouponId).catch(() => {})
        }
        this.errorDynamic((res && res.message), 'ORDER_PLACE_FAILED')
      }
    } catch (e) {
      // 异常退回优惠券
      if (lockedCouponId) {
        await CouponService.unlockCoupon(lockedCouponId).catch(() => {})
      }
      this.error('ORDER_PLACE_RETRY')
    } finally {
      this.setData({ submitting: false })
    }
  },

  onRetry() {
    const pages = getCurrentPages()
    const page = pages[pages.length - 1]
    if (page && page.options) {
      this.onLoad(page.options)
    }
  },
})
