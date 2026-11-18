# Limitaciones conocidas

Lista honesta de lo que el sistema **no** hace (o aún no). Se actualiza en cada release.

## Del MVP (por diseño)

- Sin integración específica con ZESTIA (llega en R4; contratos sin confirmar).
- Sin mapas embebidos, polígonos ni cálculo por distancia (zonas = barrios).
- Sin ubicación en vivo de repartidores.
- Sin asignación automática ni optimización de rutas.
- Notificaciones por WhatsApp solo mediante enlaces `wa.me` (envío manual), sin API.
- Liquidaciones formales (aprobación, pago) fuera del MVP; solo rendición de efectivo y saldos.
- Roles fijos; sin roles personalizados.
- 2FA opcional.
- Sin procesamiento de pagos, almacenamiento de tarjetas ni facturación electrónica.
- Sin app nativa; PWA (instalación y notificaciones push dependen del navegador/dispositivo).

## Estado actual del repositorio

- R1 en curso: monorepo (#13) y multi-tenancy con RLS (#15).
- **Sin autenticación todavía (#14):** todo endpoint de tenant responde 401 fuera de los tests. El principal de los tests se inyecta con un resolver solo de pruebas.
- El único endpoint de negocio es `GET /api/v1/merchants/:id` (lectura mínima para probar el aislamiento). El CRUD de comercios es #19. El control por rol de ese endpoint (`@TenantScoped({ roles })`) es provisorio hasta la matriz de permisos de `packages/auth`.
- `users` y `tenants` tienen RLS y la API solo puede leerlos: el alta de tenants (onboarding de plataforma), el alta de usuarios y el login por email necesitan su propio camino (#14).
- Las tablas tienen `FORCE ROW LEVEL SECURITY`, que también aplica al dueño: una migración de **datos** sobre tablas de negocio debe fijar `app.tenant_id` por tenant (o correrla un rol de mantenimiento dedicado); las migraciones de esquema no se ven afectadas.
- `pnpm test` en `apps/api` necesita Docker (Testcontainers) para los tests de integración; `pnpm --filter @zestia/api test:unit` corre solo los unitarios.
- Membresías sin `courierId`/`merchantId` todavía (llegan con repartidores y portal de comercio). Email de usuario único sensible a mayúsculas (lo define #14).
