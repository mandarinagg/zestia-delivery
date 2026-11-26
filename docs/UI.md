# UI — sistema "Riel" (`apps/web`)

Guía del sistema de diseño de ZESTIA DELIVERY: identidad, tokens, movimiento, componentes,
patrones y accesibilidad. La referencia viva está en **`/panel/ui`**: todo lo que se describe acá
se ve y se prueba ahí, con datos de ejemplo.

## Cómo verlo en local

```bash
pnpm install
pnpm infra:up && pnpm db:migrate && pnpm db:seed   # Postgres + Mailpit y datos de ejemplo
pnpm dev                                           # API :3000 · web http://localhost:5173
```

El panel exige iniciar sesión (usuarios del seed, contraseña `SEED_USER_PASSWORD`). Vite reenvía `/api` a la API (`API_PROXY_TARGET` en `apps/web/.env`): web y API comparten origen, sin CORS. Si el 5173 está ocupado, cambiá el puerto y agregalo a `APP_ORIGINS` de la API (si no, el control CSRF por `Origin` rechaza las mutaciones).

| Ruta | Qué es |
| --- | --- |
| `/panel/ui` | Guía viva: principios, color, tipografía, estados, movimiento, componentes, tabla, formularios, vacíos, conexión. Enlaza a los prototipos. |
| `/panel/prototipo/despacho` | **Prototipo.** Tablero de despacho en vivo. |
| `/panel/prototipo/pedido/DEMO-1043` | **Prototipo.** Detalle de pedido. |
| `/prototipo/repartidor` | **Prototipo.** App del repartidor (PWA, mobile-first). |
| `/prototipo/seguimiento` | **Prototipo.** Seguimiento público que ve el cliente final. |
| `/ingreso`, `/ingreso/empresa` | **Real.** Ingreso y selector de empresa (API `/auth`). |
| `/olvide-contrasena`, `/restablecer-contrasena#token=…` | **Real.** Pedir el enlace y crear contraseña nueva (el enlace llega por email; en local, a Mailpit). |
| `/panel/*`, `/comercio`, `/repartidor` | Rutas reales **con sesión**: sin sesión van a `/ingreso`; cada rol va a su área. Las secciones son placeholders que enlazan a su prototipo. El aviso de vencimiento de sesión vive solo en `/panel/*`. |
| `/t/:token` | Seguimiento público (placeholder). |

### Sesión en la web

- `src/lib/api.ts`: cliente HTTP (`/api/v1`, `credentials: 'same-origin'`). Manda `X-CSRF-Token` en toda mutación; el token vive en memoria y se renueva con cada respuesta de sesión. Errores como `ApiError { status, code }` o `NetworkError`.
- `src/lib/session.ts`: `GET /auth/me` en React Query (`['session']`), `useSession()`, `useCan(permiso)` (matriz de `@zestia/auth`; solo para mostrar u ocultar) y `homeFor(rol)`.
- Las rutas protegidas verifican la sesión en `beforeLoad` (`router.tsx`). Un 401 de cualquier llamada limpia la sesión y vuelve a `/ingreso?redirect=…`. `safeRedirect()` solo acepta rutas internas.
- La navegación esconde lo que el rol no puede usar (`permission` en `nav.ts`).
- **Cambiar contraseña** (menú de usuario del panel, `ChangePasswordDialog`): pide la actual y la nueva dos veces, con los mismos requisitos en vivo que el restablecimiento, más "Distinta de la actual" (solo lo pide la web). La API cierra las demás sesiones y **rota esta**: la respuesta trae un `csrfToken` nuevo que se guarda en la sesión; sin eso, la siguiente acción daría `403 CSRF_TOKEN_INVALID`. Actual incorrecta: error en el campo, con foco. Demasiados intentos: cuánto esperar. Sesión vencida: vuelve al ingreso.
- **Aviso de vencimiento de sesión** (`SessionExpiryNotice`, montado solo en `PanelLayout`):
  - **De dónde sale el tiempo:** `api.ts` lee `X-Session-Idle-Remaining` y `X-Session-Absolute-Remaining` (segundos) de cada respuesta OK y `lib/session-clock.ts` los convierte a instantes de *este* reloj. Se comparten entre pestañas con `localStorage` + evento `storage`, y siempre vale el vencimiento **más tardío** (otra pestaña activa renueva la misma sesión). Logout, `401` y un login nuevo lo borran.
  - **Por inactividad:** 2 minutos antes (`SESSION_WARNING_MS`) aparece un `alertdialog` "Tu sesión va a cerrarse por inactividad" con cuenta regresiva `mm:ss`, "Seguir conectado" (`GET /auth/me`: renueva y trae los headers nuevos) y "Cerrar sesión" (el logout de siempre). El foco arranca en "Seguir conectado"; no se cierra con Escape ni clic afuera (hay que elegir). Si otra pestaña renueva, se cierra solo.
  - **Por tiempo máximo:** si el absoluto es el que llega primero, el aviso no tiene botón para extender: "Tu sesión termina a las HH:MM. Guardá tus cambios y volvé a ingresar", solo "Entendido" (hora en `America/Asuncion` hasta que la sesión traiga la zona del tenant).
  - **Al llegar a cero:** no se confía en el reloj local: se pregunta al servidor con `GET /auth/session-status`, que **no renueva** (con `/auth/me` el chequeo mismo alargaría la sesión y un panel abandonado viviría hasta el absoluto). `401` → limpia la sesión y va a `/ingreso?reason=idle|absolute`, que muestra "Tu sesión se cerró por inactividad" (o "llegó a su duración máxima"); `200` con un vencimiento más tardío (más de 5 s) → otra pestaña renovó, el aviso se cierra; `200` que no lo mueve (quedaban fracciones) → vuelve a preguntar a *restante + 2 s*, también si el aviso del tiempo máximo ya se había descartado. Nunca hay polling. "Seguir conectado" es lo único que renueva (`GET /auth/me`).
  - **Generación de sesión:** `session-clock` guarda un contador (compartido entre pestañas) que sube con cada logout, `401` o login. Cada pedido anota la generación al salir; si cambió cuando vuelve la respuesta, no toca los vencimientos (una respuesta lenta no revive el aviso después de cerrar sesión). Los headers se registran en toda respuesta de una sesión válida, también un `403` o `404`, salvo `401`.
  - **Accesibilidad:** la cuenta regresiva es un `role="timer"` con `aria-live="off"` (no se anuncia cada segundo); el aviso se lee una vez, al abrir el diálogo, por su descripción, que dice el tiempo en palabras ("en menos de 2 minutos") para quien no ve el contador. El motivo en `/ingreso` es un `FormNotice` (`role="status"`) que toma el foco al montar, como `FormAlert`, para que se anuncie. Sin animaciones propias; la entrada del diálogo respeta `prefers-reduced-motion` desde el CSS global.
  - **Timers:** un solo `setTimeout` reprogramado cuando cambian los vencimientos, y un intervalo de 1 s solo con el diálogo a la vista.
- Tests: `src/test/fake-api.ts` emula `/api/v1/auth` con el mismo contrato (CSRF incluido), y lleva el reloj de la sesión como el servidor: vence, la actividad renueva, `session-status` no, y los headers de tiempo restante salen redondeados hacia arriba (`fakeApi.setSessionTimes({ idle, absolute })`, `renewElsewhere()`, `expiryGraceMs` para simular fracciones de segundo). `test-setup.ts` arranca cada test con una sesión de Propietario. Los tests del aviso usan `vi.useFakeTimers({ shouldAdvanceTime: true })` (con el reloj parado `findBy…` no avanza).

Los prototipos usan datos **obviamente falsos** (`DEMO-1043`, "Lomitería Demo", "Envíos Ejemplo
S.A."), llevan el rótulo **Prototipo** arriba (`PrototypeBanner`, `role="note"`) y no llaman a la
API. Sirven para validar flujo y sensación con usuarios antes de conectar el backend.

Comandos de calidad (todos deben pasar):

```bash
pnpm --filter @zestia/web test        # Vitest + Testing Library (jsdom)
pnpm --filter @zestia/web contrast    # WCAG 2.2 AA de todos los pares de tokens; falla si alguno baja
pnpm lint && pnpm typecheck && pnpm format:check
pnpm --filter @zestia/web build
```

## Principios

1. **El estado del pedido es la interfaz.** Cada pantalla responde primero "¿dónde está y qué
   falta?". El riel de 8 tramos y el color por fase se leen antes que cualquier texto.
2. **Lo que espera, primero.** Orden FIFO, edad en minutos siempre visible, demoras en ámbar e
   incidencias en rojo como *señales superpuestas*, no como estados nuevos.
3. **Calma operativa.** Un despachador mira esto 8 horas: fondo frío y quieto, sin parpadeos,
   el color se reserva para lo que pide acción. Lo nuevo se marca con un rastro que se apaga solo.
4. **Teclado y pulgar.** El panel se maneja entero con teclado (`Ctrl K`, flechas, `A`, `X`); el
   repartidor, con el pulgar (acciones abajo, objetivos de 44 px o más, 56 px para la principal).
5. **Nunca solo color.** Cada estado tiene etiqueta, forma (glifo) y posición en el riel.
6. **Decir qué hacer.** Errores y vacíos explican el siguiente paso, en "vos" y con verbos claros.

## Identidad

- **Tinta** (`#14173a`): texto, botón primario y barra lateral (tinta en ambos temas). Da peso
  y orden sin el negro puro.
- **Lapacho** (`#c0177a` claro, `#ff86c2` oscuro): la flor del árbol nacional de Paraguay. Es la
  marca, el foco de teclado y la señal de "esto es nuevo". No se usa para estados del pedido.
- **Tipografía:** *Atkinson Hyperlegible Next* (lectura; diseñada para baja visión, distingue
  `Il1`, `O0`) y *Barlow Semi Condensed* (señalética: títulos, códigos de pedido, cifras con
  `tnum`). Autohospedadas con `@fontsource`; nada se carga de terceros.
- **Logo** (`LogoMark`): una Z dibujada como recorrido, con punto de retiro lleno y anillo de
  destino. `Wordmark`: "ZESTIA" + "Delivery".

## Tokens

Viven en `src/index.css` como variables CSS en `:root` (claro) y `.dark` (oscuro), solo en
`#rrggbb` porque el script de contraste las lee de ahí. Tailwind las expone con `@theme inline`
(`bg-card`, `text-muted-foreground`, `bg-tone-violet-bg`…).

### Superficies y texto

| Token | Uso |
| --- | --- |
| `background` / `foreground` | Fondo de página y texto principal |
| `card`, `raised` | Tarjetas y paneles; capas flotantes |
| `muted` / `muted-foreground` | Fondos secundarios; texto secundario (>= 4.5:1 en las 4 superficies) |
| `subtle`, `accent` | Encabezados de tabla, hover, selección |
| `border` | Bordes decorativos |
| `input` | Borde de controles (>= 3:1, WCAG 1.4.11) |
| `ring` | Foco (lapacho, >= 3:1) |
| `primary`, `destructive` | Acción principal (tinta) y destructiva |
| `brand`, `brand-soft`, `brand-ink` | Lapacho: marca, fondo suave, texto de marca |
| `sidebar*` | Barra lateral de tinta, con su propio `sidebar-ring` |

### Tonos de estado

Ocho familias, cada una con `bg` (fondo de etiqueta), `fg` (texto) y `solid` (punto, riel,
borde). `src/components/ui/tone.ts` las mapea a clases estáticas (Tailwind no ve clases armadas
con plantillas).

**Pedido** (`src/lib/order-states.ts`, igual que [`ORDER_STATE_MACHINE.md`](ORDER_STATE_MACHINE.md)):

| Estado | Etiqueta | Tono | Fase |
| --- | --- | --- | --- |
| `RECIBIDO` | Recibido | slate | entrada |
| `PENDIENTE_ASIGNACION` | Pendiente de asignación | slate | entrada |
| `ASIGNADO`, `ACEPTADO` | Asignado, Aceptado | blue | asignación |
| `EN_RETIRO`, `RETIRADO` | En retiro, Retirado | teal | retiro |
| `EN_CAMINO` | En camino | violet | ruta |
| `ENTREGADO` | Entregado | green | final |
| `NO_ENTREGADO` | No entregado | red | desvío |
| `EN_DEVOLUCION`, `DEVUELTO` | En devolución, Devuelto | earth | desvío |
| `CANCELADO` | Cancelado (tachado) | slate | final |

**Efectivo:** `NO_APLICA` Sin cobro (slate) · `PENDIENTE` Por cobrar (amber) · `COBRADO` Cobrado
(blue) · `RENDIDO` Rendido (green) · `LIQUIDADO` Liquidado (teal). Se muestra con contorno y la
marca "Gs" para no confundirse con el estado del pedido.

**Señales superpuestas** (no son estados): demora = ámbar (borde izquierdo + insignia de
minutos), incidencia abierta = bandera roja, llegada nueva = rastro lapacho que se apaga en 4 s.

**Glifo** (`StatusGlyph`): un anillo que se llena con el paso del camino feliz; los desvíos
tienen forma propia (cruz, flecha de vuelta, barra). Permite leer el estado sin color.

### Forma, elevación y densidad

- **Radios con jerarquía:** `xs` 3 px (etiquetas) < `sm` 5 px (controles) < `md` 7 px <
  `lg` 10 px (tarjetas) < `xl` 14 px (capas).
- **Elevación:** solo lo que flota tiene sombra (`shadow-raised` en botones y tarjetas
  elevadas, `shadow-overlay` en menús, cajones, diálogos y avisos). El resto se separa con borde.
- **Densidad:** `data-density="compact"` en `<html>` (menú de usuario → Densidad). Cambia
  `--row-h` (40 → 32 px) y `--card-pad`. Se guarda en `localStorage` (`zestia.density`). En
  pantallas táctiles los controles igual crecen a 44 px.

## Contraste

`apps/web/scripts/contrast.mjs` lee los bloques `:root` y `.dark` de `index.css` y verifica
**75 pares por tema (150 en total)**: texto sobre las cuatro superficies, marca, controles,
foco, barra lateral y, por cada tono, `fg/bg`, `fg/card`, `solid/bg`, `solid/card`,
`solid/background`. Texto >= 4.5:1; indicadores, bordes de control y foco >= 3:1. Falla si falta
un token o si un par baja del mínimo, así que corre en CI como cualquier test.

Resultado actual: **150/150 OK. Mínimo claro 3.56:1, mínimo oscuro 4.35:1** (ambos son
indicadores, con mínimo 3:1; todo texto supera 4.5:1).

## Movimiento

El movimiento explica **qué cambió y adónde fue**; nunca decora. Sin librería: View
Transitions API para mover tarjetas entre columnas y keyframes CSS sobre `data-state` de Radix
para el resto.

| Duración | Valor | Uso |
| --- | --- | --- |
| `--dur-instant` | 90 ms | Salida de popovers |
| `--dur-fast` | 140 ms | Hover, salida de capas, avisos que se van |
| `--dur-base` | 220 ms | Entrada de diálogos, avisos, banners |
| `--dur-slow` | 320 ms | Cajones laterales y hoja inferior |
| `--dur-move` | 420 ms | Tarjeta que cambia de columna (View Transition) |
| `--dur-trace` | 4 s | Rastro de llegada |

| Curva | Uso |
| --- | --- |
| `--ease-out` `cubic-bezier(.16,1,.3,1)` | Entradas: llegan rápido y frenan |
| `--ease-in` `cubic-bezier(.5,0,.75,0)` | Salidas: arrancan suave y se van |
| `--ease-standard` `cubic-bezier(.3,0,.2,1)` | Cambios en el lugar |
| `--ease-move` `cubic-bezier(.25,.9,.3,1.04)` | Movimiento entre columnas, con un asentamiento mínimo |

Catálogo:

- **Llegada** (`animate-trace`): la tarjeta nueva baja 6 px con fundido y queda un borde lapacho
  que se apaga en 4 s. Sin parpadeo ni sonido; el lector de pantalla recibe un aviso cortés.
- **Cambio de columna:** `withViewTransition()` (`src/lib/motion.ts`) envuelve la actualización
  con `document.startViewTransition` + `flushSync`. `view-transition-name` se pone **solo** en
  las tarjetas que se mueven (evita recortes y saltos en el resto).
- **Asentamiento** (`animate-settle`): destello de fondo de 1.2 s cuando cambia un valor en el
  lugar (carga de un repartidor, monto).
- **Capas:** `zd-overlay`, `zd-sheet-left/right/bottom`, `zd-pop`, `zd-toast`, `zd-banner`.
- **En vivo** (`animate-breathe`): el punto verde de "En vivo" respira cada 2.8 s.
- **Esqueletos y `Reveal`:** fundido de 180 ms al llegar el contenido.

**Movimiento reducido:** con `prefers-reduced-motion: reduce`, una regla global lleva
animaciones y transiciones a 0.01 ms y anula las View Transitions; `withViewTransition()` hace
el cambio directo. El estado final es idéntico: nada depende de ver la animación.

## Componentes

En `src/components/ui` (escritos a mano, estilo shadcn, sin dependencias de estilo externas):

| Componente | Notas |
| --- | --- |
| `Button` | `default` (tinta), `secondary`, `outline`, `ghost`, `destructive`, `link`; tamaños `xs`–`xl` (56 px) e `icon*`. Con puntero grueso crecen a 44 px. `buttonVariants` para enlaces con forma de botón. |
| `Badge`, `StatusPill`, `OrderStatusPill`, `CashStatusPill`, `StatusGlyph` | Etiquetas por tono; pedido con glifo; efectivo con contorno y "Gs". |
| `OrderRail`, `CashRail` | Riel de 8 tramos (`role="img"` con etiqueta completa) y riel de efectivo (`<ol>` con `aria-current`). |
| `Input`, `Textarea`, `Select`, `Checkbox`, `FormField`, `Label` | `FormField` inyecta `id`, `aria-invalid`, `aria-required` y suma a `aria-describedby` la ayuda y el error (`role="alert"`). |
| `Segmented` | `radiogroup` con flechas y tabindex itinerante. |
| `DataTable` | TanStack Table: orden (`aria-sort`), búsqueda, filtros, selección, paginación, encabezado fijo, `rowClassName`, alto de fila por densidad. |
| `Dialog`/`DialogContent` | Hoja inferior en móvil, centrado desde `sm`. Foco atrapado y devuelto (Radix). |
| `SheetContent` | Cajón izquierdo, derecho o inferior. |
| `PopoverRoot`/`PopoverContent`, `Hint` (tooltip), `DropdownMenu` | Radix. |
| `toast()` + `Toaster` | Cola con región `role="status"` (cortés) y otra `role="alert"` (errores). Se pausa con hover o foco; los errores no se cierran solos. Arriba en móvil (no tapa el pulgar), abajo a la derecha desde `sm`. |
| `ConnectionStatus`, `LiveIndicator` | Banner "Reconectando / Sin conexión" con hora del último dato; punto "En vivo". |
| `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`, `TableSkeleton`, `Reveal` | Estados. |
| `Kbd`, `Avatar`, `Card` | Atajos, iniciales (decorativas), contenedores. |

Hooks y utilidades: `useHotkeys` (`mod+k`, `?`, `/`; las teclas sueltas se ignoran mientras se
escribe), `withViewTransition`, `prefersReducedMotion`, `formatPYG`, `formatTime`,
`formatMinutes` (`7 min`, `1 h 05`).

## Layout del panel

`PanelLayout` (`src/components/layout`):

- **Barra lateral de tinta**, agrupada (operación / red / configuración), colapsable a 64 px con
  tooltips. Ítem activo con barra lapacho. En móvil es un cajón (Radix, con título accesible).
- **Barra superior:** selector de empresa (hoy datos de ejemplo; lo alimentarán `memberships` +
  `activeTenantId`), buscador que abre la paleta, "En vivo", atajos, tema y menú de usuario
  (densidad, atajos, salir).
- **Paleta de comandos** (`Ctrl K` / `⌘ K`, cmdk): ir a secciones, abrir prototipos, cambiar
  tema y densidad.
- **Atajos** (`?`):

| Atajo | Acción |
| --- | --- |
| `Ctrl K` | Buscar o ir a… |
| `?` | Ver atajos |
| `/` | Buscar pedido (despacho) |
| `↑` `↓` / `←` `→` | Pedido anterior/siguiente; columna anterior/siguiente |
| `Enter` | Abrir el pedido |
| `A` | Asignar repartidor al pedido enfocado |
| `X` | Seleccionar para asignación múltiple |
| `Esc` | Cerrar el panel o limpiar la selección |

## Patrones

- **Despacho** (`/panel/prototipo/despacho`): cinco columnas por fase (Por asignar, Asignados,
  En retiro, En camino, Con problema) desde `xl`; debajo, un selector de columna. Encabezados
  fijos con conteo y "el más antiguo". Chips de señal (demorados, con incidencia) que filtran.
  Vista Lista con `DataTable`. Panel de repartidores con carga (`LoadMeter`) y efectivo en mano.
  Asignar con buscador (`CourierPicker`; fuera de turno, deshabilitado), selección múltiple,
  aviso con **Deshacer**. Menú **Simular** para ver llegar pedidos, avanzar repartidores y cortar
  la conexión.
- **Detalle de pedido:** recorrido rotulado de 8 pasos (vertical en móvil), historial con
  reasignaciones y eventos sincronizados sin señal, incidencias con "Marcar resuelta", cobro con
  `CashRail`. Las acciones que se ofrecen son solo las transiciones válidas para el estado.
- **Acciones con motivo:** cancelar, reasignar, devolver o registrar incidencia abren
  `ReasonDialog`: motivo obligatorio de una lista y detalle opcional.
- **Repartidor (PWA):** una entrega "ahora" arriba, acciones de pulgar abajo (56 px), señal y
  cambios sin enviar siempre visibles, hojas inferiores para entregar (con cobro), no entregado, rechazar y la cola sin enviar.
- **Seguimiento público:** cuatro hitos en lenguaje del cliente (Recibido, Preparando, En camino,
  Entregado), hora estimada rotulada como estimada, solo el nombre de pila de quien lo lleva; sin
  teléfono, dirección ni montos (SPEC §4.7). Link vencido en pantalla aparte.
- **Cuenta** (alineado con la autenticación de #14; sin llamadas reales):
  - *Ingreso:* correo y contraseña, "Recordarme en este equipo", error **genérico** ("El correo
    o la contraseña no coinciden") que no revela si la cuenta existe, enfocado al aparecer. La
    sesión será una cookie del servidor y los POST llevarán `X-CSRF-Token`: el front no guarda
    tokens.
  - *Selector de empresa:* con varias `memberships`, tarjetas de radio con rol y último uso; la
    `activeTenantId` viene preseleccionada. Cada rol entra a su pantalla.
  - *Olvidé mi contraseña:* la confirmación es la misma exista o no la cuenta.
  - *Restablecer:* el token llega en el fragmento (`#token=…`), se lee y se saca de la barra de
    direcciones con `replace`. Requisitos en vivo (largo mínimo provisorio de 10, coincidencia).
    Enlace vencido o incompleto: pantalla propia con "Pedir un enlace nuevo".
- **Auditoría** (`/panel/configuracion/auditoria`, #17; Propietario y Admin, permiso
  `audit:read`):
  - Lista por día, de lo más reciente a lo más antiguo. Cada evento dice quién hizo qué ("Ana
    suspendió un comercio"), a qué hora (zona del tenant) y, si existe la pantalla, enlaza al
    comercio (también desde sus sucursales).
  - "Detalle" (`aria-expanded`) muestra los cambios campo por campo (Campo · Antes · Después),
    con roles, estados, fechas y horarios traducidos. Lo marcado `redacted` se lee "Dato
    protegido": cambió, pero el valor no se guarda. Debajo, datos útiles (motivo, cuenta nueva)
    y la referencia para soporte (`correlationId`); los ids internos no se muestran.
  - Filtros: área (Comercios, Usuarios, Accesos → prefijo `action`), rango "Desde/Hasta" (días
    completos en la zona del tenant; "Hasta" incluye el día) y persona (clic en el nombre, se
    quita con el chip). Un rango al revés avisa en el campo y no consulta.
  - Los textos están en `features/audit/audit-format.ts`. Una acción, campo o valor nuevo de la
    API se muestra tal cual (`registró «zones.created»`): nunca rompe la pantalla.
- **Configuración** tiene pestañas (Usuarios, Auditoría); cada una aparece y se abre solo con su
  permiso, y `/panel/configuracion` va a la primera permitida.
- **Vacíos, carga y error:** cada lista tiene los tres. El error ofrece "Reintentar"; el vacío
  dice cómo llenarlo.
- **Conexión:** "En vivo" en la barra superior; al caer, banner con la hora del último dato y
  los datos siguen visibles (marcados como posiblemente desactualizados).

## Accesibilidad (WCAG 2.2 AA)

- Contraste verificado por script (ver arriba). Nunca solo color: etiqueta + glifo + riel.
- Foco visible global (anillo lapacho de 2 px, separado 2 px). "Saltar al contenido".
- Teclado completo: tarjetas del tablero con tabindex itinerante, paleta, atajos, diálogos con
  foco atrapado y devuelto, `Segmented` con flechas.
- Anuncios corteses (`aria-live="polite"`) de pedidos nuevos y cambios; errores en
  `role="alert"`.
- Objetivos táctiles de 44 px o más con puntero grueso (`pointer-coarse:`), 56 px para la acción
  principal del repartidor. Toasts arriba en móvil para no tapar el pulgar.
- Responsive desde 360 px sin scroll horizontal de página; el tablero cambia a una columna a la
  vez en lugar de desbordar.
- `prefers-reduced-motion` respetado en CSS y en JS.
- Formularios: etiqueta visible, `*` con "(obligatorio)" para lectores, error enlazado por
  `aria-describedby`, foco al primer campo inválido.

## Formato (`src/lib/format.ts`)

- `formatPYG(25000)` → `Gs. 25.000` (entero obligatorio; `RangeError` si no lo es).
- `formatDateTime / formatDate / formatTime(isoUtc, tz = 'America/Asuncion')` → 24 h. Pasar la
  zona del tenant cuando exista.
- `formatMinutes(65)` → `1 h 05` (`< 1 min`, `7 min`); `minutesBetween(a, b)`.
- Filtros por día: `zonedDayStartToUtc('2026-11-18', tz)` → `2026-11-18T03:00:00.000Z` (primer
  instante del día en la zona, con el offset de `Intl`: respeta cambios de hora),
  `nextDay('2026-11-18')` → `2026-11-19` y `toDateInput(isoUtc, tz)` para `<input type="date">`.

## Convenciones

- Copy en español con "vos": etiquetas cortas, verbo claro en botones ("Asignar", "Guardar
  contraseña"), errores que dicen qué hacer.
- Formularios: react-hook-form + Zod (`zodResolver`); un `FormField` por control; mensajes en el
  esquema.
- Colores solo por token; tonos por `TONE_CLASS`. Movimiento solo con las duraciones y curvas de
  arriba.
- Nada de datos reales ni simulados fuera de los prototipos y la guía, que están rotulados.

## Pruebas y capturas

- Vitest + Testing Library: primitivas, atajos, movimiento, tablero de despacho (asignar,
  deshacer, teclado, anuncios), detalle de pedido, repartidor, seguimiento, ingreso y
  recuperación de contraseña.
- Capturas con Playwright y Chrome del sistema (escritorio y 360 px, claro y oscuro). Para que
  `(pointer: coarse)` aplique en headless hace falta `--touch-events=enabled` y
  `Emulation.setEmitTouchEventsForMouse` por CDP.

## Pendiente

- Conectar con la API real: sesión y CSRF (#14), SSE para "En vivo", consultas de pedidos.
- Política de contraseñas definitiva (el mínimo de 10 es provisorio).
- PWA real del repartidor: service worker, cola sin señal persistente, cámara para la prueba de
  entrega.
- Pantallas del comercio (`/comercio`) más allá del placeholder.
