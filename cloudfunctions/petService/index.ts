/**
 * petService/index.ts - 宠物服务主入口（TypeScript 源文件 - Sprint 44 迁移）
 *
 * 业务功能：
 *   - 宠物档案 CRUD（创建 / 更新 / 删除）
 *   - 宠物查询（列表 / 详情 / 单条）
 *   - 软删除（isActive=0 标记）
 *   - 缓存层（pets_${openid} / pet_${petId}）
 *
 * 共 6 个 action：
 *   1. createPet - 创建宠物档案
 *   2. updatePet - 更新宠物档案
 *   3. deletePet - 删除宠物（软删除）
 *   4. getPet - 获取宠物（公开）
 *   5. getPetList - 我的宠物列表
 *   6. getPetDetail - 宠物详情（公开）
 *
 * 验证规则：
 *   - VALID_TYPES: ['cat', 'dog', 'exotic']
 *   - VALID_GENDERS: ['male', 'female', 'unknown']
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 宠物类型 / 性别 / 字段强类型化
 *   - 与 adminService / partnerService / userService / activityService / mallService / feedingService / hostService / couponService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.petService.json
 */

// =====================================================================
// 公共类型（与 adminService / partnerService / userService / activityService / mallService / feedingService / hostService / couponService 保持一致）
// =====================================================================

export interface AuthLike {
  openid?: string
  nickName?: string
  adminId?: string
  partnerId?: string
  isPartner?: boolean
  isSuperAdmin?: boolean
  roles?: string[]
  permissions?: string[]
  _isHttpAuth?: boolean
  [k: string]: unknown
}

export interface CloudEvent {
  action?: string
  data?: Record<string, unknown>
  body?: string | Record<string, unknown>
  page?: number
  pageSize?: number
  petId?: string
  updateData?: Record<string, unknown>
  name?: string
  type?: string
  gender?: string
  breed?: string
  birthday?: string
  weight?: number | string
  note?: string
  avatarUrl?: string
  [k: string]: unknown
}

export interface CloudContext {
  [k: string]: unknown
}

export type PetActionHandler = (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
) => Promise<unknown>

// =====================================================================
// 业务类型定义
// =====================================================================

export type PetType = 'cat' | 'dog' | 'exotic'
export type PetGender = 'male' | 'female' | 'unknown'
export type IsActive = 0 | 1

export interface PetRecord {
  _id?: string
  name?: string
  type?: PetType
  gender?: PetGender
  breed?: string
  birthday?: string
  weight?: number | null
  avatarUrl?: string
  note?: string
  ownerId?: string
  _openid?: string
  isActive?: IsActive
  createdAt?: Date
  updatedAt?: Date
  [k: string]: unknown
}

export interface PaginateResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages?: number
  hasNext?: boolean
}

export interface PetCreateResult {
  id: string
  pet: PetRecord
}

export interface PetUpdateResult {
  pet: PetRecord
}

export interface PetDetailResult {
  pet: PetRecord
}

// =====================================================================
// 内部模块初始化（require CommonJS 模块）
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { err, isBusinessError, toResponse } = require('./common/errors')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initCloud, handleSuccess, handleError, generateId, ERROR_CODES } = require('./common/utils')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLogger } = require('./common/logger')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyAuth } = require('./common/auth-middleware')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCache, setCache, deleteCache } = require('./common/cache')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { filterFields, FIELD_WHITELISTS } = require('./common/validator')

const { cloud, db } = initCloud()
const logger = createLogger('petService')
const _ = db.command

// =====================================================================
// 验证常量
// =====================================================================

const VALID_TYPES: PetType[] = ['cat', 'dog', 'exotic']
const VALID_GENDERS: PetGender[] = ['male', 'female', 'unknown']

const PET_FIELDS: Record<string, boolean> = {
  _id: true, name: true, type: true, breed: true, gender: true,
  birthday: true, weight: true, avatarUrl: true, note: true,
  createdAt: true, updatedAt: true,
}

const PET_DETAIL_FIELDS: Record<string, boolean> = {
  _id: true, name: true, type: true, breed: true, gender: true,
  birthday: true, weight: true, avatarUrl: true, note: true,
  isActive: true,
  createdAt: true, updatedAt: true,
}

// =====================================================================
// 辅助函数：体重转换
// =====================================================================

export function convertWeight(weight: unknown): number | null {
  if (weight === undefined || weight === null || weight === '') { return null }
  const num = Number(weight)
  return isNaN(num) || num <= 0 ? null : num
}

// =====================================================================
// Handler 1: createPet
// =====================================================================

export async function createPet(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { name, type, gender, breed, birthday, weight, note, avatarUrl } = event

  logger.info('createPet 收到参数:', {
    name, type, gender, breed,
    hasBirthday: Boolean(birthday),
    hasWeight: Boolean(weight),
    hasNote: Boolean(note),
    hasAvatarUrl: Boolean(avatarUrl),
    eventKeys: Object.keys(event),
  })

  if (!name || !type || !breed || !gender) {
    logger.warn('createPet 必填校验失败:', {
      name: Boolean(name), type: Boolean(type), breed: Boolean(breed), gender: Boolean(gender),
    })
    throw err('INVALID_PARAMS', '请填写完整信息（昵称、类型、品种、性别）')
  }

  if (!VALID_TYPES.includes(type as PetType)) {
    throw err('INVALID_PARAMS', '宠物类型无效')
  }
  if (!VALID_GENDERS.includes(gender as PetGender)) {
    throw err('INVALID_PARAMS', '性别无效')
  }

  const parsedWeight = convertWeight(weight)

  const petData: PetRecord = {
    _id: generateId('pet', openid),
    name: String(name).trim(),
    type: type as PetType,
    gender: gender as PetGender,
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

  const result: PetCreateResult = { id: petData._id || '', pet: petData }
  return handleSuccess(result, '创建成功')
}

// =====================================================================
// Handler 2: updatePet
// =====================================================================

export async function updatePet(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { petId, updateData } = event
  if (!petId) { throw err('INVALID_PARAMS', '宠物 ID 不能为空') }
  if (!updateData || Object.keys(updateData).length === 0) {
    throw err('INVALID_PARAMS', '没有需要更新的数据')
  }

  try {
    const petResult = await db.collection('pets').doc(petId).get()
    if (!petResult.data) {
      throw err('NOT_FOUND', '更新失败，宠物不存在或您没有权限')
    }
    const existingPet = petResult.data as PetRecord
    if (existingPet.ownerId !== openid) {
      throw err('PERMISSION_DENIED', '更新失败，宠物不存在或您没有权限')
    }

    const updateFields: Record<string, unknown> = {
      updatedAt: db.serverDate(),
      ...filterFields(FIELD_WHITELISTS.pet, updateData),
    }

    if (updateFields.weight !== undefined) {
      updateFields.weight = convertWeight(updateFields.weight)
    }

    if (updateFields.type !== undefined && !VALID_TYPES.includes(updateFields.type as PetType)) {
      throw err('INVALID_PARAMS', '宠物类型无效')
    }
    if (updateFields.gender !== undefined && !VALID_GENDERS.includes(updateFields.gender as PetGender)) {
      throw err('INVALID_PARAMS', '性别无效')
    }

    if (updateFields.name !== undefined) {
      updateFields.name = String(updateFields.name).trim()
    }
    if (updateFields.breed !== undefined) {
      updateFields.breed = String(updateFields.breed).trim()
    }

    const updateResult = await db.collection('pets').doc(petId).update({ data: updateFields })
    const updatedCount = updateResult?.stats?.updated ?? 0
    if (updatedCount === 0) {
      throw err('BUSINESS_ERROR', '更新失败，宠物不存在或您没有权限')
    }

    const updatedPetResult = await db.collection('pets').doc(petId).get()
    const updatedPet = (updatedPetResult.data || {}) as PetRecord

    deleteCache(`pets_${openid}`)
    deleteCache(`pet_${petId}`)

    const result: PetUpdateResult = { pet: updatedPet }
    return handleSuccess(result, '更新成功')
  } catch (error) {
    // 保留 BusinessError 的原始错误码
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    return handleError(error, '更新失败，请稍后重试', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 3: deletePet（软删除）
// =====================================================================

export async function deletePet(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { petId } = event
  if (!petId) { throw err('INVALID_PARAMS', '宠物 ID 不能为空') }

  try {
    const deleteResult = await db.collection('pets').where({
      _id: petId,
      ownerId: openid,
    }).update({
      data: { isActive: 0, updatedAt: db.serverDate() },
    })

    if (!deleteResult || deleteResult.stats?.updated === 0) {
      throw err('NOT_FOUND', '删除失败，宠物不存在或您没有权限')
    }

    deleteCache(`pets_${openid}`)
    deleteCache(`pet_${petId}`)

    return handleSuccess(null, '删除成功')
  } catch (error) {
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    return handleError(error, '删除失败，请稍后重试', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 4: getPetList
// =====================================================================

export async function getPetList(
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

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

    const processedPets: PetRecord[] = ((result.data || []) as PetRecord[]).map((pet) => {
      const processedPet: PetRecord = { ...pet }
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
    } as PaginateResult<PetRecord>, '获取成功')
  } catch (error) {
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    return handleError(error, '获取失败，请稍后重试', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 5: getPetDetail（公开）
// =====================================================================

export async function getPetDetail(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { petId } = event
  if (!petId) { throw err('INVALID_PARAMS', '宠物 ID 不能为空') }

  const cacheKey = `pet_${petId}`
  const cachedPet = getCache(cacheKey)
  if (cachedPet) { return handleSuccess({ pet: cachedPet } as PetDetailResult, '获取成功') }

  try {
    const result = await db.collection('pets')
      .field(PET_DETAIL_FIELDS)
      .where({ _id: petId, isActive: 1 })
      .get()

    if (!result.data || result.data.length === 0) {
      throw err('NOT_FOUND', '宠物不存在')
    }

    const pet = (result.data[0] || {}) as PetRecord
    const processedPet: PetRecord = { ...pet }

    if (!processedPet.avatarUrl) {
      processedPet.avatarUrl = '/images/default-pet.png'
    }

    setCache(cacheKey, processedPet)
    return handleSuccess({ pet: processedPet } as PetDetailResult, '获取成功')
  } catch (error) {
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    return handleError(error, '获取失败，请稍后重试', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handler 6: getPet（公开）
// =====================================================================

export async function getPet(
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> {
  const { petId } = event
  if (!petId) { throw err('INVALID_PARAMS', '宠物 ID 不能为空') }

  try {
    const petResult = await db.collection('pets').where({
      _id: petId,
      isActive: 1,
    }).get()

    if (!petResult?.data || petResult.data.length === 0) {
      throw err('NOT_FOUND', '宠物不存在或您没有权限')
    }

    const petData = (petResult.data[0] || {}) as PetRecord
    return handleSuccess({ pet: petData } as PetDetailResult, '获取成功')
  } catch (error) {
    if (isBusinessError(error)) {
      return toResponse(error)
    }
    return handleError(error, '获取失败，请稍后重试', ERROR_CODES.DATA)
  }
}

// =====================================================================
// Handlers 聚合
// =====================================================================

export const handlers: Record<string, PetActionHandler> = {
  createPet,
  updatePet,
  deletePet,
  getPet,
  getPetList,
  getPetDetail,
}

// =====================================================================
// Main 入口
// =====================================================================

export async function main(
  event: CloudEvent,
  context: CloudContext
): Promise<unknown> {
  const { action } = event
  if (!action || !handlers[action]) {
    throw err('INVALID_PARAMS', '无效的操作类型')
  }

  try {
    const PUBLIC_ACTIONS = ['getPet', 'getPetDetail']
    const requireLogin = !PUBLIC_ACTIONS.includes(action)
    const auth = await verifyAuth(event, { requireLogin }) as AuthLike
    logger.info(action, { openid: auth.openid })
    return await handlers[action](event, context, auth)
  } catch (error) {
    logger.error(action, error)
    const code = (error as { code?: string }).code || ERROR_CODES.BUSINESS
    return handleError(error, (error as Error).message, code)
  }
}

// =====================================================================
// Runtime shim（CommonJS 兼容）
// =====================================================================

const _mod = module as { exports: Record<string, unknown> }
_mod.exports = {
  main,
  createPet,
  updatePet,
  deletePet,
  getPet,
  getPetList,
  getPetDetail,
  convertWeight,
  handlers,
}
_mod.exports.default = _mod.exports

export default {
  main,
  createPet,
  updatePet,
  deletePet,
  getPet,
  getPetList,
  getPetDetail,
  convertWeight,
  handlers,
}
