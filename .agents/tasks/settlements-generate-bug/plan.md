# Plan de corrección — `POST /settlements/generate` devuelve producción cero

Archivo del endpoint: `supabase/functions/settlements/index.ts` → `handleGenerate`.

## Root cause (confirmado por instrumentación/reproducción)

**El embed de `handleGenerate` usa un hint de FK inexistente (`picking_records_worker_id_fkey`). PostgREST responde `PGRST200` (relación no encontrada), pero el handler solo desestructura `data` e ignora `error`, así que `records` queda en `null`, el bucle no itera y la respuesta sale con `settlements:[]` y totales en 0.**

### Evidencia

1. Reproducción del bug (admin token real, datos presentes):
   ```
   POST /functions/v1/settlements/generate {"period_start":"2026-10-20","period_end":"2026-10-22"}
   -> {"success":true,"data":{"settlements":[],"total_amount":0,"units_by_unit":{"box":0,"kg":0}}}
   ```
   Los 2 picking_records (Pedro 12 box, Rosa 9 box, rate 380, `original_record_id` NULL) existen en el tenant `d71c4380-9d7f-40a4-86f2-c7c32c89acf2`.

2. La query del embed, ejecutada vía PostgREST REST con el **mismo hint que usa la función** (`worker:workers!picking_records_worker_id_fkey(...)`), devuelve el error, NO filas:
   ```json
   {"code":"PGRST200","message":"Could not find a relationship between 'picking_records' and 'workers' in the schema cache",
    "details":"...using the hint 'picking_records_worker_id_fkey' ... but no matches were found."}
   ```

3. Los FKs reales de `picking_records → workers` son dos (por eso hace falta hint para desambiguar), y **ninguno** se llama `picking_records_worker_id_fkey`:
   - `fk_picking_worker_org`  (worker_id → workers)  ← el correcto
   - `fk_picking_recorded_by_org` (recorded_by → workers)

4. Con el hint corregido (`worker:workers!fk_picking_worker_org(...)`) y el resto del embed intacto, la REST devuelve **las 2 filas** (HTTP 200), con `worker.crew_id=null`, `field.crew_mode_enabled=null`, `org.crew_mode_enabled=false` ⇒ `crewModeEffective=false` ⇒ liquidaciones individuales. Montos esperados: Pedro `12*380=4560`, Rosa `9*380=3420`.

5. El código swallowea el error: `const { data: records } = await supabase.from('picking_records').select(...)...;` — no captura `error`, así que un `PGRST200` es invisible (la función no tiene logging interno). Esto es lo que hace el fallo silencioso.

### Hipótesis descartadas (verificadas, no asumidas)

- **Routing / `subResource`**: el runtime de Supabase Edge quita el prefijo `/functions/v1`, por lo que dentro de la función `url.pathname = /settlements/generate` y `pathParts[1] = 'generate'`. Confirmado porque (a) todas las demás Edge Functions del repo usan la misma convención `pathParts[1]`/`[2]` y funcionan, (b) los logs del contenedor muestran `serving the request with supabase/functions/settlements`, y (c) la respuesta es un JSON de generate bien formado (no `NOT_FOUND`). Routing NO es el problema.
- **Import de `handleCors`**: está correctamente importado desde `../_shared/cors.ts`. OK.
- **Auth / claims / RLS / org**: el token admin trae `app_role=admin`, `org_id=d71c4380-...`, `is_platform_admin=false`, `subscription_active=true`. La política `admin_all_settlements` y la lectura de picking funcionan (la REST con el mismo token devuelve las filas al corregir el hint). NO es el problema.
- **`crew-mode` embed de 3 niveles** (`block:blocks(field:fields(crew_mode_enabled, organization:organizations(...)))`): resuelve bien SIN hints (cada salto tiene un solo FK relevante). Verificado: la misma query solo con el hint de worker corregido devuelve ambas filas. Aun así, la corrección preferida resuelve el crew-mode con una query separada y robusta (ver más abajo) para no depender de un embed anidado frágil.

## El cambio de código

Archivo único: `supabase/functions/settlements/index.ts`.

### Cambio 1 (obligatorio) — corregir el hint de FK y dejar de tragarse el error en `handleGenerate`

Reemplazar la obtención de `records` en `handleGenerate` por una versión que (a) use el hint correcto `fk_picking_worker_org`, (b) capture `error` y lo propague, y (c) resuelva crew-mode de forma robusta.

Enfoque recomendado (resolver crew-mode con una query separada, evitando el embed anidado de 3 niveles):

```ts
// 1) Registros del período (sin embed anidado de crew-mode). Hint de worker CORREGIDO.
const { data: records, error: recErr } = await supabase
  .from('picking_records')
  .select(`
    quantity,
    payment_unit,
    paid_quantity_kg,
    rate_amount_snapshot,
    worker:workers!fk_picking_worker_org(id, crew_id),
    block:blocks!fk_picking_block_org(field_id)
  `)
  .gte('work_day', body.period_start)
  .lte('work_day', body.period_end)
  .is('original_record_id', null);
if (recErr) return error('VALIDATION_ERROR', recErr.message, 400);

// 2) crew_mode efectivo por campo, en una sola query simple y confiable.
const orgDefaultCrewMode = /* ver abajo */;
const fieldIds = [...new Set((records ?? []).map((r: any) => r.block?.field_id).filter(Boolean))];
const fieldModeById = new Map<string, boolean | null>();
if (fieldIds.length) {
  const { data: fields, error: fErr } = await supabase
    .from('fields')
    .select('id, crew_mode_enabled')
    .in('id', fieldIds);
  if (fErr) return error('VALIDATION_ERROR', fErr.message, 400);
  for (const f of fields ?? []) fieldModeById.set(f.id, f.crew_mode_enabled);
}
```

Para el default de la organización (`orgDefaultCrewMode`), usar el `orgId` que ya se obtiene de `getOrgId(req)`:

```ts
const { data: org } = await supabase
  .from('organizations')
  .select('crew_mode_enabled')
  .eq('id', orgId)
  .single();
const orgDefaultCrewMode = org?.crew_mode_enabled ?? false;
```

Y dentro del bucle, sustituir la derivación actual de `fieldMode`/`orgMode` por el lookup del Map:

```ts
const fieldMode = fieldModeById.get(r.block?.field_id) ?? null;
const crewModeEffective = fieldMode === null || fieldMode === undefined ? orgDefaultCrewMode : fieldMode;
const crewId = r.worker?.crew_id ?? null;
```

El resto de `handleGenerate` (agregación en `workerTotals`/`crewTotals`, dedup con `maybeSingle`, inserts con `organization_id: orgId`, respuesta) queda **igual**. Esto preserva aislamiento por tenant (org del JWT), inmutabilidad (`original_record_id is null`), dedup por período y la lógica crew on/off.

Notas de verificación del esquema (ya comprobadas):
- `settlements → workers`: único FK `fk_settlements_worker_org` ⇒ el embed `.select('*, workers(full_name)')` del insert individual es NO ambiguo. OK.
- `fk_picking_worker_org` y `fk_picking_block_org` existen y son los correctos.

### Cambio 2 (opcional, mínimo) — si se prefiere el fix más pequeño

Si se quiere el parche más chico en vez del refactor del Cambio 1: solo (a) cambiar `workers!picking_records_worker_id_fkey` por `workers!fk_picking_worker_org` en el `select` de `handleGenerate`, y (b) capturar `error` (`const { data: records, error: recErr } = ...; if (recErr) return error(...)`). Verificado que con eso la REST devuelve ambas filas y el embed de crew-mode de 3 niveles resuelve sin hints. El Cambio 1 es preferible por robustez (la tarea pide evitar el embed anidado frágil).

### Cambio 3 (auditoría, aplicar el mismo fix) — `handleCrewGenerate`

`handleCrewGenerate` usa **exactamente el mismo embed roto** (`worker:workers!picking_records_worker_id_fkey(...)` + `block:blocks(field:fields(... organizations ...))`) y también ignora `error`. Tiene el mismo bug latente (devolvería cero para el crew_lead). Aplicar la misma corrección de hint/manejo de error ahí para no dejar el defecto a medias. No está en los datos de repro, pero es el mismo root cause.

## Invariantes de dominio (verificados para este fix)

- **quantity > 0 / rates > 0**: el fix no toca cantidades ni tarifas; solo corrige la lectura. Datos repro: quantity 12/9, rate 380.
- **Inmutabilidad de settlements pagadas**: el fix solo inserta liquidaciones nuevas `status='pending'` y conserva la dedup (`maybeSingle` salta las existentes). No modifica ni re-genera settlements pagadas.
- **RBAC**: se mantienen `requireRole(['admin'])` + `requirePermission('settlements.manage')` y el aislamiento por `org_id` del JWT, sin cambios.
- **Naming de entidades**: se usan los nombres canónicos (fields, blocks, products, rates, workers, picking_records, settlements, payments).

## Cómo recargar/reiniciar la función para probar

El `functions serve` local **no recarga en caliente** de forma fiable. Tras editar `supabase/functions/settlements/index.ts`:

1. Detener el `npx supabase functions serve` en curso (Ctrl-C en su terminal; hay un proceso `supabase functions serve` corriendo, PID visible con `ps aux | grep "functions serve"`).
2. Volver a levantarlo desde la raíz del repo:
   ```bash
   npx supabase functions serve
   ```
   (Requiere Rancher Desktop en modo `dockerd (moby)`, ya activo: contenedores `supabase_*` corriendo.)
3. Esperar a que loguee que sirve las funciones antes de probar.

## Pasos de verificación

Usar el ANON key local y obtener token admin:

```bash
ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
TOKEN=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"admin@losrobles.cl","password":"Robles2026!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
```

1. **Generación correcta** (resultado esperado: 2 settlements, total 7980):
   ```bash
   curl -s -X POST "http://127.0.0.1:54321/functions/v1/settlements/generate" \
     -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"period_start":"2026-10-20","period_end":"2026-10-22"}' | python3 -m json.tool
   ```
   Esperado: `data.settlements` con 2 elementos `payee_type='worker'`, `status='pending'`, períodos `2026-10-20..2026-10-22`; montos Pedro `4560.00`, Rosa `3420.00`; `total_amount=7980`, `units_by_unit.box=21`.

2. **Persistencia en DB**:
   ```bash
   docker exec supabase_db_control-picking psql -U postgres -d postgres -c \
     "SELECT payee_type, worker_id, total_amount, status FROM settlements WHERE period_start='2026-10-20' AND period_end='2026-10-22' ORDER BY total_amount DESC;"
   ```
   Esperado: 2 filas (4560.00 y 3420.00), `payee_type=worker`, `status=pending`.

3. **Idempotencia / dedup**: repetir la llamada del paso 1. Esperado: `settlements:[]` (ya existen, `maybeSingle` las salta) pero NO error; en DB siguen siendo 2 filas, sin duplicados (índices `uq_settlement_worker_period` lo garantizan).

4. **No-regresión crew mode (opcional)**: con un tenant/campo `crew_mode_enabled=true` y worker con `crew_id`, confirmar que se crea `payee_type='crew'` en vez de individual. (No cubierto por los datos de repro; validar si se toca `handleCrewGenerate`.)

5. **Limpieza de instrumentación**: si durante el diagnóstico se añadió logging temporal (`console.log` de `records?.length`, `recErr`, `crewModeEffective`), eliminarlo antes de cerrar. El fix final NO debe dejar logs de depuración; si se desea observabilidad permanente, dejar solo el manejo de `error` (que ya devuelve 400 con mensaje) en lugar de tragarlo.

## Riesgos y notas

- Cambio local y reversible (un archivo de Edge Function). No toca DB, RLS ni infraestructura.
- No se debe hacer commit (instrucción de la tarea).
- El fix mantiene org desde JWT (`getOrgId`), el filtro `original_record_id is null` (inmutabilidad) y la dedup por período — sin cambios de comportamiento salvo que ahora SÍ encuentra producción.
