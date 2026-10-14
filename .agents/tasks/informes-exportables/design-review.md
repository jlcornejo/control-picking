# Design Review — M2-03 Informes exportables (iteración 3)

Revisión del diseño `design.md` verificando cada afirmación contra el código real del worktree. Esta iteración se enfoca en confirmar el cierre de los 3 hallazgos abiertos (1 MEDIUM + 2 NIT) de la ronda anterior; el resto del diseño ya convergió en rondas previas y se re-verificaron los puntos clave que esos hallazgos tocan.

## Hallazgos pendientes de la iteración anterior — estado

### (1) MEDIUM — CSV de ranking reusa filas crudas que la `queryFn` no expone → **CERRADO**

Verificado en `apps/web/src/app/(dashboard)/dashboard/page.tsx`:

- La `queryFn` de `useQuery(['dashboard-ranking', selectedDate])` hace `supabase.from('picking_records').select('worker_id, quantity').eq('work_day', selectedDate).is('original_record_id', null)`, declara `data` como const local, acumula en `byWorker[...].units += Number(r.quantity)` y retorna **solo** `Object.values(byWorker).sort((a,b)=>b.units-a.units).slice(0,10)` — un array `[{ id, name, units }]`. Las filas crudas no salen del hook.
- Los tres consumidores existen tal como el diseño afirma: `const maxUnits = Math.max(...(ranking || []).map(w => w.units), 1);`, `(ranking || []).length === 0` y `(ranking || []).map((w, i) => …)`.

El diseño documenta explícitamente el cambio de forma de retorno a `{ ranking, rows }` (con `rows` mapeando `worker_id`, `quantity: Number`, `payment_unit`, `paid_quantity_kg` como `null`/`Number`), el renombre de la variable del hook a `rankingData`, y la destructuración `const ranking = rankingData?.ranking ?? []` / `const rawRows = rankingData?.rows ?? []`, dejando `maxUnits`/`.length`/`.map` intactos sobre `ranking`. También amplía el `select` a `select('worker_id, quantity, payment_unit, paid_quantity_kg')` manteniendo los filtros `.eq`/`.is`, y define el contrato del builder (dos entradas: `ranking` ordenado + `rawRows`; `Map<worker_id,{boxes,kg}>` desde `rawRows`; itera `ranking` en orden). No se dispara query adicional. El cambio y la actualización de consumidores quedan documentados. Cerrado.

### (2) NIT — fuente de la columna "Unidad" del CSV de producción → **CERRADO**

Verificado en `apps/web/src/lib/format.ts`: `unitLabel(unit) => unit === 'kg' ? 'kg' : 'cajas'` (minúsculas, plural para cajas). Verificado en `apps/web/src/app/(dashboard)/records/page.tsx` línea 171: la celda "Unidad" de la tabla on-screen renderiza `row.payment_unit === 'kg' ? 'Kilo' : 'Caja'`.

El diseño eligió **una** fuente coherente y la escribió: la fila "Unidad" de la tabla de columnas especifica la expresión literal `payment_unit === 'kg' ? 'Kilo' : 'Caja'` (idéntica a la celda on-screen, para consistencia visual) y aclara explícitamente que **no** usa `unitLabel`. Coherente y sin ambigüedad. Cerrado.

### (3) NIT — resumen por unidad del PDF (import de `@/lib/format` y composición sin duplicar unidad) → **CERRADO**

Verificado en `apps/web/src/components/settlement/SettlementPDF.tsx`: el componente importa solo `jsPDF` y `autoTable`, tiene un `formatQty` local y **no** importa nada de `@/lib/format`. Las filas `data.records` ya traen `payment_unit` y `base` (interfaz `SettlementRecord`). Verificado en `format.ts`: `formatNumber` devuelve un número con separador de miles **sin unidad**, `formatUnit(x,'kg')` devuelve `"… kg"` y `formatUnit(x,'box'|undefined)` devuelve `"… cajas"` (ya incluye la palabra).

El diseño precisa el import a añadir (`import { formatNumber, formatUnit } from '@/lib/format'`, sin `unitLabel`) y la composición sin duplicar la unidad: `Cajas: ${formatNumber(boxes)} · Kilos: ${formatUnit(kg, 'kg')}` — número crudo para cajas vía `formatNumber` (evita el `"… cajas"` que `formatUnit` prefijaría), y `formatUnit` solo para kg. También aclara que el resumen se deriva de `data.records` sin tocar `SettlementPDFData` ni `totalAmount`. Composición correcta y verificada contra el comportamiento real de `format.ts`. Cerrado.

## Verified Assumptions

- `dashboard/page.tsx`: la `queryFn` del ranking usa `select('worker_id, quantity')`, retorna un array `[{id,name,units}]`, y `maxUnits`/`(ranking||[]).length`/`(ranking||[]).map` consumen ese array — confirmado leyendo el archivo.
- `format.ts`: `unitLabel` → `'kg'`/`'cajas'`; `formatNumber` → número sin unidad; `formatUnit(_, 'kg')` → `"… kg"`; `formatUnit(_, 'box')` → `"… cajas"` — confirmado.
- `records/page.tsx`: celda "Unidad" = `row.payment_unit === 'kg' ? 'Kilo' : 'Caja'` (línea 171); importa `formatUnit, unitLabel` de `@/lib/format`; ya segmenta `totalBoxes`/`totalKg` por `payment_unit` — confirmado.
- `SettlementPDF.tsx`: solo importa `jsPDF`/`autoTable`, `formatQty` local, sin import de `@/lib/format`; `SettlementRecord` incluye `payment_unit` y `base`; pinta "TOTAL A PAGAR" sin segmentación por unidad — confirmado.

## Unverified / Wrong Assumptions

Ninguna. Las afirmaciones del diseño asociadas a los 3 hallazgos (y los puntos de código que tocan) coinciden con el código real del worktree. No se detectaron afirmaciones falsas ni infra-especificadas en el alcance revisado.

## Veredicto

HIGH: 0 · MEDIUM: 0 · NIT: 0 → **APPROVED**

Los tres hallazgos acotados de la iteración anterior están genuinamente cerrados y documentados contra el código real. El diseño está listo para implementación.
