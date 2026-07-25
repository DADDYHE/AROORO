# orderService 云函数代码审查报告

- **审查对象**：`cloudfunctions/orderService/`
- **审查范围**：`index.ts`、`orders.ts`、`stats.ts`（TypeScript 源文件）+ `common/auth-middleware.js`、`common/errors.js`
- **审查日期**：2026-07-25
- **审查维度**：逻辑正确性 / 安全漏洞 / 性能 / 规范性 / 云函数特性
- **问题统计**：🔴 高危 9 ｜ 🟠 中危 13 ｜ 🟡 低危 11

---

## 一、🔴 高危问题（必须立即修复）

### H1. `checkDateAvailabilityInternal` 逻辑错误：未做日期重叠校验，导致同档期无法下单

**位置**：`orders.ts:206-222`

```ts
async function checkDateAvailabilityInternal(hostId, startDate, endDate) {
  const existingOrders = await db.collection('orders')
    .where({ hostId, status: in(['confirmed', 'in_progress', 'paid']) })
    .field({ startDate: true, endDate: true })
    .limit(100)
    .get()
  return existingOrders.data.length === 0   // ← 只要 host 下有任何活跃订单就拒绝
}
```

**问题**：
1. 函数没有用传入的 `startDate / endDate` 做任何重叠判断，只检查"是否存在活跃订单"。
2. 对比公开 handler `checkDateAvailability`（`orders.ts:723-754`），那里**正确**做了 `orderStart < requestEnd && orderEnd > requestStart` 的重叠判断。
3. 后果：一旦某 host 有任何一笔 confirmed/in_progress/paid 订单，后续所有新订单都会被 `createOrder` 拒绝，无论日期是否真的冲突。这是**业务阻断级 bug**。

**修复建议**：复用 `checkDateAvailability` 的重叠判断逻辑，或直接抽公共函数 `hasDateOverlap(hostId, start, end)`：

```ts
async function checkDateAvailabilityInternal(hostId, startDate, endDate) {
  const requestStart = new Date(startDate).getTime()
  const requestEnd = new Date(endDate).getTime()
  const existing = await db.collection('orders')
    .where({ hostId, status: db.command.in(['confirmed', 'in_progress', 'paid']) })
    .field({ startDate: true, endDate: true })
    .limit(100)
    .get()
  return !((existing.data || []) as Array<{startDate: string, endDate: string}>)
    .some(o => new Date(o.startDate).getTime() < requestEnd
            && new Date(o.endDate).getTime() > requestStart)
}
```

---

### H2. `createOrder` 存在并发预订竞态（TOCTOU）

**位置**：`orders.ts:479-543`

**问题**：
- `checkDateAvailabilityInternal` 查询与 `db.collection('orders').add` 是两次独立的数据库调用，中间无事务/锁。
- 高并发下两个请求可能同时通过日期检查，导致同档期被重复预订（**超卖**）。

**修复建议**：
1. 数据库层加唯一索引：`hostId + startDate + endDate` 复合唯一约束（最有效）。
2. 或在 `orders` 表加分布式锁字段（`lockedUntil`），下单前原子抢占。
3. 至少在 `add` 后二次校验并回滚，作为兜底。

---

### H3. `handleBoardingOrder` 缺少越权校验：任意合作伙伴可操作任意订单

**位置**：`orders.ts:885-1019`

```ts
await checkPartnerPermission(openid, 'hosting')   // 只校验身份
// ... 后续直接操作 order，没有校验 order.organizerId === openid
```

**问题**：
- `checkPartnerPermission` 仅校验调用者拥有 `hosting` 权限，但**没有校验该订单是否属于当前合作伙伴**。
- 后果：A 寄养家庭可以 confirm / reject / cancel B 寄养家庭的订单。**严重的越权漏洞**。

**修复建议**：在 `checkPartnerPermission` 后追加归属校验：

```ts
const order = orderRes.data as { organizerId?: string, hostId?: string }
if (order.organizerId !== openid && !admin.roles?.includes('super_admin')) {
  throw err('PERMISSION_DENIED', '无权操作他人订单')
}
```

---

### H4. `handleBoardingOrder` 跨表更新无事务，状态与佣金/收入记录会不一致

**位置**：`orders.ts:959-1014`

**问题**：状态更新 → 创建佣金记录 → 创建收入记录 三步独立 `await`，任一步失败：

| 失败点 | 后果 |
|---|---|
| 状态更新后 `createCommissionRecord` 失败 | 订单 completed 但佣金未记，合作伙伴收入漏算 |
| 状态更新后 `createServiceIncomeRecord` 失败 | 收入流水缺失，账务对不上 |
| `cancelled` 时 `cancelCommissionRecord` 失败 | 订单取消但佣金仍计提 |

目前 `catch` 只 `logger.warn` 吞错，**没有任何补偿机制**。

**修复建议**：
1. 用腾讯云数据库事务（`db.runTransaction`）包裹关键写入。
2. 失败时记录到 `failed_operations` 集合，由后台 worker 重试。
3. 至少将失败信息回写到订单 `commissionError` 字段，便于人工排查。

---

### H5. `getStats` host 视角查询条件错误，统计数据永远为 0

**位置**：`stats.ts:204-219`

```ts
const hostStatsRes = await db.collection('orders')
  .where({ hostId: openid, status: 'completed' })   // ← hostId 是寄养家庭档案 _id，不等于 openid
```

**问题**：
- 在 `getOrders`（`orders.ts:328-334`）中，host 视角查询用的是 `organizerId = openid`（寄养家庭 openid）。
- 这里却写成了 `hostId = openid`。`hostId` 在订单文档中存的是 `hostProfiles._id`，不会等于寄养家庭的 openid。
- 后果：所有 host 的 `bookingCount / totalIncome` 永远是 0。

**修复建议**：

```ts
.where({ organizerId: openid, status: 'completed' })
```

---

### H6. `getIncomeStats` 订单状态命名不一致，pendingIncome / monthlyIncome 几乎查不到数据

**位置**：`stats.ts:97-103` 与 `stats.ts:254-272`

**问题**：订单状态在不同地方有三套命名：

| 位置 | 使用的状态值 |
|---|---|
| `orders.ts` 实际写入 | `pending_payment` / `paid` / `confirmed` / `in_progress` / `completed` / `cancelled` |
| `stats.ts` STATUS_TEXT_MAP | `pending` / `confirmed` / `ongoing` / `completed` / `cancelled` |
| `stats.ts` pendingQuery | `in(['pending', 'confirmed', 'in_progress', 'ongoing'])` |

- `pending` ≠ `pending_payment`：pendingIncome 永远查不到待支付订单。
- `ongoing` ≠ `in_progress`：状态文本对不上。
- `confirmed` 在两边都有，但 `paid`（已支付待确认）状态在 stats 中完全没处理。

**修复建议**：
1. 统一一份 `ORDER_STATUS` 常量到 `common/order-status.js`（项目中已有此文件，应复用）。
2. STATUS_TEXT_MAP 与查询条件都引用该常量。
3. pendingQuery 应为 `in(['pending_payment', 'paid', 'confirmed', 'in_progress'])`。

---

### H7. `getIncomeStats` monthlyIncome 计算逻辑错误

**位置**：`stats.ts:267-284`

```ts
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime()

// completedQuery 已包含 query.createdAt = dateRange 范围
// 下面又用 monthStart/monthEnd 覆盖 createdAt
db.collection('orders').where({ ...completedQuery, createdAt: gte(monthStart).and(lte(monthEnd)) })
```

**问题**：
- `completedQuery` 已经带了 `dateRange` 的 `createdAt` 范围，下面又用当月范围覆盖。
- 当 `dateRange = 'last_month'` 时，求的是"上个月且在本月"的交集 → **永远为空**，monthlyIncome = 0。
- 当 `dateRange = 'today'` 时，求的是"今天且在本月" → 实际就是今天，monthlyIncome 与 totalIncome 关系混乱。

**修复建议**：monthlyIncome 应该独立于 dateRange 计算（始终是当月已完成订单的总和），不要复用 completedQuery：

```ts
const monthlyRes = await db.collection('orders')
  .where({ organizerId: openid, status: 'completed', createdAt: gte(monthStart).and(lte(monthEnd)) })
  .aggregate().group({ _id: null, monthlyIncome: $.sum('$totalPrice') }).end()
```

注意还要修正 `hostId` → `organizerId`（参见 H5）。

---

### H8. `createOrder` 优惠券客户端可控，服务端零校验

**位置**：`orders.ts:441-498`

```ts
const { couponId, couponDiscount, originalAmount } = event as { ... }
// ...
const finalAmount = calculatedPrice - (Number(couponDiscount) || 0)
if (couponId && finalAmount > 0 && finalAmount < 0.1) { throw ... }
```

**问题**：
1. `couponDiscount` 由前端传入，服务端没有去 `coupons` 集合校验该券是否真实存在、是否属于该用户、是否已使用、面额是否匹配。
2. 用户可以传入任意 `couponDiscount`（如 999999）让订单变为负数或 0 元，绕过 `finalAmount < 0.1` 的下限校验（条件要求 `finalAmount > 0`，负数会被放行）。
3. `originalAmount` 也由前端传入，与 `totalPrice` 字段重复，且不参与校验。
4. **没有调用 couponService 核销优惠券**，下单后优惠券不会被标记为已使用，可重复使用。

**修复建议**：
1. 服务端根据 `couponId` 查 `coupons` 集合，校验：存在性 / 归属 / 状态=unused / 有效期 / 面额。
2. `couponDiscount` 服务端计算，不接受前端值。
3. 下单成功后调用 `markCouponUsed(couponId, orderId)`。
4. 修正校验：`if (couponId && finalAmount < 0.1)` —— 应禁止负数。

---

### H9. "公开 handler" 实际仍要求登录，与注释和业务期望不符

**位置**：`index.ts:194-199` + `orders.ts` 多处注释

```ts
// index.ts
const requireLogin = true
const auth: AuthLike = await verifyAuth(event, { requireLogin })
return await handlers[action](event, context, auth)
```

**问题**：
- `orders.ts` 顶部注释明确说 `calculatePrice / checkDateAvailability / getHostEvaluations` 是"公开访问"，并提到通过 `_isHttpAuth` 兼容。
- 但 `index.ts` 对所有 action 强制 `requireLogin = true`，且代码中**没有任何 `_isHttpAuth` 的处理逻辑**。
- 后果：未登录用户无法试算价格、查寄养家庭评价。如果是产品需求，就是 bug；如果不需要公开，注释应改。

**修复建议**（二选一）：
1. **方案 A（推荐）**：在 `index.ts` 增加公开 action 白名单，跳过 `verifyAuth`：
   ```ts
   const PUBLIC_ACTIONS = new Set(['calculatePrice', 'checkDateAvailability', 'getHostEvaluations'])
   const auth = PUBLIC_ACTIONS.has(action) ? null : await verifyAuth(event, { requireLogin: true })
   ```
2. **方案 B**：若业务上确实需要登录，修正 `orders.ts` 注释，移除"公开访问"描述，避免误导。

---

## 二、🟠 中危问题（建议尽快修复）

### M1. `createOrder` 未校验 petIds 归属，可为他人的宠物下单

**位置**：`orders.ts:468-477`

```ts
const petsRes = await db.collection('pets')
  .where({ _id: in(petIds) }).get()
if (petList.length !== petIds.length) { throw ... }
```

**问题**：只校验宠物存在，没校验 `pet.ownerId === openid`。用户可以为别人的宠物下单。

**修复**：`.where({ _id: in(petIds), ownerId: openid })`。

---

### M2. `createOrder` petIds 重复 ID 不被检测

**位置**：同上

**问题**：`petIds = ['p1', 'p1', 'p2']`，`petList.length === 2`，但 `petIds.length === 3`，触发 `PET_NOT_FOUND` 误报。

**修复**：先去重 `[...new Set(petIds)]`，或在校验前 `if (new Set(petIds).size !== petIds.length) throw err('INVALID_PARAMS', '宠物ID重复')`。

---

### M3. `updateOrderStatus` 缺少 status 白名单校验

**位置**：`orders.ts:549-591`

**问题**：`status` 直接来自 `event`，虽然 `boardingOrderStateMachine.canTransition` 会拦截非法转移，但状态机是否覆盖所有非法值未验证。建议先做白名单：

```ts
const ALLOWED_STATUS = new Set(['pending_payment', 'paid', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'])
if (!ALLOWED_STATUS.has(status)) throw err('INVALID_PARAMS', '非法状态值')
```

---

### M4. `cancelOrder` 已支付订单未触发退款

**位置**：`orders.ts:652-656`

**问题**：`cancelOrder` 仅更新状态为 `cancelled`，对已支付订单（`paymentStatus = paid`）没有触发退款流程。需确认是否有其他云函数监听状态变更，否则用户已付款但订单取消后无法退款。

**修复**：在状态变更后判断 `paymentStatus === 'paid'`，调用 `paymentService.refund(orderId)` 或写入退款待处理队列。

---

### M5. `getBoardingOrders` 中 `where.type = nin(...)` 是死代码

**位置**：`orders.ts:768-769`

```ts
where.type = nin(['mall', 'group_buy'])        // orders 表无 type 字段，永远匹配
where.orderType = nin(['activity'])            // 真正的过滤
```

**问题**：orders 集合实际字段是 `orderType`，没有 `type` 字段。第一行 `where.type` 几乎对所有文档成立（mongo 中不存在该字段时 `$nin` 视为匹配），是**无效过滤**，应删除。

---

### M6. `getBoardingOrders` 权限分支为死代码

**位置**：`orders.ts:771-779`

```ts
await checkPartnerPermission(openid, 'hosting')  // 没有 hosting 权限会抛错
// ...
if (!roles.includes('super_admin') && !perms.includes('hosting')) {
  // 这里永远走不到，因为上面 checkPartnerPermission 已经抛错
}
```

**问题**：`checkPartnerPermission('hosting')` 已要求 hosting 权限，下面的 `!perms.includes('hosting')` 永远为 false。要么 `checkPartnerPermission` 改为不要求 hosting（只要求是 partner），要么删除这段死代码。

**修复**：将 `checkPartnerPermission(openid, 'hosting')` 改为 `checkPartnerPermission(openid, 'partner')` 或类似不强制 hosting 的级别，保留下面的细分逻辑。

---

### M7. `recalcHostRating` `limit(1000)` 截断导致统计不准

**位置**：`orders.ts:288-312`

**问题**：评价数超过 1000 时，rating / ratingCount 不准确。寄养家庭做久了会触发。

**修复**：改用 aggregate 求平均和计数：

```ts
const aggRes = await db.collection('evaluations')
  .where({ hostId })
  .aggregate()
  .group({ _id: null, count: $.sum(1), avg: $.avg('$rating') })
  .end()
```

---

### M8. `submitEvaluation` 重复评价检查存在 race condition

**位置**：`orders.ts:1088-1115`

**问题**：先查 `evaluations.where({ orderId })` 判重，再 `add` 写入，两步无锁。并发请求可能同时通过检查，写入重复评价。当前依赖 `catch (code === 'DUPLICATE_KEY')` 兜底，但**需要确认 evaluations 集合上 `orderId` 字段是否有唯一索引**，否则兜底也不生效。

**修复**：
1. 确认数据库有 `orderId` 唯一索引。
2. 或用 `db.runTransaction` 包裹检查+写入。

---

### M9. `sendOrderNotification` fire-and-forget 在云函数返回后可能被截断

**位置**：`orders.ts:588`、`orders.ts:1016`

```ts
sendOrderNotification(orderId, status).catch(() => {})
```

**问题**：
- 云函数 `return` 后，runtime 可能冻结实例，未 await 的 Promise 不保证执行完。
- 通知丢失风险：状态更新成功但用户没收到通知。

**修复**：要么 `await`（增加响应延迟），要么用 `context.callbackWaitsForEmptyEventLoop = false` + 显式 `setImmediate` 调度，要么把通知写入队列由独立 worker 消费。

---

### M10. `handleBoardingOrder` cancelCommissionRecord 失败仅 warn，会导致佣金账实不符

**位置**：`orders.ts:995-1014`

**问题**：取消订单时 `cancelCommissionRecord` 与 `cancelServiceIncomeRecord` 失败只 warn，订单状态已变为 cancelled 但佣金记录仍在计提。

**修复**：失败时写入 `failed_operations` 集合，由后台 worker 重试；或在订单文档加 `commissionCancelError` 字段标记需人工处理。

---

### M11. 超时风险：`timeout: 15` 秒对多个 handler 偏紧

**位置**：`config.json`

**问题**：
| handler | 串行步骤数 | 风险 |
|---|---|---|
| `createOrder` | user + host + pets + dateCheck + add + rateLimit ≈ 6 次 db | 15s 紧张 |
| `handleBoardingOrder(confirm)` | partnerPerm + order + admin + risk + update + commission + income ≈ 7 次 | 15s 紧张 |
| `getIncomeStats` | 3 次 aggregate + 1 次 list | 大数据量时易超时 |
| `getBoardingOrderDetail` | order + pets + user + host ≈ 4 次 | 一般安全 |

**修复**：
- `createOrder` 与 `handleBoardingOrder` 可提到 20s。
- 长链路改用 `Promise.all` 并行化无依赖步骤（如 `createOrder` 中 owner/host/pets 可并行）。
- `getIncomeStats` 的 3 个 aggregate 已并行，但 list 查询可与之一并并行。

---

### M12. `bootstrapRateLimit` 在模块顶层执行 db 查询，影响冷启动

**位置**：`index.ts:163-168`

```ts
try {
  const { db } = initCloud()
  bootstrapRateLimit(db, { logger })
} catch (e) { ... }
```

**问题**：每次冷启动都会查 `rate_limits + rate_limit_configs`，增加 1-2s 冷启动延迟。orderService 调用频率不高，冷启动占比明显。

**修复**：
1. 加本地内存缓存（5 分钟内只查一次 db）。
2. 或把配置打成静态 JSON 内联进函数包，避免 db 查询。
3. 当前已有 try/catch 降级到内存，可接受，但建议加缓存。

---

### M13. `getIncomeStats` 中 `event.limit` 直接访问未声明

**位置**：`stats.ts:290`

```ts
const limit = Math.min(Number(event.limit) || 500, 1000)
```

**问题**：`event` 解构时没取 `limit`，这里直接 `event.limit` 取值。TypeScript 因 `EventLike = Record<string, unknown>` 不报错，但风格不一致。

**修复**：在解构里补 `limit`：

```ts
const { status, dateRange, limit } = event as { ...; limit?: number }
const safeLimit = Math.min(Number(limit) || 500, 1000)
```

---

## 三、🟡 低危问题（可纳入技术债）

### L1. `SUPPORTED_ACTIONS` 声明"用于 fail-fast 校验"但 main 未实际使用

**位置**：`index.ts:96-117, 185-208`

main 函数只用 `handlers[action]` 判断 action 是否存在，`SUPPORTED_ACTIONS` 常量仅供 export 给测试。建议要么在 main 中真正 fail-fast（`if (!SUPPORTED_ACTIONS.includes(action))`），要么修正注释。

---

### L2. `_` 变量声明后未使用（死代码）

**位置**：`orders.ts:161`、`stats.ts:119`

```ts
const _ = (db as CloudBaseDB & { command: unknown }).command
```

应删除。

---

### L3. `getDateRange('week')` 起始日是周日，与中文习惯不符

**位置**：`orders.ts:178-185`、`stats.ts:137-145`

`getDay()` 周日返回 0，`setDate(now.getDate() - 0)` = 当天，本周从周日开始。中文业务通常以周一为一周开始。建议：

```ts
const dayOfWeek = (now.getDay() + 6) % 7  // 周一=0, 周日=6
```

需与产品确认。

---

### L4. `days` 计算 `+1` 在跨天场景下可能产生歧义

**位置**：`orders.ts:487`、`orders.ts:713`

```ts
const days = Math.ceil((end - start) / 86400000) + 1
```

含义是"按天计费，包含首尾两天"。如果业务是按夜计费（酒店式），应该 `-1` 或不加。需与产品确认计费规则并在文档中明确。

---

### L5. `amountFen` 浮点转整数有精度风险

**位置**：`orders.ts:914`

```ts
const amountFen = Math.round(orderAmount * 100)
```

`0.1 + 0.2 = 0.30000000000000004`，乘 100 后 `Math.round` 通常能修正，但极端值（如 `1.005`）仍可能出错。

**修复**：用字符串处理或 decimal.js。

---

### L6. `submitEvaluation` 评论未做 XSS 过滤

**位置**：`orders.ts:1046`

```ts
const safeComment = String(comment || '').slice(0, 500)
```

只截断长度，未转义 HTML。评价内容会原样存库，展示时若前端用 `rich-text` 或 `innerHTML` 会有 XSS 风险。

**修复**：服务端做基本转义，或在前端用 `text` 而非 `rich-text` 渲染。

---

### L7. `getOrderDetail` 通过 outTradeNo 查询未做权限预过滤

**位置**：`orders.ts:671-678`

```ts
const res = await db.collection('orders').where({ outTradeNo }).limit(1).get()
```

只查再校验 owner/host，性能上多一次无效查询。建议加 `ownerId: openid` 前置过滤。

---

### L8. `getBoardingOrderDetail` 未校验 orderType，合作伙伴可查活动订单详情

**位置**：`orders.ts:809-879`

虽然 `getBoardingOrders` 列表排除了 activity，但 `getBoardingOrderDetail` 直接按 orderId 查，没有过滤 `orderType !== 'activity'`。任意合作伙伴可获取活动订单详情（可能含其他用户信息）。

**修复**：查到后 `if (order.orderType === 'activity') throw err('PERMISSION_DENIED')`。

---

### L9. `getStats` catch 块冗余

**位置**：`stats.ts:225-231`

```ts
if (isBusinessError(error)) {
  return handleError(error, '获取统计数据失败', ERROR_CODES.DATA)
}
logger.error('getStats', { msg: error.message })
return handleError(error, '获取统计数据失败', ERROR_CODES.DATA)
```

两个分支返回完全相同，`if` 判断无意义。可简化为单一 return。

---

### L10. 错误日志可能包含敏感上下文

**位置**：`index.ts:201`

```ts
logger.error(action, error as Error)
```

`Error` 对象可能携带 `details`（如 orderId / 手机号）。需确认 `logger` 是否过滤敏感字段，否则日志系统会泄露 PII。

---

### L11. `handleBoardingOrder` 中 `pendingReview: pendingReview || undefined` 前端语义不清

**位置**：`orders.ts:962`

false 时写 `undefined`（mongo 中等同不写字段），返回给前端时字段缺失。建议显式返回 `pendingReview: false`，避免前端 `if (data.pendingReview)` 之外的判断（如 `if ('pendingReview' in data)`）出错。

---

## 四、按维度汇总

### 4.1 逻辑正确性

| 编号 | 严重度 | 问题 |
|---|---|---|
| H1 | 🔴 | `checkDateAvailabilityInternal` 未做日期重叠校验，同档期无法下单 |
| H5 | 🔴 | `getStats` host 视角用错字段，统计永远为 0 |
| H6 | 🔴 | 订单状态命名三套并存，查询条件失效 |
| H7 | 🔴 | `getIncomeStats` monthlyIncome 在 last_month 等场景下永远为 0 |
| M5 | 🟠 | `getBoardingOrders` 中 `where.type` 是死代码 |
| M6 | 🟠 | `getBoardingOrders` 权限分支为死代码 |
| L9 | 🟡 | `getStats` catch 块冗余 |

### 4.2 安全漏洞

| 编号 | 严重度 | 问题 |
|---|---|---|
| H3 | 🔴 | 合作伙伴越权操作他人订单 |
| H8 | 🔴 | 优惠券客户端可控，服务端零校验 |
| M1 | 🟠 | 未校验 petIds 归属 |
| M4 | 🟠 | 已支付订单取消未触发退款 |
| M8 | 🟠 | 重复评价检查存在 race condition |
| L6 | 🟡 | 评论未做 XSS 过滤 |
| L7 | 🟡 | outTradeNo 查询未做权限预过滤 |
| L8 | 🟡 | 合作伙伴可查活动订单详情 |
| L10 | 🟡 | 日志可能泄露 PII |

### 4.3 性能

| 编号 | 严重度 | 问题 |
|---|---|---|
| H2 | 🔴 | createOrder 并发竞态需加唯一索引 |
| H4 | 🔴 | 跨表更新无事务，失败后状态不一致 |
| M7 | 🟠 | recalcHostRating limit(1000) 截断 |
| M9 | 🟠 | sendOrderNotification fire-and-forget 风险 |
| M10 | 🟠 | cancelCommissionRecord 失败吞错 |
| M11 | 🟠 | 多 handler 超时风险 |
| M12 | 🟠 | bootstrapRateLimit 影响冷启动 |
| L2 | 🟡 | `_` 变量死代码 |

### 4.4 代码规范

| 编号 | 严重度 | 问题 |
|---|---|---|
| H9 | 🔴 | "公开 handler"注释与实现不符 |
| M13 | 🟠 | `event.limit` 未在解构中声明 |
| L1 | 🟡 | SUPPORTED_ACTIONS 注释误导 |
| L4 | 🟡 | `days + 1` 计费语义不明确 |
| L11 | 🟡 | pendingReview 语义不清 |

### 4.5 云函数特性

| 编号 | 严重度 | 问题 |
|---|---|---|
| M9 | 🟠 | 未 await 的 Promise 在 runtime 冻结后可能不执行 |
| M11 | 🟠 | timeout=15s 偏紧 |
| M12 | 🟠 | 顶层 db 查询拖慢冷启动 |
| H2 | 🔴 | 无事务下的并发预订超卖 |

---

## 五、修复优先级建议

### P0（本周内修复，影响业务正确性）
- **H1** `checkDateAvailabilityInternal` 日期重叠 bug
- **H3** 合作伙伴越权漏洞
- **H5** `getStats` host 视角字段错误
- **H6** 订单状态命名统一
- **H8** 优惠券服务端校验

### P1（下个迭代修复，影响数据一致性）
- **H2** 并发预订加唯一索引
- **H4** 跨表事务或补偿机制
- **H7** monthlyIncome 计算修正
- **H9** 公开 handler 鉴权策略
- **M4** 已支付订单取消触发退款

### P2（技术债，逐步清理）
- M1~M13、L1~L11

---

## 六、附录：审查文件清单

| 文件 | 行数 | 状态 |
|---|---|---|
| `cloudfunctions/orderService/index.ts` | 229 | 已审 |
| `cloudfunctions/orderService/orders.ts` | 1190 | 已审 |
| `cloudfunctions/orderService/stats.ts` | 353 | 已审 |
| `cloudfunctions/orderService/config.json` | 6 | 已审 |
| `cloudfunctions/orderService/package.json` | 11 | 已审 |
| `cloudfunctions/orderService/common/auth-middleware.js` | 79 | 已审（依赖） |
| `cloudfunctions/orderService/common/errors.js` | 297 | 已审（依赖） |

> 未深入审查的依赖：`risk-control.js`、`risk-rate-limit.js`、`boarding-state-machine.js`、`commission-utils.js`、`service-income-utils.js`、`rate-limit-bootstrap.js`。建议后续单独审查这些公共模块。

---

## 七、P0 修复执行记录（2026-07-25）

本轮修复覆盖 5 个 P0 高危项 + 1 个 P1 项（H7 顺手修），全部完成并通过 TypeScript 编译验证。

### H1 ✅ `checkDateAvailabilityInternal` 日期重叠校验

**改动**：`orders.ts:206-237`

实现真正的重叠判断：`orderStart < requestEnd && orderEnd > requestStart`，与公开 handler `checkDateAvailability` 同款算法。增加日期解析失败/反向区间的安全兜底（直接返回 false）。

```ts
const hasOverlap = existingOrders.some(o =>
  new Date(o.startDate).getTime() < requestEnd &&
  new Date(o.endDate).getTime() > requestStart
)
return !hasOverlap
```

### H3 ✅ `handleBoardingOrder` 越权校验

**改动**：`orders.ts:889-919`

保留 `checkPartnerPermission` 返回的 `admin` 引用，在 `canPerformOperation` 之前加归属校验：

```ts
const isSuperAdmin = (admin.roles || []).includes('super_admin')
if (!isSuperAdmin && od.organizerId !== openid) {
  throw err('PERMISSION_DENIED', '无权操作他人订单')
}
```

### H5 ✅ `getStats` host 视角字段

**改动**：`stats.ts:204-219`

`hostId: openid` → `organizerId: openid`，与 `getOrders` 的 host 视角查询保持一致。

### H6 ✅ 统一订单状态命名

**改动**：`stats.ts:97-105, 254-272`

1. `STATUS_TEXT_MAP` 重写：删除 `pending` / `ongoing`，对齐 `pending_payment / paid / confirmed / in_progress / completed / cancelled / refunded`。
2. `getIncomeStats` 中 `pendingQuery` 的 `in(['pending', 'confirmed', 'in_progress', 'ongoing'])` → `in(['pending_payment', 'paid', 'confirmed', 'in_progress'])`。
3. `getStats` 的 host 查询条件同 H5 一起修正字段。

### H7 ✅ `monthlyIncome` 计算逻辑（顺手修，原属 P1）

**改动**：`stats.ts:283-292`

抽出独立的 `monthlyQuery`，不再复用 `completedQuery`（其 `createdAt` 是 dateRange 范围）。`monthlyQuery` 始终是当月已完成订单，与 dateRange 解耦：

```ts
const monthlyQuery = {
  organizerId: openid,
  status: 'completed',
  createdAt: gte(monthStart).and(lte(monthEnd)),
}
```

修复 `last_month` / `today` 等场景下 monthlyIncome 永远为 0 的 bug。

### H8 ✅ 优惠券服务端校验

**改动**：`orders.ts:165-167`（cloud 解构）+ `orders.ts:300-460`（新增辅助函数）+ `orders.ts:480-590`（createOrder 重构）

#### 新增辅助函数

1. **`computeCouponDiscount(coupon, orderAmount)`**：纯函数，与 couponService.calculateCouponDiscount 算法对齐。整数分计算避免浮点精度，支持 fixed_amount/full_reduction/discount 三种类型，含 threshold 门槛校验、maxReduceAmount 封顶、折扣不超过订单金额。

2. **`validateAndLockCoupon(openid, couponId, orderAmount, orderId, orderType)`**：
   - ID 格式校验（防注入）
   - 查 `user_coupons` 集合校验：存在 / `ownerId === openid` / `status === 'unused'` / 有效期
   - 调 `computeCouponDiscount` 服务端计算 discount
   - 调 `cloud.callFunction({ name: 'couponService', data: { action: 'lockCoupon', ... } })` 跨函数调用锁定券
   - couponService 不可达时 fail-closed（拒绝下单，防券未锁定却下单）

3. **`unlockCouponBestEffort(couponId, orderId)`**：best-effort 回滚，失败仅 warn 不抛错。

#### createOrder 主流程改动

1. **从 destructure 中移除 `couponDiscount / originalAmount`**：不再信任客户端传入值。
2. **`originalAmount` 服务端写入**：等于 `calculatedPrice`。
3. **`couponId` 存在时调 `validateAndLockCoupon`**：拿到服务端计算的 discount 和 couponSnapshot。
4. **`finalAmount < 0.1` 校验修正**：原代码 `finalAmount > 0 && finalAmount < 0.1` 漏掉负数场景（用户传超大 couponDiscount 让订单变负），改为 `finalAmount < 0.1`，并附带 unlockCoupon 回滚。
5. **订单写入失败回滚**：`withRateLimit` 抛错时调 `unlockCouponBestEffort` 回滚锁定的券。
6. **`couponSnapshot` 字段写入订单**：便于后续 `useCoupon` 核销时二次校验。

### 编译验证

```bash
npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
# → 0 errors，产物 index.js / orders.js / stats.js 已更新
```

### 产物核验（grep 命中点）

| 修复项 | 产物命中数 |
|---|---|
| H1 hasOverlap / 日期重叠算子 | 7 |
| H3 越权校验 | 3 |
| H5 organizerId: openid | 3 |
| H6 pending_payment | 4 |
| H7 monthlyQuery 独立 | 2 |
| H8 优惠券服务端校验函数 | 9 |
| H8 客户端 couponDiscount 解构（应=0） | 0 ✓ |

### 未做的 follow-up（建议下个迭代处理）

- **H8 取消订单时调 unlockCoupon**：`cancelOrder` / `updateOrderStatus('cancelled')` 目前未触发 unlockCoupon，券会卡在 `locked` 状态。需在状态变为 `cancelled` 时调 couponService。
- **H8 useCoupon 集成**：订单状态变为 `completed` 时应调 couponService.useCoupon 真正核销券（当前仅 lockCoupon，未核销）。
- **跨函数调用延迟**：`cloud.callFunction` 约 100-300ms，可能加重 createOrder 超时风险（参见 M11）。若性能成问题，可考虑将优惠券校验逻辑下沉到 orderService 内部直接操作 user_coupons 集合（但会与 couponService 形成耦合）。

### 部署提醒

修复后需重新部署 `orderService` 云函数。部署前确认：
1. `cloudfunctions/orderService/orders.js` 和 `stats.js` 已更新（`ls -la` 时间戳为最新）。
2. 云函数环境变量无 `TENCENTCLOUD_` / `SCF_` / `QCLOUD_` 前缀（参见项目部署铁律）。
3. `couponService` 云函数已部署且 `lockCoupon` action 可用（H8 依赖）。
4. `user_coupons` 集合存在 `ownerId` / `status` / `startTime` / `endTime` / `type` / `rules` 字段（H8 校验依赖）。

---

## 八、P1 修复执行记录（2026-07-25）

本轮修复覆盖 4 个 P1 项（H7 已在 P0 顺手修），全部完成并通过 TypeScript 编译验证。

### H9 ✅ 公开 handler 鉴权策略

**改动**：`index.ts:96-117, 200-230`

新增 `PUBLIC_ACTIONS` 常量集合，命中时跳过 `verifyAuth`，传 `auth=null` 给 handler：

```ts
export const PUBLIC_ACTIONS: ReadonlySet<string> = new Set([
  'calculatePrice',
  'checkDateAvailability',
  'getHostEvaluations',
])

// main 中：
if (PUBLIC_ACTIONS.has(action)) {
  logger.info(action, { openid: '(public)' })
  return await handlers[action](event, context, null)
}
```

`PUBLIC_ACTIONS` 已 export，便于单元测试覆盖。

### H2 ✅ 并发预订竞态（代码层 + 索引建议）

**改动**：`orders.ts:778, 803-807`（createOrder）

#### 代码层改动

1. createOrder 写入订单时新增 `bookingKey` 字段：
   ```ts
   bookingKey: `booking_${hostId}_${startDate}_${endDate}`
   ```
2. add 抛 DUPLICATE_KEY 时，返回更友好的"该档期已被预订"提示：
   ```ts
   if (isBusinessError(e) && e.code === 'DUPLICATE_KEY') {
     throw err('BUSINESS_ERROR', '该档期已被预订，请选择其他日期', { hostId, startDate, endDate })
   }
   ```

#### 数据库层建议（用户须在云控制台手动建）

为彻底防止超卖，**必须在云控制台为 `orders` 集合的 `bookingKey` 字段建立唯一索引**：

```
集合：orders
字段：bookingKey (string)
索引类型：唯一索引
```

未建索引时降级为 `checkDateAvailabilityInternal` 重叠检查（H1 已修复正确算法），仅极端并发下仍可能漏。

### H4 ✅ 跨表事务（失败补偿队列方案）

**改动**：`orders.ts:460-505`（新增 `recordFailedOperation`）+ `orders.ts:1246-1310`（handleBoardingOrder catch 块改造）

#### 新增辅助函数

`recordFailedOperation(type, payload, error)`：写入 `failed_operations` 集合，记录待重试的失败操作：

```ts
interface FailedOperationDoc {
  _id: string
  type: string  // 'create_commission' / 'create_service_income' / 'cancel_commission' / 'cancel_service_income'
  payload: Record<string, unknown>
  error: { message: string, name?: string }
  status: 'pending'
  retryCount: 0
  createdAt, updatedAt
}
```

#### handleBoardingOrder 4 个 catch 块改造

| 操作 | 失败时记录的 type | 防止的问题 |
|---|---|---|
| `createCommissionRecord` 失败 | `create_commission` | 订单 completed 但佣金未记，合作伙伴收入漏算 |
| `createServiceIncomeRecord` 失败 | `create_service_income` | 收入流水缺失，账务对不上 |
| `cancelCommissionRecord` 失败 | `cancel_commission` | 订单取消但佣金仍计提 |
| `cancelServiceIncomeRecord` 失败 | `cancel_service_income` | 收入记录未取消 |

后台 worker 可扫描 `failed_operations` 集合中 `status='pending'` 的记录并重新执行（worker 实现留待后续）。

### M4 ✅ 已支付订单取消触发退款

**改动**：`orders.ts:819-905`（updateOrderStatus）

在状态变更为 `cancelled` 前判断 `paymentStatus === 'paid'`：

```ts
if (status === 'cancelled' && od.paymentStatus === 'paid' && od.outTradeNo) {
  const refundAmount = Number(od.totalPrice) || Number(od.originalAmount) || 0
  // 调 paymentService.createRefund 跨函数触发退款
  const callRes = await cloud.callFunction({
    name: 'paymentService',
    data: {
      action: 'createRefund',
      outTradeNo: od.outTradeNo,
      refundAmount,
      totalAmount: refundAmount,
      reason: isOwner ? '用户主动取消订单' : '商家取消订单',
    },
  })
  // paymentService 内部会更新订单状态为 refunding/refunded 并调微信退款 API
  return handleSuccess({ orderId, status: 'refunded', refundInitiated: true }, '退款已发起，请等待到账')
}
```

#### 关键设计

- **不在 orderService 内调微信退款 API**：复用 paymentService.createRefund（已有风控 + 限流 + 微信签名 + 状态机）。
- **状态不冲突**：createRefund 内部已更新订单状态为 refunding/refunded，updateOrderStatus 不再调 update。
- **失败 fail-closed**：跨函数调用异常时抛错，订单状态保持，引导用户重试或联系客服。
- **金额兜底**：`totalPrice || originalAmount`，且 `refundAmount <= 0` 时直接抛错防止异常金额触发退款。
- **取消原因区分**：`isOwner` 判断"用户主动取消" vs "商家取消"，传给 paymentService 用于风控审计。

### 编译验证

```bash
npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
# → 0 errors，产物 index.js / orders.js / stats.js 已更新（14:04 时间戳）
```

### 产物核验（grep 命中点）

| 修复项 | 产物命中数 |
|---|---|
| H9 PUBLIC_ACTIONS | 5 |
| H9 公开 action 跳过 verifyAuth | 2 |
| H2 bookingKey 字段 | 4 |
| H2 "该档期已被预订"提示 | 2 |
| H4 recordFailedOperation / failed_operations | 10 |
| H4 4 类失败操作记录 | 4 |
| M4 paymentStatus === 'paid' 判定 | 3 |
| M4 调 paymentService.createRefund | 2 |

### ⚠️ P1 部署前确认（在 P0 基础上追加）

5. **必须建数据库索引**（H2 依赖）：在云控制台为 `orders.bookingKey` 建唯一索引。
6. **paymentService 已部署且 createRefund 可用**（M4 依赖）。
7. **paymentService.createRefund 内部会更新订单状态**（M4 设计前提）：确认 createRefund 会把订单 `status` 更新为 `refunding`/`refunded`，且 `refundStatus` 同步更新。
8. **订单文档含 outTradeNo 字段**（M4 依赖）：createPayment 写入的 outTradeNo 字段须存在于已支付订单上。
9. **可选：建后台 worker 扫描 failed_operations**（H4 配套）：扫描 `status='pending'` 的记录，按 type 调用对应的 create/cancel 函数重试，成功后置为 `status='resolved'`。

### 未做的 follow-up（建议后续迭代）

- **后台 worker 实现**：扫描 failed_operations 集合并重试，建议新建独立云函数 `failedOpsWorker` 配定时触发器（每 5 分钟扫一次）。
- **bookingKey 索引迁移脚本**：建索引前需扫描存量 orders 是否有重复 bookingKey，若有需先清理。
- **paymentService 错误码细化**：M4 中 createRefund 失败目前统一抛 REFUND_FAILED，可细分（如 RISK_REJECT / RATE_LIMITED / 微信 API 失败）。

---

## 九、P2 中危修复执行记录（2026-07-25）

本轮修复覆盖 11 个 P2 中危项（M4 和 M10 已在 P1 处理），全部完成并通过 TypeScript 编译验证。

### M1+M2 ✅ petIds 归属与重复校验

**改动**：`orders.ts:705-720`（createOrder）

```ts
// M2：检测重复 ID
const uniquePetIds = [...new Set(petIds)]
if (uniquePetIds.length !== petIds.length) {
  throw err('INVALID_PARAMS', '宠物ID存在重复')
}
// M1：校验归属
const petsRes = await db.collection('pets')
  .where({ _id: in(petIds), ownerId: openid })  // 新增 ownerId 过滤
  .get()
if (petList.length !== petIds.length) {
  throw err('PET_NOT_FOUND', '宠物档案不存在、已删除或不属于当前用户')
}
```

### M3 ✅ updateOrderStatus status 白名单

**改动**：`orders.ts:118-126`（新增常量）+ `orders.ts:830-833`（入口校验）

```ts
const ALLOWED_ORDER_STATUS: ReadonlySet<string> = new Set([
  'pending_payment', 'paid', 'confirmed', 'in_progress',
  'completed', 'cancelled', 'refunded', 'rejected',
])

// updateOrderStatus 入口：
if (!ALLOWED_ORDER_STATUS.has(status)) {
  throw err('INVALID_PARAMS', `非法状态值：${status}`)
}
```

### M5 ✅ 删除 where.type 死代码

**改动**：`orders.ts:1115`（getBoardingOrders）

删除 `where.type = nin(['mall', 'group_buy'])`（orders 集合无 `type` 字段，`$nin` 对不存在的字段视为匹配，过滤无效）。保留 `where.orderType = nin(['activity'])`。

### M6 ✅ 消除权限分支死代码

**改动**：`orders.ts:1118-1126`（getBoardingOrders）

原代码 `checkPartnerPermission('hosting')` 已要求 hosting 权限，下面 `!perms.includes('hosting')` 永远 false。改为：

```ts
// super_admin 看全部订单；非 super_admin 即使有 hosting 权限也只看自己作为 host 的订单
if (!(admin.roles || []).includes('super_admin')) {
  const hostProfileRes = await db.collection('hostProfiles')
    .where({ openid }).limit(1).get()
  if (hostProfileRes.data && hostProfileRes.data.length > 0) {
    where.hostId = hostProfileRes.data[0]._id
  }
}
```

### M7 ✅ recalcHostRating 用 aggregate

**改动**：`orders.ts:521-573`

`limit(1000)` + 内存求和改为服务端聚合：

```ts
const aggRes = await collection.aggregate()
  .match({ hostId })
  .group({
    _id: null,
    count: $.sum(1),
    ratingSum: $.sum('$rating'),
  })
  .end()
```

修复评价数超 1000 时 `ratingCount` 显示 1000、`rating` 仅前 1000 条平均的不准确问题。

### M8 ✅ submitEvaluation 重复评价 race condition

**改动**：`orders.ts:1487-1510`

`_id` 从随机 `generateId('eval', openid)` 改为确定性 `eval_${orderId}`，利用 `_id` 主键唯一约束天然防止并发重复评价：

```ts
const evaluation = {
  _id: `eval_${orderId}`,  // 确定性 ID，主键冲突即兜底
  ...
}
```

判重查询保留（提供友好返回），catch DUPLICATE_KEY 兜底保留（双保险）。

### M9 ✅ sendOrderNotification await 化

**改动**：`orders.ts:939, 956, 1418`（3 处）

`sendOrderNotification(...).catch(() => {})` → `await sendOrderNotification(...)`，避免云函数返回后未 await 的 Promise 被 runtime 冻结截断。`sendOrderNotification` 内部已 try/catch，await 不影响主流程。

### M11 ✅ 调整云函数 timeout

**改动**：`config.json`

`timeout: 15` → `timeout: 20`，对 `createOrder` / `handleBoardingOrder(confirm)` / `getIncomeStats` 等长链路 handler 提供余量。

### M12 ✅ bootstrapRateLimit 加内存缓存

**改动**：`index.ts:179-199`

新增 5 分钟内存缓存，避免每次冷启动都查 `rate_limits + rate_limit_configs`：

```ts
const RATE_LIMIT_BOOTSTRAP_TTL_MS = 5 * 60 * 1000
const _globalCache = globalThis as { __rateLimitBootstrapAt?: number }
const cacheValid = _globalCache.__rateLimitBootstrapAt &&
  (Date.now() - _globalCache.__rateLimitBootstrapAt < RATE_LIMIT_BOOTSTRAP_TTL_MS)
if (!cacheValid) {
  // 重新查 db 并 bootstrap
  _globalCache.__rateLimitBootstrapAt = Date.now()
}
```

单实例内复用：5 分钟内同一实例的多次冷启动跳过 db 查询。

### M13 ✅ getIncomeStats event.limit 解构

**改动**：`stats.ts:255, 310`

`event.limit` 改为在解构中声明 `requestLimit`，风格一致：

```ts
const { status, dateRange, limit: requestLimit } = event as { ...; limit?: number }
const limit = Math.min(Number(requestLimit) || 500, 1000)
```

### 编译验证

```bash
npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
# → 0 errors（修复 1 处类型错误：AggOps.sum 接受 string 参数）
# 产物 index.js / orders.js / stats.js / config.json 已更新（14:13 时间戳）
```

### 产物核验（grep 命中点）

| 修复项 | 产物命中数 | 备注 |
|---|---|---|
| M1 petIds 归属校验 | 3 | ownerId: openid |
| M2 重复 ID 检测 | 2 | Set + 提示 |
| M3 status 白名单 | 3 | ALLOWED_ORDER_STATUS |
| M5 where.type 死代码 | 1（仅注释） | 实际代码已删 |
| M6 perms.includes('hosting') 死代码 | 1（仅注释） | 实际代码已删 |
| M7 recalcHostRating aggregate | 3 | match + group + ratingSum |
| M8 确定性 _id | 2 | eval_${orderId} |
| M9 sendOrderNotification await | 3 | updateOrderStatus / refund / handleBoardingOrder |
| M11 timeout 20 | 1 | config.json |
| M12 bootstrapRateLimit 缓存 | 3 | TTL + globalCache + cacheValid |
| M13 limit 解构 | 2 | requestLimit |

### P2 部署前确认（在 P0+P1 基础上追加）

10. **timeout 调整**：`config.json` 改为 20 秒，部署后须确认云函数控制台的 timeout 配置同步（若控制台有覆盖）。
11. **evaluations._id 兼容性**：M8 修复后新评价 `_id` 格式为 `eval_<orderId>`，老评价保持 `eval_<openid>_<random>` 格式。两种格式可共存，不影响查询。
12. **failed_operations 集合**：H4 + M10 已写入该集合，建议在云控制台为 `status + createdAt` 建复合索引，便于后台 worker 扫描。

### 至此 orderService 审查 P0+P1+P2 完整修复

- **P0**（5 项 + 1 顺手）：H1 / H3 / H5 / H6 / H7 / H8 ✅
- **P1**（4 项）：H2 / H4 / H9 / M4 ✅
- **P2**（11 项）：M1 / M2 / M3 / M5 / M6 / M7 / M8 / M9 / M11 / M12 / M13 ✅

剩余低危 L1~L11 属整洁/精度/版本类技术债，可逐步清理或永久搁置。orderService 已具备生产可用性，建议部署前完成云端核对清单（详见 P0/P1/P2 部署前确认项 1-12）。

---

# 第十一章 低危项 L1~L11 修复记录

> 用户指令「继续修复未修项」触发。L 级为整洁度 / 精度 / 健壮性类技术债，无生产阻断风险，但修复可显著降低长期维护成本与潜在 PII 泄露面。

## 编译验证

```bash
npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderService.json
# → 0 errors
# 产物 index.js / orders.js / stats.js 已更新（17:11 时间戳）
```

## L1 ✅ SUPPORTED_ACTIONS 真正 fail-fast

**文件**：`index.ts`（main 入口）
**问题**：`SUPPORTED_ACTIONS` 注释称「用于 fail-fast 校验」，但 main 只用了 `handlers[action]` 判断存在性，常量形同虚设。

**改动**：
```ts
const { action } = event
if (!action) { throw err('UNKNOWN_ACTION', '缺少 action 参数') }
// L1 修复：SUPPORTED_ACTIONS 作为权威白名单做真正的 fail-fast 校验
if (!SUPPORTED_ACTIONS.includes(action)) {
  throw err('UNKNOWN_ACTION', `未知的操作：${action}`)
}
const handler = handlers[action]
```

**效果**：白名单常量成为权威校验入口，与 `handlers` 分发解耦；未来新增/下线 action 只需维护 `SUPPORTED_ACTIONS`（export 给单测沿用）。

## L2 ✅ 删除 `const _` 死代码

**文件**：`orders.ts:178`、`stats.ts:126`
**问题**：`const _ = (db as ...).command` 声明后从未使用（真正用到的是 `$`）。

**改动**：两处均删除该行，仅保留 `const $: AggregateOps = ...`。编译 0 errors，无副作用。

## L3 ✅ week 日期范围改为周一为起点

**文件**：`orders.ts:114`（getDateRange）、`stats.ts:77`（getDateRangeFromPreset）
**问题**：原 `const dayOfWeek = now.getDay()` 周日返回 0，`setDate(-0)` 使「本周」从周日开始，与中文业务习惯（周一为一周起点）不符。

**改动**：
```ts
// 中文业务以周一为一周起点（getDay() 周日=0 → 周一=0，周日=6）
const dayOfWeek = (now.getDay() + 6) % 7
weekStart.setDate(now.getDate() - dayOfWeek)
```

> ⚠️ **需产品确认**：此改动会影响 `getStats` / `getIncomeStats` 中 `dateRange: 'week'` 的聚合边界（本周一 00:00 ~ 今 23:59）。若产品实际期望「周日起点」，请回退本项。当前按中文通用习惯实现。

## L4 ✅ 标注 `days + 1` 计费语义

**文件**：`orders.ts:763`（handleBoardingOrder）、`orders.ts:1090`（calculatePrice）
**问题**：`Math.ceil(...) + 1` 的 `+1` 语义不清（按天 vs 按夜计费），跨天场景易歧义。

**改动**：在两处 `days` 计算上方加注释说明意图，**不改变运行时行为**：
```ts
// L4 备注：+1 表示「按天计费且包含首尾两天」（如 7/1~7/3 = 3 天）。
//   若后续改为按夜计费（酒店式），需改为 -1 或不加。计费规则以产品确认为准。
```

> 属文档化修复，无代码行为变化。

## L5 ✅ amountFen 浮点转整数精度

**文件**：`orders.ts:1296`（handleBoardingOrder 风控）
**问题**：`Math.round(orderAmount * 100)` 在 `1.005` 等极端值下 `1.005*100=100.49999999999999` → `Math.round` 得 `100`（应为 `101`），导致风控金额（分）偏低。

**改动**：
```ts
// L5 修复：避免 1.005*100=100.4999 浮点误差，加 1e-6 容差再 round（远小于半分，安全）
const amountFen = Math.round(orderAmount * 100 + 1e-6)
```
`1e-6` 容差远小于半分（0.5 分 = 0.005 元），对常规金额与边界值均安全。

## L6 ✅ submitEvaluation 评论 HTML 转义（XSS 加固）

**文件**：`orders.ts:1449`（原 safeComment）、`orders.ts:1462`（风控入参）、新增 `escapeHtml` 辅助
**问题**：原仅 `String(comment).slice(0, 500)` 截断，未转义。评价内容若经 `rich-text` / `innerHTML` 渲染会造成 XSS。

**改动**：
```ts
/** L6 修复：HTML 转义，防止评价内容经 rich-text / innerHTML 渲染时 XSS */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

// 先截取再转义；风控入参用 rawComment（不转义，保证 spam 检测对原始文本有效）
const rawComment = String(comment || '').slice(0, 500)
const safeComment = escapeHtml(rawComment)
// ...detectReviewSpam 入参传 rawComment...
// ...评价存储用 safeComment...
```

**效果**：存储内容经转义，`rich-text` 渲染时 `<script>` 等被中和；风控检测仍基于原始文本，不受影响。

## L7 ✅ getOrderDetail 按 outTradeNo 查询加降权过滤

**文件**：`orders.ts:1045`（getOrderDetail）
**问题**：`db.collection('orders').where({ outTradeNo }).limit(1)` 全表扫描后在校验层判权限，既浪费一次无效查询，又给越权探查留口子。

**改动**：
```ts
// L7 修复：outTradeNo 查询增加 owner/organizer 降权过滤
const orOp = (db.command as { or: (arr: unknown[]) => unknown }).or([
  { ownerId: openid },
  { organizerId: openid },
]) as Record<string, unknown>
const res = await db.collection('orders').where({ outTradeNo, ...orOp }).limit(1).get()
```
沿用 adminService 已有的 `_.or([...])` 查询模式（CloudBase 逻辑运算符），将权限判定下推到数据库层。

> **行为变化（安全向）**：非 owner/非 organizer 用户用他人 outTradeNo 查询，原返回 `PERMISSION_DENIED`，现返回 `NOT_FOUND`（不泄露订单存在性）。属更安全的默认行为，若客户端对这两种错误码有差异化 UI 需注意。

## L8 ✅ getBoardingOrderDetail 拦截活动订单

**文件**：`orders.ts:1194`（getBoardingOrderDetail）
**问题**：`getBoardingOrders` 列表已排除 activity，但 `getBoardingOrderDetail` 按 orderId 直查无 `orderType` 过滤，任意合作伙伴可取得活动订单详情（含他人 ownerInfo / 联系方式）。

**改动**（查到后显式拦截）：
```ts
const order = { ...(res.data) }
// L8 修复：getBoardingOrders 列表已排除 activity，但此处按 orderId 直查会漏过
if (order.orderType === 'activity') {
  throw err('PERMISSION_DENIED', '无权查看活动订单')
}
```

## L9 ✅ getStats catch 冗余分支简化

**文件**：`stats.ts:234-240`（getStats）
**问题**：catch 中 `if (isBusinessError(error))` 与后续 `return handleError(...)` 返回完全一致，`if` 无意义。

**改动**：
```ts
} catch (error: unknown) {
  // L9 修复：两个分支返回完全相同，if (isBusinessError) 判断冗余，简化为单一 return
  logger.error('getStats', { msg: (error as Error)?.message })
  return handleError(error as Error, '获取统计数据失败', ERROR_CODES.DATA)
}
```
（注：`getIncomeStats` 的 catch 含**不同**错误消息且同样有效，不在 L9 范围内，保留。）

## L10 ✅ 错误日志脱敏（PII 防护）

**文件**：`index.ts`（main 入口 + 新增脱敏辅助）
**问题**：`logger.error(action, error as Error)` 中 `Error` 可能携带 `details`（含 orderId / 手机号 / openid），直接落日志会泄露 PII；`logger.info` 也明文记录 openid。

**改动**：新增 `maskOpenid` / `maskSensitive` / `toSafeLogPayload` 三个辅助：
```ts
const SENSITIVE_LOG_KEYS = ['phone', 'mobile', 'openid', 'outtradeno', 'idcard', 'email', 'address', 'id_card']
function maskOpenid(openid?: string): string { /* 前 4 位 + *** */ }
function maskSensitive(value, depth = 0): unknown { /* 递归脱敏命中键 */ }
function toSafeLogPayload(error): Record<string, unknown> { /* msg + code + 脱敏 details */ }

// main 中：
logger.info(action, { openid: maskOpenid(auth.openid) })   // 公开 action 仍为 '(public)'
logger.error(action, toSafeLogPayload(error))               // details 自动脱敏
```
命中键（phone/mobile/openid/outTradeNo/idCard/email/address）值脱敏为 `前2位***`；递归深度上限 4 防爆炸。

## L11 ✅ pendingReview 显式写 false

**文件**：`orders.ts:1344`（handleBoardingOrder）
**问题**：`pendingReview: pendingReview || undefined` 在 `false` 时写成 `undefined`（mongo 中等同不写字段），前端 `'pendingReview' in data` 类判断会出错。

**改动**：改为对象简写，显式保留字段：
```ts
status: newStatus,
pendingReview, // L11 修复：显式写入 false，避免 mongo 不写字段导致前端 'pendingReview' in data 判断出错
updatedAt: db.serverDate(),
```

---

## L 级产物核验（grep 命中点）

| 修复项 | 产物命中 | 备注 |
|---|---|---|
| L1 SUPPORTED_ACTIONS.includes | index.js ×1 | 入口 fail-fast |
| L2 const _ 死代码 | orders.js ×0 / stats.js ×0 | 已删除 ✓ |
| L3 week 周一起点 | orders.js:114 / stats.js:77 | `(getDay()+6)%7` |
| L4 days +1 注释 | orders.ts ×2 | 源注释（运行时无变化） |
| L5 amountFen +1e-6 | orders.js ×1 | |
| L6 escapeHtml | orders.js ×2 | 定义 + 调用 |
| L7 owner/organizer or | orders.js ×4 | 含 or 过滤 |
| L8 orderType==='activity' | orders.js ×1 | |
| L9 getStats catch 简化 | stats.js | isBusinessError 分支移除 |
| L10 日志脱敏 | index.js | maskSensitive ×4 / toSafeLogPayload ×2 |
| L11 pendingReview 显式 | orders.js | `|| undefined` 已移除 ✓ |

## 部署前确认（L 级追加）

13. **L3 周起点**：需与产品确认「本周」是否以周一为起点。若否，回退 L3。
14. **L7 错误码变化**：用他人 outTradeNo 查询现返回 `NOT_FOUND` 而非 `PERMISSION_DENIED`，确认客户端无差异化 UI 依赖。
15. **L10 日志系统**：脱敏辅助已兜底，但建议同步确认 CloudBase 日志后端是否另有明文落盘（如 request event 本身含 PII）。

---

# 第十二章 补偿队列消费者（H4 / M10 修复闭环）

> 用户指令「继续修复」触发。P0~L 共 33 项审查问题全部修完后，P1(H4) 修复中我自己在记录里标注的 **follow-up 遗留项** 尚有未实现部分：
> - `handleBoardingOrder` 在佣金/收入记录跨表写入失败时，已写入 `failed_operations` 集合（status='pending'），但**缺少消费者**——只写不读等于半个修复。
> - 本次把「消费者」补上，让补偿队列真正闭环。

## 设计决策：复用 `orderTimeoutService` 定时器，而非新建云函数

**备选方案对比**：
- **A. 新建 `failedOpsWorker` 云函数**：独立目录 + 自带 `common/`（35 个模块整拷）+ 新 `tsconfig.failedOpsWorker.json` + 改 `cloudbaserc.json` 注册。改动面大、部署风险高。
- **B. 在 `orderTimeoutService` 内加 `processFailedOperations` 步骤**（采用 ✅）：它已每 30 分钟定时触发，且其 `common/` 里**已包含** `commission-utils.js` / `service-income-utils.js` / `wallet-utils.js` / `alert.js`——正好补齐补偿所需全部模块。

选 B 的原因：① 复用已有定时器，零新增部署单元；② 复用与 orderService **完全相同**的补偿工具，写入逻辑天然一致；③ 符合项目「独立定时函数自带 common/」的既定惯例；④ 改动面最小，契合「简洁高效」。

## 幂等性核验（重试安全的前提）

调用前确认了 4 个底层补偿函数均**幂等**，可安全重复执行：
- `createCommissionRecord`：`hasExistingCommission(orderId, inviterId)` 先查 `tuan_commissions` 再写。
- `createServiceIncomeRecord`：`service_incomes` 按 `providerId+orderId+type` 先查再写；钱包入账 `ensureWalletBalance` 也幂等（已有记录跳过）。
- `cancelCommissionRecord` / `cancelServiceIncomeRecord`：取消类操作天然幂等。

## 改动清单（`cloudfunctions/orderTimeoutService/index.ts`）

1. **顶部 require 接入补偿模块**（cloud.init 之后，沿用 orders.ts 同款写法）：
```ts
const { createCommissionRecord, cancelCommissionRecord } = require('./common/commission-utils')
const { createServiceIncomeRecord, cancelServiceIncomeRecord } = require('./common/service-income-utils')
```
> 注：`commission-utils.js` / `service-income-utils.js` 在模块加载时**自调 `initCloud()`**（与 orders.ts 的 require 时序一致，生产已验证），在 orderTimeoutService 顶部 require 安全。

2. **新增 `FailedOpDoc` 类型 + 常量 + 两个函数**：
```ts
interface FailedOpDoc {
  _id: string
  type: string
  payload: Record<string, unknown>
  error?: { message?: string, name?: string }
  status: 'pending' | 'done' | 'failed'
  retryCount: number
  lastError?: { message?: string, at?: unknown }
  createdAt?: unknown
  updatedAt?: unknown
}
const FAILED_OP_MAX_RETRY = 5
const FAILED_OP_BATCH = 50

async function dispatchRetry(doc: FailedOpDoc): Promise<void> {
  const { type, payload } = doc
  if (type === 'create_commission') {
    await createCommissionRecord(payload.orderType || 'boarding', payload.orderSnapshot)
  } else if (type === 'cancel_commission') {
    await cancelCommissionRecord(payload.orderId)
  } else if (type === 'create_service_income') {
    await createServiceIncomeRecord(payload.organizerId, payload.business || 'boarding', payload.orderId, payload.amount, payload.orderNo, payload.description)
  } else if (type === 'cancel_service_income') {
    await cancelServiceIncomeRecord(payload.orderId, payload.business || 'boarding')
  } else {
    throw new Error(`unknown failed op type: ${type}`)
  }
}

async function processFailedOperations(): Promise<{ scanned: number, success: number, failed: number, dead: number }> {
  const res = await db.collection('failed_operations')
    .where({ status: 'pending' })
    .orderBy('createdAt', 'asc')
    .limit(FAILED_OP_BATCH)
    .get()
  const docs = (res.data || []) as FailedOpDoc[]
  let success = 0, failed = 0, dead = 0
  for (const doc of docs) {
    try {
      await dispatchRetry(doc)
      await db.collection('failed_operations').doc(doc._id).update({ data: { status: 'done', updatedAt: db.serverDate() } })
      success++
    } catch (e) {
      const next = (doc.retryCount || 0) + 1
      const status = next >= FAILED_OP_MAX_RETRY ? 'failed' : 'pending'
      if (status === 'failed') dead++
      await db.collection('failed_operations').doc(doc._id).update({
        data: { status, retryCount: next, lastError: { message: (e as Error)?.message || String(e), at: db.serverDate() }, updatedAt: db.serverDate() },
      })
      failed++
    }
  }
  return { scanned: docs.length, success, failed, dead }
}
```

3. **`main` 中接入**（在 `Promise.all` 之后、success 日志之前，独立 `try`，失败不影响超时取消逻辑）：
```ts
// H4 / M10 补偿队列闭环：消费 failed_operations 中 pending 记录并重试
try {
  const foResult = await processFailedOperations()
  logger.info('orderTimeoutService.failedOps', foResult)
  if (foResult.failed > 0) {
    await recordAlert('warning', 'failedOps.retry', `补偿队列重试存在 ${foResult.failed} 个失败（其中 ${foResult.dead} 个已达重试上限）`, foResult)
  }
} catch (foErr) {
  logger.error('orderTimeoutService.failedOps.fatal', { msg: (foErr as Error)?.message })
}
```

4. **`CloudQuery<T>` 类型补 `orderBy`**（原接口只声明了 where/field/skip/limit/get/update，缺 orderBy 导致 tsc 报错）：
```ts
interface CloudQuery<T> {
  // ... 原有方法 ...
  orderBy: (field: string, dir: 'asc' | 'desc') => CloudQuery<T>
}
```

## 编译验证

```bash
npx --yes -p typescript@5.4.5 tsc -p tsconfig.orderTimeoutService.json
# → 0 errors（修复 1 处类型错误：CloudQuery 补 orderBy）
# 产物 orderTimeoutService/index.js 已更新（17:24 时间戳）
```

## 产物核验（grep 命中）

| 修复项 | 产物命中 | 备注 |
|---|---|---|
| processFailedOperations | index.js ×2 | 定义 + main 调用 |
| dispatchRetry | index.js ×2 | 定义 + 调用 |
| failed_operations 扫描 | index.js ×5 | status='pending' + orderBy + 4 类 payload 键 |
| 4 类补偿分发 | index.js ×4 | create_commission / cancel_commission / create_service_income / cancel_service_income |
| main 接入点 | index.js ×2 | orderTimeoutService.failedOps 日志 + fatal |
| require 补偿模块 | index.js ×2 | commission-utils / service-income-utils |

## 部署前确认（补偿队列专项）

16. **`failed_operations` 复合索引**：建议在 `failed_operations` 集合建 `{ status: 1, createdAt: 1 }` 索引，支撑 `where(status:'pending').orderBy('createdAt','asc')` 的定时扫描（避免全表扫 + 游标漂移）。
17. **`orderTimeoutService` 部署**：本改动随 orderTimeoutService 一起部署；其定时器（每 30 分钟，`config.json` 的 `orderTimeoutTrigger`）即补偿队列的消费节奏。
18. **`failed` 上限告警**：单条失败超 `FAILED_OP_MAX_RETRY=5` 次后置 `status='failed'`（死信），需运维关注 `failedOps.retry` 告警；死信记录可后续人工排查或单独脚本清理。
19. **`orderTimeoutService/common/` 与 `orderService/common/` 一致性**：两者各自拷贝 `commission-utils.js` / `service-income-utils.js`。若后续只改一处，记得同步另一处，否则补偿逻辑会与主链路写入产生分歧。

## 至此 orderService 全套审查 + 补偿闭环全部完成

- 审查问题 33 项（P0×6 / P1×4 / P2×11 / L×11）✅
- H4/M10 补偿队列「生产者」（orderService 写 `failed_operations`）+「消费者」（orderTimeoutService 定时重放）✅ 完整闭环
- 唯一未自动化项：死信（`status='failed'`）的人工/脚本兜底，属运维范畴，已通过告警暴露。


