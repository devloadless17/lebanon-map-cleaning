import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { isoDateSchema } from '@lebanon/contracts';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ValidationError } from '../../domain/errors/domain-errors.js';
import {
  AppointmentsService,
  type CreateAppointment,
  type UpdateAppointment,
  createAppointmentSchema,
  updateAppointmentSchema,
} from './appointments.service.js';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  async list(@Query('date') date?: string) {
    const parsed = isoDateSchema.safeParse(date);
    if (!parsed.success) throw new ValidationError('A date query parameter (YYYY-MM-DD) is required.');
    return this.appointments.listForDate(parsed.data);
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createAppointmentSchema)) body: CreateAppointment) {
    return this.appointments.create(body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(updateAppointmentSchema)) body: UpdateAppointment) {
    return this.appointments.update(id, body);
  }

  @Delete(':id')
  async cancel(@Param('id') id: string) {
    return this.appointments.cancel(id);
  }
}
