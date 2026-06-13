# Sprint 1 公共模块 API 文档

> 适用版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 5 个新公共模块

## 模块清单

| 模块 | 路径 | 导出 | 用途 |
| --- | --- | --- | --- |
| [errors.js](#errorsjs) | `cloudfunctions/common/errors.js` | `BusinessError`, `BusinessErrors`, `err()`, `isBusinessError()`, `wrapUnknown()` | 业务异常类与错误码注册表 |
| [normalize.js](#normalizejs) | `cloudfunctions/common/normalize.js` | `normalizeBase`, `normalizeOrder`, `denormalizeOrder`, `normalizeUser`, `normalizeHost`, `normalizePet`, `normalizeProduct`, `normalizeList`, `normalizeByCollection` | 字段归一化适配层 |
| [permissions.js](#permissionsjs) | `cloudfunctions/common/permissions.js` | `ROLES`, `ROLE_LEVEL`, `extractRoles`, `isAdmin`, `isSuperAdmin`, `isPartner`, `hasPermission`, `hasRoleAtLeast`, `requireOrThrow`, `buildIdentityContext` | 角色与权限判定 |
| [crypto.js](#cryptojsaes-256-gcm) | `cloudfunctions/common/crypto.js` | `deriveKey`, `encrypt`, `decrypt`, `sha256`, `hmacSha256`, `safeEqual`, `randomString` | AES-256-GCM 加解密、HMAC 签名 |
| [date-range.js](#date-rangejs) | `cloudfunctions/common/date-range.js` | `RANGE_TYPES`, `startOfDay`, `startOfWeek`, `startOfMonth`, `startOfQuarter`, `startOfYear`, `getDateRange`, `buildRangeQuery`, `diffDays`, `formatDate`, `lastNDates` | 日期范围与时间工具 |

## 迁移指南

### errors.js

```js
// ❌ 旧写法
if (!order) return { code: ERROR_CODES.NOT_FOUND, message: '订单不存在', data: null }
throw new Error('订单不存在')

// ✅ 新写法
const { err } = require('./common/errors')
if (!order) throw err('ORDER_NOT_FOUND', null, { orderId })

// 在 catch 块中
try { ... }
catch (e) {
  if (e instanceof BusinessError) {
    logger.warn('order.failed', { code: e.code, msg: e.message })
    return e.toResponse()
  }
  throw e
}
```

### normalize.js

```js
const { normalizeOrder, normalizeByCollection } = require('./common/normalize')

// 单个文档
const out = normalizeOrder(dbDoc)

// 列表（按集合名批量归一化）
const out = normalizeByCollection('orders', await db.collection('orders').get())
```

### permissions.js

```js
const { requireOrThrow, hasPermission } = require('./common/permissions')

// 守卫（不满足抛错）
requireOrThrow(adminDoc, {
  requireRole: 'admin',
  requirePermission: 'order:refund',
})

// 软判定
if (hasPermission(adminDoc, 'order:list')) { ... }
```

### crypto.js（AES-256-GCM）

```js
const { deriveKey, encrypt, decrypt } = require('./common/crypto')

const { key, salt } = deriveKey(process.env.ENCRYPT_PASSPHRASE)
const ciphertext = encrypt(plaintext, key)
const plaintext = decrypt(ciphertext, key)
// salt 需持久化（可放入 CloudBase 配置集合）
```

### date-range.js

```js
const { getDateRange, buildRangeQuery } = require('./common/date-range')

const r = getDateRange('today')  // { start: Date, end: Date }
const q = buildRangeQuery('createdAt', 'last7')
// q._field = 'createdAt', q._gte = ..., q._lt = ...
```

## 测试覆盖

| 模块 | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- |
| errors.js | 100% | 95% | 100% | 100% |
| normalize.js | 86% | 86% | 100% | 95% |
| permissions.js | 95% | 86% | 100% | 100% |
| crypto.js | 88% | 83% | 100% | 95% |
| date-range.js | 100% | 100% | 100% | 100% |
| utils.js（已存在） | 89% | 76% | 86% | 90% |

总测试数：**141 通过 / 1 跳过**（旧的 post-commit test 占位）

## 后续 Sprint 接入顺序

1. **Sprint 1 末（W6）**：adminService 25 处空 catch 改用 `err('X')` 替代；
2. **Sprint 2（W7）**：订单 handler 改用 `normalizeOrder` + `getDateRange` 替换自实现；
3. **Sprint 2（W8）**：hostService AES-CBC 切换到 `crypto.js#encrypt`（双写期）；
4. **Sprint 2（W9）**：adminService / userService 权限判定改用 `requireOrThrow`；
5. **Sprint 3（W11+）**：所有 JSDoc 补全，集成测试覆盖 5 条关键链路。
