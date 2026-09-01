const { MallService } = require('./MallService')
const { CartService } = require('./CartService')
const mallCategories = require('./mallCategories')
const { ListBehavior } = require('../../behaviors/listBehavior')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const { buildSharePath } = require('../../utils/share')

// 「起」价标记规则：多规格（skuType=multi 且 skus 多于一个）或多价格（minPrice≠maxPrice）才显示；单规格或单价格一律不显示
function hasPriceFrom(p) {
  const skus = Array.isArray(p.skus) ? p.skus : []
  const multiSpec = p.skuType === 'multi' && skus.length > 1
  const multiPrice = p.minPrice != null && p.maxPrice != null && Number(p.minPrice) !== Number(p.maxPrice)
  return multiSpec || multiPrice
}

Page({
  behaviors: [ListBehavior, cloudImageBehavior, shareEntryBehavior],
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
    this._refreshCartCount()
    // 性能优化：先落本地静态分类并锁定默认分类，首屏商品不再等待服务端分类串行返回
    const firstCat = mallCategories[0]
    this.setData({
      categories: mallCategories,
      expandedCategory: firstCat ? firstCat.key : '',
      currentCategory: firstCat ? firstCat.key : '',
      currentCategoryLabel: firstCat ? firstCat.label : '',
    })
    // 三路并行：首屏商品 / 服务端分类（统计过滤依赖分类结构，链在其后执行）
    this._loadProducts()
    this._loadCategoriesFromServer().then(() => this._loadCategoryStats())
  },

  async _loadCategoriesFromServer() {
    try {
      const result = await MallService.listCategories({ useCache: true, cacheTime: 30000 })
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
      const result = await MallService.getCategoryStats({ useCache: true, cacheTime: 30000 })
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
      // 性能优化：仅首屏/切分类（page=1）开缓存；加载更多（append）穿透
      const result = await MallService.getProductList(params, {
        useCache: !append && this.data.page === 1,
        cacheTime: 30000,
      })

      if (result && result.code === 0) {
        const newList = (result.data.list || []).map(p => ({ ...p, priceFrom: hasPriceFrom(p) }))
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
        currentSubCategoryLabel: '',
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
    this._dragStart = {
      x: t.clientX,
      y: t.clientY,
      btnX: this.data.cartPos.x,
      btnY: this.data.cartPos.y,
    }
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
    let nx = this._dragStart.btnX + dx
    let ny = this._dragStart.btnY + dy
    const maxX = this._winW - this._cartBtnPx
    const maxY = this._winH - this._cartBtnPx
    nx = Math.max(0, Math.min(nx, maxX))
    ny = Math.max(0, Math.min(ny, maxY))
    this.setData({ 'cartPos.x': nx, 'cartPos.y': ny })
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
