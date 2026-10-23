# Verificación — Fix `POST /settlements/generate` devolvía producción cero

Archivo modificado (único): `supabase/functions/settlements/index.ts`
(solo Edge Function / Deno; no se tocó código web ⇒ `apps/web` `npx tsc --noEmit` no aplica).
Sin commit (por instrucción de la tarea). Sin logging de depuración dejado.

## Root cause (confirmado contra la DB local)

`handleGenerate` (y `handleCrewGenerate`) embebían el trabajador con un hint de FK
**inexistente**: `workers!picking_records_worker_id_fkey`. PostgREST responde
`PGRST200` (relación no encontrada) porque `picking_records` tiene **dos** FKs a
`workers` y ninguno se llama así. El código solo desestructuraba `data` e **ignoraba
`error`**, así que `records` quedaba `null`, el bucle no iteraba y la respuesta salía
con `settlements:[]` y totales en 0.

FKs reales (verificados en `pg_constraint`):

```
fk_picking_worker_org        picking_records(worker_id, organization_id)   -> workers   (el correcto)
fk_picking_recorded_by_org   picking_records(recorded_by, organization_id) -> workers
fk_picking_block_org         picking_records(block_id, organization_id)    -> blocks
```

`picking_records_worker_id_fkey` NO existe.

### Segundo defecto latente (descubierto al probar crew-mode ON)

El insert de la liquidación de cuadrilla usaba `.select('*, crews(name, crew_lead_id)')`,
pero `settlements` tiene **dos** FKs a `crews` (`fk_settlements_crew_org` y
`settlements_crew_id_fkey`) ⇒ embed ambiguo `PGRST201`. El `if (!sErr && settlement)`
se lo tragaba ⇒ la liquidación de cuadrilla **nunca se creaba** (0 filas). Esto rompía
el comportamiento crew-mode-ON que la tarea exige preservar, por eso se corrigió con el
hint explícito `crews!fk_settlements_crew_org`.

## El cambio

1. `handleGenerate`: hint de worker corregido (`workers!fk_picking_worker_org`), se
   captura `error` y se propaga (`if (recErr) return error(...)`), y el crew-mode
   efectivo se resuelve con **queries separadas y simples** (`organizations` por
   `orgId` del JWT + `fields.crew_mode_enabled` por `in(fieldIds)`) en vez del embed
   anidado frágil de 3 niveles. El embed de block se reduce a `block:blocks!fk_picking_block_org(field_id)`.
2. `handleCrewGenerate`: mismo fix (hint + manejo de error + resolución de crew-mode por queries separadas).
3. Insert de cuadrilla: `.select('*, crews!fk_settlements_crew_org(name, crew_lead_id)')` para desambiguar.

La agregación (`workerTotals`/`crewTotals`), la dedup (`maybeSingle`), los inserts con
`organization_id: orgId`, el filtro `original_record_id is null` (inmutabilidad), RBAC y
la matemática de `pickingSubtotal` quedan **sin cambios**. No se tocó `packages/shared`.

---

## Evidencia

### 1. ANTES del fix — reproducción del fallo (producción cero)

```bash
ANON='...anon...'
TOKEN=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"admin@losrobles.cl","password":"Robles2026!"}' | jq -r .access_token)

curl -s -X POST "http://127.0.0.1:54321/functions/v1/settlements/generate" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"period_start":"2026-10-20","period_end":"2026-10-22"}'
```

Respuesta (bug):

```json
{"success":true,"data":{"settlements":[],"total_amount":0,"units_by_unit":{"box":0,"kg":0}}}
```

### 2. DESPUÉS del fix — generación individual correcta (crew mode OFF)

Misma llamada:

```json
{
  "success": true,
  "data": {
    "settlements": [
      { "worker_id": "d6f2c765-...", "total_amount": 4560, "status": "pending",
        "payee_type": "worker", "period_start": "2026-10-20", "period_end": "2026-10-22",
        "workers": { "full_name": "Pedro Morales" } },
      { "worker_id": "48e58495-...", "total_amount": 3420, "status": "pending",
        "payee_type": "worker", "period_start": "2026-10-20", "period_end": "2026-10-22",
        "workers": { "full_name": "Rosa Jiménez" } }
    ],
    "total_amount": 7980,
    "units_by_unit": { "box": 21, "kg": 0 }
  }
}
```

→ 2 settlements, total **7980**, box 21. Montos esperados: Pedro `12*380=4560`, Rosa `9*380=3420`. OK

### 3. Persistencia en DB

```bash
docker exec supabase_db_control-picking psql -U postgres -d postgres -c \
 "SELECT payee_type, worker_id, total_amount, status, period_start, period_end FROM settlements WHERE period_start='2026-10-20' AND period_end='2026-10-22' ORDER BY total_amount DESC;"
```

```
 payee_type |              worker_id               | total_amount | status  | period_start | period_end
------------+--------------------------------------+--------------+---------+--------------+------------
 worker     | d6f2c765-d9af-4c6c-8148-f5f58a7104d8 |      4560.00 | pending | 2026-10-20   | 2026-10-22
 worker     | 48e58495-9c00-4bd4-acd3-f238bb87bba8 |      3420.00 | pending | 2026-10-20   | 2026-10-22
(2 rows)
```

`payee_type='worker'`, montos 4560.00 y 3420.00, `status='pending'`. OK

### 4. Idempotencia / dedup

Segunda llamada idéntica → `settlements:[]` (dedup por `maybeSingle`), sin error; en DB
siguen exactamente **2** filas, sin duplicados. OK

```json
{"success":true,"data":{"settlements":[],"total_amount":7980,"units_by_unit":{"box":21,"kg":0}}}
```

### 5. No-regresión crew-mode ON (prueba end-to-end sobre datos de prueba, revertida)

Setup temporal en el tenant repro: se creó la cuadrilla `TEST Crew Regresion`, se asignó
`crew_id` a Pedro y Rosa, se puso `fields.crew_mode_enabled=true` en el campo
`0daf500f-...` y se borraron las settlements del período. `generate`:

```json
{
  "success": true,
  "data": {
    "settlements": [
      { "payee_type": "crew", "crew_id": "cafe0000-...", "worker_id": null,
        "total_amount": 7980, "status": "pending",
        "crews": { "name": "TEST Crew Regresion", "crew_lead_id": "d6f2c765-..." } }
    ],
    "total_amount": 7980,
    "units_by_unit": { "box": 21, "kg": 0 }
  }
}
```

DB:

```
 payee_type |               crew_id                | worker_id | total_amount | status
------------+--------------------------------------+-----------+--------------+---------
 crew       | cafe0000-0000-0000-0000-000000000001 |           |      7980.00 | pending
(1 row)
```

→ Campo con modo capataz + trabajadores con cuadrilla ⇒ **una** liquidación de
cuadrilla (`payee_type='crew'`), producción de ambos agregada (7980). Comportamiento
crew-mode preservado. OK

**Nota importante:** sin el fix del embed ambiguo (paso root cause #2), esta misma prueba
devolvía `settlements:[]` y 0 filas (la cuadrilla no se creaba). El hint
`crews!fk_settlements_crew_org` lo resolvió.

Todas las mutaciones de prueba (crew, crew_id de workers, `crew_mode_enabled` del campo,
settlements temporales) se **revirtieron** al estado original:
`field_mode=NULL`, workers sin crew, crew de prueba eliminada.

### 6. Aislamiento por tenant (bonus, confirmado)

En el período 2026-10-22 hay 11 `picking_records`, pero 9 pertenecen a otra organización;
`generate` (admin del tenant `d71c4380-...`) solo procesó los 2 del propio tenant vía RLS.
El aislamiento por `org` del JWT se mantiene. OK

### 7. Estado final dejado

2 liquidaciones individuales (Pedro 4560, Rosa 3420) en estado `pending` para el período
`2026-10-20..2026-10-22`. Campo `crew_mode_enabled=NULL`, org `crew_mode_enabled=false`.

## Recarga de la función

El `npx supabase functions serve` en curso recogió el cambio automáticamente (no hizo
falta reiniciarlo; la 1ª llamada post-edición ya devolvió las 2 settlements correctas).

## Invariantes de dominio (verificados)

- quantity>0 / rate>0: intactos (solo se corrigió la lectura; `pickingSubtotal` sin cambios).
- Inmutabilidad: solo inserta `status='pending'`; dedup con `maybeSingle` salta existentes; no toca settlements pagadas.
- RBAC: `requireRole(['admin'])` + `requirePermission('settlements.manage')` + `org` del JWT, sin cambios; las nuevas queries corren bajo el mismo cliente con RLS.
- Naming canónico: fields, blocks, workers, picking_records, settlements, crews, organizations.
