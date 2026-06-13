const CART_STORAGE_KEY = 'mall_cart'

class CartService {
  static getCart() {
    try {
      const data = wx.getStorageSync(CART_STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  static saveCart(cart) {
    try {
      wx.setStorageSync(CART_STORAGE_KEY, JSON.stringify(cart))
    } catch (e) {
      console.error('[CartService] 保存购物车失败:', e)
    }
  }

  static addItem(product, skuId, quantity = 1) {
    const cart = this.getCart()
    const cartItemId = skuId ? `${product._id}_${skuId}` : product._id
    const existing = cart.find(item => item.cartItemId === cartItemId)

    if (existing) {
      existing.quantity += quantity
    } else {
      const sku = skuId && product.skus ? product.skus.find(s => s.skuId === skuId) : null
      cart.push({
        cartItemId,
        productId: product._id,
        productName: product.name,
        productImage: product.coverUrl || product.coverImage || (product.images && product.images[0]) || '',
        skuId: skuId || '',
        skuText: sku ? sku.specText : '',
        price: sku ? sku.price : product.price,
        stock: sku ? sku.stock : (product.totalStock || product.stock || 0),
        quantity,
        checked: true,
        addedAt: Date.now(),
      })
    }

    this.saveCart(cart)
    return cart
  }

  static removeItem(cartItemId) {
    const cart = this.getCart().filter(item => item.cartItemId !== cartItemId)
    this.saveCart(cart)
    return cart
  }

  static updateQuantity(cartItemId, quantity) {
    const cart = this.getCart()
    const item = cart.find(i => i.cartItemId === cartItemId)
    if (item) {
      item.quantity = Math.max(1, Math.min(quantity, item.stock))
    }
    this.saveCart(cart)
    return cart
  }

  static toggleCheck(cartItemId) {
    const cart = this.getCart()
    const item = cart.find(i => i.cartItemId === cartItemId)
    if (item) {item.checked = !item.checked}
    this.saveCart(cart)
    return cart
  }

  static toggleCheckAll(checked) {
    const cart = this.getCart()
    cart.forEach(item => { item.checked = checked })
    this.saveCart(cart)
    return cart
  }

  static getCheckedItems() {
    return this.getCart().filter(item => item.checked)
  }

  static getTotalCount() {
    return this.getCart().reduce((sum, item) => sum + item.quantity, 0)
  }

  static getCheckedTotal() {
    return this.getCheckedItems().reduce((sum, item) => sum + item.price * item.quantity, 0)
  }
}

module.exports = { CartService }
