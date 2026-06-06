const { err } = require('./common/errors')
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('./common/utils')
const { createLogger } = require('./common/logger')
const { verifyAuth } = require('./common/auth-middleware')
const { getCache, setCache, deleteCache } = require('./common/cache')
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')

const { cloud, db } = initCloud()
const logger = createLogger('petService')
const _ = db.command

const VALID_TYPES = ['cat', 'dog', 'exotic']
const VALID_GENDERS = ['male', 'female', 'unknown']

const PET_FIELDS = {
  _id: true, name: true, type: true, breed: true, gender: true,
  birthday: true, weight: true, avatarUrl: true, note: true,
  createdAt: true, updatedAt: true,
}

const PET_DETAIL_FIELDS = {
  _id: true, name: true, type: true, breed: true, gender: true,
  birthday: true, weight: true, avatarUrl: true, note: true,
  ownerId: true, _openid: true, isActive: true,
  createdAt: true, updatedAt: true,
}

function convertWeight(weight) {
  if (weight === undefined || weight === null || weight === '') {return null}
  const num = Number(weight)
  return isNaN(num) || num <= 0 ? null : num
}

const handlers = {
  createPet,
  updatePet,
  deletePet,
  getPet,
  getPetList,
  getPetDetail,
}

exports.main = async (event, context) => {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  try {
    const requireLogin = !['getPet', 'getPetDetail'].includes(action)
    const auth = await verifyAuth(event, { requireLogin })
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    const code = error.code || ERROR_CODES.BUSINESS
    return handleError(error, error.message, code)
  }
}

async function createPet(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { name, type, gender, breed, birthday, weight, note, avatarUrl } = event

  logger.info('createPet 收到参数:', { name, type, gender, breed, hasBirthday: Boolean(birthday), hasWeight: Boolean(weight), hasNote: Boolean(note), hasAvatarUrl: Boolean(avatarUrl), eventKeys: Object.keys(event) })

  if (!name || !type || !breed || !gender) {
    logger.warn('createPet 必填校验失败:', { name: Boolean(name), type: Boolean(type), breed: Boolean(breed), gender: Boolean(gender) })
    throw err('INVALID_PARAMS', '请填写完整信息（昵称、类型、品种、性别）')
  }

  if (!VALID_TYPES.includes(type)) {
    throw err('INVALID_PARAMS', '宠物类型无效')
  }
  if (!VALID_GENDERS.includes(gender)) {
    throw err('INVALID_PARAMS', '性别无效')
  }

  const parsedWeight = convertWeight(weight)

  const petData = {
    _id: generateId('pet', openid),
    name: String(name).trim(),
    type,
    gender,
    breed: String(breed).trim(),
    birthday: birthday || '',
    weight: parsedWeight,
    note: note || '',
    avatarUrl: avatarUrl || '',
    ownerId: openid,
    _openid: openid,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
    isActive: 1,
  }

  await db.collection('pets').add({ data: petData })
  deleteCache(`pets_${openid}`)

  if (!petData.avatarUrl) {
    petData.avatarUrl = '/images/default-pet.png'
  }

  return handleSuccess({ id: petData._id, pet: petData }, '创建成功')
}

async function updatePet(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { petId, updateData } = event

  if (!petId) {throw err('INVALID_PARAMS', '宠物 ID 不能为空')}
  if (!updateData || Object.keys(updateData).length === 0) {
    throw err('INVALID_PARAMS', '没有需要更新的数据')
  }

  try {
    const petResult = await db.collection('pets').doc(petId).get()
    if (!petResult.data) {
      throw err('NOT_FOUND', '更新失败，宠物不存在或您没有权限')
    }
    if (petResult.data.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '更新失败，宠物不存在或您没有权限')
    }

    const updateFields = { updatedAt: db.serverDate(), ...filterFields(FIELD_WHITELISTS.pet, updateData) }

    if (updateFields.weight !== undefined) {
      updateFields.weight = convertWeight(updateFields.weight)
    }

    if (updateFields.type !== undefined && !VALID_TYPES.includes(updateFields.type)) {
      throw err('INVALID_PARAMS', '宠物类型无效')
    }
    if (updateFields.gender !== undefined && !VALID_GENDERS.includes(updateFields.gender)) {
      throw err('INVALID_PARAMS', '性别无效')
    }

    if (updateFields.name !== undefined) {
      updateFields.name = String(updateFields.name).trim()
    }
    if (updateFields.breed !== undefined) {
      updateFields.breed = String(updateFields.breed).trim()
    }

    const updateResult = await db.collection('pets').doc(petId).update({ data: updateFields })
    const updatedCount = updateResult.stats?.updated ?? 0
    if (updatedCount === 0) {
      throw err('BUSINESS_ERROR', '更新失败，宠物不存在或您没有权限')
    }

    const updatedPetResult = await db.collection('pets').doc(petId).get()
    const updatedPet = updatedPetResult.data

    deleteCache(`pets_${openid}`)
    deleteCache(`pet_${petId}`)

    return handleSuccess({ pet: updatedPet }, '更新成功')
  } catch (error) {
    return handleError(error, '更新失败，请稍后重试', ERROR_CODES.DATA)
  }
}

async function deletePet(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { petId } = event
  if (!petId) {throw err('INVALID_PARAMS', '宠物 ID 不能为空')}

  try {
    const deleteResult = await db.collection('pets').where({
      _id: petId,
      ownerId: openid,
    }).update({
      data: { isActive: 0, updatedAt: db.serverDate() },
    })

    if (!deleteResult || deleteResult.stats.updated === 0) {
      throw err('NOT_FOUND', '删除失败，宠物不存在或您没有权限')
    }

    deleteCache(`pets_${openid}`)
    deleteCache(`pet_${petId}`)

    return handleSuccess(null, '删除成功')
  } catch (error) {
    return handleError(error, '删除失败，请稍后重试', ERROR_CODES.DATA)
  }
}

async function getPetList(event, context, auth) {
  const { openid } = auth
  if (!openid) {throw err('AUTH_REQUIRED', '未登录')}

  const { page = 1, pageSize = 20 } = event
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)
  const skip = (page - 1) * safePageSize

  try {
    const countResult = await db.collection('pets')
      .where({ ownerId: openid, isActive: 1 })
      .count()

    const result = await db.collection('pets')
      .field(PET_FIELDS)
      .where({ ownerId: openid, isActive: 1 })
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(safePageSize)
      .get()

    const processedPets = result.data.map(pet => {
      const processedPet = { ...pet }
      if (!pet.avatarUrl) {
        processedPet.avatarUrl = '/images/default-pet.png'
      }
      return processedPet
    })

    return handleSuccess({
      list: processedPets,
      total: countResult.total,
      page,
      pageSize: safePageSize,
      totalPages: Math.ceil(countResult.total / safePageSize),
    }, '获取成功')
  } catch (error) {
    return handleError(error, '获取失败，请稍后重试', ERROR_CODES.DATA)
  }
}

async function getPetDetail(event, context, auth) {
  const { petId } = event
  if (!petId) {throw err('INVALID_PARAMS', '宠物 ID 不能为空')}

  const cacheKey = `pet_${petId}`
  const cachedPet = getCache(cacheKey)
  if (cachedPet) {return handleSuccess({ pet: cachedPet }, '获取成功')}

  try {
    const result = await db.collection('pets')
      .field(PET_DETAIL_FIELDS)
      .where({ _id: petId, isActive: 1 })
      .get()

    if (!result.data || result.data.length === 0) {
      throw err('NOT_FOUND', '宠物不存在')
    }

    const pet = result.data[0]
    const processedPet = { ...pet }

    if (!processedPet.avatarUrl) {
      processedPet.avatarUrl = '/images/default-pet.png'
    }

    setCache(cacheKey, processedPet)
    return handleSuccess({ pet: processedPet }, '获取成功')
  } catch (error) {
    return handleError(error, '获取失败，请稍后重试', ERROR_CODES.DATA)
  }
}

async function getPet(event) {
  const { petId } = event
  if (!petId) {throw err('INVALID_PARAMS', '宠物 ID 不能为空')}

  try {
    const petResult = await db.collection('pets').where({
      _id: petId,
      isActive: 1,
    }).get()

    if (!petResult?.data || petResult.data.length === 0) {
      throw err('NOT_FOUND', '宠物不存在或您没有权限')
    }

    const petData = petResult.data[0]

    return handleSuccess({ pet: petData }, '获取成功')
  } catch (error) {
    return handleError(error, '获取失败，请稍后重试', ERROR_CODES.DATA)
  }
}
