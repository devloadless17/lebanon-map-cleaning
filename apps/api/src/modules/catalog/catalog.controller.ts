import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { daySettingsSchema, type DaySettings } from '@lebanon/contracts';
import { z } from 'zod';
import { definedOnly } from '../../common/defined-only.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

const planningAreaSchema = z.object({
  name: z.string().trim().min(1).max(80),
  colorToken: z.string().trim().min(1).max(40).default('slate'),
  description: z.string().max(500).nullable().optional(),
});

const localitySchema = z.object({
  name: z.string().trim().min(1).max(80),
  planningAreaId: z.string().uuid(),
  centroidLatitude: z.number().min(-90).max(90),
  centroidLongitude: z.number().min(-180).max(180),
});

/** Planning areas, the locality dictionary, and the singleton day settings. */
@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('planning-areas')
  async areas() {
    return this.prisma.planningArea.findMany({
      include: { localities: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post('planning-areas')
  async createArea(@Body(new ZodValidationPipe(planningAreaSchema)) body: z.infer<typeof planningAreaSchema>) {
    return this.prisma.planningArea.create({
      data: { name: body.name, colorToken: body.colorToken, description: body.description ?? null },
    });
  }

  @Patch('planning-areas/:id')
  async updateArea(@Param('id') id: string, @Body(new ZodValidationPipe(planningAreaSchema.partial())) body: Partial<z.infer<typeof planningAreaSchema>>) {
    return this.prisma.planningArea.update({ where: { id }, data: definedOnly(body) });
  }

  @Delete('planning-areas/:id')
  async deleteArea(@Param('id') id: string) {
    await this.prisma.planningArea.delete({ where: { id } });
    return { ok: true };
  }

  @Get('localities')
  async localities() {
    return this.prisma.locality.findMany({
      include: { planningArea: true },
      orderBy: { name: 'asc' },
    });
  }

  @Post('localities')
  async createLocality(@Body(new ZodValidationPipe(localitySchema)) body: z.infer<typeof localitySchema>) {
    return this.prisma.locality.create({ data: body });
  }

  @Patch('localities/:id')
  async updateLocality(@Param('id') id: string, @Body(new ZodValidationPipe(localitySchema.partial())) body: Partial<z.infer<typeof localitySchema>>) {
    return this.prisma.locality.update({ where: { id }, data: definedOnly(body) });
  }

  @Get('settings')
  async settings() {
    // Mirrors DayRepository: create on first read rather than throwing, so a fresh deployment
    // can be configured from the UI instead of needing SQL.
    const row = await this.prisma.daySettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        depotLatitude: 33.8959,
        depotLongitude: 35.4797,
        depotLabel: 'Hamra, Beirut',
        workdayStart: 0,
        workdayEnd: 23 * 60 + 59,
        defaultServiceMinutes: 120,
        accessBufferMinutes: 10,
      },
    });
    return toSettings(row);
  }

  @Patch('settings')
  async updateSettings(@Body(new ZodValidationPipe(daySettingsSchema.partial())) body: Partial<DaySettings>) {
    const row = await this.prisma.daySettings.update({ where: { id: 'singleton' }, data: definedOnly(body) });
    return toSettings(row);
  }
}

function toSettings(row: {
  depotLatitude: unknown;
  depotLongitude: unknown;
  depotLabel: string;
  workdayStart: number;
  workdayEnd: number;
  defaultServiceMinutes: number;
  accessBufferMinutes: number;
}): DaySettings {
  return {
    depotLatitude: Number(row.depotLatitude),
    depotLongitude: Number(row.depotLongitude),
    depotLabel: row.depotLabel,
    workdayStart: row.workdayStart,
    workdayEnd: row.workdayEnd,
    defaultServiceMinutes: row.defaultServiceMinutes,
    accessBufferMinutes: row.accessBufferMinutes,
  };
}
