/**
 * hostService/index.ts - 寄养服务主入口（TypeScript 源文件 - Sprint 42 迁移）
 *
 * 业务功能：
 *   - 寄养家庭档案管理（CRUD + 详情查询）
 *   - 接单状态切换
 *   - 寄养家庭列表（关键词 + 筛选 + 排序 + 缓存）
 *   - 寄养家庭统计（订单总数 / 完成 / 待付款 / 取消率）
 *   - 敏感字段加密（AES-256-GCM 优先，兼容 AES-256-CBC 双写）
 *
 * 共 7 个 action：
 *   1. createHostProfile - 创建寄养家庭档案
 *   2. updateHostProfile - 更新寄养家庭档案
 *   3. getHostList - 寄养家庭列表（公开）
 *   4. getHostDetail - 寄养家庭详情（公开）
 *   5. getHostProfile - 获取当前用户寄养家庭档案
 *   6. updateHostAcceptingOrders - 更新接单状态
 *   7. getHostStats - 寄养家庭统计
 *
 * 加密方案（Sprint 2 升级）：
 *   - v2 AES-256-GCM（推荐）：`gcm:base64(iv).base64(tag).base64(cipher)`
 *   - v1 AES-256-CBC（迁移期）：`legacy_cbc:base64(iv):base64(cipher)`
 *   - 双写策略：ENABLE_CBC_DUAL_WRITE=true 时同时写 v1 与 v2
 *
 * 迁移目标：
 *   - 强类型化所有 db 操作、handler 签名、返回结构
 *   - 复用 AuthLike / CloudEvent / CloudContext 公共类型
 *   - 加密子系统强类型化（key 版本 + payload 格式）
 *   - 与 adminService / partnerService / userService / activityService / mallService / feedingService 保持类型一致
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.hostService.json
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
    keyword?: string;
    sort?: string;
    filters?: HostFilters;
    hostId?: string;
    hostName?: string;
    realName?: string;
    phone?: string;
    idCard?: string;
    address?: string;
    housingType?: string;
    hasYard?: string;
    maxPets?: number;
    hasOtherPets?: string;
    nativePetInfo?: string;
    petTypes?: string;
    serviceTypes?: string[];
    pricePerDay?: number;
    description?: string;
    photos?: string[];
    videos?: string[];
    avatarUrl?: string;
    idCardFront?: string;
    idCardBack?: string;
    healthCertificate?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    isAcceptingOrders?: boolean;
    updateType?: string;
    [k: string]: unknown;
}
export interface CloudContext {
    [k: string]: unknown;
}
export type HostActionHandler = (event: CloudEvent, context: CloudContext, auth: AuthLike) => Promise<unknown>;
export interface HostFilters {
    roomType?: string;
    minPrice?: number;
    maxPrice?: number;
    [k: string]: unknown;
}
export interface HostRecord {
    _id?: string;
    openid?: string;
    hostName?: string;
    name?: string;
    realName?: string;
    avatarUrl?: string;
    phone?: string;
    idCard?: string;
    address?: string;
    housingType?: string;
    hasYard?: string;
    maxPets?: number;
    hasOtherPets?: string;
    nativePetInfo?: string;
    petTypes?: string;
    serviceTypes?: string[];
    pricePerDay?: number;
    description?: string;
    photos?: string[];
    videos?: string[];
    idCardFront?: string;
    idCardBack?: string;
    healthCertificate?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    status?: string;
    rating?: number;
    averageRating?: number;
    isAcceptingOrders?: boolean;
    isActive?: number;
    isRecommended?: boolean;
    roomType?: string;
    petLimit?: number;
    tags?: string[];
    createdBy?: string;
    createdAt?: Date;
    updatedAt?: Date;
    [k: string]: unknown;
}
export interface HostStats {
    totalOrders: number;
    completedOrders: number;
    pendingOrders: number;
    cancellationRate: string;
}
export interface PaginateResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages?: number;
    hasNext?: boolean;
}
export interface EncryptedPayload {
    v1?: string;
    v2: string;
}
export type KeyVersion = 1 | 2;
export declare function createHostProfile(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function updateHostProfile(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getHostList(event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare function getHostDetail(event: CloudEvent, _context: CloudContext, _auth: AuthLike): Promise<unknown>;
export declare function getHostProfile(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function updateHostAcceptingOrders(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare function getHostStats(event: CloudEvent, _context: CloudContext, auth: AuthLike): Promise<unknown>;
export declare const handlers: Record<string, HostActionHandler>;
export declare function main(event: CloudEvent, context: CloudContext): Promise<unknown>;
declare const _default: {
    main: typeof main;
    createHostProfile: typeof createHostProfile;
    updateHostProfile: typeof updateHostProfile;
    getHostList: typeof getHostList;
    getHostDetail: typeof getHostDetail;
    getHostProfile: typeof getHostProfile;
    updateHostAcceptingOrders: typeof updateHostAcceptingOrders;
    getHostStats: typeof getHostStats;
    handlers: Record<string, HostActionHandler>;
};
export default _default;
