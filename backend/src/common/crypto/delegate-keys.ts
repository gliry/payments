import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function normalizeHexKey(key: string): string {
  return key.startsWith('0x') ? key.slice(2) : key;
}

export function encryptPrivateKey(
  privateKey: string,
  encryptionKey: string,
): string {
  const key = Buffer.from(normalizeHexKey(encryptionKey), 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptPrivateKey(
  encryptedData: string,
  encryptionKey: string,
): string {
  const [ivHex, authTagHex, ciphertextHex] = encryptedData.split(':');
  const key = Buffer.from(normalizeHexKey(encryptionKey), 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
