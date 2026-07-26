# P0 高优修复实施报告

**日期**：2026-07-26
**工作流**：实施（基于 full-review 2026-07-26 审查结论）
**参与成员**：Cody（代码审查师）、Rex（SRE 工程师）、Tessa（测试专家）、Docu（技术文档师）

---

## 📌 TL;DR（执行摘要）

- 整体结论：审查报告的 5 个 P0 高优项（F1/F5/F6/F7/F8）**全部在代码层实施完成**，均未部署；F2/F3 架构重构列为待评审专项，未自动改。
- 实施规模：F1 改 20 个 `wallet-utils.js` 副本；F5 改 `cloudbaserc.json`（两数组）；F6 改 `initIndexes` 补 10 条索引；F7/F8 改 `orderTimeoutService` 三处文件。
- 验证：F1 并发单测 8/8 通过（Tessa），配置改动 `node --check` 通过（Rex）。
- 阻塞 / 非阻塞：代码改完**待部署**。部署前须 DADDY 确认环境变量（F8 需 `SRE_ALERT_WEBHOOK`）；F5 另有 7 个函数 timeout 未对齐，建议后续统一。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟡 有条件通过（代码改完、单测通过、待部署验证） |
| 阻塞项数量 | 2（部署需确认环境变量；F8 需配 webhook 才生效） |
| 关键行动项 | 7 条 |
| 建议下一步 | DADDY 确认环境变量后部署，并用真实流量验证 F1 |

---

## 🔧 修复明细（按编号）

### F1 钱包并发双入账（Cody）🔴→已修复
- **改动**：20 个 `wallet-utils.js` 副本的 `ensureWalletBalance` 函数体统一改写（原 31–72 行 → 新 31–65 行），含 `orderService/common/wallet-utils.js` 与 `orderTimeoutService/common/wallet-utils.js`（已同步）。`service-income-utils.js` 仅调用本函数，无需改。
- **重要更正**：原代码并非"待修"，而是已带误导性 `P1-C fix` 注释的旧 bug 模式——`top update(inc) → add(balance:0) → 仍无条件第二次 update(inc)`，并发下照样翻倍。
- **新逻辑**：`top update(inc)` 命中即 `updated>0` 直接 return（已存在精确加一次）；否则 `add(balance:amount)` 带余额创建；命中唯一索引冲突 `-502001`（并发已被他请求创建并带余额入账）直接 return，**绝不再加款**。
- **为何不用 serverTransaction**：CloudBase 事务仅支持 `doc(_id)` 级 + `$set`，无 `where()/_.inc`，无法表达「按 (openid,type) 的 inc-or-create」；故用原子操作 + 唯一索引兜底。
- **残留风险**：① 极窄竞态（同一逻辑事件的两个请求恰好错开半个时序仍可能 2×），需分布式幂等键/事务支持彻底消除；② `adminService/services/wallet.js`、`partnerService/services/wallet.js` 走事务-by-_id 建钱包，非本模式，建议另审。

### F5 部署 timeout/memory 对齐（Rex）🔴→已修复
- **改动**：`cloudbaserc.json`（functions + framework 两数组）统一到 config.json 意图值：orderTimeoutService 30→60s、order 10→20s、payment 10→15s、partner 10→20s、admin 10→15s（两数组同步）；partnerService memorySize 256→512。
- **残留**：petService/activityService/feedingService/tuanService/couponService/i18nOverride/rateLimitCleanup 的 timeout 在 cloudbaserc 仍与各自 config.json 不一致（不在本次 5 函数清单），建议后续统一。部署前须 DADDY 确认环境变量。

### F6 索引代码化进 initIndexes（Rex）🔴→已修复
- **改动**：`cloudfunctions/adminService/services/coupon.js` 的 `initIndexes()` 新增 10 条 `createIndex`（沿用 `{index:{keys,unique},name}` 写法）：wallets.idx_openid_type(unique)；withdrawals.idx_openid_createdAt、idx_openid_walletType_createdAt；commissions.idx_orderId_status、idx_inviterId、idx_orderId_inviterId(unique)；feedingOrders.idx_feederId_status、idx_ownerId_status、idx_ownerId_createdAt。
- **逻辑**：代码化 MCP 已确认但仅存 DB 的索引，重建/迁移可恢复，避免丢失。
- **残留**：索引定义依查询模式推断（无 DB 直连）；若 DB 实际 unique 标志不同，会因"已存在"跳过未改正，建议 DADDY 用 MCP 核对实际 spec。

### F7 补偿队列死信监控（Rex）🔴→已修复
- **改动**：`orderTimeoutService/index.js` + `index.ts`（`processFailedOperations`、`main`）：`retryCount≥5`（FAILED_OP_MAX_RETRY）由 'failed' 改 'dead' + 写 `deadAt`；每条死信记 `logger.error('failedOperations.dead_letter',{...})`；`main` 中 `dead>0` 新增 `recordAlert('critical','failedOps.dead_letter','…伙伴收入可能漏算，需人工介入')`。复用现有 recordAlert/logger，无新依赖。
- **残留**：已确认无代码读取 'failed' 状态（仅扫描 pending），无影响；死信仍需人工补偿。

### F8 告警投递修复（Rex）🔴→已修复
- **改动**：`orderTimeoutService/common/alert.js`：确认高优异常已落库 alerts（orderTimeout.errors critical、failedOps.dead_letter critical、failedOps.retry warning、fatal critical 均已接线）；新增 `deliverAlertWebhook`：env `SRE_ALERT_WEBHOOK` 存在且 severity∈{critical,warning} 时，用 Node18 原生 fetch 异步 POST 企微 markdown，best-effort 不阻塞。
- **残留**：须 DADDY 配置 `SRE_ALERT_WEBHOOK` 才生效；各函数 common/alert.js 为 copy，仅改 orderTimeoutService 一份，其余告警仍仅落库（建议统一从此源同步）。

---

## 🧪 测试覆盖（Tessa）

- **新增**：`test/wallet-utils-concurrent.test.js`（仅加测试，未改业务代码）。
- **结果**：PASS，8/8（orderService 与 orderTimeoutService 两份 wallet-utils 各 4 例）。
- **mock**：沿用项目风格 `jest.mock('wx-server-sdk')` → 内存 `database()`，用内存 docs 模拟 collection.where/update/add；add 命中 (openid,type) 唯一索引抛 `-502001`，与真实一致。
- **覆盖**：两并发首次 Promise.all → 仅 1 条钱包、余额==amount（非 2×）；已存在钱包逐笔精确 +amount（10+20+30=60）；单笔基线 + 非法 type 抛错。
- **残留**：内存 mock 为近似，未覆盖真实网络时序/事务边界；未穷举极端竞态组合。

---

## 📚 文档（Docu）

- **新建**：`docs/runbook-remediation-2026-07-26.md`（并登记 `docs/INDEX.md` 入口）。
- 含：五项修复摘要、部署前检查清单（配 `SRE_ALERT_WEBHOOK`、禁用 `TENCENTCLOUD_/SCF_/QCLOUD_` 前缀、确认 `wallets(openid,type)` 唯一索引）、回滚步骤、后续待办。

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | 部署前确认环境变量配置正确（勿用保留前缀） | DADDY | P0 | 部署前 |
| 2 | 配置 `SRE_ALERT_WEBHOOK` 使 F8 告警生效 | DADDY | P0 | 部署前 |
| 3 | 统一 petService 等其余 7 函数 timeout | Rex（后续） | P1 | 下个迭代 |
| 4 | 用 MCP 核对 F6 索引实际 spec（unique 标志） | DADDY | P1 | 本周 |
| 5 | 加余额对账/异常监控（闭环 F1 极窄竞态） | SRE | P1 | 下个迭代 |
| 6 | 上线后用真实并发流量验证 F1 | DADDY + SRE | P1 | 发布后观测 |
| 7 | 评审 F2/F3 架构重构专项 | Archi + DADDY | P2 | 待排期 |

---

## ⚠️ 待完善 / 已知局限

- F1 存在极窄竞态（同一逻辑事件错开半个时序），需幂等键/事务支持彻底消除。
- F6 索引定义按查询模式推断，未直连 DB 核对实际 unique 标志。
- F8 仅改 orderTimeoutService 一份 `common/alert.js`，其余函数告警仍仅落库。
- Tessa 单测为内存 mock 近似，未覆盖真实服务端时序。
- F2/F3 架构重构未实施（待 DADDY 评审决策）。

---

## 📚 数据来源 & 成员产出索引

- Cody（代码审查师）原始产出：F1 修复（20 副本 ensureWalletBalance 改写 + 关键更正说明）。
- Rex（SRE 工程师）原始产出：F5 cloudbaserc 对齐、F6 initIndexes 补索引、F7 死信监控、F8 告警 webhook；均 `node --check` 通过。
- Tessa（测试专家）原始产出：`test/wallet-utils-concurrent.test.js`，8/8 通过。
- Docu（技术文档师）原始产出：`docs/runbook-remediation-2026-07-26.md` + `docs/INDEX.md` 登记。

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
