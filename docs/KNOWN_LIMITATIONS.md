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

- R1 en curso: monorepo (#13), multi-tenancy con RLS (#15) y autenticación con sesiones de servidor (#14).
- **Autenticación (#14), solo backend:** la UI de login, selector de empresa y reset es #20. Sin CORS: el frontend tiene que servirse del mismo sitio que la API (en desarrollo, proxy de Vite; todavía no configurado).
- Sin 2FA (TOTP), sin verificación de email, sin alta/invitación de usuarios ni alta de tenants (onboarding): por ahora los usuarios solo se crean con `pnpm db:seed` (desarrollo).
- Sin listado/cierre de "mis sesiones" ni revocación de sesiones por un admin. Las sesiones vencidas o revocadas quedan en `sessions` (no hay job de limpieza todavía; no afectan la seguridad).
- Al deshabilitar un usuario (`status = DISABLED`) sus sesiones dejan de validar en la próxima request, pero no hay un endpoint de administración para hacerlo.
- El rate limit de login no bloquea la cuenta (solo frena por ventana): no hay "bloqueo hasta que un admin la desbloquee" ni CAPTCHA. El límite por IP depende de configurar bien `TRUST_PROXY_HOPS` detrás de un proxy.
- El email de reset se envía "fire and forget": si el SMTP falla se registra un error en el log (sin destinatario) pero la respuesta al usuario es la misma; no hay reintentos ni outbox de emails.
- Auditoría mínima (`audit_logs`): solo eventos de autenticación, sin `before`/`after`, sin endpoint de consulta ni política de retención (#17).
- Los errores de la API usan `{ statusCode, code }`, todavía no el formato RFC 9457 de `API_CONTRACTS.md`.
- El único endpoint de negocio es `GET /api/v1/merchants/:id` (lectura mínima para probar el aislamiento). El CRUD de comercios es #19.
- `users` y `tenants` tienen RLS y la API solo puede leerlos: el alta de tenants (onboarding de plataforma) y el alta de usuarios necesitan su propio camino. El login por email usa funciones `SECURITY DEFINER` acotadas (#14).
- Las tablas tienen `FORCE ROW LEVEL SECURITY`, que también aplica al dueño: una migración de **datos** sobre tablas de negocio debe fijar `app.tenant_id` por tenant (o correrla un rol de mantenimiento dedicado); las migraciones de esquema no se ven afectadas.
- `pnpm test` en `apps/api` necesita Docker (Testcontainers) para los tests de integración; `pnpm --filter @zestia/api test:unit` corre solo los unitarios.
- Permisos (#16): solo los de R1. Repartidor y Comercio no tienen ningún permiso hasta R2. Finanzas (R5) y Soporte de plataforma (acceso temporal de solo lectura, SPEC §3) no existen todavía como roles: Soporte necesita su propio issue.
- Membresías sin `courierId`/`merchantId` todavía (llegan con repartidores y portal de comercio). El email de usuario se guarda normalizado (minúsculas, sin espacios; lo exige un `CHECK`), así que es único sin distinguir mayúsculas.
