# Sprint 27 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W1-W2

## 目标

- 将 `cloudfunctions/paymentService/services/commission.js` 迁移到 `commission.ts`
- 强类型化订单 / 配置 / 用户 / 邀请人 / 佣金记录全部数据形状
- 保留 best-effort 语义（错误吞掉仅记日志）
- 调整 pay.ts / notify.ts 使用解构风格 require（与 TS 编译产物一致）
- 补齐 CI 门禁：`audit:s27-payment-commission-ts:strict` 进入 `ci:check`
- 全量 `ci:check` 验证通过

## 关键任务完成度

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| S27-01 | `cloudfunctions/paymentService/services/commission.ts` 源文件创建 | ✅ | 1 个函数 + 4 个导出接口 + 5 个内部辅助 |
| S27-02 | `tsconfig.paymentService.json` include 扩展 commission.ts | ✅ | 与 refund.ts / pay.ts / notify.ts 共享配置 |
| S27-03 | `scripts/build-payment-service.js` TARGETS 包含 commission.js | ✅ | 自动注入 `/* eslint-disable */` 标记 |
| S27-04 | `commission.ts` 默认导出 createCommissionRecord | ✅ | 支持 `require('./commission').createCommissionRecord` |
| S27-05 | `commission.ts` 强类型化 4 个核心接口 | ✅ | CommissionOrderType / OrderDoc / Config / RecordPayload |
| S27-06 | `commission.ts` best-effort 错误处理 | ✅ | `catch (error: unknown)` + 仅记日志 |
| S27-07 | `pay.ts` 使用解构风格 require commission | ✅ | 已有，回归测试 |
| S27-08 | `notify.ts` 调整为解构风格 require commission | ✅ | Sprint 27 调整：原 `const fn = require()` 改为 `const { fn } = require()` |
| S27-09 | `payment-service-commission-ts-migration.test.js` 迁移测试（37 个用例） | ✅ | 文件存在性 + tsconfig + 类型 + 业务逻辑 + 解构风格 + 编译产物 + 兼容性 |
| S27-10 | `audit-s27-payment-commission-ts.js` CI 审计脚本（30 项 strict 检查） | ✅ | 进入 `ci:check` 链 |
| S27-11 | Sprint 27 交付文档 | ✅ | 本文档 |

## 1. commission.ts 迁移概览

### 1.1 迁移范围

`commission.js` 是 1 个 best-effort 工具函数，被 pay.ts / notify.ts 异步调用：

| 函数 | 业务功能 | 关键流程 |
| --- | --- | --- |
| `createCommissionRecord` | 订单支付成功后创建佣金记录 | 读佣金率 → 查买家 → 查邀请人 → 计算金额 → 幂等检查 → 写入 |

### 1.2 与 pay.ts / refund.ts / notify.ts 的关键差异

| 维度 | pay.ts / refund.ts / notify.ts | commission.ts |
| --- | --- | --- |
| 角色 | 云函数 handler | best-effort 工具函数 |
| 导出形式 | `WrappedHandler<T>` / `Promise<NotifyHttpResponse>` | `export default createCommissionRecord` |
| 调用时机 | HTTP / action 触发 | pay.ts / notify.ts 内部异步调用 |
| 错误处理 | `withErrorHandling` 或 try/catch 返回 HTTP | `catch (error: unknown)` + 仅记日志 |
| 鉴权 | 需要 / 不需要 | 无（仅内部调用） |
| 返回值 | 业务数据 | `Promise<void>`（无返回） |

### 1.3 CommonJS 互操作的关键点

Sprint 27 最关键的发现：**TypeScript 编译产物的 `export default fn` 与原始 `module.exports = fn` 行为不同**。

```javascript
// 原 commission.js：require 直接返回函数本身
const createCommissionRecord = require('./commission')  // ✅ 函数本身
await createCommissionRecord(orderType, order)

// 迁移后 commission.ts → commission.js：require 返回对象
const { createCommissionRecord } = require('./commission')  // ✅ 解构
await createCommissionRecord(orderType, order)
```

**调整为解构风格后，pay.ts / notify.ts / 未来的调用方都需要遵循统一模式**。

### 1.4 强类型化收益

```typescript
// 之前（JS）—— 字段含义靠注释
async function createCommissionRecord(orderType, order) {
  const config = await db.collection('system_config').doc('commission_rates').get()
  const rate = Number(config[orderType]) || 0
  // ...
}

// 现在（TS）—— 编译器强制结构正确
export interface CommissionConfig {
  order?: number
  mall?: number
  tuan?: number
  activity?: number
  feeding?: number
  [k: string]: number | undefined
}
async function loadCommissionConfig(dbInstance: CloudBaseDB): Promise<CommissionConfig> { ... }
```

**消除 3+ 处魔法字符串**（'system_config' / 'commission_rates' / 'tuan_commissions' 等集合名）

## 2. 类型架构设计

### 2.1 接口分层

```
CommissionOrderType (订单类型)
  └─ CommissionOrderDoc (订单文档)
       └─ CommissionUserDoc (用户文档：买家 + 邀请人)
            └─ CommissionConfig (系统配置)
                 └─ CommissionRecordPayload (写入载荷)
```

### 2.2 接口详情

| 接口 | 字段 | 用途 |
| --- | --- | --- |
| `CommissionOrderType` | `'order' \| 'mall' \| 'tuan' \| 'activity' \| 'feeding'` | 订单类型枚举 |
| `CommissionOrderDoc` | `_id` / `ownerId` / `outTradeNo` / `orderNo` / `totalPrice` / `totalAmount` / `basicPrice` | 订单文档最小子集 |
| `CommissionConfig` | `order?` / `mall?` / `tuan?` / `activity?` / `feeding?` | 系统佣金率配置 |
| `CommissionUserDoc` | `_id` / `inviterId` / `nickName` | 用户文档（买家 + 邀请人） |
| `CommissionRecordPayload` | `_id` / `inviterId` / `inviterNickName` / `ownerId` / `orderType` / `orderId` / `orderNo` / `orderAmount` / `commissionRate` / `commissionAmount` / `status` / `createdAt` / `updatedAt` | 写入佣金记录的完整载荷 |

### 2.3 内部辅助函数

| 函数 | 输入 | 输出 | 用途 |
| --- | --- | --- | --- |
| `loadCommissionConfig` | CloudBaseDB | `Promise<CommissionConfig>` | 读取 system_config.commission_rates |
| `loadBuyer` | CloudBaseDB, ownerId | `Promise<CommissionUserDoc \| null>` | 查询买家档案 |
| `loadInviter` | CloudBaseDB, inviterId | `Promise<CommissionUserDoc \| null>` | 查询邀请人档案 |
| `resolveOrderAmount` | CommissionOrderDoc | `number` | 计算订单金额（兼容 totalPrice / totalAmount / basicPrice） |
| `hasExistingCommission` | CloudBaseDB, orderId, inviterId | `Promise<boolean>` | 幂等检查 |

## 3. 业务流程序列

```
1. loadCommissionConfig(db)        → 读取佣金率
2. rate = config[orderType] || 0
3. rate <= 0 ? return               → 跳过（无佣金）
4. !order.ownerId ? return          → 跳过
5. loadBuyer(db, order.ownerId)     → 买家
6. !buyerData ? return              → 跳过
7. inviterId = buyerData.inviterId
8. !inviterId ? return              → 跳过（无邀请人）
9. loadInviter(db, inviterId)       → 邀请人
10. !inviterData ? return           → 跳过
11. orderAmount = resolveOrderAmount(order)
12. orderAmount <= 0 ? return       → 跳过
13. commissionAmount = orderAmount * rate / 100
14. commissionAmount <= 0 ? return  → 跳过
15. hasExistingCommission(...)      → 幂等
16. db.collection('tuan_commissions').add({ data: payload })
17. catch (error: unknown) → 仅记日志
```

## 4. 编译产物

### 4.1 commission.js 关键导出

```javascript
exports.createCommissionRecord = createCommissionRecord
exports.default = createCommissionRecord
// 编译产物同时支持：
//   const fn = require('./commission').createCommissionRecord  ✓
//   const fn = require('./commission').default                  ✓
//   const { createCommissionRecord } = require('./commission')  ✓（推荐）
```

### 4.2 commission.d.ts 关键签名

```typescript
export declare function createCommissionRecord(
  orderType: CommissionOrderType | string,
  order: CommissionOrderDoc
): Promise<void>
export default createCommissionRecord
```

## 5. CI 门禁

### 5.1 audit 脚本 30 项检查

```
[1]  commission.ts / .d.ts / .js 文件存在性 × 3
[2]  tsconfig.paymentService.json include commission.ts
[3]  build-payment-service.js TARGETS 包含 commission.js
[4]  package.json 注册 audit:s27-payment-commission-ts + strict + ci:check × 4
[5]  commission.ts 强类型化 4 个核心接口 × 4
[6]  commission.ts createCommissionRecord + default 导出
[7]  commission.ts 引用 generateId / 写入 tuan_commissions
[8]  commission.ts 读取 system_config.commission_rates
[9]  commission.ts 幂等检查（orderId + inviterId）
[10] commission.ts 错误处理 catch (error: unknown)
[11] commission.ts 注释包含 "Sprint 27"
[12] pay.ts 使用解构风格 require commission
[13] notify.ts 使用解构风格 require commission
[14] jest 测试 payment-service-commission-ts-migration.test.js 存在
[15-20] (strict) tsc --noEmit + .d.ts 类型验证 + eslint-disable 头 + 导出 createCommissionRecord
```

### 5.2 ci:check 链更新

```json
"ci:check": "npm run lint:cloudfunctions && ... && npm run audit:s27-payment-commission-ts:strict && npm run i18n:collect:zh:check && npm run codemod:page-i18n:check && npm run test:ci"
```

## 6. 测试覆盖

### 6.1 jest 测试（37 个用例）

| 套件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| 1. 文件存在性 | 3 | .ts / .d.ts / .js 存在性 |
| 2. tsconfig 配置 | 5 | strict / include commission + 3 回归 |
| 3. commission.ts 源文件 | 10 | Sprint 27 注释 / 4 个接口 / handler / default / utils / logger / CloudBaseDB |
| 4. commission 业务逻辑 | 8 | system_config / users / inviterId / 佣金计算 / 幂等 / tuan_commissions / generateId / catch unknown |
| 5. pay.ts / notify.ts 解构 | 2 | pay.ts + notify.ts 使用解构风格 |
| 6. commission.d.ts | 4 | createCommissionRecord 导出 / Promise<void> / default / 4+ 导出类型 |
| 7. commission.js 编译产物 | 4 | eslint-disable 头 / 导出 / generateId / require 解析 |
| 8. 编译可重复 | 1 | tsc --noEmit 通过 |

### 6.2 测试结果

```
PASS test/payment-service-commission-ts-migration.test.js
Tests: 37 passed, 37 total
```

并与 Sprint 25 pay / Sprint 26 notify / Sprint 24 refund 迁移测试联合运行：

```
Tests: 201 passed, 201 total  (8 个套件)
```

## 7. 兼容性保证

| 维度 | 保证 |
| --- | --- |
| commission.js 导出 | `exports.createCommissionRecord` + `exports.default`，三种 require 方式都可用 |
| pay.ts 调用 | `const { createCommissionRecord } = require('./commission')`（解构） |
| notify.ts 调用 | `const { createCommissionRecord } = require('./commission')`（解构，Sprint 27 调整） |
| 业务语义 | best-effort，所有异常吞掉仅记日志 |
| 幂等保护 | 同一 (orderId, inviterId) 不会重复写入 |
| 错误响应 | commission 失败不影响 pay / notify 的主响应 |

## 8. 指标

| 指标 | Sprint 24 (refund) | Sprint 25 (pay) | Sprint 26 (notify) | Sprint 27 (commission) |
| --- | --- | --- | --- | --- |
| 源文件行数（.ts） | ~280 | ~560 | ~440 | ~280 |
| handler / 函数数 | 2 | 4 | 1 | 1 |
| 内部接口数 | 8 | 14 | 7 | 5 |
| jest 用例数 | 21 | 25 | 41 | 37 |
| audit 检查项 | 18 | 19 | 33 | 30 |
| ci:check 链 | ✓ | ✓ | ✓ | ✓ |

## 9. 关键学习：CommonJS → TypeScript export

| 模式 | 运行时行为 | 推荐场景 |
| --- | --- | --- |
| `module.exports = fn` | `require('./m')` 返回 fn | 原 CommonJS 函数（commission 原始） |
| `export default fn` | `require('./m').default === fn` | ESM 互操作 |
| `export = fn` | `require('./m') === fn` | TypeScript 严格 CommonJS |
| `exports.fn = fn` + `exports.default = fn` | `require('./m').fn` 或 `.default` | **当前采用（最灵活）** |

Sprint 27 选择了**最灵活**的方案，调用方只需用解构风格即可。

## 10. 后续计划

- **Sprint 28**: `orderService/services` 迁移（orders.js / payment.js）
- **Sprint 29**: handleSuccess 残留点扫描 + 全局限流覆盖度审计
- **Sprint 30**: TypeScript 迁移覆盖率指标实现

## 11. 变更清单

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `cloudfunctions/paymentService/services/commission.ts` | 新建 | 强类型化佣金记录服务 |
| `cloudfunctions/paymentService/services/commission.d.ts` | 新建（自动） | tsc 生成 |
| `cloudfunctions/paymentService/services/commission.js` | 重建（自动） | tsc 编译 |
| `cloudfunctions/paymentService/services/notify.ts` | 修改 | 调整 require 风格为解构 |
| `tsconfig.paymentService.json` | 修改 | include 增加 commission.ts |
| `scripts/build-payment-service.js` | 修改 | TARGETS 增加 commission.js |
| `scripts/audit-s26-payment-notify-ts.js` | 修改 | 增加解构风格检查 |
| `scripts/audit-s27-payment-commission-ts.js` | 新建 | 30 项 strict 检查 |
| `test/payment-service-commission-ts-migration.test.js` | 新建 | 37 个 jest 用例 |
| `test/payment-service-notify-ts-migration.test.js` | 修改 | 增加解构风格检查 |
| `package.json` | 修改 | 注册 audit:s27 + ci:check 链 |
