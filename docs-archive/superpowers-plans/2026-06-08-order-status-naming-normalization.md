# 订单系统命名规范化计划

> 制定日期：2026-06-08
> 调研基础：前序会话订单状态体检报告（user_input: "订单状态显示的是待确认"）
> 实施前提：Sprint 57-58 数据同步修复已完成（orderTimeoutService 新增 `cancelTuanOrder`）

---

## 1. 现状盘点

订单系统目前有 **3 个混淆点** 导致语义不清：

| 混淆 | 现状 | 后果 |
|------|------|------|
| **订单状态 vs 支付状态共用 `pending`** | 订单 `status='pending'`（待确认）<br>支付 `paymentStatus='pending'`（支付中） | 同一英文，两种语义，前端 label 也撞（"待确认" / "支付中"）|
| **支付状态多版本** | `pending` / `paying` / `paid` / `unpaid` / `refunded` / `failed` / `partial_refunded` | 历史遗留，3 种"已支付"路径，`unpaid` 和 `pending_payment` 重复 |
| **tuan_commissions 表名误导** | 表里是全平台通用邀请返佣，**不限于团购** | activity / mall / partner 都在写，但表名带 "tuan" 让人误解 |

### 1.1 订单状态枚举（实际使用 9 个）

```text
order.status:
  pending            // 待确认（寄养/喂养/团购）
  pending_payment    // 待支付（商城/喂养/活动）
  paid               // 已支付
  confirmed          // 已确认
  shipped            // 已发货（商城）
  in_progress        // 进行中（寄养/喂养）
  completed          // 已完成
  cancelled          // 已取消
  rejected           // 已拒绝（喂养）
```

### 1.2 支付状态枚举（实际使用 7 个）

```text
order.paymentStatus:
  unpaid             // 未支付
  pending            // 支付中 ⚠️ 与订单状态 pending 冲突
  paying             // 支付中 ⚠️ 与 pending 同义重复
  paid               // 已支付
  failed             // 支付失败
  refunded           // 已退款
  partial_refunded   // 部分退款
```

### 1.3 集合命名问题

| 集合名 | 实际用途 | 问题 |
|--------|----------|------|
| `tuan_orders` | 仅团购订单子表 | OK（范围准确）|
| `tuan_commissions` | **全平台邀请返佣** | ❌ 命名误导（应在 plan 范围外，本次只标记）|
| `tuan_deals` | 团购档期 | OK |

---

## 2. 规范化目标

| 维度 | 现状 | 目标 | 收益 |
|------|------|------|------|
| 订单 `status` 与支付 `paymentStatus` 重名 | `pending` 两义 | 改名 `awaiting_confirm` 区分 | 前端 label 不撞 / grep 友好 |
| 支付状态双重写法 | `pending` / `paying` | 统一 `paying`（active gerund）| 减少 if-else 分支 |
| 支付状态冗余值 | `unpaid` vs `pending_payment` | 订单用 `pending_payment`，支付用 `unpaid` | 职责分明 |
| 状态转移表定义位置 | 散落在 `services/stateMachine.js` 注释里 | 统一到 `common/order-state-machine.ts` | 单源 + 类型安全 |
| `tuan_commissions` 命名 | 见 1.3 | **不在本计划范围**，仅记录 TODO | 跨 6 服务迁移，留作下个 sprint |

---

## 3. 完整目标枚举（5 张表）

### 3.1 订单状态 OrderStatus（10 个，含终态）

```ts
// common/order-state-machine.ts
export const OrderStatus = {
  // 中间态
  AwaitingConfirm:   'awaiting_confirm',  // 旧 pending
  AwaitingPayment:   'awaiting_payment',  // 旧 pending_payment
  Paid:              'paid',
  Confirmed:         'confirmed',
  Shipped:           'shipped',           // 商城
  InProgress:        'in_progress',
  // 终态
  Completed:         'completed',
  Cancelled:         'cancelled',
  Rejected:          'rejected',          // 喂养
  Refunded:          'refunded',
} as const
export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus]
```

### 3.2 支付状态 PaymentStatus（6 个，统一 ing 形式）

```ts
export const PaymentStatus = {
  Unpaid:         'unpaid',
  Paying:         'paying',              // 合并旧 pending
  Paid:           'paid',
  PayFailed:      'pay_failed',          // 旧 failed
  Refunded:       'refunded',
  PartialRefunded:'partial_refunded',
} as const
```

### 3.3 状态转移矩阵

```ts
// 寄养（HOSTING）
const HOSTING: Transition = {
  awaiting_confirm: ['confirmed', 'cancelled'],
  paid:             ['confirmed', 'cancelled'],
  confirmed:        ['in_progress', 'cancelled'],
  in_progress:      ['completed', 'cancelled'],
}

// 喂养（FEEDING）
const FEEDING: Transition = {
  awaiting_payment: ['confirmed', 'cancelled'],
  paid:             ['confirmed', 'cancelled'],
  awaiting_confirm: ['confirmed', 'rejected', 'cancelled'],
  rejected:         ['awaiting_confirm', 'cancelled'],
  confirmed:        ['in_progress', 'cancelled'],
  in_progress:      ['completed', 'cancelled'],
}

// 商城（MALL）
const MALL: Transition = {
  awaiting_payment: ['confirmed', 'cancelled'],
  paid:             ['shipped', 'cancelled'],
  confirmed:        ['shipped', 'cancelled'],
  shipped:          ['completed'],
}

// 团购（GROUP_BUY）— 不走通用状态机，tuan_orders 自带字段
// 但 orders（type=group_buy）走 MALL 变体：
const GROUP_BUY_ORDERS: Transition = {
  awaiting_payment: ['paid', 'cancelled'],
  paid:             ['completed', 'refunded'],
  cancelled:        [],
}

// 活动（ACTIVITY_ORDERS）
const ACTIVITY: Transition = {
  awaiting_payment: ['paid', 'cancelled'],
  paid:             ['completed', 'refunded'],
  cancelled:        [],
}
```

### 3.4 终止状态判定

```ts
const TERMINAL: ReadonlyArray<OrderStatus> = [
  'completed', 'cancelled', 'rejected', 'refunded',
]
export function isTerminal(s: OrderStatus): boolean {
  return TERMINAL.includes(s)
}
```

### 3.5 错误码 status 字段

```ts
// 错误码在 errorCodeMap.json 里的 status 字段也用 OrderStatus
// 兼容旧 pending / pending_payment：在解析时加 fallback
const LEGACY_ORDER_STATUS = {
  pending: 'awaiting_confirm',
  pending_payment: 'awaiting_payment',
} as const
```

---

## 4. 前端展示层适配

### 4.1 web-admin / mini-program 端常量更新

```ts
// web-admin/src/utils/constants.ts
export const ORDER_STATUS_LABELS = {
  awaiting_confirm:   '待确认',
  awaiting_payment:   '待支付',
  paid:               '已支付',
  confirmed:          '已确认',
  shipped:            '已发货',
  in_progress:        '进行中',
  completed:          '已完成',
  cancelled:          '已取消',
  rejected:           '已拒绝',
  refunded:           '已退款',
} as const

export const PAYMENT_STATUS_LABELS = {
  unpaid:             '未支付',
  paying:             '支付中',
  paid:               '已支付',
  pay_failed:         '支付失败',
  refunded:           '已退款',
  partial_refunded:   '部分退款',
} as const

// 兼容读取：旧值 → 新值
export function normalizeOrderStatus(s: string): string {
  return LEGACY_ORDER_STATUS[s as keyof typeof LEGACY_ORDER_STATUS] || s
}
export function normalizePaymentStatus(s: string): string {
  return s === 'pending' ? 'paying'
       : s === 'failed' ? 'pay_failed'
       : s
}
```

### 4.2 前端组件兼容

```vue
<el-table-column label="订单状态" width="120">
  <template #default="{ row }">
    {{ ORDER_STATUS_LABELS[normalizeOrderStatus(row.status)] || row.status }}
  </template>
</el-table-column>

<el-table-column label="支付状态" width="120">
  <template #default="{ row }">
    {{ PAYMENT_STATUS_LABELS[normalizePaymentStatus(row.paymentStatus)] || row.paymentStatus }}
  </template>
</el-table-column>
```

### 4.3 筛选 / 过滤参数兼容

```ts
// 前端 status 过滤参数 URL → 后端 query 转换
const FRONT_TO_BACK_STATUS = {
  'pending':    'awaiting_confirm',     // 待确认
  'unpaid':     'awaiting_payment',     // 待支付
  'pay_failed': 'pay_failed',
  // 其他不变
} as const
```

---

## 5. 后端存储层适配

### 5.1 数据库状态字段迁移

**方案：双写过渡期 + 后台批改**

```ts
// 数据迁移任务（一次性，与 orderTimeoutService 回填同模式）
// scripts/migrate-order-status.js
async function migrate() {
  const map = {
    'pending': 'awaiting_confirm',
    'pending_payment': 'awaiting_payment',
  }
  for (const [oldV, newV] of Object.entries(map)) {
    // 1) orders
    await batchUpdate('orders', { status: oldV }, { $set: { status: newV, migratedFrom: oldV } })
    // 2) feedingOrders
    await batchUpdate('feedingOrders', { status: oldV }, { $set: { status: newV, migratedFrom: oldV } })
    // 3) activity_registrations
    await batchUpdate('activity_registrations', { status: oldV }, { $set: { status: newV, migratedFrom: oldV } })
    // 4) payment status
    if (oldV === 'pending') {
      await batchUpdate('orders', { paymentStatus: 'pending' }, { $set: { paymentStatus: 'paying' } })
      await batchUpdate('tuan_orders', { paymentStatus: 'pending' }, { $set: { paymentStatus: 'paying' } })
    }
  }
}
```

### 5.2 写入侧双写（过渡期）

```ts
// common/order-state-machine.ts
function writeOrderStatus(raw: OrderStatus): OrderStatus {
  // 强制使用新值
  return raw
}

// 读取侧兼容
function readOrderStatus(stored: string): OrderStatus {
  return (LEGACY_ORDER_STATUS as any)[stored] || stored
}
```

### 5.3 API 响应侧转换

```ts
// adminService 端：所有 list 响应统一转换
function normalizeOrderRow(row: any) {
  return {
    ...row,
    status: readOrderStatus(row.status),
    paymentStatus: readPaymentStatus(row.paymentStatus),
  }
}
```

---

## 6. 实施步骤（5 阶段，1 个 Sprint 周期）

### Phase 1：基础与映射（1-2 天）

| Step | 文件 | 改动 |
|------|------|------|
| 1.1 | `cloudfunctions/common/order-state-machine.ts`（新增）| 定义 OrderStatus / PaymentStatus 常量 + 转移矩阵 |
| 1.2 | `web-admin/src/utils/constants.ts` | 加 `LEGACY_ORDER_STATUS` 映射、新标签 |
| 1.3 | `miniprogram/utils/constants.js` | 同上 |
| 1.4 | `cloudfunctions/common/normalizeStatus.ts`（新增）| 提供 `readOrderStatus / readPaymentStatus` 给所有 service 复用 |

### Phase 2：数据迁移（1 天，**周末凌晨跑**）

| Step | 文件 / 操作 | 说明 |
|------|------------|------|
| 2.1 | `scripts/migrate-order-status.js`（新增）| 同模式 `migrateTuanOrderStatus`，分批改 |
| 2.2 | 调用 `migrateOrderStatus` HTTP 函数 | 一次性，0 业务影响 |
| 2.3 | 验证脚本：统计每种状态的数量 | 与迁移前对比 |

### Phase 3：API 响应侧转换（2 天）

| Step | 服务 | action | 改动 |
|------|------|--------|------|
| 3.1 | adminService | getMallOrders | 列表项过 normalizeOrderRow |
| 3.2 | adminService | getBoardingOrders | 同上 |
| 3.3 | adminService | getFeedingOrders | 同上 |
| 3.4 | adminService | getActivityOrders | 同上 |
| 3.5 | adminService | getTuanDealOrders | 同上 |
| 3.6 | adminService | getOrderStats | 聚合里的 status 过滤换新值 |
| 3.7 | orderService | getOrderDetail | 详情接口也过 normalize |
| 3.8 | feedingService / hostService | 各自订单查询 | 同步 |

### Phase 4：写入侧切换（2 天）

| Step | 位置 | 改动 |
|------|------|------|
| 4.1 | orderService/orders.ts | 创建订单时用 `awaiting_payment` / `awaiting_confirm` |
| 4.2 | feedingService/feeding.ts | 同上 |
| 4.3 | activityService/index.ts | 同上 |
| 4.4 | tuanService/index.ts | 同上 |
| 4.5 | paymentService/pay.ts | 支付成功写 `paid`（不变）|
| 4.6 | paymentService/notify.ts | 同上 |
| 4.7 | orderTimeoutService | 取消写 `cancelled`（不变）|

### Phase 5：清理（1 天）

| Step | 位置 | 改动 |
|------|------|------|
| 5.1 | 所有 `services/stateMachine.js` 注释 | 删除（已迁到 `common/order-state-machine.ts`）|
| 5.2 | 错误码 `error-code-map.json` | 同步用新值 |
| 5.3 | CI 加 `audit-status-naming.js` | 禁止 `pending` 作为订单 status 出现（paymentStatus 允许）|
| 5.4 | 前端 `normalizeOrderStatus` 调用 | 如果 1 个月无新数据，移除兼容层 |

---

## 7. 风险与回滚

| 风险 | 概率 | 缓解 |
|------|------|------|
| 历史小程序版本发请求带 `status=pending` 参数 | 中 | 后端 where 兼容旧值（同时查 pending 和 awaiting_confirm）|
| 数据迁移中断 | 低 | 批处理 + 幂等（migratedFrom 标记）|
| 状态机转移校验过严导致正常流程被拒 | 中 | 提供 adminService 强制转换接口 + 灰度 |

**回滚开关**：在 `common/order-state-machine.ts` 加 `STATUS_MIGRATION_LIVE = false` 环境变量，一键回退到旧值。

---

## 8. 工期与收益

| 维度 | 数值 |
|------|------|
| 总工时 | 约 8 个工作日（1 个 Sprint）|
| 影响文件 | ~30 个（13 service + 前端 2 套 + audit + 迁移脚本）|
| 兼容性 | 完全兼容（数据迁移 + 双写过渡 + 响应侧转换）|
| 收益 | 状态语义清晰 / 减少 5 个 if-else 分支 / 状态机类型安全 / 前端 label 不撞名 |

---

## 9. 后续 TODO（不在本计划）

1. **`tuan_commissions` 表重命名**为 `referral_commissions`（涉及 6 个服务 15 处引用，独立 sprint）
2. **小程序端 README** 更新状态说明
3. **管理员培训**：发货中 / 已完成 / 已拒绝 等新状态的中文释义
4. **监控告警**新增 `OrderStuckInState`（订单卡在某中间态超 24h）

---

## 10. 立即可启动

| 任务 | 命令 | 预计时间 |
|------|------|---------|
| 启动 Sprint 59 | 创建新 git branch `sprint/59-order-status-naming` | 5 min |
| 跑 `npm run audit:all` | 确认起点 | 1 min |
| 实施 Phase 1 | 写 `order-state-machine.ts` + 双端常量 | 1 day |
| 评审 PR | 内部 review | 0.5 day |

> 状态：📋 计划就绪，待启动 Sprint 59
