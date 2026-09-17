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

    const detail = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
    throw new ValidationError(detail);
  }
}
