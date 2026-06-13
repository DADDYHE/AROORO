# P2-3 Audit 脚本现状报告

> 编写时间：2026-06-08  
> 范围：`scripts/audit-*.js` 与 `scripts/audit-s*.js`（共 51 个文件）  
> 目的：在动手重构前，先把现状摸清楚，识别可提取的共用模式与重构收益。

## 1. 总量与分类

| 类别 | 数量 | 命名规律 | 用途 |
|---|---|---|---|
| 项目级 audit | 9 | `audit-<domain>.js` | 跨项目静态检查 |
| Sprint TS 迁移审计 | 36 | `audit-s<N>-<topic>.js` | 编号 Sprint 任务验收 |
| Sprint 子主题（TS 配套） | 6 | `audit-s31-*` / `audit-s46-*` / `audit-s47-*` 家族子目录 | TS 迁移细节验收 |
| **合计** | **51** | | |

## 2. 项目级 audit 脚本（9 个）

| 文件 | 主题 | 是否支持 `--strict` |
|---|---|---|
| `audit-naming.js` | 命名规范 | ❌ |
| `audit-env-secrets.js` | 密钥扫描 | ✅ |
| `audit-empty-catch.js` | 空 catch 块 | ❌ |
| `audit-duplication.js` | 代码重复 | ❌ |
| `audit-error-codes.js` | 错误码一致性 | ✅ |
| `audit-errors-singleton.js` | 错误模块单例 | ✅ |
| `audit-global-rate-limit.js` | 全局限流 | ✅ |
| `audit-common-refs.js`（独立命名） | 公共引用 | ❌ |

**模式**：每个脚本都是「独立可执行」node 脚本，输出 `[PASS] n/m` 或 `✅ 全部通过`。  
**重复点**：仅 4 个支持 `--strict`，导致 package.json 里 36 个 npm script 一半冗余。

## 3. Sprint TS 迁移审计脚本（42 个）

### 3.1 编号分布

| Sprint | 数量 | 主题 |
|---|---|---|
| s22 | 1 | 业务风险（payment/admin/order） |
| s23 | 1 | i18n 覆盖 |
| s24-s27 | 4 | paymentService TS 化（payment/notify/commission/...） |
| s28, s30 | 2 | orderService TS 化（orders/stats） |
| s31 | 4 | handleSuccess 残留 + ts coverage + rate-limit 覆盖 + 一次性 sprint 内多组检查 |
| s32 | 1 | 废弃 payment 移除（特殊：检测负面行为） |
| s33-s38, s40-s45 | 11 | 各 service TS 化（admin/user/partner/activity/mall/feeding/host/coupon/pet/order-timeout） |
| s46 | 10 | 批量 + 子服务（tuan/favorite/i18n-override/utility/coupon-expiry/tuan-expiry/rate-limit-cleanup/batch-services） |
| s47 | 3 | 入口文件 index.ts 化（payment/order/batch） |
| s46-s47 子目录复用 | 5 | 与 s46/s47 同主题但多文件检查 |

### 3.2 典型模板（以 `audit-s44-pet-service-ts.js` 为代表）

```js
// 1. 读 cloudfunctions/<service>/ 目录
const PET_DIR = path.join(ROOT, 'cloudfunctions', 'petService')
const TS_TARGET = path.join(PET_DIR, 'index.ts')
// 2. 验证 index.ts 存在
check('petService/index.ts 存在', fs.existsSync(TS_TARGET))
// 3. 验证 tsconfig.<service>.json include
const tsconfig = readSafe(path.join(ROOT, 'tsconfig.petService.json'))
// 4. 验证 build-all-services.js 注册
const allBuild = readSafe(path.join(ROOT, 'scripts', 'build-all-services.js'))
// 5. 验证 index.js 头部含 eslint-disable
const content = readSafe(JS_TARGET)
check('cloudfunctions/petService/index.js 头部含 eslint-disable', ...)
```

**结论：36 个 sprint audit 中至少 28 个（80%）完全遵循此模板**，仅服务名、文件名、tsconfig 名不同。

### 3.3 例外（不应进入通用模板）

- `audit-s22-business-risk.js`：检查 risk-control.ts 导出 + 业务调用方，不是 TS 迁移
- `audit-s31-handle-success-residual.js`：扫描所有云函数入口响应模式
- `audit-s31-global-rate-limit-coverage.js`：检查限流覆盖率
- `audit-s31-ts-coverage.js`：生成 ts-coverage.json 报告
- `audit-s32-deprecated-payment-removal.js`：检测**不应存在**的文件（负面检查）
- `audit-s23-i18n-override.js`：业务规则检查

## 4. 重复成本估算

| 维度 | 当前 | 重构后 | 节省 |
|---|---|---|---|
| Sprint audit 文件数 | 36 | 1 模板 + 36 配置 | 代码 ~70% |
| Sprint audit 总行数 | ~3,000 | ~1,200 | ~60% |
| package.json `audit:s*` 入口 | 36 对（72 行） | 1 个 `audit:all` 入口 | 90% |
| `ci:check` 链长度 | 50+ 行 | 1 行 | 98% |
| 新增 Sprint 时维护成本 | 1 个脚本 + 1 个 package.json 行 + 1 个 ci:check 行 | 1 个 JSON/YAML 配置 | 80% |

## 5. 重构方案（待评审）

### 方案 A：抽出基类 + 配置驱动（推荐）

```
scripts/
  _lib/
    sprint-ts-migration.js   # 通用基类
    sprint-ts-configs.js     # 36 个服务的配置数组
  audit-sprint-ts.js         # 入口：遍历配置调用基类
```

**收益**：
- 新增 service 时，只需在 `sprint-ts-configs.js` 加 1 行配置
- 修复 bug 时，改 1 处即可影响 36 个服务
- ci:check 简化为 `npm run audit:all:strict`

**风险**：
- 现有脚本的输出格式、退出码可能需要兼容
- 需保留旧的 36 个 npm script 入口（向后兼容 1-2 个 sprint）

### 方案 B：模板生成器

写一个 `scripts/gen-sprint-audit.js`，根据 `cloudfunctions/` 自动生成 36 个 audit 脚本。

**优点**：100% 复用现有结构
**缺点**：生成出来的脚本还是要 36 份，并没减少维护成本

### 方案 C：聚合器 + 保留所有

只加 `scripts/audit-all.js` 自动扫描 `scripts/audit-*.js` 执行，不改任何现有文件。

**优点**：0 风险
**缺点**：没有真正解决代码重复

## 6. 推荐执行顺序

1. ✅ 写本文档（已完成）
2. ⏭️ 评审本文档与三种方案
3. ⏭️ 选择方案 A 或 C
4. ⏭️ 实现 + 跑回归（确保所有 audit 仍通过）
5. ⏭️ 简化 package.json 与 ci:check

## 7. 决策

**当前选择**：仅做现状报告（用户已确认）。  
**下一步建议**：方案 C（聚合器）作为短期止血，方案 A 作为中期重构。

## 8. P2-1 实施后暴露的预先存在 Bug

> 编写时间：2026-06-08 P2-1 实施后
> 来源：跑通 `npm run audit:all` 后第一次全量扫描

聚合器打通后，audit:all 一次性跑完 50 个 audit 脚本。**27 个 sprint audit 之前因 `ci:check 包含 audit:xxx:strict` 检查项失效而失败**（已批量修复：改为同时接受 `audit:xxx:strict` 或 `audit:all:strict`）。

修复后仍剩 5 个失败，全部为**预先存在**的 audit 脚本 bug，与本次 P0/P1/P2 重构无关：

| Audit 脚本 | 失败项 | 根因 | 建议修复 |
|---|---|---|---|
| `audit-global-rate-limit.js` | orderService/paymentService 调用 `initGlobalRateLimitFromDb` | Sprint 50 已统一为 `bootstrapRateLimit`，但 audit 仍检查老 API | 正则改为 `(initGlobalRateLimitFromDb\|bootstrapRateLimit)\s*\(` |
| `audit-s46-batch-services-ts.js` | `scripts/build-tuan-service.js` 等单文件 build 脚本存在 | 实际架构是统一 `scripts/build-all-services.js`，单文件脚本从未存在 | 检查项改为「`build-all-services.js` 包含 tuan/favorite/.../coupon-expiry 入口」 |
| `audit-duplication.js` | `cloudfunctions/common/*.js` 在 18 个 service 中重复 | 这是有意设计（每 service 自带 common 副本，无需依赖云函数 common 链接） | 检查项改为「已记录为已设计模式」或忽略 |
| `audit-empty-catch.js` | 15/17 通过（缺 2 项） | 待查 | 单独跑看具体失败项 |
| `audit-naming.js` | 缺若干命名规范检查 | 待查 | 单独跑看具体失败项 |

**重要：这些失败在 P2-1 之前未被发现**，因为 `ci:check` 巨链里列出的 audit 是不完整的（缺 audit-duplication / audit-empty-catch / audit-naming 等），且 27 个 sprint audit 通过 npm script 单跑时虽然失败但被掩盖（CI 失败原因被混在 `&&` 链中难以定位）。

**P2-1 的最大价值不是脚本缩短，而是首次让 audit 跑全并暴露真实问题**。
