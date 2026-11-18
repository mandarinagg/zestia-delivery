# UI base (`apps/web`)

Estilo: calmo, denso y operativo, pensado para despachadores que miran la pantalla todo el día. Tema claro y oscuro, texto de 14 px, filas compactas, color reservado para el significado (estado y acción principal).

Para verlo: `pnpm --filter @zestia/web dev` y abrí `/panel/ui` (guía con datos de ejemplo obvios; no llama a ninguna API).

## Tokens

Definidos como variables CSS en `src/index.css` (`:root` claro, `.dark` oscuro) y expuestos a Tailwind con `@theme inline` (`bg-card`, `text-muted-foreground`, `bg-status-success-bg`, ...).

- Superficies: `background`, `card`, `muted`, `accent`, `sidebar`.
- Texto: `foreground`, `muted-foreground`, `*-foreground` de cada superficie.
- Controles: `border` (decorativo), `input` (borde de campos, >= 3:1), `ring` (foco).
- Acción: `primary`, `destructive`.
- Estado semántico: `status-{neutral,info,success,warning,danger}-{bg,fg,dot}`. No hay un mapa fijo hacia estados de pedido: el dominio decide qué estado usa qué tono (`StatusTone`).

Tema: `ThemeProvider` (`src/lib/theme.tsx`) guarda la preferencia `system | light | dark` en `localStorage` (`zestia.theme`) y por defecto sigue `prefers-color-scheme`. Un script en `index.html` aplica la clase `dark` antes de pintar (sin destello). El selector está en la barra superior (`ThemeToggle`).

### Contraste (WCAG AA)

Verificable con `pnpm --filter @zestia/web contrast` (falla si algún par baja del mínimo). Texto >= 4.5:1; indicadores y bordes de control >= 3:1.

| Estado (texto sobre fondo) | Claro | Oscuro |
| -------------------------- | ----- | ------ |
| neutral                    | 9.85  | 9.69   |
| info                       | 7.79  | 8.67   |
| success                    | 7.00  | 8.49   |
| warning                    | 7.38  | 8.77   |
| danger                     | 7.13  | 8.05   |

Otros pares: texto principal sobre fondo 16.5 / 15.6; `muted-foreground` sobre card 7.5 / 7.7; `primary-foreground` sobre `primary` 6.1 / 7.0; borde de campo sobre card 4.3 / 4.9; foco (`ring`) sobre fondo 5.7 / 8.1. Puntos de estado sobre su fondo: >= 3.6 (claro) y >= 4.5 (oscuro). El estado nunca depende solo del color: `StatusPill` lleva texto y punto.

## Componentes

En `src/components/ui` (estilo shadcn, escritos a mano):

| Componente | Uso |
| --- | --- |
| `Button`, `Badge`, `StatusPill` | Acciones, etiquetas, estado operativo |
| `Input`, `Textarea`, `Select` (nativo), `Checkbox` | Controles |
| `FormField`, `Label` | Etiqueta, `*` + "(obligatorio)" para lectores, ayuda, error (`role="alert"`, `aria-describedby`, `aria-invalid`) |
| `DataTable` | TanStack Table v8: orden, búsqueda global, filtros por columna (`meta.filterOptions`), selección, paginación, encabezado fijo, vacío/cargando/error |
| `EmptyState`, `ErrorState` (con "Reintentar"), `LoadingState`, `Skeleton`, `TableSkeleton` | Estados |
| `ConnectionStatus` + `useConnectionStatus` | Banner "reconectando / sin conexión". Hoy la fuente es un stub (`createConnectionSource`); el cliente SSE llamará a `set()` |
| `DropdownMenu` (Radix) | Menús (tenant, usuario, tema) |
| `Card` | Contenedor de secciones |

Layout en `src/components/layout`: `PanelLayout` (sidebar colapsable persistida, drawer en móvil con Escape, barra superior con selector de empresa y menú de usuario como placeholders, enlace "Saltar al contenido") y `PageHeader`.

Rutas (`src/router.tsx`): `/panel/*` (secciones placeholder + `/panel/ui`), `/comercio`, `/repartidor`, `/t/:token`.

## Formato (`src/lib/format.ts`)

- `formatPYG(25000)` -> `Gs. 25.000` (entero obligatorio; lanza `RangeError` si no lo es).
- `formatDateTime / formatDate / formatTime(isoUtc, tz = 'America/Asuncion')` -> `17/11/2026 09:00` (24 h). Pasar la zona del tenant cuando exista.

## Convenciones

- Copy en español neutro rioplatense/paraguayo ("vos"): etiquetas cortas, verbo claro en botones ("Guardar comercio"), errores que dicen qué hacer.
- Formularios: react-hook-form + Zod (`zodResolver`); un `FormField` por control; mensajes en el esquema.
- Accesibilidad: foco visible global, `aria-sort` en tablas, controles con nombre accesible, `prefers-reduced-motion` anula animaciones y transiciones.
- Nunca datos reales ni simulados en producción: lo de la guía es de ejemplo y está rotulado.
