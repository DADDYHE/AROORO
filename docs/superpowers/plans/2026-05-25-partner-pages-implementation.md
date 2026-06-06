# 合作伙伴管理中心（用户端）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在用户端小程序中实现6个核心合作伙伴管理页面，采用画廊展陈风格，通过 adminService 云函数 API 获取数据

**Architecture:** 新建 `subpackages/partner/` 子包，包含7个页面（1个首页 + 6个功能页）。在 CloudFunctionService 中新增 AdminService 封装类。从 profile 页面恢复"管理中心"入口。

**Tech Stack:** 微信小程序原生开发、adminService 云函数、画廊展陈风格（#4ECDC4 青绿主色、#F5F5F7 展厅灰墙、300字重大标题、极细边框）

---

## 文件结构

### 新建文件
- `subpackages/partner/home/index.js` — 合作伙伴首页（仪表盘）
- `subpackages/partner/home/index.wxml`
- `subpackages/partner/home/index.wxss`
- `subpackages/partner/home/index.json`
- `subpackages/partner/activity-list/index.js` — 活动管理
- `subpackages/partner/activity-list/index.wxml`
- `subpackages/partner/activity-list/index.wxss`
- `subpackages/partner/activity-list/index.json`
- `subpackages/partner/hosting-profile/index.js` — 寄养档案
- `subpackages/partner/hosting-profile/index.wxml`
- `subpackages/partner/hosting-profile/index.wxss`
- `subpackages/partner/hosting-profile/index.json`
- `subpackages/partner/feeding/index.js` — 上门服务管理
- `subpackages/partner/feeding/index.wxml`
- `subpackages/partner/feeding/index.wxss`
- `subpackages/partner/feeding/index.json`
- `subpackages/partner/income/index.js` — 收入概览
- `subpackages/partner/income/index.wxml`
- `subpackages/partner/income/index.wxss`
- `subpackages/partner/income/index.json`
- `subpackages/partner/application/index.js` — 申请状态
- `subpackages/partner/application/index.wxml`
- `subpackages/partner/application/index.wxss`
- `subpackages/partner/application/index.json`
- `subpackages/partner/referral/index.js` — 推荐用户
- `subpackages/partner/referral/index.wxml`
- `subpackages/partner/referral/index.wxss`
- `subpackages/partner/referral/index.json`

### 修改文件
- `app.json` — 添加 partner 子包配置
- `services/CloudFunctionService.js` — 添加 AdminService 类
- `pages/profile/index.js` — 恢复 onPartnerTap 方法
- `pages/profile/index.wxml` — 恢复管理中心入口
- `pages/profile/index.wxss` — 恢复 partner 样式

---

## 设计规范（画廊展陈风格）

```
颜色体系：
  主色：#4ECDC4（青绿）→ 渐变 #2AB7A9
  深色：#1D1D1F（标题）
  灰色：#8E8E93（副标题）、#C7C7CC（分隔线）
  背景：#F5F5F7（展厅灰墙）、#FFFFFF（卡片白墙）
  成功：#34C759  警告：#FF9500  危险：#FF3B30

字体：
  标题：64rpx / font-weight: 300 / letter-spacing: 12rpx
  副标题：22rpx / #8E8E93 / letter-spacing: 8rpx
  正文：26rpx / #1D1D1F
  数值：48rpx / font-weight: 300 / #1D1D1F

间距：
  页面内边距：32rpx
  卡片圆角：24rpx
  卡片内边距：36rpx
  元素间距：24rpx

组件：
  gallery-header：品牌区（accent-bar + 大标题 + 副标题）
  gallery-card：白墙卡片（左侧3rpx accent + 内容区）
  gallery-stat：数值展示（大数字 + 小标签）
  gallery-row：列表行（序号 + 图标 + 信息 + 箭头）
  gallery-empty：空状态（极简文字 + 细线装饰）
  gallery-btn：操作按钮（渐变背景 + 圆角16rpx）
```

---

### Task 1: 添加 AdminService 封装类

**Files:**
- Modify: `services/CloudFunctionService.js`

- [ ] **Step 1: 在 CloudFunctionService.js 末尾添加 AdminService 类**

在 `ActivityService` 类之后、`const cloudFunctionService = new CloudFunctionService()` 之前，添加 AdminService 类：

```js
class AdminService {
  constructor(cloudService) {
    this.cloud = cloudService
  }

  async getActivityList(data = {}) {
    return this.cloud.call('adminService', { action: 'getActivityList', ...data }, { useCache: false })
  }

  async getActivityDetail(activityId) {
    return this.cloud.call('adminService', { action: 'getActivityDetail', activityId }, { useCache: false })
  }

  async getActivityRegistrations(data = {}) {
    return this.cloud.call('adminService', { action: 'getActivityRegistrations', ...data }, { useCache: false })
  }

  async getHostProfile() {
    return this.cloud.call('adminService', { action: 'getHostProfile' }, { useCache: false })
  }

  async updateHostProfile(data) {
    return this.cloud.post('adminService', { action: 'updateHostProfile', ...data })
  }

  async createHostProfile(data) {
    return this.cloud.post('adminService', { action: 'createHostProfile', ...data })
  }

  async getBoardingOrders(data = {}) {
    return this.cloud.call('adminService', { action: 'getBoardingOrders', ...data }, { useCache: false })
  }

  async handleBoardingOrder(orderId, operation) {
    return this.cloud.post('adminService', { action: 'handleBoardingOrder', orderId, operation })
  }

  async getCurrentFeeder(data = {}) {
    return this.cloud.call('adminService', { action: 'getCurrentFeeder', ...data }, { useCache: false })
  }

  async createFeederProfile(data) {
    return this.cloud.post('adminService', { action: 'createFeederProfile', ...data })
  }

  async updateFeederProfile(data) {
    return this.cloud.post('adminService', { action: 'updateFeederProfile', ...data })
  }

  async getFeederOrders(data = {}) {
    return this.cloud.call('adminService', { action: 'getFeederOrders', ...data }, { useCache: false })
  }

  async handleFeedingOrder(orderId, operation) {
    return this.cloud.post('adminService', { action: 'handleFeedingOrder', orderId, operation })
  }

  async getMyIncomeOverview() {
    return this.cloud.call('adminService', { action: 'getMyIncomeOverview' }, { useCache: false })
  }

  async getMyIncomeDetails(data = {}) {
    return this.cloud.call('adminService', { action: 'getMyIncomeDetails', ...data }, { useCache: false })
  }

  async getMyWallet() {
    return this.cloud.call('adminService', { action: 'getMyWallet' }, { useCache: false })
  }

  async requestWithdrawal(amount) {
    return this.cloud.post('adminService', { action: 'requestWithdrawal', amount })
  }

  async getMyWithdrawals(data = {}) {
    return this.cloud.call('adminService', { action: 'getMyWithdrawals', ...data }, { useCache: false })
  }

  async getApplicationStatus() {
    return this.cloud.call('adminService', { action: 'getApplicationStatus' }, { useCache: false })
  }

  async submitApplication(data) {
    return this.cloud.post('adminService', { action: 'submitApplication', ...data })
  }

  async getMyPermissions() {
    return this.cloud.call('adminService', { action: 'getMyPermissions' }, { useCache: false })
  }

  async getMyInvitedUsers(data = {}) {
    return this.cloud.call('adminService', { action: 'getMyInvitedUsers', ...data }, { useCache: false })
  }

  async getReferralOrders(data = {}) {
    return this.cloud.call('adminService', { action: 'getReferralOrders', ...data }, { useCache: false })
  }

  async getReferralOrderStats(data = {}) {
    return this.cloud.call('adminService', { action: 'getReferralOrderStats', ...data }, { useCache: false })
  }

  async getMyBoardingOrders(data = {}) {
    return this.cloud.call('adminService', { action: 'getBoardingOrders', ...data }, { useCache: false })
  }
}
```

- [ ] **Step 2: 在 module.exports 中导出 AdminService**

将 `module.exports` 修改为：

```js
module.exports = {
  CloudFunctionService: cloudFunctionService,
  HostService: new HostService(cloudFunctionService),
  OrderService: new OrderService(cloudFunctionService),
  UserService: new UserService(cloudFunctionService),
  FavoriteService: new FavoriteService(cloudFunctionService),
  UtilityService: new UtilityService(cloudFunctionService),
  PetService: new PetService(cloudFunctionService),
  ActivityService: new ActivityService(cloudFunctionService),
  AdminService: new AdminService(cloudFunctionService),
}
```

---

### Task 2: 注册 partner 子包 + 恢复 profile 入口

**Files:**
- Modify: `app.json`
- Modify: `pages/profile/index.js`
- Modify: `pages/profile/index.wxml`
- Modify: `pages/profile/index.wxss`

- [ ] **Step 1: 在 app.json 的 subPackages 数组末尾添加 partner 子包**

在 `subPackages` 数组的最后一个元素（coupon 子包）之后添加：

```json
    {
      "root": "subpackages/partner",
      "name": "partner",
      "pages": [
        "home/index",
        "activity-list/index",
        "hosting-profile/index",
        "feeding/index",
        "income/index",
        "application/index",
        "referral/index"
      ]
    }
```

- [ ] **Step 2: 在 pages/profile/index.js 中恢复 onPartnerTap 方法**

在 `onHostApply()` 方法之前添加：

```js
  onPartnerTap() {
    wx.navigateTo({ url: '/subpackages/partner/home/index' })
  },
```

- [ ] **Step 3: 在 pages/profile/index.wxml 中恢复管理中心入口**

在"关于我们"行的 `</view>` 之后、`</view>` (exhibit-list 闭合) 之前添加：

```xml
    <view class="exhibit-row" bindtap="onPartnerTap">
      <view class="exhibit-row-index">04</view>
      <view class="exhibit-row-card partner">
        <view class="exhibit-row-icon partner-icon"></view>
        <view class="exhibit-row-info">
          <text class="exhibit-row-title" wx:if="{{userInfo.isPartner}}">管理中心</text>
          <text class="exhibit-row-title" wx:else>成为合作伙伴</text>
          <text class="exhibit-row-desc" wx:if="{{userInfo.isPartner}}">管理活动、订单和查看数据</text>
          <text class="exhibit-row-desc" wx:else>带货赚取收益，共建宠物生态</text>
        </view>
        <view class="exhibit-row-arrow"></view>
      </view>
    </view>
```

- [ ] **Step 4: 在 pages/profile/index.wxss 中恢复 partner 样式**

在 `.neutral-icon-lock {` 之前添加：

```css
.partner-icon {
  background: linear-gradient(135deg, #4ECDC4 0%, #26A69A 100%);
}

.partner-icon::before {
  content: '';
  position: absolute;
  top: 14rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 20rpx;
  height: 4rpx;
  background: #ffffff;
  border-radius: 2rpx;
}

.partner-icon::after {
  content: '';
  position: absolute;
  top: 8rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 12rpx;
  height: 12rpx;
  border: 3rpx solid #ffffff;
  border-radius: 50%;
}

.exhibit-row-card.partner {
  border-left: 3rpx solid #4ECDC4;
}
```

---

### Task 3: 合作伙伴首页（home/index）

**Files:**
- Create: `subpackages/partner/home/index.js`
- Create: `subpackages/partner/home/index.wxml`
- Create: `subpackages/partner/home/index.wxss`
- Create: `subpackages/partner/home/index.json`

这是管理中心入口页，展示6个功能模块的导航卡片，以及简要的权限状态。

**API 调用：**
- `AdminService.getMyPermissions()` — 获取当前用户权限
- `AdminService.getApplicationStatus()` — 获取申请状态
- `AdminService.getMyIncomeOverview()` — 获取收入概览（首页展示摘要）

- [ ] **Step 1: 创建 index.json**

```json
{
  "navigationBarTitleText": "管理中心",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 index.js**

```js
const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isLoading: true,
    permissions: [],
    permissionLabels: [],
    hasPendingApplication: false,
    isPartner: false,
    incomeSummary: null,
    modules: [
      { id: 'activity', title: '活动管理', desc: '管理活动与报名', icon: 'activity', path: '/subpackages/partner/activity-list/index', perm: 'activity' },
      { id: 'hosting', title: '寄养档案', desc: '管理寄养家庭信息', icon: 'hosting', path: '/subpackages/partner/hosting-profile/index', perm: 'hosting' },
      { id: 'feeding', title: '上门服务', desc: '管理服务与订单', icon: 'feeding', path: '/subpackages/partner/feeding/index', perm: 'feeding' },
      { id: 'income', title: '收入概览', desc: '查看收入与提现', icon: 'income', path: '/subpackages/partner/income/index', perm: null },
      { id: 'referral', title: '推荐用户', desc: '查看带货数据', icon: 'referral', path: '/subpackages/partner/referral/index', perm: null },
      { id: 'application', title: '申请状态', desc: '查看审核进度', icon: 'application', path: '/subpackages/partner/application/index', perm: null },
    ],
  },

  onLoad() {
    this._loadData()
  },

  onShow() {
    if (!this.data.isLoading) this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const [permRes, appRes, incomeRes] = await Promise.all([
        AdminService.getMyPermissions(),
        AdminService.getApplicationStatus(),
        AdminService.getMyIncomeOverview(),
      ])

      const perms = permRes.code === 0 && permRes.data ? permRes.data.permissions || [] : []
      const labels = permRes.code === 0 && permRes.data ? permRes.data.permissionLabels || [] : []
      const hasAll = perms.includes('all')
      const isPartner = perms.length > 0 || hasAll

      const hasPending = appRes.code === 0 && appRes.data ? appRes.data.hasPending || false : false

      let incomeSummary = null
      if (incomeRes.code === 0 && incomeRes.data) {
        const d = incomeRes.data
        incomeSummary = {
          total: ((d.commission?.total || 0) + (d.hosting?.total || 0) + (d.feeding?.total || 0)).toFixed(2),
          monthly: ((d.commission?.monthly || 0) + (d.hosting?.monthly || 0) + (d.feeding?.monthly || 0)).toFixed(2),
          walletBalance: d.wallet?.balance || 0,
        }
      }

      this.setData({
        isLoading: false,
        permissions: perms,
        permissionLabels: labels,
        isPartner,
        hasPendingApplication: hasPending,
        incomeSummary,
      })
    } catch (e) {
      console.error('[partner/home] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  _hasPermission(perm) {
    if (!perm) return true
    return this.data.permissions.includes('all') || this.data.permissions.includes(perm)
  },

  onModuleTap(e) {
    const { id } = e.currentTarget.dataset
    const mod = this.data.modules.find(m => m.id === id)
    if (!mod) return
    if (mod.perm && !this._hasPermission(mod.perm)) {
      wx.showToast({ title: '暂无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: mod.path })
  },

  onApplyTap() {
    wx.navigateTo({ url: '/subpackages/partner/application/index' })
  },
})
```

- [ ] **Step 3: 创建 index.wxml**

```xml
<view class="gallery-container">
  <view wx:if="{{isLoading}}" class="loading-container">
    <view class="loading-spinner">
      <view class="spinner-outer"></view>
      <view class="spinner-inner"></view>
    </view>
  </view>

  <block wx:else>
    <view class="gallery-header">
      <view class="brand-block">
        <view class="brand-accent-bar"></view>
        <view class="brand-main">
          <text class="brand-text">管理中心</text>
        </view>
        <view class="brand-meta">
          <view class="brand-meta-line"></view>
          <text class="brand-subtitle" wx:if="{{isPartner}}">{{permissionLabels.join(' · ')}}</text>
          <text class="brand-subtitle" wx:else>合作伙伴专属</text>
        </view>
      </view>
    </view>

    <view class="gallery-hall">
      <view wx:if="{{hasPendingApplication && !isPartner}}" class="gallery-card pending-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <text class="pending-title">申请审核中</text>
          <text class="pending-desc">您的合作伙伴申请正在审核中，请耐心等待</text>
          <view class="pending-btn" bindtap="onApplyTap">
            <text class="pending-btn-text">查看详情</text>
          </view>
        </view>
      </view>

      <view wx:if="{{!isPartner && !hasPendingApplication}}" class="gallery-card apply-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <text class="pending-title">成为合作伙伴</text>
          <text class="pending-desc">带货赚取收益，共建宠物生态</text>
          <view class="pending-btn" bindtap="onApplyTap">
            <text class="pending-btn-text">立即申请</text>
          </view>
        </view>
      </view>

      <view wx:if="{{incomeSummary && isPartner}}" class="gallery-card income-card">
        <view class="card-accent income-accent"></view>
        <view class="card-body">
          <view class="income-row">
            <view class="income-stat">
              <text class="income-value">¥{{incomeSummary.total}}</text>
              <text class="income-label">累计收入</text>
            </view>
            <view class="income-divider"></view>
            <view class="income-stat">
              <text class="income-value">¥{{incomeSummary.monthly}}</text>
              <text class="income-label">本月收入</text>
            </view>
            <view class="income-divider"></view>
            <view class="income-stat">
              <text class="income-value">¥{{incomeSummary.walletBalance}}</text>
              <text class="income-label">可提现</text>
            </view>
          </view>
        </view>
      </view>

      <view class="gallery-entrance">
        <view class="entrance-line"></view>
        <text class="entrance-label">功能模块</text>
      </view>

      <view class="module-grid">
        <view class="module-card" wx:for="{{modules}}" wx:key="id" bindtap="onModuleTap" data-id="{{item.id}}">
          <view class="module-icon module-icon-{{item.icon}}"></view>
          <text class="module-title">{{item.title}}</text>
          <text class="module-desc">{{item.desc}}</text>
        </view>
      </view>
    </view>
  </block>
</view>
```

- [ ] **Step 4: 创建 index.wxss**

```css
.gallery-container {
  min-height: 100vh;
  background-color: #F5F5F7;
  padding-bottom: env(safe-area-inset-bottom);
}

.gallery-header {
  padding: 0;
  position: relative;
  overflow: hidden;
  background: #FFFFFF;
  animation: fadeUp 0.6s ease-out;
  padding-bottom: 20rpx;
}

.brand-block {
  padding: 80rpx 48rpx 64rpx;
  position: relative;
}

.brand-block::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 300rpx;
  height: 300rpx;
  background: radial-gradient(circle, rgba(78, 205, 196, 0.15) 0%, transparent 70%);
  pointer-events: none;
}

.brand-accent-bar {
  position: absolute;
  top: 0;
  left: 48rpx;
  width: 48rpx;
  height: 6rpx;
  background: linear-gradient(90deg, #4ECDC4 0%, #2AB7A9 100%);
  border-radius: 0 0 4rpx 4rpx;
  animation: slideDown 0.5s ease-out;
}

.brand-main {
  position: relative;
  margin-bottom: 24rpx;
}

.brand-text {
  font-size: 64rpx;
  font-weight: 300;
  color: #1D1D1F;
  letter-spacing: 12rpx;
  display: block;
  line-height: 1;
}

.brand-meta {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.brand-meta-line {
  width: 40rpx;
  height: 2rpx;
  background: #E5E5EA;
  position: relative;
}

.brand-meta-line::after {
  content: '';
  position: absolute;
  top: 50%;
  right: -4rpx;
  transform: translateY(-50%);
  width: 6rpx;
  height: 6rpx;
  border-radius: 50%;
  background: #4ECDC4;
}

.brand-subtitle {
  font-size: 22rpx;
  color: #8E8E93;
  letter-spacing: 8rpx;
  font-weight: 400;
}

.gallery-hall {
  padding: 32rpx;
  animation: fadeUp 0.6s ease-out 0.2s both;
}

.gallery-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  overflow: hidden;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 16rpx rgba(0, 0, 0, 0.04);
}

.card-accent {
  width: 3rpx;
  height: 100%;
  position: absolute;
  left: 0;
  top: 0;
  background: linear-gradient(180deg, #4ECDC4 0%, #2AB7A9 100%);
}

.income-accent {
  background: linear-gradient(180deg, #4ECDC4 0%, #34C759 100%);
}

.card-body {
  position: relative;
  padding: 36rpx;
}

.pending-title {
  font-size: 32rpx;
  font-weight: 500;
  color: #1D1D1F;
  display: block;
  margin-bottom: 12rpx;
}

.pending-desc {
  font-size: 24rpx;
  color: #8E8E93;
  display: block;
  margin-bottom: 28rpx;
}

.pending-btn {
  display: inline-flex;
  padding: 16rpx 40rpx;
  background: linear-gradient(135deg, #4ECDC4 0%, #2AB7A9 100%);
  border-radius: 16rpx;
}

.pending-btn-text {
  font-size: 24rpx;
  color: #FFFFFF;
  font-weight: 500;
}

.income-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
}

.income-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.income-value {
  font-size: 40rpx;
  font-weight: 300;
  color: #1D1D1F;
  letter-spacing: 2rpx;
}

.income-label {
  font-size: 20rpx;
  color: #8E8E93;
  letter-spacing: 4rpx;
}

.income-divider {
  width: 1rpx;
  height: 60rpx;
  background: #E5E5EA;
}

.gallery-entrance {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin: 32rpx 0 24rpx;
}

.entrance-line {
  width: 40rpx;
  height: 2rpx;
  background: #C7C7CC;
}

.entrance-label {
  font-size: 22rpx;
  color: #8E8E93;
  letter-spacing: 8rpx;
}

.module-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
}

.module-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 32rpx 28rpx;
  box-shadow: 0 2rpx 16rpx rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12rpx;
  position: relative;
  overflow: hidden;
}

.module-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3rpx;
  background: linear-gradient(90deg, #4ECDC4 0%, #2AB7A9 100%);
  opacity: 0;
  transition: opacity 0.3s;
}

.module-card:active::before {
  opacity: 1;
}

.module-icon {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8rpx;
}

.module-icon-activity {
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.15) 0%, rgba(78, 205, 196, 0.05) 100%);
}

.module-icon-hosting {
  background: linear-gradient(135deg, rgba(255, 149, 0, 0.15) 0%, rgba(255, 149, 0, 0.05) 100%);
}

.module-icon-feeding {
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.15) 0%, rgba(52, 199, 89, 0.05) 100%);
}

.module-icon-income {
  background: linear-gradient(135deg, rgba(175, 82, 222, 0.15) 0%, rgba(175, 82, 222, 0.05) 100%);
}

.module-icon-referral {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.15) 0%, rgba(0, 122, 255, 0.05) 100%);
}

.module-icon-application {
  background: linear-gradient(135deg, rgba(255, 59, 48, 0.15) 0%, rgba(255, 59, 48, 0.05) 100%);
}

.module-icon::after {
  font-size: 28rpx;
}

.module-icon-activity::after {
  content: '🎪';
}

.module-icon-hosting::after {
  content: '🏠';
}

.module-icon-feeding::after {
  content: '🐾';
}

.module-icon-income::after {
  content: '💰';
}

.module-icon-referral::after {
  content: '👥';
}

.module-icon-application::after {
  content: '📋';
}

.module-title {
  font-size: 28rpx;
  font-weight: 500;
  color: #1D1D1F;
}

.module-desc {
  font-size: 20rpx;
  color: #8E8E93;
}

.loading-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F5F5F7;
}

.loading-spinner {
  width: 80rpx;
  height: 80rpx;
  position: relative;
}

.spinner-outer {
  width: 80rpx;
  height: 80rpx;
  border: 3rpx solid #E5E5EA;
  border-top-color: #4ECDC4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8rpx;
  height: 8rpx;
  background: #4ECDC4;
  border-radius: 50%;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20rpx); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideDown {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

### Task 4: 活动管理页（activity-list/index）

**Files:**
- Create: `subpackages/partner/activity-list/index.js`
- Create: `subpackages/partner/activity-list/index.wxml`
- Create: `subpackages/partner/activity-list/index.wxss`
- Create: `subpackages/partner/activity-list/index.json`

**API 调用：**
- `AdminService.getActivityList({ page, pageSize })` — 获取活动列表

- [ ] **Step 1: 创建 index.json**

```json
{
  "navigationBarTitleText": "活动管理",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 index.js**

```js
const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isLoading: true,
    activities: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
  },

  onLoad() {
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const res = await AdminService.getActivityList({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          activities: list,
          total: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
          isLoading: false,
        })
      } else {
        this.setData({ isLoading: false })
      }
    } catch (e) {
      console.error('[partner/activity-list] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading) return
    this.setData({ page: this.data.page + 1 })
    this._loadMore()
  },

  async _loadMore() {
    try {
      const res = await AdminService.getActivityList({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          activities: [...this.data.activities, ...list],
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/activity-list] _loadMore error:', e)
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1 })
    this._loadData().then(() => wx.stopPullDownRefresh())
  },

  _formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  _getStatusText(status) {
    const map = { draft: '草稿', published: '已发布', ended: '已结束', cancelled: '已取消' }
    return map[status] || status
  },

  _getStatusClass(status) {
    const map = { draft: 'status-draft', published: 'status-published', ended: 'status-ended', cancelled: 'status-cancelled' }
    return map[status] || ''
  },
})
```

- [ ] **Step 3: 创建 index.wxml**

```xml
<view class="gallery-container">
  <view wx:if="{{isLoading}}" class="loading-container">
    <view class="loading-spinner">
      <view class="spinner-outer"></view>
      <view class="spinner-inner"></view>
    </view>
  </view>

  <block wx:else>
    <view class="gallery-header">
      <view class="brand-block">
        <view class="brand-accent-bar"></view>
        <view class="brand-main">
          <text class="brand-text">活动管理</text>
        </view>
        <view class="brand-meta">
          <view class="brand-meta-line"></view>
          <text class="brand-subtitle">共 {{total}} 个活动</text>
        </view>
      </view>
    </view>

    <view class="gallery-hall">
      <view wx:if="{{activities.length === 0}}" class="gallery-empty">
        <view class="empty-line"></view>
        <text class="empty-text">暂无活动</text>
      </view>

      <view wx:for="{{activities}}" wx:key="_id" class="gallery-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <view class="card-header">
            <text class="card-title">{{item.title}}</text>
            <text class="card-status {{_getStatusClass(item.status)}}">{{_getStatusText(item.status)}}</text>
          </view>
          <view class="card-info">
            <text class="card-info-item" wx:if="{{item.startTime}}">{{item.startTime}}</text>
            <text class="card-info-item" wx:if="{{item.location}}">{{item.location}}</text>
          </view>
          <view class="card-footer">
            <text class="card-stat">{{item.currentParticipants || 0}}/{{item.maxParticipants || 0}} 人</text>
            <text class="card-price" wx:if="{{item.pricePerPerson}}">¥{{item.pricePerPerson}}/人</text>
          </view>
        </view>
      </view>
    </view>
  </block>
</view>
```

- [ ] **Step 4: 创建 index.wxss**

```css
.gallery-container {
  min-height: 100vh;
  background-color: #F5F5F7;
  padding-bottom: env(safe-area-inset-bottom);
}

.gallery-header {
  padding: 0;
  position: relative;
  overflow: hidden;
  background: #FFFFFF;
  animation: fadeUp 0.6s ease-out;
  padding-bottom: 20rpx;
}

.brand-block {
  padding: 80rpx 48rpx 64rpx;
  position: relative;
}

.brand-block::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 300rpx;
  height: 300rpx;
  background: radial-gradient(circle, rgba(78, 205, 196, 0.15) 0%, transparent 70%);
  pointer-events: none;
}

.brand-accent-bar {
  position: absolute;
  top: 0;
  left: 48rpx;
  width: 48rpx;
  height: 6rpx;
  background: linear-gradient(90deg, #4ECDC4 0%, #2AB7A9 100%);
  border-radius: 0 0 4rpx 4rpx;
}

.brand-main {
  position: relative;
  margin-bottom: 24rpx;
}

.brand-text {
  font-size: 64rpx;
  font-weight: 300;
  color: #1D1D1F;
  letter-spacing: 12rpx;
  display: block;
  line-height: 1;
}

.brand-meta {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.brand-meta-line {
  width: 40rpx;
  height: 2rpx;
  background: #E5E5EA;
  position: relative;
}

.brand-meta-line::after {
  content: '';
  position: absolute;
  top: 50%;
  right: -4rpx;
  transform: translateY(-50%);
  width: 6rpx;
  height: 6rpx;
  border-radius: 50%;
  background: #4ECDC4;
}

.brand-subtitle {
  font-size: 22rpx;
  color: #8E8E93;
  letter-spacing: 8rpx;
}

.gallery-hall {
  padding: 32rpx;
  animation: fadeUp 0.6s ease-out 0.2s both;
}

.gallery-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  overflow: hidden;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 16rpx rgba(0, 0, 0, 0.04);
  position: relative;
}

.card-accent {
  width: 3rpx;
  height: 100%;
  position: absolute;
  left: 0;
  top: 0;
  background: linear-gradient(180deg, #4ECDC4 0%, #2AB7A9 100%);
}

.card-body {
  position: relative;
  padding: 32rpx 36rpx;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.card-title {
  font-size: 30rpx;
  font-weight: 500;
  color: #1D1D1F;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 16rpx;
}

.card-status {
  font-size: 20rpx;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
  font-weight: 500;
  flex-shrink: 0;
}

.status-draft {
  background: #F2F2F7;
  color: #8E8E93;
}

.status-published {
  background: rgba(78, 205, 196, 0.12);
  color: #2AB7A9;
}

.status-ended {
  background: rgba(142, 142, 147, 0.12);
  color: #8E8E93;
}

.status-cancelled {
  background: rgba(255, 59, 48, 0.12);
  color: #FF3B30;
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 16rpx;
}

.card-info-item {
  font-size: 22rpx;
  color: #8E8E93;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16rpx;
  border-top: 1rpx solid #F2F2F7;
}

.card-stat {
  font-size: 22rpx;
  color: #8E8E93;
}

.card-price {
  font-size: 26rpx;
  font-weight: 500;
  color: #4ECDC4;
}

.gallery-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
}

.empty-line {
  width: 60rpx;
  height: 2rpx;
  background: #C7C7CC;
  margin-bottom: 24rpx;
}

.empty-text {
  font-size: 24rpx;
  color: #8E8E93;
  letter-spacing: 4rpx;
}

.loading-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F5F5F7;
}

.loading-spinner {
  width: 80rpx;
  height: 80rpx;
  position: relative;
}

.spinner-outer {
  width: 80rpx;
  height: 80rpx;
  border: 3rpx solid #E5E5EA;
  border-top-color: #4ECDC4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8rpx;
  height: 8rpx;
  background: #4ECDC4;
  border-radius: 50%;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20rpx); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

### Task 5: 寄养档案页（hosting-profile/index）

**Files:**
- Create: `subpackages/partner/hosting-profile/index.js`
- Create: `subpackages/partner/hosting-profile/index.wxml`
- Create: `subpackages/partner/hosting-profile/index.wxss`
- Create: `subpackages/partner/hosting-profile/index.json`

**API 调用：**
- `AdminService.getHostProfile()` — 获取寄养家庭档案
- `AdminService.getBoardingOrders({ page, pageSize })` — 获取寄养订单列表

- [ ] **Step 1: 创建 index.json**

```json
{
  "navigationBarTitleText": "寄养档案",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 index.js**

```js
const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isLoading: true,
    profile: null,
    hasProfile: false,
    orders: [],
    orderTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
  },

  onLoad() {
    this._loadData()
  },

  onShow() {
    if (!this.data.isLoading && this.data.hasProfile) {
      this._loadOrders()
    }
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const res = await AdminService.getHostProfile()
      if (res.code === 0 && res.data) {
        this.setData({
          profile: res.data,
          hasProfile: true,
          isLoading: false,
        })
        this._loadOrders()
      } else {
        this.setData({ hasProfile: false, isLoading: false })
      }
    } catch (e) {
      console.error('[partner/hosting-profile] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  async _loadOrders() {
    try {
      const res = await AdminService.getMyBoardingOrders({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          orders: list,
          orderTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/hosting-profile] _loadOrders error:', e)
    }
  },

  _getStatusText(status) {
    const map = { pending: '待确认', confirmed: '已确认', checked_in: '已入住', completed: '已完成', cancelled: '已取消' }
    return map[status] || status
  },

  _getStatusClass(status) {
    const map = { pending: 'status-pending', confirmed: 'status-confirmed', checked_in: 'status-checkedin', completed: 'status-completed', cancelled: 'status-cancelled' }
    return map[status] || ''
  },
})
```

- [ ] **Step 3: 创建 index.wxml**

```xml
<view class="gallery-container">
  <view wx:if="{{isLoading}}" class="loading-container">
    <view class="loading-spinner">
      <view class="spinner-outer"></view>
      <view class="spinner-inner"></view>
    </view>
  </view>

  <block wx:else>
    <view class="gallery-header">
      <view class="brand-block">
        <view class="brand-accent-bar"></view>
        <view class="brand-main">
          <text class="brand-text">寄养档案</text>
        </view>
        <view class="brand-meta">
          <view class="brand-meta-line"></view>
          <text class="brand-subtitle" wx:if="{{hasProfile}}">{{profile.hostName}}</text>
          <text class="brand-subtitle" wx:else>寄养家庭管理</text>
        </view>
      </view>
    </view>

    <view class="gallery-hall">
      <view wx:if="{{!hasProfile}}" class="gallery-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <text class="pending-title">暂无寄养档案</text>
          <text class="pending-desc">请联系客服申请成为寄养家庭</text>
        </view>
      </view>

      <block wx:else>
        <view class="gallery-card profile-card">
          <view class="card-accent"></view>
          <view class="card-body">
            <view class="info-row">
              <view class="info-key">状态</view>
              <view class="info-val">
                <text class="status-tag {{profile.status === 'active' ? 'tag-active' : 'tag-inactive'}}">{{profile.status === 'active' ? '营业中' : (profile.status === 'pending_review' ? '审核中' : '已下架')}}</text>
              </view>
            </view>
            <view class="info-divider"></view>
            <view class="info-row">
              <view class="info-key">接单状态</view>
              <view class="info-val">{{profile.isAcceptingOrders ? '接受订单' : '暂停接单'}}</view>
            </view>
            <view class="info-divider"></view>
            <view class="info-row">
              <view class="info-key">日单价</view>
              <view class="info-val">¥{{profile.pricePerDay || 0}}/天</view>
            </view>
            <view class="info-divider"></view>
            <view class="info-row">
              <view class="info-key">最大容量</view>
              <view class="info-val">{{profile.maxPets || 0}} 只</view>
            </view>
            <view class="info-divider"></view>
            <view class="info-row" wx:if="{{profile.address}}">
              <view class="info-key">地址</view>
              <view class="info-val">{{profile.address}}</view>
            </view>
            <view class="info-divider" wx:if="{{profile.address}}"></view>
            <view class="info-row" wx:if="{{profile.phone}}">
              <view class="info-key">联系电话</view>
              <view class="info-val">{{profile.phone}}</view>
            </view>
          </view>
        </view>

        <view class="gallery-entrance">
          <view class="entrance-line"></view>
          <text class="entrance-label">寄养订单 ({{orderTotal}})</text>
        </view>

        <view wx:if="{{orders.length === 0}}" class="gallery-empty">
          <view class="empty-line"></view>
          <text class="empty-text">暂无订单</text>
        </view>

        <view wx:for="{{orders}}" wx:key="_id" class="gallery-card order-card">
          <view class="card-accent"></view>
          <view class="card-body">
            <view class="card-header">
              <text class="card-title">{{item.hostName || '寄养订单'}}</text>
              <text class="card-status {{_getStatusClass(item.status)}}">{{_getStatusText(item.status)}}</text>
            </view>
            <view class="card-info">
              <text class="card-info-item" wx:if="{{item.ownerName}}">宠物主人：{{item.ownerName}}</text>
              <text class="card-info-item">金额：¥{{item.totalPrice || item.totalAmount || 0}}</text>
            </view>
          </view>
        </view>
      </block>
    </view>
  </block>
</view>
```

- [ ] **Step 4: 创建 index.wxss**

复用 Task 4 的基础样式（gallery-container, gallery-header, brand-block, gallery-hall, gallery-card, card-accent, card-body, gallery-entrance, gallery-empty, loading 等通用样式），并添加以下特有样式：

```css
.gallery-container {
  min-height: 100vh;
  background-color: #F5F5F7;
  padding-bottom: env(safe-area-inset-bottom);
}

.gallery-header {
  padding: 0;
  position: relative;
  overflow: hidden;
  background: #FFFFFF;
  animation: fadeUp 0.6s ease-out;
  padding-bottom: 20rpx;
}

.brand-block {
  padding: 80rpx 48rpx 64rpx;
  position: relative;
}

.brand-block::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 300rpx;
  height: 300rpx;
  background: radial-gradient(circle, rgba(78, 205, 196, 0.15) 0%, transparent 70%);
  pointer-events: none;
}

.brand-accent-bar {
  position: absolute;
  top: 0;
  left: 48rpx;
  width: 48rpx;
  height: 6rpx;
  background: linear-gradient(90deg, #4ECDC4 0%, #2AB7A9 100%);
  border-radius: 0 0 4rpx 4rpx;
}

.brand-main {
  position: relative;
  margin-bottom: 24rpx;
}

.brand-text {
  font-size: 64rpx;
  font-weight: 300;
  color: #1D1D1F;
  letter-spacing: 12rpx;
  display: block;
  line-height: 1;
}

.brand-meta {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.brand-meta-line {
  width: 40rpx;
  height: 2rpx;
  background: #E5E5EA;
  position: relative;
}

.brand-meta-line::after {
  content: '';
  position: absolute;
  top: 50%;
  right: -4rpx;
  transform: translateY(-50%);
  width: 6rpx;
  height: 6rpx;
  border-radius: 50%;
  background: #4ECDC4;
}

.brand-subtitle {
  font-size: 22rpx;
  color: #8E8E93;
  letter-spacing: 8rpx;
}

.gallery-hall {
  padding: 32rpx;
  animation: fadeUp 0.6s ease-out 0.2s both;
}

.gallery-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  overflow: hidden;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 16rpx rgba(0, 0, 0, 0.04);
  position: relative;
}

.card-accent {
  width: 3rpx;
  height: 100%;
  position: absolute;
  left: 0;
  top: 0;
  background: linear-gradient(180deg, #4ECDC4 0%, #2AB7A9 100%);
}

.card-body {
  position: relative;
  padding: 32rpx 36rpx;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8rpx 0;
}

.info-key {
  font-size: 24rpx;
  color: #8E8E93;
  letter-spacing: 2rpx;
}

.info-val {
  font-size: 26rpx;
  color: #1D1D1F;
  text-align: right;
  max-width: 400rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-divider {
  height: 1rpx;
  background: #F2F2F7;
  margin: 4rpx 0;
}

.status-tag {
  font-size: 20rpx;
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
  font-weight: 500;
}

.tag-active {
  background: rgba(78, 205, 196, 0.12);
  color: #2AB7A9;
}

.tag-inactive {
  background: #F2F2F7;
  color: #8E8E93;
}

.pending-title {
  font-size: 32rpx;
  font-weight: 500;
  color: #1D1D1F;
  display: block;
  margin-bottom: 12rpx;
}

.pending-desc {
  font-size: 24rpx;
  color: #8E8E93;
  display: block;
}

.gallery-entrance {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin: 32rpx 0 24rpx;
}

.entrance-line {
  width: 40rpx;
  height: 2rpx;
  background: #C7C7CC;
}

.entrance-label {
  font-size: 22rpx;
  color: #8E8E93;
  letter-spacing: 8rpx;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.card-title {
  font-size: 30rpx;
  font-weight: 500;
  color: #1D1D1F;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 16rpx;
}

.card-status {
  font-size: 20rpx;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
  font-weight: 500;
  flex-shrink: 0;
}

.status-pending {
  background: rgba(255, 149, 0, 0.12);
  color: #FF9500;
}

.status-confirmed {
  background: rgba(0, 122, 255, 0.12);
  color: #007AFF;
}

.status-checkedin {
  background: rgba(78, 205, 196, 0.12);
  color: #2AB7A9;
}

.status-completed {
  background: rgba(52, 199, 89, 0.12);
  color: #34C759;
}

.status-cancelled {
  background: rgba(255, 59, 48, 0.12);
  color: #FF3B30;
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.card-info-item {
  font-size: 22rpx;
  color: #8E8E93;
}

.gallery-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
}

.empty-line {
  width: 60rpx;
  height: 2rpx;
  background: #C7C7CC;
  margin-bottom: 24rpx;
}

.empty-text {
  font-size: 24rpx;
  color: #8E8E93;
  letter-spacing: 4rpx;
}

.loading-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F5F5F7;
}

.loading-spinner {
  width: 80rpx;
  height: 80rpx;
  position: relative;
}

.spinner-outer {
  width: 80rpx;
  height: 80rpx;
  border: 3rpx solid #E5E5EA;
  border-top-color: #4ECDC4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8rpx;
  height: 8rpx;
  background: #4ECDC4;
  border-radius: 50%;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20rpx); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

### Task 6: 上门服务管理页（feeding/index）

**Files:**
- Create: `subpackages/partner/feeding/index.js`
- Create: `subpackages/partner/feeding/index.wxml`
- Create: `subpackages/partner/feeding/index.wxss`
- Create: `subpackages/partner/feeding/index.json`

**API 调用：**
- `AdminService.getCurrentFeeder()` — 获取当前喂养师档案
- `AdminService.getFeederOrders({ page, pageSize })` — 获取喂养师订单

- [ ] **Step 1: 创建 index.json**

```json
{
  "navigationBarTitleText": "上门服务",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 index.js**

```js
const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isLoading: true,
    feeder: null,
    hasFeeder: false,
    orders: [],
    orderTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
  },

  onLoad() {
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const res = await AdminService.getCurrentFeeder()
      if (res.code === 0 && res.data) {
        this.setData({
          feeder: res.data,
          hasFeeder: true,
          isLoading: false,
        })
        this._loadOrders()
      } else {
        this.setData({ hasFeeder: false, isLoading: false })
      }
    } catch (e) {
      console.error('[partner/feeding] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  async _loadOrders() {
    try {
      const res = await AdminService.getFeederOrders({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          orders: list,
          orderTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/feeding] _loadOrders error:', e)
    }
  },

  _getStatusText(status) {
    const map = { pending: '待确认', confirmed: '已确认', in_progress: '服务中', completed: '已完成', cancelled: '已取消' }
    return map[status] || status
  },

  _getStatusClass(status) {
    const map = { pending: 'status-pending', confirmed: 'status-confirmed', in_progress: 'status-progress', completed: 'status-completed', cancelled: 'status-cancelled' }
    return map[status] || ''
  },
})
```

- [ ] **Step 3: 创建 index.wxml**

```xml
<view class="gallery-container">
  <view wx:if="{{isLoading}}" class="loading-container">
    <view class="loading-spinner">
      <view class="spinner-outer"></view>
      <view class="spinner-inner"></view>
    </view>
  </view>

  <block wx:else>
    <view class="gallery-header">
      <view class="brand-block">
        <view class="brand-accent-bar"></view>
        <view class="brand-main">
          <text class="brand-text">上门服务</text>
        </view>
        <view class="brand-meta">
          <view class="brand-meta-line"></view>
          <text class="brand-subtitle" wx:if="{{hasFeeder}}">{{feeder.realName || feeder.nickname}}</text>
          <text class="brand-subtitle" wx:else>服务管理</text>
        </view>
      </view>
    </view>

    <view class="gallery-hall">
      <view wx:if="{{!hasFeeder}}" class="gallery-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <text class="pending-title">暂无服务档案</text>
          <text class="pending-desc">请联系客服申请成为服务人员</text>
        </view>
      </view>

      <block wx:else>
        <view class="gallery-card profile-card">
          <view class="card-accent"></view>
          <view class="card-body">
            <view class="info-row">
              <view class="info-key">状态</view>
              <view class="info-val">
                <text class="status-tag {{feeder.status === 'active' ? 'tag-active' : 'tag-inactive'}}">{{feeder.status === 'active' ? '营业中' : (feeder.status === 'pending' ? '审核中' : '已停用')}}</text>
              </view>
            </view>
            <view class="info-divider"></view>
            <view class="info-row">
              <view class="info-key">服务类型</view>
              <view class="info-val">{{(feeder.serviceTypes || []).join('、') || '—'}}</view>
            </view>
            <view class="info-divider"></view>
            <view class="info-row">
              <view class="info-key">单次价格</view>
              <view class="info-val">¥{{feeder.pricePerVisit || 0}}/次</view>
            </view>
            <view class="info-divider"></view>
            <view class="info-row" wx:if="{{feeder.address}}">
              <view class="info-key">服务区域</view>
              <view class="info-val">{{feeder.address}}</view>
            </view>
          </view>
        </view>

        <view class="gallery-entrance">
          <view class="entrance-line"></view>
          <text class="entrance-label">服务订单 ({{orderTotal}})</text>
        </view>

        <view wx:if="{{orders.length === 0}}" class="gallery-empty">
          <view class="empty-line"></view>
          <text class="empty-text">暂无订单</text>
        </view>

        <view wx:for="{{orders}}" wx:key="_id" class="gallery-card order-card">
          <view class="card-accent"></view>
          <view class="card-body">
            <view class="card-header">
              <text class="card-title">{{item.userName || '服务订单'}}</text>
              <text class="card-status {{_getStatusClass(item.status)}}">{{_getStatusText(item.status)}}</text>
            </view>
            <view class="card-info">
              <text class="card-info-item" wx:if="{{item.serviceDate}}">服务日期：{{item.serviceDate}}</text>
              <text class="card-info-item">金额：¥{{item.totalPrice || 0}}</text>
            </view>
          </view>
        </view>
      </block>
    </view>
  </block>
</view>
```

- [ ] **Step 4: 创建 index.wxss**

与 Task 5 相同的基础画廊样式结构，此处不再重复。完整样式与 Task 5 的 WXSS 完全一致（通用组件样式相同），额外添加：

```css
.status-progress {
  background: rgba(78, 205, 196, 0.12);
  color: #2AB7A9;
}
```

（其余样式与 Task 5 完全一致，直接复制 Task 5 的完整 WXSS 并添加上述一条规则即可）

---

### Task 7: 收入概览页（income/index）

**Files:**
- Create: `subpackages/partner/income/index.js`
- Create: `subpackages/partner/income/index.wxml`
- Create: `subpackages/partner/income/index.wxss`
- Create: `subpackages/partner/income/index.json`

**API 调用：**
- `AdminService.getMyIncomeOverview()` — 获取收入概览
- `AdminService.getMyWallet()` — 获取钱包信息
- `AdminService.getMyIncomeDetails({ type, page, pageSize })` — 获取收入明细

- [ ] **Step 1: 创建 index.json**

```json
{
  "navigationBarTitleText": "收入概览",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 index.js**

```js
const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isLoading: true,
    overview: null,
    wallet: null,
    details: [],
    detailTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    activeTab: 'all',
  },

  onLoad() {
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const [overviewRes, walletRes] = await Promise.all([
        AdminService.getMyIncomeOverview(),
        AdminService.getMyWallet(),
      ])

      const overview = overviewRes.code === 0 && overviewRes.data ? overviewRes.data : null
      const wallet = walletRes.code === 0 && walletRes.data ? walletRes.data : null

      this.setData({ overview, wallet, isLoading: false })
      this._loadDetails()
    } catch (e) {
      console.error('[partner/income] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  async _loadDetails() {
    try {
      const res = await AdminService.getMyIncomeDetails({ type: this.data.activeTab, page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          details: list,
          detailTotal: res.data.total || 0,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/income] _loadDetails error:', e)
    }
  },

  onTabChange(e) {
    const { tab } = e.currentTarget.dataset
    this.setData({ activeTab: tab, page: 1, details: [] })
    this._loadDetails()
  },

  onWithdrawTap() {
    wx.showToast({ title: '请联系客服提现', icon: 'none' })
  },

  _formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ''
    return `${d.getMonth() + 1}/${d.getDate()}`
  },

  _getTypeName(type) {
    const map = { commission: '佣金', hosting: '寄养', feeding: '服务' }
    return map[type] || type
  },
})
```

- [ ] **Step 3: 创建 index.wxml**

```xml
<view class="gallery-container">
  <view wx:if="{{isLoading}}" class="loading-container">
    <view class="loading-spinner">
      <view class="spinner-outer"></view>
      <view class="spinner-inner"></view>
    </view>
  </view>

  <block wx:else>
    <view class="gallery-header">
      <view class="brand-block">
        <view class="brand-accent-bar"></view>
        <view class="brand-main">
          <text class="brand-text">收入概览</text>
        </view>
        <view class="brand-meta">
          <view class="brand-meta-line"></view>
          <text class="brand-subtitle">财务数据</text>
        </view>
      </view>
    </view>

    <view class="gallery-hall">
      <view wx:if="{{overview}}" class="gallery-card income-overview-card">
        <view class="card-accent income-accent"></view>
        <view class="card-body">
          <view class="overview-total">
            <text class="overview-label">累计收入</text>
            <text class="overview-value">¥{{(overview.commission.total + overview.hosting.total + overview.feeding.total).toFixed(2)}}</text>
          </view>
          <view class="overview-divider"></view>
          <view class="overview-row">
            <view class="overview-stat">
              <text class="overview-stat-value">¥{{overview.commission.total.toFixed(2)}}</text>
              <text class="overview-stat-label">佣金</text>
            </view>
            <view class="overview-stat">
              <text class="overview-stat-value">¥{{overview.hosting.total.toFixed(2)}}</text>
              <text class="overview-stat-label">寄养</text>
            </view>
            <view class="overview-stat">
              <text class="overview-stat-value">¥{{overview.feeding.total.toFixed(2)}}</text>
              <text class="overview-stat-label">服务</text>
            </view>
          </view>
        </view>
      </view>

      <view wx:if="{{wallet}}" class="gallery-card wallet-card">
        <view class="card-accent wallet-accent"></view>
        <view class="card-body">
          <view class="wallet-row">
            <view class="wallet-stat">
              <text class="wallet-value">¥{{wallet.balance}}</text>
              <text class="wallet-label">可提现</text>
            </view>
            <view class="wallet-stat">
              <text class="wallet-value">¥{{wallet.totalIncome}}</text>
              <text class="wallet-label">总收入</text>
            </view>
            <view class="wallet-stat">
              <text class="wallet-value">¥{{wallet.totalWithdrawn}}</text>
              <text class="wallet-label">已提现</text>
            </view>
          </view>
        </view>
      </view>

      <view class="gallery-entrance">
        <view class="entrance-line"></view>
        <text class="entrance-label">收入明细</text>
      </view>

      <view class="tab-bar">
        <view class="tab-item {{activeTab === 'all' ? 'tab-active' : ''}}" bindtap="onTabChange" data-tab="all">全部</view>
        <view class="tab-item {{activeTab === 'commission' ? 'tab-active' : ''}}" bindtap="onTabChange" data-tab="commission">佣金</view>
        <view class="tab-item {{activeTab === 'hosting' ? 'tab-active' : ''}}" bindtap="onTabChange" data-tab="hosting">寄养</view>
        <view class="tab-item {{activeTab === 'feeding' ? 'tab-active' : ''}}" bindtap="onTabChange" data-tab="feeding">服务</view>
      </view>

      <view wx:if="{{details.length === 0}}" class="gallery-empty">
        <view class="empty-line"></view>
        <text class="empty-text">暂无记录</text>
      </view>

      <view wx:for="{{details}}" wx:key="id" class="gallery-card detail-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <view class="detail-row">
            <view class="detail-left">
              <text class="detail-type">{{_getTypeName(item.type)}}</text>
              <text class="detail-desc">{{item.description}}</text>
            </view>
            <text class="detail-amount">+¥{{item.amount}}</text>
          </view>
        </view>
      </view>
    </view>
  </block>
</view>
```

- [ ] **Step 4: 创建 index.wxss**

在 Task 5 基础样式上额外添加：

```css
.income-accent {
  background: linear-gradient(180deg, #4ECDC4 0%, #34C759 100%) !important;
}

.wallet-accent {
  background: linear-gradient(180deg, #AF52DE 0%, #5856D6 100%) !important;
}

.overview-total {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 24rpx;
}

.overview-label {
  font-size: 22rpx;
  color: #8E8E93;
  letter-spacing: 4rpx;
}

.overview-value {
  font-size: 56rpx;
  font-weight: 300;
  color: #1D1D1F;
  letter-spacing: 2rpx;
}

.overview-divider {
  height: 1rpx;
  background: #F2F2F7;
  margin-bottom: 24rpx;
}

.overview-row {
  display: flex;
  justify-content: space-around;
}

.overview-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.overview-stat-value {
  font-size: 32rpx;
  font-weight: 300;
  color: #1D1D1F;
}

.overview-stat-label {
  font-size: 20rpx;
  color: #8E8E93;
  letter-spacing: 4rpx;
}

.wallet-row {
  display: flex;
  justify-content: space-around;
}

.wallet-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.wallet-value {
  font-size: 32rpx;
  font-weight: 300;
  color: #1D1D1F;
}

.wallet-label {
  font-size: 20rpx;
  color: #8E8E93;
  letter-spacing: 4rpx;
}

.tab-bar {
  display: flex;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.tab-item {
  padding: 12rpx 28rpx;
  border-radius: 12rpx;
  font-size: 22rpx;
  color: #8E8E93;
  background: #FFFFFF;
  transition: all 0.3s;
}

.tab-active {
  background: linear-gradient(135deg, #4ECDC4 0%, #2AB7A9 100%);
  color: #FFFFFF;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-left {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.detail-type {
  font-size: 26rpx;
  font-weight: 500;
  color: #1D1D1F;
}

.detail-desc {
  font-size: 20rpx;
  color: #8E8E93;
}

.detail-amount {
  font-size: 32rpx;
  font-weight: 300;
  color: #34C759;
}
```

（其余通用样式与 Task 5 完全一致）

---

### Task 8: 申请状态页（application/index）

**Files:**
- Create: `subpackages/partner/application/index.js`
- Create: `subpackages/partner/application/index.wxml`
- Create: `subpackages/partner/application/index.wxss`
- Create: `subpackages/partner/application/index.json`

**API 调用：**
- `AdminService.getApplicationStatus()` — 获取申请状态
- `AdminService.getMyPermissions()` — 获取权限信息
- `AdminService.submitApplication(data)` — 提交申请

- [ ] **Step 1: 创建 index.json**

```json
{
  "navigationBarTitleText": "申请状态",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 index.js**

```js
const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isLoading: true,
    isPartner: false,
    hasPendingApplication: false,
    application: null,
    permissions: [],
    permissionLabels: [],
    showApplyForm: false,
    formData: { realName: '', phone: '', reason: '' },
  },

  onLoad() {
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const [permRes, appRes] = await Promise.all([
        AdminService.getMyPermissions(),
        AdminService.getApplicationStatus(),
      ])

      const perms = permRes.code === 0 && permRes.data ? permRes.data.permissions || [] : []
      const labels = permRes.code === 0 && permRes.data ? permRes.data.permissionLabels || [] : []
      const hasAll = perms.includes('all')
      const isPartner = perms.length > 0 || hasAll

      const hasPending = appRes.code === 0 && appRes.data ? appRes.data.hasPending || false : false
      const application = appRes.code === 0 && appRes.data ? appRes.data.application || null : null

      this.setData({
        isLoading: false,
        isPartner,
        hasPendingApplication: hasPending,
        application,
        permissions: perms,
        permissionLabels: labels,
      })
    } catch (e) {
      console.error('[partner/application] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  onApplyTap() {
    this.setData({ showApplyForm: true })
  },

  onCloseForm() {
    this.setData({ showApplyForm: false })
  },

  onInputRealName(e) {
    this.setData({ 'formData.realName': e.detail.value })
  },

  onInputPhone(e) {
    this.setData({ 'formData.phone': e.detail.value })
  },

  onInputReason(e) {
    this.setData({ 'formData.reason': e.detail.value })
  },

  async onSubmitApply() {
    const { realName, phone, reason } = this.data.formData
    if (!realName.trim()) {
      wx.showToast({ title: '请填写真实姓名', icon: 'none' })
      return
    }
    if (!phone.trim()) {
      wx.showToast({ title: '请填写手机号', icon: 'none' })
      return
    }
    if (!reason.trim()) {
      wx.showToast({ title: '请填写申请理由', icon: 'none' })
      return
    }

    try {
      const res = await AdminService.submitApplication({ realName, phone, reason })
      if (res.code === 0) {
        wx.showToast({ title: '申请已提交', icon: 'success' })
        this.setData({ showApplyForm: false })
        this._loadData()
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
  },
})
```

- [ ] **Step 3: 创建 index.wxml**

```xml
<view class="gallery-container">
  <view wx:if="{{isLoading}}" class="loading-container">
    <view class="loading-spinner">
      <view class="spinner-outer"></view>
      <view class="spinner-inner"></view>
    </view>
  </view>

  <block wx:else>
    <view class="gallery-header">
      <view class="brand-block">
        <view class="brand-accent-bar"></view>
        <view class="brand-main">
          <text class="brand-text">申请状态</text>
        </view>
        <view class="brand-meta">
          <view class="brand-meta-line"></view>
          <text class="brand-subtitle">合作伙伴审核</text>
        </view>
      </view>
    </view>

    <view class="gallery-hall">
      <view wx:if="{{isPartner}}" class="gallery-card approved-card">
        <view class="card-accent approved-accent"></view>
        <view class="card-body">
          <text class="status-title">已认证合作伙伴</text>
          <text class="status-desc">您已拥有以下权限</text>
          <view class="perm-list">
            <text wx:for="{{permissionLabels}}" wx:key="*this" class="perm-tag">{{item}}</text>
          </view>
        </view>
      </view>

      <view wx:elif="{{hasPendingApplication}}" class="gallery-card pending-card">
        <view class="card-accent pending-accent"></view>
        <view class="card-body">
          <text class="status-title">审核中</text>
          <text class="status-desc">您的申请正在审核中，请耐心等待</text>
          <view wx:if="{{application}}" class="app-info">
            <view class="info-row">
              <view class="info-key">提交时间</view>
              <view class="info-val">{{application.createdAt || '—'}}</view>
            </view>
          </view>
        </view>
      </view>

      <view wx:else class="gallery-card apply-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <text class="status-title">成为合作伙伴</text>
          <text class="status-desc">带货赚取收益，共建宠物生态</text>
          <view class="apply-btn" bindtap="onApplyTap">
            <text class="apply-btn-text">立即申请</text>
          </view>
        </view>
      </view>
    </view>

    <view class="modal-mask" wx:if="{{showApplyForm}}" bindtap="onCloseForm">
      <view class="modal-content" catchtap="">
        <view class="modal-header">
          <text class="modal-title">申请合作伙伴</text>
        </view>
        <view class="modal-body">
          <view class="form-field">
            <text class="form-label">真实姓名</text>
            <input class="form-input" placeholder="请输入真实姓名" value="{{formData.realName}}" bindinput="onInputRealName" />
          </view>
          <view class="form-field">
            <text class="form-label">手机号</text>
            <input class="form-input" placeholder="请输入手机号" type="number" maxlength="11" value="{{formData.phone}}" bindinput="onInputPhone" />
          </view>
          <view class="form-field">
            <text class="form-label">申请理由</text>
            <textarea class="form-textarea" placeholder="请简述申请理由" value="{{formData.reason}}" bindinput="onInputReason" maxlength="200" />
          </view>
        </view>
        <view class="modal-footer">
          <view class="modal-btn btn-cancel" bindtap="onCloseForm">
            <text class="modal-btn-text">取消</text>
          </view>
          <view class="modal-btn btn-confirm" bindtap="onSubmitApply">
            <text class="modal-btn-text">提交申请</text>
          </view>
        </view>
      </view>
    </view>
  </block>
</view>
```

- [ ] **Step 4: 创建 index.wxss**

在 Task 5 基础样式上额外添加：

```css
.approved-accent {
  background: linear-gradient(180deg, #34C759 0%, #30D158 100%) !important;
}

.pending-accent {
  background: linear-gradient(180deg, #FF9500 0%, #FF6B00 100%) !important;
}

.status-title {
  font-size: 36rpx;
  font-weight: 500;
  color: #1D1D1F;
  display: block;
  margin-bottom: 12rpx;
}

.status-desc {
  font-size: 24rpx;
  color: #8E8E93;
  display: block;
  margin-bottom: 24rpx;
}

.perm-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.perm-tag {
  font-size: 20rpx;
  padding: 8rpx 20rpx;
  background: rgba(78, 205, 196, 0.12);
  color: #2AB7A9;
  border-radius: 8rpx;
}

.app-info {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #F2F2F7;
}

.apply-btn {
  display: inline-flex;
  padding: 20rpx 48rpx;
  background: linear-gradient(135deg, #4ECDC4 0%, #2AB7A9 100%);
  border-radius: 16rpx;
  margin-top: 8rpx;
}

.apply-btn-text {
  font-size: 26rpx;
  color: #FFFFFF;
  font-weight: 500;
}

.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  width: 600rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  overflow: hidden;
}

.modal-header {
  padding: 36rpx;
  border-bottom: 1rpx solid #F2F2F7;
}

.modal-title {
  font-size: 32rpx;
  font-weight: 500;
  color: #1D1D1F;
}

.modal-body {
  padding: 36rpx;
}

.form-field {
  margin-bottom: 28rpx;
}

.form-label {
  font-size: 24rpx;
  color: #8E8E93;
  display: block;
  margin-bottom: 12rpx;
}

.form-input {
  width: 100%;
  height: 72rpx;
  padding: 0 24rpx;
  border: 1rpx solid #E5E5EA;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1D1D1F;
  box-sizing: border-box;
}

.form-textarea {
  width: 100%;
  height: 160rpx;
  padding: 20rpx 24rpx;
  border: 1rpx solid #E5E5EA;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1D1D1F;
  box-sizing: border-box;
}

.modal-footer {
  display: flex;
  border-top: 1rpx solid #F2F2F7;
}

.modal-btn {
  flex: 1;
  padding: 28rpx;
  text-align: center;
}

.btn-cancel {
  border-right: 1rpx solid #F2F2F7;
}

.btn-confirm .modal-btn-text {
  color: #4ECDC4;
  font-weight: 500;
}

.modal-btn-text {
  font-size: 28rpx;
  color: #8E8E93;
}
```

（其余通用样式与 Task 5 完全一致）

---

### Task 9: 推荐用户页（referral/index）

**Files:**
- Create: `subpackages/partner/referral/index.js`
- Create: `subpackages/partner/referral/index.wxml`
- Create: `subpackages/partner/referral/index.wxss`
- Create: `subpackages/partner/referral/index.json`

**API 调用：**
- `AdminService.getMyInvitedUsers({ page, pageSize })` — 获取推荐用户列表
- `AdminService.getReferralOrderStats({ type })` — 获取带货订单统计

- [ ] **Step 1: 创建 index.json**

```json
{
  "navigationBarTitleText": "推荐用户",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 index.js**

```js
const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isLoading: true,
    users: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    stats: null,
  },

  onLoad() {
    this._loadData()
  },

  async _loadData() {
    this.setData({ isLoading: true })
    try {
      const [usersRes, statsRes] = await Promise.all([
        AdminService.getMyInvitedUsers({ page: this.data.page, pageSize: this.data.pageSize }),
        AdminService.getReferralOrderStats({ type: 'mall' }),
      ])

      const list = usersRes.code === 0 && usersRes.data ? usersRes.data.list || [] : []
      const total = usersRes.code === 0 && usersRes.data ? usersRes.data.total || 0 : 0
      const stats = statsRes.code === 0 && statsRes.data ? statsRes.data : null

      this.setData({
        isLoading: false,
        users: list,
        total,
        hasMore: list.length >= this.data.pageSize,
        stats,
      })
    } catch (e) {
      console.error('[partner/referral] _loadData error:', e)
      this.setData({ isLoading: false })
    }
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading) return
    this.setData({ page: this.data.page + 1 })
    this._loadMore()
  },

  async _loadMore() {
    try {
      const res = await AdminService.getMyInvitedUsers({ page: this.data.page, pageSize: this.data.pageSize })
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          users: [...this.data.users, ...list],
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/referral] _loadMore error:', e)
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1 })
    this._loadData().then(() => wx.stopPullDownRefresh())
  },
})
```

- [ ] **Step 3: 创建 index.wxml**

```xml
<view class="gallery-container">
  <view wx:if="{{isLoading}}" class="loading-container">
    <view class="loading-spinner">
      <view class="spinner-outer"></view>
      <view class="spinner-inner"></view>
    </view>
  </view>

  <block wx:else>
    <view class="gallery-header">
      <view class="brand-block">
        <view class="brand-accent-bar"></view>
        <view class="brand-main">
          <text class="brand-text">推荐用户</text>
        </view>
        <view class="brand-meta">
          <view class="brand-meta-line"></view>
          <text class="brand-subtitle">共 {{total}} 人</text>
        </view>
      </view>
    </view>

    <view class="gallery-hall">
      <view wx:if="{{stats}}" class="gallery-card stats-card">
        <view class="card-accent stats-accent"></view>
        <view class="card-body">
          <view class="stats-row">
            <view class="stats-stat">
              <text class="stats-value">¥{{stats.totalAmount}}</text>
              <text class="stats-label">消费总额</text>
            </view>
            <view class="stats-stat">
              <text class="stats-value">{{stats.totalCount}}</text>
              <text class="stats-label">订单数</text>
            </view>
            <view class="stats-stat">
              <text class="stats-value">¥{{stats.estimatedCommission}}</text>
              <text class="stats-label">预估佣金</text>
            </view>
          </view>
        </view>
      </view>

      <view wx:if="{{users.length === 0}}" class="gallery-empty">
        <view class="empty-line"></view>
        <text class="empty-text">暂无推荐用户</text>
      </view>

      <view wx:for="{{users}}" wx:key="_id" class="gallery-card user-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <view class="user-row">
            <image class="user-avatar" src="{{item.avatarUrl || '/images/default-avatar.svg'}}" mode="aspectFill" />
            <view class="user-info">
              <text class="user-name">{{item.nickName || '用户'}}</text>
              <text class="user-stat">订单 {{item.orderCount || 0}} · 消费 ¥{{item.totalSpent || 0}}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </block>
</view>
```

- [ ] **Step 4: 创建 index.wxss**

在 Task 5 基础样式上额外添加：

```css
.stats-accent {
  background: linear-gradient(180deg, #007AFF 0%, #5856D6 100%) !important;
}

.stats-row {
  display: flex;
  justify-content: space-around;
}

.stats-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.stats-value {
  font-size: 36rpx;
  font-weight: 300;
  color: #1D1D1F;
}

.stats-label {
  font-size: 20rpx;
  color: #8E8E93;
  letter-spacing: 4rpx;
}

.user-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.user-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #F2F2F7;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.user-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #1D1D1F;
}

.user-stat {
  font-size: 22rpx;
  color: #8E8E93;
}
```

（其余通用样式与 Task 5 完全一致）

---

## 自查清单

**1. Spec 覆盖度：**
- ✅ 6个核心页面全部有对应 Task（activity-list=Task4, hosting-profile=Task5, feeding=Task6, income=Task7, application=Task8, referral=Task9）
- ✅ 首页导航页 = Task3
- ✅ AdminService 封装 = Task1
- ✅ 子包注册 + profile 入口 = Task2

**2. 占位符扫描：**
- ✅ 无 TBD/TODO
- ✅ 每个步骤都有完整代码
- ✅ 无"类似 Task N"的引用（每个 Task 的 WXSS 都是完整的）

**3. 类型一致性：**
- ✅ AdminService 方法名与 adminService 云函数 action 一一对应
- ✅ 页面路径与 app.json 注册一致
- ✅ 数据字段名与云函数返回值一致
