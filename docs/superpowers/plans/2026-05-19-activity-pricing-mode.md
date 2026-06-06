# 活动灵活计费模式 实现方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 活动支持灵活计费——可单独按宠物数收费、单独按人数收费、或同时按两者收费。报名页重新设计，用户填写参加人数，宠物数以添加的宠物档案数量为准。

**Architecture:** 将活动数据模型中单一的 `price` 字段拆分为 `pricePerPerson`（每人费用）和 `pricePerPet`（每只宠物费用），两者可独立为0或同时大于0。报名时费用 = `pricePerPerson × 参加人数 + pricePerPet × 宠物档案数`。参与人数统计始终按 `+参加人数` 计算。

**Tech Stack:** 微信小程序 + CloudBase 云函数 + MongoDB

---

## 数据模型变更

```
activities 集合字段变更:
  移除: price (保留兼容，后续可删)
  新增: pricePerPerson: Number  // 每人费用，默认0
  新增: pricePerPet: Number     // 每只宠物费用，默认0

activity_registrations 集合新增字段:
  participantCount: Number      // 参加人数
  petCount: Number              // 宠物数
  pricePerPerson: Number        // 快照：每人单价
  pricePerPet: Number           // 快照：每只宠物单价
```

## 费用计算规则

| 场景 | pricePerPerson | pricePerPet | 计算公式 | 示例 |
|------|---------------|-------------|---------|------|
| 免费 | 0 | 0 | 0 | — |
| 按人数 | 50 | 0 | 50 × 人数 | 2人 = ¥100 |
| 按宠物数 | 0 | 30 | 30 × 宠物数 | 3只宠物 = ¥90 |
| 组合计费 | 50 | 30 | 50×人数 + 30×宠物数 | 2人3只 = ¥190 |

**参与人数增量**：始终 `+participantCount`（参加人数），不再用宠物数替代。

---

### Task 1: 后端 — 活动数据模型支持双价格字段

**Files:**
- Modify: `cloudfunctions/activityService/index.js` (createActivity、ACTIVITY_LIST_FIELDS)
- Modify: `cloudfunctions/activityService/common/validator.js` (白名单)

- [ ] **Step 1: 在 createActivity 中添加 pricePerPerson 和 pricePerPet**

`cloudfunctions/activityService/index.js` createActivity 函数中，activity 对象将：

```javascript
// 旧
price: price || 0,

// 新
price: (Number(event.pricePerPerson) || 0) + (Number(event.pricePerPet) || 0) || Number(event.price) || 0,
pricePerPerson: Number(event.pricePerPerson) || 0,
pricePerPet: Number(event.pricePerPet) || 0,
```

> `price` 字段保留为总价展示用（向后兼容），值为 pricePerPerson + pricePerPet

- [ ] **Step 2: 在 validator 白名单中添加新字段**

```javascript
activity: ['title', 'description', 'coverUrl', 'images', 'startTime', 'endTime', 'location', 'latitude', 'longitude', 'maxParticipants', 'category', 'price', 'pricePerPerson', 'pricePerPet', 'status', 'contactName', 'contactPhone', 'wechatId'],
```

- [ ] **Step 3: 在 ACTIVITY_LIST_FIELDS projection 中添加新字段**

```javascript
const ACTIVITY_LIST_FIELDS = {
  _id: true, title: true, coverUrl: true, startTime: true, endTime: true,
  location: true, latitude: true, longitude: true, category: true,
  price: true, pricePerPerson: true, pricePerPet: true,
  maxParticipants: true, currentParticipants: true, status: true,
  createdBy: true, createdAt: true, organizer: true,
}
```

- [ ] **Step 4: 部署 activityService 云函数**

---

### Task 2: 后端 — 报名逻辑适配双价格

**Files:**
- Modify: `cloudfunctions/activityService/index.js` (submitRegistration 函数)

- [ ] **Step 1: 修改 submitRegistration 费用计算和参与人数逻辑**

替换费用计算部分：

```javascript
// 旧
const isPaid = totalAmount > 0
const registration = {
  ...
  totalAmount: activityRes.data.price ? activityRes.data.price * pets.length : 0,
  ...
}
if (!isPaid) {
  await transaction.collection('activities').doc(activityId).update({
    data: { currentParticipants: _.inc(1), updatedAt: db.serverDate() }
  })
}
```

改为：

```javascript
const activity = activityRes.data
const pricePerPerson = activity.pricePerPerson || 0
const pricePerPet = activity.pricePerPet || 0
const participantCount = event.participantCount || 1
const petCount = pets.length + (friends ? friends.length : 0)
const calculatedAmount = pricePerPerson * participantCount + pricePerPet * petCount

const isPaid = calculatedAmount > 0
const registration = {
  activityId,
  openid,
  pets: pets.map(p => ({
    name: p.petName || p.name || '',
    gender: p.petGender || p.gender || 'male',
    breed: p.petBreed || p.breed || '',
    petId: p.petId || ''
  })),
  petIds: petIds || [],
  phone: phone || '',
  notes: notes || '',
  friends: friends || [],
  status: isPaid ? 'pending_payment' : 'confirmed',
  participantCount,
  petCount,
  pricePerPerson,
  pricePerPet,
  totalAmount: calculatedAmount,
  createdAt: now,
  updatedAt: now,
}

if (!isPaid) {
  await transaction.collection('activities').doc(activityId).update({
    data: { currentParticipants: _.inc(participantCount), updatedAt: db.serverDate() }
  })
}
```

- [ ] **Step 2: 修改 activityOrder 对象**

在 activityOrder 中添加：

```javascript
participantCount,
petCount,
pricePerPerson,
pricePerPet,
```

将 `basicPrice: registration.totalAmount` 保持不变。

- [ ] **Step 3: 部署 activityService 云函数**

---

### Task 3: 后端 — 支付确认和回调适配

**Files:**
- Modify: `cloudfunctions/paymentService/services/pay.js` (confirmPayment)
- Modify: `cloudfunctions/paymentService/services/notify.js` (paymentNotify)

- [ ] **Step 1: 修改 confirmPayment 活动参与人数逻辑**

替换：

```javascript
// 旧
await db.collection('activities').doc(existingOrder.activityId).update({
  data: { currentParticipants: _.inc(existingOrder.petIds ? existingOrder.petIds.length : 1), updatedAt: db.serverDate() },
})
```

改为：

```javascript
const incCount = existingOrder.participantCount || 1
await db.collection('activities').doc(existingOrder.activityId).update({
  data: { currentParticipants: _.inc(incCount), updatedAt: db.serverDate() },
})
```

- [ ] **Step 2: 修改 notify.js 活动参与人数逻辑**

同样替换为：

```javascript
const incCount = existingOrder.participantCount || 1
await db.collection('activities').doc(existingOrder.activityId).update({
  data: { currentParticipants: _.inc(incCount), updatedAt: db.serverDate() },
})
```

- [ ] **Step 3: 部署 paymentService 云函数**

---

### Task 4: 管理端 — 创建活动页费用选择器 + 双价格输入

**Files:**
- Modify: `subpackages/admin/activity/activity-edit/index.js`
- Modify: `subpackages/admin/activity/activity-edit/index.wxml`

- [ ] **Step 1: 在 JS data 中添加新字段**

```javascript
data: {
  ...
  isPaid: false,
  pricePerPerson: '',
  pricePerPet: '',
  priceTypeOptions: ['免费', '收费'],
  priceTypeIndex: 0,
}
```

- [ ] **Step 2: 添加费用类型切换方法**

```javascript
onPriceTypeChange(e) {
  const index = parseInt(e.detail.value, 10)
  const isPaid = index === 1
  this.setData({ priceTypeIndex: index, isPaid })
  if (!isPaid) {
    this.setData({ pricePerPerson: '', pricePerPet: '' })
  }
},

onPricePerPersonInput(e) { this.setData({ pricePerPerson: e.detail.value }) },
onPricePerPetInput(e) { this.setData({ pricePerPet: e.detail.value }) },
```

- [ ] **Step 3: 修改 _prepareData**

```javascript
_prepareData(status) {
  ...
  const isPaid = this.data.isPaid
  const pricePerPerson = isPaid ? (Number(this.data.pricePerPerson) || 0) : 0
  const pricePerPet = isPaid ? (Number(this.data.pricePerPet) || 0) : 0
  return {
    ...
    price: pricePerPerson + pricePerPet,
    pricePerPerson,
    pricePerPet,
    status: status,
  }
}
```

- [ ] **Step 4: 修改 _validateForm 增加收费校验**

```javascript
_validateForm() {
  ...
  if (this.data.isPaid) {
    if (!this.data.pricePerPerson && !this.data.pricePerPet) {
      wx.showToast({ title: '请至少填写一项费用', icon: 'none' })
      return false
    }
    if (this.data.pricePerPerson && Number(this.data.pricePerPerson) <= 0 && this.data.pricePerPet && Number(this.data.pricePerPet) <= 0) {
      wx.showToast({ title: '费用必须大于0', icon: 'none' })
      return false
    }
  }
  return true
}
```

- [ ] **Step 5: 在 _loadActivity 中回填新字段**

```javascript
const isPaid = (d.pricePerPerson > 0 || d.pricePerPet > 0)
this.setData({
  ...
  isPaid,
  priceTypeIndex: isPaid ? 1 : 0,
  pricePerPerson: d.pricePerPerson !== undefined ? String(d.pricePerPerson) : '',
  pricePerPet: d.pricePerPet !== undefined ? String(d.pricePerPet) : '',
})
```

- [ ] **Step 6: 修改 WXML 费用区域**

替换原来的单个费用输入框，改为选择器 + 条件展示：

```xml
<view class="form-field">
  <text class="field-label">活动费用</text>
  <picker
    mode="selector"
    range="{{priceTypeOptions}}"
    value="{{priceTypeIndex}}"
    bindchange="onPriceTypeChange"
  >
    <view class="picker-field">
      <view class="picker-content">
        <text class="picker-text">{{priceTypeOptions[priceTypeIndex]}}</text>
        <text class="picker-arrow">›</text>
      </view>
    </view>
  </picker>
</view>

<block wx:if="{{isPaid}}">
  <view class="form-field">
    <text class="field-label">每人费用 *</text>
    <input
      class="field-input"
      type="digit"
      value="{{pricePerPerson}}"
      bindinput="onPricePerPersonInput"
      placeholder="请输入每人费用"
      placeholder-class="placeholder"
    />
  </view>
  <view class="form-field">
    <text class="field-label">每只宠物费用 *</text>
    <input
      class="field-input"
      type="digit"
      value="{{pricePerPet}}"
      bindinput="onPricePerPetInput"
      placeholder="请输入每只宠物费用"
      placeholder-class="placeholder"
    />
  </view>
</block>
```

**交互说明：**
- 选择"免费"时，页面与现有免费活动创建一致，不显示价格输入框
- 选择"收费"时，展开两个必填输入框：每人费用、每只宠物费用
- 至少需要填写一项费用（可以只按人收费或只按宠物收费）
- 两个输入框都为0或都为空时，提交校验不通过

---

### Task 5: C端 — 报名页重新设计

**Files:**
- Modify: `subpackages/activity/register.js`
- Modify: `subpackages/activity/register.wxml`
- Modify: `subpackages/activity/register.wxss`

- [ ] **Step 1: 在 register.js data 中添加 participantCount**

```javascript
data: {
  ...
  participantCount: 1,
  pricePerPerson: 0,
  pricePerPet: 0,
}
```

- [ ] **Step 2: 修改 _loadActivity 费用计算**

```javascript
const pricePerPerson = activity.pricePerPerson || 0
const pricePerPet = activity.pricePerPet || 0
const petCount = 1
const totalAmount = pricePerPerson * 1 + pricePerPet * petCount
this.setData({
  activity,
  isRegistered: activity.isRegistered === true,
  pricePerPerson,
  pricePerPet,
  participantCount: 1,
  totalAmount,
  finalAmount: totalAmount,
})
```

- [ ] **Step 3: 添加参加人数输入和费用重算方法**

```javascript
onParticipantCountInput(e) {
  const count = Math.max(1, parseInt(e.detail.value) || 1)
  this.setData({ participantCount: count })
  this._recalculatePrice()
},

onParticipantCountBlur(e) {
  const count = Math.max(1, parseInt(e.detail.value) || 1)
  this.setData({ participantCount: count })
  this._recalculatePrice()
},

_recalculatePrice() {
  const { pricePerPerson, pricePerPet, pets, friends, participantCount, selectedCouponId, couponDiscount } = this.data
  const petCount = pets.length + (friends ? friends.length : 0)
  const totalAmount = pricePerPerson * participantCount + pricePerPet * petCount
  let finalAmount = totalAmount
  if (selectedCouponId && couponDiscount) {
    finalAmount = Math.max(0, Math.round((totalAmount - couponDiscount) * 100) / 100)
  }
  this.setData({ totalAmount, finalAmount })
},
```

- [ ] **Step 4: 在宠物增删和好友增删时调用 _recalculatePrice**

在 `onAddMorePet`、`onRemovePet`、`onSelectMyPet`、`onDeleteFriend` 后调用 `this._recalculatePrice()`

- [ ] **Step 5: 修改 onSubmit 传递 participantCount**

```javascript
const registrationData = {
  activityId,
  pets,
  phone,
  notes: notes || '',
  friends: friends || [],
  petIds: pets.map(p => p.petId).filter(Boolean),
  participantCount: this.data.participantCount,
  totalAmount: finalAmount,
  originalAmount: totalAmount,
  couponId: selectedCouponId || undefined,
  couponDiscount: couponDiscount || 0,
}
```

- [ ] **Step 6: 修改 register.wxml — 添加参加人数和费用明细**

在价格标签区域替换为费用明细：

```xml
<view class="price-detail" wx:if="{{pricePerPerson > 0 || pricePerPet > 0}}">
  <view class="price-row" wx:if="{{pricePerPerson > 0}}">
    <text class="price-label">每人</text>
    <text class="price-value">¥{{pricePerPerson}}/人</text>
  </view>
  <view class="price-row" wx:if="{{pricePerPet > 0}}">
    <text class="price-label">每只宠物</text>
    <text class="price-value">¥{{pricePerPet}}/只</text>
  </view>
</view>
<view class="price-tag" wx:else>
  <text class="price-value">免费</text>
</view>
```

在联系电话上方添加参加人数输入：

```xml
<view class="form-item">
  <text class="label">参加人数 *</text>
  <view class="input-container">
    <input
      class="input"
      type="number"
      placeholder="请输入参加人数"
      value="{{participantCount}}"
      bindinput="onParticipantCountInput"
      bindblur="onParticipantCountBlur"
    />
  </view>
</view>
```

在提交按钮上方添加费用汇总：

```xml
<view class="fee-summary" wx:if="{{totalAmount > 0}}">
  <view class="fee-row" wx:if="{{pricePerPerson > 0}}">
    <text>{{pricePerPerson}}元/人 × {{participantCount}}人</text>
    <text>¥{{pricePerPerson * participantCount}}</text>
  </view>
  <view class="fee-row" wx:if="{{pricePerPet > 0}}">
    <text>{{pricePerPet}}元/只 × {{pets.length}}只宠物</text>
    <text>¥{{pricePerPet * pets.length}}</text>
  </view>
  <view class="fee-total">
    <text>合计</text>
    <text>¥{{totalAmount}}</text>
  </view>
</view>
```

---

### Task 6: 活动列表和详情页价格显示适配

**Files:**
- Modify: `subpackages/activity/list.js`
- Modify: `subpackages/activity/detail.js`
- Modify: `subpackages/activity/my-registered.js`

- [ ] **Step 1: 修改 list.js 价格文本**

```javascript
// 旧
priceText: a.price > 0 ? `¥${a.price}` : '免费',

// 新
priceText: (a.pricePerPerson > 0 || a.pricePerPet > 0)
  ? (a.pricePerPerson > 0 ? `¥${a.pricePerPerson}/人` : '') + (a.pricePerPet > 0 ? `${a.pricePerPerson > 0 ? '+' : '¥'}${a.pricePerPet}/只` : '')
  : '免费',
```

- [ ] **Step 2: 修改 detail.js 价格显示**

在 detail.wxml 中替换价格显示部分，与 register.wxml 保持一致的费用明细展示。

- [ ] **Step 3: 修改 my-registered.js 价格文本**

同 list.js 修改。

---

### Task 7: 数据迁移 — 为已有活动补充新字段

**Files:** 使用 MCP 工具直接操作

- [ ] **Step 1: 为所有现有活动设置默认价格字段**

将现有 `price` 值迁移为 `pricePerPet`（当前逻辑是按宠物数计费）：

```javascript
// 对所有没有 pricePerPet 字段的活动
db.collection('activities').where({ pricePerPet: _.exists(false) }).update({
  data: {
    pricePerPet: $.toDecimal('$price'),  // 用现有 price 值
    pricePerPerson: 0,
  }
})
```

如果聚合更新不支持，则逐条读取再更新。

---

## 影响范围总结

| 模块 | 改动 | 风险 |
|------|------|------|
| 活动数据模型 | 新增 `pricePerPerson`、`pricePerPet` | 低 — `price` 保留兼容 |
| 创建活动 | 双价格输入框 | 低 — 纯新增 |
| 报名逻辑 | 费用 = 人费×人数 + 宠物费×宠物数 | 中 — 核心计算变更 |
| 支付确认 | 参与人数取 `participantCount` | 低 — fallback 到 1 |
| 支付回调 | 同上 | 低 |
| 报名页 | 新增人数输入、费用明细展示 | 中 — UI 重新设计 |
| 列表/详情页 | 价格文案适配 | 低 |
