/**
 * crypto.js 的类型声明
 * idempotency.ts / 其它 .ts 源文件需要此 shim
 */

export const ALGORITHM: 'aes-256-gcm'
export const IV_LENGTH: number
export const AUTH_TAG_LENGTH: number
export const KEY_LENGTH: number

export interface DeriveKeyResult {
  key: Buffer
  salt: string
}

export function deriveKey(passphrase: string, salt?: string | null): DeriveKeyResult

export function encrypt(plaintext: string, key: Buffer): string
export function decrypt(payload: string, key: Buffer): string
export function sha256(input: string | Record<string, unknown>): string
export function hmacSha256(data: string, secret: string | Buffer): string
export function safeEqual(a: string | Buffer, b: string | Buffer): boolean
export function randomString(bytes?: number): string
