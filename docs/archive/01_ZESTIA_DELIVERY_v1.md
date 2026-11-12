# ZESTIA DELIVERY

## Especificación maestra de producto y desarrollo

**Producto:** Plataforma web de gestión integral para empresas de
delivery, independiente y conectable con ZESTIA.\
**Mercado inicial:** Paraguay.\
**Enfoque:** SaaS multiempresa, operación en tiempo real y API
desacoplada.

## 1. Visión

Crear un sistema para administrar empresas de delivery, comercios
asociados, pedidos, repartidores, despacho, zonas, tarifas, seguimiento,
incidencias, liquidaciones e indicadores. Debe funcionar en dos
modalidades:

-   **Independiente:** una empresa de delivery opera sin utilizar
    ZESTIA.
-   **Integrada:** una tienda ZESTIA envía pedidos y recibe
    actualizaciones de entrega mediante una API segura.

No debe ser únicamente un tablero de pedidos: debe ser el centro de
control operativo de la empresa de delivery.

## 2. Principios

-   Multi-tenancy con aislamiento estricto de datos.
-   RBAC y permisos validados en backend.
-   API versionada y webhooks autenticados.
-   Idempotencia para evitar pedidos duplicados.
-   Auditoría de acciones críticas.
-   Estados de pedido controlados por máquina de estados.
-   Responsive para escritorio, tablet y móvil.
-   No conectar directamente las bases de datos de ZESTIA y Delivery.
-   No inventar endpoints, contratos ni funcionalidades de ZESTIA.
-   Empezar con un monolito modular; no introducir microservicios sin
    justificación.
-   No guardar secretos en frontend, logs o repositorio.

## 3. Usuarios y roles

  Rol                      Responsabilidad
  ------------------------ ---------------------------------------------
  Propietario              Configuración y control total de su empresa
  Administrador            Gestión operativa y usuarios
  Operador / Despachador   Recepción, asignación y seguimiento
  Supervisor               Control de operación e incidencias
  Repartidor               Consultar y actualizar entregas asignadas
  Comercio asociado        Consultar sus pedidos y estados permitidos
  Finanzas                 Liquidaciones e informes
  Soporte de plataforma    Acceso temporal, justificado y auditado

Cada petición debe validar identidad, tenant, rol y permiso en el
servidor. Nunca confiar en el `tenantId` o rol enviado por el cliente.

## 4. Módulos

### 4.1 Dashboard operativo

-   Pedidos por estado.
-   Repartidores disponibles, ocupados y desconectados.
-   Pedidos demorados.
-   Indicadores del día.
-   Actividad reciente.
-   Filtros por sucursal, comercio, zona, repartidor y fecha.

### 4.2 Comercios y sucursales

-   Alta, edición, suspensión y archivo.
-   Datos comerciales y contactos operativos.
-   Sucursales, puntos de retiro y horarios.
-   Zonas atendidas y tarifas acordadas.
-   Configuración de integración.
-   Historial de pedidos e incidencias.

### 4.3 Pedidos

Guardar identificadores internos y externos, origen, comercio, sucursal,
datos mínimos del destinatario, dirección, referencias, coordenadas
autorizadas, descripción del paquete, importes, método de cobro, tarifa,
observaciones, marcas de tiempo e historial.

Estados sugeridos (validar con usuarios): `RECIBIDO`,
`PENDIENTE_ASIGNACION`, `ASIGNADO`, `ACEPTADO`, `EN_RETIRO`, `RETIRADO`,
`EN_CAMINO`, `ENTREGADO`, `NO_ENTREGADO`, `CANCELADO`, `EN_REVISION`.

Implementar transiciones permitidas en backend. Funciones: ingreso
manual/API, búsqueda, asignación y reasignación, retiro, entrega,
evidencia opcional, incidencias, cancelación autorizada e historial.

### 4.4 Despacho

-   Cola de pedidos pendientes.
-   Vista de despacho por estados.
-   Asignación y reasignación manual.
-   Disponibilidad y carga de repartidores.
-   Aceptación/rechazo de asignación.
-   Motivo obligatorio al reasignar cuando corresponda.
-   Alertas por demora.
-   Sugerencias automáticas como fase posterior.

No automatizar asignaciones complejas antes de disponer de datos
operativos fiables.

### 4.5 Repartidores

-   Alta, suspensión y datos de contacto.
-   Tipo de vehículo/capacidad si aplica.
-   Zonas y horarios habilitados.
-   Disponibilidad.
-   Pedidos actuales e historial.
-   Métricas.
-   Portal móvil responsive o PWA.
-   Acceso limitado a los pedidos propios y datos mínimos del
    destinatario.

La ubicación en vivo es opcional y requiere consentimiento, permisos del
dispositivo y disponibilidad real. Nunca simular ubicación.

### 4.6 Zonas y tarifas

-   Zonas por polígono o sector.
-   Tarifas fijas o por zona.
-   Reglas configurables y vigencia.
-   Recargos autorizados.
-   Promociones o envío gratis si la empresa lo configura.
-   Simulador de tarifa.
-   Historial de cambios.

Encapsular el proveedor de mapas detrás de una interfaz intercambiable.

### 4.7 Seguimiento

-   Seguimiento desde el panel.
-   Historial de eventos.
-   Vista para comercio/destinatario opcional.
-   Enlaces con token limitado y vencimiento.
-   No exponer datos internos.

### 4.8 Incidencias

Categorías configurables: destinatario ausente, dirección incorrecta,
comercio cerrado, rechazo, imposibilidad de contacto, reprogramación,
devolución u otras. Registrar responsable, descripción, fecha, evidencia
opcional y resolución.

### 4.9 Liquidaciones

-   Tarifas por entrega.
-   Comisiones si están configuradas.
-   Cobros al destinatario.
-   Montos a liquidar al comercio.
-   Liquidaciones a repartidores.
-   Ajustes autorizados.
-   Estados pendiente, calculado, aprobado, pagado u observado.
-   Exportación de reportes.

La primera versión puede registrar liquidaciones manuales. No asumir
procesamiento bancario ni almacenar tarjetas.

### 4.10 Informes

Pedidos por período, entregas exitosas/no completadas, tiempos por
etapa, pedidos por comercio/zona/repartidor, incidencias, liquidaciones
y exportación CSV. Documentar fórmulas y no presentar estimaciones como
datos reales.

### 4.11 Notificaciones

Capa desacoplada para panel, correo, WhatsApp mediante proveedor
configurado y push si se implementa PWA. Registrar fallos y reintentos;
evitar duplicados.

## 5. Integración con ZESTIA

### 5.1 Arquitectura

`ZESTIA <-> API Gateway de integración <-> ZESTIA DELIVERY`

No compartir bases de datos, credenciales internas ni dependencias de
tablas o procedimientos.

### 5.2 Flujo conceptual

1.  Comprador genera pedido en tienda ZESTIA.
2.  ZESTIA determina si corresponde delivery externo.
3.  ZESTIA envía evento/solicitud al gateway.
4.  Gateway autentica, valida tenant, esquema e idempotencia.
5.  Delivery registra pedido y responde con identificador.
6.  Operador asigna repartidor y actualiza estados.
7.  Delivery emite eventos firmados.
8.  Gateway valida y comunica estados a ZESTIA.
9.  ZESTIA actualiza la vista del comercio y, cuando corresponda, del
    comprador.

### 5.3 Endpoints conceptuales

Son propuestas, no APIs existentes confirmadas:

-   `POST /api/v1/integrations/zestia/orders`
-   `GET /api/v1/integrations/zestia/orders/{externalOrderId}`
-   `POST /api/v1/integrations/zestia/orders/{externalOrderId}/cancel`
-   `POST /api/v1/webhooks/zestia-delivery/order-events`
-   `GET /api/v1/integrations/zestia/health`

Evento sugerido: `eventId`, `eventType`, `schemaVersion`,
`tenantExternalId`, `storeExternalId`, `orderExternalId`, `occurredAt`,
`correlationId`, `payload`.

### 5.4 Seguridad y resiliencia

-   TLS.
-   Credenciales por integración/tenant.
-   Firma HMAC o mecanismo equivalente.
-   Rotación y revocación de secretos.
-   Timestamp y protección anti-replay.
-   Rate limiting.
-   `Idempotency-Key`.
-   Validación de esquema.
-   Logs sin secretos ni datos personales innecesarios.
-   Reintentos con backoff y dead-letter queue.
-   Panel de estado y reprocesamiento autorizado.
-   Correlación de logs y versionado de contrato.

### 5.5 Decisiones pendientes

Antes de integrar, inspeccionar ZESTIA y confirmar: API disponible,
estados reales, datos compartibles, cálculo de tarifa, cancelaciones,
cobro contra entrega, eventos de retorno, desconexiones y posibilidad de
múltiples operadores de delivery por tienda. No asumir respuestas.

## 6. Arquitectura técnica propuesta

Decidir tras auditar el repositorio. Base sugerida: - Frontend React +
TypeScript. - Backend Node.js + TypeScript, REST versionada. -
PostgreSQL. - ORM seleccionado según el repositorio. - WebSocket/SSE
para tiempo real si hace falta. - Redis/worker para colas cuando se
justifique. - Docker para desarrollo y despliegue. - Tests unitarios,
integración y E2E.

## 7. Modelo de datos conceptual

`Tenant`, `User`, `Role`, `Permission`, `Branch`, `Merchant`,
`MerchantBranch`, `Courier`, `CourierAvailability`, `DeliveryZone`,
`DeliveryRate`, `DeliveryOrder`, `DeliveryOrderItem`,
`OrderStatusHistory`, `Assignment`, `Incident`, `ProofOfDelivery`,
`Settlement`, `SettlementLine`, `Integration`, `WebhookEvent`,
`Notification`, `AuditLog`.

Todas las entidades de negocio deben aplicar aislamiento por tenant,
índices, restricciones y borrado lógico cuando corresponda.

## 8. UX/UI

Panel moderno y operativo. Priorizar lectura rápida, pedidos, despacho y
acciones frecuentes. Diseñar tabla densa pero legible, tablero por
estados, filtros, estados vacíos, errores, carga y desconexión. Mapa
opcional, no obligatorio. Responsive para repartidores. Accesibilidad y
movimiento reducido.

## 9. Seguridad y privacidad

Aislamiento tenant en servidor, RBAC, principio de mínimo privilegio,
2FA según política, cifrado en tránsito, auditoría, retención
configurable, minimización de datos, enlaces con tokens limitados,
protección frente a vulnerabilidades web, backups y pruebas de
restauración. Nunca registrar secretos.

## 10. Roadmap

**Fase 0 --- Descubrimiento:** auditar repositorio, stack, actores,
permisos, contratos y riesgos.\
**Fase 1 --- Fundaciones:** autenticación, multi-tenancy, roles,
comercios, sucursales y auditoría.\
**Fase 2 --- Operación:** pedidos, estados, despacho, repartidores e
incidencias.\
**Fase 3 --- Entrega:** zonas, tarifas, portal móvil, seguimiento y
notificaciones.\
**Fase 4 --- ZESTIA:** API, gateway, webhooks, idempotencia, reintentos
y pruebas E2E.\
**Fase 5 --- Finanzas:** liquidaciones e informes.\
**Fase 6 --- Automatización:** sugerencias de asignación y reglas
avanzadas.

## 11. Criterios de aceptación del MVP

-   Dos empresas operan aisladas.
-   Administrador crea comercios, repartidores y zonas.
-   Pedidos ingresan manualmente y por API.
-   Operador asigna repartidor.
-   Repartidor ve solo sus pedidos y actualiza estados permitidos.
-   Cambios auditados.
-   Reintentos no duplican pedidos.
-   Errores de integración son visibles y recuperables.
-   Permisos validados en backend.
-   Tests cubren flujos críticos.
-   Instalación, configuración y operación documentadas.

## 12. Prompt maestro para Claude Code

Actuá como arquitecto de software, product manager técnico y
desarrollador senior responsable de ZESTIA DELIVERY.

Leé este documento completo. Tu primera tarea NO es programar.

1.  Inspeccioná el repositorio y su stack. Si no existe, proponé
    estructura inicial.
2.  Identificá convenciones, dependencias y estado actual.
3.  Proponé arquitectura y alcance de MVP.
4.  Definí modelo de datos, roles y flujos.
5.  Diseñá la integración con ZESTIA separando lo conocido de lo
    pendiente.
6.  Identificá riesgos de seguridad y privacidad.
7.  Definí pruebas y roadmap.
8.  Presentá diagnóstico y plan para aprobación.

No inventes APIs ni detalles de ZESTIA. No sobrescribas código
existente. No implementes antes de mi aprobación. Trabajá por etapas
pequeñas, con tests y documentación.

## 13. Documentación que debe mantenerse

-   `README.md`
-   `docs/PRODUCT_OVERVIEW.md`
-   `docs/ARCHITECTURE.md`
-   `docs/DATA_MODEL.md`
-   `docs/API_CONTRACTS.md`
-   `docs/ZESTIA_INTEGRATION.md`
-   `docs/SECURITY.md`
-   `docs/ROADMAP.md`
-   `docs/DECISIONS.md`
-   `docs/TESTING.md`
-   `docs/DEPLOYMENT.md`
-   `docs/KNOWN_LIMITATIONS.md`

**Regla final:** debe funcionar independientemente y conectarse con
ZESTIA mediante contratos seguros, versionados y desacoplados.
