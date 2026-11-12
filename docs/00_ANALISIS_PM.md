# Análisis de Project Management — ZESTIA DELIVERY

**Fecha:** 2026-11-12 · **Documento analizado:** [`archive/01_ZESTIA_DELIVERY_v1.md`](archive/01_ZESTIA_DELIVERY_v1.md) · **Resultado:** [`SPEC.md`](SPEC.md) (v2)

---

## 1. Resumen ejecutivo

La especificación v1 es **sólida en principios técnicos** (multi-tenancy, RBAC en backend, idempotencia, auditoría, desacople de ZESTIA) y honesta respecto de lo que no se sabe de ZESTIA. Es una excelente base de arquitectura.

Como documento para **gestionar un proyecto**, en cambio, tiene huecos que generarían retrasos y re-trabajo:

| # | Hallazgo | Impacto | Propuesta |
|---|----------|---------|-----------|
| 1 | El **MVP abarca 4 fases** (incluye API externa y Fase 4) pero el roadmap no tiene fechas, tamaño ni equipo. | Alto | MVP re-recortado a "Operación Core" + **piloto con 1 empresa real** (ver §4). |
| 2 | **No hay objetivos de negocio ni métricas** (¿qué es éxito?). | Alto | North Star y KPIs definidos (§6). |
| 3 | El **cobro en efectivo** (dominante en Paraguay) está recién en Fase 5. | Alto | La **rendición de efectivo del repartidor** pasa al MVP: sin ella ninguna empresa real puede operar. |
| 4 | La integración por API depende de ZESTIA, cuyos contratos son desconocidos. | Alto | Crear una **API de ingreso genérica** (API key + idempotencia). ZESTIA será un cliente más; el MVP no queda bloqueado por ZESTIA. |
| 5 | `EN_REVISION` mezcla incidencias con estados; faltan **devoluciones**. | Medio | Incidencias **ortogonales** al estado; se agregan `EN_DEVOLUCION` / `DEVUELTO`; tabla de transiciones explícita. |
| 6 | Zonas por polígono + mapas en Fase 3 suben costo y complejidad. | Medio | MVP con **zonas por barrio/ciudad** (lista) y tarifa fija por zona; polígonos (PostGIS) después. |
| 7 | Sin especificidades locales: guaraní sin decimales, direcciones informales, conectividad móvil irregular, WhatsApp como canal principal, normativa de datos. | Medio | Sección "Contexto Paraguay" en el SPEC (§5). |
| 8 | Sin modelo de negocio del SaaS (precio, planes, onboarding). | Medio | Hipótesis de pricing a validar en Discovery (§7). |
| 9 | Sin gestión de riesgos, Definition of Done, cadencia ni gobierno de decisiones. | Medio | [`RISKS.md`](RISKS.md), [`WORKING_AGREEMENT.md`](WORKING_AGREEMENT.md), ADRs en [`DECISIONS.md`](DECISIONS.md). |
| 10 | Permisos configurables por rol desde el día 1 = sobre-ingeniería. | Bajo | **Roles fijos** con matriz de permisos en código para el MVP; editor de roles más adelante. |

---

## 2. Fortalezas (mantener)

- Principios no negociables claros (aislamiento tenant, validación en backend, nunca confiar en `tenantId` del cliente).
- "Monolito modular primero": decisión correcta para un equipo chico.
- Separación de lo **conocido vs. pendiente** en la integración ZESTIA; prohibición de inventar contratos.
- Seguridad de integración completa (HMAC, anti-replay, DLQ, rotación).
- Postura ética: nunca simular ubicación, no presentar estimaciones como datos reales.
- Lista de documentación viva — ya creada en este repo.

## 3. Debilidades y vacíos

1. **Alcance vs. capacidad:** no hay supuestos de equipo, presupuesto ni fecha objetivo. Sin esto el roadmap no es planificable.
2. **Usuario y problema no validados:** no hay entrevistas, ni competidores, ni hipótesis de por qué una empresa cambiaría su planilla/WhatsApp por este sistema.
3. **Criterios de aceptación no medibles:** "Tests cubren flujos críticos" no es verificable. Se reescribieron como criterios comprobables.
4. **Faltan requisitos no funcionales:** disponibilidad, latencia, volumen esperado, retención, soporte.
5. **Onboarding de tenants:** ¿cómo se da de alta una empresa nueva? ¿self-service o asistido? No estaba definido.
6. **Comercio asociado sin flujo propio:** ¿el comercio carga pedidos él mismo? Es la funcionalidad que más reduce trabajo al despachador — se propone en MVP (portal comercio mínimo).
7. **Prompt maestro (§12) dentro del spec de producto:** se movió a [`CLAUDE.md`](../CLAUDE.md), que es donde un agente lo lee automáticamente.

---

## 4. Propuesta de alcance: releases en lugar de fases abiertas

| Release | Objetivo | Duración estimada* | Salida |
|---------|----------|--------------------|--------|
| **R0 — Discovery** | Validar problema, estados, roles, precios con 5–8 empresas de delivery de Gran Asunción. Auditar ZESTIA. | 2 semanas | Informe de discovery, estados validados, ADRs aprobados, empresa piloto comprometida. |
| **R1 — Fundaciones** | Monorepo, CI, auth, tenants, roles fijos, auditoría, comercios y sucursales. | 3 semanas | Dos tenants aislados con tests de aislamiento en CI. |
| **R2 — Operación Core** | Pedidos (manual + portal comercio + API genérica), máquina de estados, despacho kanban, repartidores, PWA repartidor, incidencias, zonas por barrio + tarifa, rendición de efectivo, tracking link. | 5 semanas | **MVP** funcionando end-to-end. |
| **R3 — Piloto** | Operación real con 1 empresa, en paralelo a su proceso actual. Soporte, ajustes, métricas. | 3 semanas | Go/No-go con datos reales. |
| **R4 — ZESTIA** | Conector ZESTIA sobre la API genérica + webhooks firmados + outbox + DLQ + panel de estado. | 3 semanas | Pedido ZESTIA → entrega → estado devuelto. |
| **R5 — Finanzas e informes** | Liquidaciones completas (comercio/repartidor), informes, CSV. | 3 semanas | Liquidación mensual sin planilla externa. |
| **R6 — Escala** | WhatsApp API, polígonos/PostGIS, GPS opt-in, sugerencias de asignación, editor de roles, 2FA obligatorio. | Continuo | Según datos del piloto. |

\* Supuesto: **2 desarrolladores full-stack + 1 PM/PO parcial**. Con 1 desarrollador, multiplicar por ~1,8. Ver [`ROADMAP.md`](ROADMAP.md).

**MVP = R1 + R2 (~8 semanas) → piloto en semana ~11.**

### Qué queda fuera del MVP (y por qué)

| Fuera | Motivo |
|-------|--------|
| Integración ZESTIA específica | Depende de contratos desconocidos; la API genérica cubre el caso técnico. |
| Polígonos y mapas | Barrios + referencias resuelven el 90% en Gran Asunción; mapas suman costo y API keys. |
| WhatsApp Business API | Costo y aprobación de Meta; en MVP usar enlaces `wa.me` prellenados (cero costo). |
| GPS en vivo | Batería, permisos, privacidad; estados con timestamp dan la trazabilidad necesaria. |
| Asignación automática | El propio spec lo prohíbe sin datos fiables. |
| Liquidaciones completas | MVP registra rendición de efectivo y deuda por comercio; el cierre formal va en R5. |

---

## 5. Contexto Paraguay (requisitos que faltaban)

- **Moneda PYG sin decimales:** montos como enteros; campo `currency` para el futuro. Nunca `float`.
- **Zona horaria:** usar IANA `America/Asuncion` (no offsets fijos; Paraguay cambió su régimen horario en 2024).
- **Direcciones informales:** muchas sin numeración; priorizar *referencias*, barrio, ciudad, y pin compartido por WhatsApp (link de Google Maps pegado por el operador).
- **Efectivo dominante:** cobro contra entrega, vuelto, rendición diaria del repartidor. QR/transferencia como método registrado (sin procesamiento).
- **Conectividad:** repartidores con datos prepagos → PWA liviana, tolerante a desconexión, cola local de cambios de estado.
- **WhatsApp:** canal operativo de facto entre empresa, comercio, repartidor y destinatario.
- **Normativa:** verificar con asesor legal la normativa vigente de protección de datos personales (p. ej. Ley 6534/2020 y legislación posterior) y facturación electrónica SIFEN (DNIT) si el SaaS factura a las empresas. **Facturación electrónica de entregas: fuera de alcance.**
- **Motos** como vehículo principal; capacidad = cantidad de paquetes / tamaño.

---

## 6. Objetivos y métricas

**North Star:** *entregas completadas por semana en tenants activos.*

| KPI | Fórmula | Meta piloto (hipótesis) |
|-----|---------|-------------------------|
| Tasa de entrega exitosa | `ENTREGADO / (ENTREGADO + NO_ENTREGADO + DEVUELTO)` | ≥ 95% |
| Tiempo a asignación | `asignado_at − recibido_at` (p50/p90) | p50 < 5 min |
| Tiempo de entrega | `entregado_at − retirado_at` (p50/p90) | Línea base en piloto |
| Pedidos con incidencia | `pedidos con ≥1 incidencia / total` | Línea base |
| Diferencia de rendición | `efectivo esperado − rendido` por repartidor/día | 0 Gs. |
| Adopción | % pedidos del piloto cargados en el sistema vs. totales | ≥ 90% en semana 3 |

Todas las fórmulas se documentan en [`SPEC.md` §10](SPEC.md) y los informes nunca muestran estimaciones como datos reales.

## 7. Hipótesis de negocio (validar en R0)

- **Cliente:** empresa de delivery tercerizado con 5–50 repartidores en Gran Asunción, hoy operando con WhatsApp + planillas.
- **Dolor principal:** pérdida de trazabilidad, rendición de efectivo con errores, despachador saturado.
- **Pricing hipotético:** plan por pedido entregado (p. ej. tramos mensuales) o por repartidor activo. **Validar disposición a pagar** en entrevistas.
- **Diferencial:** pensado para efectivo + WhatsApp + direcciones informales, y conexión nativa con tiendas ZESTIA.
- **Competencia a relevar en R0:** software de última milla regional y soluciones locales; documentar en `DISCOVERY.md`.

---

## 8. Propuestas técnicas (resumen; detalle en ADRs)

| ADR | Propuesta | Estado |
|-----|-----------|--------|
| 001 | Monolito modular | Aceptado (spec v1) |
| 002 | Monorepo pnpm + Turborepo (`apps/api`, `apps/web`, `packages/*`) | Propuesto |
| 003 | Backend NestJS + TypeScript (módulos = bounded contexts) | Propuesto |
| 004 | PostgreSQL + Prisma; **Row Level Security** como defensa en profundidad del tenant | Propuesto |
| 005 | Colas con **pg-boss** (sobre Postgres) en lugar de Redis al inicio | Propuesto |
| 006 | Tiempo real con **SSE** (no WebSocket) | Propuesto |
| 007 | Montos como enteros en unidad mínima de moneda | Propuesto |
| 008 | **Outbox transaccional** para eventos y webhooks | Propuesto |
| 009 | Incidencias ortogonales al estado del pedido | Propuesto |
| 010 | API de ingreso genérica; ZESTIA como un cliente | Propuesto |
| 011 | Zonas por lista (barrio/ciudad) en MVP; PostGIS después | Propuesto |
| 012 | Frontend React + Vite + TanStack Query + shadcn/ui; PWA repartidor en la misma app | Propuesto |
| 013 | Hosting y proveedor cloud | **Pendiente** (decidir en R0 según costos) |

Menos piezas de infraestructura (sin Redis, sin microservicios, sin mapas pagos) = menor costo operativo y menos riesgo para un equipo chico.

---

## 9. Decisiones que necesito de vos (bloquean R1)

1. **Equipo y dedicación:** ¿cuántas personas y cuántas horas/semana? (recalcula el roadmap).
2. **Fecha objetivo** del piloto y **empresa piloto** candidata.
3. **Aprobación del stack** (ADR 002–012) o preferencias distintas.
4. **Licencia del repositorio:** el repo es público sin licencia (= todos los derechos reservados). ¿Querés que siga así, o una licencia open source / source-available?
5. **Acceso a ZESTIA:** repositorio o documentación para la auditoría de R0.
6. **Hosting/presupuesto** mensual de infraestructura aceptable.

Estas decisiones están cargadas como issues `tipo:decision` en GitHub.
