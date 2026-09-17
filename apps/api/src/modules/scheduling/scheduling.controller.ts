import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { type PreviewRequest, type PreviewResponse, previewRequestSchema, isoDateSchema } from '@lebanon/contracts';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ValidationError } from '../../domain/errors/domain-errors.js';
import { SchedulingService, type DayView } from './scheduling.service.js';

@Controller('days')
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get(':date')
  async day(@Param('date') date: string): Promise<DayView> {
    return this.scheduling.day(parseDate(date));
  }

  @Post(':date/preview')
  async preview(
    @Param('date') date: string,
    @Body(new ZodValidationPipe(previewRequestSchema)) body: PreviewRequest,
  ): Promise<PreviewResponse> {
    return this.scheduling.preview(parseDate(date), body);
  }

  @Get(':date/geometry')
  async geometry(@Param('date') date: string): Promise<{ encodedPolyline: string | null }> {
    return this.scheduling.geometry(parseDate(date));
  }
}

function parseDate(value: string): string {
  const parsed = isoDateSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError('Expected a date in YYYY-MM-DD form.');
  return parsed.data;
}
