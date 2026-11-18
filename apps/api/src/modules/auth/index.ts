// API pública del módulo auth. Otros módulos importan SOLO desde aquí.
export { AuthModule } from './auth.module';
export { AUTH_AUDIT } from './auth.service';
export { SkipCsrfToken } from './csrf.guard';
export {
  SESSION_COOKIE_DEV_NAME,
  SESSION_COOKIE_SECURE_NAME,
  sessionCookieName,
} from './session-cookie';
