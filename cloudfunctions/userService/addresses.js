const { err } = require('./common/errors')
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('./common/utils')
const { createLogger } = require('./common/logger')

const { cloud, db } = initCloud()
const logger = createLogger('addressService')

const ADDRESS_FIELDS = ['name', 'phone', 'province', 'city', 'district', 'detail', 'fullAddress', 'postalCode', 'isDefault']

function filterAddressFields(data) {
  const filtered = {}
  for (const key of ADDRESS_FIELDS) {
    if (data[key] !== undefined) {
      filtered[key] = data[key]
    }
  }
  return filtered
}

async function list(event, context, auth) {
  const { openid } = auth
  try {
    const result = await db.collection('addresses')
      .where({ openid })
      .orderBy('isDefault', 'desc')
      .orderBy('createdAt', 'desc')
      .get()

    return handleSuccess(result.data, '获取地址列表成功')
  } catch (error) {
    logger.error('list', error)
    return handleError(error, '获取地址列表失败', ERROR_CODES.DATA)
  }
}

async function add(event, context, auth) {
  const { openid } = auth
  const { address } = event

  if (!address || !address.name || !address.phone || !address.fullAddress) {
    throw err('INVALID_PARAMS', '请填写完整的地址信息')
  }

  try {
    const safeAddress = filterAddressFields(address)

    if (safeAddress.isDefault) {
      await db.collection('addresses')
        .where({ openid, isDefault: true })
        .update({ data: { isDefault: false } })
    }

    const addressData = {
      openid,
      ...safeAddress,
      isDefault: safeAddress.isDefault || false,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }

    addressData._id = generateId('address', openid)
    const result = await db.collection('addresses').add({ data: addressData })

    return handleSuccess(addressData, '添加地址成功')
  } catch (error) {
    logger.error('add', error)
    return handleError(error, '添加地址失败', ERROR_CODES.DATA)
  }
}

async function update(event, context, auth) {
  const { openid } = auth
  const { addressId, address } = event

  if (!addressId) {
    throw err('INVALID_PARAMS', '缺少地址ID')
  }

  if (!address || !address.name || !address.phone || !address.fullAddress) {
    throw err('INVALID_PARAMS', '请填写完整的地址信息')
  }

  try {
    const existRes = await db.collection('addresses').doc(addressId).get()
    if (!existRes.data || existRes.data.openid !== openid) {
      throw err('PERMISSION_DENIED', '无权限修改此地址')
    }

    const safeAddress = filterAddressFields(address)

    if (safeAddress.isDefault) {
      await db.collection('addresses')
        .where({ openid, isDefault: true })
        .update({ data: { isDefault: false } })
    }

    const updateData = {
      ...safeAddress,
      updatedAt: db.serverDate(),
    }

    await db.collection('addresses').doc(addressId).update({ data: updateData })

    return handleSuccess({ _id: addressId, ...updateData }, '更新地址成功')
  } catch (error) {
    logger.error('update', error)
    return handleError(error, '更新地址失败', ERROR_CODES.DATA)
  }
}

async function remove(event, context, auth) {
  const { openid } = auth
  const { addressId } = event

  if (!addressId) {
    throw err('INVALID_PARAMS', '缺少地址ID')
  }

  try {
    const existRes = await db.collection('addresses').doc(addressId).get()
    if (!existRes.data || existRes.data.openid !== openid) {
      throw err('PERMISSION_DENIED', '无权限删除此地址')
    }

    const wasDefault = existRes.data.isDefault

    await db.collection('addresses').doc(addressId).remove()

    if (wasDefault) {
      const remaining = await db.collection('addresses')
        .where({ openid })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get()

      if (remaining.data && remaining.data.length > 0) {
        await db.collection('addresses').doc(remaining.data[0]._id).update({
          data: { isDefault: true },
        })
      }
    }

    return handleSuccess(null, '删除地址成功')
  } catch (error) {
    logger.error('remove', error)
    return handleError(error, '删除地址失败', ERROR_CODES.DATA)
  }
}

async function setDefault(event, context, auth) {
  const { openid } = auth
  const { addressId } = event

  if (!addressId) {
    throw err('INVALID_PARAMS', '缺少地址ID')
  }

  try {
    const existRes = await db.collection('addresses').doc(addressId).get()
    if (!existRes.data || existRes.data.openid !== openid) {
      throw err('PERMISSION_DENIED', '无权限操作此地址')
    }

    await db.collection('addresses')
      .where({ openid, isDefault: true })
      .update({ data: { isDefault: false } })

    await db.collection('addresses').doc(addressId).update({
      data: { isDefault: true, updatedAt: db.serverDate() },
    })

    return handleSuccess(null, '设置默认地址成功')
  } catch (error) {
    logger.error('setDefault', error)
    return handleError(error, '设置默认地址失败', ERROR_CODES.DATA)
  }
}

module.exports = {
  list,
  add,
  update,
  remove,
  setDefault,
}
