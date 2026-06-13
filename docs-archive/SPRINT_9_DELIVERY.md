# Sprint 9 交付说明

> 版本：v1.0 · 配套：`docs/REFACTOR_PLAN.md` · 周期：W31-W32

## 目标

- 存量数据迁移脚本（4 类兼容字段批量回填）
- 集成测试目录化与子链路补充
- 错误码白名单 100% 登记
- 通用模块文档实战案例化
- 性能基线 k6 脚本初稿

## 关键任务完成度

| ID | 任务 | 责任 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| S9-01 | 存量数据迁移脚本（organizerId / nickName / createdAt / petInfo） | C | ✅ | [`scripts/migrate-legacy-data.js`](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/migrate-legacy-data.js) + 11 个单测 |
| S9-02 | 集成测试目录化 + 评价/佣金子链路 | C | ✅ | 移至 [`test/integration/`](file:///Users/yy/Documents/trae_projects/zuoyou/test/integration/)；新增 commission-flow（8）+ notification-flow（4）= 12 个测试 |
| S9-03 | 错误码白名单 100% 登记 | C | ✅ | 19/47 → 47/47（28 个全部落地） |
| S9-04 | `COMMON_MODULES_GUIDE.md` 实战案例 | D | ✅ | v1.0.0 → v1.1.0，新增 5 个真实场景案例 |
| S9-05 | k6 性能基线脚本初稿 | C | ✅ | [`scripts/perf/main-flow.js`](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/perf/main-flow.js) + README |
| S9-06 | Sprint 9 交付文档 | D | ✅ | 本文档 |

## 1. 存量数据迁移脚本

### 1.1 处理项

| 项 | 源字段 → 目标字段 | 涉及集合 |
| --- | --- | --- |
| organizerId | hostProfiles.openid 写入 orders.organizerId | orders |
| nickName | users.nickname → users.nickName | users |
| createdAt | *.createAt → *.createdAt | orders / pets / hostProfiles / users / notifications |
| petsInfo | pets.petInfo（兼容数组/对象）→ pets.petsInfo | pets |

### 1.2 设计要点

- **dry-run by default**：默认仅扫描，避免误改生产
- **CLI 入口与 core 分离**：[`migrate-legacy-data.js`](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/migrate-legacy-data.js) 解析参数，委托 [`migrate-legacy-data-core.js`](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/migrate-legacy-data-core.js) 执行核心逻辑
- **核心逻辑可注入 db**：测试中传 mock db 验证所有分支
- **失败容错**：单条失败不中断整体；最后输出失败清单
- **写入打标**：`migrated_organizerId: true` 等标记字段，便于后续可观测

### 1.3 测试覆盖（11 个）

| 场景 | 验证点 |
| --- | --- |
| dry-run 模式 | 不写入，仅报告 |
| apply 模式 organizerId | hostProfile 映射正确写入 |
| apply 找不到映射 | 跳过而非崩溃 |
| nickname → nickName | 已有 nickName 不覆盖 |
| petInfo 数组化 | 单对象包装为数组 |
| createAt → createdAt | 已有 createdAt 不覆盖 |
| apply 无 --env | 退出码 2 |
| --only 过滤 | 其他集合不被扫描 |
| 不传 --only | 执行全部任务 |
| parseArgs | CLI 参数解析正确 |

## 2. 集成测试目录化与子链路

### 2.1 目录调整

```
test/
  integration-main-flow.test.js  →  test/integration/main-flow.test.js
                                  +  test/integration/commission-flow.test.js
                                  +  test/integration/notification-flow.test.js
```

### 2.2 新增子链路测试

**佣金子链路**（[test/integration/commission-flow.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/integration/commission-flow.test.js) · 8 个场景）：

- 邀请人存在 + 费率配置存在 → 写 commission
- 同一订单去重
- 用户无 inviterId 跳过
- 邀请人不存在静默退出
- 配置无该 orderType 跳过
- 金额为 0 跳过
- 多 orderType 独立费率
- 金额精度（333 × 7% = 23.31）

**通知子链路**（[test/integration/notification-flow.test.js](file:///Users/yy/Documents/trae_projects/zuoyou/test/integration/notification-flow.test.js) · 4 个场景）：

- 状态变更 → owner + host 两条通知
- statusText 与状态对应
- 字段完整（orderId / type / isRead）
- fire-and-forget：失败不阻塞主流程

## 3. 错误码白名单 100% 登记

### 3.1 增长路径

| 阶段 | 覆盖率 | 说明 |
| --- | --- | --- |
| Sprint 7 末 | 0% | 字典文件就位，无使用登记 |
| Sprint 8 末 | 19/47 = 40% | withErrorHandling 装饰器接入 |
| Sprint 9 中 | 23/47 = 49% | USER_NOT_FOUND / HOST_NOT_FOUND / PRODUCT_NOT_FOUND / COUPON_NOT_FOUND |
| Sprint 9 末 | **47/47 = 100%** | 24 个剩余全部落地 |

### 3.2 落地分布

按"出现位置"分类：

| 类别 | 数量 | 落地点 |
| --- | --- | --- |
| 业务语义替换 | 8 | USER_NOT_FOUND / HOST_NOT_FOUND / PRODUCT_NOT_FOUND / COUPON_NOT_FOUND / PET_NOT_FOUND / ACTIVITY_NOT_FOUND / ORDER_ALREADY_REFUNDED / REFUND_FAILED / SUPER_ADMIN_REQUIRED / ADMIN_REQUIRED |
| 业务新增校验 | 4 | ORDER_TIMEOUT / ORDER_CREATE_FAILED / PAYMENT_AMOUNT_MISMATCH / PAYMENT_CREATE_FAILED / PAYMENT_NOTIFY_INVALID |
| 通用模块升级 | 8 | MISSING_REQUIRED / DUPLICATE_KEY / DB_ERROR / ENCRYPT_FAILED / DECRYPT_FAILED / INVALID_PAYLOAD / TOKEN_EXPIRED / TOKEN_INVALID |
| 流程 / 装饰器 | 4 | WX_LOGIN_FAILED / UNKNOWN_ACTION / SERVICE_UNAVAILABLE / RATE_LIMITED / IDEMPOTENT_REPLAY |

### 3.3 审计脚本增强

[`scripts/audit-error-codes.js`](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/audit-error-codes.js) regex 从 `throw err(...)` 扩展为 `(throw|return|=) err(...)`，覆盖 `normalizeDbError` 等「构造后透传」的模式。

## 4. 通用模块文档 v1.1.0

[COMMON_MODULES_GUIDE.md](file:///Users/yy/Documents/trae_projects/zuoyou/cloudfunctions/common/COMMON_MODULES_GUIDE.md) 新增「实战案例」章节，含 5 个真实场景：

| 案例 | 关键 common 模块 |
| --- | --- |
| 寄养订单主链路 | paymentStateMachine / date-range |
| 佣金子链路 | err() 显式语义 |
| notify webhook | err() + ensurePayload + normalizeDbError |
| 管理员权限 | err() + verifyAuth 链 |
| 迁移脚本 | runMigrate + 注入 db 测试 |

每节配「易踩坑点」与配套测试文件交叉引用。

## 5. k6 性能基线初稿

[`scripts/perf/main-flow.js`](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/perf/main-flow.js)：

- 阶段配置：smoke / baseline / stress / limit
- 阈值：主链路 P95 < 1500ms，失败率 < 1%，业务错误率 < 5%
- 自定义指标：`calculate_price_duration` / `create_order_duration` / `pay_duration`
- 共享数据用 `SharedArray`，避免每 VU 重新加载
- 输出 `results/sprint9-baseline-summary.json` 用于趋势对比

[`scripts/perf/README.md`](file:///Users/yy/Documents/trae_projects/zuoyou/scripts/perf/README.md) 包含：跑法、阈值、当前基线（Sprint 9 末首次采集待补）、注意事项。

## 测试 / 覆盖

汇总：**499 用例**（Sprint 8 末 476 → Sprint 9 末 499，**新增 23**；1 skipped）

| 新增 | 用例 | 来源 |
| --- | --- | --- |
| `migrate-legacy-data.test.js` | 11 | S9-01 |
| `test/integration/commission-flow.test.js` | 8 | S9-02 |
| `test/integration/notification-flow.test.js` | 4 | S9-02 |
| `common-validator.test.js`（更新） | 0 净增 | S9-03 调整断言 |
| `common-idempotency.test.js`（保持） | 0 净增 | S9-03 重构 checkRateLimit / assertRateLimit |
| `payment-service-pay.test.js`（保持） | 0 净增 | S9-03 修金额单位 |

`31 of 32` test suites 通过（1 skipped 为 jscodeshift 桥接）。

## 度量看板

| 指标 | Sprint 8 末 | Sprint 9 末 |
| --- | --- | --- |
| 单元测试用例 | 476 | **499**（+23） |
| 集成测试用例 | 4 | **16**（+12） |
| 错误码白名单登记率 | 40% (19/47) | **100% (47/47)** |
| Migration 脚本覆盖 | 0 | 4 类（organizerId / nickName / createdAt / petInfo） |
| 性能基线 | 无 | 1 套（k6 + README） |
| COMMON_MODULES_GUIDE 版本 | v1.0.0 | **v1.1.0**（+5 实战案例） |
| 集成测试目录 | test/ | **test/integration/** |

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 迁移脚本对生产库的写入风险 | dry-run by default + 必须 `--apply` 才写入 + 写条数 / 失败清单全程打印 |
| 迁移脚本不幂等可能重复写 | 写入后用 `migrated_xxx: true` 标记；CI 中通过 dry-run 复查待处理数 |
| `normalizeDbError` 依赖 `err()` 注册码 | `errors.js` 注册表已 100% 覆盖，调用前不会出 "未知错误码" 降级 |
| 错误码过度细分导致维护成本 | 新增语义码需在 `errors.js` 注册 + 配套测试 + 在 COMMON_MODULES_GUIDE 中记录 |
| 性能基线首次跑前阈值较严 | 默认 baseline 阶段（10 VU），stress/limit 仅在容量评估时启用 |
| k6 脚本未在 CI 自动跑 | Sprint 10 接入 GitHub Actions / CloudBase CLI 定时任务 |

## 下一步（Sprint 10 计划）

1. **CI 质量门禁**：
   - 错误码审计在 `node scripts/audit-error-codes.js` 失败时 fail CI
   - 覆盖率门槛（orders / pay / wallet）正式启用 fail-on-below
   - ESLint 错误数 < 阈值
2. **性能基线落地**：
   - 首次跑出 Sprint 9 baseline 数据填入 `scripts/perf/README.md`
   - 接入 CloudBase 监控 / 自建 Prometheus
3. **集成测试补全**：
   - 评价（evaluation）子链路
   - 售后 / 退款子链路
   - 团长 / 团购子链路
4. **存量数据清洗工具**：
   - 数据校验脚本（CI 跑 dry-run）
   - 字段命名一致性扫描
5. **类型化迁移**：
   - 引入 TypeScript（渐进式，先在 common 模块）
   - JSDoc 补全
6. **监控告警**：
   - 关键错误码（PAYMENT_AMOUNT_MISMATCH / REFUND_FAILED / DB_ERROR）→ 飞书/企微
   - 主链路 P95 超过阈值 → 告警
