import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type Branch,
  type CreateBranch,
  type CreateMerchant,
  type MerchantDetail,
  type MerchantListQuery,
  type MerchantPage,
  type MerchantSummary,
  type UpdateBranch,
  type UpdateMerchant,
  createBranchSchema,
  createMerchantSchema,
  merchantListQuerySchema,
  updateBranchSchema,
  updateMerchantSchema,
} from '@zestia/contracts';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RequirePermission, TenantScoped } from '../tenancy';
import { MerchantsService } from './merchants.service';

const uuid = new ParseUUIDPipe();

/**
 * Comercios y sucursales (#19). Ver docs/API_CONTRACTS.md. Lectura: `merchants:read`;
 * cambios: `merchants:manage`. Todo cambio queda en la auditoría.
 */
@Controller('api/v1/merchants')
@TenantScoped()
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get()
  @RequirePermission('merchants:read')
  list(
    @Query(new ZodValidationPipe(merchantListQuerySchema)) query: MerchantListQuery,
  ): Promise<MerchantPage> {
    return this.merchants.list(query);
  }

  @Post()
  @RequirePermission('merchants:manage')
  create(
    @Body(new ZodValidationPipe(createMerchantSchema)) body: CreateMerchant,
  ): Promise<MerchantSummary> {
    return this.merchants.create(body);
  }

  @Get(':id')
  @RequirePermission('merchants:read')
  findOne(@Param('id', uuid) id: string): Promise<MerchantDetail> {
    return this.merchants.detail(id);
  }

  @Patch(':id')
  @RequirePermission('merchants:manage')
  update(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateMerchantSchema)) body: UpdateMerchant,
  ): Promise<MerchantSummary> {
    return this.merchants.update(id, body);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('merchants:manage')
  suspend(@Param('id', uuid) id: string): Promise<MerchantSummary> {
    return this.merchants.transition(id, 'suspend');
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('merchants:manage')
  reactivate(@Param('id', uuid) id: string): Promise<MerchantSummary> {
    return this.merchants.transition(id, 'reactivate');
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('merchants:manage')
  archive(@Param('id', uuid) id: string): Promise<MerchantSummary> {
    return this.merchants.transition(id, 'archive');
  }

  @Post(':id/branches')
  @RequirePermission('merchants:manage')
  createBranch(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranch,
  ): Promise<Branch> {
    return this.merchants.createBranch(id, body);
  }

  @Patch(':id/branches/:branchId')
  @RequirePermission('merchants:manage')
  updateBranch(
    @Param('id', uuid) id: string,
    @Param('branchId', uuid) branchId: string,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranch,
  ): Promise<Branch> {
    return this.merchants.updateBranch(id, branchId, body);
  }

  @Post(':id/branches/:branchId/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('merchants:manage')
  archiveBranch(
    @Param('id', uuid) id: string,
    @Param('branchId', uuid) branchId: string,
  ): Promise<void> {
    return this.merchants.archiveBranch(id, branchId);
  }
}
