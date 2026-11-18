import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { RequirePermission, TenantScoped } from '../tenancy';
import { MerchantsRepository } from './merchants.repository';

export interface MerchantView {
  id: string;
  name: string;
  ruc: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Comercios — SOLO lectura por id, para probar el aislamiento de punta a punta (#15).
 * El CRUD completo, listado paginado y contratos Zod son el issue #19.
 */
@Controller('api/v1/merchants')
@TenantScoped()
export class MerchantsController {
  constructor(private readonly merchants: MerchantsRepository) {}

  @Get(':id')
  @RequirePermission('merchants:read')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<MerchantView> {
    const merchant = await this.merchants.findById(id);
    // Inexistente y "de otro tenant" son indistinguibles: siempre 404.
    if (!merchant) throw new NotFoundException();
    return {
      id: merchant.id,
      name: merchant.name,
      ruc: merchant.ruc,
      phone: merchant.phone,
      status: merchant.status,
      createdAt: merchant.createdAt.toISOString(),
      updatedAt: merchant.updatedAt.toISOString(),
    };
  }
}
