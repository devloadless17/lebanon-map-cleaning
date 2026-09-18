import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationError } from '../domain/errors/domain-errors.js';

/**
 * Validates request bodies against the SAME Zod schema the web app uses for its forms, so the
 * rules are written once. Shape only — whether an appointment actually fits the route is
 * business logic and belongs in the domain layer, not in a schema.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    // Deliberately WITHOUT the field path. These messages surface directly to the user, and
    // the "or enter any time" override is the most-used control in the product — a scheduler
    // typing 08:00 into a 13:00-17:00 window should read "the visit would start before the
    // customer is available", not "promisedStart: ...". The schemas already phrase every
    // message as a sentence, so the path adds nothing but noise.
    const detail = result.error.issues.map((issue) => issue.message).join('. ');
    throw new ValidationError(detail);
  }
}
