# Handoff — estado del trabajo

> Última actualización: **2026-11-18**. Punto de partida para la próxima sesión (humana o de agentes).
> Leer junto con [`CLAUDE.md`](../CLAUDE.md), [`ROADMAP.md`](ROADMAP.md) y [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

## Resumen

Release **R1 — Fundaciones** en curso. Ya están el monorepo, la multi-tenancy con RLS, la autenticación con sesiones de servidor y el sistema de diseño **"Riel"**, con prototipos navegables. Todo corre **en local** con Docker Compose. El pase a producción va a los **servidores propios** del dueño y se define más adelante; ADR-013 (hosting cloud) queda pospuesto.

**Rama de trabajo recomendada:** `feat/r1-integracion`, que reúne todo lo de abajo. Verificada el 2026-11-18:

- `pnpm install --frozen-lockfile` sin errores.
- `format:check`, `lint`, `typecheck` y `build` pasan.
- `pnpm test` pasa con **274 tests**: api 154, web 111, contracts 6, domain 2, auth 1.
- El contraste AA pasa: 150/150 pares.

## Ramas

| Rama | Contenido | Base |
|------|-----------|------|
| `docs/2-aceptar-adrs` | ADR 002–012 aceptados, estado R1 (PR #31) | `main` |
| `chore/13-monorepo-setup` | Monorepo pnpm + Turborepo, CI, Docker Compose, dev de la API con SWC (PR #32: el commit de CI todavía no estaba pusheado) | `main` |
| `feat/15-multitenancy-rls` | Prisma + RLS forzada, roles de DB, `TenantDb`, `@TenantScoped`, suite de aislamiento, merge de los ADR | `chore/13` |
| `feat/14-auth-sessions` | Login, sesiones, CSRF, rate limit, reset por email, cambio de tenant, `audit_logs` mínima, `pnpm db:seed` | `feat/15` |
| `feat/20-ui-base` | Primera base de UI (genérica, reemplazada por el rediseño) | `feat/15` |
| `feat/20-ui-redesign` | Sistema de diseño "Riel" + prototipos | `feat/20-ui-base` |
| **`feat/r1-integracion`** | `feat/14` + `feat/20-ui-redesign` + este handoff | `feat/14` |

Flujo acordado: commits locales en ramas `feat/…`. El dueño decide cuándo pushear y cuándo mergear a `main`.

## Issues

| Issue | Estado |
|-------|--------|
| #2 Aprobar stack (ADR 002–012) | ✅ Hecho (PR #31 sin mergear) |
| #3 Hosting (ADR-013) | ⏸ Pospuesto: servidores propios, se ve al pasar a producción |
| #13 Monorepo, CI y entorno local | ✅ Hecho |
| #15 Multi-tenancy con RLS | ✅ Hecho |
| #14 Autenticación y sesiones | ✅ Hecho, solo backend |
| #20 Base de UI | ✅ Hecho: sistema + prototipos, sin conectar a la API |
| #16 Roles fijos y guardas de permisos | ⏭ Siguiente |
| #17 Auditoría transversal | ⏭ Siguiente (ya existe `audit_logs` mínima y `AuditService.record()`) |
| #19 CRUD de comercios y sucursales | ⏭ Después de #16 |
| #18 Usuarios del tenant e invitaciones | Pendiente |

## Cómo levantarlo en local

```bash
corepack enable && pnpm install
cp infra/docker/.env.example infra/docker/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm infra:up        # Postgres 17 + Mailpit (crea los roles de DB en un volumen vacío)
pnpm db:migrate
pnpm db:seed         # 2 empresas, 5 usuarios (ana@zestia.test está en las dos)
pnpm dev             # API :3000 · web :5173
```

- Si venís de una base creada con `chore/13`, recreá el volumen con `docker compose -f infra/docker/docker-compose.yml down -v`.
- Mailpit está en <http://localhost:8025>.
- Para ver la UI:
  - Guía viva del sistema de diseño: `/panel/ui`.
  - Prototipos:
    - `/panel/prototipo/despacho`
    - `/panel/prototipo/pedido/DEMO-1043`
    - `/prototipo/repartidor`
    - `/prototipo/seguimiento`
    - `/prototipo/ingreso`
    - `/prototipo/olvide-contrasena`
    - `/prototipo/restablecer-contrasena#token=demo-enlace-valido`

## Decisiones tomadas en esta sesión

- **Stack aprobado** (ADR 002–012). El spike de Prisma con RLS dio bien: se sigue con Prisma (ver ADR-004 en [`DECISIONS.md`](DECISIONS.md)).
- **Solo desarrollo local.** Sin hosting cloud ni staging. Producción va a servidores propios, más adelante.
- **Diseño "Riel":**
  - Paleta: tinta + lapacho.
  - Tipografía: Atkinson Hyperlegible Next + Barlow Semi Condensed, servidas localmente.
  - Estados: un riel de estados por pedido.
  - Movimiento con propósito, desactivado si el usuario pide menos movimiento.
  - Detalle en [`UI.md`](UI.md).
- **Contraseñas** de 12 a 128 caracteres; el backend y el prototipo de UI usan el mismo mínimo.

## Próximos pasos sugeridos

1. **#16 Permisos.**
   - Armar la matriz rol → permiso en `packages/auth` y reemplazar la opción provisoria `roles` de `@TenantScoped()`.
   - **Alinear los roles:** la DB tiene `OWNER, ADMIN, OPERATOR, SUPERVISOR, COURIER, MERCHANT`, mientras que `packages/auth` y el prototipo de login usan `admin, operator, merchant, courier`.
2. **#17 Auditoría.**
   - Extender `AuditService` / `audit_logs` con before/after y un interceptor transversal.
   - Agregar una vista para Propietario/Admin.
3. **Conectar el frontend a la API**, es decir, pasar el login de prototipo a real.
   - Configurar el proxy de Vite (no hay CORS: misma origin).
   - Usar `credentials: 'include'` y mandar `X-CSRF-Token` en cada mutación.
   - El selector de empresa se arma con `memberships` y `activeTenantId`.
   - Contratos en `packages/contracts/src/auth.ts`.
4. **#19 Comercios y sucursales**, con `expectTenantIsolation` en cada endpoint.
5. **#18 Usuarios e invitaciones**, que necesita el camino de alta de usuarios: hoy solo existe el seed.

## Pendientes y avisos

- **Push de workflows:** el token de `gh` necesita el scope `workflow` para pushear `.github/workflows/ci.yml`. Se habilita con `gh auth refresh -h github.com -s workflow`, corrido en una terminal normal.
- **CI en GitHub:** nunca corrió en GitHub Actions. Todo se verificó en local; los tests de integración usan Testcontainers y requieren Docker.
- **pnpm 12** avisa "Agent skills awaiting approval: @tanstack/react-router" (`pnpm approve`). Es informativo; no se aprobó.
- **Prototipos:**
  - Usan datos de ejemplo, sin API, SSE ni service worker.
  - El código del repartidor y del seguimiento se revisó por capturas y tests, no línea por línea.
- **Accesibilidad:** no se corrió una auditoría automática (axe).
- El resto está en [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).
