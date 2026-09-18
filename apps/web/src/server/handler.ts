import { NextResponse } from 'next/server';
import { DomainError, Logger } from '@lebanon/core';
import type { ZodType } from 'zod';

const logger = new Logger('api');

/**
 * The one place an error becomes an HTTP response.
 *
 * Domain errors already carry a sentence written for a scheduler, so they pass through. Anything
 * else is logged in full and replaced with a generic message — an internal stack trace or a
 * provider's error code must never reach a user.
 */
export function toResponse(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }

  // Postgres raised the exclusion constraint: two people committed into the same gap at once.
  const message = String((error as { message?: string })?.message ?? '');
  if (message.includes('appointments_no_overlap') || (error as { code?: string })?.code === 'P2002') {
    return NextResponse.json(
      {
        code: 'APPOINTMENT_CONFLICT',
        message: 'That time overlaps another appointment. The team can only be in one place.',
      },
      { status: 409 },
    );
  }

  logger.error('Unhandled error', error);
  return NextResponse.json(
    { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' },
    { status: 500 },
  );
}

/** Wraps a route handler so every thrown error maps consistently. */
export function route<T>(handler: () => Promise<T>): Promise<NextResponse> {
  return handler()
    .then((body) => NextResponse.json(body ?? { ok: true }))
    .catch(toResponse);
}

/**
 * Validates a request body against the SAME Zod schema the forms use, so the rules live in one
 * place. Deliberately WITHOUT field paths in the message: these surface directly to the user,
 * and the schemas already phrase every message as a sentence.
 */
export async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const raw: unknown = await request.json().catch(() => ({}));
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  const { ValidationError } = await import('@lebanon/core');
  throw new ValidationError(result.error.issues.map((issue) => issue.message).join('. '));
}
