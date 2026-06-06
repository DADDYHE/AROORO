# 通用模块使用文档

**版本**: v1.0.0  
**更新时间**: 2026-04-16

---

## 概述

common 目录包含云函数通用的工具模块，提供：
- 云开发初始化（单例模式）
- ID 生成（支持多种类型）
- 统一日志记录
- 错误处理
- 数据验证等通用功能

---

## 模块列表

### 1. utils.js - 通用工具库

**路径**: `cloudfunctions/common/utils.js`

#### 1.1 云开发初始化（单例模式）

```javascript
const { initCloud } = require('./common/utils')

// 初始化云开发环境
const { cloud, db } = initCloud()

// 使用示例
exports.main = async (event, context) => {
  const { db } = initCloud()
  
  // 数据库操作
  const result = await db.collection('users').get()
  return result
}
```

**特点**:
- ✅ 单例模式，避免重复初始化
- ✅ 自动使用当前环境
- ✅ 返回 cloud 和 db 实例

#### 1.2 ID 生成（基础版本）

```javascript
const { generateId } = require('./common/utils')

// 生成带前缀的 ID
const userId = generateId('user')
// 结果：usr_17b2k8j9x8a7b6c5d4e3f2g1h0

// 生成不带前缀的 ID
const orderId = generateId()
// 结果：17b2k8j9x8a7b6c5d4e3f2g1h0
```

#### 1.3 ID 生成（增强版本）

```javascript
const { generateId } = require('./common/utils')

// 生成用户 ID（带 openid）
const userId = generateId('user', 'oXXXX-openid-XXXX')
// 结果：usr_17b2k8j9_a1b2c3d4_xxxxxxxx

// 生成宠物 ID（带 openid）
const petId = generateId('pet', 'oXXXX-openid-XXXX')
// 结果：pet_17b2k8j9_a1b2c3d4_xxxxxxxx

// 生成订单 ID（不带 openid）
const orderId = generateId('order')
// 结果：ord_17b2k8j9_xxxxxxxx_xxxxxxxx
```

**支持的类型**:
- `user` → `usr`
- `owner` → `own`
- `host` → `hst`
- `guest` → `gst`
- `pet` → `pet`
- `order` → `ord`
- `favorite` → `fav`
- `role` → `rol`

**ID 格式**: `{prefix}_{timestamp}_{identifier}_{random}`
- **prefix**: 类型前缀（2-5 位）
- **timestamp**: 时间戳（8 位）
- **identifier**: openid 哈希或随机数（8 位）
- **random**: 随机字符串（8 位）

#### 1.4 错误处理

**推荐：BusinessError 模式**（`common/errors.js`）

```javascript
const { err, toResponse, isBusinessError, withErrorHandling } = require('./common/errors')
const { handleSuccess, handleError, ERROR_CODES } = require('./common/utils')

// 在业务函数中直接抛出
async function createOrder(event, context, auth) {
  if (!auth.openid) throw err('AUTH_REQUIRED', '未登录')
  if (!event.hostId) throw err('INVALID_PARAMS', '缺少 hostId')
  // ... 业务逻辑
  return handleSuccess({ orderId: 'ord_1' })
}

// 在云函数入口使用 withErrorHandling 包装 / 或在 catch 中判定
exports.main = async (event, context) => {
  try {
    const auth = await verifyAuth(event)
    return await createOrder(event, context, auth)
  } catch (e) {
    if (isBusinessError(e)) return toResponse(e)
    return handleError(e, e.message, ERROR_CODES.BUSINESS)
  }
}

// 或一行包装
exports.createOrderHandler = withErrorHandling(createOrder)
```

**传统：handleError 返回模式**（保留兼容）

```javascript
const { handleError, handleSuccess } = require('./common/utils')

exports.main = async (event, context) => {
  try {
    // 业务逻辑
    const result = await someOperation()
    return handleSuccess(result, '操作成功')
  } catch (error) {
    return handleError(error, '自定义错误信息')
  }
}
```

**返回格式**:
```javascript
// 成功响应
{
  code: 0,
  message: '操作成功',
  data: { ... }
}

// 错误响应
{
  code: 9999,
  message: '自定义错误信息',
  error: '错误详情'
}
```

#### 1.5 分页查询

```javascript
const { initCloud, paginate } = require('./common/utils')

exports.main = async (event, context) => {
  const { db } = initCloud()
  const collection = db.collection('users')
  
  const result = await paginate(collection, {
    page: 1,
    pageSize: 20,
    where: { status: 1 },
    orderBy: { field: 'createdAt', direction: 'desc' }
  })
  
  return handleSuccess(result)
}
```

**返回格式**:
```javascript
{
  data: [...],
  total: 100,
  page: 1,
  pageSize: 20,
  totalPages: 5,
  hasNext: true
}
```

#### 1.6 批量处理

```javascript
const { batchProcess } = require('./common/utils')

const data = [1, 2, 3, 4, 5]
const handler = async (item) => {
  return item * 2
}

const results = await batchProcess(data, handler, 10)
// 每批处理 10 个数据
```

---

### 2. logger.js - 统一日志模块

**路径**: `cloudfunctions/common/logger.js`

#### 2.1 基本使用

```javascript
const { logger } = require('./common/logger')

// 记录 INFO 日志
logger.info('UserService', 'getUserInfo', { userId: '123' })

// 记录 DEBUG 日志
logger.debug('UserService', 'debugInfo', { detail: '...' })

// 记录 WARN 日志
logger.warn('UserService', 'deprecatedMethod', { method: 'oldMethod' })

// 记录 ERROR 日志
logger.error('UserService', 'getUserInfo', error)
```

**输出格式**:
```
[2026-04-16T10:30:00.000Z] [INFO] [UserService] [getUserInfo] { userId: '123' }
[2026-04-16T10:30:00.000Z] [ERROR] [UserService] [getUserInfo] { message: '...', stack: '...' }
```

#### 2.2 创建服务专用日志器

```javascript
const { createLogger } = require('./common/logger')

// 创建 UserService 专用的日志器
const logger = createLogger('UserService')

// 使用更简洁
logger.info('getUserInfo', { userId: '123' })
logger.error('getUserInfo', error)
logger.performance('getUserInfo', 150, { userId: '123' })
```

#### 2.3 详细错误日志

```javascript
const logger = createLogger('OrderService')

try {
  // 业务逻辑
} catch (error) {
  logger.errorWithContext('createOrder', error, {
    userId: '123',
    orderId: '456',
    amount: 100
  })
}
```

#### 2.4 性能日志

```javascript
const logger = createLogger('DatabaseService')

const startTime = Date.now()
// 数据库操作
const duration = Date.now() - startTime

logger.performance('queryUsers', duration, {
  count: 100,
  page: 1
})
// 输出：[PERF] queryUsers { duration: '150ms', count: 100, page: 1 }
```

#### 2.5 数据库操作日志

```javascript
const logger = createLogger('UserService')

const result = await db.collection('users').where({ status: 1 }).get()

logger.database('getUsers', 'users', 'query', {
  count: result.data.length,
  where: { status: 1 }
})
```

#### 2.6 日志级别控制

```javascript
const { setLogLevel, LOG_LEVELS } = require('./common/logger')

// 设置日志级别（只记录 ERROR）
setLogLevel(LOG_LEVELS.ERROR)

// 获取当前日志级别
const currentLevel = getLogLevel()
```

**日志级别**:
- `LOG_LEVELS.DEBUG` (0) - 记录所有日志
- `LOG_LEVELS.INFO` (1) - 记录 INFO、WARN、ERROR
- `LOG_LEVELS.WARN` (2) - 记录 WARN、ERROR
- `LOG_LEVELS.ERROR` (3) - 只记录 ERROR

**环境变量配置**:
```javascript
// 在云函数中设置
process.env.LOG_LEVEL = '3' // 只记录 ERROR
```

---

## 使用示例

### 完整的云函数示例

```javascript
// cloudfunctions/userService/index.js
const { initCloud, generateId, handleSuccess, handleError } = require('../common/utils')
const { createLogger } = require('../common/logger')

// 创建服务专用日志器
const logger = createLogger('UserService')

exports.main = async (event, context) => {
  const startTime = Date.now()
  
  try {
    // 初始化云开发
    const { db } = initCloud()
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    logger.info('main', { action: event.action, openid })
    
    let result = null
    
    // 根据 action 执行不同操作
    switch (event.action) {
      case 'createUser':
        result = await createUser(db, openid, event.data)
        break
        
      case 'getUserInfo':
        result = await getUserInfo(db, openid)
        break
        
      default:
        throw err('INVALID_PARAMS', '无效的 action')
    }
    
    // 记录性能日志
    const duration = Date.now() - startTime
    logger.performance('main', duration, { action: event.action })
    
    return handleSuccess(result, '操作成功')
    
  } catch (error) {
    logger.error('main', error)
    return handleError(error, '操作失败')
  }
}

async function createUser(db, openid, data) {
  const userId = generateId('user', openid)
  
  const userData = {
    _id: userId,
    openid,
    ...data,
    createdAt: new Date()
  }
  
  logger.database('createUser', 'users', 'insert', { userId })
  
  const result = await db.collection('users').add({
    data: userData
  })
  
  return { userId, ...result }
}

async function getUserInfo(db, openid) {
  logger.database('getUserInfo', 'users', 'query', { openid })
  
  const result = await db.collection('users').where({ openid }).get()
  
  if (result.data.length === 0) {
    throw new Error('用户不存在')
  }
  
  return result.data[0]
}
```

---

## 最佳实践

### 1. 云开发初始化

✅ **推荐**:
```javascript
const { initCloud } = require('../common/utils')

exports.main = async (event, context) => {
  const { db } = initCloud()
  // 使用 db 实例
}
```

❌ **不推荐**:
```javascript
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
// 每次都重新初始化
```

### 2. ID 生成

✅ **推荐**:
```javascript
const { generateId } = require('../common/utils')
const userId = generateId('user', openid)
```

❌ **不推荐**:
```javascript
const userId = `user_${Date.now()}_${Math.random()}`
// 格式不统一，可能超出长度限制
```

### 3. 日志记录

✅ **推荐**:
```javascript
const logger = createLogger('MyService')
logger.info('actionName', { data: 'value' })
```

❌ **不推荐**:
```javascript
console.log('MyService actionName', data)
// 格式不统一，难以过滤和分析
```

### 4. 错误处理

✅ **推荐**:
```javascript
try {
  // 业务逻辑
} catch (error) {
  logger.error('actionName', error)
  return handleError(error, '友好的错误提示')
}
```

❌ **不推荐**:
```javascript
try {
  // 业务逻辑
} catch (error) {
  console.error(error)
  return { code: -1, message: error.message }
}
```

---

## 性能优化建议

### 1. 单例模式
- `initCloud()` 使用单例模式，避免重复初始化
- `createLogger()` 可以复用，不需要每次创建

### 2. 日志级别
- 生产环境建议设置 `LOG_LEVEL = LOG_LEVELS.WARN`
- 开发环境可以设置 `LOG_LEVEL = LOG_LEVELS.DEBUG`

### 3. 批量处理
- 使用 `batchProcess()` 处理大量数据
- 避免单次处理过多数据导致超时

---

## 常见问题

### Q: 为什么要使用单例模式初始化云开发？
A: 云函数每次调用都会重新加载模块，但在同一次调用中，多次初始化会浪费资源。单例模式确保只初始化一次。

### Q: ID 生成为什么要使用 openid 哈希？
A: 使用 openid 哈希可以让 ID 包含用户信息，方便后续查询和统计，同时保持 ID 的唯一性。

### Q: 日志级别如何选择？
A: 
- 开发环境：DEBUG（记录所有日志）
- 测试环境：INFO（记录重要操作）
- 生产环境：WARN 或 ERROR（只记录警告和错误）

### Q: 如何查看云函数日志？
A: 在微信开发者工具或腾讯云控制台的云函数详情页可以查看日志输出。

---

## 实战案例（Sprint 8+）

本章节记录实际项目里使用 common 模块的代表性场景。每个案例都对应一个测试文件，可在 CI 中复现。

### 案例 1：寄养订单主链路（integration 测试）

**场景**：宠物主从下单到完成寄养的全流程，覆盖「价格预估 → 下单 → 支付 → 状态推进 → 完成」。

**对应测试**：[`test/integration/main-flow.test.js`](file:///Users/yy/Documents/trae_projects/zuoyou/test/integration/main-flow.test.js)

**使用到的 common 模块**：

```javascript
// 1. 状态机：支付状态推进
const { paymentStateMachine } = require('./paymentService/common/payment-state-machine')

const canPay = paymentStateMachine.canTransition('unpaid', 'paid')
// → true（合法转移）

const illegalPay = paymentStateMachine.canTransition('paid', 'refunded')
// → false（应被业务拒绝）
```

```javascript
// 2. 日期冲突检测（半开区间）
// _checkDateAvailability 内部用 orderEnd > requestStart：
//   9/4 ~ 9/7 与 9/7 ~ 9/10 不算冲突（end=9/7 > requestStart=9/7 不成立）
//   9/5 ~ 9/8 与 9/7 ~ 9/10 算冲突
const available = await orders.checkDateAvailability(
  { hostId, startDate: '2026-09-10', endDate: '2026-09-15' },
  {}, { openid: ownerId }
)
// → { available: true }
```

```javascript
// 3. 价格计算（带节假日费率）
const price = await orders.calculatePrice({
  hostId, startDate: '2026-10-01', endDate: '2026-10-04', // 跨越国庆
  petIds: [petId],
}, {}, { openid: ownerId })

// → {
//   days: 3,
//   basePrice: 450,        // 3 天 × 150 元
//   holidaySurcharge: 150,  // 节假日 1 天 × 150 元
//   totalPrice: 600
// }
```

**易踩坑点**：
- `_createCommissionRecord` 是 `pending → paid` 才会触发；测试中要先把 order 标记为 paid 再调 `handleBoardingOrder`
- `organizerId` 字段 = 寄养家庭用户的 `openid`（不是 `hostId`），用于 `getOrders(role='host')` 与 `updateOrderStatus` 的权限匹配
- mock 桩里 `where()` 返回的链式调用要支持 `orderBy().limit().field()` 三件套

---

### 案例 2：佣金子链路（commission-flow）

**场景**：订单完成后自动写一条 commission 记录，按 `system_config.commission_rates[orderType]` 比例计算金额。

**对应测试**：[`test/integration/commission-flow.test.js`](file:///Users/yy/Documents/trae_projects/zuoyou/test/integration/commission-flow.test.js)

**使用到的 common 模块**：

```javascript
const { err } = require('./common/errors')

async function createCommission(orderType, order) {
  const owner = await db.collection('users').doc(order.ownerId).get()
  if (!owner.inviterId) {return}  // 无邀请人静默退出

  const inviter = await db.collection('users').doc(owner.inviterId).get()
  if (!inviter) {return}

  const config = await db.collection('system_config').doc('commission_rates').get()
  const rate = config[orderType]
  if (!rate) {return}  // 配置无该 orderType

  // 关键：金额 × 费率 结果用 (rate / 100) 并 toFixed(2) 保留 2 位小数
  const amount = Math.round(Number(order.totalPrice) * (rate / 100) * 100) / 100

  await db.collection('tuan_commissions').add({
    data: {
      orderId: order._id,
      inviterId: inviter._id,
      inviterNickName: inviter.nickName,
      orderType,
      orderAmount: order.totalPrice,
      commissionRate: rate,
      commissionAmount: amount,
      status: 'pending',
      createdAt: db.serverDate(),
    },
  })
}
```

**幂等保证**：业务层在调用 `createCommission` 之前先 `where({ orderId, orderType }).count()`，count>0 直接 return。`tuan_commissions` 集合的 `_id` 设为 `orderId + ':' + orderType` 也可作为天然去重 key。

---

### 案例 3：notify 子链路（webhook 入参校验）

**场景**：微信支付回调 webhook，需要在解包前先校验 ciphertext 合法性。

**对应代码**：[`cloudfunctions/paymentService/services/notify.js`](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/paymentService/services/notify.js)

**使用到的 common 模块**：

```javascript
const { err } = require('./common/errors')
const { ensurePayload, normalizeDbError } = require('./common/normalize')

// 1. 校验 ciphertext 格式（防 DoS：限制长度）
if (typeof ciphertext !== 'string' || ciphertext.length > 1024 * 1024) {
  throw err('PAYMENT_NOTIFY_INVALID', '回调数据格式错误')
}

// 2. 用 ensurePayload 校验关键字段
ensurePayload(decrypted, ['out_trade_no', 'transaction_id'])

// 3. 捕获 DB 写入异常时归一化
try {
  await db.collection('orders').doc(orderId).update({ data: { paymentStatus: 'paid' } })
} catch (e) {
  throw normalizeDbError(e)  // duplicate key → DUPLICATE_KEY；其他 → DB_ERROR
}
```

---

### 案例 4：管理员操作权限校验

**场景**：管理后台调用 `getAdminList` 时，需要 super_admin 角色。

**对应代码**：[`cloudfunctions/adminService/services/adminManagement.js`](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/adminService/services/adminManagement.js)

**使用到的 common 模块**：

```javascript
const { err } = require('./common/errors')

async function getAdminList(event, context, auth) {
  if (!auth.roles?.includes('super_admin')) {
    throw err('SUPER_ADMIN_REQUIRED', '需要超级管理员权限')
  }
  // ...
}
```

**校验链**：
1. **认证**：`verifyAuth` 校验 `accessToken` → 注入 `auth.openid / roles / permissions`
2. **角色**：`auth.roles?.includes('super_admin')` → super_admin 通行，否则要求 permissions 中至少有一项匹配
3. **业务**：handler 内部还要做参数校验（`INVALID_PARAMS`）和资源存在性（`USER_NOT_FOUND` 等）

**实际错误码矩阵**：

| 场景 | 错误码 | 抛出位置 |
| --- | --- | --- |
| 缺 accessToken | `AUTH_REQUIRED` | `verifyAuth` |
| token 过期 | `TOKEN_EXPIRED` | `token-utils.verifyToken` |
| token 损坏 | `TOKEN_INVALID` | `token-utils.verifyToken` |
| 缺 super_admin | `SUPER_ADMIN_REQUIRED` | `adminManagement.getAdminList` |
| 资源不存在 | `USER_NOT_FOUND` / `HOST_NOT_FOUND` | 业务 handler |

---

### 案例 5：存量数据回填（migration 脚本）

**场景**：历史订单缺 `organizerId` 字段，导致 `updateOrderStatus` 中 `isHost` 永远为 false。Sprint 9 写了一个迁移脚本批量回填。

**对应脚本**：[`scripts/migrate-legacy-data.js`](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/migrate-legacy-data.js)

**核心模式**：

```javascript
// 1. CLI 参数解析
const opts = parseArgs(process.argv)
//   → { apply: true, only: 'organizerId', batch: 100, envId: 'prod-1' }

// 2. 委托给核心模块（便于测试）
const { runMigrate } = require('./migrate-legacy-data-core')
const { results } = await runMigrate({ ...opts, db: mockDb })

// 3. dry-run 模式：只扫描不写入
//    apply 模式：分批 _id 范围分页 + update
```

**回填策略**：
- 优先用 `db.command.exists(false)` 过滤「缺字段」的记录
- 关联字段回填（如 `organizerId` ← `hostProfiles.openid`）先聚合到 hostMap 内存映射，再逐订单写
- 失败单条不中断整体流程，最后打印失败清单
- 写成功的记录加 `migrated_xxx: true` 标记，便于后续可观测

---

## 更新记录

### v1.1.0 (2026-06-04, Sprint 9)
- ✅ 实战案例章节：5 个真实场景（主链路、佣金、notify、权限、迁移）
- ✅ 配套测试文件交叉引用
- ✅ 易踩坑点记录

### v1.0.0 (2026-04-16)
- 添加云开发初始化（单例模式）
- 扩展 ID 生成功能，支持多种类型
- 创建统一日志模块
- 完善错误处理和分页查询
- 添加批量处理功能

---

**文档版本**: v1.1.0  
**最后更新**: 2026-06-04  
**维护者**: 开发团队
