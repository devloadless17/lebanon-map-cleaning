import { Module } from '@nestjs/common';
import { DayRepository } from './day.repository.js';
import { SchedulingController } from './scheduling.controller.js';
import { SchedulingService } from './scheduling.service.js';
import { TravelMatrixBuilder } from './travel-matrix.builder.js';

@Module({
  controllers: [SchedulingController],
  providers: [SchedulingService, DayRepository, TravelMatrixBuilder],
  exports: [SchedulingService, DayRepository, TravelMatrixBuilder],
})
export class SchedulingModule {}
