import { callAction } from './index'

export function getProductList(params) { return callAction('getProductList', params) }
export function getProductDetail(productId) { return callAction('getProductDetail', { productId }) }
export function createProduct(data) { return callAction('createProduct', data) }
export function updateProduct(data) { return callAction('updateProduct', data) }
export function deleteProduct(productId) { return callAction('deleteProduct', { productId }) }
export function cloneProduct(productId) { return callAction('cloneProduct', { productId }) }
// operation 直接透传后端操作名（on_shelf / off_shelf / set_featured / unset_featured / delete）
export function batchUpdateProducts(productIds, operation) { return callAction('batchUpdateProducts', { productIds, operation }) }
export function getCategoryStats() { return callAction('getCategoryStats') }
export function getProductStats() { return callAction('getProductStats') }
export function listCategories() { return callAction('listCategories') }
export function createCategory(data) { return callAction('createCategory', data) }
export function updateCategory(data) { return callAction('updateCategory', data) }
export function deleteCategory(categoryId, key) { return callAction('deleteCategory', { categoryId, key }) }
