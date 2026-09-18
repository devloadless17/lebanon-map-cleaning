import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { UnauthorizedError } from '@lebanon/core';
import { env } from './env';

export const SESSION_COOKIE = 'lebanon_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

// `jose` rather than jsonwebtoken: it uses Web Crypto, so the same code runs unchanged whether
// this is a serverless function, an edge runtime, or a long-lived Node server.
const key = () => new TextEncoder().encode(env().SESSION_SECRET);

export async function issueSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // unreadable from JavaScript, so XSS cannot exfiltrate the session
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Throws UnauthorizedError, which the handler wrapper turns into a 401. */
export async function requireUser(): Promise<SessionUser> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new UnauthorizedError();

  try {
    const { payload } = await jwtVerify(token, key());
    return {
      id: String(payload.sub),
      email: String(payload['email'] ?? ''),
      name: String(payload['name'] ?? ''),
    };
  } catch {
    throw new UnauthorizedError('Your session has expired. Please sign in again.');
  }
}
