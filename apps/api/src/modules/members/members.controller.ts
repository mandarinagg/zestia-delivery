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
  type CreateInvitation,
  type Invitation,
  type InvitationList,
  type Member,
  type MemberListQuery,
  type MemberPage,
  type UpdateMember,
  createInvitationSchema,
  memberListQuerySchema,
  updateMemberSchema,
} from '@zestia/contracts';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RequirePermission, TenantScoped } from '../tenancy';
import { MembersService } from './members.service';

const uuid = new ParseUUIDPipe();

/**
 * Usuarios de la empresa (#18). Ver docs/API_CONTRACTS.md. Lectura: `users:read`; cambios:
 * `users:manage` (y `users:manage-owners` si toca el rol Propietario, lo verifica el servicio).
 */
@Controller('api/v1/members')
@TenantScoped()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission('users:read')
  list(
    @Query(new ZodValidationPipe(memberListQuerySchema)) query: MemberListQuery,
  ): Promise<MemberPage> {
    return this.members.list(query);
  }

  @Get(':id')
  @RequirePermission('users:read')
  findOne(@Param('id', uuid) id: string): Promise<Member> {
    return this.members.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('users:manage')
  update(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMember,
  ): Promise<Member> {
    return this.members.changeRole(id, body.role);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('users:manage')
  disable(@Param('id', uuid) id: string): Promise<Member> {
    return this.members.setStatus(id, 'DISABLED');
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('users:manage')
  enable(@Param('id', uuid) id: string): Promise<Member> {
    return this.members.setStatus(id, 'ACTIVE');
  }
}

/** Invitaciones de la empresa (#18): listar, invitar, reenviar y revocar. */
@Controller('api/v1/invitations')
@TenantScoped()
export class InvitationsController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission('users:read')
  list(): Promise<InvitationList> {
    return this.members.listInvitations();
  }

  @Post()
  @RequirePermission('users:manage')
  create(
    @Body(new ZodValidationPipe(createInvitationSchema)) body: CreateInvitation,
  ): Promise<Invitation> {
    return this.members.invite(body);
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('users:manage')
  resend(@Param('id', uuid) id: string): Promise<Invitation> {
    return this.members.resend(id);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('users:manage')
  revoke(@Param('id', uuid) id: string): Promise<void> {
    return this.members.revoke(id);
  }
}
