# 第四波实施报告：156 失败专项（tsc 门禁修复）+ 低优收尾

**日期**：2026-07-26
**工作流**：缺陷修复专项（156 失败 / tsc 门禁）+ 低优收尾
**参与成员**：Rex（SRE）、Tessa（测试）、Archi（架构）

---

## 📌 TL;DR（执行摘要）

- 整体结论：156 失败专项（DADDY 拍板归属 a·SRE 驱动 tsc 门禁修复）**已完成**，19/19 服务 tsconfig 全部 0 错误；低优 F22/F23/F28/F29 收尾（文档化 + 测试补齐）。
- 严重度分布：本波无新增高/中优；均为低优收尾与工程化。
- **关键修正**：原假设「BusinessErrorCode 重复声明串扰（TS2300）」经核实**不成立**（全仓无重复标识符）。真实根因是 TS7016（服务 import 本地 common/*.js 缺声明文件）+ referral 隐式 any + 2 处隐藏的真实类型缺陷（pay.ts 的 SuccessResult 不匹配、orderTimeout 缺 deadAt 字段）。
- 阻塞 / 非阻塞：代码改动已 `git add` 暂存**待 DADDY 审阅提交**；部署前仍须确认环境变量 + 配 `SRE_ALERT_WEBHOOK`。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟡 有条件通过（tsc 门禁修复完成、单测通过、改动待审阅提交） |
| 阻塞项数量 | 1（git 暂存改动待提交审阅；部署前确认环境变量） |
| 关键行动项 | 5 条（见下方行动清单） |
| 建议下一步 | 清 integration flow + ts-migration 残留失败、拍板 F22/F23 分歧、拍板架构重构 |

---

## 🔧 156 失败专项（tsc 门禁修复，归属 a）

| # | 严重度 | 类别 | 根因 | 修复 | 验证 |
|---|--------|------|------|------|------|
| 156-tsc | 🟢低（工程化） | 类型/构建 | 原假设 TS2300 重复声明**不成立**；真实为 TS7016（缺声明文件）+ referral 隐式 any(TS7006) + pay.ts SuccessResult 不匹配 + orderTimeout 缺 deadAt | ① 修 5 个 .ts（referral 显式标 id 类型；adminService 路径改 ../common/types；pay.ts 改 WrappedHandler<SuccessResult<…>>；orderTimeout 补 deadAt?）② 新增 12 个 .d.ts 重导出垫片指向根 cloudfunctions/common/* ③ .gitignore 放开 common/*.d.ts 追踪（垫片可入库、不污染 .js 构建产物） | 19 个服务 tsconfig 全部 0 错误；audit-s38 --strict 45/45 通过；jest ts-migration 套件 0 处 error TS |

**残留（非 tsc 结构项，建议另立项）**：
- `integration flow` 套件需真实 CloudBase 环境（initCloud/wx），已标注跳过、不动。
- 另 46 个 ts-migration 残留失败为非 tsc 结构断言（缺 `/* eslint-disable */` 头 / audit 严格退出），可单列清理。
- 改动已 `git add` 暂存，待 DADDY 审阅后提交。

---

## 🧪 F28 / F29（测试，Tessa）

| # | 结果 |
|---|------|
| F28 | 新增 `test/common-logger-branches.test.js`，覆盖 `_serializeLogPayload`(null/undefined/对象/字符串/数字)、`perf()` 采样开关(rate=0 早返/rate=1 输出 PERF-SAMPLE)、`installGlobalExceptionHandlers` 测试环境早返、`child()` 前缀拼接。与原 common-logger 共 **33 项全过**；jest.config.js 阈值 b50/f65 维持不变（不强行拉高）。未覆盖：`installGlobalExceptionHandlers` 非测试环境的进程监听注册分支（需改 NODE_ENV，风险高，暂不测）。 |
| F29 | 项目**无小程序组件测试基建**（无 miniprogram-simulate，setup.js 未桩 Page/Component）。按"不擅装重依赖"，建零依赖最小 demo：`test/fixtures/demo-page-quick-register.js` + `test/pages-quick-register-demo.test.js`（桩 global.Page 捕获配置 + 假实例驱动方法），**9 项全过**，覆盖表单校验/提交防重入/异常分支。真实页测试三步基建方案：① setup.js 加 Page/Behavior/Component 桩 ② jest.mock 桩 services ③ 或引入 miniprogram-simulate（重依赖，CI 需配 node 构建链路）。 |

---

## 📄 F22 / F23（文档化，Archi）

产出：`docs/adr-contract-and-errorcode-2026-07-26.md`（仅文档，未改业务代码）。

| # | 推荐方向 | 待拍板分歧 |
|---|---------|-----------|
| F22 | 仅文档固化现状：前端→paymentService 的 amount 须整数「分」，元→分转换现散在 wechatPay 与 booking/confirm 两处，PaymentService.pay 泄漏不转换；彻底收敛到单点(B)或云侧统一×100(A) 需决策（A 触资金路径） | ① 传分(B) 还是云侧×100(A)？ |
| F23 | 先上 CI 校验（复用 F13 门禁）＋长期生成共享常量；纯文档不足 | ② 先 CI(ii) 还是直接生成常量(i)？③ severity 词表 SERVER/SYSTEM 统一哪个？ |

---

## 📊 整改进度总览（截至 2026-07-26 第四波）

| 状态 | 项 |
|------|----|
| ✅ 已修（代码/测试/文档落地，未部署） | F1/F5/F6/F7/F8（P0）、F10/F12/F18/F19/F21（二波）、F4/F9/F20/F25/F26（三波）、F22/F23/F28/F29（四波） |
| ⏸ 架构重构待拍板 | F2/F3/F4-架构/F13/F14/F15/F16（ADR 见 `docs/adr-remediation-architecture-2026-07-26.md`） |
| ⬜ 已知残留（另立项） | 156 专项：integration flow 需真实环境、ts-migration 46 失败为 eslint 头缺失（非 tsc） |

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | 审阅雷克斯 `git add` 暂存的 17 个文件（tsc 修复）并 `git commit` | DADDY | P0 | 提交前 |
| 2 | 部署前确认环境变量（禁用 `TENCENTCLOUD_/SCF_/QCLOUD_` 前缀）+ 配 `SRE_ALERT_WEBHOOK` | DADDY | P0 | 部署前 |
| 3 | 拍板 F22/F23 分歧（金额单位 / 错误码生成） | DADDY | P1 | 评审会 |
| 4 | 另立项：清 integration flow + ts-migration eslint 残留失败 | Rex + Cody | P1 | 后续专项 |
| 5 | 拍板架构重构 F2/F3/F4/F13–F16（5 个分歧点） | DADDY | P2 | 评审会 |

---

## ⚠️ 待完善 / 已知局限

- integration flow 套件需真实 CloudBase 环境，非本地代码可修，本次跳过。
- 46 个 ts-migration 残留失败为 eslint-disable 头缺失等非 tsc 结构项，tsc 门禁已绿，但 jest 全量仍有失败，需单独清理。
- F29 仅建零依赖 demo，未引入真实小程序组件测试基建（避免重依赖）；真实页覆盖待基建立项。
- F22/F23 仅出文档/方案，未改业务代码，待 DADDY 拍板后实施。

---

## 📚 数据来源 & 成员产出索引

- Rex（SRE 工程师）原始产出：156 专项 tsc 门禁修复（5 个 .ts 修正 + 12 个 .d.ts 垫片 + .gitignore 放开），19/19 服务 tsc 0 错误，git 暂存待提交。
- Tessa（测试专家）原始产出：`test/common-logger-branches.test.js`（33 过）、`test/pages-quick-register-demo.test.js` + fixture（9 过）、F29 基建方案。
- Archi（架构师）原始产出：`docs/adr-contract-and-errorcode-2026-07-26.md`（F22/F23 方案 + 3 分歧点）。

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
