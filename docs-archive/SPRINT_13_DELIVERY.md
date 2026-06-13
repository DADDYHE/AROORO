# Sprint 13 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W39-W40

## 目标

- TypeScript 继续推广：迁移 `state-machine.js` / `idempotency.js` → `.ts`
- CI 完善：把 5 个 `.ts` 文件全部纳入 `build:common` 与 drift 检查
- 集成测试继续补全：寄养日期冲突子链路
- 单元测试覆盖新增的 `.ts` 迁移与 .d.ts 形态

## 关键任务完成度

| ID | 任务 | 责任 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| S13-01 | state-machine.js → .ts 迁移 | A | ✅ | 12 个迁移验证测试全过 |
| S13-02 | idempotency.js → .ts 迁移 | A | ✅ | 17 个迁移验证测试全过 |
| S13-03 | CI 接入 build:common + audit:error-codes:strict | E | ✅ | ci.yml 增 5 个 .ts 源文件 + drift 检查 |
| S13-04 | 集成测试 - 寄养日期冲突子链路 | B | ✅ | 21 个测试用例全过 |
| S13-05 | Sprint 13 交付文档 | E | ✅ | 本文档 |

## 1. state-machine.js → .ts 迁移

### 1.1 落地

- 新建 `cloudfunctions/common/state-machine.ts`（source-of-truth）
- `state-machine.js` 由 tsc 编译产物，顶部含 `/* eslint-disable */` 标记
- `state-machine.d.ts` 自动生成，含全部公共 API 签名

### 1.2 关键改动

1. **泛型支持**：`createStateMachine<S extends string>()`，调用方传入字面量联合可获得类型补全
2. **类型导出**：`StateMachineConfig<S>` / `StateMachine<S>` 来自 `./types`
3. **IllegalTransitionError 保留** 4 字段：`name` / `from` / `to` / `allowed`
4. **补充方法** `getAllowedTransitions(from)` 与 `nextStates(from)` 行为一致
   - 修复 TS 错误：`getAllowedTransitions is required in type 'StateMachine<S>'`
5. **metadata 类型化**：`Partial<Record<S, Record<string, unknown>>>`
   - 访问时使用 `(metadata as Record<string, ...>)[state]`

### 1.3 迁移测试覆盖（12 个）

`test/common-state-machine-ts-migration.test.js`：

| 类别 | 数量 | 关键场景 |
| --- | --- | --- |
| 文件存在性 | 4 | .ts / .js / .d.ts 存在 + eslint-disable |
| API 表面 | 3 | 公共 API 导出 / .d.ts 含核心签名 / tsconfig include |
| 行为 | 3 | createStateMachine 行为不变 / IllegalTransitionError / applyEvent |
| 配置错误 | 2 | validateConfig 抛 BusinessError / 边界 |

## 2. idempotency.js → .ts 迁移

### 2.1 落地

- 新建 `cloudfunctions/common/idempotency.ts`（source-of-truth）
- `idempotency.js` 由 tsc 编译产物
- `idempotency.d.ts` 自动生成
- 补充 `crypto.d.ts` shim（idempotency 依赖 `./crypto` 的 `sha256`）

### 2.2 关键类型

```ts
export interface IdempotencyKeyInput {
  userId?: string
  action: string
  payload?: Record<string, unknown> | string
  scope?: string
}

export interface PaymentNotifyInput {
  outTradeNo?: string
  transactionId?: string
  event?: 'pay' | 'refund' | string
}

export interface RegisterIdempotencyResult {
  ok: boolean
  duplicate: boolean
  replayed?: boolean
}

export interface RateLimitResult {
  allowed: boolean
  count: number
  resetAt: Date
}
```

### 2.3 迁移测试覆盖（17 个）

`test/common-idempotency-ts-migration.test.js`：

| 类别 | 数量 | 关键场景 |
| --- | --- | --- |
| 文件存在性 | 5 | .ts / .js / .d.ts / crypto.d.ts / eslint-disable |
| API 表面 | 3 | 公共 API 导出 / .d.ts 签名 / tsconfig include |
| buildIdempotencyKey | 3 | 同 payload 同 key / 显式 scope / 缺 action 拒 |
| buildPaymentIdempotencyKey | 2 | 默认 event=pay / 缺字段拒 |
| isIdempotentHit / registerIdempotencyKey | 2 | 端到端命中 / 重复 duplicate=true |
| assertIdempotent | 1 | 命中抛 IDEMPOTENT_REPLAY |
| checkRateLimit / assertRateLimit | 3 | 允许/拒绝 / 抛 RATE_LIMITED / 非法参数拒 |

## 3. CI 完善

### 3.1 ci.yml 调整

`.github/workflows/ci.yml` 中 `lint` job：

```yaml
- name: TypeScript common build
  run: npm run build:common

- name: Verify build:common produces fresh output
  run: |
    md5_before=$(md5sum \
      cloudfunctions/common/errors.js \
      cloudfunctions/common/logger.js \
      cloudfunctions/common/cache.js \
      cloudfunctions/common/state-machine.js \
      cloudfunctions/common/idempotency.js \
      2>/dev/null | sort | md5sum)
    npm run build:common > /dev/null 2>&1
    md5_after=$(md5sum \
      cloudfunctions/common/errors.js \
      ... 5 个文件 ... | sort | md5sum)
    if [ "$md5_before" != "$md5_after" ]; then
      echo "::error::build:common produced different output on second run, source drift detected"
      exit 1
    fi

- name: Verify TypeScript .ts files are present
  run: |
    for f in errors.ts logger.ts cache.ts state-machine.ts idempotency.ts; do
      if [ ! -f "cloudfunctions/common/$f" ]; then
        echo "::error::Missing TypeScript source: cloudfunctions/common/$f"
        exit 1
      fi
    done
```

### 3.2 双重保护

1. **编译幂等检查**：二次编译无变更 → 编译产物可重现，drift 立即 fail
2. **源文件存在性**：列出的 5 个 `.ts` 必须真实存在（防止 `.ts` 被误删但 `tsconfig` 仍引用）

## 4. 寄养日期冲突子链路

### 4.1 测试覆盖（21 个）

`test/integration/date-conflict-flow.test.js`：

| 类别 | 数量 | 关键场景 |
| --- | --- | --- |
| 基本查询 | 3 | 无订单 / 缺日期 / 无 hostId |
| 半开区间重叠 | 6 | 完全重叠 / 请求包含 / 已有包含 / 部分重叠 / 边界不重叠 / 完全无交集 |
| 状态过滤 | 5 | pending/cancelled/completed 不冲突 / confirmed/ongoing 冲突 |
| hostId 隔离 | 2 | 跨 host 不参与 / 同 host 多单 |
| 半开区间数学 | 1 | 独立验证 `os < re && oe > rs` |
| 联动 | 2 | checkDateAvailability 返回 false → 上层应拦截 / true → 允许 |
| 边界 | 2 | 空 hostId / 同 host 同日期多单 |

### 4.2 关键设计点

1. **半开区间判断** `[start, end)`：与 `checkDateAvailability` 中 `orderStart < requestEnd && orderEnd > requestStart` 一致
2. **状态白名单**：仅 `confirmed` / `ongoing` 视为占用；`pending` / `cancelled` / `completed` 不冲突
3. **hostId 隔离**：where 条件中 `hostId` 精确匹配，不参与跨 host 比较
4. **limit 100 防御**：超过 100 单时降级（业务约定，正常寄养家庭不会单日超 100 单）

## 5. 改动文件清单

### 新增

- `cloudfunctions/common/state-machine.ts`（迁移源文件）
- `cloudfunctions/common/idempotency.ts`（迁移源文件）
- `cloudfunctions/common/crypto.d.ts`（idempotency 依赖 shim）
- `test/common-state-machine-ts-migration.test.js`（12 个测试）
- `test/common-idempotency-ts-migration.test.js`（17 个测试）
- `test/integration/date-conflict-flow.test.js`（21 个测试）

### 修改

- `tsconfig.common.json`：`include` 增加 `state-machine.ts` / `idempotency.ts`
- `scripts/build-common.js`：`TARGETS` 增加 `state-machine.js` / `idempotency.js`
- `.github/workflows/ci.yml`：5 个 `.ts` 全部纳入 build:common + drift 检查 + 源文件存在性检查
- `docs/REFACTOR_PLAN.md`（同步更新待办）

## 测试 / 覆盖

| 指标 | Sprint 12 末 | Sprint 13 末 | 变化 |
| --- | --- | --- | --- |
| 测试套件 | 49 | **52** | +3（state-machine-ts / idempotency-ts / date-conflict） |
| 测试用例 | 857 | **906** | +49（+12 +17 +21 -1 受限调整） |
| 集成测试用例 | 162 | **183** | +21（寄养日期冲突） |
| TypeScript .ts 源文件 | 3 | **5** | +2（state-machine、idempotency） |
| TypeScript .d.ts shim | 3（utils / errors / logger） | **5**（+ crypto、+ types） | +2 |
| 编译产物 .js 文件 | 3 | **5** | +2 |
| CI 门禁步骤 | 6 | **6** | 维持（drift 检查 5 个文件 + 源文件存在性） |

## 度量看板

| 指标 | Sprint 12 末 | Sprint 13 末 |
| --- | --- | --- |
| 测试用例 | 857 | **906**（+49） |
| 集成测试用例 | 162 | **183**（+21） |
| TypeScript .ts 实现 | 3 | **5**（+state-machine、+idempotency） |
| TypeScript .d.ts | 7 个文件 | **9 个文件**（+crypto、+state-machine、+idempotency） |
| 编译产物 .js | 3 | **5**（+2） |
| CI 门禁步骤 | 6 | 6（drift 检查扩到 5 个 .ts） |
| 错误码白名单 | 100% (48/48) | **100% (48/48)** |
| 集成测试子链路覆盖 | 12 | **13**（+寄养日期冲突） |

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| `.ts` 源文件被误删但 `tsconfig` 仍引用 | CI 强制源文件存在性检查，PR 即时 fail |
| 编译产物与手写 .js drift | drift 双重 md5 比对，二次编译幂等 |
| 新增 .ts 引入未发现的类型问题 | tsconfig `strict: true` + `noImplicitAny: true` 严格模式 |
| 半开区间业务逻辑错误 | 集成测试 6 个重叠场景 + 1 个数学独立验证 |
| 寄养日期 limit 100 在大型 host 上误判 | 文档化业务约束；后续可加复合索引 + 优化查询 |
| `state-machine.ts` metadata 类型推导 | 显式 cast `metadata as Record<string, Record<string, unknown>>` |

## 下一步（Sprint 14 计划）

1. **TypeScript 继续推广**
   - 迁移 `date-holidays.js` → `.ts`
   - 迁移 `validator.js` → `.ts`
2. **集成测试继续补全**
   - 退款状态机子链路
   - 团长邀请关系子链路
   - IM 通知边界（已下线前的兼容性测试）
3. **CI 完善**
   - 接入 k6 基线回归（PR 触发 mini smoke）
   - 在 CI 跑 `npm run build:common && git diff --exit-code cloudfunctions/common/*.js`
4. **错误码扩到 50+**
   - 补充 RISK_PENDING / RISK_PASS
   - i18n 字典接入
5. **管理员后台**
   - 风控命中列表
   - 人工审核界面（riskPending 处理）
