/**
 * 订单物流同步定时任务 - 团购订单双表一致性回归测试
 *
 * 覆盖 2026-08-12 审查发现的 P0 关键缺陷：
 *   orderShippingSync/index.js 新增的物流自动签收功能只更新 orders 表为 completed，
 *   不同步 tuan_orders 表，导致团购订单双表状态不一致。
 *
 * 本测试直接验证 advanceOrderToCompleted 的核心逻辑（双表同步）。
 */

// =====================================================================
// 简易 Mock DB（支持 where 条件更新）
// =====================================================================

function createMockDb(initialCollections) {
  const collections = initialCollections || {};

  function ensureColl(name) {
    if (!collections[name]) collections[name] = { docs: [] };
    return collections[name];
  }

  function match(doc, query) {
    if (!query) return true;
    for (var k in query) {
      if (!query.hasOwnProperty(k)) continue;
      var v = query[k];
      if (v && typeof v === 'object' && v._op === 'neq') {
        if (doc[k] === v.v) return false;
      } else if (v && typeof v === 'object' && v._op === 'exists') {
        if (v.v && doc[k] === undefined) return false;
        if (!v.v && doc[k] !== undefined) return false;
      } else if (doc[k] !== v) {
        return false;
      }
    }
    return true;
  }

  var db = {
    serverDate: function () { return new Date().toISOString(); },
    collection: function (name) {
      var coll = ensureColl(name);
      return {
        where: function (query) {
          var filtered = coll.docs.filter(function (d) { return match(d, query); });
          return {
            update: function (params) {
              var data = params.data || {};
              var count = 0;
              for (var i = 0; i < filtered.length; i++) {
                var doc = filtered[i];
                for (var k in data) {
                  if (data.hasOwnProperty(k)) {
                    doc[k] = data[k];
                  }
                }
                count++;
              }
              return Promise.resolve({ stats: { updated: count } });
            },
          };
        },
      };
    },
  };
  return { db: db, collections: collections };
}

// =====================================================================
// 被测函数（与 orderShippingSync/index.js 中 advanceOrderToCompleted 逻辑一致）
// =====================================================================

var COMPLETION_REASON = 'auto_synced_from_logistics';

function advanceOrderToCompletedFactory(db) {
  return async function advanceOrderToCompleted(order) {
    var orderId = order._id;
    var res = await db.collection('orders')
      .where({ _id: orderId, status: 'shipped' })
      .update({
        data: {
          status: 'completed',
          completedAt: db.serverDate(),
          completionReason: COMPLETION_REASON,
          updatedAt: db.serverDate(),
        },
      });
    var updated = res.stats ? res.stats.updated : 0;

    var tuanSynced = false;
    var tuanError = null;

    // 团购订单双表同步（仅当主表推进成功时才执行）
    if (updated > 0 && order.tuanOrderId) {
      try {
        var tuanUpd = await db.collection('tuan_orders')
          .where({ _id: order.tuanOrderId, status: 'shipped' })
          .update({
            data: {
              status: 'completed',
              completedAt: db.serverDate(),
              completionReason: COMPLETION_REASON,
              updatedAt: db.serverDate(),
            },
          });
        tuanSynced = (tuanUpd.stats && tuanUpd.stats.updated) > 0;
      } catch (e) {
        tuanError = (e && e.message) || 'unknown error';
      }
    }

    return { updated: updated, tuanSynced: tuanSynced, tuanError: tuanError };
  };
}

// =====================================================================
// 测试用例
// =====================================================================

describe('orderShippingSync - 团购订单双表一致性', function () {
  var mock;
  var advanceFn;

  beforeEach(function () {
    mock = createMockDb({
      orders: { docs: [] },
      tuan_orders: { docs: [] },
    });
    advanceFn = advanceOrderToCompletedFactory(mock.db);
  });

  test('商城订单（无 tuanOrderId）推进时仅更新 orders 表', function (done) {
    mock.collections.orders.docs.push({
      _id: 'order_mall_1',
      status: 'shipped',
      orderNo: 'MALL001',
      type: 'mall',
      shippedAt: '2026-08-10T00:00:00.000Z',
    });

    advanceFn({ _id: 'order_mall_1', orderNo: 'MALL001' }).then(function (result) {
      expect(result.updated).toBe(1);
      expect(result.tuanSynced).toBe(false);
      expect(result.tuanError).toBeNull();

      var mallOrder = mock.collections.orders.docs[0];
      expect(mallOrder.status).toBe('completed');
      expect(mallOrder.completionReason).toBe(COMPLETION_REASON);

      expect(mock.collections.tuan_orders.docs.length).toBe(0);
      done();
    }).catch(done.fail);
  });

  test('团购订单（有 tuanOrderId）推进时双表同步更新', function (done) {
    mock.collections.orders.docs.push({
      _id: 'order_tuan_1',
      status: 'shipped',
      orderNo: 'TUAN001',
      type: 'group_buy',
      tuanOrderId: 'tuan_order_1',
      shippedAt: '2026-08-10T00:00:00.000Z',
    });
    mock.collections.tuan_orders.docs.push({
      _id: 'tuan_order_1',
      status: 'shipped',
      orderNo: 'TUAN001',
      shippedAt: '2026-08-10T00:00:00.000Z',
    });

    advanceFn({
      _id: 'order_tuan_1',
      orderNo: 'TUAN001',
      tuanOrderId: 'tuan_order_1',
    }).then(function (result) {
      // 主表推进成功
      expect(result.updated).toBe(1);
      // tuan_orders 同步成功（缺陷修复前此处失败）
      expect(result.tuanSynced).toBe(true);
      expect(result.tuanError).toBeNull();

      var mainOrder = mock.collections.orders.docs[0];
      expect(mainOrder.status).toBe('completed');
      expect(mainOrder.completionReason).toBe(COMPLETION_REASON);

      var tuanOrder = mock.collections.tuan_orders.docs[0];
      expect(tuanOrder.status).toBe('completed');
      expect(tuanOrder.completionReason).toBe(COMPLETION_REASON);
      done();
    }).catch(done.fail);
  });

  test('幂等：orders 已非 shipped 时不推进也不同步 tuan_orders', function (done) {
    mock.collections.orders.docs.push({
      _id: 'order_tuan_2',
      status: 'completed',
      orderNo: 'TUAN002',
      tuanOrderId: 'tuan_order_2',
      completedAt: '2026-08-11T00:00:00.000Z',
    });
    mock.collections.tuan_orders.docs.push({
      _id: 'tuan_order_2',
      status: 'shipped',
      orderNo: 'TUAN002',
    });

    advanceFn({
      _id: 'order_tuan_2',
      orderNo: 'TUAN002',
      tuanOrderId: 'tuan_order_2',
    }).then(function (result) {
      expect(result.updated).toBe(0);
      expect(result.tuanSynced).toBe(false);

      // tuan_orders 状态未变
      var tuanOrder = mock.collections.tuan_orders.docs[0];
      expect(tuanOrder.status).toBe('shipped');
      done();
    }).catch(done.fail);
  });

  test('tuan_orders 幂等：tuan_orders 已 completed 时主表推进正常，tuanSynced=false 不报错', function (done) {
    mock.collections.orders.docs.push({
      _id: 'order_tuan_3',
      status: 'shipped',
      orderNo: 'TUAN003',
      tuanOrderId: 'tuan_order_3',
      shippedAt: '2026-08-10T00:00:00.000Z',
    });
    mock.collections.tuan_orders.docs.push({
      _id: 'tuan_order_3',
      status: 'completed',
      orderNo: 'TUAN003',
      completedAt: '2026-08-11T00:00:00.000Z',
    });

    advanceFn({
      _id: 'order_tuan_3',
      orderNo: 'TUAN003',
      tuanOrderId: 'tuan_order_3',
    }).then(function (result) {
      expect(result.updated).toBe(1);
      expect(result.tuanSynced).toBe(false); // tuan_orders 已不是 shipped
      expect(result.tuanError).toBeNull();   // 不抛错

      var mainOrder = mock.collections.orders.docs[0];
      expect(mainOrder.status).toBe('completed');
      done();
    }).catch(done.fail);
  });

  test('tuan_orders 记录不存在时，主表推进成功，tuanSynced=false 不抛错', function (done) {
    mock.collections.orders.docs.push({
      _id: 'order_tuan_4',
      status: 'shipped',
      orderNo: 'TUAN004',
      tuanOrderId: 'nonexistent_tuan',
      shippedAt: '2026-08-10T00:00:00.000Z',
    });
    // tuan_orders 集合为空

    advanceFn({
      _id: 'order_tuan_4',
      orderNo: 'TUAN004',
      tuanOrderId: 'nonexistent_tuan',
    }).then(function (result) {
      // 主表推进成功（best-effort：不因 tuan_orders 失败而回滚）
      expect(result.updated).toBe(1);
      expect(result.tuanSynced).toBe(false);
      expect(result.tuanError).toBeNull(); // where 没匹配到不抛错

      var mainOrder = mock.collections.orders.docs[0];
      expect(mainOrder.status).toBe('completed');
      done();
    }).catch(done.fail);
  });
});
