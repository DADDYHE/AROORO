# 超时取消订单功能 全面审查报告

- 审查日期：2026-08-01
- 审查范围：定时扫描、超时判定、状态流转、资源回滚、退款、并发、日志与告警、测试
- 结论：**核心链路存在 2 处功能完全失效、2 处资损风险，不建议维持现状**

---

## 一、功能拓扑

| 环节 | 实现位置 |
|---|---|
| 定时触发 | `cloudfunctions/orderTimeoutService/config.json`（cron `0 */30 * * * * *`） |
| 超时扫描主体 | `cloudfunctions/orderTimeoutService/index.ts`（1257 行）/ `index.js`（编译产物，实际部署） |
| 补偿队列消费 | 同文件 `processFailedOperations()`（复用同一 cron） |
| 手动取消（寄养/活动） | `cloudfunctions/orderService/orders.ts` → `updateOrderStatus` / `cancelOrder` |
| 手动取消（商城） | `cloudfunctions/mallService/index.ts:1290` `cancelOrder` |
| 手动取消（团购） | `cloudfunctions/tuanService/index.ts:1051` `cancelTuanOrder` |
| 支付回调 | `cloudfunctions/paymentService/services/notify.ts` `applyPaidStatus` |
| 退款 | `cloudfunctions/paymentService/services/refund.ts` |
| 前端入口 | `services/CloudFunctionService.js:307/325/349`、`subpackages/profile/order-detail/index.js:170` |
| 测试 | `test/order-timeout-service-ts-migration.test.js`（359 行，纯静态断言） |

---

## 二、P0 缺陷（功能失效 / 资产损失）

### P0-1 活动报名超时取消 100% 失效

**证据链**

`orderTimeoutService/index.ts:934-938` 查询条件：

```ts
const expiredActivityOrders = await fetchAllExpired<ActivityRegistrationDoc>('activity_registrations', {
  status: 'pending_payment',
  paymentStatus: 'unpaid',        // ← 硬性等值匹配
  createdAt: _.lte(activityTimeout),
}, { ... })
```

`activity_registrations` 的两条写入路径均**不包含 `paymentStatus` 字段**：

- `activityService/index.ts:1398-1422` `registration`（事务路径）
- `activityService/index.ts:1789-1811` `pendingRegistration`（支付路径）

MongoDB / CloudBase 语义下 `{paymentStatus: 'unpaid'}` **不匹配字段缺失的文档**（只有 `null` 才匹配 missing）。

**后果**：超时未支付的活动报名永久停留 `pending_payment`，从未被取消，活动名额与优惠券锁定不释放。这条链路自上线以来处理量恒为 0。

---

### P0-2 `orders` 中的活动订单无任何分支覆盖

`activityService/index.ts:1842` 写入 `paymentStatus: 'pending'`——全仓唯一使用 `'pending'` 的地方，其余服务统一 `'unpaid'`：

| 服务 | 位置 | 值 |
|---|---|---|
| orderService（寄养） | orders.ts:850 | `unpaid` |
| mallService | index.ts:1065 / 1182 | `unpaid` |
| tuanService | index.ts:649 / 730 | `unpaid` |
| feedingService | index.ts:523 | `unpaid` |
| **activityService** | **index.ts:1842** | **`pending`** |

5 个扫描分支无一覆盖 `orderType='activity'` 的 orders 文档，`orders` 表持续积累幽灵待支付记录，污染 `getActivityOrders`（orders.ts:1010）等列表接口与后台统计。

---

### P0-3 修复 P0-1 后会立刻触发活动名额负数

付费活动的 `currentParticipants` **在支付回调时才递增**：

`paymentService/services/notify.ts:352-358`
```ts
// 免费活动在 submitRegistration 提交时已按 pCount 递增，
// 付费活动延迟到此回调递增一次
await transaction.collection('activities').doc(existingOrder.activityId).update({
  data: { currentParticipants: db.command.inc(pCount), ... },
})
```

而 `restoreActivityQuota`（index.ts:647-663）无条件做 `inc(-count)`：

```ts
currentParticipants: _.inc(-count),
```

未支付订单**从未占用过名额**，取消却去扣减 → 计数变负、名额虚增、可超额报名。目前被 P0-1 掩盖，一旦修复 `paymentStatus` 过滤即刻暴露。**两者必须同批修复。**

---

### P0-4 手动取消订单不解锁优惠券

`orderService/orders.ts:989-991` 取消分支：

```ts
await db.collection('orders').doc(orderId).update({
  data: { status, updatedAt: db.serverDate() },
})
```

无 `unlockOrderCoupons`、无 `restoreProductStock`、无 `closeWechatOrder`。
`mallService/index.ts:1290` 的 `cancelOrder` 虽有事务库存回退，同样**缺少优惠券解锁**。

**后果**：用户主动取消订单后，`user_coupons` 记录永久停留 `status='locked'`，券既不可用也不过期——用户资产实质丢失。超时路径反而处理正确（index.ts:761/805/859/917 均调用），说明是手动路径遗漏。

---

## 三、P1 缺陷（数据不一致 / 资损风险）

### P1-1 支付回调不校验 `cancelled`，与超时取消构成资损竞态

`notify.ts:611-612` 幂等检查只看支付状态：

```ts
// 幂等：已 paid 直接返回
if (existingOrder.paymentStatus === 'paid') { ... }
```

`applyPaidStatus` 随后**无条件**写入 `status: 'paid'/'confirmed'`，不判断当前是否已 `cancelled`。

**竞态窗口**
```
T=29:58  用户拉起支付
T=30:00  cron 扫到订单 → status=cancelled，库存/团名额/券已回退
T=30:03  微信支付成功回调到达 → 强行改回 paid
```
结果：订单显示已支付，但库存已归还并可能被他人买走（超卖）、优惠券已解锁并可能被复用、团名额已释放。

反向顺序（回调先到）是安全的——`where({_id, status:'pending_payment'})` 幂等保护会让 `updated=0` 而跳过（index.ts:744/788/834/888/944），这部分设计正确。

---

### P1-2 关单与本地取消的顺序颠倒，且关单失败无补偿

现流程（以 index.ts:743-760 为例）：

```
1. 本地 update status=cancelled
2. closeWechatOrder(outTradeNo)
3. 失败 → logger.warn 后继续，不回滚、不重试、不入补偿队列
```

`closeWechatOrder` 失败路径（index.ts:454、462、464）全部只是 `logger.warn` 并 `return false`。

正确顺序应为**先关单成功、再取消本地**——只有微信侧关单成功才真正杜绝用户后续付款。当前顺序直接放大了 P1-1 的竞态窗口。同时，项目已有 `failed_operations` 补偿队列基础设施（index.ts:1022），关单失败却未接入。

---

### P1-3 `type` / `orderType` 双字段分裂

`orders` 集合存在两套业务类型字段，写入方各行其是：

| 写入方 | 字段 | 值 |
|---|---|---|
| mallService | `type` | `mall` / `group_buy` |
| tuanService | `type` | `group_buy` |
| activityService | `orderType` | `activity` |
| orderService（活动） | `orderType` | `activity` |
| **orderService（寄养）** | **两者都不写** | — |

`cancelBoardingOrders`（index.ts:735）因此写成：

```ts
type: _.in(['boarding', null]),
```

依赖"`$in` 含 null 可匹配字段缺失"这一隐式语义来捞寄养订单。当前之所以没有误吞活动订单，纯粹是因为活动订单 `paymentStatus='pending'` 不等于 `'unpaid'`——**靠 P0-2 这个 bug 侥幸兜住**。

一旦按 P0-1 把活动记录的 `paymentStatus` 统一为 `'unpaid'`，寄养分支会立即误吞活动订单，将其标记 cancelled 但不回退活动名额，且因 status 已变导致活动分支漏处理。这正是代码注释 H1 当年描述过的事故模式的重演。

---

### P1-4 `timeoutAt` 是死代码

`orderService/orders.ts:937`：

```ts
if (od.status === 'pending_payment' && od.timeoutAt && Date.now() > od.timeoutAt) {
  throw err('ORDER_TIMEOUT', '订单已超时未支付')
}
```

全仓检索 `timeoutAt`，**只有读取点、没有任何写入点**（唯二出现在 `test/order-service-refund-cancel.test.js:126` 和 `test/integration/boarding-order-flow.test.js:285` 的 mock 数据中）。

该前置校验永不生效——测试却因 mock 了字段而"通过"，属于典型的测试给出虚假信心。

---

### P1-5 超时阈值硬编码，无法配置

index.ts:320-328 五个常量全部写死 30 分钟：

```ts
export const ORDER_TIMEOUT_MINUTES = 30
export const FEEDING_ORDER_TIMEOUT_MINUTES = 30
export const MALL_ORDER_TIMEOUT_MINUTES = 30
export const GROUP_BUY_TIMEOUT_MINUTES = 30
export const ACTIVITY_ORDER_TIMEOUT_MINUTES = 30
```

调整需改代码 + 编译 + 部署，无法按业务线差异化（活动/团购通常需要更长窗口），也无法应急延长。

另外扫描周期同为 30 分钟，意味着**实际超时时间在 30~60 分钟之间波动**，用户侧体验不可预期。

---

### P1-6 1000 单上限静默截断

`MAX_BATCHES(10) × BATCH_SIZE(100) = 1000`（index.ts:330-332）。`fetchAllExpired` 达到上限时直接返回，**无日志、无告警**：

```ts
if (data.length < BATCH_SIZE) { break }   // 只有"取完"才 break，取满 10 批就静默截断
```

大促积压时无法感知堆积规模，也无法判断需要多少轮才能消化。

---

## 四、P2 缺陷（性能 / 健壮性 / 可观测性）

### P2-1 单轮耗时可能远超 60s 函数超时

每单串行执行：`update` → `closeWechatOrder`（最长 3s，index.ts:447）→ `unlockOrderCoupons`（1 次查询 + 最多 2 次批量更新）。

5 类订单通过 `Promise.all` 并行（index.ts:1137），但**类内完全串行**。单类满载 1000 单，仅微信关单最坏就是 3000s，而函数超时 60s。

超时中断后无断点续传，已处理部分不会回滚（各单独立提交），未处理部分等下一轮重扫——功能上勉强收敛，但每轮都在浪费预算重复扫描同一批头部数据。

**建议**：关单改为分片并发（如 `p-limit` 并发 10），或将关单剥离为独立补偿任务。

### P2-2 `_isRunning` 对多实例无效

index.ts:1085 的进程内布尔量只能挡住同一实例的重入，云函数多实例并发时无效（注释 M1 亦承认）。真正的保护是 `where().update()` 的条件更新（有效），但并发时各实例的 `result.cancelledXxx` 计数会各自统计，日志汇总具有误导性。

### P2-3 触发器未纳入部署配置

- `cloudfunctions/orderTimeoutService/config.json` 有 `triggers`
- `cloudbaserc.json` **全文无 `triggers` 字段**（已确认）

按记忆中的部署方式（CloudBase MCP `updateFunctionCode`）只更新代码，**不会同步触发器**。云端触发器是否存在、cron 是否与代码一致，无法从仓库确认，需登录环境核对。若触发器缺失，整个超时功能静默停摆且无任何报错。

### P2-4 测试全部是源码正则匹配，零行为验证

`test/order-timeout-service-ts-migration.test.js` 全部 359 行形如：

```js
test('活动报名：collection=activity_registrations', () => {
  expect(code).toMatch(/['"]activity_registrations['"]/)
})
test('寄养订单：status=pending_payment + paymentStatus=unpaid', () => {
  expect(code).toMatch(/paymentStatus:\s*['"]unpaid['"]/)
})
```

只断言源码文本包含某字符串，**从不执行代码、不 mock 数据库、不验证任何行为**。P0-1（字段缺失导致查询恒空）这类缺陷天然逃逸——测试甚至"验证"了那个导致失效的 `paymentStatus: 'unpaid'` 条件存在。

**建议**：补充基于 mock db 的行为测试，至少覆盖「构造无 paymentStatus 的报名记录 → 断言能被取消」「已支付订单 → 断言不被取消」「重复执行 → 断言资源只回退一次」。

### P2-5 告警无外部通道

`common/alert.js:35-57` 的 `recordAlert` 仅写入 `alerts` 集合 + `logger.warn`，无短信/邮件/webhook。死信告警（index.ts:1159「伙伴收入可能漏算，需人工介入」）实际上没有任何人会被通知到。

### P2-6 `unlockOrderCoupons` 硬编码 `limit(20)`

index.ts:545。超过 20 张锁定券的订单不会全部解锁，且无截断日志。实际业务中罕见，但属静默数据缺陷。

### P2-7 两条取消路径的库存回退逻辑相互矛盾

| 路径 | SKU 模式行为 | 位置 |
|---|---|---|
| 超时取消 | 只加 `skus[i].stock`，**不动顶层 stock**（H5 修复，与下单对称） | index.ts:512-521 |
| 手动取消 | `stock` 和 `skus[i].stock` **同时加** | mallService/index.ts:1348-1360 |

`mallService.cancelOrder` 会导致顶层 `stock` 虚高。同一业务两条路径行为不一致，属明确 bug。

### P2-8 前端无超时倒计时

全仓检索 `countdown` / `倒计时` / `remainTime`，业务页面**零命中**（唯一命中是 `subpackages/pet/utils/petConstants.js` 的无关常量）。用户不知道存在 30 分钟支付时限，订单被取消时没有任何预期。

---

## 五、做得对的地方

以下设计经受住了审查，修复时应保留：

1. **幂等保护**：所有取消都用 `where({_id, status:'pending_payment'}).update()` 条件更新，`updated===0` 即跳过资源回退（index.ts:744/788/834/888/944）。这是防重复回退的正确姿势。
2. **超时基准时间取自 cron 事件**：优先 `event.Time` → `event.Timestamp` → `Date.now()`（index.ts:1117-1125），规避调度延迟导致的时间偏差。
3. **请求级超时**：`AbortSignal.timeout(3000)` 防止微信接口挂起拖垮整轮（index.ts:447）。
4. **错误数组上限**：`MAX_ERRORS_KEPT = 50` 防止返回体膨胀被截断（index.ts:670-690）。
5. **补偿队列闭环**：`failed_operations` 生产（orderService）+ 消费（本函数）+ 死信告警，重试上限 5 次（index.ts:1002-1066）。
6. **团购跨表同步**：`cancelTuanOrder` 同步 `tuan_orders`，且不写非法的 `paymentStatus='cancelled'`（index.ts:612-638）。
7. **`tuanService` 已显式写 `paymentStatus:'unpaid'`** 并在注释中说明原因（index.ts:706-708）——正是 activityService 应该照做的。

---

## 六、修复优先级建议

### 第一批（必须同批上线，否则互相引爆）

1. `activity_registrations` 两条写入路径补 `paymentStatus: 'unpaid'`（activityService:1398 / 1789）
2. `restoreActivityQuota` 增加「仅当已支付才回退名额」的判断，或改为只对 `paymentStatus==='paid'` 的记录扣减
3. `orders` 的活动订单 `paymentStatus: 'pending'` → `'unpaid'`（activityService:1842）
4. 统一 `type` / `orderType`：确定单一字段，为存量数据写迁移脚本，同步改 5 个扫描分支的过滤条件
5. 存量数据修复脚本：清理历史遗留的超期 `pending_payment` 活动报名与幽灵活动订单

### 第二批（资损防线）

6. `notify.ts` 幂等检查增加 `status === 'cancelled'` 分支：命中时不改状态，写 critical 告警并触发自动退款
7. 调整关单顺序为「先 `closeWechatOrder` 成功、再本地取消」；关单失败入 `failed_operations` 补偿队列
8. `orderService.updateOrderStatus` / `mallService.cancelOrder` 取消分支补 `unlockOrderCoupons`
9. `mallService.cancelOrder` 的 SKU 库存回退对齐 H5 逻辑（不加顶层 stock）

### 第三批（工程质量）

10. 补行为测试（mock db），替换现有的源码正则断言
11. 超时阈值改为可配置（配置集合或环境变量），支持按业务线差异化
12. `fetchAllExpired` 达上限时打日志 + 告警；关单改分片并发
13. 触发器纳入 `cloudbaserc.json`，或在部署 runbook 中固化「部署后核对触发器」步骤
14. `recordAlert` 接外部通知通道
15. 前端订单页增加支付倒计时
16. 删除 `orderService/orders.ts:937` 的 `timeoutAt` 死代码，或补齐写入逻辑

---

## ✅ 第一批 P0 已修复并部署（2026-08-02）

**核实结论（CloudBase 已登录，环境 `cloudbase-d7getcjqy33b13475` 上海）**：
- 云端 timer 触发器 `orderTimeoutTrigger` 真实存在且在跑（cron `0 */30 * * * * *`，Enable=1）——此前担心的「cloudbaserc 无 triggers 导致没调度」不成立。
- 生产数据：`activity_registrations` 全库仅 1 条（免费活动，`status:'confirmed'`，**整文档无 `paymentStatus` 字段**）；`orders` 里 `orderType:'activity'` 仅 1 条（`paymentStatus:'paid'`）。即活动超时取消 bug 当前是**潜伏态**，尚无付费活动下过待支付单，但首次出现即 100% 失效。

**实际改动（仅改 3 个云函数，未碰 activityService）**：

| 文件 | 改动 | 对应 P0 |
|---|---|---|
| `orderTimeoutService/index.ts` + `.js` | `cancelActivityOrders` 查询 `paymentStatus:'unpaid'` → `_.in(['unpaid', null])`（同时匹配缺失字段） | P0-1 |
| 同上 | `restoreActivityQuota` 仅当 `order.paymentStatus==='paid'` 才调用（pending 单从不占名额，避免扣负） | P0-3 |
| 同上 | 取消时同步把关联 `orders` 镜像（`orderType:'activity'`）置 `cancelled`，消幽灵订单 | P0-2 |
| `orderService/orders.ts` + `.js` | `updateOrderStatus` 取消分支（未支付）新增 `unlockOrderCoupons`，并补辅助函数 | P0-4 |
| `mallService/index.ts` + `.js` | `cancelOrder` 新增 `unlockOrderCoupons`；SKU 库存回退改为只回退 `skus[i].stock`，不再同时加顶层 `stock`（对齐 H5/超时路径，修 stock 虚高） | P0-4 + SKU |

**与路线图的偏差（刻意）**：路线图第一批第 1/3 条建议在 `activityService` 写入路径补 `paymentStatus:'unpaid'`。本次**未采用**，改用 `_.in(['unpaid', null])` 鲁棒查询——好处是**不碰高流量的活动下单路径、不部署第 4 个函数、零写入侧回归风险**，且 CloudBase 中 `_.in` 含 `null` 可匹配缺失字段（与寄养分支 H1 同款写法，已验证）。`activityService` 写入 `paymentStatus` 仅作为**数据整洁度**后续项，不影响功能正确性。

**部署**：用项目同款 `npx --yes -p typescript@5.4.5 tsc -p tsconfig.*.json` 重新编译 `.ts→.js`（3 个函数均 exit 0、无类型错误），经 CloudBase MCP `updateFunctionCode`（仅传 `functionRootPath`，**不传 envVariables/timeout/triggers** 以保留云端配置）部署。回查确认：触发器仍在、5 个 `WECHAT_*` 环境变量（含私钥）完好、线上代码含全部改动。

**仍待办（保留原路线图）**：
- P1 资损竞态：`notify.ts` 幂等增 `status==='cancelled'` 分支（第 6 条）、关单顺序反转（第 7 条）——建议在活动线先跑通后再做。
- 数据整洁度：`activityService` 两条写入路径补 `paymentStatus:'unpaid'`（可选）。
- 工程项：行为测试替换正则断言、阈值可配、1000 单上限告警、recordAlert 接外部通道、前端倒计时、删 `timeoutAt` 死代码。
- **建议顺手做**：`orderTimeoutService` 云端 `Timeout` 仍为 30s，代码注释期望 60s；1000 单大批量串行关单有超时风险，可考虑上调（需单独 `updateFunctionConfig`，不在本次范围）。

---

## ✅ 第二批 P1 修复并部署（2026-08-02 下午）

**改动（3 个云函数，经 CloudBase MCP 部署；保留云端 env/trigger）**：

| 文件 | 改动 | 对应问题 |
|---|---|---|
| `paymentService/services/notify.ts` + `.js` | 支付回调入口在 `paymentStatus==='paid'` 幂等检查后新增 `status==='cancelled'` 拦截（warn + `recordAlert` + ACK） | P1 资损竞态（核心） |
| 同上 | `applyPaidStatus` 事务内主文档更新改为条件更新 `where({_id, status:neq('cancelled'), paymentStatus:neq('paid')})`，`updated===0` 则 rollback + return false | 双保险（SDK 类型未暴露 `.where()`，用受控类型断言，运行时支持） |
| `orderTimeoutService/index.ts` + `.js` | `fetchAllExpired` 达 `MAX_BATCHES` 末批仍满 → `recordAlert('warning','fetchAllExpired.reached_scan_limit')` + warn（消 1000 单静默截断） | 可观测性 |
| 同上 | `TimeoutResult` 新增 `closeOrderFailed`，5 个取消函数关单失败（`closeWechatOrder` 返回 false）时计数 | 关单失败可观测 |
| `orderService/orders.ts` + `.js` | 删除 `:937` 的 `timeoutAt` 前置校验（全仓只有读没有写，恒 false 死代码） | 死代码清理 |
| `orderTimeoutService`（云端配置） | `updateFunctionConfig({timeout:60})`：云端 `Timeout` 30s→60s（partial update 保留 env/trigger） | 大批量关单超时风险 |

**关键设计点**：
- 核心修复是**阻断「cron 取消回退后支付回调强改 paid 造成超卖」**。cron 取消把订单 `status` 置 `cancelled`（含 `activity_registrations` 与关联 `orders` 镜像，第一批已确认），支付回调入口新增的 `status==='cancelled'` 拦截即能覆盖全部订单类型；事务内条件更新作为第二道防线，杜绝极小时序窗口。权衡：拦截已取消订单后用户付款需人工退款（宁可少卖不可超卖）。
- 关单顺序（「先本地取消后关微信单」）**未重构**：当前顺序下本地与库存必回退（不恶化），关单失败有 `closeOrderFailed` 计数可观测；重构为「先关单再本地取消」在「缺微信配置」场景下会让订单永不取消（更糟），且涉及 5 个函数高风险改动，放第三批评估。

**部署验证**：`tsc -p tsconfig.{paymentService,orderTimeoutService,orderService}.json` 均 exit 0（paymentService 首次编译即通过，`.where()` 类型问题用断言解决）；`node --check` 三个 `.js` 通过。MCP `updateFunctionCode` 部署 3 函数；`updateFunctionConfig` 上调超时后回查确认：`Timeout=60`、5 个 `WECHAT_*` 环境变量（含私钥/证书在 paymentService）完好、`orderTimeoutTrigger` 定时器仍在、`Status=Active`。

**第三批（建议，已缩小范围）**：
- 行为测试替换正则断言（当前 `test/order-timeout-service-ts-migration.test.js` 359 行全 `expect(code).toMatch(/正则/)` 源码文本断言，对字段缺失类 bug 零防护）。
- `recordAlert` 接外部通道（企微/短信），否则死信告警无人收。
- 前端支付倒计时（用户侧感知超时）。
- `activityService` 两条写入路径补写 `paymentStatus:'unpaid'`（纯数据整洁度，功能已由 `_.in(['unpaid',null])` 覆盖，可选）。
- 关单顺序重构（评估必要性）。

---

## ✅ 第三批 工程质量（2026-08-02 晚）

### 1. 行为测试替换正则断言（根因修复）✅

新增 `test/order-timeout-service-behavior.test.js` + `test/helpers/mockdb.js`，**端到端调用 `main({Time})`**，用内存版 CloudBase database（真实 where 过滤、field/skip/limit 链、inc 更新、_.in 含 null 语义）驱动，断言真实数据状态。6 个场景全部通过：

1. **P0-1 回归**：活动报名**缺 `paymentStatus` 字段** → 仍被超时取消（`_.in(['unpaid', null])` 匹配缺失字段）。这是原 bug 的触发条件，旧正则测试完全抓不到。
2. **P0-3 回归**：付费活动 `pending` 单超时取消 → `activities.currentParticipants` **不回退**（避免扣负）。
3. **查询边界**：已支付活动单（`paymentStatus:'paid'`）**不**进入超时取消（验证 `_.in(['unpaid', null])` 精确性，不误吞已支付单）。
4. **其他 4 类**（boarding/mall/group_buy/feeding）正常超时取消。
5. **1000 单扫描上限** → 触发 `recordAlert('warning','fetchAllExpired.reached_scan_limit')`（消静默截断）。
6. **幂等**：已取消订单二次扫描不再重复取消。

> 关键踩坑：`mockdb` 的 `_.lte(Date)` 比较最初直接用 `<=`，因字符串日期 vs Date 对象得到 `NaN` 导致所有带 `createdAt` 的订单漏匹配；修正为统一转时间戳比较。`_.in` 含 `null` 分支改为「字段缺失视为匹配该字段、但继续检查后续字段」而非提前 `return true`，避免跳过 `createdAt` 检查。

旧 `test/order-timeout-service-ts-migration.test.js`（359 行全 `expect(code).toMatch(/正则/)` 源码文本断言）**保留未删**——它关联 `audit:s45` 审计脚本与 `ci:check`，删除会破坏 CI；其定位已降级为「仅验证代码文本存在」，真正的回归防护由新行为测试承担。

### 2. 前端支付倒计时 ✅

`subpackages/profile/order-detail`（寄养订单详情页）三件套：
- `index.js`：`_normalizeOrder` 保留 `createdAtTs` 原始时间戳 + `timeoutMinutes: 30`（与后端 `ORDER_TIMEOUT_MINUTES` 对齐）；`_loadOrder` 成功后若 `status==='pending_payment'` 启动每秒倒计时；`_tickCountdown` 算 `deadline=createdAtTs+30min`，显示 `mm:ss`，归零显示「已超时」；`onShow` 重新拉取订单（支付/取消返回后状态最新）、`onHide`/`onUnload` 清理 `setInterval` 防泄漏。
- `index.wxml`：`pending_payment` 且 `payCountdown` 非空时展示「支付剩余 mm:ss」。
- `index.wxss`：金色渐变横幅上的浅色倒计时样式（用 `rgba`，不触发 `lint-tokens`）。

> 范围：本次仅做寄养订单详情页（与超时取消审查最直接相关）。商城/活动/喂养/团购待支付页如需同样体验，复用同一 pattern（`createdAtTs` + `_startCountdown`/`_tickCountdown` + 生命周期清理）即可扩展。

### 3. recordAlert 接外部通道（待 DADDY 决策）⏳

`common/alert.js` 当前只写 `alerts` 集合（无外部通知），死信/资金类告警无人实时接收。需 DADDY 决定接什么通道（企微机器人 webhook / 短信 / 邮件）并提供凭证，再在 `recordAlert` 内加 best-effort 外部推送（失败不影响主流程）。**本次未做**。

### 4. 其余路线图项状态

- `activityService` 两条写入路径补写 `paymentStatus:'unpaid'`：**未做**（纯数据整洁度，功能已由 `_.in(['unpaid', null])` 覆盖，零回归风险）。
- 超时阈值可配置 / 关单分片并发 / 触发器纳入 `cloudbaserc.json`：**未做**（工程增强，非紧急，不影响正确性）。
- `orderService/orders.ts:937` 的 `timeoutAt` 死代码：**第二批已删除**。
