"use strict";
/**
 * common/commission-utils 统一写入器行为测试
 *
 * 背景（2026-08-02 P0）：
 *   线上 system_config.commission_rates 与 admins.commissionRates 的寄养费率键是 `hosting`，
 *   而写入器一直用 rates['boarding'] 查询 → undefined → rate=0 → 寄养佣金永恒为 0。
 *   本测试锁死「费率键别名」「类型规范化」「金额字段路由」「幂等」四类行为，防止回归。
 *
 * 测试方式：
 *   每个用例通过 jest.resetModules() + 内存 mockdb 重新加载模块，
 *   避免模块级 system_config 缓存（TTL 5 分钟）在用例间串扰。
 */

/** 重新加载被测模块（隔离模块级缓存），返回模块与该次实例化的 mockdb */
function loadModule() {
  jest.resetModules();
  const mockdb = require("./helpers/mockdb");
  jest.doMock("wx-server-sdk", () => ({
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: "mock",
    database: () => mockdb.getDb(),
  }));
  const mod = require("../cloudfunctions/common/commission-utils");
  return { mod, ...mockdb };
}

/** 常用种子：买家 buyer1（邀请人 inviter1）+ 邀请人档案 */
function seedUsers(seed) {
  seed("users", [
    { _id: "buyer1", inviterId: "inviter1", nickName: "买家" },
    { _id: "inviter1", nickName: "合伙人A" },
    { _id: "selfBuyer", inviterId: "selfBuyer", nickName: "自购用户" },
  ]);
}

describe("commission-utils 统一写入器", () => {
  describe("P0：费率键别名（hosting ↔ boarding ↔ order）", () => {
    it("admins.commissionRates 只有 hosting 键时，boarding 订单仍应建佣", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", [{ _id: "inviter1", commissionRates: { hosting: 1, mall: 5 } }]);
      seed("commissions", []);

      await mod.createCommissionRecord("boarding", {
        _id: "order1",
        ownerId: "buyer1",
        totalPrice: 500,
        orderNo: "ORDER_1",
      });

      const list = getStore().commissions || [];
      expect(list).toHaveLength(1);
      expect(list[0].orderType).toBe("boarding");
      expect(list[0].commissionRate).toBe(1);
      expect(list[0].commissionAmount).toBe(5);
      expect(list[0].status).toBe("pending");
    });

    it("system_config 只有 hosting 键时，回退路径也应命中", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", []);
      seed("system_config", [{ _id: "commission_rates", hosting: 2, mall: 5 }]);
      seed("commissions", []);

      await mod.createCommissionRecord("boarding", {
        _id: "order2",
        ownerId: "buyer1",
        totalPrice: 300,
      });

      const list = getStore().commissions || [];
      expect(list).toHaveLength(1);
      expect(list[0].commissionRate).toBe(2);
      expect(list[0].commissionAmount).toBe(6);
    });

    it("调用方传 order / hosting 别名时，写入的 orderType 统一规范为 boarding", async () => {
      for (const rawType of ["order", "hosting"]) {
        const { mod, seed, getStore } = loadModule();
        seedUsers(seed);
        seed("admins", [{ _id: "inviter1", commissionRates: { hosting: 1 } }]);
        seed("commissions", []);

        await mod.createCommissionRecord(rawType, {
          _id: `order_${rawType}`,
          ownerId: "buyer1",
          totalPrice: 100,
        });

        const list = getStore().commissions || [];
        expect(list).toHaveLength(1);
        expect(list[0].orderType).toBe("boarding");
      }
    });

    it("group_buy 别名规范为 tuan", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", [{ _id: "inviter1", commissionRates: { tuan: 5 } }]);
      seed("commissions", []);

      await mod.createCommissionRecord("group_buy", {
        _id: "order_tuan",
        ownerId: "buyer1",
        totalPrice: 200,
      });

      const list = getStore().commissions || [];
      expect(list).toHaveLength(1);
      expect(list[0].orderType).toBe("tuan");
      expect(list[0].commissionAmount).toBe(10);
    });
  });

  describe("金额字段按 orderType 路由", () => {
    it("activity 取 finalAmount（而非 totalPrice）", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", [{ _id: "inviter1", commissionRates: { activity: 10 } }]);
      seed("commissions", []);

      await mod.createCommissionRecord("activity", {
        _id: "act1",
        ownerId: "buyer1",
        totalPrice: 999, // 干扰字段：原价
        finalAmount: 100, // 实付
      });

      const list = getStore().commissions || [];
      expect(list[0].orderAmount).toBe(100);
      expect(list[0].commissionAmount).toBe(10);
    });

    it("activity 缺 finalAmount 时取 totalAmount（保持与 activityService 旧口径一致，不落到 totalPrice）", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", [{ _id: "inviter1", commissionRates: { activity: 10 } }]);
      seed("commissions", []);

      await mod.createCommissionRecord("activity", {
        _id: "act2",
        ownerId: "buyer1",
        totalPrice: 999, // 原价（旧实现同样不取）
        totalAmount: 200,
      });

      const list = getStore().commissions || [];
      expect(list[0].orderAmount).toBe(200);
    });

    it("feeding 取 totalAmount", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", [{ _id: "inviter1", commissionRates: { feeding: 10 } }]);
      seed("commissions", []);

      await mod.createCommissionRecord("feeding", {
        _id: "fd1",
        ownerId: "buyer1",
        totalAmount: 80,
      });

      const list = getStore().commissions || [];
      expect(list[0].orderAmount).toBe(80);
      expect(list[0].commissionAmount).toBe(8);
    });

    it("主字段缺失时走兼容回退链（历史订单）", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", [{ _id: "inviter1", commissionRates: { hosting: 10 } }]);
      seed("commissions", []);

      await mod.createCommissionRecord("boarding", {
        _id: "legacy1",
        ownerId: "buyer1",
        basicPrice: 50, // 仅有历史字段
      });

      const list = getStore().commissions || [];
      expect(list[0].orderAmount).toBe(50);
      expect(list[0].commissionAmount).toBe(5);
    });
  });

  describe("幂等与跳过条件", () => {
    it("同一订单重复触发只写入一条（确定性 _id）", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", [{ _id: "inviter1", commissionRates: { mall: 5 } }]);
      seed("commissions", []);

      const order = { _id: "mall1", ownerId: "buyer1", totalPrice: 100 };
      await mod.createCommissionRecord("mall", order);
      await mod.createCommissionRecord("mall", order);

      const list = getStore().commissions || [];
      expect(list).toHaveLength(1);
      expect(list[0]._id).toBe("commission_mall1_inviter1");
    });

    it("自购订单（inviterId === ownerId）不发佣", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", [{ _id: "selfBuyer", commissionRates: { mall: 5 } }]);
      seed("commissions", []);

      await mod.createCommissionRecord("mall", {
        _id: "self1",
        ownerId: "selfBuyer",
        totalPrice: 100,
      });

      expect(getStore().commissions || []).toHaveLength(0);
    });

    it("费率为 0 时不发佣", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", [{ _id: "inviter1", commissionRates: { mall: 0 } }]);
      seed("system_config", [{ _id: "commission_rates", mall: 0 }]);
      seed("commissions", []);

      await mod.createCommissionRecord("mall", {
        _id: "zero1",
        ownerId: "buyer1",
        totalPrice: 100,
      });

      expect(getStore().commissions || []).toHaveLength(0);
    });

    it("订单金额 < ¥1 时不发佣", async () => {
      const { mod, seed, getStore } = loadModule();
      seedUsers(seed);
      seed("admins", [{ _id: "inviter1", commissionRates: { mall: 5 } }]);
      seed("commissions", []);

      await mod.createCommissionRecord("mall", {
        _id: "tiny1",
        ownerId: "buyer1",
        totalPrice: 0.5,
      });

      expect(getStore().commissions || []).toHaveLength(0);
    });
  });

  describe("cancelCommissionRecord", () => {
    it("将该订单的 pending 佣金置为 cancelled，已结算记录不动", async () => {
      const { mod, seed, getStore } = loadModule();
      seed("commissions", [
        { _id: "c1", orderId: "o1", status: "pending" },
        { _id: "c2", orderId: "o1", status: "settled" },
        { _id: "c3", orderId: "o2", status: "pending" },
      ]);

      await mod.cancelCommissionRecord("o1");

      const byId = Object.fromEntries((getStore().commissions || []).map((c) => [c._id, c]));
      expect(byId.c1.status).toBe("cancelled");
      expect(byId.c2.status).toBe("settled");
      expect(byId.c3.status).toBe("pending");
    });
  });

  describe("纯函数导出", () => {
    it("pickRate 按别名候选顺序命中", () => {
      const { mod } = loadModule();
      expect(mod.pickRate({ hosting: 3 }, "boarding")).toBe(3);
      expect(mod.pickRate({ boarding: 4, hosting: 3 }, "boarding")).toBe(4);
      expect(mod.pickRate({ mall: 5 }, "boarding")).toBe(0);
      expect(mod.pickRate(null, "boarding")).toBe(0);
    });

    it("normalizeOrderType 收敛别名", () => {
      const { mod } = loadModule();
      expect(mod.normalizeOrderType("order")).toBe("boarding");
      expect(mod.normalizeOrderType("hosting")).toBe("boarding");
      expect(mod.normalizeOrderType("group_buy")).toBe("tuan");
      expect(mod.normalizeOrderType("mall")).toBe("mall");
    });

    it("isDuplicateKeyError 识别 CloudBase / MongoDB 冲突码", () => {
      const { mod } = loadModule();
      expect(mod.isDuplicateKeyError({ errCode: -502019 })).toBe(true);
      expect(mod.isDuplicateKeyError({ errCode: -502001 })).toBe(true); // activityService 本地版曾用码
      expect(mod.isDuplicateKeyError({ code: 11000 })).toBe(true);
      expect(mod.isDuplicateKeyError({ message: "E11000 duplicate key" })).toBe(true);
      expect(mod.isDuplicateKeyError({ message: "network error" })).toBe(false);
      expect(mod.isDuplicateKeyError(null)).toBe(false);
    });
  });
});
