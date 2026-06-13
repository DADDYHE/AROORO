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
export declare function createPet(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function updatePet(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function deletePet(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getPetList(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getPetDetail(event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare function getPet(event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare const handlers: Record<string, PetActionHandler>;
export declare function main(event: CloudEvent, context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    createPet: typeof createPet;
    updatePet: typeof updatePet;
    deletePet: typeof deletePet;
    getPet: typeof getPet;
    getPetList: typeof getPetList;
    getPetDetail: typeof getPetDetail;
    convertWeight: typeof convertWeight;
    handlers: Record<string, PetActionHandler>;
};
export default _default;
