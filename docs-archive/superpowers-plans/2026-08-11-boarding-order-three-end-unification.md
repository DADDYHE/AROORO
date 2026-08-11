# 寄养（boarding）订单三端统一方案

> 制定日期：2026-08-11
> 目标：统一前端小程序、后端（orderService / adminService / paymentService / orderTimeoutService）、后台 web-admin 三端的寄养订单**订单状态**与**支付状态**。
> 前置：上门服务（feeding）三端统一已完成。本方案沿用其"单一状态机真值 + 三端映射对齐 + 历史迁移"的范式，但寄养作为一个独立板块，有其自身差异（**无 rejected 后台入口、无独立详情页**），需单独评审。

---

## 1. 现状盘点

### 1.1 后端存在**两套相互矛盾**的寄养状态机

| 来源 | 文件 | 初始状态 | 状态集合 | 差异点 |
|------|------|---------|---------|--------|
| 寄养家庭/用户侧操作 | `orderService/common/boarding-state-machine.ts` | `pending_payment` | pending_payment/paid/confirmed/in_progress/completed/rejected/cancelled/refunded/deleted | `reject→rejected`；有 `cancel` 操作；含 refunded/deleted 终态 |
| 后台宿主操作 | `adminService/services/stateMachine.js` 的 `BOARDING_ORDER_TRANSITIONS` | **`pending`** | pending/paid/confirmed/in_progress/completed/cancelled | **用死状态 `pending`**；缺 pending_payment/rejected/refunded/deleted；`reject→cancelled`；无 cancel |

### 1.2 关键事实

- **订单创建**（`orderService/orders.ts`）：`status='pending_payment'`、`paymentStatus='unpaid'`、`type='boarding'` ✅
- **支付回调**（`paymentService/notify.ts`，orderType=`order`）：`status='paid'`、`paymentStatus='paid'` ✅（寄养本就恢复"支付→确认"顺序，无需改动）
- **超时取消**（`orderTimeoutService.cancelBoardingOrders`）：`pending_payment` + `unpaid/paying` → `status='cancelled'`，`paymentStatus` 保持原值 ✅
- **主动取消**（`orderService.updateOrderStatus`）：未支付→`cancelled`+解锁券；已支付→走 `paymentService.createRefund` → refunding/refunded ✅

### 1.3 三端现状与问题

| 端 | 现状 | 问题 |
|----|------|------|
| 前端小程序 order-stats | `BOARDING_STATUS_TABS` 已对齐（pending_payment/paid/confirmed/in_progress/completed/cancelled） | ✅ 已完成 |
| 前端小程序 STATUS_TEXT_MAP | 已含全部状态 | ✅ |
| 前端小程序 order-detail | `STATUS_DESC_MAP` 含死状态 `pending`，缺 paid/rejected/refunded 描述 | 小项 |
| 后台 BoardingOrderList.vue | `BOARDING_STATUS = { pending:'待确认', paid, confirmed, in_progress, completed }`；fetchFn 无脑过滤 `cancelled` | **用死状态 `pending`**；缺 pending_payment/refunded；缺取消筛选 |
| 后台 AllOrdersView.vue | boarding map = pending_payment/paid/confirmed/in_progress/completed | 缺 cancelled/refunded |
| 后台寄养详情页 | **路由不存在**（BoardingOrderList `detail-route="/order/boarding"` 指向空路由） | 沿用既有决策：暂不新增功能 |

---

## 2. 统一模型（单源真值）

以 `orderService/common/boarding-state-machine.ts` 为**唯一**真值，三端全部对齐。

### 2.1 订单状态 status

```text
pending_payment → paid → confirmed → in_progress → completed
        ↓               ↓
   cancelled      rejected / cancelled
```

- 状态集合：`pending_payment / paid / confirmed / in_progress / completed`（流程态）+ `rejected / cancelled / refunded / deleted`（终态）
- 转移表（唯一）：
  - pending_payment → [paid, cancelled]
  - paid → [confirmed, rejected, cancelled]
  - confirmed → [in_progress, completed, cancelled]
  - in_progress → [completed, cancelled]
  - completed / rejected / cancelled / refunded / deleted → 终态
- 操作→目标：confirm→confirmed，reject→rejected，complete→completed，cancel→cancelled

### 2.2 支付状态 paymentStatus

```text
unpaid / paying / paid / refunded / closed
```

- 数据库写值：仅 `unpaid`（创建）、`paying`（支付中）、`paid`（回调）、`refunded`（退款完成）
- 展示归一化：`cancelled` 订单 → `closed`（除非 `refunded`）；`refunded` → `refunded`；`paid`+金额=0 → `free`（寄养无免费场景，仅为复用 `normalizePaymentStatus` 兜底）

---

## 3. 端到端流转（作为验收基线）

| 阶段 | 触发 | status | paymentStatus |
|------|------|--------|---------------|
| 创建 | 用户下单 | pending_payment | unpaid |
| 支付成功 | 微信回调 notify | paid | paid |
| 超时未付 | orderTimeoutService | cancelled | 保持 unpaid/paying |
| 主动取消（未付） | updateOrderStatus | cancelled | unpaid |
| 主动取消（已付） | createRefund | refunded（一步到位，无 refunding 中间态） | refunded |
| 商家确认 | handleBoardingOrder(confirm) | confirmed | paid |
| 商家拒绝 | handleBoardingOrder(reject) | rejected | paid |
| 完成服务 | handleBoardingOrder(complete) | completed | paid |

> 注：状态机允许 `confirmed→in_progress`，但**操作映射层**无 `start` 按钮（该操作仅喂养有），即寄养家庭/后台无把订单推进到 `in_progress` 的入口。注意 `updateOrderStatus` 是通用状态入口（直接传 status 值校验），`confirmed→in_progress` 并非绝对不可达——此标注仅限定"操作映射层无 start 按钮"，不影响结论。

---

## 4. 改动清单

### 后端（必须同步部署 orderService / adminService / paymentService / orderTimeoutService）

- **B1** `adminService/services/stateMachine.js`：重写 `BOARDING_ORDER_TRANSITIONS` 对齐唯一真值——
  - 删除死状态 `pending`
  - `pending_payment: ['paid','cancelled']`、`paid: ['confirmed','rejected','cancelled']`、`confirmed: ['in_progress','completed','cancelled']`、`in_progress: ['completed','cancelled']`、`completed/rejected/cancelled/refunded/deleted: []`
- **B2** `adminService/services/stateMachine.js`：修正 `BOARDING_STATUS_MAP`——`reject: 'rejected'`（当前误为 `'cancelled'`），`complete: 'completed'`，`confirm: 'confirmed'`，`cancel: 'cancelled'`
- **B3** 验证（无改动）：`notify.ts` 寄养分支已置 `status='paid'`；`orderTimeoutService` 超时保持 paymentStatus 不变
- **B4** 交叉校验：`adminService/hosting.js` 的 `handleBoardingOrder` 使用 B1/B2 后，`pending_payment→confirmed` 校验不再报"无法从待支付变更为已确认"（修复当前真实 bug）
- **B5 【P0 资损守卫】** `adminService/hosting.js` 的 `handleBoardingOrder`：B2 新增 `cancel` 后，必须加与 `feeding.js` 同款支付守卫，否则寄养家庭（hosting 权限）或管理员可对已支付/进行中单直接 `cancel` 置 `cancelled` 且不退钱。在 `validateTransition` 之前插入：
  ```js
  if (newStatus === 'cancelled') {
    const ps = String(orderRes.data.paymentStatus || '').toLowerCase()
    if (ps === 'paid') throw err('ORDER_STATUS_INVALID', '已支付订单无法直接取消，请申请退款')
    if (ps !== 'unpaid' && ps !== '') throw err('ORDER_STATUS_INVALID', `订单支付状态异常：${ps || '(空)'}`)
  }
  ```
  （未支付/空放行；paid 必须走退款；其他值报异常。共 5 行）

### 后台 web-admin

- **W1** `BoardingOrderList.vue`：`BOARDING_STATUS` 改为 `{ pending_payment:'待支付', paid:'已支付', confirmed:'已确认', in_progress:'进行中', completed:'已完成', cancelled:'已取消', refunded:'已退款' }`（删 `pending`，补 `pending_payment`/`refunded`/`cancelled`）；fetchFn 移除无脑过滤 `cancelled`，使默认列表开始显示已取消单（**行为变化，已在 §5 明示接受**）
- **W2** `AllOrdersView.vue`：boarding map 补 `cancelled`/`refunded`
- **W3** 寄养详情页：按既有决策**不新增**，仅保列表状态展示正确。核实发现 `OrderTable` 的"详情"按钮**无条件渲染**（与 `detail-route` 无关），仅去掉 `detail-route` 会让点击变 no-op 但按钮仍显示——需给 `OrderTable` 加 `show-detail` prop（默认 true）按需隐藏该列，并在 `BoardingOrderList` 传 `:show-detail="false"`

### 前端小程序

- **F1** `order-detail/index.js`：`STATUS_DESC_MAP` 删两个死状态 `pending` + `ongoing`（paid 描述已有），补 `rejected`/`refunded` 描述（可选，低优先）
- **F2** 验证（无改动）：order-stats `BOARDING_STATUS_TABS`、`STATUS_TEXT_MAP` 已对齐

### 历史数据迁移

- **M1** 迁移脚本 `scripts/migrate-boarding-orders.js`（dry-run + 幂等 + 只更新命中文档）：
  - 限定 `orders` 集合中 `type='boarding'` 或 `orderType='boarding'`，或（无 type 且 `bookingKey` 以 `booking_` 开头）——**严格只处理 boarding，不碰活动镜像（orderType=activity）与其他类型；`failed_operations` 集合绝不扫入**
  - 将脏状态 `pending` → `pending_payment`，同步补 `updatedAt` 与 `migrateNote`（风格与 feeding 迁移脚本一致）；**顺带把 `paymentStatus` 为 `null`/缺失的历史单补成 `unpaid`**（与创建口径一致），或在对账清单里标注这类单
  - **矛盾组合只报告不自动改**：输出人工清单——`cancelled`+`paid`（资损组合）、`rejected`+`paymentStatus≠paid`、`confirmed`+`paymentStatus≠paid`、`paid`+`paymentStatus≠paid`（注意 `paymentStatus='cancelled'` 非合法枚举，仅核查合法值与 status 的矛盾组合）

---

## 5. 风险与取舍

- **后台无寄养详情页 / 无操作按钮**：`reject` 操作实际只在寄养家庭侧（orderService）使用。B2 将 admin 的 `reject→rejected` 对齐后，后台虽无入口触发，但状态展示与校验完整，避免未来加按钮时踩坑。
- **W1 是行为变化**：去掉 fetchFn 的 `cancelled` 过滤后，后台寄养列表默认会显示已取消单（此前被隐藏）。此变化**已确认接受**；`cancelled` 筛选项与侧边栏"取消订单"页并存，无冲突。
- **pending 死状态迁移**：M1 将历史 `pending` 归一为 `pending_payment`，与订单创建一致。风险低（创建即 `pending_payment`，历史 `pending` 多为早期数据）。
- **B1/B2 与现有订单无冲突**：仅改转移表与操作映射，不触碰已落库数据；Dirty data 由 M1 处理。
- **B5 是 P0 资损修堵**：B2 新增 `cancel` 会打开"取消已支付单不退钱"路径，必须与 B5 守卫成对上线，缺一不可。守卫语义与 `feeding.js` 完全一致（paid 必须走退款；unpaid/空放行；其他报异常）。
- **三端必须同步部署**：orderService / adminService / paymentService / orderTimeoutService 涉及状态判断的云函数需同时上线，避免部分端仍用旧表。
- **编译产物**：`stateMachine.js` 为手维护文件，改完即生效；orderService 侧逻辑不变，`orders.js` 无需同步；notify/orderTimeout 无改动。

---

## 6. 已确认决策（用户审查后拍板）

1. **B2 `reject→rejected`**：✅ 同意。orderService 真值表本就支持（寄养家庭侧操作），admin 对齐是正确未来基座；即使当前无 UI 入口，也不该让 admin 表语义错误。
2. **W1 加"取消"筛选**：✅ 同意。接受默认列表显示 `cancelled` 单这一行为变化；与"取消订单"页并存无冲突。
3. **M1 迁移范围**：✅ 严格只处理 boarding。限定 `type='boarding'` / `orderType='boarding'` /（无 type 且 `bookingKey` 以 `booking_` 开头）；不碰活动镜像与其他类型；`failed_operations` 集合绝不扫入；`paymentStatus` 为 null 的历史单顺带补 `unpaid`。
4. **B5 cancel 守卫（P0）**：✅ 采纳推荐修法——B2 加 `cancel: 'cancelled'` 的同时，在 `handleBoardingOrder` 加与 `feeding.js` 同款支付守卫（paid 抛错走退款、unpaid/空放行、其他报异常），与 B2 成对上线，杜绝"取消已支付单不退钱"。