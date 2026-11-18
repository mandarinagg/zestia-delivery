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
- **Autenticación en la web:** ingreso, selector de empresa, cambio de empresa, cierre de sesión, olvidé y restablecer contraseña conectados a la API. Todavía no hay:
  - pantalla de cambio de contraseña;
  - "mis sesiones";
  - un aviso antes de que venza la sesión por inactividad (al vencer, el próximo pedido manda al ingreso).
- Sin CORS: la web y la API se sirven desde el mismo origen. En desarrollo lo resuelve el proxy de Vite; en producción tiene que hacerlo el proxy inverso.
- Sin 2FA (TOTP) ni alta de tenants (onboarding). Los usuarios se crean aceptando una invitación (#18) o con `pnpm db:seed` (desarrollo). Aceptar la invitación hace las veces de verificación del email.
- Sin listado/cierre de "mis sesiones" ni revocación de sesiones por un admin. Las sesiones vencidas o revocadas quedan en `sessions` (no hay job de limpieza todavía; no afectan la seguridad).
- Al deshabilitar un usuario (`status = DISABLED`) sus sesiones dejan de validar en la próxima request, pero no hay un endpoint de administración para hacerlo.
- El rate limit de login no bloquea la cuenta (solo frena por ventana): no hay "bloqueo hasta que un admin la desbloquee" ni CAPTCHA. El límite por IP depende de configurar bien `TRUST_PROXY_HOPS` detrás de un proxy.
- El email de reset se envía "fire and forget": si el SMTP falla se registra un error en el log (sin destinatario) pero la respuesta al usuario es la misma; no hay reintentos ni outbox de emails.
- Auditoría (#17):
  - La usan los comercios y sucursales (#19) y la gestión de usuarios (#18).
  - Sin política de retención ni purga (depende de la consulta legal, #11). No se guarda la IP.
  - Los intentos denegados por permiso (403) no se auditan.
  - La vista web de la auditoría todavía no está (la API sí).
- Los errores de la API usan `{ statusCode, code }`, todavía no el formato RFC 9457 de `API_CONTRACTS.md`.
- Comercios y sucursales (#19):
  - El RUC se valida solo por formato (`80012345-6`), no el dígito verificador.
  - Las sucursales no tienen coordenadas (`lat`/`lng`): llegan con zonas y geocodificación. Nunca se inventan.
  - Sin control de concurrencia optimista: si dos personas editan el mismo comercio a la vez, gana el último guardado (las transiciones de estado sí se serializan con `SELECT … FOR UPDATE`).
  - Archivar es final: no hay "desarchivar". Archivar un comercio no archiva sus sucursales (dejan de poder editarse).
  - La web edita hasta 3 franjas por día, igual que la API; no hay feriados ni excepciones por fecha.
  - Los comercios suspendidos todavía no bloquean nada: el bloqueo de pedidos llega con los pedidos (R2).
- Usuarios e invitaciones (#18):
  - Solo se asignan Propietario, Admin, Operador y Supervisor; Repartidor y Comercio llegan en R2.
  - La lista de invitaciones abiertas no pagina (hasta 200).
  - Sin outbox de emails: si el SMTP falla al invitar o reenviar, se responde `502` y no se guarda nada; hay que reintentar a mano.
  - Deshabilitar una membresía no corta la sesión abierta en ese momento: la corta la próxima request (que da `403`). La cuenta global (`users.status`) solo la cambia la plataforma; no hay pantalla para eso.
  - Las invitaciones vencidas no se borran: quedan como historial (se ven hasta que se reenvían o revocan).
  - La web todavía no tiene la pestaña de datos de la empresa en Configuración; solo Usuarios.
- `users` y `tenants` tienen RLS y la API solo puede leerlos: el alta de tenants (onboarding de plataforma) y el alta de usuarios necesitan su propio camino. El login por email usa funciones `SECURITY DEFINER` acotadas (#14).
- Las tablas tienen `FORCE ROW LEVEL SECURITY`, que también aplica al dueño: una migración de **datos** sobre tablas de negocio debe fijar `app.tenant_id` por tenant (o correrla un rol de mantenimiento dedicado); las migraciones de esquema no se ven afectadas.
- `pnpm test` en `apps/api` necesita Docker (Testcontainers) para los tests de integración; `pnpm --filter @zestia/api test:unit` corre solo los unitarios.
- Permisos (#16): solo los de R1. Repartidor y Comercio no tienen ningún permiso hasta R2. Finanzas (R5) y Soporte de plataforma (acceso temporal de solo lectura, SPEC §3) no existen todavía como roles: Soporte necesita su propio issue.
- Membresías sin `courierId`/`merchantId` todavía (llegan con repartidores y portal de comercio). El email de usuario se guarda normalizado (minúsculas, sin espacios; lo exige un `CHECK`), así que es único sin distinguir mayúsculas.
