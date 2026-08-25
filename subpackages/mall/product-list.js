const { MallService } = require('./MallService')
const { CartService } = require('./CartService')
const mallCategories = require('./mallCategories')
const { ListBehavior } = require('../../behaviors/listBehavior')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const { ReduceMotionBehavior } = require('../../behaviors/reduce-motion')
const { WorkletAnimBehavior } = require('../../behaviors/worklet-anim')
const { buildSharePath } = require('../../utils/share')

Page({
  behaviors: [ListBehavior, cloudImageBehavior, shareEntryBehavior, ReduceMotionBehavior, WorkletAnimBehavior],
  data: {
    currentCategory: '',
    currentCategoryLabel: '',
    currentSubCategory: '',
    currentSubCategoryLabel: '',
    expandedCategory: '',
    categories: [],
    currentProducts: [],
    page: 1,
    pageSize: 20,
    hasMore: false,
    loading: false,
    cartCount: 0,
    cartPos: { x: 0, y: 0 }, // 视口绝对坐标(px)，由 transform 驱动
    cartPosReady: false,
    cartDragging: false, // 拖动进行中(真正移动后)的抓取态
  },

  async onLoad() {
    this._initNavbarHeight()
    this._initCartPos()
    this.initReduceMotion()
    this._refreshCartCount()
    this.setData({ categories: mallCategories })
    try {
      await this._loadCategoriesFromServer()
    } catch (e) {
      console.error('[product-list] _loadCategoriesFromServer 失败:', e)
    }
    try {
      await this._loadCategoryStats()
    } catch (e) {
      console.error('[product-list] _loadCategoryStats 失败:', e)
    }
    if (this.data.categories.length > 0) {
      const firstCat = this.data.categories[0]
      this.setData({
        expandedCategory: firstCat.key,
        currentCategory: firstCat.key,
        currentCategoryLabel: firstCat.label,
      })
    }
    this._loadProducts()
  },

  async _loadCategoriesFromServer() {
    try {
      const result = await MallService.listCategories()
      if (result && result.code === 0 && result.data && result.data.length > 0) {
        const cats = result.data.map(cat => ({
          key: cat.key,
          label: cat.label,
          subcats: (cat.subcats || []).map(sub => ({
            key: sub.key,
            label: sub.label,
          })),
        }))
        this.setData({ categories: cats })
      }
    } catch (e) {
      console.error('[product-list] _loadCategoriesFromServer 失败:', e)
    }
  },

  async _loadCategoryStats() {
    try {
      const result = await MallService.getCategoryStats()
      const stats = (result && result.code === 0 && result.data) ? result.data : {}

      const source = this.data.categories
      const filtered = source
        .filter(cat => stats[cat.key])
        .map(cat => ({
          ...cat,
          subcats: (cat.subcats || []).filter(sub => stats[sub.key]),
        }))

      this.setData({ categories: filtered.length > 0 ? filtered : source })
    } catch (e) {
      console.error('[product-list] _loadCategoryStats 失败:', e)
    }
  },

  async _loadProducts(append = false) {
    if (this.data.loading) {return}
    this.setData({ loading: true })

    const params = {
      page: this.data.page,
      pageSize: this.data.pageSize,
    }

    if (this.data.currentSubCategory) {
      params.categoryId = this.data.currentSubCategory
    } else if (this.data.currentCategory) {
      params.category = this.data.currentCategory
    }

    try {
      const result = await MallService.getProductList(params)

      if (result && result.code === 0) {
        const newList = result.data.list || []
        const products = append
          ? [...this.data.currentProducts, ...newList]
          : newList

        this.setData({
          currentProducts: products,
          hasMore: newList.length >= this.data.pageSize,
        })
      } else {
        if (!append) {
          this.setData({ currentProducts: [], hasMore: false })
        }
      }
    } catch (error) {
      if (!append) {
        this.setData({ currentProducts: [], hasMore: false })
      }
    }

    this.setData({ loading: false })
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.key
    if (this.data.expandedCategory === category) {
      this.setData({ expandedCategory: '' })
    } else {
      this.setData({
        expandedCategory: category,
        currentCategory: category,
        currentSubCategory: '',
        page: 1,
      })
      const catConfig = this.data.categories.find(c => c.key === category)
      this.setData({ currentCategoryLabel: catConfig ? catConfig.label : '' })
      this._loadProducts()
    }
  },

  onSubCategoryTap(e) {
    const subCategory = e.currentTarget.dataset.key
    const catConfig = this.data.categories.find(c => c.key === this.data.currentCategory)
    const subcats = catConfig ? catConfig.subcats || [] : []
    const subLabel = subcats.find(s => s.key === subCategory)?.label || ''

    this.setData({
      currentSubCategory: subCategory,
      currentSubCategoryLabel: subLabel,
      page: 1,
    })
    this._loadProducts()
  },

  onProductTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/mall/product-detail?id=${id}` })
  },

  onViewMore() {
    this.setData({ page: this.data.page + 1 })
    this._loadProducts(true)
  },

  onShow() {
    this._refreshCartCount()
  },

  onReady() {
    this._initCartDrag()
  },

  onUnload() {
    this.cleanupReduceMotion()
    if (this._cartDrag) {
      this._cartDrag.teardown()
      this._cartDrag = null
    }
  },

  _initCartDrag() {
    if (!this.data.cartPosReady) return
    this._cartDrag = this.bindDragTranslate('.floating-cart', {
      initial: this.data.cartPos,
      clamp: (x, y) => {
        const maxX = this._winW - this._cartBtnPx
        const maxY = this._winH - this._cartBtnPx
        return { x: Math.max(0, Math.min(x, maxX)), y: Math.max(0, Math.min(y, maxY)) }
      },
    })
  },

  _initCartPos() {
    const info = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync())
    const rpx = info.windowWidth / 750
    const btn = 96 * rpx
    const margin = 32 * rpx
    const gapBottom = 200 * rpx
    const safeBottom = info.safeArea ? (info.windowHeight - info.safeArea.bottom) : 0
    this._cartBtnPx = btn
    this._winW = info.windowWidth
    this._winH = info.windowHeight
    this.setData({
      cartPos: {
        x: info.windowWidth - btn - margin,
        y: info.windowHeight - btn - gapBottom - safeBottom,
      },
      cartPosReady: true,
    })
  },

  onCartTouchStart(e) {
    const t = e.touches[0]
    const start = this._cartDrag
      ? { x: t.clientX, y: t.clientY, btnX: this._cartDrag.current.x, btnY: this._cartDrag.current.y }
      : { x: t.clientX, y: t.clientY, btnX: this.data.cartPos.x, btnY: this.data.cartPos.y }
    this._dragStart = start
    this._dragMoved = false
  },

  onCartTouchMove(e) {
    if (!this._dragStart) {return}
    const t = e.touches[0]
    const dx = t.clientX - this._dragStart.x
    const dy = t.clientY - this._dragStart.y
    if (!this._dragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      this._dragMoved = true
      this.setData({ cartDragging: true }) // 真正移动才开始抓取反馈
    }
    if (this._cartDrag) {
      // Skyline Worklet：直接改 shared，UI 线程同步驱动 transform，无 setData 风暴
      this._cartDrag.move(this._dragStart.btnX + dx, this._dragStart.btnY + dy)
    } else {
      // WebView 回退：setData 驱动 transform
      let nx = this._dragStart.btnX + dx
      let ny = this._dragStart.btnY + dy
      const maxX = this._winW - this._cartBtnPx
      const maxY = this._winH - this._cartBtnPx
      nx = Math.max(0, Math.min(nx, maxX))
      ny = Math.max(0, Math.min(ny, maxY))
      this.setData({ 'cartPos.x': nx, 'cartPos.y': ny })
    }
  },

  onCartTouchEnd() {
    const moved = this._dragMoved
    this._dragStart = null
    this.setData({ cartDragging: false })
    if (!moved) {this.onCartTap()}
  },

  onCartTap() {
    wx.navigateTo({ url: '/subpackages/mall/cart' })
  },

  _refreshCartCount() {
    const cart = CartService.getCart()
    const count = cart.reduce((sum, item) => sum + item.quantity, 0)
    this.setData({ cartCount: count })
  },

  onShareAppMessage() {
    const { currentCategoryLabel, currentSubCategoryLabel } = this.data
    const title = currentSubCategoryLabel || currentCategoryLabel || '宠物优选好物'
    return {
      title: `${title} - AROORO 宠物商城`,
      path: buildSharePath('/subpackages/mall/product-list'),
    }
  },
})
