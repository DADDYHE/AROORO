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
 *   4. getPet - 获取宠物（公开，委托 getPetDetail）
 *   5. getPetList - 我的宠物列表
 *   6. getPetDetail - 宠物详情（公开）
 *
 * 验证规则：
 *   - VALID_TYPES: ['cat', 'dog', 'exotic']
 *   - VALID_GENDERS: ['male', 'female', 'unknown']
 *
 * 审查修复（本次）：
 *   - H1: getPet 公开接口添加字段投影，避免泄露 ownerId/_openid
 *   - H2: getPet 委托 getPetDetail 统一缓存路径
 *   - H3: deletePet 增加 ownership 前置查询与告警
 *   - H4: createPet 引入 withRateLimit + 单用户宠物数量上限
 *   - H5: updatePet 字段白名单与校验顺序修正
 *   - H6: createPet 文本字段长度与 avatarUrl 格式校验
 *   - M4: createPet 日志去除敏感字段具体值
 *   - M5+M6: 统一错误处理（withErrorHandling + main 入口 BusinessError 优先 toResponse）
 *   - M7: convertWeight 上下限校验
 *   - M8: createPet avatarUrl 默认值在入库前赋值
 *   - M9: 引入 operation-log 记录关键操作
 *   - L5/L6/L7/L11: 入参校验、日志降级、birthday 格式、软删除竞态
 *   - C2/C3/C4: timeout 提升、bootstrapRateLimit、recordAlert
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.petService.json
 */

// =====================================================================
// 公共类型
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
const { err, isBusinessError, toResponse, withErrorHandling } = require('./common/errors')
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
// M9: 引入 operation-log
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { writeOperationLog } = require('./common/operation-log')
// H4: 引入限流
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withRateLimit } = require('./common/risk-rate-limit')
// C3: 引入 bootstrapRateLimit
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapRateLimit } = require('./common/rate-limit-bootstrap')
// C4: 引入 recordAlert
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recordAlert } = require('./common/alert')

const { db } = initCloud()
const logger = createLogger('petService')

// =====================================================================
// 验证常量
// =====================================================================

const VALID_TYPES: PetType[] = ['cat', 'dog', 'exotic']
const VALID_GENDERS: PetGender[] = ['male', 'female', 'unknown']

// H1: 公开接口字段投影（不含 ownerId / _openid，仅含可公开字段）
// M3 防御性约束：此投影常量仅用于公开接口（getPet / getPetDetail），
//   任何新增字段若涉及隐私（如地址、联系方式），禁止加入此白名单。
//   私有接口（getPetList）使用 PET_FIELDS，同样不含 ownerId/_openid。
//   updatePet 返回的完整 PetRecord 不走缓存，避免私有数据污染公开缓存。
const PET_DETAIL_FIELDS: Record<string, boolean> = {
  _id: true, name: true, type: true, breed: true, gender: true,
  birthday: true, weight: true, avatarUrl: true, note: true,
  isActive: true,
  // L9: createdAt/updatedAt 为 UTC 时间戳，前端展示时需自行转换为 Asia/Shanghai 时区
  createdAt: true, updatedAt: true,
}

// L3: PET_FIELDS 从 PET_DETAIL_FIELDS 派生（仅去除 isActive）
const PET_FIELDS: Record<string, boolean> = (() => {
  const result: Record<string, boolean> = { ...PET_DETAIL_FIELDS }
  delete result.isActive
  return result
})()

// H6: 文本字段长度上限
const MAX_NAME_LEN = 30
const MAX_BREED_LEN = 50
const MAX_NOTE_LEN = 500
const MAX_AVATAR_URL_LEN = 2048
const DEFAULT_AVATAR_URL = '/images/default-pet.png'

// H4: 单用户宠物数量上限
const MAX_PETS_PER_USER = 20

// M7: 体重范围（kg）
const MIN_WEIGHT_KG = 0.1
const MAX_WEIGHT_KG = 500

// L12: getPetDetail 缓存 TTL（秒）
//   宠物档案更新频率低，5 分钟缓存可接受；
//   updatePet/deletePet 会主动 deleteCache，不会长时间返回旧数据。
const PET_DETAIL_CACHE_TTL_SECONDS = 5 * 60

// =====================================================================
// 辅助函数：体重转换（M7: 添加上下限校验）
// =====================================================================

export function convertWeight(weight: unknown): number | null {
  // 未填（undefined/null/''）→ null（允许，前端展示"未知"）
  if (weight === undefined || weight === null || weight === '') { return null }
  const num = Number(weight)
  // P3-B 修复：非法数值不再静默清空为 null，而是显式报错提示用户
  //   （原实现 0/负数/非数字/超范围一律返回 null，用户输入被悄悄丢弃）
  if (isNaN(num) || num <= 0) {
    throw err('INVALID_PARAMS', '体重必须为大于 0 的数字（kg）')
  }
  // M7: 限制体重范围 0.1-500 kg（覆盖猫 2-10kg、狗 1-80kg、异宠 0.1-50kg）
  if (num < MIN_WEIGHT_KG || num > MAX_WEIGHT_KG) {
    throw err('INVALID_PARAMS', `体重需在 ${MIN_WEIGHT_KG}-${MAX_WEIGHT_KG}kg 之间`)
  }
  // 保留两位小数
  return Math.round(num * 100) / 100
}

// =====================================================================
// H6: 辅助函数：文本字段校验
// =====================================================================

function validateTextField(value: unknown, maxLength: number, fieldName: string): string {
  const str = String(value ?? '').trim()
  if (str.length > maxLength) {
    throw err('INVALID_PARAMS', `${fieldName}长度不能超过 ${maxLength} 个字符`)
  }
  return str
}

function validateAvatarUrl(avatarUrl: unknown): string {
  if (!avatarUrl) { return '' }
  const str = String(avatarUrl).trim()
  if (str.length > MAX_AVATAR_URL_LEN) {
    throw err('INVALID_PARAMS', `头像 URL 长度不能超过 ${MAX_AVATAR_URL_LEN} 个字符`)
  }
  // 允许空字符串走默认值；非空则必须是 http(s)、/ 开头的相对路径，或 cloud:// fileID
  // （P1-A: 前端 wx.cloud.uploadFile 返回 cloud:// fileID 直接作为 avatarUrl 存储，
  //   小程序 image/canvas 均支持 cloud:// 渲染，无需转 http）
  if (str && !/^(https?:\/\/|\/|cloud:\/\/)/.test(str)) {
    throw err('INVALID_PARAMS', '头像 URL 格式无效')
  }
  return str
}

// L7: birthday 格式校验（YYYY-MM-DD）
function validateBirthday(birthday: unknown): string {
  if (!birthday) { return '' }
  const str = String(birthday).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw err('INVALID_PARAMS', '生日格式应为 YYYY-MM-DD')
  }
  const date = new Date(str)
  if (isNaN(date.getTime())) {
    throw err('INVALID_PARAMS', '生日日期无效')
  }
  // 不允许未来日期
  if (date.getTime() > Date.now()) {
    throw err('INVALID_PARAMS', '生日不能是未来日期')
  }
  return str
}

// =====================================================================
// Handler 1: createPet
// =====================================================================

export const createPet = withErrorHandling(async (
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> => {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { name, type, gender, breed, birthday, weight, note, avatarUrl } = event

  // M4: 日志去除敏感字段具体值，仅记录存在性与校验结果
  logger.debug('createPet 收到参数', {
    hasName: Boolean(name),
    hasType: Boolean(type),
    hasGender: Boolean(gender),
    hasBreed: Boolean(breed),
    hasBirthday: Boolean(birthday),
    hasWeight: Boolean(weight),
    hasNote: Boolean(note),
    hasAvatarUrl: Boolean(avatarUrl),
    eventKeys: Object.keys(event || {}),
  })

  if (!name || !type || !breed || !gender) {
    throw err('INVALID_PARAMS', '请填写完整信息（昵称、类型、品种、性别）')
  }

  if (!VALID_TYPES.includes(type as PetType)) {
    throw err('INVALID_PARAMS', '宠物类型无效')
  }
  if (!VALID_GENDERS.includes(gender as PetGender)) {
    throw err('INVALID_PARAMS', '性别无效')
  }

  // H6: 文本字段长度校验
  const safeName = validateTextField(name, MAX_NAME_LEN, '昵称')
  const safeBreed = validateTextField(breed, MAX_BREED_LEN, '品种')
  const safeNote = note ? validateTextField(note, MAX_NOTE_LEN, '备注') : ''
  const safeAvatarUrl = validateAvatarUrl(avatarUrl)
  const safeBirthday = validateBirthday(birthday)

  const parsedWeight = convertWeight(weight)

  // H4: 限流 + 单用户宠物数量上限校验
  return withRateLimit(
    { userId: openid, type: 'createPet' },
    async () => {
      const countResult = await db.collection('pets')
        .where({ ownerId: openid, isActive: 1 })
        .count()
      if (countResult.total >= MAX_PETS_PER_USER) {
        throw err('COUPON_LIMIT_REACHED', `每用户最多创建 ${MAX_PETS_PER_USER} 只宠物`)
      }

      // M8: avatarUrl 默认值在入库前赋值，统一数据源
      const petData: PetRecord = {
        _id: generateId('pet', openid),
        name: safeName,
        type: type as PetType,
        gender: gender as PetGender,
        breed: safeBreed,
        birthday: safeBirthday,
        weight: parsedWeight,
        note: safeNote,
        avatarUrl: safeAvatarUrl || DEFAULT_AVATAR_URL,
        ownerId: openid,
        _openid: openid,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        isActive: 1,
      }

      await db.collection('pets').add({ data: petData })
      deleteCache(`pets_${openid}`)

      const result: PetCreateResult = { id: petData._id || '', pet: petData }

      // M9: 记录操作日志（best-effort，不阻塞主流程）
      writeOperationLog({
        module: 'pet',
        action: 'create',
        targetId: petData._id,
        targetName: safeName,
        operatorId: openid,
        afterData: { name: safeName, type, breed, gender },
      }).catch((e: Error) => logger.warn('writeOperationLog failed', { msg: e.message }))

      return handleSuccess(result, '创建成功')
    }
  )
}) as PetActionHandler

// =====================================================================
// Handler 2: updatePet
// =====================================================================

export const updatePet = withErrorHandling(async (
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> => {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { petId, updateData } = event
  if (!petId) { throw err('INVALID_PARAMS', '宠物 ID 不能为空') }
  if (!updateData || Object.keys(updateData).length === 0) {
    throw err('INVALID_PARAMS', '没有需要更新的数据')
  }

  // H5: 先校验原始 updateData 中的 type/gender，再走白名单过滤
  if (updateData.type !== undefined && !VALID_TYPES.includes(updateData.type as PetType)) {
    throw err('INVALID_PARAMS', '宠物类型无效')
  }
  if (updateData.gender !== undefined && !VALID_GENDERS.includes(updateData.gender as PetGender)) {
    throw err('INVALID_PARAMS', '性别无效')
  }

  // H6: 长度校验（针对 updateData 原始值）
  if (updateData.name !== undefined) {
    validateTextField(updateData.name, MAX_NAME_LEN, '昵称')
  }
  if (updateData.breed !== undefined) {
    validateTextField(updateData.breed, MAX_BREED_LEN, '品种')
  }
  if (updateData.note !== undefined) {
    validateTextField(updateData.note, MAX_NOTE_LEN, '备注')
  }
  if (updateData.avatarUrl !== undefined) {
    validateAvatarUrl(updateData.avatarUrl)
  }
  if (updateData.birthday !== undefined) {
    validateBirthday(updateData.birthday)
  }

  const petResult = await db.collection('pets').doc(petId).get()
  if (!petResult.data) {
    throw err('NOT_FOUND', '宠物不存在')
  }
  const existingPet = petResult.data as PetRecord
  if (existingPet.ownerId !== openid) {
    // H3: 越权操作告警
    logger.warn('updatePet.permission_denied', {
      petId,
      operatorOpenid: openid,
      ownerOpenid: existingPet.ownerId,
    })
    throw err('PERMISSION_DENIED', '无权操作他人宠物')
  }

  // H5: 再走白名单过滤（确保只允许更新 pet 字段）
  // L8: 显式声明 PetUpdateFields 类型，避免 weight 等字段类型断裂为 unknown
  interface PetUpdateFields {
    updatedAt?: ReturnType<typeof db.serverDate>
    name?: string
    type?: PetType
    gender?: PetGender
    breed?: string
    birthday?: string
    weight?: number | null
    avatarUrl?: string
    note?: string
  }
  const filteredFields = filterFields(FIELD_WHITELISTS.pet, updateData as Record<string, unknown>) as PetUpdateFields
  const updateFields: PetUpdateFields = {
    updatedAt: db.serverDate(),
    ...filteredFields,
  }

  if (updateFields.weight !== undefined) {
    updateFields.weight = convertWeight(updateFields.weight)
  }

  if (updateFields.name !== undefined) {
    updateFields.name = String(updateFields.name).trim()
  }
  if (updateFields.breed !== undefined) {
    updateFields.breed = String(updateFields.breed).trim()
  }
  if (updateFields.note !== undefined) {
    updateFields.note = String(updateFields.note).trim()
  }
  if (updateFields.avatarUrl !== undefined) {
    const url = String(updateFields.avatarUrl).trim()
    updateFields.avatarUrl = url || DEFAULT_AVATAR_URL
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

  // M9: 记录操作日志
  writeOperationLog({
    module: 'pet',
    action: 'update',
    targetId: petId,
    targetName: updatedPet.name,
    operatorId: openid,
    beforeData: { name: existingPet.name, type: existingPet.type },
    afterData: { name: updatedPet.name, type: updatedPet.type },
  }).catch((e: Error) => logger.warn('writeOperationLog failed', { msg: e.message }))

  return handleSuccess(result, '更新成功')
}) as PetActionHandler

// =====================================================================
// Handler 3: deletePet（软删除）
// =====================================================================

export const deletePet = withErrorHandling(async (
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> => {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { petId } = event
  if (!petId) { throw err('INVALID_PARAMS', '宠物 ID 不能为空') }

  // H3: 先查再删，区分 NOT_FOUND / PERMISSION_DENIED
  const existingResult = await db.collection('pets').doc(petId).get()
  if (!existingResult.data) {
    throw err('NOT_FOUND', '宠物不存在')
  }
  const existingPet = existingResult.data as PetRecord
  if (existingPet.ownerId !== openid) {
    logger.warn('deletePet.permission_denied', {
      petId,
      operatorOpenid: openid,
      ownerOpenid: existingPet.ownerId,
    })
    throw err('PERMISSION_DENIED', '无权操作他人宠物')
  }

  // L11: 软删除竞态保护——仅当 isActive=1 时才推进
  const deleteResult = await db.collection('pets').where({
    _id: petId,
    ownerId: openid,
    isActive: 1,
  }).update({
    data: { isActive: 0, updatedAt: db.serverDate() },
  })

  if (!deleteResult || deleteResult.stats?.updated === 0) {
    // 已被并发删除或已删除，幂等返回成功
    logger.info('deletePet.already_deleted', { petId })
    return handleSuccess(null, '删除成功')
  }

  deleteCache(`pets_${openid}`)
  deleteCache(`pet_${petId}`)

  // M11 关联资源说明：软删除后未清理以下关联数据（业务评估后决定保留）：
  //   1. COS 头像图片：宠物可能被多用户引用（如寄养家庭查看），保留图片避免 404
  //   2. 订单/寄养/喂养记录中的 petId：历史记录需保留宠物信息，软删除后业务表
  //      查询时通过 petId 反查宠物详情会返回 NOT_FOUND，前端需处理此场景
  //   3. 用户默认宠物设置：若引用已删除宠物，前端应在选择默认宠物时过滤
  //   若后续需要主动清理，可在此处触发异步任务清理 COS 图片
  writeOperationLog({
    module: 'pet',
    action: 'delete',
    targetId: petId,
    targetName: existingPet.name,
    operatorId: openid,
    beforeData: { name: existingPet.name, type: existingPet.type },
  }).catch((e: Error) => logger.warn('writeOperationLog failed', { msg: e.message }))

  return handleSuccess(null, '删除成功')
}) as PetActionHandler

// =====================================================================
// Handler 4: getPetList
// =====================================================================

export const getPetList = withErrorHandling(async (
  event: CloudEvent,
  _context: CloudContext,
  auth: AuthLike
): Promise<unknown> => {
  const { openid } = auth
  if (!openid) { throw err('AUTH_REQUIRED', '未登录') }

  const { page = 1, pageSize = 20 } = event
  const safePage = Math.max(1, Number(page) || 1)
  const safePageSize = Math.min(Math.max(1, Number(pageSize) || 20), 100)
  const skip = (safePage - 1) * safePageSize

  // M1 弱一致性说明：count() 与 get() 分两次查询，期间数据可能变化，
  //   导致 total 与 list.length 不一致。前端分页应容忍此偏差（仅 page=1
  //   展示精确 total，后续页面以 hasNext 为准）。宠物档案 QPS 低，可接受。
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
      processedPet.avatarUrl = DEFAULT_AVATAR_URL
    }
    return processedPet
  })

  return handleSuccess({
    list: processedPets,
    total: countResult.total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.ceil(countResult.total / safePageSize),
  } as PaginateResult<PetRecord>, '获取成功')
}) as PetActionHandler

// =====================================================================
// Handler 5: getPetDetail（公开）
// =====================================================================

export const getPetDetail = withErrorHandling(async (
  event: CloudEvent,
  _context: CloudContext,
  _auth: AuthLike
): Promise<unknown> => {
  const { petId } = event
  if (!petId) { throw err('INVALID_PARAMS', '宠物 ID 不能为空') }

  const cacheKey = `pet_${petId}`
  const cachedPet = getCache(cacheKey)
  if (cachedPet) { return handleSuccess({ pet: cachedPet } as PetDetailResult, '获取成功') }

  // M10 缓存击穿说明：缓存过期瞬间多个请求会同时查 DB。
  //   宠物档案 QPS 低，且单次查询走 (ownerId, isActive, createdAt) 索引，
  //   不会造成 DB 压力，未引入分布式锁。若未来 QPS 上升可考虑 singleflight。
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
    processedPet.avatarUrl = DEFAULT_AVATAR_URL
  }

  // L12: 显式设置 TTL，避免依赖默认值导致行为不明确
  setCache(cacheKey, processedPet, PET_DETAIL_CACHE_TTL_SECONDS)
  return handleSuccess({ pet: processedPet } as PetDetailResult, '获取成功')
}) as PetActionHandler

// =====================================================================
// Handler 6: getPet（公开，H2: 委托 getPetDetail 统一缓存路径）
// =====================================================================

export const getPet = withErrorHandling(async (
  event: CloudEvent,
  context: CloudContext,
  auth: AuthLike
): Promise<unknown> => {
  // H2: 委托 getPetDetail，统一走缓存路径 + 字段投影
  return getPetDetail(event, context, auth)
}) as PetActionHandler

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
// Sprint 50: 限流统一 bootstrap
//   - 非资金类云函数，不启用 strict 模式，失败时降级到内存
//   - 失败时持久化告警，便于运维感知
// =====================================================================

let _bootstrapFailed = false
try {
  const { db: bootstrapDb } = initCloud() as { cloud: unknown, db: unknown }
  ;(bootstrapRateLimit as (db: unknown, opts?: object) => unknown)(bootstrapDb, {
    logger: createLogger('petService.rate-limit'),
    service: 'petService',
  })
} catch (e) {
  _bootstrapFailed = true
  logger.error('bootstrapRateLimit failed', { msg: (e as Error)?.message })
  if (e instanceof Error && (e as { code?: string }).code === 'RATE_LIMIT_BOOTSTRAP_FAILED') {
    recordAlert(
      'warning',
      'petService.rate_limit.bootstrap.failed',
      `petService 限流 bootstrap 失败：${e.message}`,
      { service: 'petService', stack: e.stack }
    ).catch((alertErr: Error) => {
      logger.error('recordAlert failed for bootstrap failure', { msg: alertErr.message })
    })
  }
}

// =====================================================================
// Main 入口
// =====================================================================

export async function main(
  event: CloudEvent,
  context: CloudContext
): Promise<unknown> {
  // L5: event 参数基础校验
  if (!event || typeof event !== 'object') {
    return toResponse(err('INVALID_PARAMS', '无效的请求参数'))
  }

  const { action } = event
  if (!action || !handlers[action]) {
    return toResponse(err('UNKNOWN_ACTION', '无效的操作类型'))
  }

  try {
    const PUBLIC_ACTIONS = ['getPet', 'getPetDetail']
    const requireLogin = !PUBLIC_ACTIONS.includes(action)
    // M12: 公开接口仍调用 verifyAuth(requireLogin=false)，
    //   - 内部仅调用 cloud.getWXContext()，开销可忽略
    //   - 若已登录用户调用公开接口，auth.openid 可用于个性化（如 getPetList）
    //   - 不做特殊分支，保持 main 入口逻辑统一
    const auth = await verifyAuth(event, { requireLogin }) as AuthLike
    // L6: 日志降级为 debug，仅记录 openid 是否存在
    logger.debug(action, { hasOpenid: Boolean(auth?.openid) })
    return await handlers[action](event, context, auth)
  } catch (error) {
    // M6: BusinessError 优先走 toResponse，保留原始错误码
    if (isBusinessError(error)) {
      logger.warn(action, { code: (error as { code: string }).code, msg: (error as Error).message })
      return toResponse(error)
    }
    // 未知错误走 handleError，并触发持久化告警
    logger.error(action, error as Error)
    recordAlert(
      'critical',
      `petService.${action}.failed`,
      `petService ${action} 执行失败：${(error as Error)?.message}`,
      { action, stack: (error as Error)?.stack }
    ).catch(() => { /* best-effort */ })
    return handleError(error as Error, (error as Error)?.message || '操作失败', ERROR_CODES.SERVER)
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
