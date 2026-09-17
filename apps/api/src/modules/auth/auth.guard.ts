import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UnauthorizedError } from '../../domain/errors/domain-errors.js';
import { AuthService, type SessionUser } from './auth.service.js';

export const SESSION_COOKIE = 'lebanon_session';
export const IS_PUBLIC = 'isPublic';

/** Opt OUT of auth explicitly. Everything else is protected by default. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthedRequest extends Request {
  user?: SessionUser;
}

/**
 * Applied globally, so a new controller is protected the moment it exists. Forgetting to add a
 * guard is a much easier mistake to make than forgetting to add @Public().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = (request.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedError();

    request.user = await this.auth.verifyToken(token);
    return true;
  }
}
