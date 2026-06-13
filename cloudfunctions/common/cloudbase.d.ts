declare const initialize: (...args: unknown[]) => unknown, CloudBase: new (...args: unknown[]) => unknown;
type CloudBaseInstance = ReturnType<typeof initialize>;
type ApiKeyInstance = InstanceType<typeof CloudBase>;
type AnyCloudBase = CloudBaseInstance | ApiKeyInstance;
/**
 * 获取云开发 SDK 实例（懒初始化）
 * 第一次访问时才执行 initialize，CI 环境可以传入 mock 替换
 * 注意：未配置对应环境变量时会 throw
 */
export declare function getCloudbase(): AnyCloudBase;
/**
 * 显式使用 AppSecret 方式初始化（特殊场景）
 * 注意：未配置 CLOUDBASE_SECRET 时会 throw
 */
export declare function initializeAppSecret(): CloudBaseInstance;
/**
 * 显式使用 ApiKey 方式初始化（特殊场景）
 * 注意：未配置 CLOUDBASE_API_KEY 时会 throw
 */
export declare function initializeApiKey(): ApiKeyInstance;
/**
 * 默认导出为 null（懒初始化模式，使用前请调用 getCloudbase()）
 */
export default null;
