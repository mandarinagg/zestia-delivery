# Integración con ZESTIA

> ⚠️ **Todo este documento es propuesta.** Ningún endpoint, estado o contrato de ZESTIA está confirmado. No implementar nada específico de ZESTIA hasta completar la auditoría (issue de R0).

## Arquitectura

```
ZESTIA  ⇄  Gateway de integración (módulo integrations)  ⇄  ZESTIA DELIVERY
```

- Sin bases de datos compartidas, ni credenciales internas, ni dependencias de tablas/procedimientos.
- El conector ZESTIA se construye **sobre la API genérica** (ver [`API_CONTRACTS.md`](API_CONTRACTS.md)) más un adaptador de mapeo de estados y datos.

## Flujo conceptual

1. Comprador genera pedido en tienda ZESTIA.
2. ZESTIA determina si corresponde delivery externo.
3. ZESTIA envía solicitud al gateway.
4. Gateway autentica, valida tenant, esquema e idempotencia.
5. Delivery registra el pedido y responde con identificador.
6. Operador asigna repartidor y actualiza estados.
7. Delivery emite eventos firmados (outbox).
8. ZESTIA valida firma y actualiza su estado.
9. ZESTIA actualiza la vista del comercio y, si corresponde, del comprador.

## Endpoints propuestos (no confirmados)

- `POST /api/v1/integrations/zestia/orders`
- `GET /api/v1/integrations/zestia/orders/{externalOrderId}`
- `POST /api/v1/integrations/zestia/orders/{externalOrderId}/cancel`
- `POST /api/v1/webhooks/zestia-delivery/order-events` (lado ZESTIA)
- `GET /api/v1/integrations/zestia/health`

## Conocido vs. pendiente

| Tema | Conocido | Pendiente de confirmar en ZESTIA |
|------|----------|----------------------------------|
| Transporte | HTTPS + HMAC (decisión propia) | ¿ZESTIA soporta firmar/verificar HMAC? |
| API de ZESTIA | — | ¿Existe? ¿Versionado? ¿Autenticación? |
| Estados | Estados propios definidos | Estados reales del pedido en ZESTIA y su mapeo |
| Datos | Mínimo necesario | Qué datos del comprador se pueden compartir |
| Tarifa | Calculada por Delivery | ¿ZESTIA cotiza antes del checkout? ¿Necesita endpoint de cotización? |
| Cancelaciones | Reglas propias por estado | Quién puede cancelar y hasta cuándo |
| Cobro contra entrega | Soportado | ¿Cómo se concilia con ZESTIA? |
| Eventos de retorno | Webhooks definidos | ¿ZESTIA puede recibir webhooks? |
| Multi-operador | — | ¿Una tienda puede tener varios operadores de delivery? |
| Desconexión | Reintentos + DLQ | Comportamiento esperado en ZESTIA ante caída |

## Checklist de auditoría (R0)

- [ ] Acceso a repositorio/documentación de ZESTIA.
- [ ] Inventario de endpoints y webhooks existentes.
- [ ] Ciclo de vida del pedido en ZESTIA.
- [ ] Modelo de tienda/comercio y su identificador externo.
- [ ] Requisitos de seguridad y entornos (sandbox).
- [ ] Responder cada fila "pendiente" de la tabla y registrar ADR.
