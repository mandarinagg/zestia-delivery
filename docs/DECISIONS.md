# Registro de decisiones (ADR)

Formato liviano. Estados: **Propuesto → Aceptado | Rechazado | Reemplazado**. Una decisión nueva que contradiga una aceptada requiere un ADR nuevo que la reemplace. Plantilla: [`adr/TEMPLATE.md`](adr/TEMPLATE.md).

| # | Decisión | Estado | Fecha |
|---|----------|--------|-------|
| 001 | Monolito modular | Aceptado | 2026-11-12 |
| 002 | Monorepo pnpm + Turborepo | Aceptado | 2026-11-17 |
| 003 | Backend NestJS + TypeScript | Aceptado | 2026-11-17 |
| 004 | PostgreSQL + Prisma + RLS | Aceptado | 2026-11-17 |
| 005 | Jobs con pg-boss (sin Redis inicial) | Aceptado | 2026-11-17 |
| 006 | Tiempo real con SSE | Aceptado | 2026-11-17 |
| 007 | Montos enteros en unidad mínima | Aceptado | 2026-11-17 |
| 008 | Outbox transaccional | Aceptado | 2026-11-17 |
| 009 | Incidencias ortogonales al estado | Aceptado | 2026-11-17 |
| 010 | API de ingreso genérica; ZESTIA como cliente | Aceptado | 2026-11-17 |
| 011 | Zonas por lista de barrios en MVP | Aceptado | 2026-11-17 |
| 012 | Frontend React + Vite + TanStack + shadcn/ui; PWA en la misma app | Aceptado | 2026-11-17 |
| 013 | Hosting / proveedor cloud | Pendiente | — |

---

### ADR-001 — Monolito modular
**Contexto:** equipo chico, dominio aún no validado. **Decisión:** un único despliegue con módulos por bounded context y límites forzados por lint. **Consecuencias:** despliegue simple; extraer servicios más tarde requiere ADR con justificación (carga, equipo, aislamiento).

### ADR-002 — Monorepo pnpm + Turborepo
**Contexto:** API y web comparten contratos y lógica de dominio. **Decisión:** monorepo con `apps/*` y `packages/*`. **Alternativas:** repos separados (duplicación de contratos), Nx (más pesado). **Consecuencias:** un PR puede cambiar contrato + API + UI atómicamente.

### ADR-003 — NestJS
**Contexto:** se necesita estructura modular, DI, guards, interceptores. **Decisión:** NestJS. **Alternativas:** Fastify puro (más liviano, menos estructura), Hono. **Consecuencias:** convenciones claras para guards de tenant/rol; curva de aprendizaje moderada.

### ADR-004 — PostgreSQL + Prisma + RLS
**Contexto:** aislamiento tenant es el riesgo #1. **Decisión:** filtro en aplicación **y** RLS en DB (`SET LOCAL app.tenant_id`). Prisma por productividad y migraciones. **Alternativas:** Drizzle (más control SQL), Kysely. **Consecuencias:** las transacciones deben pasar por un wrapper que setee el tenant; tests verifican RLS. Revisar si Prisma limita queries complejas → evaluar Drizzle en spike de R1.

**Resultado del spike (2026-11-17, issue #15):** Prisma **sirve** con RLS; se continúa con Prisma. Versión probada: Prisma 7.10 (generador `prisma-client` + driver adapter `@prisma/adapter-pg`, pool `pg`) sobre PostgreSQL 17, conectando con un rol sin `BYPASSRLS` ni ownership. Verificado con tests automáticos contra Postgres real (`apps/api/src/modules/tenancy/prisma-rls.int.test.ts` y `rls.int.test.ts`, corren en CI):
- `SELECT set_config('app.tenant_id', $1, true)` (parametrizado vía `$executeRaw` con tagged template) dentro de `$transaction(async (tx) => …)` aplica a **todas** las queries de la transacción: misma conexión (`pg_backend_pid()` constante) y el contexto se ve en cada query del modelo y en SQL crudo.
- Sin fuga por el pool: con un pool de 1 conexión, la operación siguiente en la **misma** conexión ve `current_setting = ''` y cero filas, tanto después de COMMIT como de ROLLBACK. Por eso las políticas usan `NULLIF(…, '')::uuid` (sin `NULLIF`, el `''` residual rompería el cast).
- 50 transacciones concurrentes alternando dos tenants sobre un pool compartido (y 30 vía `TenantDb` con `AsyncLocalStorage`) ven solo su tenant.
- Límites conocidos (no bloqueantes): toda request de tenant ocupa una conexión durante su transacción interactiva (dimensionar `DATABASE_POOL_MAX`; timeout de 15 s); las políticas RLS no se expresan en `schema.prisma` y viven en SQL de migraciones (un test de catálogo exige RLS forzada en toda tabla accesible por la app). Queries complejas: sin evidencia de bloqueo todavía; `$queryRaw` tipado cubre los casos puntuales. No se evaluó Drizzle.

### ADR-005 — pg-boss
**Decisión:** colas y jobs sobre Postgres. **Motivo:** una pieza menos de infraestructura; volumen MVP bajo. **Revisar si:** > 50 jobs/s sostenidos o latencia de cola relevante → Redis/BullMQ.

### ADR-006 — SSE
**Decisión:** Server-Sent Events para panel y PWA. **Motivo:** flujo mayormente servidor→cliente, reconexión nativa, funciona con HTTP estándar. Las acciones del cliente van por REST.

### ADR-007 — Montos enteros
**Decisión:** `BIGINT` en unidad mínima + `currency`. PYG no usa decimales. Formateo solo en UI.

### ADR-008 — Outbox transaccional
**Decisión:** todo evento externo/SSE nace de una fila `OutboxEvent` escrita en la misma transacción del cambio. **Motivo:** evitar eventos perdidos o fantasmas.

### ADR-009 — Incidencias ortogonales
**Decisión:** eliminar `EN_REVISION`; un pedido puede tener incidencias abiertas en cualquier estado. **Motivo:** "en revisión" ocultaba el estado logístico real.

### ADR-010 — API genérica primero
**Decisión:** API pública genérica (API key + idempotencia) en el MVP; ZESTIA usa la misma API + adaptador. **Motivo:** el MVP no queda bloqueado por contratos desconocidos de ZESTIA y el producto sirve a otros e-commerce.

### ADR-011 — Zonas por barrio
**Decisión:** zona = lista de (ciudad, barrio). Sin polígonos ni mapas en MVP. **Revisar en:** R6 con PostGIS.

### ADR-012 — Frontend
**Decisión:** React + Vite + TypeScript, TanStack Query/Router, shadcn/ui + Tailwind, `vite-plugin-pwa`. Panel, portal comercio y PWA repartidor como áreas de una sola app con code-splitting. **Alternativa:** Next.js (SSR innecesario para panel autenticado).

### ADR-013 — Hosting (pendiente)
Opciones a comparar en R0 por costo, latencia desde Paraguay, backups gestionados y simplicidad: PaaS (Railway/Render/Fly.io) + Postgres gestionado (Neon/Supabase/RDS) vs. VPS con Docker. Criterio: ≤ presupuesto acordado, backups automáticos con PITR, región São Paulo o cercana.
