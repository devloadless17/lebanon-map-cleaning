import { createLocationSchema } from '@lebanon/contracts';
import { db } from '@lebanon/core';
import { body, route } from '@/server/handler';
import { requireUser } from '@/server/session';

export function POST(request: Request) {
  return route(async () => {
    await requireUser();
    const input = await body(request, createLocationSchema);
    return db().location.create({
      data: {
        customerId: input.customerId,
        label: input.label ?? null,
        addressText: input.addressText,
        localityId: input.localityId ?? null,
        precision: input.precision,
        latitude: input.latitude,
        longitude: input.longitude,
        plusCode: input.plusCode ?? null,
        landmarkNotes: input.landmarkNotes ?? null,
      },
      include: { locality: { include: { planningArea: true } } },
    });
  });
}
