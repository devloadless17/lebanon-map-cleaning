import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { UnauthorizedError } from '../../domain/errors/domain-errors.js';
import { AuthService } from './auth.service.js';
import { type AuthedRequest, Public, SESSION_COOKIE } from './auth.guard.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type LoginBody = z.infer<typeof loginSchema>;

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // Brute force protection on the one endpoint that accepts guesses.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: { id: string; email: string; name: string } }> {
    const user = await this.auth.validate(body.email, body.password);
    const token = await this.auth.issueToken(user);

    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true, // unreadable from JavaScript, so XSS cannot exfiltrate the session
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
      path: '/',
    });

    return { user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response): { ok: true } {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() request: AuthedRequest): { user: { id: string; email: string; name: string } } {
    if (!request.user) throw new UnauthorizedError();
    return { user: request.user };
  }
}
