# 云开发数据库结构设计

## 1. users 集合（对应 users 表）

### 字段结构
```javascript
{
  _id: String, // 用户ID，对应MySQL的id字段
  openid: String, // 微信小程序openid，唯一
  avatarUrl: String, // 用户头像URL
  nickName: String, // 用户昵称
  role: String, // 用户角色：owner(宠物主人), host(寄养家庭)
  createdAt: Date, // 创建时间
  lastLoginTime: Date, // 最后登录时间
}
```

### 索引
- openid: 唯一索引，用于快速查找用户

## 2. hostProfiles 集合（对应 hostProfiles 表）

### 字段结构
```javascript
{
  _id: String, // 档案ID，对应MySQL的id字段
  openid: String, // 微信小程序openid
  avatar: String, // 寄养家庭头像
  hostName: String, // 寄养家庭名称
  realName: String, // 真实姓名
  phone: String, // 联系电话
  idCard: String, // 身份证号
  address: String, // 地址
  housingType: String, // 房屋类型
  hasYard: String, // 是否有院子
  maxPets: String, // 最多可寄养宠物数量
  hasOtherPets: String, // 是否有其他宠物
  nativePetInfo: String, // 自有宠物信息
  petTypes: String, // 可接受的宠物类型
  serviceTypes: String, // 提供的服务类型
  pricePerDay: String, // 每日价格
  description: String, // 家庭介绍
  idCardFront: String, // 身份证正面
  idCardBack: String, // 身份证反面
  healthCertificate: String, // 健康证明
  emergencyContactName: String, // 紧急联系人姓名
  emergencyContactPhone: String, // 紧急联系人电话
  status: String, // 审核状态：pending(待审核), approved(已通过), rejected(已拒绝)
  rating: Number, // 评分
  reviewCount: Number, // 评论数
  isAcceptingOrders: Boolean, // 是否接受订单：true(接受), false(不接受)
  createdAt: Date, // 创建时间
  updatedAt: Date, // 更新时间
}
```

### 索引
- openid: 普通索引，用于快速查找用户的寄养家庭档案
- status: 普通索引，用于筛选审核状态
- isAcceptingOrders: 普通索引，用于筛选接受订单的寄养家庭

## 3. pets 集合（对应 pets 表）

### 字段结构
```javascript
{
  _id: String, // 宠物ID，对应MySQL的id字段
  ownerOpenid: String, // 宠物主人openid
  name: String, // 宠物名称
  type: String, // 宠物类型
  age: Number, // 宠物年龄
  weight: Number, // 宠物体重
  breed: String, // 宠物品种
  isSterilized: Boolean, // 是否绝育：true(是), false(否)
  isVaccinated: Boolean, // 是否接种疫苗：true(是), false(否)
  healthStatus: String, // 健康状况
  allergies: String, // 过敏史
  specialNeeds: String, // 特殊需求
  dietaryHabit: String, // 饮食习惯
  exerciseNeed: String, // 运动需求
  sleepingHabit: String, // 睡眠习惯
  socialBehavior: String, // 社交行为
  emergencyContactName: String, // 紧急联系人姓名
  emergencyContactPhone: String, // 紧急联系人电话
  emergencyContactRelation: String, // 紧急联系人关系
  emergencyContactNote: String, // 紧急联系人备注
  avatarUrl: String, // 宠物头像URL
  isActive: Boolean, // 是否激活：true(是), false(否)
  createdAt: Date, // 创建时间
  updatedAt: Date, // 更新时间
}
```

### 索引
- ownerOpenid: 普通索引，用于快速查找用户的宠物
- isActive: 普通索引，用于筛选激活的宠物

## 4. orders 集合（对应 orders 表）

### 字段结构
```javascript
{
  _id: String, // 订单ID，对应MySQL的id字段
  ownerId: String, // 宠物主人用户ID
  hostId: String, // 寄养家庭用户ID
  hostProfileId: String, // 寄养家庭档案ID
  petIds: Array, // 宠物ID列表
  startDate: Date, // 开始日期
  endDate: Date, // 结束日期
  duration: Number, // 寄养天数
  totalPrice: Number, // 订单总价
  status: String, // 订单状态：pending(待确认), confirmed(已确认), completed(已完成), canceled(已取消)
  rating: Number, // 评分
  review: String, // 评价内容
  createdAt: Date, // 创建时间
  updatedAt: Date, // 更新时间
}
```

### 索引
- ownerId: 普通索引，用于快速查找用户的订单
- hostId: 普通索引，用于快速查找寄养家庭的订单
- hostProfileId: 普通索引，用于快速查找寄养家庭档案的订单
- status: 普通索引，用于筛选订单状态

## 5. favorites 集合（对应收藏功能）

### 字段结构
```javascript
{
  _id: String, // 收藏记录ID
  userId: String, // 用户ID
  hostId: String, // 寄养家庭ID
  hostProfileId: String, // 寄养家庭档案ID
  createdAt: Date, // 创建时间
}
```

### 索引
- userId: 普通索引，用于快速查找用户的收藏
- hostId: 普通索引，用于快速查找寄养家庭的收藏
- userId_hostId: 复合唯一索引，用于确保用户不会重复收藏同一个寄养家庭

## 6. messages 集合（对应聊天功能）

### 字段结构
```javascript
{
  _id: String, // 消息ID
  chatRoomId: String, // 聊天室ID
  senderId: String, // 发送者ID
  recipientId: String, // 接收者ID
  content: String, // 消息内容
  type: String, // 消息类型：text, image, voice等
  createdAt: Date, // 创建时间
  updatedAt: Date, // 更新时间
}
```

### 索引
- chatRoomId: 普通索引，用于快速查找聊天室的消息
- createdAt: 普通索引，用于消息排序