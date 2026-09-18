import { createCustomerSchema } from '@lebanon/contracts';
import { db } from '@lebanon/core';
import { body, route } from '@/server/handler';
import { requireUser } from '@/server/session';

export function GET(request: Request) {
  return route(async () => {
    await requireUser();
    const search = new URL(request.url).searchParams.get('search');
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search } },
          ],
        }
      : {};

    return db().customer.findMany({
      where,
      include: { locations: { include: { locality: true } } },
      orderBy: { name: 'asc' },
      take: 50,
    });
  });
}

export function POST(request: Request) {
  return route(async () => {
    await requireUser();
    const input = await body(request, createCustomerSchema);
    return db().customer.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        notes: input.notes ?? null,
      },
    });
  });
}
