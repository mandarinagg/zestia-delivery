import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  type AuthSessionResponse,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
  type LoginRequest,
  type ResetPasswordRequest,
  type SwitchTenantRequest,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  switchTenantRequestSchema,
} from '@zestia/contracts';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { TenantExempt } from '../tenancy';
import { AUTH_SETTINGS, type AuthSettings } from './auth-settings';
import { AuthService, type RateLimited, type RequestMeta } from './auth.service';
import { SkipCsrfToken } from './csrf.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { clearSessionCookie, setSessionCookie } from './session-cookie';
import { type CurrentSession, SessionService } from './session.service';
import { deriveCsrfToken } from './tokens';

type HttpRequest = IncomingMessage & { ip?: string; id?: unknown };

const FORGOT_PASSWORD_MESSAGE =
  'Si el email corresponde a una cuenta activa, te enviamos un enlace para restablecer la contraseña.';

const unauthenticated = (): UnauthorizedException =>
  new UnauthorizedException({ statusCode: 401, code: 'UNAUTHENTICATED' });

/**
 * Autenticación por sesión de servidor (issue #14). Contratos: `@zestia/contracts` (auth.ts) y
 * docs/API_CONTRACTS.md. Todas las respuestas llevan `Cache-Control: no-store`.
 *
 * Exento de tenant: estos endpoints CREAN la sesión y eligen el tenant activo; no leen datos
 * de negocio. El cambio de tenant valida la membresía con el mismo `TenantResolver` del guard.
 */
@Controller('api/v1/auth')
@TenantExempt('autenticación: crea la sesión y elige el tenant activo; sin datos de negocio')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @SkipCsrfToken('todavía no hay sesión; protegido por el chequeo de Origin')
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<AuthSessionResponse> {
    const previousToken = this.sessions.tokenFrom(req);
    const result = await this.auth.login(body.email, body.password, previousToken, meta(req));
    if (!result.ok) {
      if (result.reason === 'TOO_MANY_ATTEMPTS') throw tooManyAttempts(res, result);
      throw new UnauthorizedException({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
    }
    this.sessions.forget(req);
    setSessionCookie(res, result.token, {
      secure: this.settings.cookieSecure,
      maxAgeSeconds: this.settings.absoluteSeconds,
    });
    const view = await this.auth.sessionView(result);
    if (!view) throw unauthenticated();
    return view;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<void> {
    await this.auth.logout(this.sessions.tokenFrom(req), meta(req));
    this.sessions.forget(req);
    clearSessionCookie(res, this.settings.cookieSecure);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionAuthGuard)
  async me(@Req() req: HttpRequest): Promise<AuthSessionResponse> {
    const view = await this.auth.sessionView(await this.requireSession(req));
    if (!view) throw unauthenticated();
    return view;
  }

  @Post('switch-tenant')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionAuthGuard)
  async switchTenant(
    @Body(new ZodValidationPipe(switchTenantRequestSchema)) body: SwitchTenantRequest,
    @Req() req: HttpRequest,
  ): Promise<AuthSessionResponse> {
    const session = await this.requireSession(req);
    const result = await this.auth.switchTenant(session, body.tenantId, meta(req));
    if (!result.ok) {
      if (result.reason === 'UNAUTHENTICATED') throw unauthenticated();
      throw new ForbiddenException({ statusCode: 403, code: 'NO_ACTIVE_MEMBERSHIP' });
    }
    const view = await this.auth.sessionView({ ...session, activeTenantId: body.tenantId });
    if (!view) throw unauthenticated();
    return view;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionAuthGuard)
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<ChangePasswordResponse> {
    const session = await this.requireSession(req);
    const result = await this.auth.changePassword(
      session,
      body.currentPassword,
      body.newPassword,
      meta(req),
    );
    if (!result.ok) {
      if (result.reason === 'TOO_MANY_ATTEMPTS') throw tooManyAttempts(res, result);
      if (result.reason === 'UNAUTHENTICATED') throw unauthenticated();
      throw new BadRequestException({ statusCode: 400, code: 'INVALID_CURRENT_PASSWORD' });
    }
    this.sessions.forget(req);
    setSessionCookie(res, result.token, {
      secure: this.settings.cookieSecure,
      maxAgeSeconds: this.settings.absoluteSeconds,
    });
    return { csrfToken: deriveCsrfToken(result.token) };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @SkipCsrfToken('sin sesión; respuesta idéntica exista o no la cuenta')
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<ForgotPasswordResponse> {
    const result = await this.auth.requestPasswordReset(body.email, meta(req));
    if (!result.ok) throw tooManyAttempts(res, result);
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @SkipCsrfToken('sin sesión; autorizado por el token de un solo uso del email')
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ): Promise<void> {
    const result = await this.auth.resetPassword(body.token, body.password, meta(req));
    if (!result.ok) {
      throw new BadRequestException({ statusCode: 400, code: 'INVALID_OR_EXPIRED_TOKEN' });
    }
    // Todas las sesiones del usuario quedaron revocadas: si este navegador tenía una, se borra.
    this.sessions.forget(req);
    clearSessionCookie(res, this.settings.cookieSecure);
  }

  private async requireSession(req: HttpRequest): Promise<CurrentSession> {
    const session = await this.sessions.current(req);
    if (!session) throw unauthenticated();
    return session;
  }
}

function meta(req: HttpRequest): RequestMeta {
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    correlationId: typeof req.id === 'string' ? req.id : null,
  };
}

function tooManyAttempts(res: ServerResponse, result: RateLimited): HttpException {
  res.setHeader('Retry-After', String(result.retryAfterSeconds));
  return new HttpException(
    { statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'TOO_MANY_ATTEMPTS' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
