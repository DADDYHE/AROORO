# 公共模块 API 速查

> 适用：`cloudfunctions/common/` 9 个模块的快速参考
> 完整 JSDoc 见各源文件 / TypeScript 提示见 IDE

## 目录

- [errors.js](#errorsjs) - 错误码 + BusinessError
- [state-machine.js](#state-machinejs) - 状态机
- [idempotency.js](#idempotencyjs) - 幂等 / 限流
- [query-builders.js](#query-buildersjs) - 查询构造器
- [date-holidays.js](#date-holidaysjs) - 节假日 / 工作日
- [crypto.js](#cryptojs) - AES-256-GCM 加解密
- [cache.js](#cachejs) - LRU-TTL 进程缓存
- [validator.js](#validatorjs) - 参数校验
- [logger.js](#loggerjs) - 日志
- [token-utils.js](#token-utilsjs) - JWT
- [date-range.js](#date-rangejs) - 日期范围
- [normalize.js](#normalizejs) - 数据规范化
- [permissions.js](#permissionsjs) - 权限检查

## errors.js

```js
const { BusinessError, err, ERROR_CODES } = require('./common/errors')

// 抛出业务异常
throw new BusinessError(ERROR_CODES.PERMISSION, '无权操作', { openid })

// 返回错误响应
return err(ERROR_CODES.NOT_FOUND, '用户不存在')

// 错误码字典
ERROR_CODES.AUTH          // 'AUTH'
ERROR_CODES.PERMISSION    // 'PERMISSION'
ERROR_CODES.VALIDATION    // 'VALIDATION'
ERROR_CODES.NOT_FOUND     // 'NOT_FOUND'
ERROR_CODES.BUSINESS      // 'BUSINESS'
ERROR_CODES.DATA          // 'DATA'
ERROR_CODES.INTERNAL      // 'INTERNAL'
ERROR_CODES.RATE_LIMIT    // 'RATE_LIMIT'
```

## state-machine.js

```js
const { createStateMachine, IllegalTransitionError } = require('./common/state-machine')

const orderMachine = createStateMachine({
  initial: 'pending',
  states: ['pending', 'paid', 'shipped', 'completed', 'cancelled'],
  transitions: {
    pending:  ['paid', 'cancelled'],
    paid:     ['shipped', 'cancelled'],
    shipped:  ['completed'],
    completed: [],
    cancelled: [],
  },
  metadata: { paid: { color: 'green' } },
})

orderMachine.initial              // 'pending'
orderMachine.isValidState('paid') // true
orderMachine.canTransition('pending', 'paid')  // true
orderMachine.assertTransition('pending', 'shipped')  // throws IllegalTransitionError
orderMachine.nextStates('paid')   // ['shipped', 'cancelled']
orderMachine.isTerminal('completed') // true
orderMachine.getMetadata('paid')  // { color: 'green' }
```

## idempotency.js

```js
const {
  buildIdempotencyKey,
  isIdempotentHit,
  markIdempotency,
  checkRateLimit,
  acquireIdempotencyLock,
} = require('./common/idempotency')

// 1. 生成幂等键（SHA-256）
const key = buildIdempotencyKey({
  userId: openid,
  action: 'payCallback',
  payload: { outTradeNo, transactionId },
  scope: 'payment',  // 可选，默认 userId
})

// 2. 检查是否已处理
if (await isIdempotentHit(db, 'idempotency_records', key)) {
  return handleSuccess({ repeated: true })
}

// 3. 处理业务后登记
await markIdempotency(db, 'idempotency_records', key, { outTradeNo, result })

// 4. 限流：每用户 5 次 / 60 秒
await checkRateLimit(db, 'rate_limits', `${openid}:createOrder`, 5, 60_000)

// 5. 分布式锁
const release = await acquireIdempotencyLock(db, 'locks', key, 30)
if (!release) return handleError(...)
try { /* ... */ } finally { await release() }
```

## query-builders.js

```js
const {
  users, hostProfile, ordersByStatus, orderDetail,
  adminList, referral, wallet,
} = require('./common/query-builders')

// 用户
await users(db, { openid }).field({ nickName: true }).get()
await users(db, { inviterId: openid }).limit(100).get()

// 寄养家庭
await hostProfile(db, { city: '上海', status: 'active' }).limit(20).get()
await hostProfile(db, { userId: openid }).get()

// 订单
await ordersByStatus(db, { userId: openid, status: 'paid' })
  .orderBy('createdAt', 'desc').limit(20).get()

// 管理员
await adminList(db, { role: 'admin', active: true }).get()

// 钱包
await wallet(db, { userId: openid }).get()
```

## date-holidays.js

```js
const {
  isHoliday, isBusinessDay,
  countBusinessDays, addBusinessDays, nextBusinessDay,
} = require('./common/date-holidays')

isHoliday('2026-04-04')                  // true (清明)
isHoliday('2026-04-06')                  // true (清明)
isHoliday(new Date('2026-04-04'))        // true
isBusinessDay('2026-04-07')              // true

countBusinessDays('2026-03-16', '2026-03-23')   // 5
countBusinessDays('2026-04-04', '2026-04-08')   // 1 (跳过 04-04~04-06)

addBusinessDays('2026-04-03', 3)         // '2026-04-08' (跳过 04-04~04-06)
nextBusinessDay('2026-04-04')            // '2026-04-07'
```

内置 2025、2026 节假日表，扩展年份在 `HOLIDAY_TABLE[year]` 添加。

## crypto.js

```js
const { deriveKey, encrypt, decrypt, ALGORITHM } = require('./common/crypto')

// 派生 32 字节 key
const { key, salt } = deriveKey(process.env.ENCRYPT_KEY, 'my-salt')

// 加密（输出 base64(iv).base64(tag).base64(cipher)）
const ciphertext = encrypt('13800000000', key)

// 解密
const plaintext = decrypt(ciphertext, key)

ALGORITHM  // 'aes-256-gcm'
```

## cache.js

```js
const { getCache, setCache, deleteCache, clearCache, getCacheSize } = require('./common/cache')

setCache('key', value)              // 默认 5 分钟 TTL
setCache('key', value, 60)          // 自定义 TTL（秒）
setCache('key', value, 60, 'user')  // 自带命名空间

const value = getCache('key')       // null 表示不存在或已过期
deleteCache('key')                  // 返回 boolean
clearCache()                        // 清空所有
getCacheSize()                      // 当前缓存项数

容量上限 1000，超出时淘汰最旧项。
```

## validator.js

```js
const { validate, ValidationError, filterFields, FIELD_WHITELISTS } = require('./common/validator')

// 参数校验
validate({
  name:  { required: true, type: 'string', min: 2, max: 20 },
  age:   { type: 'number', min: 0, max: 150 },
  role:  { enum: ['admin', 'user'] },
  email: { type: 'string', pattern: /^[^@]+@[^@]+$/ },
}, event)

// 自定义 message
validate({
  name: { required: true, message: '姓名必填' },
}, event)

// 字段白名单过滤
const safe = filterFields(['nickName', 'avatarUrl'], event.userInfo)

// 预定义白名单
FIELD_WHITELISTS.user      // ['_id', 'openid', 'nickName', ...]
FIELD_WHITELISTS.hostBasic // [...]
FIELD_WHITELISTS.pet       // [...]
```

## logger.js

```js
const { createLogger, setLogLevel, LOG_LEVELS } = require('./common/logger')

const log = createLogger('myService')

log.info('action', { foo: 1 })
log.debug('action', 'simple message')
log.warn('action', { msg: 'be careful' })
log.error('action', err)
log.errorWithContext('action', err, { userId, requestId })
log.performance('action', 123, { route: '/api/x' })
log.database('action', 'users', 'query', { count: 5 })

// 调整日志级别
setLogLevel(LOG_LEVELS.WARN)  // DEBUG=0 / INFO=1 / WARN=2 / ERROR=3
```

## token-utils.js

```js
const { generateToken, verifyToken, getTokenFromEvent } = require('./common/token-utils')

// 需要 process.env.JWT_SECRET 至少 16 字符
const token = generateToken({ openid, role: 'admin', roles: ['admin'], adminId: 'a1' })
const payload = verifyToken(token)
// → { openid, role, roles, adminId, iat, exp }

const tokenFromEvent = getTokenFromEvent({ headers: { Authorization: 'Bearer xxx.yyy.zzz' } })
```

## date-range.js

```js
const { diffDays, isSameDay, isInRange, getToday, getYesterday } = require('./common/date-range')

diffDays('2026-03-18', '2026-03-20')  // 2
isSameDay(a, b)
isInRange(d, start, end)
getToday()      // 'YYYY-MM-DD'
getYesterday()  // 'YYYY-MM-DD'
```

## normalize.js

```js
const { normalizeUser, normalizeOrder, normalizePhone } = require('./common/normalize')

normalizeUser(rawUser)     // 输出 { _id, openid, nickName, avatarUrl, phone, ... }
normalizeOrder(rawOrder)
normalizePhone('138-0000-0000')  // '13800000000'
```

## permissions.js

```js
const { checkPermission, hasRole, ROLE_LEVEL } = require('./common/permissions')

checkPermission(auth, 'hosting')          // boolean
checkPermission(auth, 'hosting', { hostProfile })  // 二次校验宿主归属
hasRole(auth, 'super_admin')              // boolean

ROLE_LEVEL.super_admin  // 4
ROLE_LEVEL.admin        // 3
ROLE_LEVEL.partner      // 2
ROLE_LEVEL.operator     // 1
ROLE_LEVEL.viewer       // 0
```

## 版本兼容

- 所有公共模块遵守 semver
- 公共模块的破坏性变更需在 PR 标题加 `BREAKING:`
- 新模块必须在 `test/` 下提供单元测试，且覆盖率 ≥ 80%
- 新增导出前在 `cloudfunctions/common/index.js` 集中 re-export
