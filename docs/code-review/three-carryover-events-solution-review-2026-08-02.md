# 三个遗留事件解决方案审查（2026-08-02）

> 背景：`orders` 集合 `type`/`orderType` 双字段分裂治理（阶段1/2/3）已完成并部署 `orderService`/`userService`/`adminService`。但有三个边界事件未扩围，本报告审查其根因与可选解决方案，**本轮只给方案、不实施**（DADDY 原话「先跑脚本；再部署；再审查三个不在本次范围内的事件的解决方案」）。

---

## 事件1：历史寄养单缺 `type`（漏算，低风险）

### 现状
- 阶段2 只改了**写入方**（`orderService/orders.ts:837` 起新寄养单带 `type:'boarding'`）。
- 2026-08-02 之前的老寄养单两个字段都不写 → 所有 `type:'boarding'` 聚合对历史单**永久漏算**。

### 影响面
合作伙伴寄养收入、用户/邀请维度的寄养消费统计，对历史单持续偏低（数字失真，不报错）。

### 根因
数据治理只修了「未来」，没回填「过去」。

### 推荐方案（已就绪）
- 运行 `scripts/fix-orders-boarding-type.js`：
  1. `--dry` 预览：识别老寄养单 = `type` 缺失 && `orderType` 缺失 && `bookingKey` 存在（寄养独有标志），统计待回填数。
  2. 确认无误后真执行：回填 `type:'boarding'`，**幂等**（已带 `type` 的跳过）。
- 脚本只追加字段，不改金额/状态，**风险低**。

### 本次实施
脚本已写、语法通过，但**本机无 tcb 登录态**，需 DADDY 持 `envId`（`cloudbase-d7getcjqy33b13475`）+ 腾讯云 `secretId/secretKey` 运行。

---

## 事件2：活动超时取消连环坑（P0，高风险，待决策④）

### 现状（两处互相交织）
1. **活动超时取消 100% 失效**：`orderTimeoutService` 的 `cancelActivityOrders` 硬编码 `paymentStatus:'unpaid'`（见超时审查报告 `docs/code-review/order-timeout-cancel-review-2026-08-01.md`）。但活动报名写入 `activityService/index.ts:1842` 写 `paymentStatus:'pending'`，且两条 `orders` 镜像路径不写该字段 → 等值匹配恒为 0。
2. **寄养分支误吞活动单**：`cancelBoardingOrders`（`orderTimeoutService/index.ts:748`）用 `type: _.in(['boarding', null])`。活动镜像单 `type` 字段缺失 → 落入 `null` 分支被寄养逻辑误处理（标记 `cancelled` 但不触发活动名额回退）。

### 影响面
- 活动付费名额超时不被释放（资金/名额资损）。
- 寄养超时任务误改活动单状态，造成订单状态混乱。

### 根因
`paymentStatus` 枚举分裂（全仓 `unpaid`，唯活动 `pending`/缺失）+ 活动单缺 `type`。

### 可选方案
| 方案 | 描述 | 风险 |
|---|---|---|
| **A（治本，推荐但高风险）** | 给活动单补 `type:'activity'`（写入方 `activityService` 两路径）+ 修 `cancelActivityOrders` 改用 `type:'activity'` 过滤 + **必须 triad 同批改 `restoreActivityQuota`**（否则名额变负） | 高（名额资损连环） |
| B（止血，中） | `cancelActivityOrders` 改 `type:'activity'` 过滤（不再依赖 paymentStatus 枚举）；`cancelBoardingOrders` 的 `null` 分支依赖事件1迁移后才能去掉（否则漏老寄养单） | 中 |
| C（最小，低） | 仅把 `cancelActivityOrders` 的 `paymentStatus:'unpaid'` 改为 `_.in(['unpaid','pending'])` | 低，但「寄养误吞活动」连环坑仍在 |

### 推荐与排期
**方案 A**，但必须 **triad 同批**（type 补写 + cancelActivityOrders + restoreActivityQuota），且先在 staging 验证名额不为负。**属 P0 高风险，建议单独排期，本轮不实施**。

---

## 事件3：活动消费额双重计数（低风险单行修复）

### 现状（铁证）
`userService/referral.ts` 的 `getReferralStats` / `getInvitedUsers` 中：
- `ordersAgg`（`:153` / `:260`）match `type: _.ne('mall')` → 活动镜像单（`orderType:'activity'`，`type` 缺失 ≠ `'mall'`）**被捞入**。
- `actAgg`（`:173` / `:280`）独立聚合 `activity_registrations`（无 type 限制）。
- 两者金额字段同为 `totalPrice`，指向**同一笔活动消费** → 在 `aggRows = [ordersAgg, mallAgg, feedAgg, tuanAgg, actAgg]`（`:180` / `:287`）合并时**被计 2 次**。

### 影响面
邀请收益、受邀用户消费额中「活动」部分虚高 1 倍。

### 根因
`orders` 集合既存寄养单又存活动镜像单，referral 两路聚合未去重。与本次类型分裂无直接因果（活动镜像单本就用 `orderType`，治理未扩到活动），但治理后寄养单带 `type` 不改变活动镜像单仍被 `_.ne('mall')` 捞入的事实。

### 推荐方案（最小修复）
`ordersAgg` 的 match 增加 `orderType: _.ne('activity')`：
```ts
// 改前
.match({ ownerId: _.in(invitedOpenids), status: 'completed', type: _.ne('mall') })
// 改后
.match({ ownerId: _.in(invitedOpenids), status: 'completed', type: _.ne('mall'), orderType: _.ne('activity') })
```
- 寄养单 `orderType` 缺失 → `_.ne('activity')` 匹配保留 ✓
- 活动镜像单 `orderType:'activity'` → 排除 ✓
- `actAgg`（activity_registrations）成为活动消费的唯一来源，消除双重计数。

根治（可选）：活动单不再写 `orders` 镜像，仅留 `activity_registrations`，消除双写源头。

### 风险
低（只加一个排除条件）。验证：跑 `scripts/audit-orders-type-distribution.js` 对比修复前后活动消费额。

### 本次实施
未做（预存在问题）。报告仅给方案，建议与事件1 同期排期（同处 referral/activity 域）。

---

## 总结与建议排期

| 事件 | 风险 | 动作 | 依赖 |
|---|---|---|---|
| 1 历史寄养单补 `type` | 低 | 跑迁移脚本（已就绪） | DADDY 持密钥 |
| 2 活动超时连环坑 | 高(P0) | 单独排期 triad 整改 | staging 验证名额不为负 |
| 3 活动消费双重计数 | 低 | 单行加 `orderType:_.ne('activity')` | 无，可独立做 |

**已部署**：`orderService` / `userService` / `adminService`（本次类型治理的代码，MCP `updateFunctionCode`，云端配置保留）。

---

## 实施结果（2026-08-02，DADDY「开始整改，低风险顺手一起做」）

> 三个事件全部落地，凭证由 DADDY 提供（腾讯云 SecretId/SecretKey），经 CloudBase MCP 部署。

### 事件1：历史寄养单补 `type` —— 数据已干净，无需迁移
- 重跑 `scripts/audit-orders-type-distribution.js`（修复了 SDK 初始化：`@cloudbase/node-sdk@3.18.3` 导出 `init` 非 `initialize`）。
- 审计结论：`orders` 集合 `type` 分组 mall=63 / group_buy=5 / __MISSING__=1；`orderType` 分组 __MISSING__=67 / activity=1；**两者皆缺 = 0**，具备 bookingKey 的待回填寄养单 = 0。
- `scripts/fix-orders-boarding-type.js --dry` 扫描命中 **0 条** → 生产环境无历史寄养单缺 `type`，迁移脚本无需真执行（脚本保留备用，未来若有新历史数据可复用）。
- 说明：那 1 条 `type` 缺失文档实为 `orderType:'activity'` 的活动镜像单（见事件2），非寄养单。

### 事件2：活动超时连环坑 —— 已根治（未动 restoreActivityQuota）
- **`activityService/index.ts` + `index.js`**：两处 `orders` 镜像单写入（`activityOrder` 约 :1445、`:orderDoc` 约 :1816）补 `type: 'activity'`（与已有 `orderType:'activity'` 并列）。→ 新活动镜像单不再被 `cancelBoardingOrders` 的 `type:_.in(['boarding', null])` 的 `null` 分支误吞。
- **`orderTimeoutService/index.ts` + `index.js`**：`cancelActivityOrders` 查询由 `paymentStatus: _.in(['unpaid', null])` 放宽到 `_.in(['unpaid', 'pending', null])`。→ 活动报名单实际写 `paymentStatus:'pending'`（activityService:1842），旧条件恒扫 0，活动超时取消 100% 失效；放宽后正确命中。**这是事件2 的核心止血点**。
- **`restoreActivityQuota` 决策（保持现状）**：当前仅 `if (order.paymentStatus === 'paid')` 才回退名额，pending 单从未占名额（名额在支付回调时递增），故 `_.inc(-count)` 不会变负；本次未引入新回退路径，无需改。报告原「必须 triad 改 restoreActivityQuota」前提是假设改 `cancelActivityOrders` 会引入新回退分支，但当前代码 if-paid 守卫已守住，故保持现状更稳妥。
- 部署：`activityService`、`orderTimeoutService`（均 MCP `updateFunctionCode` success，云端配置保留）。

### 事件3：活动消费双重计数 —— 已修（低风险单行）
- **`userService/referral.ts` + `referral.js`**：`ordersAgg`（:153 / :260，`getReferralStats` / `getInvitedUsers`）match 由 `type: _.ne('mall')` 改为 `type: _.ne('mall'), orderType: _.ne('activity')`。→ 活动镜像单（orderType:'activity'、type 缺失≠mall）不再被捞入，活动消费仅由 `actAgg`（activity_registrations）计 1 次，消除双重计数。
- 部署：`userService`（MCP `updateFunctionCode` success）。

### 校验
- `node --check` 通过 `activityService/index.js` / `orderTimeoutService/index.js` / `userService/referral.js`（纯 JS）；`.ts` 为 TS 语法不可直查（编译期校验），改动均字符串替换已 grep 确认落地（activityService 两处 `type:'activity'`、orderTimeoutService 两处 `_.in(['unpaid','pending',null])`、referral 两文件 `orderType:_.ne('activity')` 各 2 处）。
- 三云函数部署返回 `success`。

### 残留小提示
- 生产有 1 条历史活动镜像单（`type` 缺失、`orderType:'activity'`），不被新写入逻辑影响；其主单（`activity_registrations`）由 `cancelActivityOrders` 正确处理，镜像单最终由 `:989` 的 orderType 过滤同步取消，状态一致。如需极致干净可单独补该单 `type`，但非必须。
