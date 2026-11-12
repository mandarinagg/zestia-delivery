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
