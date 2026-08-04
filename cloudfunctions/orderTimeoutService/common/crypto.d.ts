/**
 * 加密工具（AES-256-GCM，TypeScript 源文件 - Sprint 35 迁移）
 *
 * 目标：
 *   1. 替代 cloudfunctions/hostService/index.js 的 AES-CBC（弱加密）
 *   2. 替代 cloudfunctions/paymentService/services/notify.js 的内嵌实现
 *   3. 统一所有敏感字段（idCard / phone / bankCard）的加解密入口
 *
 * 加密格式（v2.0）：
 *   base64(iv).base64(authTag).base64(ciphertext)
 *   12 + 16 + N 字节，分别 base64 后用 '.' 拼接
 *
 * Key 派生：
 *   scrypt(passphrase, salt, 32) —— 慢哈希，防爆破
 *
 * 兼容性：
 *   - 旧 AES-CBC 数据保留 6 个月，本模块不处理旧格式
 *   - 旧模块路径 cloudfunctions/hostService/index.js 内部仍可继续运行
 */
/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import * as crypto from 'crypto';
export declare const ALGORITHM = "aes-256-gcm";
export declare const IV_LENGTH = 12;
export declare const AUTH_TAG_LENGTH = 16;
export declare const KEY_LENGTH = 32;
export declare const SCRYPT_PARAMS: crypto.ScryptOptions;
export interface DerivedKey {
    key: Buffer;
    salt: string;
}
/**
 * 从口令派生 32 字节 key
 */
export declare function deriveKey(passphrase: string, salt?: string | null): DerivedKey;
/**
 * 加密（返回 base64.iv.base64.tag.base64.cipher）
 */
export declare function encrypt(plaintext: string, key: Buffer): string;
/**
 * 解密
 */
export declare function decrypt(payload: string, key: Buffer): string;
/**
 * 计算字符串 SHA-256（用于幂等键、缓存 key）
 */
export declare function sha256(input: string | object): string;
/**
 * HMAC-SHA256 签名（用于微信支付 v3 回调验签）
 */
export declare function hmacSha256(data: string, secret: string | Buffer): string;
/**
 * 时间安全比较（防止时序攻击）
 */
export declare function safeEqual(a: string | Buffer, b: string | Buffer): boolean;
/**
 * 生成随机字符串（指定长度，base64url 编码）
 */
export declare function randomString(bytes?: number): string;
declare const _exports: {
    ALGORITHM: string;
    IV_LENGTH: number;
    AUTH_TAG_LENGTH: number;
    KEY_LENGTH: number;
    deriveKey: typeof deriveKey;
    encrypt: typeof encrypt;
    decrypt: typeof decrypt;
    sha256: typeof sha256;
    hmacSha256: typeof hmacSha256;
    safeEqual: typeof safeEqual;
    randomString: typeof randomString;
};
export default _exports;
