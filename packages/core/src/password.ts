import { type ScryptOptions, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Hand-wrapped rather than promisify()'d: promisify collapses scrypt's overloads and loses the
// one that accepts cost parameters, which are the whole point of using it.
const scryptAsync = (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) =>
      error ? reject(error) : resolve(derivedKey),
    );
  });

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// Cost parameters. N=2^15 with the default r=8 needs ~32 MB per hash, which comfortably
// outruns commodity cracking hardware while staying instant for a handful of staff logins.
const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/**
 * Node's built-in scrypt rather than a native argon2 binding.
 *
 * Deliberate: argon2 needs node-gyp and a compiler in the Docker builder, and a native module
 * that fails to build is a deployment outage. scrypt is a memory-hard KDF that ships with the
 * runtime, so the production image needs no build toolchain at all.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltB64, hashB64] = stored.split('$');
  if (algorithm !== 'scrypt' || !saltB64 || !hashB64) return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scryptAsync(password, salt, expected.length, SCRYPT_OPTIONS);

  // Constant-time: a length-sensitive or early-exit compare leaks the hash one byte at a time.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
