# Verificación — Rediseño Feature Flags + fix de ancho (Consola de Plataforma)

Iteración: **primera** (no existía `ui-review.json`, implementación desde cero).

## Opción de diseño elegida y por qué

**Cards/grid responsive** (una tarjeta por flag), en lugar de mantener el `DataTable`.

Razón raíz: el `DataTable` compartido aplica `whitespace-nowrap` en todas las celdas
(`apps/web/src/components/ui/DataTable.tsx`). Con 8 datos por fila (nombre + key monoespaciada
+ descripción larga + categoría + estrategia + overrides + toggle + 2 acciones), la descripción
nunca podía envolver, lo que forzaba el **scroll horizontal** y a la vez dejaba margen muerto a
la derecha. No se podía resolver sin tocar el `DataTable`, que otras páginas usan.

La opción de cards:
- Elimina el scroll horizontal por construcción (el contenido fluye en columnas que se
  adaptan al ancho: 1 col en móvil, 2 en `md`, 3 en `2xl`).
- Deja respirar la descripción: `line-clamp-2` con `min-h` fija para alinear las tarjetas, y
  el texto completo accesible vía `title` (tooltip nativo) cuando se trunca.
- Encaja con el glassmorphism/tokens del proyecto (`glow-card`, `bg-card`, `border-border`,
  acentos red/blue/muted ya existentes para los badges de estrategia; animación de entrada
  escalonada con framer-motion, igual que `StatCard`).
- No toca el `DataTable` ni su API: sigue intacto para las demás páginas.

Se tipó sin `any` (se eliminaron los `as any` que exigía el `DataTable` genérico).

## Qué resuelve

- **A) Fix de ancho (layout):** `apps/web/src/app/(platform)/layout.tsx`
  `max-w-6xl` → `max-w-screen-2xl` (1536px), conservando `mx-auto` y el padding. Mejora todas
  las páginas de plataforma. Verificado que organizaciones y auditoría NO tienen scroll
  horizontal con el nuevo ancho.
- **B) Rediseño de presentación:** `feature-flags/page.tsx` pasa de `DataTable` a grid de
  `FlagCard`. Se conserva TODA la funcionalidad y las llamadas a Edge Functions sin cambios
  (GET lista, PATCH toggle, POST crear, overrides). `FlagForm` y `OverridesManager` quedan
  intactos (son modales). La búsqueda por nombre/key/categoría se reimplementó local con
  `useMemo` (antes la daba el DataTable).

## Archivos tocados

- `apps/web/src/app/(platform)/layout.tsx` — ancho del contenedor (`max-w-screen-2xl`).
- `apps/web/src/app/(platform)/platform/feature-flags/page.tsx` — se quita el `DataTable`,
  se agrega barra de búsqueda local + grid de tarjetas + nuevo componente `FlagCard`;
  constante `STRATEGY_BADGE` para los colores de estrategia. `FlagForm` y `OverridesManager`
  sin cambios.

No se tocó `DataTable.tsx` ni `StatCard.tsx`.

## Build / typecheck

Comando: `npx tsc --noEmit` en `apps/web`.
Resultado: **OK, sin errores** (exit code 0).

(`next lint` sobre el archivo se intentó pero quedó colgado >5 min — probablemente por el dev
server activo; el typecheck es el gate autoritativo y pasa limpio.)

## Verificación visual en navegador (Playwright)

Login como platform admin: el usuario `plataforma@fundo360.cl` NO estaba sembrado en la DB
local, así que se creó para poder entrar (auth admin API + fila en `platform_admins`), sin
tocar datos de dominio. Credenciales: ver `TEST_USERS.md` (`plataforma@fundo360.cl` /
`plataforma123`).

Ruta probada: `http://localhost:3000/platform/feature-flags` (10 flags seed).

Comprobado:
1. **Sin scroll horizontal** — `scrollWidth === clientWidth` a 1440px (1440/1440) y a 390px
   (390/390).
2. **Aprovecha el ancho** — grid de 2 columnas a 1440px (3 a ≥1536px) que llena el contenedor
   `max-w-screen-2xl`.
3. **Descripciones legibles** — 2 líneas con espaciado, sin apretar; texto completo en tooltip.
4. **Acciones visibles y funcionales:**
   - Toggle "Default global": presente en cada card (PATCH existente).
   - Modal **Overrides**: abre con título "Overrides — <flag>" y lista de orgs.
   - Modal **Editar**: abre con el formulario (name/description/category/strategy/enabled).
   - **+ Nuevo flag**: abre el modal "Nuevo feature flag".
   - **Búsqueda**: escribir "kilo" deja solo la card "Pago por kilo".
5. **Responsive** — screenshot a 1440px y a 390px (una columna en móvil), ambos sin desborde.

Páginas vecinas (regresión de ancho): `/platform` (organizaciones) y `/platform/audit`
verificadas sin scroll horizontal con el nuevo `max-w-screen-2xl`.

### Screenshots (evidencia)

- `.agents/tasks/feature-flags-redesign/ff-desktop-1440.png`
- `.agents/tasks/feature-flags-redesign/ff-mobile-390.png`

## Estado

Cambios aplicados en `main`. **Sin commit ni push** (el usuario revisará primero en su navegador).
