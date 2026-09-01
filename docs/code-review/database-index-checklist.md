# 数据库索引核查清单（2026-07-25）

> 指令来源：DADDY「检查索引是否正确建立」。
> 关联：orderService 审查（H2 / H4 补偿闭环）、userService 审查（M4）。
> 追加（2026-09-01）：合伙人收入聚合性能索引 4 条，见第 7 节。

## 0. 核查能力与边界（先说清）

- 本地环境**无腾讯云 SecretId / SecretKey**（`config/env.secrets.js` 仅含 `envId / appId / qqMapKey`），node-sdk 在本地无法鉴权直连数据库。
- 因此**本清单无法验证云端"索引是否已真的建上"**。它做的是：
  1. 代码层「该建什么索引、定义是否正确」的静态核查；
  2. 提供可**一键自动建立**的代码路径（已落地，见第 1.2 节）；
  3. 给 DADDY 在云控制台 / CLI 自行核对真实状态的方法（第 5 节）。
- 若需我直连云端核验，请补充 SecretId/SecretKey（或确认有 `tcb` CLI 登录态）。

## 1. 索引现状对照

项目里**唯一**的索引入口是 `cloudfunctions/adminService/services/coupon.js` 的 `initIndexes()` 函数（被 `adminService` 的 `initIndexes` super_admin action 触发）。

### 1.1 原有（coupon 系列，8 个，本次未动）

| 集合 | 索引名 | 字段 | 唯一 |
|---|---|---|---|
| coupon_templates | idx_status_createdAt | status, createdAt | 否 |
| coupon_templates | idx_applicableScopes_status | applicableScopes, status | 否 |
| user_coupons | idx_ownerId_status | ownerId, status | 否 |
| user_coupons | idx_templateId | templateId | 否 |
| user_coupons | idx_endTime_status | endTime, status | 否 |
| user_coupons | idx_status_endTime | status, endTime | 否 |
| coupon_grants | idx_executedBy_createdAt | executedBy, createdAt | 否 |
| coupon_grants | idx_templateId | templateId | 否 |

### 1.2 本次新增（业务索引，3 个，已补进 `initIndexes` 脚本）

| 集合 | 索引名 | 字段 / 方向 | 唯一 | 用途 | 代码依赖点 |
|---|---|---|---|---|---|
| orders | idx_bookingKey_unique | `bookingKey` : 1 | **是** | H2 防超卖：并发重复预订触发 `DUPLICATE_KEY` | `orderService/orders.ts:819,846` |
| failed_operations | idx_status_createdAt | `status` : 1, `createdAt` : 1 | 否 | 补偿队列定时扫描 `where(status:'pending').orderBy('createdAt','asc')` | `orderTimeoutService/index.ts` 扫描段 |
| addresses | idx_openid_isDefault | `openid` : 1, `isDefault` : 1 | 否 | M4 事务加速：`setDefault` 事务内 `where({openid,isDefault:true})` | `userService/addresses.ts` setDefault |

## 2. 两个关键澄清（避免建错 / 避免多建）

- **`bookingKey` 字段真名是小写 i**：订单文档里真实写入字段为 `bookingKey`（`orders.ts:819` → `bookingKey: \`booking_${hostId}_${startDate}_${endDate}\``）。审查报告里两处曾误写为 `bookingKey` / `BookingKey`，建索引必须用真名，否则白建。本次脚本已用真名 `bookingKey`。
- **`evaluations` 无需额外建索引**：原审查 L2 说"需确认 `evaluations.orderId` 是否有唯一索引，否则重复评价兜底不生效"。但后续 M8 修复已把评价文档 `_id` 改为**确定性** `eval_${orderId}`（`orders.ts:1521`），主键唯一性已兜底重复评价，`orders.ts:1541` 的 `DUPLICATE_KEY` 即靠 `_id` 触发。**因此 `evaluations.orderId` 字段唯一索引不再是必须项**（优于原报告判断，不必建）。

## 3. 修复的脚本 bug

- **原 `initIndexes` 的 `createIndex` 调用漏传 `unique` 字段**：每个 `idx` 声明了 `unique`，但调用写成 `createIndex({ index: { keys: idx.keys }, name })`，`unique` 没传给 SDK → 即使声明唯一也不生效。
- **已修复**：调用改为 `createIndex({ index: { keys: idx.keys, unique: idx.unique }, name: idx.indexName })`。`orders.bookingKey` 唯一索引现在能真正唯一（防超卖才有效）。
- 修复位置：`cloudfunctions/adminService/services/coupon.js` 的 `initIndexes()` 函数体内。

## 4. 结论速览

- ❌ 之前报告里建议的 3 个业务索引，**在代码层从未被任何脚本声明过**（`initIndexes` 只覆盖 coupon 系列）。即：若之前未手动在控制台建，则云端就是缺失状态。
- ✅ 本次已把 3 个业务索引**补进 `initIndexes` 并修复 unique bug**，部署后一键可建、可复现、不漏不错。
- ✅ `evaluations` 重复评价已由 M8 的确定性 `_id` 兜底，无需额外索引。

## 5. DADDY 操作指南

**方式 A — 一键建立（推荐）**
1. 部署 `adminService`（含本次 `coupon.js` 改动）。
2. 以 super_admin 身份调用 `adminService` 的 `initIndexes` action。
3. 脚本对**已存在**的索引会捕获 `'already'` 跳过，不会重复建或报错；返回 `results` 数组可逐项核对 `status`（ok / exists / error）。
4. 若 `orders.bookingKey` 返回 `error`，多半是存量有重复 `bookingKey`（见下方风险提醒）。

**方式 B — 手动建（备选）**
云控制台 → 数据库 → 对应集合 → 索引管理，按第 1.2 节定义逐条建。

**核对云端真实状态**
- 云控制台索引列表直接看；或
- 用带 SecretId/SecretKey 的 `tcb` CLI / SDK 调用 `collection.getIndexes()`。

**⚠️ 风险提醒**
建 `orders.bookingKey` 唯一索引前，先确认 `orders` 存量无重复 `bookingKey`（理论上 H2 写入即防重，但建唯一索引时若存量有重复会建失败，脚本会记 `error` 但不致命）。可在控制台用查询或一次性脚本先扫一遍。

## 6. 顺带发现（非索引，供参考）

`cloudbaserc.json` 里 `userService.timeout` 仍为 `10`，而 `userService/config.json` 已在 P0/P1 修复中改为 `20`。两者是不同配置源，若通过 `tcb` 按 `cloudbaserc.json` 部署会覆盖回 10，导致长事务（如 `addresses.setDefault` 事务、邀约统计聚合）有超时风险。建议把 `cloudbaserc.json` 的 `userService.timeout` 也改为 `20`（及 orderService 等需长耗时的函数）。

## 7. 合伙人收入聚合性能索引（2026-09-01 追加，已建并验证）

> 背景：partnerService.getMyIncomeOverview 内 15 个无索引聚合查询 → BFF 单次调用 2.2s。
> 30s 实例缓存已治标；以下 4 索引治本（已 MCP 直建落库 + 补进 initIndexes 声明）。

| 集合 | 索引名 | 字段 / 方向 | 唯一 | 覆盖查询 |
|---|---|---|---|---|
| commissions | idx_inviterId_status_createdAt | inviterId:1, status:1, createdAt:-1 | 否 | overview 佣金 4 聚合（含 monthly/today createdAt 范围）+ getMyIncomeDetails 列表 orderBy createdAt desc |
| orders | idx_organizerId_status_type_completedAt | organizerId:1, status:1, type:1, completedAt:-1 | 否 | boarding 收入 3 聚合：where({organizerId, status in[completed,finished], type:'boarding', completedAt gte}) |
| orders | idx_organizerId_status_orderType_paidAt | organizerId:1, status:1, orderType:1, paidAt:-1 | 否 | activity 收入 3 聚合：where({organizerId, status in[paid,completed], orderType:'activity', paidAt gte}) |
| feedingOrders | idx_ownerId_status_completedAt | ownerId:1, status:1, completedAt:-1 | 否 | feeding 收入 3 聚合：where({ownerId, status:'completed', completedAt gte}) |

- 核查结论：wallets 已有 `(openid,type)` 唯一索引、users 已有 `idx_inviterId_createdAt`、withdrawals 查询全走 _id 主键——均无需新增。
- 执行方式：MCP `writeNoSqlDatabaseStructure → updateCollection → CreateIndexes` 直建（RequestIds 79f7894d / 6e5b0824 / 35db53d6），约 40s 后 listIndexes 确认全部落盘（Since 2026-09-01T22:08:08）。
- 代码化声明：已补进 `cloudfunctions/adminService/services/coupon.js` initIndexes（末尾 4 条），下次部署 adminService + 跑 initIndexes action 可自愈/迁移恢复。本地 coupon.js 改动无需立即部署（索引已直建生效）。
