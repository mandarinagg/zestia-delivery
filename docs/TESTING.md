# Estrategia de pruebas

| Nivel | Herramienta | Qué cubre | Cuándo corre |
|-------|-------------|-----------|--------------|
| Unit | Vitest | `packages/domain` (máquina de estados, tarifas, efectivo), utilidades | Cada push |
| Integración | Vitest + Supertest + Testcontainers (Postgres real) | Endpoints, RLS, permisos, idempotencia, outbox | Cada PR |
| Contrato | Zod/OpenAPI + tests de esquema | API genérica y webhooks | Cada PR |
| E2E | Playwright | Flujos críticos en navegador (desktop + mobile viewport) | Cada PR a `main` |
| Seguridad | gitleaks, `pnpm audit`, CodeQL | Secretos, dependencias, patrones inseguros | Cada PR |

## Cómo corren en `apps/api`

- Vitest con dos proyectos: `unit` (`*.test.ts`) e `integration` (`*.int.test.ts`). `pnpm test` corre ambos (también en CI).
- Integración: `src/testing/global-setup.ts` levanta **un** Postgres 17 con Testcontainers por corrida, crea los roles con el mismo `infra/docker/postgres/initdb/01-roles.sh` de desarrollo y aplica las migraciones como `zestia_migrator`. La API y los tests de RLS se conectan como `zestia_app` (sin `BYPASSRLS`); el superusuario solo siembra datos (`TestSeeder`). Claves aleatorias por corrida.
- Principal de prueba: `createTestApp()` reemplaza `PRINCIPAL_RESOLVER` por `TestPrincipalResolver` (cabecera `x-test-principal: <userId>[:<activeTenantId>]`). Vive en `src/testing/`, fuera del build.
- Aislamiento por endpoint: `expectTenantIsolation({ app, seeder, seed, request })` (`src/testing/expect-tenant-isolation.ts`).

## Suites obligatorias (MVP)

1. **Aislamiento de tenants:** helper que, para cada endpoint, crea datos en tenant A y verifica que tenant B recibe 404/403 (incluso manipulando ids). Además, tests de RLS a nivel DB (`modules/tenancy/rls.int.test.ts`) y de Prisma (`prisma-rls.int.test.ts`), y un test que exige `@TenantScoped()`/`@TenantExempt()` en cada ruta.
2. **Permisos:** matriz rol × endpoint generada desde `packages/auth`.
3. **Máquina de estados:** todas las transiciones válidas pasan; todas las inválidas → 409 (test exhaustivo por tabla).
4. **Idempotencia:** misma key ×10 → 1 pedido; key reutilizada con otro cuerpo → 422; concurrencia → 1 pedido.
5. **Offline PWA:** cambios en cola se sincronizan en orden; conflicto por reasignación se informa.
6. **Webhooks:** firma válida; reintentos con backoff; paso a DEAD; reprocesamiento.
7. **Efectivo:** esperado vs. rendido, diferencias.

## E2E críticos

- Alta de pedido manual → asignar → repartidor acepta → retira → entrega con cobro → rendición.
- Pedido por API → no entregado → reprogramado → entregado.
- Cancelación post-retiro → devolución.

## Umbrales

Cobertura ≥ 80% en `orders`, `dispatch`, `auth`, `cash`, `packages/domain`. CI bloquea merge si fallan tests, lint o typecheck.
