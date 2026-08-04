"use strict";
/**
 * 内存版 CloudBase database mock（仅用于 orderTimeoutService 等云函数行为测试）
 *
 * 设计目标：
 *   - 提供带真实内存状态的 database()，替代 wx-server-sdk 的远程实现
 *   - 支持 orderTimeoutService 实际使用的查询算子：
 *       eq / neq / in（含 null 匹配字段缺失）/ lte / gte / exists
 *   - 支持链式 where().field().skip().limit().get()/update() 与 doc(id).update()/get()
 *   - 支持更新算子 inc（_.inc(n) 真正增减）
 *   - add() 用于 recordAlert 等写入
 *
 * 用法：
 *   const { getDb, resetDb, seed, getStore } = require('./helpers/mockdb')
 *   jest.mock('wx-server-sdk', () => ({
 *     init: jest.fn(),
 *     DYNAMIC_CURRENT_ENV: 'mock',
 *     database: () => getDb(),
 *   }))
 */

// 内存存储：{ collectionName: [doc, ...] }
const store = {};

/**
 * 统一转时间戳：Date / ISO 字符串 / 数字 → 毫秒数
 * 关键修复：真实 CloudBase 的 _.lte(date) 由服务端做日期比较；
 * 本地 mock 若直接用 `<=`，Date 对象（ToPrimitive 取 valueOf→时间戳）与
 * 字符串日期（ToNumber→NaN）比较会得到 NaN，导致所有带 createdAt 的订单漏匹配。
 */
function toTime(x) {
  if (x instanceof Date) return x.getTime();
  if (typeof x === "string" && !isNaN(Date.parse(x))) return new Date(x).getTime();
  if (typeof x === "number") return x;
  return Number(x); // 兜底（NaN 会使比较为 false，符合预期）
}

/** 单算子匹配（不提前 return 整体，允许继续检查后续字段） */
function matchOp(val, v) {
  switch (v._op) {
    case "eq":
      return val === v.v;
    case "neq":
      return val !== v.v;
    case "in":
      if (v.v.includes(null)) {
        // 含 null：字段缺失（undefined）视为匹配该 in 条件，但需继续检查其他字段
        if (val === undefined) return true;
        return v.v.includes(val);
      }
      return v.v.includes(val);
    case "lte":
      return toTime(val) <= toTime(v.v);
    case "gte":
      return toTime(val) >= toTime(v.v);
    case "exists": {
      const has = val !== undefined;
      return v.v ? has : !has;
    }
    default:
      return true;
  }
}

/**
 * 判断单条文档是否匹配查询条件
 * 支持：标量等值、_op 算子（eq/neq/in/lte/gte/exists）
 * 关键：_.in 数组含 null 时，同时匹配「字段缺失（undefined）」的文档
 *   —— 这正是 P0-1 修复的核心语义（活动报名缺 paymentStatus 也要被扫到）
 */
function matchQuery(doc, query) {
  for (const [k, v] of Object.entries(query || {})) {
    if (v && typeof v === "object" && v._op) {
      if (!matchOp(doc[k], v)) return false;
    } else {
      // 标量等值匹配
      if (doc[k] !== v) return false;
    }
  }
  return true;
}

/** 应用更新（支持 _.inc） */
function applyUpdate(doc, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && v._op === "inc") {
      doc[k] = (Number(doc[k]) || 0) + Number(v.v);
    } else {
      doc[k] = v;
    }
  }
}

/** 链式查询 builder（记忆 where/skip/limit） */
function makeBuilder(name, query) {
  const b = {
    _skip: 0,
    _limit: Infinity,
    field() {
      return b;
    },
    orderBy() {
      return b;
    },
    skip(n) {
      b._skip = n;
      return b;
    },
    limit(n) {
      b._limit = n;
      return b;
    },
    async get() {
      const matched = (store[name] || []).filter((d) => matchQuery(d, query));
      const sliced = matched.slice(b._skip, b._skip + b._limit);
      return { data: sliced };
    },
    async count() {
      const matched = (store[name] || []).filter((d) => matchQuery(d, query));
      return { total: matched.length };
    },
    async update({ data }) {
      const matched = (store[name] || []).filter((d) => matchQuery(d, query));
      let updated = 0;
      for (const d of matched) {
        applyUpdate(d, data);
        updated++;
      }
      return { updated, stats: { updated } };
    },
  };
  return b;
}

/** 单文档操作 */
function makeDoc(name, id) {
  return {
    async get() {
      const d = (store[name] || []).find((x) => x._id === id);
      return { data: d || null };
    },
    async update({ data }) {
      const d = (store[name] || []).find((x) => x._id === id);
      if (d) {
        applyUpdate(d, data);
        return { updated: 1, stats: { updated: 1 } };
      }
      return { updated: 0, stats: { updated: 0 } };
    },
    async set({ data }) {
      const i = (store[name] || []).findIndex((x) => x._id === id);
      if (i >= 0) {
        store[name][i] = { ...store[name][i], ...data };
      } else {
        store[name].push({ _id: id, ...data });
      }
      return { _id: id };
    },
    async remove() {
      const i = (store[name] || []).findIndex((x) => x._id === id);
      if (i >= 0) {
        store[name].splice(i, 1);
        return { deleted: 1 };
      }
      return { deleted: 0 };
    },
  };
}

/** 返回共享内存 store 的 database() 实例 */
function getDb() {
  const command = {
    inc: (v) => ({ _op: "inc", v }),
    in: (arr) => ({ _op: "in", v: arr }),
    lte: (v) => ({ _op: "lte", v }),
    gte: (v) => ({ _op: "gte", v }),
    eq: (v) => ({ _op: "eq", v }),
    neq: (v) => ({ _op: "neq", v }),
    exists: (v) => ({ _op: "exists", v }),
    and: (...a) => ({ _op: "and", args: a }),
    or: (...a) => ({ _op: "or", args: a }),
  };
  return {
    command,
    serverDate: () => new Date(),
    collection: (name) => ({
      where: (q) => makeBuilder(name, q),
      doc: (id) => makeDoc(name, id),
      add: async ({ data }) => {
        const doc = { ...data };
        if (!doc._id) doc._id = "auto-" + Math.random().toString(36).slice(2);
        store[name] = store[name] || [];
        store[name].push(doc);
        return { _id: doc._id };
      },
      field() {
        return this;
      },
    }),
  };
}

/** 清空所有集合（测试间隔离） */
function resetDb() {
  for (const k of Object.keys(store)) delete store[k];
}

/** 注入测试数据（深拷贝，避免测试间引用串扰） */
function seed(name, docs) {
  store[name] = docs.map((d) => ({ ...d }));
}

/** 读取当前 store（断言用） */
function getStore() {
  return store;
}

module.exports = { getDb, resetDb, seed, getStore, matchQuery };
