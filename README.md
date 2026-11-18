# ZESTIA DELIVERY

Plataforma web SaaS multiempresa para gestionar empresas de delivery — pedidos, despacho, repartidores, efectivo, seguimiento e integraciones — pensada para Paraguay e integrable con ZESTIA.

> **Estado:** 🟡 **R1 — Fundaciones.** Decisiones de arquitectura aprobadas (ADR 001–012); arranca el código. El discovery de R0 (entrevistas, piloto, auditoría ZESTIA) sigue en paralelo.

## Por dónde empezar

| Si querés… | Leé |
|------------|-----|
| Entender el producto | [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md) |
| Ver el análisis y las propuestas de PM | [`docs/00_ANALISIS_PM.md`](docs/00_ANALISIS_PM.md) |
| La especificación completa (v2) | [`docs/SPEC.md`](docs/SPEC.md) |
| El plan y los releases | [`docs/ROADMAP.md`](docs/ROADMAP.md) · [Milestones](https://github.com/mandarinagg/zestia-delivery/milestones) |
| La arquitectura propuesta | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| Cómo trabajamos | [`docs/WORKING_AGREEMENT.md`](docs/WORKING_AGREEMENT.md) · [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## Documentación

- [Especificación v2](docs/SPEC.md) — [v1 original](docs/archive/01_ZESTIA_DELIVERY_v1.md)
- [Máquina de estados del pedido](docs/ORDER_STATE_MACHINE.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Contratos de API](docs/API_CONTRACTS.md)
- [Integración ZESTIA](docs/ZESTIA_INTEGRATION.md) *(propuesta, sin confirmar)*
- [Seguridad y privacidad](docs/SECURITY.md)
- [Pruebas](docs/TESTING.md)
- [UI: tokens, componentes y convenciones](docs/UI.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Riesgos](docs/RISKS.md)
- [Discovery](docs/DISCOVERY.md)
- [Limitaciones conocidas](docs/KNOWN_LIMITATIONS.md)

## Stack

pnpm + Turborepo · NestJS + TypeScript · PostgreSQL + Prisma + RLS · pg-boss · SSE · React + Vite + TanStack + shadcn/ui · PWA · Docker · GitHub Actions · Vitest + Playwright. Hosting pendiente (ADR-013).

## Roadmap

`R0 Discovery` → `R1 Fundaciones` → `R2 Operación Core (MVP)` → `R3 Piloto` → `R4 ZESTIA` → `R5 Finanzas` → `R6 Escala`

## Desarrollo local

Tiempo estimado: **menos de 30 minutos**.

### Requisitos

- [Node.js 24 LTS](https://nodejs.org/) (`.nvmrc`; con nvm: `nvm install && nvm use`)
- [Corepack](https://nodejs.org/api/corepack.html) (viene con Node; instala el pnpm fijado en `package.json`)
- [Docker](https://docs.docker.com/get-docker/) con Compose v2
- Git

### Pasos

```bash
git clone https://github.com/mandarinagg/zestia-delivery.git
cd zestia-delivery

corepack enable            # activa el pnpm fijado en "packageManager"
pnpm install               # instala todo el monorepo

# Variables de entorno (solo valores de desarrollo, nunca secretos reales)
cp infra/docker/.env.example infra/docker/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

pnpm infra:up              # Postgres 17 + Mailpit (espera a que estén healthy)
pnpm db:migrate            # aplica las migraciones (rol zestia_migrator)
pnpm dev                   # API en :3000 y web en :5173
```

> **¿Ya tenías el volumen de Postgres de una versión anterior?** Los roles de la base
> (`zestia_migrator`, `zestia_app`) se crean solo al inicializar un volumen vacío. Recrealo:
> `docker compose -f infra/docker/docker-compose.yml down -v && pnpm infra:up && pnpm db:migrate`.

Verificación rápida:

- API: <http://localhost:3000/health/live> → `{"status":"ok"}`
- API + DB: <http://localhost:3000/health/ready> → `{"status":"ok","checks":{"database":"ok"}}`
- Web: <http://localhost:5173>
- Guía de UI (tokens, tabla, formularios, estados; datos de ejemplo): <http://localhost:5173/panel/ui>. Funciona sin la API ni Docker: `pnpm --filter @zestia/web dev`.
- Mailpit (correos de desarrollo): <http://localhost:8025>
- Postgres: `localhost:5432` (claves en `infra/docker/.env`). Roles:
  - `zestia_app` — el único que usa la API (`DATABASE_URL`). Sin `BYPASSRLS`, no es dueño de tablas: la API se niega a arrancar con un rol privilegiado.
  - `zestia_migrator` — dueño del esquema, solo para migraciones (`MIGRATION_DATABASE_URL`).
  - `zestia_admin` (`POSTGRES_USER`) — superusuario del contenedor, solo administración.

Para apagar la infraestructura: `pnpm infra:down` (para borrar también el volumen de datos: `docker compose -f infra/docker/docker-compose.yml down -v`).

### Comandos

| Comando                             | Qué hace                                      |
| ----------------------------------- | --------------------------------------------- |
| `pnpm dev`                          | API y web en modo desarrollo                  |
| `pnpm build`                        | Compila todos los paquetes y apps (Turborepo) |
| `pnpm lint`                         | ESLint, incluidos los límites de módulos      |
| `pnpm typecheck`                    | TypeScript estricto en todo el monorepo       |
| `pnpm test`                         | Vitest en todos los paquetes (la API incluye tests de integración con Testcontainers: **requiere Docker**) |
| `pnpm db:migrate`                   | Aplica las migraciones pendientes (`prisma migrate deploy`) |
| `pnpm db:migrate:dev`               | Crea una migración nueva desde `apps/api/prisma/schema.prisma` |
| `pnpm format` / `pnpm format:check` | Prettier (escribe / solo verifica)            |


### Estructura

```
apps/api            NestJS (monolito modular)
apps/web            React + Vite + Tailwind + shadcn/ui + TanStack Router/Query
packages/contracts  Esquemas Zod compartidos
packages/domain     Lógica pura (sin frameworks ni DB)
packages/auth       Matriz rol → permisos
packages/config     ESLint, TSConfig y Prettier compartidos
infra/docker        docker-compose (Postgres, Mailpit)
```

### Límites de módulos

Se verifican con `eslint-plugin-boundaries` (`packages/config/eslint/boundaries.mjs`) y fallan en `pnpm lint` y en CI:

- `apps/*` pueden importar `packages/*`; los `packages/*` **no** importan `apps/*`, y las apps no se importan entre sí.
- `packages/domain` y `packages/contracts` no dependen de otros paquetes del monorepo; `packages/domain` tampoco de frameworks, DB/ORM ni I/O (`@nestjs/*`, `prisma`, `pg`, `node:fs`, …).
- Cada módulo de la API vive en `apps/api/src/modules/<nombre>/` y expone su API pública **solo** en `index.ts`. Importar desde otro módulo cualquier archivo que no sea ese `index.ts` (servicios, repositorios, entidades) es un error. La comunicación asíncrona entre módulos va por eventos de dominio (outbox).

### Base de datos y multi-tenancy

- Prisma 7 en `apps/api` (`prisma/schema.prisma`, migraciones en `prisma/migrations/`). El cliente se genera en `apps/api/src/generated/` (ignorado por git) automáticamente antes de `dev`, `build`, `typecheck` y `test`; a mano: `pnpm --filter @zestia/api db:generate`.
- Toda tabla accesible por la API tiene **RLS forzada**. Las políticas RLS se escriben en el SQL de la migración (Prisma no las modela): al crear una tabla de negocio, editá la migración con `--create-only` y agregá `ENABLE`/`FORCE ROW LEVEL SECURITY`, la política por `app_current_tenant_id()` y el `GRANT` a `zestia_app`. Un test falla si falta.
- El acceso a datos de negocio pasa **solo** por `TenantDb` del módulo `tenancy` (`@TenantScoped()` en el controller). ESLint impide importar el cliente Prisma crudo fuera de `database/`, `health/` y `modules/tenancy/`. Detalle: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#multi-tenancy).
- Cada endpoint nuevo usa el helper `expectTenantIsolation` (`apps/api/src/testing/`).
- Autenticación real: issue #14. Mientras tanto todo endpoint de tenant responde 401.

## Licencia

Todos los derechos reservados hasta definir licencia (ver issue de decisión).
