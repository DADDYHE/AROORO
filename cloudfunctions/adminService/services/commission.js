"use strict";
/**
 * services/commission.js - adminService 佣金记录入口（桥接层）
 *
 * hosting / feeding / mall 三个 service 完成订单时通过
 *   const { createCommissionRecord } = require('./commission')
 * 调用本模块，创建佣金记录（best-effort）。
 *
 * 实际实现位于 ../common/commission-utils，这里仅做兼容出口，
 * 避免各 service 直接耦合 common 目录的相对路径。
 */

const { createCommissionRecord, cancelCommissionRecord } = require('../common/commission-utils');

module.exports = {
  createCommissionRecord,
  cancelCommissionRecord,
};
module.exports.default = createCommissionRecord;
