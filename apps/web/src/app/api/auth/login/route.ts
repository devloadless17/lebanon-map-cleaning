import { z } from 'zod';
import { UnauthorizedError, db, verifyPassword, hashPassword } from '@lebanon/core';
import { body, route } from '@/server/handler';
import { issueSession } from '@/server/session';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export function POST(request: Request) {
  return route(async () => {
    const input = await body(request, loginSchema);
    const user = await db().user.findUnique({ where: { email: input.email.trim().toLowerCase() } });

    // Hash even when the user does not exist, so response timing cannot be used to work out
    // which email addresses have accounts.
    const stored = user?.passwordHash ?? (await hashPassword('no-such-user'));
    const ok = await verifyPassword(input.password, stored);
    if (!user || !ok) throw new UnauthorizedError('That email and password do not match.');

    const session = { id: user.id, email: user.email, name: user.name };
    await issueSession(session);
    return { user: session };
  });
}
