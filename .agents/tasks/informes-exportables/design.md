# Diseño — M2-03 Informes exportables (dashboard web)

## Resumen

Añadir exportación de informes al dashboard web (`apps/web`) para los roles **admin** y **supervisor**:

1. **PDF de liquidaciones** — extender el `generateSettlementPDF` ya existente (no duplicar) y confirmar que respeta el contrato nuevo de settlements (`payment_unit`, totales por unidad box/kg, `variety_name` en el desglose).
2. **CSV de producción** — exportar los registros de picking que la página `/records` ya tiene cargados y filtrados.
3. **CSV de rankings** — exportar el ranking de trabajadores que `/dashboard` ya muestra.

Es una extensión de UI + utilidades puras de cliente, no arquitectura nueva. Toda la generación ocurre **client-side** sobre datos que TanStack Query ya trae a cada página, acotados a la organización por RLS. Las acciones de exportación quedan detrás de feature flags siguiendo el amarre de 3 capas.

Stack (bloqueado por este diseño): TypeScript estricto, Next.js App Router (`apps/web`), TanStack Query (datos ya cargados), `jsPDF` + `jspdf-autotable` (ya presentes) para PDF, y un **generador de CSV manual sin dependencias nuevas**. No se añade `xlsx`/`exceljs` (ver "Librerías").

## Decisión de generación: client-side

Todas las exportaciones se generan en el navegador. Justificación:

- **Los datos ya están cargados**. `/records` ya hace la query de `picking_records` con filtros (fecha, trabajador, paño) y resuelve nombres de worker/block; `/dashboard` ya calcula el `ranking`; `/settlements` ya arma el objeto completo del PDF. Un endpoint nuevo duplicaría esas queries y su lógica de enriquecimiento.
- **RLS garantiza el aislamiento multi-tenant**. Las queries existentes pasan por el cliente Supabase autenticado; solo devuelven filas de la organización del usuario. Exportar lo ya cargado no puede filtrar datos cross-tenant.
- **Sin estado nuevo ni superficie de API**. No hay que crear/mantener/desplegar una Edge Function ni versionar un contrato de respuesta.
- **Volumen acotado**. Los listados ya están paginados/filtrados por rango de fechas; generar un CSV de unos miles de filas en el cliente es instantáneo y no justifica un endpoint de streaming.

Descartado: endpoint server-side (Edge Function de export). Se reconsideraría solo si en el futuro se requiere exportar sin cargar la tabla completa (p. ej. "exportar todo el histórico" sin paginar) o generar archivos muy grandes; no es el caso de M2-03.

## Librerías

- **PDF**: reutilizar `jsPDF` + `jspdf-autotable` (ya en `apps/web/package.json`, ya usados por `SettlementPDF.tsx`). Cero dependencias nuevas.
- **CSV**: **generación manual** con una utilidad propia (`apps/web/src/lib/export/csv.ts`). Un CSV correcto es trivial (escapado de comillas/`;`/saltos de línea + BOM) y añadir `papaparse` solo para serializar no se justifica.
- **xlsx**: **NO se añade**. `xlsx` (SheetJS) y `exceljs` son pesados (cientos de KB) y aportan poco sobre un CSV que Excel/LibreOffice abren nativamente. El brief lo marca como opcional ("solo si una librería liviana lo hace fácil"); ninguna lo es. Se entrega **CSV bien hecho** como formato único. Si el cliente exige `.xlsx` nativo más adelante, es una tarea separada con su propia justificación de dependencia.

### Contrato del CSV (es-CL)

Utilidad compartida `toCSV(rows, columns)` que produce un `Blob` descargable:

- **Codificación UTF-8 con BOM** (`\uFEFF` al inicio) para que Excel/LibreOffice en Windows abran tildes y `ñ` correctamente.
- **Separador `;`** (punto y coma). En locale es-CL el separador decimal es la coma, así que el separador de columnas debe ser `;` para que Excel no parta los números.
- **Fin de línea `\r\n`** (compatibilidad Excel).
- **Escapado**: cualquier campo que contenga `;`, `"`, `\n` o `\r` se envuelve en comillas dobles y las comillas internas se duplican (`"` → `""`).
- **Números**: se exportan como texto ya formateado en es-CL donde sea legible para humanos (p. ej. cantidades de kg con hasta 3 decimales, montos en pesos sin decimales), reutilizando `formatNumber`/`formatUnit`/`unitLabel` de `apps/web/src/lib/format.ts`. El RUT (`national_id`) se exporta como texto crudo.
- **Nombre de archivo**: patrón `{reporte}-{alcance}.csv`, donde `{alcance}` es una fecha única `YYYY-MM-DD` (informes de un solo día, p. ej. `ranking-2026-10-07.csv`) o un rango `YYYY-MM-DD_YYYY-MM-DD` (informes por período, p. ej. `produccion-2026-10-01_2026-10-07.csv`). El CSV de producción usa el rango `{dateFrom}_{dateTo}`; el de ranking usa la fecha única seleccionada.

Un pequeño helper `downloadBlob(blob, filename)` (crear `<a download>`, click, revocar URL) centraliza la descarga para los tres informes.

## Decisión de feature flag — crear `report_export`

Se **crea un flag nuevo** `report_export` en vez de reutilizar `disable_pdf_export`. Razones:

- `disable_pdf_export` es un **kill-switch** (`strategy = kill_switch`, default `false` = exportación activa). Su semántica es "apagar PDFs pesados en un pico de carga", es global y de emergencia. No sirve como gating de una feature nueva, que debe nacer **off** y activarse por tenant piloto (`org_override`).
- La regla de arquitectura (`feature-flags`, "Amarre de 3 capas") exige que **toda feature de usuario nueva** esté detrás de un flag con default seguro **off** y estrategia `org_override`. `report_export` cumple eso.
- Además, hoy `disable_pdf_export` es un **"flag muerto"**: `SettlementPDF`/`/settlements` NO lo consultan. Este diseño lo **conecta** de paso (ver abajo), separando responsabilidades: `report_export` = capacidad (on/off por tenant), `disable_pdf_export` = kill-switch de emergencia solo para PDF.

### Qué gatea cada flag

| Acción (UI) | Página | Gating |
|---|---|---|
| Botón "↓ PDF" de liquidación | `/settlements` | visible solo si `report_export` **y** `!disable_pdf_export` |
| Botón "Exportar CSV" de producción | `/records` | visible solo si `report_export` |
| Botón "Exportar CSV" de ranking | `/dashboard` | visible solo si `report_export` |

- `report_export` (nuevo): capacidad general de informes exportables, `org_override`, default **off**. Enciende/apaga los tres botones.
- `disable_pdf_export` (existente, kill_switch): se **aplica adicionalmente solo al PDF**. Si el super-admin lo activa (emergencia), el botón PDF se oculta aunque `report_export` esté on; los CSV siguen disponibles (son livianos, no son el motivo del kill-switch). Con esto el kill-switch deja de ser un flag muerto.

Degradación limpia: con `report_export` off, las páginas funcionan igual pero sin botones de export; sin errores.

### Amarre de 3 capas de `report_export`

1. **Catálogo** — sembrado por **migración nueva** `supabase/migrations/20261004000001_feature_flag_report_export.sql` (timestamp posterior al último, `20261003000005`). Patrón idéntico a las migraciones de flags existentes:

   ```sql
   INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
     ('report_export', 'Informes exportables',
      'Habilita la exportación de informes desde el dashboard web: PDF de liquidaciones y CSV de producción y rankings.',
      'analitica', 'org_override', false)
   ON CONFLICT (key) DO NOTHING;
   ```

   Reversibilidad documentada en el header del archivo: `DELETE FROM platform_feature_flags WHERE key = 'report_export';`.

   **Seeds (`supabase/seed.sql` y `supabase/_seed_remote.sql`).** En ambos el bloque `VALUES` del catálogo termina hoy en la fila `('disable_pdf_export', ...'kill_switch', false)` **sin coma final**, seguida de `ON CONFLICT (key) DO NOTHING;`. Para sembrar `report_export` de forma coherente (igual que los flags vigentes) se inserta como **nueva última entrada del `VALUES`**: hay que **poner una coma al final de la línea `disable_pdf_export`** y añadir debajo la fila `('report_export', 'Informes exportables', '...', 'analitica', 'org_override', false)`. El `ON CONFLICT (key) DO NOTHING` se mantiene intacto. No basta con "añadir la fila": sin mover la coma el SQL es inválido.

   > Nota: el flag se siembra **solo por migración/seed**, nunca desde la consola (la Edge Function `platform-feature-flags` rechaza `POST` con 403). El hook `.kiro/hooks/feature-flag-wiring.json` dispara al guardar la migración y recordará verificar las 3 capas.

2. **Código** — consumo del estado efectivo (override → global) vía el hook existente `useFeatureFlag` (`apps/web/src/hooks/useFeatureFlag.ts`, que retorna `{ enabled, loading }` y ya reutiliza `resolveFeatureFlag` de `@fundo360/shared`). Cada página llama `const { enabled } = useFeatureFlag('report_export')` y renderiza el botón solo si `enabled`.

   **Degradación durante `loading`.** El hook retorna `enabled: data ?? false`, así que mientras carga `enabled` es `false` y el botón **no se muestra**; cuando resuelve, aparece si corresponde. Esto da una degradación limpia sin flicker (no se pinta un botón que luego desaparece), por eso basta con leer `enabled` y no hace falta ramificar por `loading`. `/settlements` combina dos flags con `report_export && !disable_pdf_export` llamando a `useFeatureFlag('report_export')` y `useFeatureFlag('disable_pdf_export')`; mientras cualquiera de los dos está en `loading` su `enabled` es `false`, de modo que el botón PDF permanece oculto hasta que ambos resuelven (comportamiento seguro).

3. **Panel de administración** — automático: al existir en `platform_feature_flags`, el flag aparece en `/platform/feature-flags` para activar/desactivar el default global y gestionar overrides por organización. No se añade nada en la consola.

## Alcance por página

### 1. `/settlements` — PDF de liquidación (extender, no duplicar)

`generateSettlementPDF` ya recibe `payment_unit`, `base`, `variety_name` por fila y `formatQty`/`formatProduct` ya los usan; el `handleExportPDF` ya arma `records` con `pickingPayableBase`/`pickingSubtotal` y `payments`. **El contrato nuevo de settlements ya está respetado** — este diseño lo verifica y lo deja gated, no lo reescribe.

Cambios:
- Gating: envolver el botón "↓ PDF" con `report_export && !disable_pdf_export`.
- **Resumen de cantidades por unidad (concreto)**: hoy `SettlementPDF.tsx` solo pinta un "TOTAL A PAGAR" (= `data.totalAmount`) y una tabla fila-a-fila; **no** tiene segmentación por unidad, y la lógica `totalBoxes`/`totalKg` de `/records` vive en esa página, no en el componente ni en `SettlementPDFData`. Para no duplicar ni ampliar la forma de datos, `generateSettlementPDF` calcula el resumen **dentro del propio componente** a partir de `data.records` (que ya traen `payment_unit` y `base`):
  - `Σ base` de registros con `payment_unit !== 'kg'` → cantidad de cajas (`boxes`).
  - `Σ base` de registros con `payment_unit === 'kg'` → kilos (`kg`).
  - **Import a añadir**: hoy `SettlementPDF.tsx` **no importa nada de `@/lib/format`** (tiene su propio `formatQty` local). Se añade al componente `import { formatNumber, formatUnit } from '@/lib/format'`. (No se usa `unitLabel` aquí.)
  - **Composición sin duplicar la unidad**: `formatUnit(x, 'kg')` ya devuelve el string con sufijo (`"… kg"`) y `formatUnit(x, 'box'|undefined)` ya devuelve `"… cajas"` (incluye la palabra). Por eso la línea se compone con `formatNumber` para el número crudo de cajas y `formatUnit(..., 'kg')` solo para los kilos, evitando prefijar texto a un `formatUnit` que ya trae la unidad: **`Cajas: ${formatNumber(boxes)} · Kilos: ${formatUnit(kg, 'kg')}`** (p. ej. `Cajas: 120 · Kilos: 1.234,5 kg`).
  - Se renderiza **siempre** esa línea justo antes del "TOTAL A PAGAR", mostrando `0` en la unidad que no aplique (`formatNumber(0)` → `"0"`, `formatUnit(0, 'kg')` → `"0 kg"`); encabezado estable, sin ramas condicionales que oculten la línea.
- **`SettlementPDFData` NO cambia**: el resumen se deriva de `data.records` ya existentes; no se añaden campos a la forma de datos ni se toca la query de `/settlements`.
- El monto total **no** cambia (regla de dominio 26: el pago no cambia por el destare/peso neto); el resumen por unidad es informativo y nunca reemplaza a `totalAmount`.
- Las liquidaciones `paid` son inmutables (regla 14): el PDF es solo lectura, nunca escribe en `settlements`, así que la inmutabilidad no se toca.

### 2. `/records` — CSV de producción

Exporta exactamente las filas que la tabla muestra con los filtros activos (`dateFrom`, `dateTo`, `filterWorker`, `filterBlock`). Se reutiliza el array `records` ya calculado por la query (no se dispara una query nueva). Botón "Exportar CSV" junto al `PageHeader`, gated por `report_export`, deshabilitado si no hay filas.

Ampliaciones de `select` (hoy el query de `/records` usa `picking_records.select('id, worker_id, block_id, quantity, payment_unit, paid_quantity_kg, rate_amount_snapshot, recorded_at, work_day, original_record_id')`, `workers.select('id, full_name')` y `blocks.select('id, name')`):

- **RUT**: `workers.select('id, full_name')` → `workers.select('id, full_name, national_id')`. `national_id` es el único campo de identidad legible; la tabla `workers` NO tiene campo de código/número de badge (solo `qr_badge_url`, que es una URL a la imagen del QR y no es dato para una celda). No se exporta ningún "badge".
- **Producto/Variedad**: `blocks.select('id, name')` → `blocks.select('id, name, products!fk_blocks_product_org(name), product_varieties!fk_blocks_variety_org(name)')`, idéntico al embed con FK nombrada que `/settlements` ya usa (los nombres de constraint son obligatorios por el aislamiento multi-org de doble FK). Se cambia la forma de `blockMap` de `id → string` a `id → { name, product, variety }` (igual que `handleExportPDF` de `/settlements`).

  > **Impacto en el render on-screen (obligatorio actualizar, no solo el CSV).** Hoy `blockMap` es `id → string` (`Object.fromEntries((blocks||[]).map(b => [b.id, b.name]))`) y la fila se arma con `block_name: blockMap[r.block_id] || '—'`, consumido por la columna `block_name` de la tabla visible. Al pasar `blockMap` a `id → objeto`, esa línea asignaría un objeto a `block_name` y rompería la tabla en pantalla. Por eso el armado de fila se actualiza explícitamente a **`block_name: blockMap[r.block_id]?.name || '—'`** y se añaden a la fila `product: blockMap[r.block_id]?.product || ''` y `variety: blockMap[r.block_id]?.variety || ''` (consumidos por las nuevas columnas del CSV). El `blockMap` del nuevo embed se construye como `Object.fromEntries((blocks||[]).map(b => [b.id, { name: b.name, product: b.products?.name ?? '', variety: b.product_varieties?.name ?? '' }]))`. La columna `block_name` de la tabla en pantalla sigue igual.
- **Peso neto**: `net_weight_kg` NO vive en `blocks` sino en `picking_records`; se añade al `select` de `picking_records`. No altera el pago (es auditoría de destare de `box_tare_control`).

Todas las ampliaciones son columnas de filas que ya pertenecen a la org del usuario bajo RLS; no se cruza tenant.

**Columnas del CSV de producción** (cabeceras en español):

| Columna | Fuente |
|---|---|
| Fecha | `work_day` |
| Trabajador | `worker_name` (de `workerMap`) |
| RUT | `national_id` del worker (texto crudo; `null` → cadena vacía) |
| Paño | `block_name` (de `blockMap.name`) |
| Producto | `blockMap.product` (nombre vía `products!fk_blocks_product_org`) |
| Variedad | `blockMap.variety` (vía `product_varieties!fk_blocks_variety_org`; vacío si no aplica) |
| Cantidad | `base` = `pickingPayableBase(payload)` (ya calculado como `r.base`; cajas enteras o kg con hasta 3 decimales según `payment_unit`) |
| Unidad | "Caja" / "Kilo" — expresión literal `payment_unit === 'kg' ? 'Kilo' : 'Caja'` (la misma que la celda "Unidad" de la tabla on-screen de `/records`; **no** se usa `unitLabel`, que devuelve "cajas"/"kg") |
| Peso neto (kg) | `r.net_weight_kg` (vacío si `null`/no aplica destare) |
| Tarifa | `rate_amount_snapshot` |
| Monto estimado | `total` = `pickingSubtotal(payload)` |
| Tipo | "Original" si `original_record_id` es `null`, "Corrección" si no |

Comportamiento de filas de corrección (reglas 5-6, soft-update: solo se corrige dentro de la jornada y la corrección conserva el original como auditoría): el `select` de `/records` **no** filtra `original_record_id`, así que el CSV incluye las **mismas filas que la tabla**: tanto el registro original (editado in-place) como el snapshot de auditoría de la corrección. La columna "Tipo" los distingue. **El CSV es un detalle fila-a-fila, no sumable directamente**: sumar "Monto estimado" sobrecontaría los snapshots de corrección (mismo comportamiento que el resumen `totalAmount` de la propia página). Esta decisión mantiene paridad 1:1 con lo que ve el usuario en la tabla; no se filtra `original_record_id IS NULL` para no divergir de la vista.

Columnas que no apliquen al tenant (sin kg, sin destare, sin variedad) salen vacías, no se omiten, para mantener un encabezado estable.

### 3. `/dashboard` — CSV de ranking

Exporta el ranking de trabajadores de la fecha seleccionada (top-10). Botón "Exportar CSV" junto al encabezado "Ranking", gated por `report_export`, deshabilitado si el ranking está vacío.

**Problema de unidades mezcladas y decisión.** El ranking actual de `/dashboard` acumula `byWorker[...].units += Number(r.quantity)` sobre `picking_records` **sin filtrar `payment_unit`**: para un tenant con `kg_payment` activo, `units` suma cajas y kilos en el mismo número, mezclando dos unidades distintas en un solo contador. Eso rompe el invariante implícito del pago por kilo (`kg_payment`): cajas y kilos no se agregan en el mismo número. Exportar ese número tal cual lo formalizaría como dato oficial incorrecto.

Decisión (opción recomendada del review, (b)): el builder del CSV de ranking **no hereda el número mezclado**. El CSV se construye segmentando por `payment_unit`, de modo que "Cajas" signifique cajas y "Kilos" signifique kilos. Como el agregado actual del dashboard colapsa ambas unidades en `units`, el CSV **recalcula las sumas segmentadas desde las filas crudas del día**. Esto corrige el defecto sin cambiar la UI del dashboard (fuera de alcance de M2-03), solo el dato exportado.

**Ampliación del `select` del ranking (concreto).** Hoy la query del ranking (`apps/web/src/app/(dashboard)/dashboard/page.tsx`) es `supabase.from('picking_records').select('worker_id, quantity').eq('work_day', selectedDate).is('original_record_id', null)`. Se amplía el `select` a **`select('worker_id, quantity, payment_unit, paid_quantity_kg')`** (los otros filtros `.eq('work_day', ...)` y `.is('original_record_id', null)` se mantienen tal cual — el ranking no cuenta correcciones, lo cual es correcto). `payment_unit` segmenta y `paid_quantity_kg` es la fuente de la columna "Producción (kg)"; sin `paid_quantity_kg` esa columna quedaría sin dato.

**Cambio de forma de retorno de la `queryFn` del ranking y actualización de consumidores (obligatorio, no solo "exponer el `data`").** Hoy la `queryFn` de `useQuery(['dashboard-ranking', selectedDate])` declara `data` como **const local** y retorna **solo** el agregado — `return Object.values(byWorker).sort((a,b)=>b.units-a.units).slice(0,10)` — por lo que el valor del hook (`ranking`) es un array `[{ id, name, units }]`; las filas crudas (`data`) **no salen** del hook. Para que el builder del CSV las use sin disparar una query adicional (prohibido por la decisión client-side), la `queryFn` debe **cambiar su forma de retorno** a un objeto `{ ranking, rows }`:

```ts
// queryFn del ranking (nuevo retorno):
return {
  ranking: Object.values(byWorker).sort((a, b) => b.units - a.units).slice(0, 10),
  rows: (data || []).map(r => ({
    worker_id: r.worker_id,
    quantity: Number(r.quantity),
    payment_unit: r.payment_unit,
    paid_quantity_kg: r.paid_quantity_kg === null ? null : Number(r.paid_quantity_kg),
  })),
};
```

Este cambio **rompe los tres consumidores de `ranking` en el JSX**, que hoy tratan al valor del hook como array:
- `const maxUnits = Math.max(...(ranking || []).map(w => w.units), 1);`
- `(ranking || []).length === 0`
- `(ranking || []).map((w, i) => …)`

Igual que el fix análogo de `blockMap` en `/records` (iteración 1/2, finding #3), **se documenta y se actualiza explícitamente**: la variable del hook se renombra a `rankingData` (`const { data: rankingData, isLoading: rankingLoading } = useQuery(...)`) y en el cuerpo del componente se destructura:

```ts
const ranking = rankingData?.ranking ?? [];
const rawRows = rankingData?.rows ?? [];
```

Con esto `maxUnits`, `(ranking || []).length` y `(ranking || []).map(...)` quedan **intactos** operando sobre el array `ranking` ya destructurado (mismo contenido que hoy), y `rawRows` queda disponible para el builder del CSV. No se dispara ninguna query adicional. El `refetchInterval` y el `queryKey` del `useQuery` no cambian.

**Contrato de entrada del builder (concreto).** La vista produce dos agregaciones distintas que hay que conciliar: `ranking = [{ id, name, units }]` (ya ordenado por `units` desc, top-10, usado para posición/`id`/`name`) y las sumas segmentadas por unidad (que no existen en `byWorker`, que colapsa en `units`). Se elige la **opción (b) del review**: el builder del CSV recibe **DOS entradas** —(1) el array `ranking` ya ordenado y (2) `rawRows`, el array crudo de `picking_records` del día con `{ worker_id, quantity, payment_unit, paid_quantity_kg }`— y procede así:

1. Construye `const sums = new Map<worker_id, { boxes: number; kg: number }>()` agregando sobre `rawRows`: `Σ quantity` de filas `payment_unit !== 'kg'` → `boxes`, `Σ paid_quantity_kg` de filas `payment_unit === 'kg'` → `kg`.
2. Itera `ranking` **en orden** emitiendo por fila `[posición = índice+1, name, sums.get(id)?.boxes ?? 0, sums.get(id)?.kg ?? 0]`.

Así el orden y los nombres vienen del `ranking` agregado (paridad con la vista) y las cantidades vienen de `rawRows` segmentadas (dato correcto). `rawRows` sale del mismo `useQuery` (campo `rows` del nuevo retorno descrito arriba): el `byWorker`/`units` se conserva para la UI y las filas crudas se exponen vía `rankingData.rows`; no se dispara una query adicional.

**Columnas del CSV de ranking**:

| Columna | Fuente |
|---|---|
| Posición | índice + 1 (orden del ranking de la vista) |
| Trabajador | `name` |
| Producción (cajas) | `Σ quantity` de registros `payment_unit !== 'kg'` del trabajador (0 si no aplica) |
| Producción (kg) | `Σ paid_quantity_kg` de registros `payment_unit === 'kg'` del trabajador (0 si no aplica) |

Ambas columnas se emiten siempre (encabezado estable); un tenant solo-cajas verá "0" en kg y viceversa. No se inventan columnas de ganancia que la vista no muestra. Si en el futuro el dashboard corrige su propio agregado o incorpora ganancia, se alinea la misma utilidad.

## Formas de datos y utilidades nuevas

- `apps/web/src/lib/export/csv.ts`:
  - `type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined }`
  - `toCSV<T>(rows: T[], columns: CsvColumn<T>[]): Blob` — serializa con BOM, `;`, `\r\n`, escapado.
  - `downloadBlob(blob: Blob, filename: string): void` — descarga en el navegador.
- Builders de columnas por informe (producción, ranking) ubicados junto a cada página o en `src/lib/export/` según granularidad; funciones puras testeable sin DOM.

Todo bajo TypeScript estricto, sin `any` (los `row: any` de las páginas existentes se mantienen como están; las utilidades nuevas son genéricas y tipadas).

## Validación de entradas

Las exportaciones no reciben entrada libre del usuario más allá de los filtros ya validados por las páginas:

- **Rango de fechas / filtros** (`/records`): ya controlados por los `<input type="date">`/`<select>` existentes; la exportación solo consume el resultado. Sin validación adicional.
- **Datos a serializar**: pueden contener `;`, comillas o tildes → los maneja el escapado de `toCSV` (regla obligatoria, no opcional). Un valor `null`/`undefined` se serializa como cadena vacía.
- **Lista vacía**: los tres botones se deshabilitan cuando no hay filas; no se genera un archivo vacío.
- **Fallo de generación de PDF**: ya está envuelto en try/catch en `handleExportPDF` con `toast('Error al generar PDF', 'error')`; se mantiene. Para CSV, la serialización es síncrona y no debería fallar; aun así se envuelve en try/catch con un `toast` de error. Ningún fallo es fatal: la página sigue operativa (recuperable, no se propaga).

## Multi-tenant

No se añade ninguna query que pueda cruzar tenants: se exporta lo que las queries existentes ya trajeron bajo el cliente autenticado + RLS. La ampliación de `select` en `/records` (national_id, producto, variedad, net_weight) añade columnas de filas que ya son de la organización del usuario; RLS sigue aplicando. No se usa `createServiceClient` ni se accede a tablas de plataforma. RBAC: el acceso a estas páginas ya está limitado a admin/supervisor (regla 16-19); la exportación no amplía qué datos ve cada rol, solo serializa lo ya visible.

M2-03 **no registra rutas REST nuevas** ni Edge Functions: toda la generación es client-side, por lo que no hay cambios que reflejar en la regla `api-design` (ver "Fuera de alcance: export server-side").

## Testabilidad

- **Unit (Vitest)**: la utilidad `toCSV` y los builders de columnas son funciones puras — se testean sin DOM: BOM presente, separador `;`, escapado de `;`/`"`/`\n`, formato es-CL de números, columnas vacías estables, orden de columnas. Es el núcleo con más riesgo de regresión y queda cubierto aquí.
- **Integración/componente**: el gating por flag se puede testear montando la página con `useFeatureFlag` mockeado (botón presente/ausente según `report_export` y `disable_pdf_export`).
- **Difícil de testear automáticamente**: la descarga real del `Blob` (depende del navegador) y el render binario del PDF — se verifican manualmente abriendo los archivos.

## Verificación esperada

1. `npm run build` (o el build de `apps/web`) y `tsc` sin errores en estricto.
2. Vitest de `toCSV`/builders en verde.
3. Migración aplica (`supabase db reset` local) y el flag `report_export` aparece en `platform_feature_flags` con default `false`.
4. Manual, con `report_export` activado para la org de prueba:
   - `/records`: filtrar por rango/trabajador/paño, exportar CSV; abrir en LibreOffice/Excel y confirmar tildes/ñ, columnas separadas, cantidades box vs kg correctas, montos en pesos.
   - `/dashboard`: exportar ranking; confirmar posiciones y nombres.
   - `/settlements`: exportar PDF; confirmar desglose por jornada/paño/producto/variedad, cantidades con unidad correcta, resumen de cantidades por unidad y total monetario sin cambios.
   - Con `disable_pdf_export` activado: el botón PDF desaparece, los CSV siguen.
   - Con `report_export` desactivado: ningún botón de export aparece y las páginas funcionan normal.
5. Documentación: actualizar `CHANGELOG.md` + `docs/changelog.md` (entrada en "Sin publicar"), y `docs/planning/tablero.md` (mover M2-03). El flag nuevo se refleja en el catálogo de `.kiro/steering/feature-flags.md` si se mantiene esa tabla sincronizada.

## Fuera de alcance

- Exportación `.xlsx` nativa (solo CSV).
- Exportación server-side / Edge Function de informes.
- Exportación desde la app móvil.
- Programación/envío automático de reportes (email, scheduled).
- Columnas de ganancia en el ranking (el CSV sí segmenta cajas/kg para no exportar unidades mezcladas, pero no añade monto/ganancia que la vista no calcula).
- Corregir el agregado `units` mezclado del propio dashboard en la UI (solo se corrige el dato exportado; la vista queda igual).
- Rediseño del layout del PDF más allá del resumen de cantidades por unidad.

## Respuestas a la revisión de diseño

### Iteración 3 (actual) — respuesta a `design-review.json` (CHANGES_REQUESTED: 1 MEDIUM + 2 NIT)

Los 3 hallazgos de la revisión de la iteración 2 están corregidos en el cuerpo del documento. Cada afirmación se verificó contra el código real del worktree antes de escribirla.

1. **MEDIUM — el builder del CSV de ranking exige las filas crudas, pero la `queryFn` del ranking solo devuelve el agregado; "reusar el `data`" obliga a un cambio de forma de retorno no especificado que rompe los consumidores de `ranking` en el JSX** → **Corregido.** Verificado en `apps/web/src/app/(dashboard)/dashboard/page.tsx`: la `queryFn` de `useQuery(['dashboard-ranking', selectedDate])` declara `data` como const local y retorna solo `Object.values(byWorker).sort(...).slice(0,10)` (array `[{id,name,units}]`); `maxUnits = Math.max(...(ranking||[]).map(w=>w.units),1)`, `(ranking||[]).length === 0` y `(ranking||[]).map((w,i)=>…)` consumen ese array. Se añadió al diseño la subsección **"Cambio de forma de retorno de la `queryFn` del ranking y actualización de consumidores"**: la `queryFn` pasa a retornar `{ ranking, rows }` (con `rows` mapeando `worker_id`, `quantity:Number`, `payment_unit`, `paid_quantity_kg` como `null`/`Number`), la variable del hook se renombra a `rankingData`, y en el componente se destructura `const ranking = rankingData?.ranking ?? []` y `const rawRows = rankingData?.rows ?? []`, dejando `maxUnits`/`.length`/`.map` intactos sobre `ranking`. El builder consume `rawRows`; no se dispara query adicional. Documentado de forma análoga al fix de `blockMap` en `/records`. Ver "/dashboard — CSV de ranking".

2. **NIT — la columna "Unidad" del CSV de producción dice derivar "Caja"/"Kilo" de `unitLabel`, pero `unitLabel` devuelve "cajas"/"kg"** → **Corregido.** Verificado en `apps/web/src/lib/format.ts`: `unitLabel(unit) => unit === 'kg' ? 'kg' : 'cajas'`; y en `/records` la celda "Unidad" hardcodea `payment_unit === 'kg' ? 'Kilo' : 'Caja'`. Se eligió **una** fuente: la fila "Unidad" de la tabla de columnas ahora especifica la expresión literal `payment_unit === 'kg' ? 'Kilo' : 'Caja'` (misma que la tabla on-screen, para consistencia visual) y aclara que **no** se usa `unitLabel`. Ver tabla "Columnas del CSV de producción".

3. **NIT — el resumen por unidad del PDF usa `formatUnit`/`unitLabel`, pero `SettlementPDF.tsx` hoy no importa de `format.ts` y `formatUnit` para cajas ya incluye la palabra "cajas"** → **Corregido.** Verificado: `SettlementPDF.tsx` no importa de `@/lib/format` (tiene `formatQty` local) y `formatUnit(x, 'box'|undefined)` devuelve `"… cajas"`. Se precisó en el diseño el import a añadir (`import { formatNumber, formatUnit } from '@/lib/format'`) y la composición sin duplicar unidad: `Cajas: ${formatNumber(boxes)} · Kilos: ${formatUnit(kg, 'kg')}` (número crudo para cajas vía `formatNumber`, `formatUnit` solo para kg). Ver "/settlements → Resumen de cantidades por unidad".

### Iteración 2 — respuesta a `design-review.json` (CHANGES_REQUESTED)

Los 6 hallazgos de esta iteración están corregidos en el cuerpo del documento:

1. **MEDIUM — el recálculo del ranking requiere `paid_quantity_kg`, no solo `payment_unit`** → Corregido. El `select` del ranking pasa explícitamente a `select('worker_id, quantity, payment_unit, paid_quantity_kg')` (manteniendo `.eq('work_day', ...)` y `.is('original_record_id', null)`). Ver "/dashboard — CSV de ranking → Ampliación del `select` del ranking".
2. **MEDIUM — contrato de entrada del builder del ranking CSV sin definir** → Corregido con la opción (b): el builder recibe DOS entradas (array `ranking` ya ordenado + filas crudas del día), construye `Map<worker_id, { boxes, kg }>` desde las crudas e itera `ranking` en orden emitiendo `[posición, name, map[id]?.boxes ?? 0, map[id]?.kg ?? 0]`. Reutiliza el `data` de la query del ranking (sin query adicional). Ver "Contrato de entrada del builder".
3. **MEDIUM — cambiar la forma de `blockMap` en `/records` rompe el render on-screen** → Corregido. Se documenta que al pasar `blockMap` a `id → { name, product, variety }` se actualiza el armado de fila a `block_name: blockMap[r.block_id]?.name || '—'` y se añaden `product`/`variety`, para no romper la tabla visible. Ver "/records — Producto/Variedad".
4. **NIT — citas de reglas de dominio incorrectas** → Corregido. Soft-update = reglas 5-6 (en "/records"); "el pago no cambia por destare" = regla 26 (en "/settlements"); la segmentación cajas/kg se describe como invariante implícito de `kg_payment` sin número de regla (en "/dashboard").
5. **NIT — añadir `report_export` a los seeds requiere mover la coma** → Corregido. Se documenta que `report_export` se inserta como nueva última entrada del `VALUES`, poniendo coma al final de la línea `disable_pdf_export`, sin tocar el `ON CONFLICT (key) DO NOTHING`. Ver "Amarre de 3 capas → Catálogo → Seeds".
6. **NIT — dejar escrito que `loading` oculta el botón** → Corregido. Se anota que durante `loading` `enabled` es `false` (degradación limpia sin flicker) y que `/settlements` combina `report_export && !disable_pdf_export` tolerando el `loading` de ambos hooks. Ver "Amarre de 3 capas → Código → Degradación durante `loading`".

### Iteración 1 — respuesta a la revisión previa (resuelta)

1. **HIGH — columna "RUT / Badge" / campo badge inexistente** → Columna única **RUT** con fuente `national_id`; `workers` no tiene campo de badge (solo `qr_badge_url`, no se exporta).
2. **HIGH — fuente de producto/variedad y FK sin especificar** → `select` de `blocks` con embed FK nombrada idéntico a `/settlements`.
3. **MEDIUM — confusión `net_weight_kg` vs `paid_quantity_kg`** → "Cantidad" = `pickingPayableBase`; "Peso neto (kg)" = `r.net_weight_kg` en el `select` de `picking_records`.
4. **MEDIUM — ranking mezcla cajas y kg** → opción (b): columnas separadas "Producción (cajas)" / "Producción (kg)" (ampliado en iteración 2).
5. **MEDIUM — filas de corrección sin especificar** → se exportan las mismas filas que la tabla con columna "Tipo"; CSV detalle fila-a-fila no sumable.
6. **MEDIUM — resumen por unidad del PDF infra-especificado** → calculado en el componente desde `data.records`; `SettlementPDFData` y `totalAmount` no cambian.
7. **NIT — api-design no cubre exportaciones** → nota en "Multi-tenant": sin rutas REST nuevas (client-side).
8. **NIT — nombre de archivo inconsistente** → patrón `{reporte}-{alcance}.csv`.
