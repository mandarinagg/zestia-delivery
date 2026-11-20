# Handoff — estado del trabajo

> Última actualización: **2026-11-20** (vista de auditoría en la web, #17). Antes: 2026-11-18 (#16, #17, login web, #19 y #18). Punto de partida para la próxima sesión (humana o de agentes).
> Leer junto con [`CLAUDE.md`](../CLAUDE.md), [`ROADMAP.md`](ROADMAP.md) y [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

## Resumen

Release **R1 — Fundaciones** en curso. Ya están el monorepo, la multi-tenancy con RLS, la autenticación con sesiones de servidor y el sistema de diseño **"Riel"**, con prototipos navegables. Todo corre **en local** con Docker Compose. El pase a producción va a los **servidores propios** del dueño y se define más adelante; ADR-013 (hosting cloud) queda pospuesto.

**Rama más reciente:** `feat/17-auditoria-web`, que incluye todo lo de abajo. Verificada el 2026-11-20:

- `lint`, `typecheck` y `build` pasan; Prettier pasa en los archivos cambiados.
- Web: **191 tests** (169 + 22 de la auditoría y las fechas por zona). El resto no cambió desde `feat/18-usuarios` (api 254, contracts 60, auth 45, domain 2).
- Vista de auditoría probada contra la API real: crear, editar, suspender y agregar sucursal quedan con sus cambios; filtros de área, fecha, persona y cursor; `403` para un Operador; otra empresa no ve nada.
- El contraste AA pasa: 150/150 pares.
- Los tests de la web esperan hasta 3 s en `findBy…`/`waitFor` (`test-setup.ts`): con 1 s fallaban al azar con la máquina cargada.

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
| `feat/16-permisos` | Matriz rol → permiso, `@RequirePermission()` (#16) | `feat/r1-integracion` |
| `feat/17-auditoria` | Auditoría con antes/después y consulta (#17) | `feat/16-permisos` |
| `feat/14-login-web` | Login real en la web, sesión, guardas de ruta, cambio de empresa, logout | `feat/17-auditoria` |
| `feat/19-comercios` | Comercios y sucursales: API, auditoría y pantallas | `feat/14-login-web` |
| `feat/18-usuarios` | Usuarios del tenant e invitaciones por email: API, auditoría y pantallas (pusheada a GitHub) | `feat/19-comercios` |
| **`feat/17-auditoria-web`** | Vista de auditoría en Configuración, pestañas de Configuración. **Rama más reciente: incluye todo lo anterior** | `feat/18-usuarios` |

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
| #16 Roles fijos y guardas de permisos | ✅ Hecho en `feat/16-permisos` (matriz en `packages/auth`, `@RequirePermission()`) |
| #17 Auditoría transversal | ✅ Backend en `feat/17-auditoria` (`recordChange` + `auditDiff`, `GET /audit-logs`); vista web en `feat/17-auditoria-web` |
| #19 CRUD de comercios y sucursales | ✅ Hecho en `feat/19-comercios`: API con auditoría y pantallas `/panel/comercios` |
| #18 Usuarios del tenant e invitaciones | ✅ Hecho en `feat/18-usuarios`: API con auditoría, `/panel/configuracion/usuarios` y aceptación pública `/invitacion` |

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
- **Puertos ocupados** (otro proyecto usando 5432, 1025 u 8025): cambiá `POSTGRES_PORT`, `MAILPIT_SMTP_PORT` y `MAILPIT_UI_PORT` en `infra/docker/.env`, y los mismos puertos en `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `SEED_DATABASE_URL` y `SMTP_PORT` de `apps/api/.env`. En esta máquina se usaron 55432, 11025 y 18025.
- Para ingresar usá los usuarios del seed (por ejemplo `ana@zestia.test`) con la contraseña `SEED_USER_PASSWORD` de `apps/api/.env`.
- Para ver la UI:
  - Guía viva del sistema de diseño: `/panel/ui`.
  - Prototipos:
    - `/panel/prototipo/despacho`
    - `/panel/prototipo/pedido/DEMO-1043`
    - `/prototipo/repartidor`
    - `/prototipo/seguimiento`

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

1. ~~**#16 Permisos.**~~ Hecho en `feat/16-permisos`: matriz en `packages/auth` (detalle en [`SECURITY.md`](SECURITY.md#roles-y-permisos-issue-16)), `@RequirePermission()` obligatorio en cada ruta de tenant. Roles alineados con la DB (`OWNER, ADMIN, OPERATOR, SUPERVISOR, COURIER, MERCHANT`). Falta alinear el prototipo de login, que sigue con `admin, operator, merchant, courier`, cuando se conecte a la API (paso 3).
2. ~~**#17 Auditoría.**~~ Backend hecho en `feat/17-auditoria`. Columna `changes`, más `AuditService.recordChange()` y `auditDiff()`; detalle en [`SECURITY.md`](SECURITY.md#auditoría-audit_logs). Consulta con `GET /api/v1/audit-logs`. Se eligió registrar desde el servicio, en la misma transacción, en lugar de un interceptor genérico: un interceptor no conoce el estado anterior de la entidad. Falta la vista web.
3. ~~**Conectar el frontend a la API.**~~ Hecho en `feat/14-login-web`:
   - ingreso, selector y cambio de empresa, logout, olvidé y restablecer contraseña;
   - proxy de Vite, CSRF y guardas por rol;
   - verificado de punta a punta contra la API real.

   Detalle en [`UI.md`](UI.md#sesión-en-la-web). Falta el cambio de contraseña en la web (la vista de auditoría ya está, paso 6).
4. ~~**#19 Comercios y sucursales.**~~ Hecho en `feat/19-comercios`:
   - API con estados (activo, suspendido, archivado), sucursales con horario y auditoría de cada cambio (datos de contacto ocultos);
   - `expectTenantIsolation` en cada endpoint con id y matriz de permisos generada desde `@zestia/auth`;
   - pantallas `/panel/comercios` (listado con búsqueda, filtros y "Cargar más") y detalle con edición, cambios de estado y sucursales;
   - verificado de punta a punta contra la API real.

   Límites en [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).
5. ~~**#18 Usuarios e invitaciones.**~~ Hecho en `feat/18-usuarios`:
   - membresía con estado propio (`ACTIVE`/`DISABLED`): un Admin deshabilita a alguien en su empresa sin tocar la cuenta global;
   - invitaciones por email con token (solo el `sha256` en la DB, enlace con `#token=`), vencimiento `INVITATION_TTL_HOURS` (7 días), reenviar y revocar;
   - aceptación sin sesión con funciones `SECURITY DEFINER`: crea la cuenta si no existe; si existe, basta el token. **No inicia sesión**;
   - reglas: el rol Propietario solo lo maneja un Propietario, nadie se modifica a sí mismo, siempre queda un Propietario activo (con bloqueo para carreras);
   - pantallas: `/panel/configuracion/usuarios` (tabla, filtros, búsqueda, menú por fila, invitaciones abiertas) y `/invitacion`;
   - verificado de punta a punta contra la API real con Mailpit (invitar, recibir el correo, aceptar, ingresar, auditoría).

   Contratos en [`API_CONTRACTS.md`](API_CONTRACTS.md#usuarios-e-invitaciones-apiv1members-apiv1invitations), seguridad en [`SECURITY.md`](SECURITY.md#invitaciones-18), límites en [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

   Decisiones para revisar con el dueño:
   - Repartidor y Comercio no se asignan en R1 (no tienen app ni permisos todavía).
   - El email se manda dentro de la transacción: si el SMTP falla, `502` y no se guarda nada (sin outbox).
   - Quien invita nunca ve el enlace; no hay "copiar enlace" para mandarlo por WhatsApp. Si hace falta, es una decisión de seguridad aparte.
6. ~~**Vista de auditoría (#17, web).**~~ Hecha en `feat/17-auditoria-web`:
   - `/panel/configuracion/auditoria`, con pestañas en Configuración (cada una con su permiso);
   - eventos por día con frase legible, detalle de cambios (datos personales como "Dato protegido") y enlace al comercio;
   - filtros por área, rango de días en la zona del tenant (`zonedDayStartToUtc`) y persona; "Cargar más" con cursor.

   Detalle en [`UI.md`](UI.md#patrones), límites en [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).
7. **Siguiente:** cambio de contraseña en la web (la API ya tiene `POST /auth/change-password`), después el aviso antes de que venza la sesión, y revisar con el dueño el [`ROADMAP.md`](ROADMAP.md) para lo que queda de R1.

## Pendientes y avisos

- **Base local de esta máquina:** el nombre de un índice de la migración `20261118200000_members_invitations` se corrigió después de aplicarla. En la base local se renombró el índice y se actualizó el checksum en `_prisma_migrations` (sin perder datos); `prisma migrate status` y `migrate diff` quedan limpios. Una base nueva no necesita nada.
- **Seed:** "Eva (deshabilitada)" tiene la **cuenta** deshabilitada y la membresía activa: en Usuarios aparece como "Cuenta deshabilitada".
- **Rol Soporte de plataforma** (SPEC §3): necesita su propio issue.
- `.claude/worktrees` tiene worktrees viejos que se pueden borrar.

- **Push de workflows:** el token de `gh` necesita el scope `workflow` para pushear `.github/workflows/ci.yml`. En esta máquina ya está habilitado (2026-11-20). En otra PC: `gh auth login -s workflow` y `gh auth setup-git`.
- **CI en GitHub:** nunca corrió en GitHub Actions. Todo se verificó en local; los tests de integración usan Testcontainers y requieren Docker.
- **pnpm 12** avisa "Agent skills awaiting approval: @tanstack/react-router" (`pnpm approve`). Es informativo; no se aprobó.
- **Prototipos:**
  - Usan datos de ejemplo, sin API, SSE ni service worker.
  - El código del repartidor y del seguimiento se revisó por capturas y tests, no línea por línea.
- **Accesibilidad:** no se corrió una auditoría automática (axe).
- El resto está en [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).
