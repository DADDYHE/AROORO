# 第五波实施报告：156 残留失败清理专项

**日期**：2026-07-27
**工作流**：测试债清理专项（156 失败残留）
**参与成员**：Rex（SRE）

---

## 📌 TL;DR（执行摘要）

- 整体结论：清理 156 失败专项的 ts-migration 残留。本轮安全清掉 12 个（缺 eslint 头），ts-migration 失败 46 → 34。
- **重要认知纠正**：全量 `npx jest` 实际失败是 **131 failed / 2960 passed**，并非第四波以为的"仅 46 且全在 ts-migration"。本轮仅覆盖 ts-migration 子集，剩余 34 个是"审计测试 vs 代码演进"的决策点，需 DADDY 拍板。
- 严重度分布：本波无新增高/中优；均为测试/审计断言一致性问题。
- 阻塞 / 非阻塞：34 个 ts-migration 残留 + 11 个 integration-flow 需 DADDY 决策或真实环境，**非硬阻塞**，但全量测试仍非全绿。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| 整体评级 | 🟡 有条件通过（安全清理已完成，剩余为决策点） |
| 阻塞项数量 | 2（34 个 ts-migration 决策点 / 11 个 integration 需真实环境） |
| 关键行动项 | 4 条（见下方行动清单） |
| 建议下一步 | DADDY 判定 34 个审计残留"改测试期望还是改代码"；integration 提供真实环境或跳过 |

---

## 🔧 ts-migration 残留清理（Rex）

| 项 | 结果 |
|---|------|
| 安全修复 | 给 18 个编译产物 .js 顶部补 `/* eslint-disable */`（仅注释，不改逻辑、未部署）：paymentService(refund/pay/notify/commission/index)、orderService(orders/stats/index)、adminService(index/constants)、userService(index/auth/notifications/referral/addresses)、mallService/index、orderTimeoutService/index、tuanService/index |
| 根因逐条核对（46 个） | 12 个＝.js 缺 eslint 头 → 已修；10 个＝ci:check 字面量不符（测试期望过期，真实已用 `audit:all:strict`）；24 个＝代码已偏离审计规格（真实问题，见下） |
| 验证 | ts-migration 失败 46 → 34（12 归零；6 个仅查头部的 audit 脚本退出码变 0）；雷克斯 git checkout 回退复测 order-service-orders / payment-service-pay 确认无回归（二者原先就失败） |

**24 个"代码偏离审计规格"明细（均为审计测试断言与代码现状冲突）**：
- `sumOrderTotal` 已重构去除
- `AddressInput/AuthLike/CloudEvent` 已抽到 `common/types.ts`
- `handleSuccess` 仍按 H7 在用
- `tuan_commissions/operation_logs` 实际未接线
- boarding 现为 9 态非 7 态
- types 用方法语法非箭头属性
- `recordAlert` 在 `./common/alert`
- logger 文案不同

---

## 📊 全量失败真实构成（131 failed / 2960 passed）

| 类别 | 数量 | 状态 |
|------|------|------|
| ts-migration 残留（本轮范畴） | 34 | 12 已清；剩 34 待决策（24 代码偏离 + 10 期望过期） |
| integration-flow 套件 | 11 | 需真实 CloudBase 环境（initCloud/wx-server-sdk 实凭据），本地无法修，标注跳过 |
| 其他单元套件历史失败 | 其余 | 非本轮范畴，属更广测试债，建议另立项 |

> ⚠️ 第四波报告所述"残留 46 个 ts-migration"为 ts-migration 套件内口径；全量实际 131，本轮仅覆盖 ts-migration 子集。特此纠正。

---

## ✅ 行动清单（按优先级排序）

| # | 行动 | 负责角色 | 紧急度 | 预期完成 |
|---|------|---------|--------|---------|
| 1 | 决策 34 个 ts-migration 残留：审计测试期望过期（更新测试期望）还是代码偏离规范（按 ADR 修代码） | DADDY | P1 | 评审会 |
| 2 | integration-flow 11 套：提供真实 CloudBase 凭据给 CI，或明确标注 skip | DADDY | P1 | 环境就绪后 |
| 3 | 审阅雷克斯 18 个 .js 的 eslint 头改动并提交（注：CI 重编译 .ts→.js 可能丢失，需在 .ts 源同步补或确认构建链保留） | DADDY | P0 | 提交前 |
| 4 | 其余非 ts-migration 历史失败（约 86 个）建议另立项系统性清理 | Rex + Cody | P2 | 后续专项 |

---

## ⚠️ 待完善 / 已知局限

- 34 个 ts-migration 残留为"审计测试 vs 代码演进"冲突，雷克斯未擅改、未弱化断言，需 DADDY 判定方向。
- eslint 头加在 .js 编译产物；若 CI 重编译 .ts 会覆盖 .js，头可能丢失——需在 .ts 源同步补或确认构建链保留注释。
- integration-flow 需真实环境，本地零覆盖，本轮跳过。
- 全量 131 失败中，仅 ts-migration 子集（46→34）在本轮范畴；其余为更广历史测试债。

---

## 📚 数据来源 & 成员产出索引

- Rex（SRE 工程师）原始产出：18 个 .js 补 `/* eslint-disable */` 头；ts-migration 46→34；逐条核对 46 失败根因；全量 131 失败构成分析；integration 标注跳过。

---

> 本报告由工程保障团队 AI 协作生成，关键决策请由人类工程负责人复核。
