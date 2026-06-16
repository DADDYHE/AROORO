const { MallService } = require('./MallService')
const { CartService } = require('./CartService')
const mallCategories = require('./mallCategories')
const cloudImageBehavior = require('../../behaviors/cloudImageBehavior')
const shareEntryBehavior = require('../../behaviors/shareEntryBehavior')
const { buildSharePath } = require('../../utils/share')

Page({
  behaviors: [cloudImageBehavior, shareEntryBehavior],
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
  },

  async onLoad() {
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
