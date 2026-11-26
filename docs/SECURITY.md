# Seguridad y privacidad

Referencia: **OWASP ASVS nivel 2** y OWASP Top 10. Para reportar vulnerabilidades del repositorio ver [`/SECURITY.md`](../SECURITY.md).

## Modelo de amenazas (principales)

| Amenaza | Control |
|---------|---------|
| Acceso cruzado entre tenants (IDOR) | Tenant resuelto en servidor + RLS + tests de aislamiento por endpoint |
| Escalada de privilegios | `@RequirePermission()` obligatorio en cada endpoint de tenant (falla cerrado); matriz rol→permiso en `packages/auth`, testeada (ver [Roles y permisos](#roles-y-permisos-issue-16)) |
| Repartidor accede a pedidos ajenos | Filtro por `Assignment` activo + test |
| Robo/abuso de API key | Hash en DB, prefijo visible, rotación, revocación, rate limit, `lastUsedAt` |
| Webhook falsificado / replay | HMAC-SHA256 + timestamp ± 5 min + `eventId` deduplicado |
| Pedidos duplicados | `Idempotency-Key` + único `(tenant, source, externalId)` |
| Enumeración de tracking links | Token ≥ 128 bits aleatorio, guardado hasheado, vencimiento, rate limit |
| Fuga de PII en logs | Redacción automática (pino redact), revisión en PR |
| Credenciales filtradas en repo | `.gitignore`, secret scanning de GitHub, gitleaks en CI |
| XSS / CSRF | React escapado por defecto, CSP estricta, cookie `__Host-` `HttpOnly; Secure; SameSite=Strict`, verificación de `Origin` + token CSRF en mutaciones con cookie (ver abajo) |
| Fuerza bruta en login | Rate limit por cuenta e IP en Postgres (multi-instancia), mensajes genéricos; 2FA TOTP (pendiente) |
| Robo / fijación de sesión | Token opaco de 256 bits, solo su SHA-256 en la DB, rotación en login y cambio de contraseña, vencimiento por inactividad y absoluto |
| Enumeración de usuarios | Misma respuesta y tiempo parejo (Argon2 señuelo) en login y en "olvidé mi contraseña" |
| Soporte de plataforma abusivo | Acceso temporal con motivo, vencimiento, solo lectura en MVP, auditado y visible al tenant |

## Autenticación y sesiones (issue #14)

Implementación en `apps/api/src/modules/auth` y migración `*_auth_sessions`. Solo backend; la UI es #20.

### Contraseñas

- **Argon2id** de `node:crypto` (Node ≥ 24.7), formato PHC, parámetros mínimos de OWASP: m = 19 MiB, t = 2, p = 1; salt de 16 bytes; hash de 32 bytes. La contraseña se normaliza a NFKC. Si se suben los parámetros, el próximo login re-hashea.
- Política para contraseñas nuevas: 12 a 128 caracteres, sin reglas de composición (NIST 800-63B). El login acepta hasta 256 para no filtrar la política.
- Cuenta `DISABLED`, sin contraseña o email desconocido: **misma respuesta** (`401 INVALID_CREDENTIALS`) y se verifica igual un hash señuelo para que el tiempo no delate si la cuenta existe.

### Sesiones de servidor

- Token opaco de 32 bytes aleatorios (base64url) en la cookie; en `sessions` se guarda solo `sha256(token)`. Una copia de la DB no permite usar sesiones.
- Vencimiento por inactividad (`SESSION_IDLE_TIMEOUT_MINUTES`, 30) y absoluto (`SESSION_ABSOLUTE_TIMEOUT_HOURS`, 12). La actividad renueva la inactividad (como mucho una vez por minuto, sin pasar el absoluto).
- **Tiempo restante (aviso en el panel):** toda respuesta de una sesión válida (después de renovar) lleva `X-Session-Idle-Remaining` y `X-Session-Absolute-Remaining`, en **segundos enteros** restantes redondeados **hacia arriba** (no timestamps: el reloj del cliente no importa). El de inactividad nunca supera al absoluto. Salen del reloj de la DB en la misma consulta que valida la sesión (`auth_session_lookup`), sin pedidos extra; los pone el `SessionService` cuando lo llaman los guards (también salen en un `403` de una sesión válida) y el login y el cambio de contraseña, que crean o rotan la sesión. **Nunca** en un `401` ni en el logout. Un tercero que ve la respuesta aprende cuánto le queda a *su propia* sesión, nada más. El aviso es una ayuda para la persona: el que decide si la sesión vive es el servidor.
- **Consultar sin renovar:** `auth_session_lookup(token, p_renew)`; con `p_renew = false` valida y devuelve los restantes sin tocar `idle_expires_at` ni `last_seen_at`. Lo usa `GET /auth/session-status` (`@NoSessionRenewal`, solo `SessionAuthGuard`): el panel pregunta ahí al llegar a cero. Si preguntara por `/auth/me`, que renueva, el chequeo mismo alargaría la sesión y un panel abandonado viviría hasta el absoluto. La única forma del aviso de renovar es "Seguir conectado" (`/auth/me`), a pedido de la persona. La consulta sin renovar no abre nada nuevo: solo acepta el token de una sesión vigente y devuelve dos números de esa sesión.
- **Rotación:** cada login crea una sesión nueva y revoca la de la cookie previa (anti *session fixation*). El cambio de contraseña rota el token y revoca **todas las demás** sesiones del usuario; el reset por email revoca **todas**. El logout revoca la sesión actual.
- Cookie: `__Host-zd_session` con `Secure; HttpOnly; SameSite=Strict; Path=/` (sin `Domain`). En desarrollo por http (`SESSION_COOKIE_SECURE=false`, solo permitido fuera de producción) se llama `zd_session` y va sin `Secure`, porque el prefijo `__Host-` lo exige. Si llegan dos cookies de sesión, la request se trata como sin sesión.
- `activeTenantId` vive en la sesión y es una **preferencia**: el `TenantGuard` la re-valida en cada request (membresía activa, tenant `ACTIVE`). `POST /auth/switch-tenant` solo la cambia si la membresía es válida en ese momento.

### CSRF (decisión)

Defensa en capas, sin cookie de CSRF:

1. **`SameSite=Strict`** en la cookie de sesión: el navegador no la envía en requests iniciadas desde otro sitio.
2. **Verificación de origen** (`CsrfGuard`, global, en `POST/PUT/PATCH/DELETE`): si hay `Origin`, debe estar en `APP_ORIGINS` (`Origin: null` se rechaza); si no hay `Origin`, se usa `Referer`; si no hay ninguno, se rechaza `Sec-Fetch-Site: cross-site`. Clientes no navegador (curl) sin esos headers pasan este paso pero igual necesitan el token si mandan cookie.
3. **Token sincronizado** en el header `X-CSRF-Token` en toda mutación que lleve cookie de sesión: `HMAC-SHA256(token de sesión, "zestia-csrf-v1")`. Está atado a la sesión (cambia al rotarla), no se guarda y se compara en tiempo constante. Lo devuelven `login`, `me`, `switch-tenant` y `change-password`. Exentos con `@SkipCsrfToken(motivo)` (siguen pasando la verificación de origen): `login`, `forgot-password` y `reset-password`, que no actúan sobre una sesión existente.
4. Los cuerpos deben ser `application/json` (`415` si no): un formulario HTML de otro sitio no puede mandar JSON sin preflight CORS.

No hay CORS habilitado: el frontend se sirve desde el mismo origen que la API. En desarrollo, Vite reenvía `/api` (`apps/web/vite.config.ts`); en producción lo hará el proxy inverso. La web nunca lee la cookie: guarda el `csrfToken` solo en memoria y lo manda en `X-CSRF-Token`. Después de ingresar, solo redirige a rutas internas (`safeRedirect`, contra redirecciones abiertas).

### Rate limiting (login, reset y cambio de contraseña)

- Tabla `auth_attempts` en Postgres: el límite es **compartido entre instancias** de la API. Ventana deslizante, por **cuenta** (fallos desde el último éxito) y por **IP**. Login: 5 por cuenta / 50 por IP en 15 min. Reset: 3 / 20 en 60 min. Cambio de contraseña: mismo límite que el login, por usuario.
- Claves: `sha256` del email normalizado (o del `userId`) y de la IP; no se guarda el email ni la IP en claro. Lock consultivo por cuenta para que intentos concurrentes no superen el cupo. Los intentos bloqueados no se registran (no alargan el bloqueo); filas de más de 2 días se purgan solas.
- Bloqueado → `429 TOO_MANY_ATTEMPTS` con `Retry-After`, incluso si la contraseña es correcta. La función de la DB acota los parámetros (máx. 100 por cuenta, 10 000 por IP, ventana ≤ 24 h), así que la API tampoco puede "desactivarlo".
- La IP sale de `req.ip`; detrás de un proxy hay que fijar `TRUST_PROXY_HOPS` al número exacto de proxies confiables (si no, se puede falsear con `X-Forwarded-For`).

### Reset de contraseña por email

- `POST /auth/forgot-password` responde siempre `202` con el mismo mensaje. Solo si la cuenta existe y está activa se emite un token (32 bytes, guardado como `sha256`), de **un solo uso**, que vence en `PASSWORD_RESET_TTL_MINUTES` (30) e invalida los anteriores. El email se envía sin esperar al SMTP, para que la latencia no delate la existencia de la cuenta.
- Enlace: `${WEB_BASE_URL}/restablecer-contrasena#token=…`: el token va en el **fragmento**, que el navegador no envía al servidor ni en `Referer`.
- `POST /auth/reset-password` cambia la contraseña, consume el token y revoca todas las sesiones. Token inválido, usado o vencido: `400 INVALID_OR_EXPIRED_TOKEN`.

### Invitaciones (#18)

- Mismo esquema que el reset: token de 32 bytes, se guarda solo el `sha256`, viaja en el fragmento (`${WEB_BASE_URL}/invitacion#token=…`) y la web lo saca de la barra apenas lo lee. Vence en `INVITATION_TTL_HOURS` (7 días); reenviar genera un token nuevo e invalida el anterior.
- Quien invita **nunca ve el token ni el enlace**: no puede aceptar en nombre de otra persona.
- Una sola invitación abierta por email y empresa (índice único parcial).
- El email se manda dentro de la transacción: si el SMTP falla, la invitación no se guarda (`502`) y el log no lleva el destinatario.
- Aceptar no inicia sesión: si la cuenta ya existía, la persona entra con su contraseña de siempre (el token no reemplaza a la contraseña); si no, se crea con nombre y contraseña.
- `auth_invitation_peek` y `auth_invitation_accept` (`SECURITY DEFINER`) son el único camino para leer una invitación sin tenant y para crear usuarios. `accept` exige correr dentro de la transacción del tenant de la invitación (`app.tenant_id`) y nunca une una invitación a una cuenta de otro email.
- Deshabilitar es por membresía: la persona deja de poder usar esa empresa desde su próxima request; la cuenta y sus otras empresas siguen igual.

### Funciones `SECURITY DEFINER`

`users` tiene RLS forzada y las tablas de credenciales no tienen grants para `zestia_app`, así que todo el acceso pre-sesión pasa por funciones `auth_*` (migración `*_auth_sessions`):

- Dueño `zestia_migrator` (sin `BYPASSRLS`); las tablas tienen RLS forzada con políticas solo para el migrador, que solo aplican **dentro** de estas funciones (la API no puede hacer `SET ROLE`).
- `SET search_path = pg_catalog, public, pg_temp` fijo; `REVOKE ALL … FROM PUBLIC` y `GRANT EXECUTE` solo a `zestia_app`; privilegios por defecto del migrador sin `EXECUTE` para `PUBLIC`.
- Devuelven lo mínimo y exigen una llave que la API no puede inventar: `auth_login_lookup` (único camino para leer un hash por email) necesita un intento `LOGIN` recién registrado por `auth_attempt_register` **para ese mismo email**, vale una sola vez y por 2 minutos, así que la cantidad de hashes legibles está acotada por el rate limit; las de sesión necesitan `sha256` de un token de sesión vigente; las de reset, el `sha256` de un token de reset vigente.
- Tests de abuso (`auth-definer.int.test.ts`) llaman las funciones directamente como `zestia_app`.

### Auditoría (`audit_logs`)

- Tabla append-only y mínima: `tenant_id` (nulo para eventos sin tenant, como el login), `actor_type`/`actor_id`, `action` (`auth.login.succeeded`, …), `entity_type`/`entity_id`, `metadata` (JSON plano), `correlation_id`, `occurred_at`.
- `zestia_app` solo tiene `INSERT` y `SELECT`; RLS: inserta en el tenant activo o sin tenant, y lee solo filas del tenant activo (las de `tenant_id NULL` no las ve). Un trigger rechaza `UPDATE`/`DELETE`/`TRUNCATE` incluso al dueño o a un superusuario.
- **Sin PII:** `AuditService.record()` rechaza claves de metadata sospechosas (`password`, `token`, `email`, `phone`, …), valores con `@`, objetos anidados y valores largos. Eventos de auth: login ok/fallido (con motivo), logout, cambio de tenant ok/denegado, cambio de contraseña ok/fallido, reset pedido/fallido/completado.
- **Cambios de datos (#17):** cada acción crítica de negocio llama a `AuditService.recordChange({ action, entity, changes })` en la **misma transacción** que el cambio: si el cambio hace ROLLBACK, el evento también. El actor (usuario de la sesión) y el `correlationId` salen del contexto de tenant, no del llamador.
- `changes` se arma con `auditDiff(antes, después, { fields, redacted })`:
  - Solo entran los campos de la lista `fields` (allowlist) y solo si cambiaron.
  - Los campos de `redacted` (teléfono, dirección, RUC, …) se guardan como `{ redacted: true }`: queda registrado **que** cambiaron, pero no el valor.
  - `assertSafeAuditEvent` rechaza un campo de nombre sensible (`phone`, `email`, `address`, …) con valor en claro, valores con `@`, objetos anidados y textos de más de 500 caracteres.
- **Consulta (#17):** `GET /api/v1/audit-logs` y `GET /api/v1/audit-logs/:id`, con permiso `audit:read` (Propietario y Admin). Solo muestran el tenant activo; los eventos sin tenant (login, reset) no se ven. El nombre del actor aparece solo si es o fue miembro del tenant.
- **No se guarda la IP** (minimización). **Retención:** sin purga automática por ahora; el trigger append-only impide borrar. La política de retención depende de la consulta legal (#11).

### Logs

La redacción de pino oculta `Authorization`, `Cookie`, `Set-Cookie`, `X-CSRF-Token`, contraseñas (`password`, `currentPassword`, `newPassword`), tokens (`token`, `sessionToken`, `csrfToken`), `email` y destinatarios de correo (`to`). Los errores de validación nunca devuelven el valor recibido.

## Roles y permisos (issue #16)

Roles **fijos** (SPEC §3) con una matriz rol → permiso en código: `packages/auth/src/index.ts` es la única fuente de verdad. Los roles salen de `membershipRoleSchema` (`packages/contracts`), y un test exige que coincidan con el enum `membership_role` de la DB.

| Permiso | Propietario | Admin | Operador | Supervisor | Repartidor | Comercio |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `merchants:read` — ver comercios y sucursales | ✔ | ✔ | ✔ | ✔ | | |
| `merchants:manage` — crear, editar y dar de baja | ✔ | ✔ | | | | |
| `users:read` — ver usuarios y roles | ✔ | ✔ | | | | |
| `users:manage` — invitar, cambiar rol, deshabilitar | ✔ | ✔ | | | | |
| `users:manage-owners` — dar o quitar el rol Propietario | ✔ | | | | | |
| `audit:read` — consultar la auditoría | ✔ | ✔ | | | | |

- Solo están los permisos de R1. Cada módulo nuevo agrega los suyos, con su fila en la matriz y en el test de `packages/auth`.
- Repartidor y Comercio todavía no tienen permisos. Llegan en R2, junto con su alcance por `courierId` / `merchantId`.
- Supervisor = Operador por ahora; en R2 suma resolver incidencias.

### Cómo se aplica en la API

```ts
@Controller('api/v1/merchants')
@TenantScoped()
export class MerchantsController {
  @Get(':id')
  @RequirePermission('merchants:read')
  findOne() { … }
}
```

- `TenantGuard` resuelve la membresía en el servidor y después verifica el permiso con `canAll(rol, permisos)`. Si se declaran varios permisos, hacen falta todos. El rol nunca se toma del cliente.
- Sin permiso → `403 { statusCode: 403, code: "PERMISSION_DENIED" }`, sin datos del recurso.
- **Falla cerrado:** una ruta `@TenantScoped()` sin `@RequirePermission()` responde 500 incluso al Propietario. Además, `app-routes.test.ts` exige el permiso en cada ruta de tenant y mantiene un inventario ruta → permiso que hay que actualizar a mano (queda visible en el PR).
- `@RequirePermission()` rechaza permisos desconocidos al arrancar la app.
- El frontend puede usar `can()` de `@zestia/auth` para mostrar u ocultar acciones. Es solo comodidad: la autorización la decide el servidor.

## Datos personales

- **Minimización:** del destinatario solo nombre, teléfono, dirección y referencias.
- El repartidor ve datos del destinatario **solo** mientras el pedido está asignado y activo.
- Retención configurable: anonimizar destinatario tras N meses (por defecto 12) [VALIDAR legal].
- Tracking público sin teléfono ni dirección completa.
- Exportaciones CSV auditadas.

## Operación

- Secretos en el gestor del proveedor (nunca en repo ni frontend); `.env.example` sin valores reales.
- TLS en todo; HSTS.
- Dependencias: Dependabot + `pnpm audit` en CI.
- Backups diarios cifrados, prueba de restauración mensual documentada.
- Auditoría append-only; acceso a auditoría solo Propietario/Admin.
