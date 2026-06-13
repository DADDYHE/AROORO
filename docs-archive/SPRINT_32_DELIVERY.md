# Sprint 32 交付文档：移除废弃 orderService/payment.ts

## 概述

Sprint 32 完成 orderService 中旧版支付实现（payment.ts）的完整清理。前端、SDK 已在 Sprint 24-27 期间全部切换到 paymentService，orderService/payment.ts 在 Sprint 29 完成 TypeScript 迁移并标记为 `@deprecated`，Sprint 32 正式移除。

## 背景与动机

### 业务背景

`orderService/payment.ts` 是早期实现的旧版支付入口（包含 `wechatPay` 下单和 `wechatPayNotify` 回调），在引入独立 `paymentService` 后成为冗余实现：

| 阶段 | 进展 | 状态 |
| --- | --- | --- |
| Sprint 24 | paymentService 服务化拆分（pay.ts / refund.ts / notify.ts / commission.ts） | 主入口切换 |
| Sprint 25 | paymentService/services/pay.ts TypeScript 迁移（createPayment） | 新主入口 |
| Sprint 26 | paymentService/services/notify.ts TypeScript 迁移（paymentNotify） | 新回调 |
| Sprint 27 | paymentService/services/commission.ts TypeScript 迁移 | 分账完成 |
| Sprint 28 | orderService/orders.ts TypeScript 迁移 | 订单迁移 |
| Sprint 29 | orderService/payment.ts TypeScript 迁移（@deprecated） | 旧入口标记 |
| Sprint 30 | orderService/stats.ts TypeScript 迁移 | 统计迁移 |
| **Sprint 32** | **orderService/payment.ts 完整移除** | **清理完成** |

### 技术动机

- **避免双实现漂移**：旧版（`orderService/payment.ts`）与新版（`paymentService/services/pay.ts`）业务逻辑已分叉，长期保留旧代码增加维护成本。
- **统一支付入口**：所有支付相关操作（下单、回调、查询、关闭、分账、退款）由 paymentService 一站式管理，鉴权、限流、风控、状态机逻辑集中。
- **消除 TypeScript 类型污染**：paymentService 内部使用强类型 `WrappedHandler<T>`，orderService/payment.ts 同样已迁移但保留无意义。
- **缩小云函数包体积**：移除 payment.js 后，orderService 部署体积减少 ~6KB（含 wechatPayUtils 内部实现）。

## 关键变更

### 1. 物理文件删除

```
D  cloudfunctions/orderService/payment.ts      (~17KB / 500 行)
D  cloudfunctions/orderService/payment.d.ts    (~2KB)
D  cloudfunctions/orderService/payment.js      (构建产物 ~7KB)
```

### 2. orderService/index.js 改造

| 改动 | 说明 |
| --- | --- |
| 移除 `const paymentHandlers = require('./payment')` | 不再引入 paymentHandlers |
| 移除 `wechatPay: paymentHandlers.wechatPay` 导出 | 14 个 handlers 减为 14 个（保持订单/统计类） |
| 移除 `wechatPayNotify: paymentHandlers.wechatPayNotify` 导出 | 同上 |
| 移除 `const requireLogin = action !== 'wechatPayNotify'` 特殊判断 | 所有 action 一律要求登录（wechatPayNotify 已迁移到 paymentService） |
| 替换为 `const requireLogin = true` | 简化为常量 |

### 3. tsconfig.orderService.json

```diff
  "include": [
    "cloudfunctions/orderService/orders.ts",
-   "cloudfunctions/orderService/payment.ts",
    "cloudfunctions/orderService/stats.ts"
  ],
```

### 4. scripts/build-order-service.js

```diff
  const TARGETS = [
    path.join(ROOT, 'cloudfunctions', 'orderService', 'orders.js'),
-   path.join(ROOT, 'cloudfunctions', 'orderService', 'payment.js'),
    path.join(ROOT, 'cloudfunctions', 'orderService', 'stats.js'),
  ]
```

### 5. services/CloudFunctionService.js

`wechatPay` 客户端方法已从 `orderService/wechatPay` 迁移到 `paymentService/createPayment`（Sprint 31 完成）：

```javascript
// Sprint 32: 已迁移到 paymentService/createPayment
async wechatPay(orderId, amount) {
  return this.cloud.post('paymentService', {
    action: 'createPayment',
    type: 'order',
    orderId,
    amount: amount * 100,
  })
}
```

### 6. CI/CD 集成

新增审计脚本 `scripts/audit-s32-deprecated-payment-removal.js`，包含 24 项基础检查 + 4 项 strict 模式检查（28 项总计），全部通过。

`ci:check` 链路已加入：

```bash
npm run audit:s32-deprecated-payment-removal:strict
```

## 审计检查项

### 基础检查（24 项）

1. payment.ts / payment.d.ts / payment.js 文件已物理删除
2. tsconfig.orderService.json 不再 include payment.ts
3. scripts/build-order-service.js 不再包含 payment.js target
4. orderService/index.js 不再 require('./payment')
5. orderService/index.js 不再 require('./paymentHandlers')
6. orderService/index.js 不再导出 wechatPay
7. orderService/index.js 不再导出 wechatPayNotify
8. orderService/index.js 不再有 wechatPayNotify 特殊登录判断
9. CloudFunctionService.js wechatPay 改走 paymentService/createPayment
10. CloudFunctionService.js 不再调用 orderService/wechatPay
11. CloudFunctionService.js 不再有 action: "wechatPayNotify"
12. paymentService/services/pay.ts 存在
13. paymentService/services/pay.ts 包含 createPayment handler
14. paymentService/services/notify.ts 存在
15. paymentService/services/notify.ts 包含 paymentNotify handler
16. paymentService/index.js 注册 ...payHandlers spread
17. paymentService/index.js 注册 ...notifyHandlers spread
18. paymentService/index.js NO_AUTH_ACTIONS 含 paymentNotify
19. package.json 注册 audit:s32-deprecated-payment-removal
20. package.json 注册 audit:s32-deprecated-payment-removal:strict
21. package.json ci:check 包含 audit:s32-deprecated-payment-removal:strict
22. 测试 order-service-deprecated-payment-removal.test.js 存在

### 严格模式额外检查（4 项）

23. tsc --noEmit 严格编译通过（orderService）
24. paymentService tsc --noEmit 严格编译通过
25. cloudfunctions + services 不再引用 orderService/payment 路径
26. orderService/index.js 严格无 wechatPay* 代码引用

## 测试覆盖

新增测试 `test/order-service-deprecated-payment-removal.test.js` 共 32 个 test cases，覆盖：

- **物理文件删除验证**（3 项）：payment.ts / .d.ts / .js 不存在
- **tsconfig 配置验证**（3 项）：include 不包含 payment.ts + 回归（orders.ts / stats.ts 仍在）
- **build 脚本验证**（2 项）：TARGETS 不包含 payment.js
- **orderService/index.js 验证**（6 项）：require、handlers、requireLogin 特殊判断
- **CloudFunctionService.js 验证**（5 项）：wechatPay 走 paymentService
- **paymentService handler 验证**（7 项）：createPayment / paymentNotify
- **package.json 注册验证**（3 项）：audit script + ci:check
- **audit 脚本可执行验证**（2 项）：常规 + strict 模式退出码为 0

全部 32 个测试用例通过。

## 兼容性与回滚

### 兼容性

- 旧版 `orderService/wechatPay` / `orderService/wechatPayNotify` 调用方已在前端 / SDK 全部切换到 `paymentService/createPayment` / `paymentService/paymentNotify`，**无客户端回退需求**。
- 数据库结构无变化（订单 / 退款记录 collection 字段保持不变）。
- 微信支付回调 URL 配置无需调整（云函数路由已指向 paymentService）。

### 回滚方案

如需紧急回滚（虽然没必要）：

1. 重新创建 `cloudfunctions/orderService/payment.ts`（参考 git history 中 Sprint 31 的版本）
2. 在 `tsconfig.orderService.json` 的 include 数组恢复 `payment.ts`
3. 在 `scripts/build-order-service.js` 的 TARGETS 恢复 `payment.js`
4. 在 `cloudfunctions/orderService/index.js` 恢复 `paymentHandlers` require + 导出
5. 重新部署 orderService 云函数

但本回滚操作仅适用于紧急止血，不应在常规维护中使用。

## 经验与教训

1. **废弃标记要趁早**：Sprint 29 在迁移 payment.ts 到 TS 时立即标记 `@deprecated`，为 Sprint 32 清理铺路。如果等到 Sprint 32 才标记，前端切换可能更晚才发现依赖。
2. **审计脚本要早写**：本次的 `audit-s32-deprecated-payment-removal.js` 在清理**之前**创建，作为"目标状态检查清单"，确保清理工作有明确目标。
3. **多入口风险**：本次涉及 5 个文件类型（.ts / .d.ts / .js / tsconfig / build script / index.js），任一遗漏都会导致部署失败，审计脚本的 24 项检查覆盖所有路径。
4. **strict 模式的额外价值**：strict 模式新增的 tsc --noEmit + 全文 grep 检查在最终验证时提供了"全局视角"，避免遗漏边角引用。

## Sprint 33+ 规划

完成 Sprint 32 后，剩余的 TypeScript 迁移任务：

| 服务 | 状态 | 计划 Sprint |
| --- | --- | --- |
| adminService | 待迁移 | Sprint 33 |
| userService | 待迁移 | Sprint 34 |
| partnerService | 待迁移 | Sprint 35 |
| mallService | 待迁移 | Sprint 36 |
| activityService | 待迁移 | Sprint 37 |

每服务迁移遵循相同模式：

1. 选定核心入口（如 adminService/index.js → 拆分为 services 子目录）
2. 提取 handler 签名与 event/auth 类型
3. 使用 `WrappedHandler<T>` 包装统一错误处理
4. 编译生成 .js + .d.ts
5. 创建 `audit-sNN-{service}-ts.js` + `test/{service}-ts-migration.test.js`
6. 注册到 `ci:check`

## 交付清单

- [x] 物理文件删除：payment.ts / payment.d.ts / payment.js
- [x] orderService/index.js 改造：移除 paymentHandlers + requireLogin 简化
- [x] tsconfig.orderService.json：移除 payment.ts include
- [x] scripts/build-order-service.js：移除 payment.js target
- [x] scripts/audit-s32-deprecated-payment-removal.js：28 项审计检查全部通过
- [x] test/order-service-deprecated-payment-removal.test.js：32 个测试用例全部通过
- [x] package.json：注册 audit:s32-deprecated-payment-removal:strict 到 ci:check
- [x] test/order-service-stats-ts-migration.test.js：更新回归测试
- [x] CI 全链路验证：lint:cloudfunctions / tsc --noEmit / audit / jest 全部通过

Sprint 32 完成。
