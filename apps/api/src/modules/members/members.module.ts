import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { MailModule } from '../mail';
import { TenancyModule } from '../tenancy';
import { InvitationAcceptanceController } from './invitation-acceptance.controller';
import { InvitationAcceptanceService } from './invitation-acceptance.service';
import { InvitationsController, MembersController } from './members.controller';
import { MembersRepository } from './members.repository';
import { MembersService } from './members.service';

/** Usuarios del tenant e invitaciones (#18). `PasswordHasher` viene del AuthModule (global). */
@Module({
  imports: [TenancyModule, AuditModule, MailModule],
  controllers: [MembersController, InvitationsController, InvitationAcceptanceController],
  providers: [MembersRepository, MembersService, InvitationAcceptanceService],
})
export class MembersModule {}
