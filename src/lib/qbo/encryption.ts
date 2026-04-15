/**
 * AES-256-GCM symmetric encryption for QBO refresh tokens at rest.
 *
 * Key comes from QBO_TOKEN_ENCRYPTION_KEY env var as a 64-char hex
 * string (32 bytes). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Format of stored ciphertext (single string for one column):
 *   v1.<iv_hex>.<ciphertext_hex>.<tag_hex>
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const VERSION = 'v1'

function getKey(): Buffer {
  const hex = process.env.QBO_TOKEN_ENCRYPTION_KEY
  if (!hex) throw new Error('QBO_TOKEN_ENCRYPTION_KEY is not set')
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('QBO_TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12) // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}.${iv.toString('hex')}.${ct.toString('hex')}.${tag.toString('hex')}`
}

export function decryptToken(payload: string): string {
  const key = getKey()
  const parts = payload.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed encrypted token payload')
  }
  const iv = Buffer.from(parts[1], 'hex')
  const ct = Buffer.from(parts[2], 'hex')
  const tag = Buffer.from(parts[3], 'hex')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}
