import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../domain/errors/domain-errors.js';

/**
 * The single place where an error becomes an HTTP response.
 *
 * Domain errors already carry a sentence written for a scheduler. Anything else is logged in
 * full and replaced with a generic message — an internal stack trace or a provider's error code
 * must never reach a user.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      response.status(exception.status).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json({
        code: status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED',
        message:
          typeof body === 'string'
            ? body
            : ((body as { message?: string }).message ?? exception.message),
      });
      return;
    }

    // Postgres raised the exclusion constraint: two schedulers committed into the same gap, or
    // the app's own check missed something. Either way the user gets the human sentence.
    const code = (exception as { code?: string })?.code;
    const message = String((exception as { message?: string })?.message ?? '');
    if (code === 'P2002' || message.includes('appointments_no_overlap')) {
      response.status(409).json({
        code: 'APPOINTMENT_CONFLICT',
        message: 'That time overlaps another appointment. The team can only be in one place.',
      });
      return;
    }

    this.logger.error(`Unhandled error: ${String(exception)}`, (exception as Error)?.stack);
    response.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    });
  }
}
