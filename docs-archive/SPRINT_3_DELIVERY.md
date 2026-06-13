# Sprint 3 交付清单

> 适用版本：v3.0 · 配套：`docs/REFACTOR_PLAN.md`  
> 周期：W11-W14 · 状态：**已完成** · 测试：334 passed / 0 failed

## 整体目标

| 维度 | Sprint 2 结束 | Sprint 3 结束 | 变化 |
| --- | --- | --- | --- |
| 测试用例 | 275 | 334 | +59 |
| 测试覆盖率 | common 9/14 | common 13/14 | +4 模块（cache / token-utils / validator / logger） |
| 空 catch 块 | 558 | 529 | −29（userService / activityService / orderService / partnerService） |
| 文档产出 | 8 | 11 | +3（CHANGELOG.md / SPRINT_3_DELIVERY.md / API.md） |

## 交付明细

### S3-01：4 个公共模块补全测试

新增测试文件：
- [test/common-cache.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/common-cache.test.js)（18 用例）
  - 基础读写 / 覆盖 / 删除
  - TTL 过期（fakeTimers）
  - 容量淘汰（>1000 时淘汰最旧）
  - `hasCache` / `getCacheSize` / `clearCache`
- [test/common-token-utils.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/common-token-utils.test.js)（11 用例，mock jsonwebtoken virtual）
  - `generateToken` / `verifyToken` 双向
  - `getTokenFromEvent` Bearer 前缀
  - JWT_SECRET 缺失抛错
- [test/common-validator.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/common-validator.test.js)（16 用例）
  - required / type / min / max / enum 校验
  - `ValidationError` 含 `field` 信息
  - 自定义 `message` 优先
  - `filterFields` 白名单过滤
- [test/common-logger.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/common-logger.test.js)（15 用例）
  - info / debug / warn / error / errorWithContext / performance / database
  - 4 级日志过滤（DEBUG / INFO / WARN / ERROR）

### S3-02：持续空 catch 治理（第 3 波）

| 文件 | 治理数 | 主要模式 |
| --- | --- | --- |
| `userService/referral.js` | 8 | `logger.warn('xxx.action', { openid, code, msg })` |
| `userService/auth.js` | 5 | 同上 |
| `partnerService/services/referral.js` | 7 | 同上 |
| `activityService/index.js` | 7 | 含 commission record 链路 |
| `orderService/orders.js` | 3 | 含 `_createCommissionRecord` 上游 |

`audit-empty-catch.js` 输出从 558 → 529（−29）。

### S3-04：API 文档与 CHANGELOG

| 文件 | 路径 | 说明 |
| --- | --- | --- |
| CHANGELOG | [CHANGELOG.md](file:///Users/yy/Documents/trae_projects/zuoyou/CHANGELOG.md) | 遵循 Keep a Changelog 1.1.0 |
| 公共模块 API | `docs/API.md` | 8 个公共模块的 API 速查 |
| Sprint 3 交付 | `docs/SPRINT_3_DELIVERY.md` | 本文件 |

`docs/API.md` 提供公共模块的快速参考：

```js
// 错误处理
const { BusinessError, err } = require('./common/errors')
throw new BusinessError('PERMISSION_DENIED', '无权限操作', { openid })

// 状态机
const { createStateMachine } = require('./common/state-machine')
const orderMachine = createStateMachine({ ... })
orderMachine.assertTransition('pending', 'paid')

// 幂等
const key = buildIdempotencyKey({ userId: openid, action: 'payCallback', payload: { outTradeNo } })
if (await isIdempotentHit(db, 'idem', key)) return handleSuccess({ repeated: true })

// 查询构造器
const { ordersByStatus } = require('./common/query-builders')
await ordersByStatus(db, { userId: openid, status: 'paid' }).limit(20).get()

// 节假日 / 工作日
const { countBusinessDays, isHoliday } = require('./common/date-holidays')
isHoliday('2026-04-04')  // true
countBusinessDays('2026-03-16', '2026-03-23')  // 5

// 加密
const { encrypt, decrypt, deriveKey } = require('./common/crypto')
const { key } = deriveKey(process.env.ENCRYPT_KEY, salt)
const ciphertext = encrypt('idCard-110101', key)
const plaintext = decrypt(ciphertext, key)

// 缓存
const { getCache, setCache } = require('./common/cache')
setCache('hot:list', data, 300)  // 5 分钟
const data = getCache('hot:list')

// 参数校验
const { validate, filterFields } = require('./common/validator')
validate({ name: { required: true } }, event)
const safe = filterFields(WHITELIST, raw)
```

## 测试结果

```
Test Suites: 1 skipped, 18 passed, 18 of 19 total
Tests:       1 skipped, 334 passed, 335 total
```

| 类别 | 用例数 |
| --- | --- |
| common 基础 (errors / normalize / crypto / date-range / utils) | 64 |
| common Sprint 2 (state-machine / idempotency / query-builders / date-holidays) | 47 |
| common Sprint 3 (cache / token-utils / validator / logger) | 60 |
| common 权限 | 6 |
| 业务 (post-commit / utils-* / services-*) | 75 |
| 加密迁移 | 11 |
| 其他 | 71 |

## 审计脚本

```bash
node scripts/audit-empty-catch.js   # 529（−29）
node scripts/audit-duplication.js   # 已知 2 对（1 已归并 + 1 部署约束）
node scripts/audit-naming.js        # 命名规范扫描
```

## Sprint 4 计划（草稿）

| 任务 | 目标 | 优先级 |
| --- | --- | --- |
| 状态机在 orderService / paymentService 落地 | 替代分散的 `if status === ...` 判断 | P1 |
| 错误码全量补全 | 8 类业务异常 100% 覆盖 | P1 |
| 云函数 common 同步脚本 | 自动同步 common/ 目录到各 service | P2 |
| cloudfunctions/auth-middleware.js 14 份重复归并 | 解决云函数 cross-service 重复 | P2 |
| 集成测试 (5 关键路径) | payment / order / login / activity / commission | P1 |
| Performance 基准（k6） | 关键接口 P95 延迟 | P3 |

## 变更文件清单（Sprint 3）

### 新增（6 个）
- `test/common-cache.test.js`
- `test/common-token-utils.test.js`
- `test/common-validator.test.js`
- `test/common-logger.test.js`
- `CHANGELOG.md`
- `docs/SPRINT_3_DELIVERY.md`（本文件）

### 修改（5 个）
- `cloudfunctions/userService/referral.js`（8 处空 catch）
- `cloudfunctions/userService/auth.js`（5 处）
- `cloudfunctions/partnerService/services/referral.js`（7 处）
- `cloudfunctions/activityService/index.js`（7 处）
- `cloudfunctions/orderService/orders.js`（3 处）
