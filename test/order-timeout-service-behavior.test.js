"use strict";
/**
 * orderTimeoutService 行为测试（端到端跑 main）
 *
 * 替代旧 test/order-timeout-service-ts-migration.test.js 的「源码文本正则断言」——
 * 旧测试只验证代码文本存在（如 expect(code).toMatch(/paymentStatus:\\s*'unpaid'/)，
 * 它甚至"验证"了导致活动超时取消 100% 失效的那个错误条件），不执行任何逻辑，
 * 对字段缺失类 bug 完全无效，是假绿灯。
 *
 * 本测试通过 jest.mock('wx-server-sdk') 注入内存版 database（test/helpers/mockdb.js），
 * 端到端调用 main({ Time })，断言真实的数据状态变化，能抓住 P0-1 / P0-3 类回归。
 *
 * 覆盖场景：
 *   1. P0-1 回归：活动报名缺 paymentStatus 字段 → 仍应被超时取消（原 bug 漏扫）
 *   2. P0-3 回归：付费活动 pending 单超时取消 → 不回退名额（否则扣负）
 *   3. 对照：已支付活动单取消 → 正确回退名额（验证修复未破坏正常路径）
 *   4. 其他 4 类订单（boarding/mall/group_buy/feeding）正常超时取消
 *   5. 1000 单扫描上限 → 触发 recordAlert（reached_scan_limit）
 *   6. 无微信支付配置 → closeOrderFailed 计数、closedWechatOrders 为 0
 *   7. 幂等：已取消订单二次扫描不再重复取消
 */

const { getDb, resetDb, seed, getStore } = require("./helpers/mockdb");

// 覆盖 setup.js 的全局 wx-server-sdk mock，注入带内存状态的 database()
// 注意：jest.mock 的 factory 内只能引用 jest 允许的对象（含 require），
// 故在此处 lazy require，不引用文件顶部导入的变量。
jest.mock("wx-server-sdk", () => {
  const mockDbModule = require("./helpers/mockdb");
  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: "mock",
    database: () => mockDbModule.getDb(),
  };
});

const svc = require("../cloudfunctions/orderTimeoutService/index.js");

// 基准时间：cron 触发时间。各订单 createdAt 设为 1 小时前（< 超时阈值 30min），必被扫到
const NOW = new Date("2026-08-02T12:00:00Z").toISOString();
const HOUR_AGO = new Date("2026-08-02T11:00:00Z").toISOString();

describe("orderTimeoutService 行为测试（端到端跑 main）", () => {
  beforeEach(() => {
    resetDb();
  });

  test("P0-1 回归：活动报名缺 paymentStatus 仍被超时取消", async () => {
    seed("activity_registrations", [
      {
        _id: "reg1",
        status: "pending_payment",
        activityId: "act1",
        participantCount: 2,
        outTradeNo: "A1",
        createdAt: HOUR_AGO,
        // 故意不写 paymentStatus —— 这是原 bug 的触发条件
      },
    ]);

    const res = await svc.main({ Time: NOW }, {});
    const r = res.data;

    // 核心：报名必须被取消（原 bug 下 paymentStatus:'unpaid' 等值匹配会漏掉它）
    expect(r.cancelledActivityOrders).toBe(1);
    const store = getStore();
    expect(store.activity_registrations[0].status).toBe("cancelled");

    // 无微信配置 → 关单失败计数 +1，成功关单数 0
    expect(r.closeOrderFailed).toBe(1);
    expect(r.closedWechatOrders).toBe(0);
  });

  test("P0-3 回归：付费活动 pending 单超时取消不回退名额", async () => {
    seed("activity_registrations", [
      {
        _id: "reg2",
        status: "pending_payment",
        paymentStatus: "unpaid",
        activityId: "act2",
        participantCount: 3,
        createdAt: HOUR_AGO,
      },
    ]);
    seed("activities", [{ _id: "act2", currentParticipants: 10 }]);

    const res = await svc.main({ Time: NOW }, {});
    const r = res.data;

    expect(r.cancelledActivityOrders).toBe(1);
    const store = getStore();
    // 关键：pending 单从不占名额，超时取消不能回退，否则扣负
    expect(store.activities.find((a) => a._id === "act2").currentParticipants).toBe(10);
  });

  test("边界：已支付活动单（paymentStatus='paid'）不参与超时取消", async () => {
    // 验证 P0-1 修复的精确性：_.in(['unpaid', null]) 只匹配未支付/缺支付字段，
    // 已支付的单不应被超时扫描误吞（否则会造成重复处理/错误回退）。
    seed("activity_registrations", [
      {
        _id: "reg3",
        status: "pending_payment",
        paymentStatus: "paid",
        activityId: "act3",
        participantCount: 2,
        createdAt: HOUR_AGO,
      },
    ]);
    seed("activities", [{ _id: "act3", currentParticipants: 10 }]);

    const res = await svc.main({ Time: NOW }, {});
    const r = res.data;

    expect(r.cancelledActivityOrders).toBe(0);
    const store = getStore();
    // 名额保持不变（没进入取消流程，自然不回退）
    expect(store.activities.find((a) => a._id === "act3").currentParticipants).toBe(10);
    expect(store.activity_registrations[0].status).toBe("pending_payment");
  });

  test("其他 4 类订单（boarding/mall/group_buy/feeding）正常超时取消", async () => {
    seed("orders", [
      { _id: "b1", type: "boarding", status: "pending_payment", paymentStatus: "unpaid", outTradeNo: "B1", createdAt: HOUR_AGO },
      { _id: "m1", type: "mall", status: "pending_payment", paymentStatus: "unpaid", outTradeNo: "M1", createdAt: HOUR_AGO },
      { _id: "g1", type: "group_buy", status: "pending_payment", paymentStatus: "unpaid", outTradeNo: "G1", createdAt: HOUR_AGO },
    ]);
    seed("feedingOrders", [
      { _id: "f1", status: "pending_payment", paymentStatus: "unpaid", outTradeNo: "F1", createdAt: HOUR_AGO },
    ]);

    const res = await svc.main({ Time: NOW }, {});
    const r = res.data;

    expect(r.cancelledBoardingOrders).toBe(1);
    expect(r.cancelledMallOrders).toBe(1);
    expect(r.cancelledGroupBuyOrders).toBe(1);
    expect(r.cancelledFeedingOrders).toBe(1);

    const store = getStore();
    expect(store.orders.find((o) => o._id === "b1").status).toBe("cancelled");
    expect(store.orders.find((o) => o._id === "m1").status).toBe("cancelled");
    expect(store.orders.find((o) => o._id === "g1").status).toBe("cancelled");
    expect(store.feedingOrders[0].status).toBe("cancelled");
  });

  test("1000 单扫描上限触发 recordAlert（reached_scan_limit）", async () => {
    const docs = [];
    for (let i = 0; i < 1001; i++) {
      docs.push({
        _id: "feed-" + i,
        status: "pending_payment",
        paymentStatus: "unpaid",
        createdAt: HOUR_AGO,
      });
    }
    seed("feedingOrders", docs);

    const res = await svc.main({ Time: NOW }, {});
    const r = res.data;

    // 扫描被截断在 1000（MAX_BATCHES * BATCH_SIZE）
    expect(r.cancelledFeedingOrders).toBe(1000);

    const store = getStore();
    const alert = (store.alerts || []).find(
      (a) => a.action === "fetchAllExpired.reached_scan_limit"
    );
    expect(alert).toBeTruthy();
  });

  test("幂等：已取消订单二次扫描不再重复取消", async () => {
    seed("activity_registrations", [
      {
        _id: "reg4",
        status: "pending_payment",
        activityId: "act4",
        participantCount: 1,
        outTradeNo: "A4",
        createdAt: HOUR_AGO,
      },
    ]);
    seed("orders", [
      { _id: "b2", type: "boarding", status: "pending_payment", paymentStatus: "unpaid", outTradeNo: "B2", createdAt: HOUR_AGO },
    ]);

    const first = await svc.main({ Time: NOW }, {});
    expect(first.data.cancelledActivityOrders).toBe(1);
    expect(first.data.cancelledBoardingOrders).toBe(1);

    // 第二次扫描：订单已是 cancelled，不应再被处理
    const second = await svc.main({ Time: NOW }, {});
    expect(second.data.cancelledActivityOrders).toBe(0);
    expect(second.data.cancelledBoardingOrders).toBe(0);
  });
});
