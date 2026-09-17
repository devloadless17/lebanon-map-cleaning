import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedError } from '../../domain/errors/domain-errors.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validate(email: string, password: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // Hash even when the user does not exist, so response timing cannot be used to enumerate
    // which email addresses have accounts.
    const storedHash = user?.passwordHash ?? (await hashPassword('no-such-user'));
    const ok = await verifyPassword(password, storedHash);

    if (!user || !ok) throw new UnauthorizedError('That email and password do not match.');
    return { id: user.id, email: user.email, name: user.name };
  }

  async issueToken(user: SessionUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email, name: user.name });
  }

  async verifyToken(token: string): Promise<SessionUser> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string; name: string }>(token);
      return { id: payload.sub, email: payload.email, name: payload.name };
    } catch {
      throw new UnauthorizedError('Your session has expired. Please sign in again.');
    }
  }

  async createUser(email: string, name: string, password: string): Promise<SessionUser> {
    const user = await this.prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        passwordHash: await hashPassword(password),
      },
    });
    return { id: user.id, email: user.email, name: user.name };
  }
}
