# 34 个 ts-migration 审计残留拍板与闭环报告

**日期**：2026-07-27
**工作流**：工作流 5 - 技术债评估（审计残留闭环）
**参与成员**：Tessa（测试专家）、Cody（代码审查师）、实施工 commission-fixer（仅排查 #22，零改动）

---

## 📌 TL;DR（执行摘要）

- 整体结论：原 34 个 ts-migration 失败**已全部闭环（0 剩余）**，结论为「测试/审计期望与代码演进不一致」，全部通过更新测试与审计脚本期望值解决，**零生产代码改动、未部署**。
- 严重度分布：🔴严重 0 项 / 🟠高 0 项 / 🟡中 0 项 / 🟢低 34 项（均为测试债，非生产缺陷）
- 阻塞 / 非阻塞：**非阻塞**。ts-migration 测试侧与审计脚本 100% 转绿。
- 关键反转：科迪初判 #22 为「代码回归（写 `commissions`/读 `tuan_commissions` 不一致）」，经实施工全仓 Grep + CloudBase MCP 实查证伪——生产读写全用 `commissions`，`tuan_commissions` 仅存于测试 mock / 审计脚本 / 已废弃命名文档，线上库也只有 `commissions`。**#22 实为测试/审计期望写错集合名**，降级为测试侧修复。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟢 通过（34/34 闭环，零生产代码改动） |
| 阻塞项数量 | 0 |
| 关键行动项 | 2 条（DADDY 审阅 18 文件改动 / 提交 git） |
| 建议下一步 | DADDY 审阅并提交变更；顺带确认 AddressInput 导出链路；其余 ~97 全量失败另立项 |

---

## 🏗️ 债务清单 + 最终处置（34 项，全部＝更新测试/审计期望）

| 分组 | 项 | 处置 | 证据/依据 |
|------|---|------|----------|
| 过期期望 | #1–10（ci:check→`audit:all:strict`） | 改测试正则 | 旧 batch 入口已被 `audit:all:strict` 聚合器取代 |
| 等价/已批准重构 | #11 orderService dispatch、`#12` logger 改名、`#13–15` AuthLike/CloudEvent/CloudContext→common/types、`#18–21` AggregateOps/CloudBaseQuery 接口迁移、`#23` recordAlert→common/alert、`#29` handleSuccess 保留(H7)、`#30` sumOrderTotal 去除、`#31` AddressInput→common/types | 改断言匹配现状 | ADR F4/F13 共享类型收敛方向；H7 契约稳定 |
| 审计脚本字面量过期 | #16/17（s34）、#24/25（s46）、#32/33（s37） | 更新审计脚本硬编码字面量 | 代码已按批准方向重构，审计脚本未同步 |
| boarding 状态机 | #26–28（9 态 vs 期望 7 态） | DADDY 拍板：接受 9 态，改测试 | 新增 refunded/deleted 终态为有意增强 |
| operation_logs | #34（期望 ≥4，原得 0） | 改测试期望 | 实测 `couponService` 经 `./common/operation-log` 的 `writeOperationLog` 调 4 次，达 ≥4 日志点 |
| 集合名 | #22（期望 `tuan_commissions`，代码写 `commissions`） | **改测试+审计脚本期望值** | 实施工实证：生产全用 `commissions`，`tuan_commissions` 仅测试侧笔误 |

### 优先级（沿用 `Priority = (Impact + Risk) × (6 - Effort)`）
- 全部 34 项 Impact=1（不影响生产运行时）、Risk=1（仅测试/审计断言）、Effort=1（改字符串/断言）。Priority = (1+1)×5 = **10**，低优先级测试债，已全部清零。

---

## 🧩 分阶段修复计划（实际执行）

| 阶段 | 动作 | 负责 | 结果 |
|------|------|------|------|
| 1 | 精确抽取 34 失败 + file:line | Tessa | 34 failed / 1238 passed（test/ 下 37 个 ts-migration 套件） |
| 2 | 对照 ADR 分类 24 代码偏离 | Cody | 5 SANCTIONED / 1 REGRESSION(后证伪) / 2 DADDY |
| 3 | 排查 #22 集合名真伪 | 实施工 | 证伪"回归"前提，规范名=`commissions` |
| 4 | 改 14 测试 + 4 审计脚本期望值 | Tessa | 1270 passed / 0 failed；audit-s27/s34/s46/s37 均 exit=0 |

---

## 📊 投入产出预估
- 投入：3 名成员并行（Tessa 测试修复、Cody ADR 分类、实施工 #22 排查）约 1 轮迭代；改动 18 个文件。
- 产出：ts-migration 套件 34 失败 → 0；测试护栏与代码现状重新对齐，审计脚本不再因已批准重构而误报；零生产代码改动，无部署风险。

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | 审阅 18 个 test/scripts 改动文件（未部署、未提交） | DADDY | P0 | 本次评审 |
| 2 | git 提交测试/审计脚本改动（建议独立 commit，便于回滚） | DADDY | P1 | 审阅后 |
| 3 | 确认 `AddressInput` 在 `common/types` 的导出链路（科迪顺带类型审计） | Cody | P2 | 后续 |
| 4 | 关联跟进：全量 jest 仍约 97 失败（86 历史单元 + 11 integration 需真实环境），建议另立项系统性清理 | Rex + Cody | P2 | 后续专项 |

---

## ⚠️ 待完善 / 已知局限

- 本任务仅覆盖 ts-migration 子集（原 34 项）。全量 `npx jest` 当前仍有约 97 失败：86 个其他历史单元测试 + 11 个 integration-flow（需真实 CloudBase 凭据），建议另立项。
- 第五波给 18 个 .js 编译产物补的 `/* eslint-disable */` 头，若 CI 重编译 .ts→.js 可能丢失（需在 .ts 源同步补或确认构建链保留）——与本任务独立，仍待跟进。
- `AddressInput` 导出链路未 100% 确认（科迪提示 `common/types.d.ts` grep 未直接命中导出，但 `userService/addresses.ts` 确能 `import type { AddressInput } from './common/types'`，疑经其他声明聚合导出），属生产代码范畴，未改动。
- 两份 ADR（F2–F16、F22–F23）仍为 Proposed 状态；本报告「SANCTIONED」判定按"有意改动＋代码文档化佐证"，严格落地需 DADDY 拍板 ADR。

---

## 📚 数据来源 & 成员产出索引

- Tessa（测试专家）原始产出：34 失败精确抽取（file:line + 断言冲突 + 归类）；14 个测试文件 + 4 个审计脚本期望值修复；`npx jest --testPathPattern=ts-migration` 1270 passed/0 failed 验证；`#34` 经代码核验为测试期望过期。
- Cody（代码审查师）原始产出：24 个代码偏离主题对照两份 ADR 分类（5 SANCTIONED / 1 REGRESSION / 2 DADDY），并指出两份 ADR 仍 Proposed。
- 实施工 commission-fixer 原始产出：#22 集合名全仓 Grep + CloudBase MCP 实查，证明规范名=`commissions`、`tuan_commissions` 系测试侧笔误，未改动任何生产代码。

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
