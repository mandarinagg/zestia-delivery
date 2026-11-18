import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy';
import { MerchantsController } from './merchants.controller';
import { MerchantsRepository } from './merchants.repository';

@Module({
  imports: [TenancyModule],
  controllers: [MerchantsController],
  providers: [MerchantsRepository],
})
export class MerchantsModule {}
