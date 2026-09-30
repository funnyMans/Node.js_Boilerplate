import { randomBytes, scrypt as deriveKey, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PasswordHasher } from '../../app/services/password-hasher.interface';

const scrypt = promisify(deriveKey);

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(value: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = (await scrypt(value, salt, 64)) as Buffer;
    return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
  }

  async verify(value: string, digest: string): Promise<boolean> {
    const [saltHex, keyHex] = digest.split(':');
    if (!saltHex || !keyHex) return false;

    const expected = Buffer.from(keyHex, 'hex');
    const actual = (await scrypt(value, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  randomToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
