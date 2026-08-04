/**
 * rate-limit-bootstrap.ts - 限流一键初始化（TypeScript 源文件 - Sprint 50 新增）
 *
 * 目标：
 *   - 解决 Sprint 21+ 每个云函数入口都要调用 initGlobalRateLimitFromDb + initRateLimitConfigFromDb 的样板代码
 *   - 统一限流系统入口：rate_limits（计数）+ rate_limit_configs（配置）一次性注入
 *   - 失败时优雅降级（不阻断云函数启动）
 *
 * 用法：
 *   const db = cloudbase.database()
 *   bootstrapRateLimit(db, { logger: createLogger('myService') })
 *
 * 内部行为：
 *   1. initGlobalRateLimitFromDb(db, { collectionName: 'rate_limits' })
 *   2. initRateLimitConfigFromDb(db, { collectionName: 'rate_limit_configs' })
 *   3. setRateLimitConfigCacheTtl(30000) // 30s
 *   4. 任意失败 → 降级到内存模式
 *
 * 设计取舍：
 *   - 启动期不抛错（限流是 best-effort）
 *   - 成功注入返回 true，失败返回 false（便于审计）
 *   - 注入时间 + 注入结果记录到全局状态，便于统计
 *
 * 编译方式：
 *   npx --yes -p typescript@5.4.5 tsc -p tsconfig.common.json
 */
export interface BootstrapOptions {
    /** 限流计数集合名（默认 'rate_limits'） */
    rateLimitsCollection?: string;
    /** 限流配置集合名（默认 'rate_limit_configs'） */
    rateLimitConfigsCollection?: string;
    /** 配置缓存 TTL（毫秒），默认 30s */
    configCacheTtlMs?: number;
    /** 日志回调（可选；不传则静默） */
    logger?: {
        info: (msg: string, ...args: unknown[]) => void;
        warn: (msg: string, ...args: unknown[]) => void;
        error: (msg: string, ...args: unknown[]) => void;
    };
    /** db.command（可选；不传则尝试 db.command） */
    command?: any;
    /**
     * H1（paymentService 审查）: strict 模式——注入失败时抛错而非降级
     *
     * 业务背景：
     *   - 资金类云函数（paymentService）必须保证限流可用，否则资金接口裸奔
     *   - 项目硬约束：paymentService 必须开启 strict: true
     *
     * 行为：
     *   - strict=true 且 countStoreInjected=false 或 configStoreInjected=false
     *     → 抛 BootstrapError，阻断云函数 main 入口
     *   - strict=false（默认）→ 降级到内存模式，仅 logger.warn
     */
    strict?: boolean;
    /** strict 模式抛出的错误标识，用于 recordAlert */
    service?: string;
}
/**
 * H1: strict 模式注入失败错误类型
 *
 * 用于 paymentService 等资金类云函数——失败时上抛而非降级
 * 调用方应在 main 入口 try/catch 中识别此错误并 recordAlert
 */
export declare class BootstrapError extends Error {
    readonly code = "RATE_LIMIT_BOOTSTRAP_FAILED";
    readonly bootstrapResult: BootstrapResult;
    constructor(message: string, result: BootstrapResult);
}
export interface BootstrapResult {
    /** 计数 store 是否注入成功 */
    countStoreInjected: boolean;
    /** 配置 store 是否注入成功 */
    configStoreInjected: boolean;
    /** 注入时间戳 */
    injectedAt: number;
    /** 注入使用的配置摘要 */
    summary: {
        rateLimitsCollection: string;
        rateLimitConfigsCollection: string;
        configCacheTtlMs: number;
    };
}
/**
 * 获取最近一次 bootstrap 结果（用于审计 / 监控）
 */
export declare function getLastBootstrap(): BootstrapResult | null;
/**
 * 一键初始化限流系统
 *
 * 流程：
 *   1. 注入限流计数 store（db 集合）
 *   2. 注入限流配置 store（db 集合）
 *   3. 设置配置缓存 TTL
 *   4. 记录注入结果到全局状态
 *
 * 任意步骤失败不影响云函数启动（降级到内存模式）
 */
export declare function bootstrapRateLimit(db: any, options?: BootstrapOptions): BootstrapResult;
/**
 * 列出所有云函数是否完成 bootstrap
 *
 * 用法：
 *   const services = listAllServices()
 *   for (const svc of services) {
 *     if (!svc.bootstrapped) console.warn(`${svc.name} 未 bootstrap`)
 *   }
 */
export declare function listBootstrappedServices(): Array<{
    countStoreInjected: boolean;
    configStoreInjected: boolean;
    injectedAt: number;
    summary: BootstrapResult['summary'];
}>;
declare const _default: {
    bootstrapRateLimit: typeof bootstrapRateLimit;
    getLastBootstrap: typeof getLastBootstrap;
    listBootstrappedServices: typeof listBootstrappedServices;
};
export default _default;
