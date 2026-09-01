import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AdminLayout from '@/layouts/AdminLayout.vue'

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/login/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: AdminLayout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { title: '数据看板' } },
      { path: 'user', name: 'UserList', component: () => import('@/views/user/UserListView.vue'), meta: { title: '用户管理' } },
      { path: 'user/:id', name: 'UserDetail', component: () => import('@/views/user/UserDetailView.vue'), meta: { title: '用户详情' } },
      { path: 'admin/approval', name: 'ApprovalCenter', component: () => import('@/views/admin/ApprovalCenter.vue'), meta: { title: '审批中心' } },
      { path: 'order', name: 'AllOrders', component: () => import('@/views/order/AllOrdersView.vue'), meta: { title: '全部订单' } },
      { path: 'order/cancelled', name: 'CancelledOrders', component: () => import('@/views/order/CancelledOrdersView.vue'), meta: { title: '取消订单' } },
      { path: 'order/mall', name: 'MallOrderList', component: () => import('@/views/mall-order/MallOrderList.vue'), meta: { title: '商城订单' } },
      { path: 'order/tuan', name: 'TuanOrderList', component: () => import('@/views/order/TuanOrderList.vue'), meta: { title: '团购订单' } },
      { path: 'order/feeding', name: 'FeedingOrderList', component: () => import('@/views/feeding/FeedingOrderList.vue'), meta: { title: '上门服务订单' } },
      { path: 'order/boarding', name: 'BoardingOrderList', component: () => import('@/views/hosting/BoardingOrderList.vue'), meta: { title: '寄养订单' } },
      { path: 'order/activity', name: 'ActivityOrderList', component: () => import('@/views/order/ActivityOrderList.vue'), meta: { title: '活动订单' } },
      { path: 'activity', name: 'ActivityList', component: () => import('@/views/activity/ActivityList.vue'), meta: { title: '活动管理' } },
      { path: 'activity/create', name: 'ActivityCreate', component: () => import('@/views/activity/ActivityEdit.vue'), meta: { title: '创建活动' } },
      { path: 'activity/:id/edit', name: 'ActivityEdit', component: () => import('@/views/activity/ActivityEdit.vue'), meta: { title: '编辑活动' } },
      { path: 'activity/:id/registrations', name: 'ActivityRegistrations', component: () => import('@/views/activity/ActivityRegistrations.vue'), meta: { title: '活动报名管理' } },
      { path: 'finance', name: 'Finance', component: () => import('@/views/finance/FinanceView.vue'), meta: { title: '营收情况' } },
      { path: 'withdrawal', name: 'WithdrawalReview', component: () => import('@/views/withdrawal/WithdrawalReview.vue'), meta: { title: '提现审核' } },
      { path: 'hosting/review', name: 'HostReview', component: () => import('@/views/hosting/HostReviewList.vue'), meta: { title: '寄养家庭审核' } },
      { path: 'hosting/profile', name: 'HostProfileList', component: () => import('@/views/hosting/HostProfileList.vue'), meta: { title: '家庭寄养管理' } },
      { path: 'product', name: 'ProductList', component: () => import('@/views/product/ProductListView.vue'), meta: { title: '商品列表' } },
      { path: 'product/create', name: 'ProductCreate', component: () => import('@/views/product/ProductEditView.vue'), meta: { title: '创建商品' } },
      { path: 'product/:id/edit', name: 'ProductEdit', component: () => import('@/views/product/ProductEditView.vue'), meta: { title: '编辑商品' } },
      { path: 'product/category', name: 'ProductCategory', component: () => import('@/views/product/CategoryView.vue'), meta: { title: '分类管理' } },
      { path: 'tuan/list', name: 'TuanDealList', component: () => import('@/views/tuan/TuanDealList.vue'), meta: { title: '团购列表' } },
      { path: 'tuan/create', name: 'TuanDealCreate', component: () => import('@/views/tuan/TuanDealEdit.vue'), meta: { title: '创建团购' } },
      { path: 'tuan/:id/edit', name: 'TuanDealEdit', component: () => import('@/views/tuan/TuanDealEdit.vue'), meta: { title: '编辑团购' } },
      { path: 'coupon', name: 'TemplateList', component: () => import('@/views/coupon/TemplateList.vue'), meta: { title: '优惠券模板' } },
      { path: 'coupon/create', name: 'TemplateCreate', component: () => import('@/views/coupon/TemplateEdit.vue'), meta: { title: '创建优惠券' } },
      { path: 'coupon/:id/edit', name: 'TemplateEdit', component: () => import('@/views/coupon/TemplateEdit.vue'), meta: { title: '编辑优惠券' } },
      { path: 'coupon/stats', name: 'CouponStats', component: () => import('@/views/coupon/StatsView.vue'), meta: { title: '优惠券统计' } },
      { path: 'order/stats', name: 'OrderStats', component: () => import('@/views/order/OrderStatsView.vue'), meta: { title: '订单统计' } },
      { path: 'banner', name: 'BannerList', component: () => import('@/views/banner/BannerList.vue'), meta: { title: '轮播图管理' } },
      { path: 'i18n', name: 'I18nOverride', component: () => import('@/views/i18n/I18nOverrideView.vue'), meta: { title: '文案覆盖管理' } },
      { path: 'splash', name: 'SplashPoster', component: () => import('@/views/splash/SplashPosterView.vue'), meta: { title: '启动首屏海报' } },
      { path: 'commission', name: 'CommissionSettlement', component: () => import('@/views/commission/CommissionSettlement.vue'), meta: { title: '佣金结算' } },
      { path: 'referral', name: 'Referral', component: () => import('@/views/referral/ReferralView.vue'), meta: { title: '带货管理' } },
      { path: 'referral/:targetOpenid/users', name: 'ReferralUsers', component: () => import('@/views/referral/ReferralUsersView.vue'), meta: { title: '推广收入详情' } },
      { path: 'referral/:targetOpenid/users/:invitedUserId/orders', name: 'ReferralUserOrders', component: () => import('@/views/referral/ReferralUserOrdersView.vue'), meta: { title: '推广用户订单' } },
    ],
  },
  // 404 页面
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('@/views/NotFound.vue'), meta: { public: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.public) {return next()}
  if (!auth.isLoggedIn) {return next('/login')}
  next()
})

export default router
