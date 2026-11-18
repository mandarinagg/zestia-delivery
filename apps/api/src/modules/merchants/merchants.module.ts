import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { TenancyModule } from '../tenancy';
import { MerchantsController } from './merchants.controller';
import { MerchantsRepository } from './merchants.repository';
import { MerchantsService } from './merchants.service';

@Module({
  imports: [TenancyModule, AuditModule],
  controllers: [MerchantsController],
  providers: [MerchantsRepository, MerchantsService],
})
export class MerchantsModule {}
