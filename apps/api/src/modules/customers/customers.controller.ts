import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { createCustomerSchema, type CreateCustomer } from '@lebanon/contracts';
import { z } from 'zod';
import { definedOnly } from '../../common/defined-only.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { NotFoundError } from '../../domain/errors/domain-errors.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

const updateCustomerSchema = createCustomerSchema.partial();

@Controller('customers')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('search') search?: string) {
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search } },
          ],
        }
      : {};

    return this.prisma.customer.findMany({
      where,
      include: { locations: { include: { locality: true } } },
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  @Get(':id')
  async byId(@Param('id') id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { locations: { include: { locality: true } } },
    });
    if (!customer) throw new NotFoundError('That customer');
    return customer;
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomer) {
    return this.prisma.customer.create({
      data: {
        name: body.name,
        phone: body.phone,
        email: body.email ?? null,
        notes: body.notes ?? null,
      },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(updateCustomerSchema)) body: z.infer<typeof updateCustomerSchema>) {
    return this.prisma.customer.update({ where: { id }, data: definedOnly(body) });
  }
}
