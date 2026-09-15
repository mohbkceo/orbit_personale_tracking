import crypto from 'node:crypto';
import { env } from '../config/env.js';

const key = crypto.createHash('sha256').update(env.SETTINGS_ENCRYPTION_KEY).digest();

export function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecret({ encrypted, iv, authTag }) {
  if (!encrypted || !iv || !authTag) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskToken(token) {
  if (!token) return null;
  const [prefix = '', suffix = ''] = token.split(':');
  return `${prefix}:${'*'.repeat(12)}${suffix.slice(-3)}`;
}
