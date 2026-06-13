# 历史遗留技术债清理 + A/B 风险修复 实施计划（已完成）

> **For agentic workers:** 本计划已全部执行完毕，记录于 2026-06-08。A/B 高/中风险已 100% 闭环；剩余 C 类低风险与 D 类安全审计需在后续 Sprint 推进。

**Goal:** 清理项目数月累积的过时文档、死代码、调试残留、依赖与配置隐患，闭环 A 高风险 32 处 + B 中风险 16 处共 48 处审计项；为后续 C/D 审计与新功能开发提供干净基线。

**Architecture:**
- P0（文档清理）: 删除 44 个过时 MD（`.trae/documents/` 工作草稿 + 散落 CHANGELOG/README/设计参考），保留 `docs/superpowers/plans/`（实施计划）
- P1（死代码清理）: 删除 17 个孤儿文件（11 个 wxss、3 个 error utils、2 个孤立 subpackage 文件、1 个临时 audit 脚本）
- P2（配置与脚本精简）: 合并重复 env 模板、删除死 npm 脚本、删除 deploy 脚本死步骤
- P3（A 高风险 32 处）: app.js 死方法 + 注释；tsconfig.orderService.json 补 payment.ts；24 个调试 console.log
- P4（B 中风险 16 处）: 5 个空 catch 加 warn；cloudbase.js secret fallback 改 throw；wx-server-sdk 升 ~2.7.0；6 个服务补 lock 文件
- P5（回归修复）: app.js safeMode require 误删回退

**Tech Stack:** 微信小程序原生（js/wxml/wxss）+ 腾讯云 CloudBase 云函数（TypeScript → JavaScript）+ Jest 29.x + ESLint 8.x + npm 8+

---

## 任务进度总览

| Phase | 类别 | 项目数 | 状态 |
|---|---|---|---|
| P0 | 文档清理（过时 MD） | 44 | ✅ 完成 |
| P1 | 死代码清理（孤儿文件） | 17 | ✅ 完成 |
| P2 | 配置/脚本精简 | 3 | ✅ 完成 |
| P3 | A 高风险（A1-A3） | 32 | ✅ 完成 |
| P4 | B 中风险（B1-B4） | 16 | ✅ 完成 |
| P5 | 回归修复（safeMode） | 1 | ✅ 完成 |
| 合计 | | **113** | **✅ 100%** |

> 注：A3 实际清理了 24 个 console.log + 顺手删除 2 个未用变量 + 1 个死 require。

---

## 文件变更总览

### P0 文档清理（删除 44 个 MD）

| 路径 | 原因 |
|---|---|
| `.trae/documents/` 全部工作草稿 | 临时调研笔记，未跟踪 |
| 项目根 + 各模块散落的 `CHANGELOG.md` | 重复/未维护 |
| `README.md` | 内容陈旧 |
| `AROORO_*.md` / `LOG_*.md` / `CODE_REVIEW_REPORT.md` | 已迁移到 Wiki |
| `docs/*.md`（非 plans 子目录） | 调研稿/临时报告 |

**保留**: `docs/superpowers/plans/*.md`（实施计划是 spec 级文档）

### P1 死代码清理（删除 17 个文件）

| 路径 | 原因 |
|---|---|
| `styles/` 11 个 wxss | 未在 `app.wxss` 引用 |
| `utils/errorConfig.js` | 误删后已恢复为桩（API 兼容） |
| `utils/errorStats.js` | 同上 |
| `utils/errorCollector.js` | 同上 |
| `subpackages/<orphans>` 2 个 | 无路由指向 |
| `.tmp-fix-audits2.js` | 临时 audit 脚本 |

### P2 配置/脚本精简

| 文件 | 操作 |
|---|---|
| `package.json` | 删除 4 个死 npm 脚本 |
| `deploy_cloudfunctions.sh` | 删除 3 行死步骤 |
| `.env.template` | 合并到 `.env.example` |

### P3 A 高风险（修改 13 个文件）

| 任务 | 文件 | 操作 |
|---|---|---|
| A1 | `app.js` | 删除 6 个死方法 + 2 段注释 + 2 段诊断代码 |
| A2 | `tsconfig.orderService.json` | include 加 `payment.ts` |
| A3 | `pages/home/index.js` | 删除 3 个 console.log |
| A3 | `pages/service/index.js` | 删除 4 个 console.log |
| A3 | `subpackages/booking/host-list-all.js` | 删除 5 个 console.log + 2 个未用变量 + 1 个死 require |
| A3 | `subpackages/feeding/confirm-service.js` | 删除 4 个 console.log |
| A3 | `subpackages/feeding/order-status.js` | 删除 2 个 console.log |
| A3 | `subpackages/booking/host-detail.js` | 删除 1 个 console.log |
| A3 | `subpackages/profile/edit/index.js` | 删除 1 个 console.log |
| A3 | `subpackages/profile/login/index.js` | 删除 1 个 console.log |
| A3 | `subpackages/pet/create-step1.js` | 删除 1 个 console.log |
| A3 | `subpackages/pet/utils/generatePetCard.js` | 删除 1 个 console.log |
| A3 | `subpackages/partner/activity-detail/index.js` | 删除 1 个 console.log |

### P4 B 中风险（修改 4 个文件 + 新增 6 个 lock）

| 任务 | 文件 | 操作 |
|---|---|---|
| B1 | `utils/AddressService.js` | 3 个空 catch 加 `console.warn` |
| B1 | `cloudfunctions/paymentService/services/wechatPayUtils.js` | 2 个空 catch 加 `console.warn` |
| B2 | `cloudfunctions/common/cloudbase.js` | 删 `secret`/`apiKey` 硬编码 fallback，缺失时 throw |
| B3 | `cloudfunctions/common/package.json` | `wx-server-sdk` `~2.6.3` → `~2.7.0` |
| B4 | 6 个服务的 `package-lock.json` | `npm install --package-lock-only` 生成 |

**B4 新增 lock 文件清单**:
- `cloudfunctions/adminService/package-lock.json` (35KB)
- `cloudfunctions/couponExpiryCheck/package-lock.json` (46KB)
- `cloudfunctions/i18nOverride/package-lock.json` (46KB)
- `cloudfunctions/orderTimeoutService/package-lock.json` (46KB)
- `cloudfunctions/tuanService/package-lock.json` (46KB)
- `cloudfunctions/tuanExpiryCheck/package-lock.json` (46KB)

### P5 回归修复

| 文件 | 操作 |
|---|---|
| `app.js` | 恢复 `safeMode` require + 删除残留 `// [诊断] 临时禁用 tracker` 注释 |

---

## 验证记录

### ESLint

| 范围 | 结果 |
|---|---|
| `app.js` 单文件 | 0 errors / 0 warnings ✅ |
| 13 个 P3 修改文件 | 0 errors / 0 warnings ✅ |
| 4 个 P4 修改文件 | 0 errors / 0 warnings ✅ |
| 全部 `.js` (107 个) | 13 errors / 20 warnings（**pre-existing**，全在 test 文件单引号风格） |

### Jest

| 状态 | 失败 suite | 失败 tests | 通过 tests |
|---|---|---|---|
| 修复前（基线） | 15+ | 127 | 2472 |
| **修复后** | **15**（pre-existing） | **9**（pre-existing） | **2590** |

**净收益**: 失败 -118 tests，通过 +118 tests。

**剩余 9 个失败原因**（pre-existing，与本次清理无关）:
- `payment-state-machine` 模块路径错误（`cloudfunctions/paymentService/common/payment-state-machine` 应为 `cloudfunctions/common/payment-state-machine`）
- 5 个 common-*ts-migration 测试期望 `.ts` 源文件存在但缺失
- 3 个 integration 链路测试由于上述模块缺失级联失败

### 包文件

| 服务 | package.json | package-lock.json |
|---|---|---|
| adminService | ✅ | ✅ 新增 |
| couponExpiryCheck | ✅ | ✅ 新增 |
| i18nOverride | ✅ | ✅ 新增 |
| orderTimeoutService | ✅ | ✅ 新增 |
| tuanService | ✅ | ✅ 新增 |
| tuanExpiryCheck | ✅ | ✅ 新增 |

---

## 已识别的后续工作（不属本次范围）

### C 类低风险（已识别未处理）

- C1: 4 个 cloudfunctions 的 tsconfig 仍 include 不存在的 .ts 源
- C2: `scripts/audit-*.js` 中 2 个脚本有未引用的依赖
- C3: 5 个 subpackage 页面注释掉的事件监听器
- C4: 统一 `i18n` key 命名规范（部分 page 仍用 snake_case）

### D 类安全审计（未启动）

- D1: 敏感字段在日志中的脱敏
- D2: `cloudbase.callFunction` 错误信息泄露内部结构
- D3: `_captureInviterId` 的 inviterId 未做白名单校验
- D4: `safeMode` 加载的本地配置未做签名验证

### 技术债（待规划）

- `payment-state-machine` 模块位置不一致（影响 5 个集成测试）
- `errorConfig/errorStats/errorCollector` 3 个桩文件尚未与 `globalErrorManager.js` 真正合并
- `package.json` scripts 数量已达 99 个，建议拆分到 `scripts/` 目录

---

## 教训记录（供后续 Sprint 参考）

1. **删除 require 前必查引用范围**：用 grep 必须同时匹配 `./module` 和 `utils/module` 两种写法（绝对/相对路径都覆盖）
2. **删除 import 立即跑 Node 加载测试**：不是 lint + 单测，而是 `node -e "require('./module')"` 真实加载
3. **删除 console.log 后查未用变量**：保留被删除 log 中使用的变量会产生 no-unused-vars warning
4. **app.js 是高耦合入口**：每次修改 require 清单必须重新 review 整个文件所有引用

---

## 关联 commit 建议

按以下顺序分批提交，便于回滚与 code review：

```bash
# Batch 1: 文档与死代码（风险最低）
git add -A  # 44 MD + 17 死代码 + .env/config
git commit -m "chore: 清理 44 个过时 MD + 17 个死代码文件"

# Batch 2: 配置与脚本
git commit -m "chore: 删除 4 个死 npm 脚本 + deploy 脚本精简 + env 模板合并"

# Batch 3: A 高风险
git commit -m "refactor(app): 删除 6 个死方法 + 24 个调试 console.log (A1/A3)"

# Batch 4: B 中风险
git commit -m "fix(cloudbase): secret/apiKey 缺失时 throw + wx-server-sdk 升 2.7.0 (B2/B3)"
git commit -m "chore: 5 个空 catch 加 warn + 6 个服务补 lock 文件 (B1/B4)"

# Batch 5: 回归修复
git commit -m "fix(app): 恢复 safeMode require（误删回退）"
```
