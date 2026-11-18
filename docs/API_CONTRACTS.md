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

Todas las respuestas llevan `Cache-Control: no-store`. Errores de este módulo: `{ "statusCode": 401, "code": "INVALID_CREDENTIALS" }` (códigos en `authErrorCodeSchema`); los de validación: `400 { code: "VALIDATION_FAILED", issues: [{ path, message }] }`, sin devolver los valores enviados.

| Método y ruta | Cuerpo | Respuesta OK | Errores |
|---|---|---|---|
| `POST /auth/login` | `{ email, password }` | `200` `AuthSession` + `Set-Cookie` (rota la sesión previa) | `401 INVALID_CREDENTIALS` (cualquier motivo), `429 TOO_MANY_ATTEMPTS` + `Retry-After` |
| `POST /auth/logout` | — | `204`, borra la cookie (idempotente) | — |
| `GET /auth/me` | — | `200` `AuthSession` | `401 UNAUTHENTICATED` |
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
