# Contratos de API

> Estado: **Borrador**. La fuente de verdad será `packages/contracts` (Zod → OpenAPI). Este documento resume convenciones y la API genérica de ingreso.

## Convenciones

- Base: `/api/v1`. Cambios incompatibles → `/api/v2`.
- JSON, `camelCase`, fechas ISO 8601 UTC, montos enteros en unidad mínima + `currency`.
- Paginación por cursor: `?limit=50&cursor=…` → `{ data, nextCursor }`.
- Errores (RFC 9457 *problem details*):

```json
{ "type": "/errors/invalid-transition", "title": "Invalid transition", "status": 409, "code": "INVALID_TRANSITION", "detail": "EN_CAMINO → ASIGNADO no permitido", "correlationId": "…" }
```

- Header `X-Correlation-Id` aceptado y devuelto siempre.
- Endpoints de tenant: `401` sin sesión; `403 NO_ACTIVE_MEMBERSHIP` / `TENANT_SELECTION_REQUIRED` si no hay tenant activo válido; `403 PERMISSION_DENIED` si el rol no tiene el permiso del endpoint (matriz en [`SECURITY.md`](SECURITY.md#roles-y-permisos-issue-16)).

## Autenticación (`/api/v1/auth`)

> Implementado (issue #14). Esquemas Zod en `packages/contracts/src/auth.ts`. Detalle de seguridad en [`SECURITY.md`](SECURITY.md#autenticación-y-sesiones-issue-14).

Sesión por cookie (`__Host-zd_session`; `zd_session` en desarrollo por http). Toda request que cambia estado (`POST/PUT/PATCH/DELETE`, en cualquier endpoint de la API) necesita:

- `Origin` (o `Referer`) dentro de `APP_ORIGINS` → si no, `403 CSRF_ORIGIN_REJECTED`;
- `Content-Type: application/json` si lleva cuerpo → si no, `415 UNSUPPORTED_MEDIA_TYPE`;
- `X-CSRF-Token: <csrfToken>` si lleva cookie de sesión (salvo `login`, `forgot-password`, `reset-password`) → si no, `403 CSRF_TOKEN_INVALID`.

**Tiempo restante de la sesión.** Toda respuesta autenticada por una sesión válida (cualquier endpoint, `2xx` o `4xx` que no sea `401`), ya con la renovación aplicada, lleva dos headers con **segundos enteros** restantes: `X-Session-Idle-Remaining` (por inactividad; nunca supera al otro) y `X-Session-Absolute-Remaining` (tiempo máximo de la sesión). Son segundos y no fechas para que el reloj del cliente no importe, y se **redondean hacia arriba** (mientras la sesión es válida son al menos 1): el cliente nunca cree que vence antes que el servidor. También salen en `login` y `change-password`, que crean o rotan la sesión. No aparecen en respuestas `401` ni en `logout`. Constantes en `@zestia/contracts` (`SESSION_IDLE_REMAINING_HEADER`, `SESSION_ABSOLUTE_REMAINING_HEADER`).

`GET /auth/session-status` consulta esos tiempos **sin renovar la sesión** (ver la tabla). El resto de los endpoints autenticados, `GET /auth/me` incluido, renuevan la inactividad como siempre.

Todas las respuestas llevan `Cache-Control: no-store`. Errores de este módulo: `{ "statusCode": 401, "code": "INVALID_CREDENTIALS" }` (códigos en `authErrorCodeSchema`); los de validación: `400 { code: "VALIDATION_FAILED", issues: [{ path, message }] }`, sin devolver los valores enviados.

| Método y ruta | Cuerpo | Respuesta OK | Errores |
|---|---|---|---|
| `POST /auth/login` | `{ email, password }` | `200` `AuthSession` + `Set-Cookie` (rota la sesión previa) | `401 INVALID_CREDENTIALS` (cualquier motivo), `429 TOO_MANY_ATTEMPTS` + `Retry-After` |
| `POST /auth/logout` | — | `204`, borra la cookie (idempotente) | — |
| `GET /auth/me` | — | `200` `AuthSession` | `401 UNAUTHENTICATED` |
| `GET /auth/session-status` | — | `204` sin cuerpo, con `X-Session-Idle-Remaining` y `X-Session-Absolute-Remaining`. **No renueva** la sesión (no toca `idle_expires_at` ni `last_seen_at`). Ruta de sesión, no de tenant: sin `@RequirePermission`, como el resto de `/auth/*`; solo habla de la sesión de la cookie | `401 UNAUTHENTICATED` |
| `POST /auth/switch-tenant` | `{ tenantId }` | `200` `AuthSession` con el nuevo `activeTenantId` | `401`, `403 NO_ACTIVE_MEMBERSHIP` (sin membresía, membresía inactiva o tenant no `ACTIVE`) |
| `POST /auth/change-password` | `{ currentPassword, newPassword }` | `200 { csrfToken }` + `Set-Cookie` nueva; revoca las demás sesiones | `400 INVALID_CURRENT_PASSWORD`, `401`, `429` |
| `POST /auth/forgot-password` | `{ email }` | `202 { message }` (siempre el mismo) | `429` |
| `POST /auth/reset-password` | `{ token, password }` | `204`; revoca todas las sesiones y borra la cookie | `400 INVALID_OR_EXPIRED_TOKEN` |

`AuthSession`:

```json
{
  "user": { "id": "…", "name": "Ana", "email": "ana@zestia.test" },
  "memberships": [
    { "tenantId": "…", "tenantName": "Delivery Demo Asunción", "tenantSlug": "demo-asuncion", "tenantStatus": "ACTIVE", "role": "OWNER" }
  ],
  "activeTenantId": null,
  "csrfToken": "…"
}
```

- `activeTenantId` es la preferencia guardada en la sesión (si el usuario tiene una sola membresía activa, el login la fija). Si deja de ser válida (membresía o tenant suspendidos), `me` devuelve `null` y los endpoints de tenant responden 403 hasta elegir otro.
- Contraseña nueva: 12 a 128 caracteres. Email: se normaliza (`trim` + minúsculas). Token de reset: base64url de 43 caracteres; llega en el fragmento del enlace `…/restablecer-contrasena#token=…`.

## Auditoría (`/api/v1/audit-logs`)

> Implementado (issue #17). Esquemas Zod en `packages/contracts/src/audit.ts`. Permiso `audit:read` (Propietario y Admin). Solo lectura.

| Método y ruta | Parámetros | Respuesta OK | Errores |
|---|---|---|---|
| `GET /audit-logs` | `action` (prefijo por segmentos: `merchants` incluye `merchants.updated`), `entityType`, `entityId`, `actorId`, `from` (inclusive) y `to` (exclusive) en ISO 8601 con zona, `cursor`, `limit` (1–100, por defecto 50) | `200 { data: AuditLogEntry[], nextCursor }`, más recientes primero | `400 VALIDATION_FAILED`, `401`, `403` |
| `GET /audit-logs/:id` | — | `200 AuditLogEntry` | `400` (id no UUID), `404` (inexistente o de otro tenant) |

`AuditLogEntry`:

```json
{
  "id": "…",
  "occurredAt": "2026-11-18T15:00:00.000Z",
  "action": "merchants.updated",
  "actor": { "type": "USER", "id": "…", "name": "Ana" },
  "entity": { "type": "merchant", "id": "…" },
  "changes": { "name": { "from": "La Esquina", "to": "La Esquina Centro" }, "phone": { "redacted": true } },
  "metadata": {},
  "correlationId": "…"
}
```

## Comercios y sucursales (`/api/v1/merchants`)

> Implementado (issue #19). Esquemas Zod en `packages/contracts/src/merchants.ts`. Lectura: `merchants:read` (Propietario, Admin, Operador, Supervisor); cambios: `merchants:manage` (Propietario y Admin). Todo cambio queda en la auditoría, en la misma transacción.

| Método y ruta | Cuerpo / parámetros | Respuesta OK | Errores |
|---|---|---|---|
| `GET /merchants` | `status?` (sin él: activos y suspendidos), `q?` (nombre contiene, o RUC empieza con), `cursor?`, `limit` (1–100, por defecto 50) | `200 { data: MerchantSummary[], nextCursor }`, por nombre | `400 VALIDATION_FAILED` / `INVALID_CURSOR` |
| `POST /merchants` | `{ name, ruc?, phone? }` | `201 MerchantSummary` | `400`, `409 DUPLICATE_NAME` |
| `GET /merchants/:id` | — | `200 MerchantDetail` (incluye archivados y sus sucursales vigentes) | `400` (no UUID), `404` |
| `PATCH /merchants/:id` | parcial de `{ name, ruc, phone }`; `null` borra un opcional | `200 MerchantSummary` | `400`, `404`, `409 DUPLICATE_NAME` / `MERCHANT_ARCHIVED` |
| `POST /merchants/:id/suspend` | — | `200` (`ACTIVE` → `SUSPENDED`) | `404`, `409 INVALID_STATUS_TRANSITION` |
| `POST /merchants/:id/reactivate` | — | `200` (`SUSPENDED` → `ACTIVE`) | `404`, `409 INVALID_STATUS_TRANSITION` |
| `POST /merchants/:id/archive` | — | `200` (→ `ARCHIVED`, final; fija `deletedAt`) | `404`, `409 INVALID_STATUS_TRANSITION` |
| `POST /merchants/:id/branches` | `{ name, address, neighborhood, city, references?, phone?, openingHours? }` | `201 Branch` | `400`, `404`, `409 DUPLICATE_NAME` / `MERCHANT_ARCHIVED` |
| `PATCH /merchants/:id/branches/:branchId` | parcial del alta | `200 Branch` | `400`, `404`, `409` |
| `POST /merchants/:id/branches/:branchId/archive` | — | `204` | `404`, `409 MERCHANT_ARCHIVED` |

- Inexistente, de otro tenant o (para sucursales) de otro comercio: siempre `404`.
- Teléfonos: se aceptan en formato local de Paraguay (`0981 123 456`) o internacional y se guardan en E.164 (`+595981123456`). RUC: formato `80012345-6` (sin validar el dígito verificador).
- Nombre único sin distinguir mayúsculas entre los comercios vigentes del tenant, y entre las sucursales vigentes de un comercio. Uno archivado libera el nombre.
- `openingHours`: `{ mon?: [{ from: "08:00", to: "12:00" }, …], … }`, hasta 3 franjas por día, ordenadas y sin superponerse, en la hora local del tenant. Un día ausente = cerrado.
- Auditoría: acciones `merchants.created`, `.updated`, `.suspended`, `.reactivated`, `.archived`, `.branch_created`, `.branch_updated`, `.branch_archived`. RUC, teléfonos, dirección y referencias se registran como `{ redacted: true }`.

`MerchantSummary`:

```json
{ "id": "…", "name": "La Esquina", "ruc": "80012345-6", "phone": "+595981123456", "status": "ACTIVE", "branchCount": 2, "createdAt": "…", "updatedAt": "…" }
```

`MerchantDetail` = `MerchantSummary` + `branches: Branch[]`. `Branch`: `id, merchantId, name, address, neighborhood, city, references, phone, openingHours, createdAt, updatedAt`.

## Usuarios e invitaciones (`/api/v1/members`, `/api/v1/invitations`)

> Implementado (issue #18). Esquemas Zod en `packages/contracts/src/members.ts`. Lectura: `users:read` (Propietario y Admin); cambios: `users:manage`. Todo lo que toque el rol Propietario (dar, quitar, deshabilitar, invitar) exige además `users:manage-owners` (solo Propietario). Todo cambio queda en la auditoría.

| Método y ruta | Cuerpo / parámetros | Respuesta OK | Errores |
|---|---|---|---|
| `GET /members` | `status?` (`ACTIVE`/`DISABLED`), `q?` (nombre o email contiene), `cursor?`, `limit` (1–100, 50) | `200 { data: Member[], nextCursor }`, por nombre | `400 VALIDATION_FAILED` / `INVALID_CURSOR` |
| `GET /members/:id` | — | `200 Member` | `400`, `404` |
| `PATCH /members/:id` | `{ role }` (`OWNER`, `ADMIN`, `OPERATOR`, `SUPERVISOR`) | `200 Member` (mismo rol: sin cambios ni auditoría) | `400`, `403 PERMISSION_DENIED`, `404`, `409 SELF_MODIFICATION` / `LAST_OWNER` |
| `POST /members/:id/disable` · `/enable` | — | `200 Member` | `403`, `404`, `409 SELF_MODIFICATION` / `LAST_OWNER` / `INVALID_STATUS_TRANSITION` |
| `GET /invitations` | — | `200 { data: Invitation[] }` (abiertas: pendientes y vencidas, hasta 200, más nuevas primero) | — |
| `POST /invitations` | `{ email, role }` | `201 Invitation` y email al invitado | `400`, `403`, `409 ALREADY_MEMBER` / `INVITATION_PENDING`, `502 MAIL_DELIVERY_FAILED` (no se guarda nada) |
| `POST /invitations/:id/resend` | — | `200 Invitation` (token y vencimiento nuevos; el enlace anterior deja de servir) | `403`, `404`, `409 INVITATION_CLOSED`, `502` |
| `POST /invitations/:id/revoke` | — | `204` | `403`, `404`, `409 INVITATION_CLOSED` |

Aceptación, **sin sesión en la empresa** (el token del enlace es la autorización; exentas de CSRF, `Cache-Control: no-store`):

| Método y ruta | Cuerpo | Respuesta OK | Errores |
|---|---|---|---|
| `POST /auth/invitations/preview` | `{ token }` | `200 { tenantName, email, role, accountExists, expiresAt }` | `400 INVITATION_INVALID` (vencida, usada, revocada, empresa no activa o cuenta deshabilitada) |
| `POST /auth/invitations/accept` | `{ token, name?, password? }` (nombre y contraseña solo si no hay cuenta) | `200 { accountCreated, email }`. **No inicia sesión** | `400 INVITATION_INVALID` / `ACCOUNT_DETAILS_REQUIRED`, `409 ALREADY_MEMBER` |

- `Member`: `{ id (membresía), userId, name, email, role, status, accountStatus, createdAt }`. `status` es el de **esta empresa**; `accountStatus`, el de la cuenta global (la gestiona la plataforma).
- `Invitation`: `{ id, email, role, status (PENDING/EXPIRED), invitedBy { id, name } | null, expiresAt, createdAt }`. Nunca incluye el token ni el enlace: solo los recibe el invitado por email.
- Vencimiento: `INVITATION_TTL_HOURS` (168 = 7 días). Invitar de nuevo a un email con una invitación vencida la reemplaza.
- Nadie se cambia el rol ni se deshabilita a sí mismo, y la empresa nunca queda sin un Propietario activo.
- Repartidor y Comercio no se pueden asignar todavía: llegan con sus apps (R2).
- Auditoría: `users.role_changed`, `.disabled`, `.enabled`, `.invited`, `.invitation_resent`, `.invitation_revoked`, `.invitation_accepted`. El email del invitado se registra como `{ redacted: true }`.

## API genérica de ingreso (R2)

Autenticación: `Authorization: Bearer zd_live_<prefix>_<secret>` (API key por integración/tenant).

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/orders` | Crear pedido. **Requiere** `Idempotency-Key`. |
| `GET` | `/api/v1/orders/{id}` | Consultar por id interno |
| `GET` | `/api/v1/orders/by-external/{externalId}` | Consultar por id externo |
| `POST` | `/api/v1/orders/{id}/cancel` | Cancelar (si el estado lo permite) |
| `GET` | `/api/v1/integrations/health` | Estado de la integración |

### Idempotencia

- Misma key + mismo cuerpo → misma respuesta (status y body) durante 24 h.
- Misma key + cuerpo distinto → `422 IDEMPOTENCY_KEY_REUSED`.
- Solicitud en curso con la misma key → `409 REQUEST_IN_PROGRESS`.
- Además, `(source, externalId)` es único por tenant.

### Ejemplo `POST /api/v1/orders`

```json
{
  "externalId": "SHOP-98765",
  "merchantBranchId": "0192…",
  "recipient": { "name": "María", "phone": "+595981000000" },
  "address": { "line": "Calle 1 c/ Calle 2", "neighborhood": "Villa Morra", "city": "Asunción", "references": "Portón negro", "locationUrl": null },
  "package": { "description": "1 caja mediana" },
  "payment": { "method": "EFECTIVO", "amountToCollect": 150000, "currency": "PYG", "feePaidBy": "RECIPIENT" },
  "notes": null
}
```

Respuesta `201`: `{ "id", "code", "status": "PENDIENTE_ASIGNACION", "deliveryFee", "trackingUrl" }`.

## Webhooks salientes

`POST {webhookUrl}` con headers:

- `X-ZD-Event-Id`, `X-ZD-Timestamp` (epoch s), `X-ZD-Signature: v1=<hex(HMAC_SHA256(secret, timestamp + "." + body))>`

Cuerpo (envelope):

```json
{ "eventId": "…", "eventType": "order.status_changed", "schemaVersion": "1", "tenantExternalId": "…", "orderId": "…", "orderExternalId": "…", "occurredAt": "…", "correlationId": "…", "payload": { "from": "RETIRADO", "to": "EN_CAMINO" } }
```

Eventos: `order.created`, `order.status_changed`, `order.cancelled`, `order.incident_opened`, `order.incident_resolved`.
El receptor debe responder `2xx` en < 10 s; si no, reintento con backoff. El receptor debe deduplicar por `eventId`.
