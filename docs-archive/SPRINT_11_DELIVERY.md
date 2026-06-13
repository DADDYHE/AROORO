# Sprint 11 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W35-W36

## 目标

- 性能指标体系：metrics 收集 + 中间件接入 + 慢调用告警
- 子链路集成测试再补：活动报名、优惠券核销、团长结算
- 风控前置：评价刷量识别 + 退款滥用识别
- 数据校验脚本增量模式（白名单 + since + collections）
- 渐进式类型化：errors.js → errors.ts（首个 .ts 实现落地）

## 关键任务完成度

| ID | 任务 | 责任 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| S11-01 | 性能指标模块（performance-metrics） | A | ✅ | P50/P95/P99 统计、QPS、错误率 |
| S11-02 | 云函数中间件（middleware） | A | ✅ | 鉴权 + 指标 + 日志 + 告警一站式 |
| S11-03 | 活动报名子链路集成测试 | B | ✅ | 22 个测试 + 修复 organizerId 写入 |
| S11-04 | 优惠券核销子链路集成测试 | B | ✅ | 28 个测试 + 修复 BusinessError 透传 |
| S11-05 | 团长结算子链路集成测试 | C | ✅ | 全链路 pending → settled 测试 |
| S11-06 | 风控：评价刷量识别 | D | ✅ | 5 维检测（高频/集中/相似/低质/新号） |
| S11-07 | 风控：退款滥用识别 | D | ✅ | 4 维检测（高频/全退/同额/金额异常） |
| S11-08 | 数据校验增量模式 | E | ✅ | `--since` / `--whitelist` / `--collections` |
| S11-09 | errors.js → .ts 迁移 | A | ✅ | tsc 编译产物 + 10 项迁移测试 |
| S11-10 | Sprint 11 交付文档 | E | ✅ | 本文档 |

## 1. 性能指标模块

### 1.1 落地

`cloudfunctions/common/performance-metrics.js`：
- `start(name, options)`：开启计时器（高分辨率时间戳）
- `success(timer, extraTags)`：记录成功（latency 增量统计）
- `failure(timer, err, extraTags)`：记录失败（携带 errorCode 标签）
- `snapshot()`：生成 P50/P95/P99/count/errorRate 快照
- `reset()`：清空状态（测试用）

### 1.2 关键设计

- **无外部依赖**：纯 JS，使用 `process.hrtime.bigint()` 避免浮点误差
- **标签维度**：`{ service, action, errorCode, ...userTags }` 支持 O(1) 聚合
- **百分位估算**：基于排序采样（O(n log n) 一次性），不存全量历史
- **小开销**：默认 60s 滚动窗口 + 上限 10000 条，超限自动清理

### 1.3 测试覆盖（17 个）

计时器启停 / 标签透传 / 失败错误码标签 / snapshot 字段 / 百分位计算 / 空快照 / 标签覆盖 / 大量样本下的稳定性 / reset 清理。

## 2. 云函数中间件

### 2.1 落地

`cloudfunctions/common/middleware.js`：
- `withMiddleware(opts)`：包裹 handler，串联鉴权 + 指标 + 日志 + 告警
- `composeMain({ service, handlers, ... })`：标准 main 入口组合

### 2.2 用法示例

```js
const { withMiddleware } = require('./common/middleware')
const { err } = require('./common/errors')

const handlers = {
  submitRegistration: withMiddleware({
    service: 'activityService',
    action: 'submitRegistration',
    verifyAuth: true,
    handler: async (event, ctx, auth) => {
      if (!event.activityId) throw err('MISSING_REQUIRED', '缺少活动ID')
      // ...
      return { code: 0, data: { registrationId: 'reg_001' } }
    },
  }),
}

exports.main = composeMain({ service: 'activityService', handlers })
```

### 2.3 关键设计

- **可选开关**：`enableMetrics` / `enableAlert` / `verifyAuth` 按需启用
- **慢调用告警**：`slowMs`（默认 1000ms）、`criticalMs`（默认 3000ms）两级阈值
- **指标自动埋点**：`${service}.${action}` 命名空间，便于多服务聚合
- **auth 透传**：handler 接收 `auth.openid`/`auth.roles`，无需重复鉴权

### 2.4 测试覆盖（10 个）

auth 校验 / 指标开启 / 指标关闭 / 慢调用告警 / 严重慢调用告警 / 失败埋点 / action 命名 / event 透传 / composeMain 路由 / 未知 action。

## 3. 活动报名子链路

### 3.1 测试覆盖（22 个）

| 类别 | 数量 | 关键场景 |
| --- | --- | --- |
| 参数校验 | 4 | 缺 activityId、缺 petId、缺 ownerId、缺 startDate |
| 业务规则 | 6 | 人数已满、已报名、活动未发布、活动过期、活动不存在、宠物不存在 |
| 状态流转 | 4 | draft → published、cancelled 活动拒绝、completed 拒绝、pending 允许 |
| 写入验证 | 3 | activity_registrations 落库、orders 落库、idempotencyKey 唯一 |
| 边界 | 5 | 空活动列表、空 detail、同 openid 多活动、报名人 = 主持人、特殊字符 |

### 3.2 修复历史 Bug

`cloudfunctions/orderService/orders.js` 创建订单时未写入 `organizerId`：

```diff
  const order = {
    _id: generateId('registration'),
    activityId,
    ownerId,
-   // organizerId 缺失
+   organizerId: hostInfo.openid || hostId,
    totalPrice,
    status: 'pending',
    createdAt: new Date(),
  }
```

修复后，订单与活动组织者强绑定，便于后续退款链路与活动核销联动。

## 4. 优惠券核销子链路

### 4.1 测试覆盖（28 个）

| 类别 | 数量 | 关键场景 |
| --- | --- | --- |
| 计算 | 6 | 满减、折扣、无门槛、阈值边界、浮点精度、负数兜底 |
| 状态流转 | 5 | unused → locked、locked → used、locked → unlocked、used → 拒、expired 拒 |
| 领取 | 5 | 正常、超过 perUserLimit、超过 remaining、模板不存在、未发布 |
| 锁定/解锁 | 4 | 正常锁定、超时释放（mock）、二次锁定拒、跨用户锁拒 |
| 使用 | 4 | 正常核销、未锁定核销、过期核销、订单已支付 |
| 错误处理 | 4 | BusinessError 透传 numericCode、错误码映射、severity 保留、未知 action |

### 4.2 修复历史 Bug

`cloudfunctions/couponService/index.js` 原错误处理未传播 `BusinessError.code` 与 `severity`：

```diff
  } catch (error) {
    logger.error(`[${action}]`, error)
-   return handleError(error, error.message || '服务器错误', ERROR_CODES.SERVER)
+   if (error && error.code && error.severity) {
+     const numericCode = ERROR_CODES[error.severity] || ERROR_CODES.BUSINESS
+     return handleError(error, error.message || '操作失败', numericCode)
+   }
+   return handleError(error, error.message || '服务器错误', ERROR_CODES.SERVER)
  }
```

修复后，客户端可拿到与文档一致的 numeric 错误码（如 `NOT_FOUND` → 1004），并保留语义化 `code`（如 `COUPON_NOT_FOUND`）。

## 5. 团长结算子链路

### 5.1 测试覆盖（15 个）

| 类别 | 数量 | 关键场景 |
| --- | --- | --- |
| 佣金生成 | 4 | 寄养单、商城单、活动单、喂食单 |
| 团长列表 | 3 | 聚合查询、空结果、按结算状态过滤 |
| 佣金统计 | 3 | pending/settled/cancelled 三态计数、金额合计 |
| 批量结算 | 3 | 正常批结、部分已结、全部已结 |
| 完整闭环 | 2 | pending → settled、settled 不可再次结算 |

### 5.2 完整闭环示例

```js
test('完整闭环：pending → settled', async () => {
  await createCommission('hosting', { _id: 'ord_001', ownerId: 'oBuyer1', totalPrice: 1000 })
  await createCommission('mall', { _id: 'ord_002', ownerId: 'oBuyer1', totalPrice: 2000 })

  const leaderList = await tuanAdmin.getTuanLeaderList({}, {}, { openid: 'admin' })
  expect(leaderList.data.list[0].totalCommission).toBe(200)

  const stats = await tuanAdmin.getTuanCommissionStats({}, {}, {})
  expect(stats.data.pendingCount).toBe(2)
  expect(stats.data.settledCount).toBe(0)

  await tuanAdmin.settleTuanCommissions({ ids: [...] }, {}, { openid: 'admin001' })

  const stats2 = await tuanAdmin.getTuanCommissionStats({}, {}, {})
  expect(stats2.data.settledCount).toBe(2)
  expect(stats2.data.settledAmount).toBe(200)
})
```

## 6. 风控：评价刷量识别

### 6.1 落地

`cloudfunctions/common/risk-control.js#detectReviewSpam`：

5 维检测：
- **F1 - 高频评价**（HIGH_FREQ）：7 日内评价次数 > 5 → `medium`
- **F2 - 主持人集中**（HOST_CONCENTRATION）：单主持人 24h 内被同一用户评价 > 3 → `medium`
- **F3 - 重复评论**（DUPLICATE_COMMENT）：30 日内同一评论内容出现 > 2 → `high`
- **F4 - 低质评价**（LOW_QUALITY）：3 字以内 + 极端评分（1★ 或 5★）+ tags 为空 → `low`
- **F5 - 新号刷评**（NEW_USER）：注册 < 24h 即评价 + 5★ → `medium`

### 6.2 关键设计

- **多维聚合**：任一维度命中即升级（`maxLevel`）
- **级别→动作**：`low` = pass / `medium` = review / `high` = block
- **理由透传**：`reasons: ['HIGH_FREQ:5次/7天', ...]` 便于审计
- **details 完整**：每个维度的命中数据都保留，便于复核
- **target 元数据**：携带 userId/hostId/orderId/rating/comment 全字段

### 6.3 测试覆盖（18 个）

F1-F5 单独命中 / 多维命中取最大级别 / 阈值边界 / 窗口外不命中 / 全空输入 / 异常输入（缺字段、null） / reasons 拼接 / 性能（100 条历史 < 100ms）。

## 7. 风控：退款滥用识别

### 7.1 落地

`cloudfunctions/common/risk-control.js#detectRefundAbuse`：

4 维检测：
- **F1 - 退款高频**（REFUND_HIGH_FREQ）：30 日内退款次数 > 3 → `medium`
- **F2 - 全额退款**（FULL_REFUND_PATTERN）：5 单中 > 3 单全退 → `high`
- **F3 - 同额异常**（SAME_AMOUNT_PATTERN）：连续 3 笔同额（±0.01）→ `medium`
- **F4 - 金额异常**（AMOUNT_ABNORMAL）：退款额 / 订单额 > 0.95 + 完成订单 < 2 → `low`

### 7.2 关键设计

- **「当前」与历史同算法**：把当前退款作为虚拟历史注入检测，避免「首次就触发」盲区
- **金额比较用分**：避免浮点误差，所有金额 `Math.round(v * 100)`
- **与评价风控同框架**：复用 `levelToAction` / `maxLevel`，统一返回结构

### 7.3 测试覆盖（16 个）

F1-F4 单独命中 / 全额退款集中 / 5 单中 3 单全退 / 同额连续 3 笔 / 金额异常且完成订单少 / 阈值边界 / 新用户不命中 F1 / 性能（500 条历史 < 200ms）。

## 8. 数据校验增量模式

### 8.1 三个新 CLI 参数

`scripts/validate-legacy-data.js` 增量模式：

```bash
# 只校验最近 1 天变更的文档
node scripts/validate-legacy-data.js --since=1700000000000 --report

# 忽略已知 P0（避免阻塞已知但暂不修复的 issue）
node scripts/validate-legacy-data.js \
  --whitelist=MISSING_CREATED_AT,PETS_INFO_LEGACY --report

# 只跑关心的集合（CI 中跑耗时小的核心集合）
node scripts/validate-legacy-data.js --collections=orders,users --report

# 三个联用
node scripts/validate-legacy-data.js \
  --since=1700000000000 \
  --whitelist=ORDER_NEGATIVE_PRICE \
  --collections=orders \
  --report
```

### 8.2 关键设计

- **since 默认 0**：不传 = 全量（向后兼容）
- **whitelist 默认 `[]`**：空数组 = 不过滤
- **collections 默认 `null`**：null = 全部
- **增量按 `updatedAt` 过滤**，缺则回退到 `createdAt`
- **`summary.byWhitelist` 统计被忽略的次数**：避免"沉默忽略"

### 8.3 测试覆盖（18 个）

since=T2 边界 / since=now 全空 / 缺 updatedAt 回退 / 白名单内不计 / 多白名单联用 / byWhitelist 计数 / 未白名单仍报 / collections=["users"] / 不存在的集合名 / 三个参数联用 / parseArgs 解析 / renderReport 含新字段。

## 9. errors.js → .ts 迁移

### 9.1 落地

| 文件 | 角色 |
| --- | --- |
| `cloudfunctions/common/errors.ts` | **源文件**：~340 行，含完整类型注解 |
| `cloudfunctions/common/errors.js` | **编译产物**：由 tsc 生成 + 自动 prepend eslint-disable |
| `cloudfunctions/common/errors.d.ts` | **类型声明**：自动生成 |
| `cloudfunctions/common/utils.d.ts` | 新增：utils.js 的 .d.ts shim（errors.ts 编译时需要） |
| `tsconfig.common.json` | 新增：tsc emit 配置（declaration: true, strict: true） |
| `scripts/build-common.js` | 新增：tsc + post-processing 一体化 |
| `package.json` `build:common` 脚本 | `node scripts/build-common.js` |

### 9.2 关键类型

```ts
export class BusinessError extends Error implements BusinessErrorInstance {
  public readonly name: 'BusinessError' = 'BusinessError'
  public readonly code: BusinessErrorCode  // 字符串联合类型
  public readonly details: Record<string, unknown> | null
  public readonly httpStatus: number
  get severity(): ErrorSeverity  // 从 code 推断
  toResponse(): ApiResponse<null>
}

export function isBusinessError(error: unknown): error is BusinessError  // 类型守卫

export type Handler<T = unknown> = (
  event: Record<string, unknown>,
  context: Record<string, unknown>,
  auth: { openid?: string; [k: string]: unknown }
) => Promise<T>
```

### 9.3 关键设计

- **runtime 仍消费 .js**：tsc 输出是 CommonJS，可被 Node.js 直接 require
- **零迁移成本**：所有 48 处 `require('./common/errors')` 都不需要改
- **类型逐步启用**：业务模块仍写 JS，但 IDE 能从 .d.ts 拿到完整补全
- **构建脚本化**：`npm run build:common` 一键生成 .js + .d.ts

### 9.4 测试覆盖（10 项迁移验证 + 25 项原有）

- 源文件 / 编译产物 / 类型声明三个文件存在
- .js 顶部带 `/* eslint-disable */` 标记（tsc 风格豁免）
- 公共 API 仍正确导出
- .d.ts 含 BusinessError / BusinessErrors / 工厂函数
- tsconfig.common.json 配置正确
- build:common 脚本在 package.json
- utils.d.ts shim 存在
- 运行时行为与迁移前完全一致

## 测试 / 覆盖

| 指标 | Sprint 10 末 | Sprint 11 末 | 变化 |
| --- | --- | --- | --- |
| 测试套件 | 36 | **46** | +10（performance-metrics、middleware、activity-flow、coupon-flow、leader-settlement-flow、risk-control、risk-control-refund、validate-legacy-data-incremental、errors-ts-migration、+others） |
| 测试用例 | 599 | **806** | **+207** |
| 集成测试 | 59 | **120** | +61（活动 22 + 券 28 + 团长 15 - 重复） |
| 性能指标模块 | 0 | **17 测试** | 新增 |
| 中间件模块 | 0 | **10 测试** | 新增 |
| 风控规则 | 0 | **5 + 4 维** | 新增 |
| 错误码登记率 | 100% (47/47) | **100% (47/47)** | 维持 |
| 数据校验规则 | 13 项 | **13 项 + 3 个 CLI 增量参数** | +3 |
| .ts 实现文件 | 0 | **1**（errors.ts） | 新增 |
| .d.ts 类型定义 | ~200 行 | **~280 行** | +80 |

## 度量看板

| 指标 | Sprint 10 末 | Sprint 11 末 |
| --- | --- | --- |
| 单元测试用例 | 599 | **806**（+207） |
| 集成测试用例 | 59 | **120**（+61） |
| 错误码白名单登记率 | 100% (47/47) | **100% (47/47)** |
| 数据校验规则 | 13 项 | 13 项 + 增量模式 |
| 性能指标埋点 | 无 | 17 测试覆盖 |
| 中间件接入 | 无 | withMiddleware + composeMain |
| 风控规则 | 无 | 评价 5 维 + 退款 4 维 |
| TypeScript .ts 实现 | 0 | **1**（errors.ts） |
| TypeScript .d.ts | ~200 行 | **~280 行** |
| CI 门禁步骤 | 6 | 6（待接入 build:common） |

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| `performance-metrics` 在高频请求下内存膨胀 | 后续加 LRU 上限（已设 10000）+ 滚动窗口 |
| `withMiddleware` 鉴权失败会重复触发告警 | 后续把 auth 失败从告警白名单中剔除 |
| `detectReviewSpam` 在主持人数据极少时阈值过严 | 后续加"样本不足不检测"分支 |
| 团长结算批结无幂等保护 | 后续用 `idempotency.js#withIdempotency` 包裹 |
| `errors.ts` 编译产物与手写 .js drift | `build:common` 强制覆盖 + CI 接入 |
| `validate-legacy-data.js` 白名单过度使用会掩盖真实问题 | `summary.byWhitelist` 统计 + 季度回顾清理 |
| 评价风控与退款风控未实际接入 handler | Sprint 12 接入 submitEvaluation / requestRefund |

## 下一步（Sprint 12 计划）

1. **风控接入生产**
   - submitEvaluation handler 接入 `detectReviewSpam`
   - requestRefund handler 接入 `detectRefundAbuse`
   - 命中 high 级别自动告警 + 拒绝落库
2. **TypeScript 推广**
   - 迁移 `logger.js` → `.ts`
   - 迁移 `cache.js` → `.ts`
   - 调研 `withMiddleware` 包装存量 handler 的自动 codemod
3. **性能基线**
   - 用 k6 录制关键业务（提交订单、支付、评价）P95 基线
   - CI 中接入回归检测
4. **CI 完善**
   - 接入 `build:common` 到 ci.yml，确保编译产物始终最新
   - 接入 `audit:error-codes:strict` 在 PR 中阻断
5. **集成测试继续补全**
   - 寄养订单子链路（state machine + 订单创建联动）
   - 喂食服务子链路
   - IM/通知聚合子链路
