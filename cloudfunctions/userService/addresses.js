"use strict";
/**
 * addresses.ts - 地址服务（TypeScript 源文件 - Sprint 37 迁移）
 *
 * 业务功能：
 *   - 获取地址列表（list）
 *   - 添加地址（add）
 *   - 更新地址（update）
 *   - 删除地址（remove）
 *   - 设置默认地址（setDefault）
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 统一 AddressRecord / AddressInput 接口
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.userService.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDefault = exports.remove = exports.update = exports.add = exports.list = void 0;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err } = require('./common/errors');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('./common/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cloud, db } = initCloud();
const logger = createLogger('userService:addresses');
// =====================================================================
// 常量与辅助函数
// =====================================================================
const ADDRESS_FIELDS = [
    'name',
    'phone',
    'province',
    'city',
    'district',
    'detail',
    'fullAddress',
    'postalCode',
    'isDefault',
];
function filterAddressFields(data) {
    const filtered = {};
    for (const key of ADDRESS_FIELDS) {
        if (data[key] !== undefined) {
            ;
            filtered[key] = data[key];
        }
    }
    return filtered;
}
// =====================================================================
// Handler 实现
// =====================================================================
async function list(event, context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    try {
        // L6 修复：list 加 .limit(50) 兜底，避免无上限拉取（地址通常 <20 条，50 足够且防异常）
        const result = await db.collection('addresses')
            .where({ openid })
            .orderBy('isDefault', 'desc')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        return handleSuccess(result.data || [], '获取地址列表成功');
    }
    catch (error) {
        logger.error('list', error);
        return handleError(error, '获取地址列表失败', ERROR_CODES.DATA);
    }
}
exports.list = list;
async function add(event, context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { address } = event;
    if (!address || !address.name || !address.phone || !address.fullAddress) {
        throw err('INVALID_PARAMS', '请填写完整的地址信息');
    }
    try {
        const safeAddress = filterAddressFields(address);
        if (safeAddress.isDefault) {
            await db.collection('addresses')
                .where({ openid, isDefault: true })
                .update({ data: { isDefault: false } });
        }
        const addressData = {
            _id: generateId('address', openid),
            openid: openid || '',
            name: safeAddress.name,
            phone: safeAddress.phone,
            province: safeAddress.province,
            city: safeAddress.city,
            district: safeAddress.district,
            detail: safeAddress.detail,
            fullAddress: safeAddress.fullAddress,
            postalCode: safeAddress.postalCode,
            isDefault: safeAddress.isDefault || false,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate(),
        };
        await db.collection('addresses').add({ data: addressData });
        return handleSuccess(addressData, '添加地址成功');
    }
    catch (error) {
        logger.error('add', error);
        return handleError(error, '添加地址失败', ERROR_CODES.DATA);
    }
}
exports.add = add;
async function update(event, context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { addressId, address } = event;
    if (!addressId) {
        throw err('INVALID_PARAMS', '缺少地址ID');
    }
    if (!address || !address.name || !address.phone || !address.fullAddress) {
        throw err('INVALID_PARAMS', '请填写完整的地址信息');
    }
    try {
        const existRes = await db.collection('addresses').doc(addressId).get();
        const existData = existRes.data;
        if (!existData || existData.openid !== openid) {
            throw err('PERMISSION_DENIED', '无权限修改此地址');
        }
        const safeAddress = filterAddressFields(address);
        if (safeAddress.isDefault) {
            await db.collection('addresses')
                .where({ openid, isDefault: true })
                .update({ data: { isDefault: false } });
        }
        const updateData = {
            ...safeAddress,
            updatedAt: db.serverDate(),
        };
        await db.collection('addresses').doc(addressId).update({ data: updateData });
        return handleSuccess({ _id: addressId, ...updateData }, '更新地址成功');
    }
    catch (error) {
        logger.error('update', error);
        return handleError(error, '更新地址失败', ERROR_CODES.DATA);
    }
}
exports.update = update;
async function remove(event, context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { addressId } = event;
    if (!addressId) {
        throw err('INVALID_PARAMS', '缺少地址ID');
    }
    try {
        const existRes = await db.collection('addresses').doc(addressId).get();
        const existData = existRes.data;
        if (!existData || existData.openid !== openid) {
            throw err('PERMISSION_DENIED', '无权限删除此地址');
        }
        const wasDefault = existData.isDefault;
        await db.collection('addresses').doc(addressId).remove();
        if (wasDefault) {
            const remaining = await db.collection('addresses')
                .where({ openid })
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();
            const remainingData = (remaining.data || []);
            if (remainingData.length > 0) {
                await db.collection('addresses').doc(remainingData[0]._id).update({
                    data: { isDefault: true },
                });
            }
        }
        return handleSuccess(null, '删除地址成功');
    }
    catch (error) {
        logger.error('remove', error);
        return handleError(error, '删除地址失败', ERROR_CODES.DATA);
    }
}
exports.remove = remove;
async function setDefault(event, context, auth) {
    const { openid } = auth;
    if (!openid) {
        throw err('AUTH_REQUIRED', '未登录');
    }
    const { addressId } = event;
    if (!addressId) {
        throw err('INVALID_PARAMS', '缺少地址ID');
    }
    try {
        const existRes = await db.collection('addresses').doc(addressId).get();
        const existData = existRes.data;
        if (!existData || existData.openid !== openid) {
            throw err('PERMISSION_DENIED', '无权限操作此地址');
        }
        // M4 修复：并发 setDefault 竞态保护。两个并发请求都基于"当前默认地址"快照做置否+置真，
        // 后到者会遗留前者的多余默认地址。用事务保证"清默认+置真"原子，且事务内重查默认地址。
        const transaction = await db.startTransaction();
        try {
            const defaultsRes = await transaction.collection('addresses')
                .where({ openid, isDefault: true })
                .get();
            const defaultIds = (defaultsRes.data || [])
                .map((d) => d._id)
                .filter((id) => Boolean(id));
            for (const id of defaultIds) {
                if (id === addressId) {
                    continue;
                } // 目标地址稍后单独置真，跳过
                await transaction.collection('addresses').doc(id).update({ data: { isDefault: false } });
            }
            await transaction.collection('addresses').doc(addressId).update({
                data: { isDefault: true, updatedAt: db.serverDate() },
            });
            await transaction.commit();
        }
        catch (txErr) {
            await transaction.rollback().catch(() => { });
            throw txErr;
        }
        return handleSuccess(null, '设置默认地址成功');
    }
    catch (error) {
        logger.error('setDefault', error);
        return handleError(error, '设置默认地址失败', ERROR_CODES.DATA);
    }
}
exports.setDefault = setDefault;
// =====================================================================
// Runtime shim: CommonJS 兼容
// =====================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mod = module;
_mod.exports = {
    list,
    add,
    update,
    remove,
    setDefault,
};
_mod.exports.default = _mod.exports;
exports.default = {
    list,
    add,
    update,
    remove,
    setDefault,
};
// 避免 unused 警告
void cloud;
