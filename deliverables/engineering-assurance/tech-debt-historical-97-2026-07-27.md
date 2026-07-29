# 97 个历史测试失败清理专项报告

**日期**：2026-07-27
**工作流**：工作流 5 - 技术债评估（历史失败清理）
**参与成员**：Tessa（测试专家）、Cody（代码审查师）

---

## 📌 TL;DR（执行摘要）

- 整体结论：全量 jest 非 ts-migration 失败 **97 项已清理至 54 项**（剩余全部为 integration 套件，需真实 CloudBase 环境）。**本地/CI 门禁（ts-migration + 非 integration）现已 0 失败、全绿**。
- 严重度分布：🔴严重 0 项 / 🟠高 0 项 / 🟡中 1 项（#14 i18n 英文缺失，已修）/ 🟢低 96 项（测试/mock 债 + integration 环境债）
- 阻塞 / 非阻塞：integration 54 项**环境阻塞（非硬阻塞）**，需真实凭据或 CI 隔离；其余全绿。
- 关键事实：**0 个生产逻辑 bug**（唯一 C=#14 是 i18n 英文文案缺失，一行数据补全已修）。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟢 通过（本地门禁 0 失败；54 integration 需真实环境，已建议隔离） |
| 阻塞项数量 | 1 类（integration 54 项，环境阻塞） |
| 关键行动项 | 4 条（见行动清单） |
| 建议下一步 | DADDY 审阅并提交全部改动；对 integration 54 项做 CI 隔离或补真实环境 |

---

## 🏗️ 债务清单 + 最终处置（97 项）

| 分组 | 数量 | 处置 | 证据/依据 |
|------|------|------|----------|
| A. integration 需真实环境 | 54 | **CI 隔离**（标签/忽略路径），留作真实环境冒烟 | 11 个 integration 文件，报错均为连库/凭据/超时（5001/1006/RATE_LIMITED），本地零覆盖 |
| B. 过期测试 / mock 保真度 | 42（17+25） | **改测试/mock，零生产代码** | 配置演进、状态机 9 态、响应包装、限流 mock 路径、admin mock 模块、partner-wallet 种子集合名、order/rate-limit-store mock 语义等 |
| C. 真实 bug | 1（#14） | **改生产代码（一行数据补全）** | `utils/i18n.js` 的 `BIZ_I18N.FROM` 英文本地化为空串；补 `en-US:'From'` |
| D. 缺环境/配置 | 0 | 无 | 其余均为带 mock 本地单测，无 env/key/flag 缺失 |

**优先级（沿用 `Priority = (Impact + Risk) × (6 - Effort)`）**
- A(54)：Impact=2（门禁噪声），Risk=1，Effort=2（加 CI 忽略/补凭据）→ Priority=(3)×4=12，环境债，建议隔离。
- B(42)：Impact=1，Risk=1，Effort=1 → Priority=10，低优先级测试债，已全部清零。
- C(1)：Impact=1，Risk=1，Effort=1 → Priority=10，已修。

---

## 🧩 分阶段修复计划（实际执行）

| 阶段 | 动作 | 负责 | 结果 |
|------|------|------|------|
| 1. 抽取分层 | 全量 jest 抽取非 ts-migration 失败并分类 | Tessa | 97 = A54 / B17 / 待定26 / C0 / D0 |
| 2. 复验待定 | 读源码逐条判 B/C（重点 admin8+refund-risk4） | Cody | 待定26 = B25 / C1 / 待定0 |
| 3. 修 B=17 | 配置/状态机/响应包装/package.json 审计脚本/mock 路径 | Tessa | 非 integration 43→26 |
| 4. 修唯一 C | `utils/i18n.js` 补 `en-US:'From'` | Cody | utils-biz-i18n 36/36 绿 |
| 5. 修待定转 B 的 26 | admin mock wx-server-sdk / refund-risk mock 路径 / partner-wallet 种子 / order+rate-limit-store mock 语义 / precheck fixture / risk-control now / 两处旧正则 | Tessa | 非 integration 26→0 |

**最终验证**：
- `npx jest --testPathPattern='^(?!.*ts-migration)(?!.*integration)'` → Test Suites 63/63，Tests **1274/1274，0 failed**。
- ts-migration 套件 → 1270/1270，0 failed。
- 全量 `npx jest` 现仅剩 **54 failed（全部 integration）**。

---

## 📊 投入产出预估
- 投入：2 名成员（Tessa 2 轮测试修复 + 1 轮抽取；Cody 1 轮复验 + 1 行代码修复）。改动 15 个文件（13 测试 + package.json + utils/i18n.js）。
- 产出：本地/CI 门禁失败 97 → 0（除 integration）；测试护栏与代码现状重新对齐；唯一真实数据缺口（i18n 英文）补全；零生产逻辑改动风险。

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | 审阅并提交本轮改动（15 文件）+ 上轮 34-residual 的 18 文件（建议按 round 分 commit，便于回滚） | DADDY | P0 | 审阅后 |
| 2 | 对 integration 54 项做 CI 隔离：在 `jest.config.js` 的 `testPathIgnorePatterns` 加入 integration，或 CI 命令加 `--testPathIgnorePatterns=integration`（门禁忽略需真实环境的套件，保留作手动/真实环境冒烟） | DADDY / Rex | P1 | 确认后 |
| 3 | 真实环境补齐 integration 冒烟：给 CI 或本地提供 CloudBase 实凭据（`initCloud`/wx-server-sdk）后跑 integration 套件，逐步清零 | Rex + DADDY | P2 | 环境就绪后 |
| 4 | 关联跟进：第五波给 18 个 .js 编译产物补的 `/* eslint-disable */` 头，若 CI 重编译 .ts→.js 可能丢失，需在 .ts 源同步或确认构建链保留 | DADDY | P2 | 后续 |

---

## ⚠️ 待完善 / 已知局限

- 54 个 integration 失败**未修**（需真实 CloudBase 环境），本轮仅建议 CI 隔离；它们仍是真实业务链路的潜在盲区，需在真实环境补齐冒烟。
- 本轮测试 mock 能力被显著增强（order/rate-limit-store 的 `field().get()`、`where().count()`、`orderBy`、`in` 命令等），虽合理且必要，但增加了 mock 复杂度——属测试债范畴，可接受。
- 改动**未部署、未提交**（留给 DADDY 审阅）。
- 上轮遗留的 `AddressInput` 在 `common/types` 导出链路未 100% 确认，本次未涉及。

---

## 📚 数据来源 & 成员产出索引

- Tessa（测试专家）原始产出：
  - 分层抽取 97 失败（A54/B17/待定26/C0/D0）；
  - Round1 修 B=17（package.json 审计脚本、rate-limit-config 计数、boarding 状态机、payment 响应包装、限流 mock 路径），非 integration 43→26；
  - Round2 修待定转 B 的 26 项（admin mock `wx-server-sdk`、refund-risk mock 路径、partner-wallet 种子 `commissions`、order/rate-limit-store mock 语义、precheck fixture、risk-control `now`、两处旧正则），非 integration 26→0。
  - 最终验证：非 integration 1274/1274，0 failed。
- Cody（代码审查师）原始产出：
  - 复验待定 26 项，逐条读源码判 B/C（B25/C1/待定0），重点查透 admin(8) 与 refund-risk 映射(4) 均为 mock 问题无生产 bug；
  - 修复唯一 C（#14）：`utils/i18n.js` 补 `en-US:'From'`，utils-biz-i18n 36/36 绿。

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
