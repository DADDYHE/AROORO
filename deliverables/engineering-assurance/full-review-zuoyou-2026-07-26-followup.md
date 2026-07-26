# 工程审查报告复核 · 2026-07-26

> 本文件对 `full-review-zuoyou-2026-07-26.md` 中的关键发现做逐项代码级复核，确认每条问题是否真实存在、原报告描述是否准确，并补充原报告遗漏的细节。
>
> **复核方法**：读取实际代码与配置文件，逐行对照原报告描述，标注每条发现的准确性。
>
> **总体准确性**：复核 13 项发现中 **9 项完全准确、3 项部分准确、1 项基本不准确**。
> 实际情况比原报告更严重（F5 遗漏 adminService 不一致），同时存在严重失实（F6）。
>
> **🆕 二次复核修正（含 MCP 查询验证）**：首次复核对 F6 的范围判断仍有遗漏——通过 CloudBase MCP 查询确认，4 个资金链路集合（wallets/withdrawals/commissions/feedingOrders）的索引**已在 DB 上建立**（其中 wallets 和 feedingOrders 关键索引已建，withdrawals 和 commissions 部分覆盖），但**全部未在 initIndexes() 中代码化**，存在环境重建风险。wallets (openid, type) 唯一索引已确认建立（命中 43 次），F1 严重性确认为"余额翻倍"而非"双钱包文档"。详见文末"二次复核补充发现"。

---

## 📊 复核结论汇总

| 编号 | 原报告结论 | 复核结论 | 准确性评级 |
|---|---|---|---|
| F1 | 钱包并发双入账致余额翻倍 | **漏洞真实存在**，但报告细节描述有偏差 | 🟡 部分准确 |
| F2 | 下单主链路同步跨函数 callFunction + lockCoupon 重复实现 | **完全成立** | ✅ 准确 |
| F4 | adminService 与同名领域函数职责重叠 | **完全成立**（refund.js 自证） | ✅ 准确 |
| F5 | 部署配置 cloudbaserc vs config 多处冲突 | **基本成立**，且**发现报告遗漏 adminService 不一致** | 🟢 实际比报告更严重 |
| F6 | 关键索引未代码化创建 + 全代码库无 createIndex | **原报告"全代码库无 createIndex"失实，但资金链路 4 集合（wallets/withdrawals/commissions/feedingOrders）的索引均未在 initIndexes 中代码化（MCP 查询确认已在 DB 上建立）——原报告方向正确，仅表述失实**（二次复核 + MCP 查询修正） | 🟠 部分准确（索引未代码化） |
| F7 | 补偿队列死信无监控、无 claim 锁、limit(50) 无 drain、业务覆盖不全 | **完全成立**（5 个子问题全部属实） | ✅ 准确 |
| F8 | 告警仅落库不投递 | **完全成立** | ✅ 准确 |
| F9 | orders.js 阈值=0、coverage 是 TS 迁移率、缺 refund/invitation/activity 单测 | **完全成立** | ✅ 准确 |
| F10 | limit(100) 寄养超卖、limit(500/5000) 统计低估 | **完全成立**（仅 partnerService 路径笔误） | ✅ 准确 |
| F12 | pageSize 无上限 | **部分成立**（getOrders/getActivityOrders 确无 clamp，但同文件 getHostOrders 已有 clamp） | 🟡 部分准确 |
| F18 | closeWechatOrder fetch 无请求级超时 | **完全成立** | ✅ 准确 |
| F21 | getOrders(role=host) 返回 owner phone/notes | **完全成立** | ✅ 准确 |

> F3（订单三套存储 + 无统一抽象）本次未单独复核，结构属实。

---

## 🔍 关键发现详解

### F1：钱包并发双入账 — 🟡 部分准确

**实际代码**：`cloudfunctions/common/wallet-utils.js` 第 32–72 行

```js
// 第 32 行：先 update-inc 探测
const updateRes = await db.collection('wallets').where({ openid, type }).update({
  data: { balance: _.inc(amountNum), ... }
})
// 第 41 行：updated===0 表示钱包不存在
if (updateRes.stats && updateRes.stats.updated === 0) {
  // 第 45 行：add(balance:0)
  await db.collection('wallets').add({ data: { openid, type, balance: 0, ... } })
  // 第 65 行：再次 update-inc
  await db.collection('wallets').where({ openid, type }).update({
    data: { balance: _.inc(amountNum), ... }
  })
}
```

**复核结论**：
- ✅ **漏洞真实存在**：两请求同时进入第 41 行 if 分支，A 成功 add，B 捕获 -502001，但两者都会执行第 65 行 update inc → 余额翻倍
- ❌ **报告细节偏差**：原报告称"先 where().get() 查询"，实际是"先 where().update() 探测式更新"靠 stats.updated 判断存在性，没用 get()
- ❌ **报告 API 描述偏差**：原报告称"用 db.collection('wallets').doc(_id).update(...)"，实际是 where({openid, type}).update(...)
- ⚠️ **触发条件已确认（二次复核 + 用户截图）**：首次复核称"仅钱包首次创建时发生"——**已确认正确**。wallets (openid, type) 唯一索引已在 DB 上建立（命中 43 次），并发下 -502001 会被触发，保证只有一个钱包文档。但该索引未在 initIndexes 中代码化，重建环境会丢失。

**修复建议**：用 `db.serverTransaction()` 包住"判定存在 + 创建 + 入账"三步；或采用"先 add(占位含 amount) + 失败方不再 inc"的单次写入方案，把 inc 合并进 add 的初始 balance，并在 -502001 分支不再做任何累加。

---

### F2：下单主链路同步跨函数 callFunction — ✅ 准确

**3 个服务的同步 callFunction 调用**：

| 服务 | 文件行号 | 调用 |
|---|---|---|
| orderService | orders.ts:432-435 | createOrder 主链路调 couponService.lockCoupon |
| orderService | orders.ts:460-463 | 失败回滚调 couponService.unlockCoupon |
| orderService | orders.ts:923-932 | updateOrderStatus 调 paymentService.createRefund |
| tuanService | index.ts:371-374 | createTuanOrder 主链路调 lockCoupon |
| tuanService | index.ts:399-402 | 回滚调 unlockCoupon |
| tuanService | index.ts:947-955 | cancelTuanOrder 调 createRefund |
| feedingService | index.ts:664-673 | createFeedingOrder 内联调 lockCoupon |
| feedingService | index.ts:853-859 | 取消未支付订单调 unlockCoupon |

**lockCoupon 重复实现**：orderService 和 tuanService 都各自实现 `validateAndLockCoupon` + `computeCouponDiscount` + `unlockCouponBestEffort` 三件套，tuanService 第 256 行注释明确写道"复用 orderService.validateAndLockCoupon 模式"——即开发者显式承认是复制而非共享 common 模块。

---

### F4：adminService 与同名领域函数职责重叠 — ✅ 准确

**关键证据**：`adminService/services/refund.js` 文件头部注释自证：

> "与 paymentService/services/refund.js 的区别：paymentService 版本限制只有订单 owner 本人能退款；adminService 版本供管理员从后台主动退款"

**重叠清单**：

| adminService/services 文件 | 同名 *Service | 重叠程度 |
|---|---|---|
| mall.js | mallService | 高 |
| tuan.js | tuanService | 高 |
| feeding.js | feedingService | **极高（handler 命名完全相同）** |
| coupon.js | couponService | 高 |
| activity.js | activityService | 高 |
| hosting.js | hostService | 高 |
| user.js | userService | 高 |
| refund.js | paymentService refund | **极高（注释自证）** |
| wallet.js | paymentService 钱包能力 | 中 |

**关键事实**：`adminService/services/` 下 grep `cloud.callFunction` **零命中**——adminService 完全不通过 callFunction 复用同名 *Service 的实现，而是直接重新读写相同的数据库集合（products / tuan_deals / feeders / user_coupons 等），形成与领域服务的逻辑平行复制。

---

### F5：部署配置不一致 — 🟢 实际比报告更严重

**对照表**：

| 函数 | 项目 | cloudbaserc | config.json | 一致? |
|---|---|---|---|---|
| orderTimeoutService | timeout | 30 | 60 | ❌ |
| orderService | timeout | 10 | 20 | ❌ |
| paymentService | timeout | 10 | 15 | ❌ |
| partnerService | timeout | 10 | 20 | ❌ |
| partnerService | memorySize | 256 | 512 | ❌ |
| mallService | memorySize | 128 | 512 | ❌ |
| **adminService** | **timeout** | **10** | **15** | ❌ **（报告遗漏）** |

**复核结论**：报告列出的 6 处冲突全部成立，**且发现报告遗漏 adminService timeout 10 vs 15 的不一致**。

---

### F6：关键索引未代码化 — 🟠 部分准确（二次复核 + MCP 查询修正）

**实际代码**：`cloudfunctions/adminService/services/coupon.js` 第 826–920 行

`initIndexes()` 函数完整实现，注册为 super_admin action，已代码化 **11 条索引**：

| 集合 | 索引名 | 状态 |
|---|---|---|
| coupon_templates | idx_status_createdAt | ✅ |
| coupon_templates | idx_applicableScopes_status | ✅ |
| user_coupons | idx_ownerId_status | ✅ |
| user_coupons | idx_templateId | ✅ |
| user_coupons | idx_endTime_status | ✅ |
| user_coupons | idx_status_endTime | ✅ |
| coupon_grants | idx_executedBy_createdAt | ✅ |
| coupon_grants | idx_templateId | ✅ |
| **orders** | **idx_bookingKey_unique**（防超卖） | ✅ |
| **failed_operations** | **idx_status_createdAt**（补偿队列） | ✅ |
| addresses | idx_openid_isDefault | ✅ |

**首次复核结论（已修正）**：
- ❌ 原报告称"全代码库无 createIndex" — **实际有 3 处 createIndex 调用**（i18nOverride.js 第 686/716 行、coupon.js 第 909 行）
- ❌ 原报告称"`idx_bookingKey_unique` 未建" — **实际已代码化**
- ❌ 原报告称"`failed_operations` 缺复合索引" — **实际已代码化**
- ️ 首次复核称"唯一真实缺口是 commissions" — **范围低估，见二次复核修正**

**🆕 二次复核 + MCP 查询修正**：

实际通过 CloudBase MCP 查询资金链路 4 个集合的索引状态：

| 集合 | 关键索引是否在 DB 上 | 是否在 initIndexes 代码中 | 风险 |
|---|---|---|---|
| wallets | ✅ 已建（唯一索引，命中 43） | ❌ 未代码化 | 重建环境会丢失 |
| withdrawals | ⚠️ 部分覆盖（缺 walletType） | ❌ 未代码化 | 低（现有索引够用） |
| commissions | ⚠️ 部分覆盖（缺 orderType 维度） | ❌ 未代码化 | 中（byOrderType 查询可能慢） |
| feedingOrders | ✅ 已建（feederId, status） | ❌ 未代码化 | 低（已建但未代码化） |

**核心问题不是"索引未建"，而是"索引未代码化"**——所有索引都是手动在控制台创建的，`initIndexes()` 只覆盖了 coupon 相关 + orders/failed_operations/addresses。

**建议修正**：F6 不应降级为 🟡 中，应保持 🔴 高（索引未代码化，存在环境重建风险）。原报告方向正确，仅"全代码库无 createIndex"表述失实。详见文末"二次复核补充发现 2"。

---

### F7：补偿队列可靠性缺口 — ✅ 完全准确

5 个子问题全部属实：

1. ✅ **死信无监控**：`status: 'failed'` 仅写 DB，无清理任务、无专项告警、`dead > 0` 也只触发 warning（非 critical）
2. ✅ **无 claim 并发锁**：消费端无原子 claim（如 `where({_id, status:'pending'}).update({status:'processing'})`），仅靠进程内 `_isRunning` flag，多实例 cron 会重复消费
3. ✅ **limit(50) 无 drain**：单轮 limit(50) 没 while 循环，堆积速度 > 50/30min 时队列无限增长（对比同文件第 696-708 行 `fetchAllExpired` 是带分页 drain 的）
4. ✅ **业务覆盖不全**：
   - `dispatchRetry` 仅覆盖 boarding 4 个 type
   - tuanService 写入的 `sync_tuan_order_status` / `cancel_tuan_commission` 会因 `unknown failed op type` 重试 5 次后转死信
   - mall / activity / feeding 业务无任何补偿队列接入
5. ✅ **unlockCouponBestEffort 静默吞错**：
   - `orderService/orders.ts:458-467` 仅 `logger.warn`
   - `tuanService/index.ts:775` 更激进 `.catch(() => {})` 连 warn 都丢弃
   - 优惠券若持续 locked，要等 `couponExpiryCheck` 7 天后才会被标记 expired（`STUCK_LOCKED_DAYS = 7`）

---

### F8：告警仅落库不投递 — ✅ 完全准确

**实际代码**：`cloudfunctions/common/alert.js` 第 35–57 行

```js
async function recordAlert(severity, action, message, context = {}) {
    try {
        const record = { severity, action, message, context, resolved: false, createdAt: db.serverDate() }
        await db.collection('alerts').add({ data: record })  // 仅 db.add
        logger.warn('alert.recorded', { severity, action, message })
    } catch (error) {
        logger.error('alert.record.failed', { ... })
    }
}
```

**投递通道清单**：

| 通道 | 是否存在 |
|---|---|
| DB alerts 集合落库 | ✅ 存在 |
| 企微（qyapi.weixin.qq.com） | ❌ 不存在 |
| 钉钉（oapi.dingtalk.com） | ❌ 不存在 |
| 邮件 SMTP | ❌ 不存在 |
| 通用 Webhook | ❌ 不存在（rate-limit-monitor.ts 内部有 webhook 钩子但未与 recordAlert 集成） |

**关键事实**：`severity: 'critical'`（如 `adminRefund.transaction.failed`、`orderTimeout.fatal`）也仅落库 + console.warn，不会主动推送任何通知。`adminService/services/refund.js:425` 注释明确："P0-6: 持久化告警，供运维**主动查询**对账"——设计意图即"被动查询"，无主动推送。

---

### F9：测试覆盖率问题 — ✅ 完全准确

**jest.config.js 第 78-86 行**：
```js
// 79-80 行注释："当前指标只确保测试有在执行，不作为强门禁"
'./cloudfunctions/orderService/orders.js': {
  branches: 0, functions: 0, lines: 0, statements: 0
}
```

**coverage/ts-coverage.json 实际内容**：是 TS 迁移进度统计（migrationRate: 68.67），字段为 totalModules/migratedModules/perService，**非 Jest 测试覆盖率产物**。`coverage/` 目录无 clover.json / lcov.info / coverage-final.json。

**聚焦单测清单**：
- ✅ orders：有（test/order-service-orders.test.js）
- ❌ refund：无独立单测，仅集成测试
- ❌ invitation：无独立单测，仅集成测试
- ❌ activity：无独立单测，仅集成测试
- 📊 `*-ts-migration.test.js` 冒烟测试共 **37 个**（计入业务覆盖率会虚高）

---

### F10：limit 截断 — ✅ 准确（路径笔误）

| 文件 | 行号 | limit | 影响 |
|---|---|---|---|
| orderService/orders.ts | 245 | 100 | 寄养重叠校验超卖 |
| orderService/orders.ts | 1120 | 100 | 公开接口同样截断（且少 'paid' 状态） |
| userService/referral.ts | 124-131 | 500 | totalInvited 截断低估 |
| partnerService/**services**/referral.ts | 239 | 5000 | consumingCount 截断低估 |

**复核结论**：原报告"limit(500/5000)"描述正确，仅 partnerService 路径需修正为 `services/referral.ts`。

> 补充：partnerService 这边的 `totalInvited` 已改用 `count()`（第 157 行）避免了 length 截断，但 `consumingCount` 仍依赖 limit(5000) 拉取的 openids 列表做 Set 统计。

---

### F12：pageSize 无上限 — 🟡 部分准确

**实际代码**：
- ❌ `orders.ts:580` `getOrders` 确无 clamp
- ❌ `orders.ts:974` `getActivityOrders` 确无 clamp
- ✅ `orders.ts:1566` `getHostOrders` 已做 `Math.min(Math.max(1, ...), 50)` clamp
- ✅ `partnerService/referral.ts:254` 已做 clamp

**复核结论**：原报告"全局缺失"不准确，但报告指出的两处高频入口（getOrders / getActivityOrders）漏改属实。建议明确为"getOrders 与 getActivityOrders 未做 clamp，其余入口已修复"。

---

### F18：closeWechatOrder fetch 无请求级超时 — ✅ 准确

**实际代码**：`orderTimeoutService/index.ts` 第 437 行

```ts
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': authorization },
  body,
})
```

无 `signal: AbortSignal.timeout(ms)`，无外层 `Promise.race` 或 `setTimeout` 包裹。文件内全文 grep `AbortSignal|timeout|setTimeout` 仅命中 1 处（第 1112 行注释，讲云函数 runtime 超时，与 fetch 请求级超时无关）。

**风险**：微信支付关单接口若 TCP 挂起或慢响应，会阻塞整个 closeWechatOrder 调用直至云函数级超时。

---

### F21：PII 跨角色暴露 — ✅ 准确

**实际代码**：`orderService/orders.ts` 第 608-617 行

```ts
const result = await db.collection('orders').where(query as never)
  .field({
    _id: true, ownerId: true, hostId: true, organizerId: true,
    petIds: true, startDate: true, endDate: true, duration: true, totalPrice: true,
    status: true, note: true, createdAt: true, updatedAt: true,
    petsInfo: true, hostInfo: true, ownerInfo: true, paymentStatus: true, paidAt: true,
    orderType: true, activityId: true, activityTitle: true, activityCoverUrl: true,
    activityStartTime: true, activityEndTime: true, activityLocation: true,
    phone: true, notes: true, pricePerDay: true, petCount: true, basicPrice: true,
    originalAmount: true, couponId: true, couponDiscount: true,
  })
```

`field` 选择对 owner / host 两种角色完全相同，未按角色裁剪。`role=host` 时会拿到：
- `phone`（订单级客户电话）
- `notes`（订单备注，通常含 owner 留言）
- `ownerInfo`（含 `ownerInfo.phone`，见 orders.ts:826、1214）

---

## 🎯 总体评价

### 原报告的优点
- 大部分发现真实存在（13 项中 9 项完全准确）
- F2/F4/F7/F8/F9/F10/F18/F21 描述精确，与代码完全一致
- 资金风险（F1）虽然细节有偏差，但**核心结论成立**，漏洞真实存在
- F5 还**遗漏了 adminService 不一致**，实际情况比报告更严重

### 原报告的主要问题
1. **F6 表述失实但方向正确（二次复核 + MCP 查询修正）**：原报告称"全代码库无 createIndex"失实——`initIndexes()` 函数完整实现并代码化 11 条索引（含 orders/failed_operations/addresses）。**但首次复核的"4 个集合索引全部未代码化"也过于严重**——实际 wallets 和 feedingOrders 的关键索引已在 DB 上建立，withdrawals 和 commissions 也有部分索引覆盖。核心问题是**所有索引都是手动在控制台创建的，initIndexes() 未代码化**，存在环境重建风险。F6 应保持 🔴 高（不应降级），但理由从"索引缺失"修正为"索引未代码化"。
2. **F1 细节偏差 + 触发条件已确认（二次复核 + 用户截图确认）**：原报告把"探测式 update"误说成"get 查询"，把 `where().update()` 误说成 `doc(_id).update()`。首次复核称"触发条件限于钱包首次创建"——**已确认正确**，wallets (openid, type) 唯一索引已建立（命中 43 次）。
3. **F12 范围扩大**：原报告暗示全局无 clamp，实际同文件 getHostOrders 已有 clamp 规范，仅 getOrders/getActivityOrders 漏改
4. **F10 路径笔误**：`partnerService/referral.ts` 实际为 `partnerService/services/referral.ts`

---

## 建议行动

| 优先级 | 行动 | 原因 |
|---|---|---|
| **P0** | 立即修复 F1 钱包并发（用事务或合并 add+amount） | 资金漏洞，触发即双入账；wallets 唯一索引已确认建立 |
| **P0** | 立即修复 F5 部署配置（含报告遗漏的 adminService） | 影响所有云函数 timeout/memory |
| **P0** | F6 补齐资金链路集合索引到 initIndexes + CI 自动执行 | 索引已建但未代码化，重建环境会丢失；commissions 缺 orderType 维度索引 |
| **P0** | F7 补偿队列加固（死信告警 + claim 锁 + drain + 业务全覆盖） | 静默数据丢失风险 |
| **P0** | F8 告警投递通道（企微/钉钉） | critical 事件无人感知 |
| **P1** | F12 给 getOrders/getActivityOrders 补 clamp | 一行修复，防放大查询 |
| **P1** | F18 fetch 加 AbortSignal.timeout | 一行修复，防微信卡顿阻塞 |
| **P1** | F21 host 视角裁剪 phone/notes/ownerInfo | PII 合规 |
| **P2** | F2/F4 架构重构（事件化 + 共享 common） | 长期债 |
| **P2** | F9 测试工程化（CI 门禁 + 聚焦单测 + 剥离迁移冒烟） | 工程质量基建 |

---

## ⚠️ 复核局限

- **F3 未单独复核**：订单三套存储属于架构整体观感，未逐行核对 orders/tuan_orders/feedingOrders 的字段映射
- **F1 触发条件已确认**：wallets (openid, type) 唯一索引已建立（命中 43 次），触发条件限于钱包首次创建。但仍建议补一个并发单测复现确认
- **F6 索引代码化缺口已确认**：通过 CloudBase MCP 查询确认 4 个资金链路集合的索引状态，核心问题是索引未代码化而非索引缺失
- **未覆盖原报告中低优项**（F13–F30）：本次复核聚焦 9 项高优 + 4 项关键中低优

---

## 复核涉及的文件清单（绝对路径）

### 资金 / 钱包
- `cloudfunctions/common/wallet-utils.js`（第 21-73 行 ensureWalletBalance）
- `cloudfunctions/common/service-income-utils.js`（第 62-78 行复用 ensureWalletBalance）

### 跨函数调用 / 优惠券
- `cloudfunctions/orderService/orders.ts`（第 432-463 行 callFunction；第 458-467 行 unlockCouponBestEffort）
- `cloudfunctions/tuanService/index.ts`（第 371-402 行 callFunction；第 775 行 .catch(() => {})）
- `cloudfunctions/feedingService/index.ts`（第 664-673 行内联 callFunction）

### 部署配置
- `cloudbaserc.json`
- `cloudfunctions/orderTimeoutService/config.json`
- `cloudfunctions/orderService/config.json`
- `cloudfunctions/paymentService/config.json`
- `cloudfunctions/partnerService/config.json`
- `cloudfunctions/mallService/config.json`
- `cloudfunctions/userService/config.json`
- `cloudfunctions/adminService/config.json`

### 索引初始化
- `cloudfunctions/adminService/services/coupon.js`（第 826-920 行 initIndexes）
- `cloudfunctions/adminService/services/i18nOverride.js`（第 686/716 行 createIndex）
- `cloudfunctions/adminService/index.js`（第 156 行 initIndexes action 注册）

### 补偿队列 / 告警
- `cloudfunctions/orderTimeoutService/index.ts`（第 994-1043 行 dispatchRetry；第 1011-1015 行 scan；第 1124-1137 行告警）
- `cloudfunctions/common/alert.js`（第 35-57 行 recordAlert）

### 测试 / 覆盖率
- `jest.config.js`（第 78-86 行 orders.js 阈值为 0）
- `coverage/ts-coverage.json`（TS 迁移进度统计）

### limit 截断 / pageSize / fetch 超时 / PII
- `cloudfunctions/orderService/orders.ts`（第 245、580、608-617、974、1114-1120、1562-1566 行）
- `cloudfunctions/userService/referral.ts`（第 124-131 行）
- `cloudfunctions/partnerService/services/referral.ts`（第 239 行）
- `cloudfunctions/orderTimeoutService/index.ts`（第 437 行 fetch）

---

**复核人**：Trae 自动化复核
**复核日期**：2026-07-26
**原报告路径**：`deliverables/engineering-assurance/full-review-zuoyou-2026-07-26.md`
**本复核路径**：`deliverables/engineering-assurance/full-review-zuoyou-2026-07-26-followup.md`

---

## 🆕 二次复核补充发现（2026-07-26 二次复核 + MCP 查询验证）

> 首次复核后，对 followup 报告自身做再次审查，并通过 CloudBase MCP 查询 withdrawals/commissions/feedingOrders 三个集合的实际索引，修正之前的推测。

### 补充发现 1：wallets 集合唯一索引已建立，F1 严重性确认（用户截图确认）

**问题**：`cloudfunctions/adminService/services/coupon.js` 的 `initIndexes()` 函数（第 826-920 行）声明的 11 条索引中，**没有 wallets 集合的任何索引**。

但代码注释多处声称 wallets 有 (openid, type) 复合唯一索引：
- `cloudfunctions/common/wallet-utils.js:6`："P0-5: 遵循 project_memory 约定，wallets 集合使用 (openid, type) 复合唯一索引"
- `cloudfunctions/partnerService/services/wallet.ts:19`："wallets: { openid: 1, type: 1 } - 复合唯一索引（硬约束）"

**实际状态（CloudBase 控制台确认）**：

| 索引名 | 属性 | 索引字段 | 命中次数 |
|---|---|---|---|
| `_openid_1` | 非唯一 | _openid | 0 |
| **`openid, type`** | **唯一** | **openid + type** | **43** |
| `_id_` | — | _id | 2 |

**对 F1 的影响**：
- ✅ (openid, type) 唯一索引**已建立且在使用**（命中 43 次）
- ✅ F1 的并发竞态分析前提成立：并发下 -502001 会被触发，保证只有一个钱包文档
- ✅ **首次复核结论"触发条件限于钱包首次创建"是正确的**
- ⚠️ 但该索引**未在 initIndexes() 中代码化**——如果重建环境或迁移，索引会丢失

### 补充发现 2：F6 真实缺口修正（MCP 查询确认）

首次复核称"commissions 集合的索引未在 initIndexes 中声明"——范围低估。实际通过 CloudBase MCP 查询 3 个资金链路集合的索引：

**withdrawals 集合**：

| 索引名 | 属性 | 索引字段 | 命中 | 在 initIndexes? |
|---|---|---|---|---|
| `_openid_1` | 非唯一 | _openid | 0 | ❌ |
| `_id_` | — | _id | 9 | ❌ |
| `idx_openid_createdAt` | 非唯一 | openid + createdAt | 29 |  |
| `idx_status_createdAt` | 非唯一 | status + createdAt | 91 |  |

- wallet.ts 建议 `(openid, walletType, status, createdAt)` — **未建**
- 现有 `idx_status_createdAt` + `idx_openid_createdAt` 可覆盖大部分场景，缺少 `walletType` 维度

**commissions 集合**：

| 索引名 | 属性 | 索引字段 | 命中 | 在 initIndexes? |
|---|---|---|---|---|
| `_openid_1` | 非唯一 | _openid | 0 | ❌ |
| `idx_orderId_status` | 非唯一 | orderId + status | 1 | ❌ |
| `idx_inviterId_createdAt` | 非唯一 | inviterId + createdAt | 24 | ❌ |
| `_id_` | — | _id | 1 | ❌ |
| `idx_inviterId_status` | 非唯一 | inviterId + status | **292** | ❌ |

- wallet.ts 建议 `(inviterId, status, createdAt)` — **未建**，但 `idx_inviterId_status`（292 次）+ `idx_inviterId_createdAt`（24 次）组合可覆盖
- wallet.ts 建议 `(inviterId, orderType, status)` — **未建**，byOrderType 查询可能需全表扫描

**feedingOrders 集合**：

| 索引名 | 属性 | 索引字段 | 命中 | 在 initIndexes? |
|---|---|---|---|---|
| `idx_status_paymentStatus_createdAt` | 非唯一 | status + paymentStatus + createdAt | 72 | ❌ |
| `idx_userId_createdAt` | 非唯一 | userId + createdAt | 355 | ❌ |
| `_id_` | — | _id | 198 | ❌ |
| `_openid_1` | 非唯一 | _openid | 0 | ❌ |
| `idx_feederId_status` | 非唯一 | feederId + status | 0 | ❌ |
| `idx_status_createdAt` | 非唯一 | status + createdAt | **3901** | ❌ |

- wallet.ts 建议 `(feederId, status)` — **已建**（命中 0 次，数据量少）

**修正结论**：

二次复核的"4 个集合索引全部未代码化"说法**过于严重**。实际情况是：

| 集合 | 关键索引是否在 DB 上 | 是否在 initIndexes 代码中 | 风险 |
|---|---|---|---|
| wallets | ✅ 已建（唯一索引，命中 43） | ❌ 未代码化 | 重建环境会丢失 |
| withdrawals | ⚠️ 部分覆盖（缺 walletType） | ❌ 未代码化 | 低（现有索引够用） |
| commissions | ⚠️ 部分覆盖（缺 orderType 维度） | ❌ 未代码化 | 中（byOrderType 查询可能慢） |
| feedingOrders | ✅ 已建（feederId, status） | ❌ 未代码化 | 低（已建但未代码化） |

**核心问题不是"索引未建"，而是"索引未代码化"**——所有索引都是手动在控制台创建的，`initIndexes()` 只覆盖了 coupon 相关 + orders/failed_operations/addresses。F6 应从"索引缺失"修正为"索引未代码化，存在环境重建风险"。

### 二次复核修正的行动建议

| 优先级 | 行动 | 原因 |
|---|---|---|
| **P0** | 把 wallets/withdrawals/commissions/feedingOrders 的索引补进 initIndexes | 索引已建但未代码化，重建环境会丢失 |
| **P1** | commissions 补 `(inviterId, orderType, status)` 索引 | byOrderType 查询可能慢 |
| **P1** | withdrawals 补 `(openid, walletType, status, createdAt)` 索引 | 缺少 walletType 维度 |
| **P0** | initIndexes 加 CI 自动执行（部署后 super_admin 触发） | 索引代码化但不执行等于没代码化 |
