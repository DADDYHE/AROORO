# 性能基线测试（k6）

> 版本：Sprint 9 初稿 · Sprint 14 完善（CI 接入） · 配套脚本：`scripts/perf/main-flow.js` + `scripts/perf/ci-smoke.js`

## 目标

1. 建立「下单 → 支付」主链路的 P50 / P95 / P99 基线
2. 每次大改（重构 / 库升级 / DB 索引变更）后跑一次基线对比，发现回归
3. 为后续容量评估（VUser → QPS 拐点）提供入口
4. **Sprint 14**：CI 自动跑 mini smoke，工具链健康度回归保护

## 脚本清单

| 脚本 | 用途 | 跑法 |
| --- | --- | --- |
| `main-flow.js` | 真实压测脚本（calculatePrice → createOrder → createPayment） | 需 `BASE_URL` + `CLOUDBASE_ENV` |
| `ci-smoke.js` | CI 健康检查（不发真实请求，仅工具链回归） | `k6 run scripts/perf/ci-smoke.js` |

## 工具

- [k6](https://k6.io/docs/getting-started/installation/)：云函数侧使用
- 基线数据落盘：每次 `k6 run` 后输出 `results/sprint9-baseline-summary.json`
- CI smoke 数据落盘：`results/k6-ci-smoke-summary.json`

## 阶梯配置（main-flow.js）

| 阶段 | 用途 | VU | 持续 | 触发条件 |
| --- | --- | --- | --- | --- |
| smoke | 验证环境正常 | 1 | 10s | 每次跑 |
| baseline | 稳态指标 | 10 | 30s | Sprint 末 |
| stress | 探拐点 | 50 | 1m | 容量评估 |
| limit | 探极限 | 100 | 1m | 仅容量评估时 |

通过 `STAGES=baseline` 切换。

## 阈值（Thresholds）

### main-flow.js
- 主链路 P95 < **1500ms**（业务目标）
- 失败率 < **1%**
- 业务错误率 < **5%**（4xx 业务码）

### ci-smoke.js（Sprint 14）
- `smoke_checks_total` count > 0（至少完成一次心跳）
- `heartbeat_ms` P95 < 200ms（本地 sleep 模拟）
- `http_req_failed` rate < 1%

阈值未达 → k6 退出非 0，可接入 CI fail 机制。

## 跑法

```bash
# 1. 冒烟（默认）
k6 run scripts/perf/main-flow.js

# 2. 基线
STAGES=baseline k6 run \
  --out json=results/sprint9-baseline.json \
  --env BASE_URL=https://staging.example.com \
  --env CLOUDBASE_ENV=staging-1 \
  scripts/perf/main-flow.js

# 3. 压测
STAGES=stress k6 run scripts/perf/main-flow.js

# 4. CI smoke（无需 BASE_URL）
k6 run --vus 1 --duration 5s scripts/perf/ci-smoke.js

# 5. 语法检查（仅编译，不执行）
k6 inspect scripts/perf/main-flow.js
k6 inspect scripts/perf/ci-smoke.js
```

## CI 集成（Sprint 14）

`.github/workflows/ci.yml` 中新增两个 job：

| Job | 触发条件 | 作用 | 失败行为 |
| --- | --- | --- | --- |
| `k6-smoke` | 所有 PR + push | 工具链健康 + 脚本语法检查 | `continue-on-error: true`（仅警告） |
| `k6-main` | 仅 main 分支 push | 跑真实 staging 基线（需 secrets） | `continue-on-error: true`（不阻塞 PR） |

`k6-smoke` job 的核心步骤：

1. **安装 k6**：通过官方 APT 源（避免镜像漂移）
2. **运行 5s 心跳**：`k6 run scripts/perf/ci-smoke.js`
3. **脚本语法验证**：`k6 inspect` 解析 main-flow.js + ci-smoke.js
4. **归档结果**：14 天保留

`k6-main` job 额外读取 `STAGING_BASE_URL` / `STAGING_CLOUDBASE_ENV` secrets，
未配置时降级为 `k6 inspect`（不阻断合并）。

## 结果解读

k6 输出的 `data.metrics` 包含：

| 指标 | 含义 | 关注值 |
| --- | --- | --- |
| `http_req_duration` P95 | 全 HTTP 请求 P95 | < 1500ms |
| `calculate_price_duration` P95 | 价格预估 P95 | < 500ms |
| `create_order_duration` P95 | 下单 P95 | < 800ms |
| `pay_duration` P95 | 调起支付 P95 | < 1200ms |
| `business_error_rate` | 业务错误（4xx 业务码）率 | < 5% |

## 当前基线（Sprint 9 末）

> 待首次跑完后回填，建议保留近 3 个 Sprint 的基线用于趋势对比

| 阶段 | calculatePrice P95 | createOrder P95 | pay P95 | 备注 |
| --- | --- | --- | --- | --- |
| baseline (10 VU) | - | - | - | 首次采集 |
| stress (50 VU) | - | - | - | 拐点评估 |

## 注意事项

- k6 默认会对同一 host 复用连接（`noConnectionReuse: false`），符合云函数调用模式
- 测试用 `openid` 应在测试环境中**预先创建**对应 `users` 记录，否则会被 `AUTH_REQUIRED` 拒
- 微信支付 mock：`createPayment` 走 staging 配置的 mock URL（`https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi` 替换为本地 stub）
- **CI smoke 模式下不发起真实请求**，仅做工具链健康自检，避免对生产环境造成负载

## 后续（Sprint 15+）

- [ ] 集成到 CloudBase CLI，定时跑 + 报警
- [ ] 增加 evaluation 链路、commission 链路压测
- [ ] 与 APM（CloudBase 监控 / 自建 Prometheus）打通，把 P95 写入 dashboard
- [ ] 数据库侧：EXPLAIN 关键查询 + 慢日志采集
- [ ] Sprint 15+ 计划：把 k6 报告写回 docs/perf/ 目录，长期对比
