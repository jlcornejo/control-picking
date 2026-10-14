# Rediseño UX/UI de Feature Flags + fix de ancho (Consola de Plataforma)

El cambio reemplaza el listado basado en `DataTable` de la página de Feature Flags por un grid de tarjetas responsive (`FlagCard`), y amplía el contenedor del layout de plataforma de `max-w-6xl` a `max-w-screen-2xl`. El objetivo es eliminar el scroll horizontal y la sensación apretada que reportó el usuario (textos de descripción comprimidos, ancho desaprovechado). Es un cambio puramente de presentación en `apps/web`: no toca Edge Functions, lógica de datos, ni el `DataTable` compartido. La búsqueda, que antes la proveía el `DataTable`, se reimplementó local con `useMemo`.

**Watch for:** nada bloqueante. El badge de categoría sigue siendo neutro (`bg-muted`) y los acentos de estrategia usan la paleta Tailwind `red/blue` cruda igual que la versión previa — comportamiento preservado, no una regresión (confirmed). El grid salta de 2 a 3 columnas recién en `2xl` (1536px), por lo que a 1440px se ven 2 columnas, coherente con el screenshot (confirmed).

**Verdict**: APPROVED

## High-level view

El fix de ancho es un cambio de una línea en `layout.tsx` (`max-w-6xl` → `max-w-screen-2xl`), que aplica a todas las páginas de plataforma. La verificación del coder confirma por Playwright que organizaciones y auditoría no desarrollan scroll horizontal con el ancho mayor; el riesgo de regresión en páginas vecinas es bajo porque esas páginas ya centran su contenido con `mx-auto` y el único cambio es el techo de ancho.

El rediseño sustituye el `DataTable` por un grid (`grid-cols-1 md:grid-cols-2 2xl:grid-cols-3`) de tarjetas. La raíz del problema original era el `whitespace-nowrap` del `DataTable` compartido, que impedía envolver la descripción y forzaba el scroll; el grid lo resuelve por construcción sin tocar ese componente, que queda intacto para el resto de la app. Las descripciones ahora usan `line-clamp-2` con `min-h` para alinear tarjetas y `title` para el texto completo.

Toda la funcionalidad queda cableada: el toggle de default global dispara la misma `toggleMutation` (PATCH), los botones Overrides/Editar abren sus modales, "+ Nuevo flag" abre el modal de creación, y la búsqueda filtra por nombre/key/categoría con `useMemo`. `FlagForm` y `OverridesManager` no se modificaron. Los badges de estrategia conservan sus colores (kill_switch rojo, global azul, org_override neutro) extraídos a la constante `STRATEGY_BADGE`, y el contador de overrides mantiene el formato `enabled/total orgs on`.

El tipado mejoró: se eliminaron los tres `as any` que exigía el `DataTable` genérico. No se introdujeron `any` nuevos en el código de presentación (el único `any` restante está en los handlers `onError` de mutaciones, preexistente y fuera del diff relevante).

<details>
<summary>Issues (2)</summary>

1. **Paleta cruda en badges de estrategia (no bloqueante)** — `STRATEGY_BADGE` usa `bg-red-50/text-red-700` y `bg-blue-50/text-blue-700` de Tailwind en vez de design tokens HSL. Es idéntico a la versión previa (comportamiento preservado), pero si se quiere alinear estrictamente a tokens convendría migrarlo en un cambio aparte.
2. **Badge de categoría genérico (no bloqueante)** — todas las categorías comparten `bg-muted` neutro; no hay color por categoría. No era requisito y coincide con el diseño previo; se anota solo como posible mejora futura.

</details>

<details>
<summary>Details</summary>

## Fix de ancho del layout

El cambio en `apps/web/src/app/(platform)/layout.tsx` es exactamente lo pedido: `max-w-6xl` → `max-w-screen-2xl`, conservando `mx-auto` y el padding `p-4 lg:p-8 pt-16 lg:pt-8`. `max-w-screen-2xl` resuelve a 1536px, dentro del rango aceptado por los criterios (`max-w-screen-2xl` o `max-w-[1600px]`). El contenedor exterior ya tiene `flex-1 overflow-y-auto`, así que el ancho mayor solo da más espacio al contenido centrado (confirmed, leído el diff completo del archivo).

La verificación del coder reporta que organizaciones (`/platform`) y auditoría (`/platform/audit`) no desarrollan scroll horizontal con el nuevo ancho (medido `scrollWidth === clientWidth` a 1440px). No re-ejecuté el navegador por instrucción; la evidencia es consistente y el riesgo de regresión es bajo dado que el único cambio es el techo de ancho (likely).

## De DataTable a grid de tarjetas

La causa raíz documentada es sólida: el `DataTable` compartido aplica `whitespace-nowrap`, de modo que con 8 columnas (nombre+key, descripción larga, categoría, estrategia, overrides, toggle, 2 acciones) la descripción no podía envolver y empujaba el ancho más allá del viewport, generando a la vez scroll horizontal y margen muerto. Resolverlo dentro del `DataTable` habría afectado a otras páginas que lo consumen.

El grid `grid-cols-1 md:grid-cols-2 2xl:grid-cols-3` elimina el scroll por construcción: el contenido fluye en columnas que se adaptan al ancho. A 1440px se renderizan 2 columnas (el salto a 3 ocurre en `2xl`=1536px), lo que coincide exactamente con el screenshot `ff-desktop-1440.png`. En móvil (`ff-mobile-390.png`) es una sola columna sin desborde (confirmed por ambos screenshots).

La descripción usa `line-clamp-2 min-h-[2.5rem]` con `title={flag.description ?? undefined}` para exponer el texto completo como tooltip nativo cuando se trunca, y muestra "Sin descripción" como fallback. El `min-h` fijo alinea verticalmente las tarjetas aunque las descripciones varíen de largo. Esto responde directamente a la queja de "muchos textos apretados" (confirmed).

## Funcionalidad preservada

Cada acción sigue cableada a su mutación/modal (confirmado leyendo el archivo completo):

- **Toggle default global**: `onToggle={() => toggleMutation.mutate(flag)}` en cada `FlagCard`, dispara el mismo PATCH a `platform-feature-flags/${flag.key}` con `{ enabled: !flag.enabled }`. El `disabled={toggling}` evita doble disparo.
- **Modal Overrides**: `onOverrides={() => setOverridesFlag(flag)}` abre el `Modal` que renderiza `<OverridesManager flag={overridesFlag} onChange={invalidate} />`, sin cambios.
- **Modal Editar**: `onEdit={() => setEditFlag(flag)}` abre `<FlagForm flag={editFlag} ... />`.
- **+ Nuevo flag**: el `ActionButton` del `PageHeader` abre el modal de creación con `<FlagForm>` sin `flag`.
- **Búsqueda**: reimplementada con `useMemo` filtrando por `name`, `key` y `category` (`v?.toLowerCase().includes(term)`), equivalente a los `searchKeys={['name','key','category']}` que antes pasaba al `DataTable`. El contador "N flags" refleja `filteredFlags.length`.

`FlagForm` y `OverridesManager` quedan idénticos (fuera del diff). El `DataTable.tsx` no se tocó, su API queda intacta.

## Badges y contador de overrides

Los colores de estrategia se extrajeron a `STRATEGY_BADGE` con el mapeo correcto: `kill_switch` rojo, `global` azul, `org_override` neutro (`bg-muted`). Es el mismo mapeo que la versión previa, solo movido de un ternario inline a una constante tipada por `FeatureFlag['strategy']` — más limpio y type-safe. El contador conserva el formato `{override_enabled_count}/{override_count}` con sufijo "orgs on" y fallback "Sin overrides" cuando `override_count === 0` (confirmed). El screenshot muestra "1/1 orgs on" en las cards con overrides, consistente con el seed.

## Tipado

Se eliminaron los `columns as any`, `data as any` y `actions as any` que el `DataTable` genérico exigía; el grid trabaja con `FeatureFlag` tipado directamente y `FlagCard` recibe props tipadas explícitas. No hay `any` nuevos en el código de presentación. El typecheck `npx tsc --noEmit` del coder pasó con exit 0; dado que el diff es acotado y no introduce patrones de tipo riesgosos, no fue necesario un spot-check adicional (confirmed por diff + nota de verificación).

</details>

<details>
<summary>File map</summary>

- `apps/web/src/app/(platform)/layout.tsx` — ancho del contenedor: `max-w-6xl` → `max-w-screen-2xl` (una línea).
- `apps/web/src/app/(platform)/platform/feature-flags/page.tsx` — se elimina `DataTable`; se agrega barra de búsqueda local (`useMemo`), grid responsive, nuevo componente `FlagCard` y constante `STRATEGY_BADGE`. `FlagForm` y `OverridesManager` sin cambios.

Diff completo: `git diff` sobre los dos archivos (cambios sin commitear en `main`).

</details>
