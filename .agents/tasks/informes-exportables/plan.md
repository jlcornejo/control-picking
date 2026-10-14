# Implementation Plan — M2-03 Informes exportables (dashboard web)

Base: worktree `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/informes-exportables` (rama `feature/informes-exportables`).
Diseño APROBADO: `.agents/tasks/informes-exportables/design.md`. Todos los paths son absolutos bajo el worktree.
Sin dependencias nuevas (jsPDF/jspdf-autotable ya presentes; CSV manual). Multi-tenant por RLS; toda la generación es client-side.

Invariantes de dominio preservadas: el pago (`totalAmount`) no cambia (regla 26), `SettlementPDFData` no se amplía, el PDF es solo lectura sobre `settlements` (inmutabilidad regla 14), RBAC intacto (las páginas ya están limitadas a admin/supervisor), nombres de entidad correctos (`picking_records`, `settlements`, `workers`, `blocks`, `products`, `product_varieties`).

Comandos de verificación del proyecto (descubiertos durante la exploración):
- Typecheck/build web: `npm run build -w @fundo360/web` (Next 15, TS strict `noEmit`).
- Tests web: `npm run test -w @fundo360/web` (vitest `--run`, zero-config; recoge `src/**/*.test.ts`). Hoy no hay tests ni config en `apps/web`; se añade un test file y vitest zero-config lo recoge.
- Tests shared: `npm run test -w @fundo360/shared`.
- Migración/seed local: `npm run db:reset` (requiere Rancher en modo dockerd/moby — ver steering local-env). Si el entorno de contenedores no está disponible, verificar la migración/seed por inspección SQL y dejar constancia.

Orden por dependencia: migración/flag (capa catálogo) → utilidad CSV compartida + tests (capa código reutilizable) → páginas web que consumen flag+utilidad (/settlements, /records, /dashboard) → docs. `packages/shared` NO requiere cambios (los helpers `pickingPayableBase`/`pickingSubtotal`/`resolveFeatureFlag` ya existen y se reutilizan).

---

- [ ] 1. Crear la migración del flag `report_export` y sembrarlo en ambos seeds.
      Nueva migración siguiendo el patrón de `20261003000005_feature_flags_kg_varieties.sql`: `INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES ('report_export', 'Informes exportables', 'Habilita la exportación de informes desde el dashboard web: PDF de liquidaciones y CSV de producción y rankings.', 'analitica', 'org_override', false) ON CONFLICT (key) DO NOTHING;` con header de reversibilidad (`DELETE FROM platform_feature_flags WHERE key = 'report_export';`). En `seed.sql` y `_seed_remote.sql`: poner coma al final de la línea `('disable_pdf_export', ...)` y añadir debajo la fila `('report_export', 'Informes exportables', '...', 'analitica', 'org_override', false)` antes de `ON CONFLICT (key) DO NOTHING;` (NO basta añadir la fila: sin la coma el SQL es inválido).
      Files: `supabase/migrations/20261004000001_feature_flag_report_export.sql` (nuevo), `supabase/seed.sql`, `supabase/_seed_remote.sql`.
      Verify: `npm run db:reset` y confirmar `SELECT key, enabled FROM platform_feature_flags WHERE key='report_export';` → 1 fila `false`. Si no hay runtime de contenedores, revisar la sintaxis SQL (coma añadida, `ON CONFLICT` intacto) y dejarlo documentado.

- [ ] 2. Crear la utilidad CSV pura y sus tests unitarios.
      `toCSV<T>(rows, columns)` → `Blob` con BOM `\uFEFF`, separador `;`, EOL `\r\n`, escapado (`;`/`"`/`\n`/`\r` → comillas dobles, `"`→`""`), `null`/`undefined` → cadena vacía. `downloadBlob(blob, filename)` crea `<a download>`, click y revoca URL. `type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined }`. TS strict, sin `any`.
      Files: `apps/web/src/lib/export/csv.ts` (nuevo), `apps/web/src/lib/export/csv.test.ts` (nuevo).
      Verify: `npm run test -w @fundo360/web` — tests de BOM, separador, escapado de `;`/`"`/salto de línea, campos vacíos estables y orden de columnas en verde. `npm run build -w @fundo360/web` sin errores.

- [ ] 3. Gating + resumen por unidad del PDF de liquidaciones en `/settlements`.
      En `SettlementPDF.tsx`: añadir `import { formatNumber, formatUnit } from '@/lib/format'`; calcular dentro de `generateSettlementPDF` desde `data.records` el resumen `boxes = Σ base` de `payment_unit !== 'kg'` y `kg = Σ base` de `payment_unit === 'kg'`, y renderizar SIEMPRE una línea justo antes de "TOTAL A PAGAR": `Cajas: ${formatNumber(boxes)} · Kilos: ${formatUnit(kg, 'kg')}`. NO cambiar `SettlementPDFData` ni `totalAmount`. En `settlements/page.tsx`: llamar `useFeatureFlag('report_export')` y `useFeatureFlag('disable_pdf_export')` y envolver el botón "↓ PDF" para que solo se renderice si `report_export && !disable_pdf_export`.
      Files: `apps/web/src/components/settlement/SettlementPDF.tsx`, `apps/web/src/app/(dashboard)/settlements/page.tsx`.
      Verify: `npm run build -w @fundo360/web` sin errores. Manual (con `report_export` on): el PDF muestra la línea de resumen por unidad y el total monetario sin cambios; con `disable_pdf_export` on el botón PDF desaparece; con `report_export` off no aparece.

- [ ] 4. CSV de producción en `/records`.
      Ampliar selects: `workers.select('id, full_name, national_id')`; `blocks.select('id, name, products!fk_blocks_product_org(name), product_varieties!fk_blocks_variety_org(name)')`; añadir `net_weight_kg` al select de `picking_records`. Cambiar `blockMap` a `id → { name, product, variety }` y actualizar el armado de fila: `block_name: blockMap[r.block_id]?.name || '—'`, añadiendo `product` y `variety` (la columna `block_name` on-screen sigue igual). Botón "Exportar CSV" junto al `PageHeader`, gated por `useFeatureFlag('report_export')`, deshabilitado si no hay filas; `onClick` arma columnas (Fecha, Trabajador, RUT, Paño, Producto, Variedad, Cantidad=`base`, Unidad=`payment_unit==='kg'?'Kilo':'Caja'`, Peso neto (kg)=`net_weight_kg`, Tarifa, Monto estimado=`total`, Tipo) vía `toCSV` y descarga `produccion-{dateFrom}_{dateTo}.csv` con `downloadBlob`, envuelto en try/catch con `toast` de error.
      Files: `apps/web/src/app/(dashboard)/records/page.tsx` (opcional: builder puro `apps/web/src/lib/export/records-csv.ts` + test).
      Verify: `npm run build -w @fundo360/web` sin errores; si se extrae el builder, `npm run test -w @fundo360/web` en verde. Manual: filtrar y exportar; abrir en LibreOffice/Excel y confirmar tildes/ñ, columnas separadas, cantidades box vs kg, montos en pesos; la tabla on-screen intacta.

- [ ] 5. CSV de ranking en `/dashboard`.
      Ampliar el select del ranking a `select('worker_id, quantity, payment_unit, paid_quantity_kg')` (mantener `.eq('work_day', ...)` y `.is('original_record_id', null)`). Cambiar el retorno de la `queryFn` a `{ ranking, rows }` (rows: `{ worker_id, quantity:Number, payment_unit, paid_quantity_kg: null|Number }`), renombrar la variable del hook a `rankingData` y destructurar en el componente `const ranking = rankingData?.ranking ?? []; const rawRows = rankingData?.rows ?? [];` (deja `maxUnits`, `.length` y `.map` intactos). Botón "Exportar CSV" junto al encabezado "Ranking", gated por `useFeatureFlag('report_export')`, deshabilitado si `ranking` vacío; builder: `sums = Map<worker_id,{boxes,kg}>` desde `rawRows` (`Σ quantity` si `!=='kg'` → boxes; `Σ paid_quantity_kg` si `==='kg'` → kg), iterar `ranking` en orden emitiendo `[posición, name, boxes, kg]`; descarga `ranking-{selectedDate}.csv`.
      Files: `apps/web/src/app/(dashboard)/dashboard/page.tsx` (opcional: builder puro `apps/web/src/lib/export/ranking-csv.ts` + test).
      Verify: `npm run build -w @fundo360/web` sin errores; si se extrae el builder, `npm run test -w @fundo360/web` en verde. Manual: exportar y confirmar posiciones/nombres y columnas "Producción (cajas)"/"Producción (kg)" sin unidades mezcladas; la UI del dashboard intacta.

- [ ] 6. Documentación.
      Entrada en "Sin publicar" de `CHANGELOG.md` y `docs/changelog.md` (feat: informes exportables + flag `report_export` + conexión del kill-switch `disable_pdf_export` al PDF). Mover/actualizar la fila M2-03 en `docs/planning/tablero.md`. Añadir `report_export` al catálogo de `.kiro/steering/feature-flags.md` (tabla de flags vigentes).
      Files: `CHANGELOG.md`, `docs/changelog.md`, `docs/planning/tablero.md`, `.kiro/steering/feature-flags.md`.
      Verify: revisión de que las entradas existen y son coherentes; `npm run docs:build` si el entorno lo permite (opcional).

## Supuestos

- Vitest en `apps/web` corre zero-config (igual que `@fundo360/shared`), recogiendo `src/**/*.test.ts`. No se añade config a menos que el run falle; si falla por entorno DOM, los tests se limitan a funciones puras (toCSV/builders) que no requieren DOM.
- Si el runtime de contenedores (Rancher/Supabase local) no está disponible, la migración/seed se verifican por inspección SQL; el resto se valida con build/test de `@fundo360/web`.
- Los builders de CSV de producción/ranking pueden vivir inline en cada página o extraerse a `src/lib/export/`; se recomienda extraerlos para testear como funciones puras, pero no es bloqueante.
