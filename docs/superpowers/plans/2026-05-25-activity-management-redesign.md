# 活动管理页优化 + 创建活动页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构活动管理页增加标签分类筛选和创建按钮，新建活动创建页面

**Architecture:** 重写 activity-list 页面增加分类Tab筛选（全部/草稿/已发布/已结束）和浮动创建按钮；新建 activity-create 页面包含完整的活动创建表单，调用 AdminService.createActivity 提交

**Tech Stack:** 微信小程序原生开发、AdminService API、画廊展陈风格

---

## 文件结构

### 修改文件
- `subpackages/partner/activity-list/index.js` — 重写，增加分类筛选逻辑
- `subpackages/partner/activity-list/index.wxml` — 重写，增加Tab栏和创建按钮
- `subpackages/partner/activity-list/index.wxss` — 重写，增加Tab和FAB样式
- `subpackages/partner/activity-list/index.json` — 添加 enablePullDownRefresh

### 新建文件
- `subpackages/partner/activity-create/index.js`
- `subpackages/partner/activity-create/index.wxml`
- `subpackages/partner/activity-create/index.wxss`
- `subpackages/partner/activity-create/index.json`

### 关联修改
- `app.json` — partner 子包 pages 数组添加 `activity-create/index`

---

## 活动数据模型（来自 createActivity 云函数）

```
activities 集合字段：
  title: string          — 活动标题（必填）
  category: string       — 分类：outdoor/indoor/social/training/competition/adoption/other
  description: string    — 活动描述
  price: number          — 总价
  pricePerPerson: number — 每人价格
  pricePerPet: number    — 每宠价格
  maxParticipants: number — 最大人数
  location: string       — 地点
  latitude: number       — 纬度
  longitude: number      — 经度
  startTime: string      — 开始时间
  endTime: string        — 结束时间
  coverUrl: string       — 封面图
  images: string[]       — 图片列表
  contactName: string    — 联系人
  contactPhone: string   — 联系电话
  wechatId: string       — 微信号
  status: string         — draft/published/ended/cancelled
  currentParticipants: number — 当前报名人数
  organizer: { name, avatar } — 组织者信息（自动填充）
  createdAt: serverDate
  updatedAt: serverDate
```

---

### Task 1: 重写活动管理页（activity-list）

**Files:**
- Modify: `subpackages/partner/activity-list/index.js`
- Modify: `subpackages/partner/activity-list/index.wxml`
- Modify: `subpackages/partner/activity-list/index.wxss`
- Modify: `subpackages/partner/activity-list/index.json`

- [ ] **Step 1: 修改 index.json 添加下拉刷新**

```json
{
  "navigationBarTitleText": "活动管理",
  "enablePullDownRefresh": true,
  "usingComponents": {}
}
```

- [ ] **Step 2: 重写 index.js**

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
    currentTab: 'all',
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'draft', label: '草稿' },
      { key: 'published', label: '已发布' },
      { key: 'ended', label: '已结束' },
    ],
  },

  onLoad() {
    this._loadData()
  },

  onShow() {
    if (!this.data.isLoading) {
      this._loadData()
    }
  },

  async _loadData() {
    this.setData({ isLoading: true, page: 1 })
    try {
      const params = { page: 1, pageSize: this.data.pageSize }
      if (this.data.currentTab !== 'all') {
        params.status = this.data.currentTab
      }
      const res = await AdminService.getActivityList(params)
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

  onTabTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.currentTab) return
    this.setData({ currentTab: key })
    this._loadData()
  },

  onCreateTap() {
    wx.navigateTo({ url: '/subpackages/partner/activity-create/index' })
  },

  onActivityTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subpackages/activity/detail?id=${id}` })
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading) return
    this._loadMore()
  },

  async _loadMore() {
    const nextPage = this.data.page + 1
    try {
      const params = { page: nextPage, pageSize: this.data.pageSize }
      if (this.data.currentTab !== 'all') {
        params.status = this.data.currentTab
      }
      const res = await AdminService.getActivityList(params)
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        this.setData({
          activities: [...this.data.activities, ...list],
          page: nextPage,
          hasMore: list.length >= this.data.pageSize,
        })
      }
    } catch (e) {
      console.error('[partner/activity-list] _loadMore error:', e)
    }
  },

  onPullDownRefresh() {
    this._loadData().then(() => wx.stopPullDownRefresh())
  },

  _getStatusLabel(status) {
    const map = { draft: '草稿', published: '已发布', ended: '已结束', cancelled: '已取消' }
    return map[status] || status
  },
})
```

- [ ] **Step 3: 重写 index.wxml**

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

    <view class="tab-bar">
      <view
        wx:for="{{tabs}}"
        wx:key="key"
        class="tab-item {{currentTab === item.key ? 'tab-active' : ''}}"
        data-key="{{item.key}}"
        bindtap="onTabTap"
      >
        <text class="tab-text">{{item.label}}</text>
      </view>
    </view>

    <view class="gallery-hall">
      <view wx:if="{{activities.length === 0}}" class="gallery-empty">
        <view class="empty-line"></view>
        <text class="empty-text">暂无活动</text>
      </view>

      <view wx:for="{{activities}}" wx:key="_id" class="gallery-card" bindtap="onActivityTap" data-id="{{item._id}}">
        <view class="card-accent card-accent-{{item.status}}"></view>
        <view class="card-body">
          <view class="card-header">
            <text class="card-title">{{item.title}}</text>
            <text class="card-status status-{{item.status}}">{{_getStatusLabel(item.status)}}</text>
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

  <view class="fab-btn" bindtap="onCreateTap">
    <text class="fab-icon">+</text>
  </view>
</view>
```

- [ ] **Step 4: 重写 index.wxss**

```css
.gallery-container {
  min-height: 100vh;
  background-color: #F5F5F7;
  padding-bottom: calc(env(safe-area-inset-bottom) + 120rpx);
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

.tab-bar {
  display: flex;
  gap: 16rpx;
  padding: 24rpx 32rpx;
  background: #F5F5F7;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-item {
  padding: 14rpx 32rpx;
  border-radius: 12rpx;
  font-size: 24rpx;
  color: #8E8E93;
  background: #FFFFFF;
  transition: all 0.3s;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.tab-active {
  background: linear-gradient(135deg, #4ECDC4 0%, #2AB7A9 100%);
  color: #FFFFFF;
  box-shadow: 0 4rpx 16rpx rgba(78, 205, 196, 0.3);
}

.tab-text {
  font-weight: 500;
  letter-spacing: 2rpx;
}

.gallery-hall {
  padding: 0 32rpx 32rpx;
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

.card-accent-draft {
  background: linear-gradient(180deg, #8E8E93 0%, #C7C7CC 100%);
}

.card-accent-published {
  background: linear-gradient(180deg, #4ECDC4 0%, #2AB7A9 100%);
}

.card-accent-ended {
  background: linear-gradient(180deg, #C7C7CC 0%, #E5E5EA 100%);
}

.card-accent-cancelled {
  background: linear-gradient(180deg, #FF3B30 0%, #FF6B6B 100%);
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

.fab-btn {
  position: fixed;
  right: 40rpx;
  bottom: calc(env(safe-area-inset-bottom) + 60rpx);
  width: 108rpx;
  height: 108rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #4ECDC4 0%, #2AB7A9 100%);
  box-shadow: 0 8rpx 32rpx rgba(78, 205, 196, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  transition: transform 0.2s;
}

.fab-btn:active {
  transform: scale(0.92);
}

.fab-icon {
  font-size: 52rpx;
  color: #FFFFFF;
  font-weight: 300;
  line-height: 1;
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

### Task 2: 新建活动创建页（activity-create）

**Files:**
- Create: `subpackages/partner/activity-create/index.json`
- Create: `subpackages/partner/activity-create/index.js`
- Create: `subpackages/partner/activity-create/index.wxml`
- Create: `subpackages/partner/activity-create/index.wxss`

- [ ] **Step 1: 创建 index.json**

```json
{
  "navigationBarTitleText": "创建活动",
  "usingComponents": {}
}
```

- [ ] **Step 2: 创建 index.js**

```js
const { AdminService } = require('../../../services/CloudFunctionService')

Page({
  data: {
    isSubmitting: false,
    formData: {
      title: '',
      category: 'outdoor',
      description: '',
      pricePerPerson: '',
      pricePerPet: '',
      maxParticipants: '',
      location: '',
      startTime: '',
      endTime: '',
      contactName: '',
      contactPhone: '',
      wechatId: '',
      coverUrl: '',
      images: [],
    },
    categories: [
      { key: 'outdoor', label: '户外活动' },
      { key: 'indoor', label: '室内活动' },
      { key: 'social', label: '社交聚会' },
      { key: 'training', label: '培训课程' },
      { key: 'competition', label: '比赛赛事' },
      { key: 'adoption', label: '领养活动' },
      { key: 'other', label: '其他活动' },
    ],
    showCategoryPicker: false,
    showStartTimePicker: false,
    showEndTimePicker: false,
    startPickerValue: new Date().getTime(),
    endPickerValue: new Date().getTime(),
    startPickerType: 'datetime',
    endPickerType: 'datetime',
  },

  onInputTitle(e) {
    this.setData({ 'formData.title': e.detail.value })
  },

  onInputDescription(e) {
    this.setData({ 'formData.description': e.detail.value })
  },

  onInputPricePerPerson(e) {
    this.setData({ 'formData.pricePerPerson': e.detail.value })
  },

  onInputPricePerPet(e) {
    this.setData({ 'formData.pricePerPet': e.detail.value })
  },

  onInputMaxParticipants(e) {
    this.setData({ 'formData.maxParticipants': e.detail.value })
  },

  onInputLocation(e) {
    this.setData({ 'formData.location': e.detail.value })
  },

  onInputContactName(e) {
    this.setData({ 'formData.contactName': e.detail.value })
  },

  onInputContactPhone(e) {
    this.setData({ 'formData.contactPhone': e.detail.value })
  },

  onInputWechatId(e) {
    this.setData({ 'formData.wechatId': e.detail.value })
  },

  onShowCategoryPicker() {
    this.setData({ showCategoryPicker: true })
  },

  onCloseCategoryPicker() {
    this.setData({ showCategoryPicker: false })
  },

  onCategorySelect(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ 'formData.category': key, showCategoryPicker: false })
  },

  onShowStartTimePicker() {
    this.setData({ showStartTimePicker: true })
  },

  onCloseStartTimePicker() {
    this.setData({ showStartTimePicker: false })
  },

  onStartTimeConfirm(e) {
    const date = new Date(e.detail)
    const formatted = this._formatDateTime(date)
    this.setData({ 'formData.startTime': formatted, showStartTimePicker: false })
  },

  onShowEndTimePicker() {
    this.setData({ showEndTimePicker: true })
  },

  onCloseEndTimePicker() {
    this.setData({ showEndTimePicker: false })
  },

  onEndTimeConfirm(e) {
    const date = new Date(e.detail)
    const formatted = this._formatDateTime(date)
    this.setData({ 'formData.endTime': formatted, showEndTimePicker: false })
  },

  onChooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        this._uploadImage(tempPath, 'coverUrl')
      },
    })
  },

  onChooseImages() {
    const remaining = 9 - this.data.formData.images.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传9张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath)
        this._uploadImages(paths)
      },
    })
  },

  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.formData.images]
    images.splice(index, 1)
    this.setData({ 'formData.images': images })
  },

  async _uploadImage(tempPath, targetField) {
    wx.showLoading({ title: '上传中' })
    try {
      const cloudPath = `activities/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
      })
      this.setData({ [`formData.${targetField}`]: uploadRes.fileID })
    } catch (e) {
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
    wx.hideLoading()
  },

  async _uploadImages(tempPaths) {
    wx.showLoading({ title: '上传中' })
    const results = []
    for (const path of tempPaths) {
      try {
        const cloudPath = `activities/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: path,
        })
        results.push(uploadRes.fileID)
      } catch (e) {
        console.error('[activity-create] upload image error:', e)
      }
    }
    this.setData({ 'formData.images': [...this.data.formData.images, ...results] })
    wx.hideLoading()
  },

  _formatDateTime(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  _getCategoryLabel(key) {
    const cat = this.data.categories.find(c => c.key === key)
    return cat ? cat.label : key
  },

  async onSubmit() {
    const { formData } = this.data
    if (!formData.title.trim()) {
      wx.showToast({ title: '请填写活动标题', icon: 'none' })
      return
    }
    if (!formData.startTime) {
      wx.showToast({ title: '请选择开始时间', icon: 'none' })
      return
    }
    if (!formData.location.trim()) {
      wx.showToast({ title: '请填写活动地点', icon: 'none' })
      return
    }

    this.setData({ isSubmitting: true })

    try {
      const submitData = {
        title: formData.title.trim(),
        category: formData.category,
        description: formData.description.trim(),
        pricePerPerson: Number(formData.pricePerPerson) || 0,
        pricePerPet: Number(formData.pricePerPet) || 0,
        maxParticipants: Number(formData.maxParticipants) || 0,
        location: formData.location.trim(),
        startTime: formData.startTime,
        endTime: formData.endTime || '',
        coverUrl: formData.coverUrl || '',
        images: formData.images || [],
        contactName: formData.contactName.trim(),
        contactPhone: formData.contactPhone.trim(),
        wechatId: formData.wechatId.trim(),
        status: 'draft',
      }

      const res = await AdminService.createActivity(submitData)
      if (res.code === 0) {
        wx.showToast({ title: '创建成功', icon: 'success' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        wx.showToast({ title: res.message || '创建失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '创建失败，请重试', icon: 'none' })
    }

    this.setData({ isSubmitting: false })
  },

  onSubmitAndPublish() {
    this.setData({ 'formData.status': 'published' }, () => {
      this._doSubmit('published')
    })
  },

  async _doSubmit(status) {
    const { formData } = this.data
    if (!formData.title.trim()) {
      wx.showToast({ title: '请填写活动标题', icon: 'none' })
      return
    }
    if (!formData.startTime) {
      wx.showToast({ title: '请选择开始时间', icon: 'none' })
      return
    }
    if (!formData.location.trim()) {
      wx.showToast({ title: '请填写活动地点', icon: 'none' })
      return
    }

    this.setData({ isSubmitting: true })

    try {
      const submitData = {
        title: formData.title.trim(),
        category: formData.category,
        description: formData.description.trim(),
        pricePerPerson: Number(formData.pricePerPerson) || 0,
        pricePerPet: Number(formData.pricePerPet) || 0,
        maxParticipants: Number(formData.maxParticipants) || 0,
        location: formData.location.trim(),
        startTime: formData.startTime,
        endTime: formData.endTime || '',
        coverUrl: formData.coverUrl || '',
        images: formData.images || [],
        contactName: formData.contactName.trim(),
        contactPhone: formData.contactPhone.trim(),
        wechatId: formData.wechatId.trim(),
        status: status || 'draft',
      }

      const res = await AdminService.createActivity(submitData)
      if (res.code === 0) {
        wx.showToast({ title: status === 'published' ? '已发布' : '已保存', icon: 'success' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        wx.showToast({ title: res.message || '创建失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '创建失败，请重试', icon: 'none' })
    }

    this.setData({ isSubmitting: false })
  },
})
```

- [ ] **Step 3: 创建 index.wxml**

```xml
<view class="gallery-container">
  <view class="form-scroll">
    <view class="gallery-header">
      <view class="brand-block">
        <view class="brand-accent-bar"></view>
        <view class="brand-main">
          <text class="brand-text">创建活动</text>
        </view>
        <view class="brand-meta">
          <view class="brand-meta-line"></view>
          <text class="brand-subtitle">填写活动信息</text>
        </view>
      </view>
    </view>

    <view class="gallery-hall">
      <view class="gallery-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <view class="form-section-title">基本信息</view>

          <view class="form-field">
            <text class="form-label">活动标题 <text class="required">*</text></text>
            <input class="form-input" placeholder="请输入活动标题" value="{{formData.title}}" bindinput="onInputTitle" maxlength="50" />
          </view>

          <view class="form-field">
            <text class="form-label">活动分类</text>
            <view class="form-picker" bindtap="onShowCategoryPicker">
              <text class="form-picker-text">{{_getCategoryLabel(formData.category)}}</text>
              <text class="form-picker-arrow">›</text>
            </view>
          </view>

          <view class="form-field">
            <text class="form-label">活动描述</text>
            <textarea class="form-textarea" placeholder="请描述活动详情" value="{{formData.description}}" bindinput="onInputDescription" maxlength="1000" />
          </view>

          <view class="form-field">
            <text class="form-label">封面图片</text>
            <view class="image-upload-area" bindtap="onChooseCover">
              <image wx:if="{{formData.coverUrl}}" class="cover-preview" src="{{formData.coverUrl}}" mode="aspectFill" />
              <view wx:else class="upload-placeholder">
                <text class="upload-icon">+</text>
                <text class="upload-text">上传封面</text>
              </view>
            </view>
          </view>

          <view class="form-field">
            <text class="form-label">活动图片 (最多9张)</text>
            <view class="image-grid">
              <view wx:for="{{formData.images}}" wx:key="*this" class="image-grid-item">
                <image class="grid-image" src="{{item}}" mode="aspectFill" />
                <view class="image-remove" catchtap="onRemoveImage" data-index="{{index}}">×</view>
              </view>
              <view wx:if="{{formData.images.length < 9}}" class="image-grid-item image-add" bindtap="onChooseImages">
                <text class="upload-icon-small">+</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="gallery-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <view class="form-section-title">时间地点</view>

          <view class="form-field">
            <text class="form-label">开始时间 <text class="required">*</text></text>
            <view class="form-picker" bindtap="onShowStartTimePicker">
              <text class="form-picker-text {{formData.startTime ? '' : 'placeholder'}}">{{formData.startTime || '请选择开始时间'}}</text>
              <text class="form-picker-arrow">›</text>
            </view>
          </view>

          <view class="form-field">
            <text class="form-label">结束时间</text>
            <view class="form-picker" bindtap="onShowEndTimePicker">
              <text class="form-picker-text {{formData.endTime ? '' : 'placeholder'}}">{{formData.endTime || '请选择结束时间'}}</text>
              <text class="form-picker-arrow">›</text>
            </view>
          </view>

          <view class="form-field">
            <text class="form-label">活动地点 <text class="required">*</text></text>
            <input class="form-input" placeholder="请输入活动地点" value="{{formData.location}}" bindinput="onInputLocation" maxlength="100" />
          </view>
        </view>
      </view>

      <view class="gallery-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <view class="form-section-title">费用与名额</view>

          <view class="form-row">
            <view class="form-field form-field-half">
              <text class="form-label">每人价格</text>
              <input class="form-input" placeholder="0" type="digit" value="{{formData.pricePerPerson}}" bindinput="onInputPricePerPerson" />
            </view>
            <view class="form-field form-field-half">
              <text class="form-label">每宠价格</text>
              <input class="form-input" placeholder="0" type="digit" value="{{formData.pricePerPet}}" bindinput="onInputPricePerPet" />
            </view>
          </view>

          <view class="form-field">
            <text class="form-label">最大人数</text>
            <input class="form-input" placeholder="0 表示不限" type="number" value="{{formData.maxParticipants}}" bindinput="onInputMaxParticipants" />
          </view>
        </view>
      </view>

      <view class="gallery-card">
        <view class="card-accent"></view>
        <view class="card-body">
          <view class="form-section-title">联系方式</view>

          <view class="form-field">
            <text class="form-label">联系人</text>
            <input class="form-input" placeholder="请输入联系人姓名" value="{{formData.contactName}}" bindinput="onInputContactName" />
          </view>

          <view class="form-field">
            <text class="form-label">联系电话</text>
            <input class="form-input" placeholder="请输入联系电话" type="number" maxlength="11" value="{{formData.contactPhone}}" bindinput="onInputContactPhone" />
          </view>

          <view class="form-field">
            <text class="form-label">微信号</text>
            <input class="form-input" placeholder="请输入微信号" value="{{formData.wechatId}}" bindinput="onInputWechatId" />
          </view>
        </view>
      </view>
    </view>

    <view class="action-bar">
      <view class="action-btn action-btn-draft" bindtap="onSubmit">
        <text class="action-btn-text">保存草稿</text>
      </view>
      <view class="action-btn action-btn-publish" bindtap="onSubmitAndPublish">
        <text class="action-btn-text">立即发布</text>
      </view>
    </view>
  </view>

  <view class="picker-mask" wx:if="{{showCategoryPicker}}" bindtap="onCloseCategoryPicker">
    <view class="picker-sheet" catchtap="">
      <view class="picker-sheet-header">
        <text class="picker-sheet-title">选择分类</text>
      </view>
      <view class="picker-sheet-body">
        <view
          wx:for="{{categories}}"
          wx:key="key"
          class="picker-sheet-item {{formData.category === item.key ? 'picker-item-active' : ''}}"
          data-key="{{item.key}}"
          bindtap="onCategorySelect"
        >
          <text class="picker-sheet-item-text">{{item.label}}</text>
          <text wx:if="{{formData.category === item.key}}" class="picker-check">✓</text>
        </view>
      </view>
    </view>
  </view>

  <view class="picker-mask" wx:if="{{showStartTimePicker}}" bindtap="onCloseStartTimePicker">
    <view class="picker-sheet" catchtap="">
      <view class="picker-sheet-header">
        <text class="picker-sheet-title">选择开始时间</text>
      </view>
      <view class="picker-sheet-body">
        <van-datetime-picker
          type="datetime"
          value="{{startPickerValue}}"
          min-date="{{startPickerValue}}"
          bind:confirm="onStartTimeConfirm"
          bind:cancel="onCloseStartTimePicker"
        />
      </view>
    </view>
  </view>

  <view class="picker-mask" wx:if="{{showEndTimePicker}}" bindtap="onCloseEndTimePicker">
    <view class="picker-sheet" catchtap="">
      <view class="picker-sheet-header">
        <text class="picker-sheet-title">选择结束时间</text>
      </view>
      <view class="picker-sheet-body">
        <van-datetime-picker
          type="datetime"
          value="{{endPickerValue}}"
          min-date="{{startPickerValue}}"
          bind:confirm="onEndTimeConfirm"
          bind:cancel="onCloseEndTimePicker"
        />
      </view>
    </view>
  </view>
</view>
```

- [ ] **Step 4: 创建 index.wxss**

```css
.gallery-container {
  min-height: 100vh;
  background-color: #F5F5F7;
  padding-bottom: env(safe-area-inset-bottom);
}

.form-scroll {
  padding-bottom: 180rpx;
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
  margin-bottom: 24rpx;
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

.form-section-title {
  font-size: 28rpx;
  font-weight: 500;
  color: #1D1D1F;
  margin-bottom: 24rpx;
  letter-spacing: 4rpx;
}

.form-field {
  margin-bottom: 28rpx;
}

.form-field-half {
  flex: 1;
}

.form-label {
  font-size: 24rpx;
  color: #8E8E93;
  display: block;
  margin-bottom: 12rpx;
  letter-spacing: 2rpx;
}

.required {
  color: #FF3B30;
}

.form-input {
  width: 100%;
  height: 76rpx;
  padding: 0 24rpx;
  border: 1rpx solid #E5E5EA;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1D1D1F;
  box-sizing: border-box;
  background: #FAFAFA;
}

.form-input:focus {
  border-color: #4ECDC4;
  background: #FFFFFF;
}

.form-textarea {
  width: 100%;
  height: 200rpx;
  padding: 20rpx 24rpx;
  border: 1rpx solid #E5E5EA;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1D1D1F;
  box-sizing: border-box;
  background: #FAFAFA;
}

.form-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 76rpx;
  padding: 0 24rpx;
  border: 1rpx solid #E5E5EA;
  border-radius: 12rpx;
  background: #FAFAFA;
}

.form-picker-text {
  font-size: 28rpx;
  color: #1D1D1F;
}

.form-picker-text.placeholder {
  color: #C7C7CC;
}

.form-picker-arrow {
  font-size: 32rpx;
  color: #C7C7CC;
}

.form-row {
  display: flex;
  gap: 20rpx;
}

.image-upload-area {
  width: 100%;
  height: 320rpx;
  border: 2rpx dashed #E5E5EA;
  border-radius: 16rpx;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-preview {
  width: 100%;
  height: 100%;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.upload-icon {
  font-size: 56rpx;
  color: #C7C7CC;
  font-weight: 300;
  line-height: 1;
}

.upload-text {
  font-size: 22rpx;
  color: #8E8E93;
  letter-spacing: 4rpx;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
}

.image-grid-item {
  position: relative;
  width: 100%;
  padding-bottom: 100%;
  border-radius: 12rpx;
  overflow: hidden;
}

.grid-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.image-remove {
  position: absolute;
  top: 0;
  right: 0;
  width: 40rpx;
  height: 40rpx;
  background: rgba(0, 0, 0, 0.5);
  color: #FFFFFF;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0 0 0 12rpx;
}

.image-add {
  border: 2rpx dashed #E5E5EA;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FAFAFA;
}

.upload-icon-small {
  font-size: 40rpx;
  color: #C7C7CC;
  font-weight: 300;
}

.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 20rpx;
  padding: 24rpx 32rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  background: #FFFFFF;
  box-shadow: 0 -2rpx 16rpx rgba(0, 0, 0, 0.06);
  z-index: 50;
}

.action-btn {
  flex: 1;
  height: 88rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn-draft {
  background: #F2F2F7;
}

.action-btn-draft .action-btn-text {
  color: #1D1D1F;
  font-size: 28rpx;
  font-weight: 500;
}

.action-btn-publish {
  background: linear-gradient(135deg, #4ECDC4 0%, #2AB7A9 100%);
  box-shadow: 0 4rpx 16rpx rgba(78, 205, 196, 0.3);
}

.action-btn-publish .action-btn-text {
  color: #FFFFFF;
  font-size: 28rpx;
  font-weight: 500;
}

.picker-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.picker-sheet {
  width: 100%;
  background: #FFFFFF;
  border-radius: 24rpx 24rpx 0 0;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
}

.picker-sheet-header {
  padding: 32rpx 36rpx;
  border-bottom: 1rpx solid #F2F2F7;
}

.picker-sheet-title {
  font-size: 30rpx;
  font-weight: 500;
  color: #1D1D1F;
}

.picker-sheet-body {
  padding: 12rpx 0;
}

.picker-sheet-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 36rpx;
}

.picker-item-active {
  background: rgba(78, 205, 196, 0.06);
}

.picker-sheet-item-text {
  font-size: 28rpx;
  color: #1D1D1F;
}

.picker-item-active .picker-sheet-item-text {
  color: #2AB7A9;
  font-weight: 500;
}

.picker-check {
  font-size: 28rpx;
  color: #4ECDC4;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20rpx); }
  to { opacity: 1; transform: translateY(0); }
}
```

---

### Task 3: 注册 activity-create 页面到 app.json

**Files:**
- Modify: `app.json`

- [ ] **Step 1: 在 partner 子包的 pages 数组中添加 activity-create/index**

找到 app.json 中 partner 子包的 pages 数组：

```json
"pages": [
  "home/index",
  "activity-list/index",
  "hosting-profile/index",
  "feeding/index",
  "income/index",
  "application/index",
  "referral/index"
]
```

改为：

```json
"pages": [
  "home/index",
  "activity-list/index",
  "activity-create/index",
  "hosting-profile/index",
  "feeding/index",
  "income/index",
  "application/index",
  "referral/index"
]
```

---

### Task 4: 添加 createActivity 方法到 AdminService

**Files:**
- Modify: `services/CloudFunctionService.js`

- [ ] **Step 1: 在 AdminService 类中添加 createActivity 方法**

在 `getActivityRegistrations` 方法之后添加：

```js
  async createActivity(data) {
    return this.cloud.post('adminService', { action: 'createActivity', ...data })
  }
```

注意：检查 AdminService 中是否已存在 `createActivity` 方法。如果已存在则跳过此步骤。

---

## 自查清单

**1. Spec 覆盖度：**
- ✅ 标签分类筛选（全部/草稿/已发布/已结束）→ Task 1
- ✅ 创建新活动按钮 → Task 1 (FAB)
- ✅ 创建活动页面 → Task 2
- ✅ 页面注册 → Task 3
- ✅ API 方法 → Task 4

**2. 占位符扫描：**
- ✅ 无 TBD/TODO
- ✅ 每个步骤都有完整代码

**3. 类型一致性：**
- ✅ createActivity 参数与云函数 createActivity 的 event 参数一致
- ✅ activity-list 的 onShow 刷新确保创建后返回能看到新活动
- ✅ activity-create 路径与 app.json 注册一致
