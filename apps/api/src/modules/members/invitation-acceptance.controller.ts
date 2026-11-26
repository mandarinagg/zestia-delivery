import type { IncomingMessage } from 'node:http';
import { Body, Controller, Header, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  type AcceptInvitation,
  type AcceptInvitationResponse,
  type InvitationPreview,
  type InvitationPreviewRequest,
  acceptInvitationSchema,
  invitationPreviewRequestSchema,
} from '@zestia/contracts';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { SkipCsrfToken } from '../auth';
import { TenantExempt } from '../tenancy';
import { InvitationAcceptanceService } from './invitation-acceptance.service';

type HttpRequest = IncomingMessage & { id?: unknown };

/**
 * Aceptar una invitación (#18). La persona invitada todavía no es miembro: no hay tenant activo
 * ni (quizás) sesión. Autoriza el token del email. El token va en el cuerpo de un POST (nunca en
 * la URL: quedaría en logs de acceso). `Cache-Control: no-store`.
 */
@Controller('api/v1/auth/invitations')
@TenantExempt('aceptar una invitación: todavía no hay membresía; autoriza el token del email')
export class InvitationAcceptanceController {
  constructor(private readonly acceptance: InvitationAcceptanceService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @SkipCsrfToken('sin sesión en el tenant; solo lectura, autorizada por el token del email')
  preview(
    @Body(new ZodValidationPipe(invitationPreviewRequestSchema)) body: InvitationPreviewRequest,
  ): Promise<InvitationPreview> {
    return this.acceptance.preview(body.token);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @SkipCsrfToken('sin sesión en el tenant; autorizada por el token de un solo uso del email')
  accept(
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitation,
    @Req() req: HttpRequest,
  ): Promise<AcceptInvitationResponse> {
    return this.acceptance.accept(body, typeof req.id === 'string' ? req.id : null);
  }
}
