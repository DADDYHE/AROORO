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
export interface AuthLike {
    openid?: string;
    nickName?: string;
    adminId?: string;
    partnerId?: string;
    isPartner?: boolean;
    isSuperAdmin?: boolean;
    roles?: string[];
    permissions?: string[];
    _isHttpAuth?: boolean;
    [k: string]: unknown;
}
export interface CloudEvent {
    action?: string;
    data?: Record<string, unknown>;
    body?: string | Record<string, unknown>;
    page?: number;
    pageSize?: number;
    petId?: string;
    updateData?: Record<string, unknown>;
    name?: string;
    type?: string;
    gender?: string;
    breed?: string;
    birthday?: string;
    weight?: number | string;
    note?: string;
    avatarUrl?: string;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type PetActionHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export type PetType = 'cat' | 'dog' | 'exotic';
export type PetGender = 'male' | 'female' | 'unknown';
export type IsActive = 0 | 1;
export interface PetRecord {
    _id?: string;
    name?: string;
    type?: PetType;
    gender?: PetGender;
    breed?: string;
    birthday?: string;
    weight?: number | null;
    avatarUrl?: string;
    note?: string;
    ownerId?: string;
    _openid?: string;
    isActive?: IsActive;
    isOwner?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
export interface PaginateResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages?: number;
    hasNext?: boolean;
}
export interface PetCreateResult {
    id: string;
    pet: PetRecord;
}
export interface PetUpdateResult {
    pet: PetRecord;
}
export interface PetDetailResult {
    pet: PetRecord;
}
export declare function convertWeight(weight: unknown): number | null;
export declare const createPet: PetActionHandler;
export declare const updatePet: PetActionHandler;
export declare const deletePet: PetActionHandler;
export declare const getPetList: PetActionHandler;
export declare const getPetDetail: PetActionHandler;
export declare const getPet: PetActionHandler;
export declare const handlers: Record<string, PetActionHandler>;
export declare function main(event: CloudEvent, context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    createPet: PetActionHandler;
    updatePet: PetActionHandler;
    deletePet: PetActionHandler;
    getPet: PetActionHandler;
    getPetList: PetActionHandler;
    getPetDetail: PetActionHandler;
    convertWeight: typeof convertWeight;
    handlers: Record<string, PetActionHandler>;
};
export default _default;
