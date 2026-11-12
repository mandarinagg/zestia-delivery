# ZESTIA DELIVERY — Especificación maestra v2

> **Versión:** 2.0 (2026-11-12) · **Reemplaza a:** [v1](archive/01_ZESTIA_DELIVERY_v1.md) · **Cambios:** ver [§15 Changelog](#15-changelog-v1--v2) y el [análisis PM](00_ANALISIS_PM.md).
> Los ítems marcados **[VALIDAR]** son hipótesis que se confirman en Discovery (R0).

**Producto:** Plataforma web SaaS multiempresa para gestionar empresas de delivery, independiente y conectable con ZESTIA.
**Mercado inicial:** Paraguay (Gran Asunción).
**Enfoque:** operación en tiempo real, efectivo y WhatsApp como realidad local, API desacoplada.

---

## 1. Visión y problema

Las empresas de delivery tercerizado en Paraguay operan mayoritariamente con **WhatsApp + planillas**. Eso causa pérdida de trazabilidad, errores en la rendición de efectivo, despachadores saturados y nula visibilidad para los comercios.

ZESTIA DELIVERY es el **centro de control operativo** de la empresa de delivery: comercios, pedidos, despacho, repartidores, zonas, tarifas, seguimiento, incidencias, efectivo, liquidaciones e indicadores.

Dos modalidades:
- **Independiente:** la empresa opera sin ZESTIA (pedidos manuales, portal de comercio o API genérica).
- **Integrada:** una tienda ZESTIA envía pedidos y recibe actualizaciones mediante API segura.

### 1.1 Objetivos medibles

| Objetivo | Métrica | Meta piloto [VALIDAR] |
|----------|---------|-----------------------|
| Trazabilidad total | % pedidos del tenant registrados en el sistema | ≥ 90% |
| Despacho ágil | Tiempo a asignación p50 | < 5 min |
| Efectivo sin errores | Diferencia de rendición diaria | 0 Gs. |
| Calidad de entrega | Tasa de entrega exitosa | ≥ 95% |

**North Star:** entregas completadas por semana en tenants activos.

### 1.2 No-objetivos

- No es un marketplace ni app para consumidores finales.
- No procesa pagos, ni almacena tarjetas, ni emite facturas electrónicas.
- No optimiza rutas en el MVP.
- No reemplaza a ZESTIA ni accede a su base de datos.

## 2. Principios (no negociables)

- Multi-tenancy con aislamiento estricto de datos (aplicación + RLS en base de datos).
- RBAC y permisos validados en backend. Nunca confiar en `tenantId` ni rol enviados por el cliente.
- API versionada (`/api/v1`) y webhooks autenticados.
- Idempotencia en toda creación vía API (`Idempotency-Key`).
- Auditoría de acciones críticas.
- Estados de pedido controlados por máquina de estados en backend.
- Responsive (escritorio, tablet, móvil); PWA para repartidores.
- No conectar bases de datos de ZESTIA y Delivery. No inventar contratos de ZESTIA.
- Monolito modular; sin microservicios sin justificación escrita (ADR).
- Sin secretos en frontend, logs ni repositorio.
- **Nunca simular datos** (ubicación, métricas, estimaciones presentadas como reales).

## 3. Usuarios y roles

| Rol | Responsabilidad | MVP |
|-----|-----------------|-----|
| Propietario | Configuración y control total de su empresa | ✅ |
| Administrador | Gestión operativa y usuarios | ✅ |
| Operador / Despachador | Recepción, asignación y seguimiento | ✅ |
| Supervisor | Control de operación e incidencias | ✅ (mismos permisos que Operador + resolver incidencias) |
| Repartidor | Ver y actualizar sus entregas; rendir efectivo | ✅ |
| Comercio asociado | Crear y consultar sus pedidos | ✅ (portal mínimo) |
| Finanzas | Liquidaciones e informes | R5 |
| Soporte de plataforma | Acceso temporal, justificado, con vencimiento y auditado | R1 (solo lectura) |

**MVP:** roles **fijos** con matriz de permisos en código (`packages/auth`). Editor de roles personalizados: R6.
Un usuario puede pertenecer a varios tenants; el tenant activo se resuelve en servidor desde la sesión/membresía.

## 4. Módulos

### 4.1 Dashboard operativo (MVP)
Pedidos por estado, repartidores disponibles/ocupados/desconectados, pedidos demorados (SLA configurable por tenant), indicadores del día, actividad reciente. Filtros: comercio, sucursal, zona, repartidor, fecha. Actualización en vivo por SSE.

### 4.2 Comercios y sucursales (MVP)
Alta, edición, suspensión y archivo (borrado lógico). Datos comerciales, RUC opcional, contactos operativos (teléfono WhatsApp). Sucursales con dirección, referencias, horarios. Zonas atendidas y tarifas acordadas (override de tarifa por comercio). Configuración de integración (API keys) — R2. Historial de pedidos e incidencias.

### 4.3 Pedidos (MVP)
**Datos:** id interno, id externo + origen (`MANUAL`, `PORTAL_COMERCIO`, `API`, `ZESTIA`), comercio, sucursal de retiro, destinatario (nombre, teléfono — mínimo necesario), dirección, **barrio, ciudad, referencias**, coordenadas solo si fueron provistas/autorizadas, link de ubicación opcional, descripción del paquete, importe a cobrar, método de cobro (`EFECTIVO`, `TRANSFERENCIA`, `QR`, `PREPAGO`), tarifa de envío (calculada + override auditado), quién paga el envío (comercio/destinatario), ventana horaria opcional, observaciones, timestamps por etapa, historial.

**Ingreso:** manual (operador), portal de comercio, API genérica. Importación CSV: R5.

**Máquina de estados:** ver [`ORDER_STATE_MACHINE.md`](ORDER_STATE_MACHINE.md).
`RECIBIDO → PENDIENTE_ASIGNACION → ASIGNADO → ACEPTADO → EN_RETIRO → RETIRADO → EN_CAMINO → ENTREGADO | NO_ENTREGADO`, más `CANCELADO`, `EN_DEVOLUCION`, `DEVUELTO`. El paso `ACEPTADO` es configurable por tenant (auto-aceptación). [VALIDAR estados con usuarios]

**Cambio clave v2:** `EN_REVISION` se elimina como estado. Las **incidencias son ortogonales**: un pedido en cualquier estado puede tener incidencias abiertas (flag `hasOpenIncident`).

**Estado de cobro** (independiente del estado de entrega): `NO_APLICA`, `PENDIENTE`, `COBRADO`, `RENDIDO`, `LIQUIDADO`.

**Evidencia de entrega (opcional por tenant):** foto, nombre de quien recibe, código de 4 dígitos enviado al destinatario [VALIDAR].

### 4.4 Despacho (MVP)
Cola de pendientes; tablero kanban por estado; asignación y reasignación manual (motivo obligatorio al reasignar tras `ACEPTADO`); carga actual por repartidor; aceptación/rechazo por el repartidor; alertas por demora (SLA por etapa). Asignación múltiple (varios pedidos a un repartidor en un paso). Sugerencias automáticas: R6.

### 4.5 Repartidores (MVP)
Alta, suspensión, contacto, vehículo (moto/auto/bici/a pie) y capacidad, zonas y horarios, disponibilidad (`DISPONIBLE`, `OCUPADO`, `FUERA_DE_TURNO`), pedidos actuales e historial, métricas básicas.

**PWA repartidor:** lista de entregas propias, detalle con datos mínimos del destinatario, botones de cambio de estado, llamar / WhatsApp al destinatario, abrir ubicación en app de mapas, registrar incidencia, **cola offline** de cambios de estado (sincroniza con timestamp original del dispositivo + timestamp de servidor), rendición de efectivo del día.

La ubicación en vivo es opcional (R6), requiere consentimiento explícito y disponibilidad real. **Nunca simular ubicación.**

### 4.6 Zonas y tarifas
- **MVP:** zonas como **listas de barrios/ciudades**; tarifa fija por zona; override por comercio; vigencia; recargos simples (p. ej. lluvia, horario nocturno) con autorización; simulador de tarifa; historial de cambios.
- **R6:** zonas por polígono (PostGIS), tarifa por distancia, promociones.
- Proveedor de mapas detrás de una interfaz intercambiable (`MapProvider`). MVP sin mapa embebido.

### 4.7 Seguimiento (MVP)
Seguimiento desde el panel con historial de eventos. **Link público de tracking** por pedido: token aleatorio no adivinable, vencimiento (p. ej. 48 h tras cierre), muestra solo estado, hora estimada si existe (marcada como estimada) y nombre de la empresa. Sin datos internos ni del repartidor salvo nombre de pila [VALIDAR].

### 4.8 Incidencias (MVP)
Categorías configurables (por defecto: destinatario ausente, dirección incorrecta, comercio cerrado, rechazo, sin contacto, reprogramación, devolución, paquete dañado, otra). Registro de responsable, descripción, fecha, evidencia opcional, resolución y quién resolvió. Una incidencia puede disparar una transición (p. ej. `NO_ENTREGADO → PENDIENTE_ASIGNACION` al reprogramar).

### 4.9 Efectivo y liquidaciones
- **MVP — Rendición de efectivo:** el sistema calcula el efectivo esperado por repartidor (cobros `COBRADO` del día); el operador registra lo rendido; diferencias quedan observadas y auditadas. Saldo a favor de cada comercio (cobrado − tarifas).
- **R5 — Liquidaciones:** tarifas por entrega, comisiones, montos a liquidar al comercio, pagos a repartidores (por entrega o fijo), ajustes autorizados, estados `PENDIENTE → CALCULADO → APROBADO → PAGADO | OBSERVADO`, exportación.
- No se procesa dinero ni se almacenan datos de tarjetas.

### 4.10 Informes
- **MVP:** indicadores del dashboard y export CSV de pedidos.
- **R5:** pedidos por período/comercio/zona/repartidor, tasa de éxito, tiempos por etapa (p50/p90), incidencias, liquidaciones. Fórmulas documentadas en §10.

### 4.11 Notificaciones
Capa desacoplada (`NotificationChannel`) con registro de envíos, fallos, reintentos y deduplicación.
- **MVP:** notificaciones en panel (SSE) + **enlaces `wa.me` prellenados** (el operador/repartidor envía con un toque; sin costo de API).
- **R6:** WhatsApp Business API vía proveedor, correo, push PWA.

## 5. Contexto Paraguay

- **Moneda:** PYG sin decimales; montos `integer` (BIGINT) en unidad mínima + `currency` (ISO 4217).
- **Zona horaria:** almacenar UTC; mostrar con IANA `America/Asuncion` (configurable por tenant). Nunca offsets fijos.
- **Direcciones:** barrio + ciudad + referencias obligatorias; número de casa opcional; aceptar link de ubicación.
- **Teléfonos:** formato E.164 (`+595…`) con normalización de entradas locales (`09xx…`).
- **Conectividad:** PWA < 300 KB JS inicial objetivo, tolerante a offline.
- **Legal [VALIDAR con asesor]:** normativa vigente de protección de datos personales (p. ej. Ley 6534/2020 y posteriores); facturación electrónica SIFEN (DNIT) del propio SaaS. Política de privacidad y términos antes del piloto.

## 6. Integración (API genérica + ZESTIA)

### 6.1 API de ingreso genérica (R2)
Cualquier sistema (incluida ZESTIA) crea y consulta pedidos con **API key por integración/tenant**, `Idempotency-Key` obligatorio y validación de esquema. Webhooks salientes firmados (HMAC-SHA256) vía outbox. Contratos en [`API_CONTRACTS.md`](API_CONTRACTS.md).

### 6.2 ZESTIA (R4)
Arquitectura: `ZESTIA ⇄ Gateway de integración ⇄ ZESTIA DELIVERY`. El gateway es un **módulo** del monolito (no un servicio aparte) hasta que un ADR justifique separarlo.

Flujo conceptual, endpoints propuestos, seguridad y decisiones pendientes: [`ZESTIA_INTEGRATION.md`](ZESTIA_INTEGRATION.md). **Todo lo relativo a ZESTIA es propuesta hasta auditar ZESTIA.**

### 6.3 Seguridad y resiliencia de integraciones
TLS; credenciales por integración/tenant (hash en DB, mostradas una sola vez); HMAC con timestamp y ventana anti-replay (5 min); rotación con período de gracia y revocación; rate limiting por key; `Idempotency-Key` (retención 24 h); validación de esquema; logs sin secretos ni PII innecesaria; reintentos con backoff exponencial + jitter; dead-letter; panel de estado con reprocesamiento autorizado; `correlationId` de punta a punta; versionado de contrato (`schemaVersion`).

## 7. Arquitectura técnica

Detalle y ADRs en [`ARCHITECTURE.md`](ARCHITECTURE.md) y [`DECISIONS.md`](DECISIONS.md). Propuesta:

- Monorepo **pnpm + Turborepo**.
- `apps/api`: **NestJS + TypeScript**, REST `/api/v1`, OpenAPI generado.
- `apps/web`: **React + Vite + TypeScript**, TanStack Query/Router, shadcn/ui + Tailwind; panel, portal de comercio y PWA de repartidor como áreas de la misma app.
- **PostgreSQL 16+** con **Prisma** y **RLS** por tenant.
- Colas/jobs con **pg-boss**; **outbox** transaccional.
- Tiempo real con **SSE**.
- Docker Compose para desarrollo; CI en GitHub Actions.
- Tests: Vitest (unit), Supertest + Testcontainers (integración), Playwright (E2E).

## 8. Modelo de datos

Ver [`DATA_MODEL.md`](DATA_MODEL.md). Entidades: `Tenant`, `User`, `Membership`, `Role` (enum en MVP), `Merchant`, `MerchantBranch`, `MerchantUser`, `Courier`, `CourierShift`, `DeliveryZone`, `ZoneArea`, `DeliveryRate`, `DeliveryOrder`, `DeliveryOrderItem`, `OrderStatusHistory`, `Assignment`, `Incident`, `IncidentCategory`, `ProofOfDelivery`, `CashCollection`, `CashRemittance`, `Settlement`, `SettlementLine`, `Integration`, `ApiKey`, `IdempotencyRecord`, `OutboxEvent`, `WebhookDelivery`, `TrackingLink`, `Notification`, `AuditLog`.

Todas las entidades de negocio llevan `tenantId`, índices compuestos `(tenantId, …)`, restricciones, `createdAt/updatedAt` y borrado lógico cuando corresponda.

## 9. UX/UI

Panel operativo denso pero legible; foco en lectura rápida y acciones frecuentes (asignar en ≤ 2 clics). Tablero kanban por estados, tablas con filtros persistentes, atajos de teclado para despachadores. Estados vacíos, errores, carga y **desconexión visibles**. Mapa opcional. PWA repartidor: botones grandes, una mano, alto contraste para uso al sol. Accesibilidad WCAG 2.1 AA y `prefers-reduced-motion`. Idioma: español (es-PY); textos externalizados para i18n futura.

## 10. Fórmulas de indicadores

| Indicador | Fórmula |
|-----------|---------|
| Tasa de entrega exitosa | `ENTREGADO / (ENTREGADO + NO_ENTREGADO + DEVUELTO)` en el período (excluye `CANCELADO`) |
| Tiempo a asignación | `primer ASIGNADO.at − RECIBIDO.at` |
| Tiempo de retiro | `RETIRADO.at − ASIGNADO.at` (último) |
| Tiempo de entrega | `ENTREGADO.at − RETIRADO.at` |
| Tiempo total | `ENTREGADO.at − RECIBIDO.at` |
| Pedido demorado | Tiempo en el estado actual > SLA del tenant para ese estado |
| Diferencia de rendición | `Σ CashCollection(COBRADO) − Σ CashRemittance` por repartidor y día |

Percentiles p50/p90; los timestamps usados son los de **servidor**.

## 11. Requisitos no funcionales

| Requisito | Objetivo MVP |
|-----------|--------------|
| Disponibilidad | 99,5% mensual (horario operativo 07–24 h) |
| Latencia API | p95 < 300 ms en lecturas, < 500 ms en escrituras |
| Volumen | 50 tenants × 1.000 pedidos/día sin cambios de arquitectura |
| Tiempo real | Cambio de estado visible en el panel < 3 s |
| Backups | Diarios, retención 30 días, **prueba de restauración mensual** |
| Retención | Datos de destinatario anonimizables tras N meses (configurable) |
| Observabilidad | Logs estructurados con `correlationId`, métricas, alertas de errores |

## 12. Seguridad y privacidad

Ver [`SECURITY.md`](SECURITY.md). Aislamiento tenant (app + RLS), RBAC, mínimo privilegio, 2FA (opcional MVP, obligatorio para Propietario/Admin en R6), cifrado en tránsito, auditoría, retención configurable, minimización de datos, tokens limitados, OWASP ASVS nivel 2 como referencia, backups probados, nunca registrar secretos.

## 13. Roadmap

Ver [`ROADMAP.md`](ROADMAP.md): R0 Discovery → R1 Fundaciones → R2 Operación Core (**MVP**) → R3 Piloto → R4 ZESTIA → R5 Finanzas → R6 Escala.

## 14. Criterios de aceptación del MVP (verificables)

1. **Aislamiento:** test automatizado en CI con 2 tenants: ningún endpoint devuelve ni modifica datos del otro tenant (incluye intento con `tenantId` manipulado → 403/404). RLS activa en DB.
2. **Configuración:** un Administrador crea comercio, sucursal, repartidor y zona con tarifa en < 10 min sin ayuda (prueba con usuario real).
3. **Ingreso:** pedidos ingresan por panel, portal de comercio y API genérica.
4. **Idempotencia:** reenviar 10 veces la misma solicitud con igual `Idempotency-Key` crea exactamente 1 pedido (test).
5. **Despacho:** el Operador asigna/reasigna; la reasignación tras aceptación exige motivo.
6. **Repartidor:** ve solo sus pedidos (test de autorización); solo ejecuta transiciones permitidas (test de máquina de estados con todas las transiciones inválidas → 409).
7. **Offline:** cambios de estado hechos sin conexión se sincronizan en orden al reconectar (E2E).
8. **Efectivo:** la rendición del día muestra esperado vs. rendido y registra diferencias.
9. **Auditoría:** toda acción crítica (asignación, cambio de estado, cancelación, cambio de tarifa, rendición, gestión de usuarios/keys) genera `AuditLog` con actor, tenant, antes/después.
10. **Integración:** webhooks fallidos se reintentan con backoff, quedan visibles en panel y se pueden reprocesar.
11. **Calidad:** cobertura ≥ 80% en módulos `orders`, `dispatch`, `auth`, `cash`; E2E del flujo feliz y de no-entrega pasan en CI.
12. **Docs:** un desarrollador nuevo levanta el entorno con `README` en < 30 min.

## 15. Changelog v1 → v2

- MVP re-recortado y roadmap convertido en releases con duración estimada.
- Objetivos medibles, North Star, no-objetivos y requisitos no funcionales agregados.
- Contexto Paraguay (PYG, zona horaria, direcciones, efectivo, conectividad, normativa).
- Rendición de efectivo y portal de comercio movidos al MVP.
- API de ingreso genérica; ZESTIA como cliente (R4).
- `EN_REVISION` eliminado; incidencias ortogonales; estados de devolución; estado de cobro separado.
- Zonas por barrio en MVP; polígonos en R6. Notificaciones vía `wa.me` en MVP.
- Roles fijos en MVP.
- Criterios de aceptación reescritos como verificables.
- Prompt maestro movido a `CLAUDE.md`.
