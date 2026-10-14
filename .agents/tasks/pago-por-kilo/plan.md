# Plan de implementación — Pago por kilo + Variedades de producto (F-01 + F-05)

> Derivado del `design.md` APROBADO (Rev. 4) y `requirements.md`. Todo el trabajo vive en el
> worktree `/.worktrees/pago-por-kilo` (rama `feature/pago-por-kilo`, base `main`).
> Orden por dependencia: DB → shared → Edge Functions → web/mobile → docs. Cada item deja el
> repo compilable. Sin `any`, TS strict, naming del steering `tech`.

## Comandos reales del proyecto (verificados)

- Instalar deps (si faltan, el root no las tiene instaladas): `npm install --legacy-peer-deps`
  desde la raíz del worktree. macOS **no** tiene `timeout`; no envolver comandos.
- Typecheck/build por workspace: shared no tiene `build` propio (es `main: src/index.ts`); usar
  `npx tsc --noEmit -p packages/shared` si hay tsconfig, o el `build`/`lint` del workspace.
- Lint: `npm run lint` (turbo) o por paquete `npm run lint -w @fundo360/shared`.
- Tests unitarios: `vitest --run` por paquete (`npm run test -w @fundo360/shared`). **Hoy no
  existe ningún archivo de test en el repo**; esta feature crea los primeros en shared.
- Web build: `npm run build -w web` (Next.js 14). Mobile typecheck/lint: `npm run lint -w mobile`.
- **Deno NO está instalado** → las Edge Functions no se pueden `deno check` localmente; se
  verifican con `supabase db reset` + arranque local, o por revisión de SQL/tipos + build de
  clientes. Supabase CLI presente (2.109.0).
- Contenedores: Rancher Desktop responde en `~/.rd/docker.sock` (modo dockerd/moby). `supabase
  db reset` ES viable; si falla, documentar y caer a typecheck/lint/build + revisión de SQL.

---

- [ ] 1. Migración M1 — tabla `product_varieties`.
      Crear la tabla espejando `box_types` (UUID PK, `organization_id` NOT NULL, `product_id`,
      `name`, `status entity_status`, timestamps), FK compuesta `fk_variety_product_org
      (product_id, organization_id)` ON DELETE RESTRICT, `UNIQUE (id, organization_id)`, índices
      en `organization_id`/`product_id`/`status`, índice único parcial de nombre
      case-insensitive solo entre `status='active'`, triggers `set_organization_id` +
      `update_updated_at_column`, RLS con policies `admin_all_product_varieties` y
      `member_read_active_product_varieties`. SQL puro (override consciente del steering, §3).
      Files: `supabase/migrations/20261003000001_create_product_varieties.sql`
      Verify: con contenedores, `npx supabase db reset` aplica sin error y `\d product_varieties`
      muestra la estructura; sin contenedores, revisión del SQL contra `20260927000001` (box_types).

- [ ] 2. Migración M2 — `rates.variety_id` + doble índice único parcial.
      Añadir `rates.variety_id` nullable, FK compuesta `fk_rates_variety_org (variety_id,
      organization_id)` ON DELETE RESTRICT, índice parcial en la FK, DROP del índice
      `idx_rates_product_current` y crear `uq_rates_product_current_no_variety` (WHERE
      status='current' AND variety_id IS NULL) y `uq_rates_product_variety_current` (WHERE
      status='current' AND variety_id IS NOT NULL). Sin backfill. Preserva `amount CHECK > 0`.
      Files: `supabase/migrations/20261003000002_add_rates_variety_id.sql`
      Verify: `supabase db reset` aplica tras M1; insertar dos `current` del mismo sujeto es
      rechazado por el índice único (prueba manual en SQL o revisión del SQL si no hay contenedores).

- [ ] 3. Migración M3 — `blocks.variety_id` + trigger de validación robusto al orden.
      Añadir `blocks.variety_id` nullable, FK compuesta `fk_blocks_variety_org`, índice parcial,
      y función/trigger `validate_block_variety` BEFORE INSERT OR UPDATE OF variety_id, product_id
      que resuelve `v_org := COALESCE(NEW.organization_id, current_org_id())` (robusto al orden de
      triggers BEFORE), valida pertenencia variedad↔producto↔tenant y exige/prohíbe variedad según
      si el producto tiene variedades activas (errores VARIETY_NOT_FOUND / VARIETY_PRODUCT_MISMATCH
      / VARIETY_REQUIRED / ORG_CONTEXT_REQUIRED). No corre retroactivamente (CA-24).
      Files: `supabase/migrations/20261003000003_add_blocks_variety_id.sql`
      Verify: `supabase db reset` aplica tras M2; INSERT de block con variedad de otro producto
      falla con VARIETY_PRODUCT_MISMATCH (prueba SQL o revisión).

- [ ] 4. Migración M4 — `picking_records.payment_unit` + `paid_quantity_kg` con backfill seguro.
      Añadir `payment_unit unit_measure` (NULL inicial) y `paid_quantity_kg NUMERIC(10,3)` nullable;
      backfill `UPDATE ... SET payment_unit='box' WHERE payment_unit IS NULL` (incluye filas de
      auditoría); `ALTER COLUMN payment_unit SET NOT NULL`; CHECK `chk_picking_paid_kg`
      (box⇒paid_quantity_kg NULL; kg⇒paid_quantity_kg>0); índice en `payment_unit`. Orden
      backfill→NOT NULL→CHECK obligatorio. NO tocar el `quantity CHECK > 0` existente (invariante
      de dominio: quantity nunca 0 ni negativa).
      Files: `supabase/migrations/20261003000004_add_picking_payment_fields.sql`
      Verify: `supabase db reset` aplica tras M3; filas seed sobreviven con `payment_unit='box'`
      y `paid_quantity_kg NULL`; CHECK rechaza kg sin kilos (prueba SQL o revisión).

- [ ] 5. Migración M5 — feature flags `kg_payment` y `product_varieties`.
      INSERT en `platform_feature_flags` (key, name, description, category='cosecha',
      strategy='org_override', enabled=false) con `ON CONFLICT (key) DO NOTHING`. No crear flag de
      destare (se reutiliza `box_tare_control`).
      Files: `supabase/migrations/20261003000005_feature_flags_kg_varieties.sql`
      Verify: `supabase db reset` aplica tras M4; `SELECT * FROM platform_feature_flags WHERE key
      IN ('kg_payment','product_varieties')` devuelve 2 filas con enabled=false.

- [ ] 6. Shared — tipos y funciones puras de cálculo.
      En `packages/shared/src/types/index.ts`: añadir interfaz `ProductVariety`; extender `Block`
      (variety_id), `Rate` (variety_id), `PickingRecord` (payment_unit, paid_quantity_kg); añadir
      `SettlementBreakdownLine`; añadir funciones puras `pickingPayableBase`, `pickingSubtotal`,
      `resolveFeatureFlag`. NO tocar `CAPABILITIES`/`CAPABILITY_LABELS`/`ALL_CAPABILITIES` (§4.3).
      En `constants/index.ts`: añadir `ERROR_CODES` nuevos (VARIETY_NOT_FOUND, VARIETY_NOT_ACTIVE,
      VARIETY_PRODUCT_MISMATCH, VARIETY_REQUIRED, VARIETY_TENANT_MISMATCH, VARIETY_NAME_TAKEN,
      KG_WEIGHT_REQUIRED, RATE_UNIT_SUBJECT_NOT_FOUND) y objeto `FEATURE_FLAGS`. En
      `validation/index.ts`: `createProductVarietySchema`, extender createRate/createBlock con
      `variety_id` opcional, añadir `manual_kg` a picking con refine de exclusión mutua +
      redondeo a 3 decimales. Actualizar barrel `index.ts`.
      Files: `packages/shared/src/types/index.ts`, `packages/shared/src/constants/index.ts`,
      `packages/shared/src/validation/index.ts`, `packages/shared/src/index.ts`
      Verify: `npm run lint -w @fundo360/shared` sin errores y typecheck limpio (`npx tsc --noEmit`
      en shared).

- [ ] 7. Shared — tests unitarios de las funciones puras (primeros tests del repo).
      Crear tests Vitest para `pickingPayableBase`, `pickingSubtotal` (box ⇒ quantity×rate; kg ⇒
      paid_quantity_kg×rate; redondeo), `resolveFeatureFlag` (override true/false/null →
      default). Incluir property-based de invariantes (quantity>0, paid_quantity_kg>0 en kg).
      Files: `packages/shared/src/types/picking-payment.test.ts` (o ubicación equivalente junto
      al código)
      Verify: `npm run test -w @fundo360/shared` — todos los tests nuevos pasan.

- [ ] 8. Edge Function nueva `varieties` (CRUD).
      Crear módulo según patrón `products`/`box-types`: GET list (product_id OBLIGATORIO, status
      default active, admin honra `all`, paginación 20/máx 100, meta), GET :id, POST
      (`requireRole(['admin'])`, chequeo nombre activo → VARIETY_NAME_TAKEN 409), PUT :id
      (name/status, desactivar con blocks activos → 409 salvo force, reactivar a nombre tomado →
      409). SIN DELETE físico. Replicar helpers inline si hace falta (Deno no importa shared).
      Files: `supabase/functions/varieties/index.ts` (+ service/validation/types según patrón)
      Verify: con contenedores, `supabase start` + llamadas CRUD; sin contenedores, revisión
      contra `supabase/functions/box-types/`.

- [ ] 9. Edge Function `rates` — tarifa por variedad.
      POST acepta `variety_id` opcional; "mark current as historical" acotado al mismo sujeto
      (product+variety o product+NULL); validar variedad del tenant y del producto
      (VARIETY_PRODUCT_MISMATCH/VARIETY_NOT_FOUND). GET filtra por sujeto (?variety_id). Preserva
      `amount > 0`.
      Files: `supabase/functions/rates/index.ts`
      Verify: revisión + (con contenedores) crear tarifa de producto y de variedad sin
      historizar la del otro sujeto.

- [ ] 10. Edge Function `blocks` — `variety_id`.
      POST/PUT aceptan `variety_id` con validación espejo del trigger (422 legible). List/getOne
      embeben producto+variedad con hint de FK compuesta (`products!fk_blocks_product_org(...)`,
      `product_varieties!fk_blocks_variety_org(...)`).
      Files: `supabase/functions/blocks/index.ts`
      Verify: (con contenedores) el embedding resuelve sin PGRST200; sin contenedores, revisión.

- [ ] 11. Edge Function `picking-records` — ramificación box/kg (create/scan/put/getMy).
      `createPickingRecord`: nueva firma con `kg: { manualKg }`; `select` de blocks extendido con
      `variety_id` + `products!fk_blocks_product_org(unit_measure)` (sin eliminar el join de
      crew_mode); resolución de tarifa SIEMPRE con predicado variety_id (con/sin variedad);
      derivar `paid_quantity_kg` (neto o manual_kg round3) y `payment_unit`; exclusión mutua y
      KG_WEIGHT_REQUIRED enforzados en la función; `estimated_payment` con `pickingSubtotal`.
      `handlePost`/`handleScan` extraen `manual_kg`. `handlePut`: ramificar por
      `original.payment_unit` (box⇒quantity, kg⇒paid_quantity_kg), copiar payment_unit/
      paid_quantity_kg al snapshot de auditoría; mantener invariante quantity>0 y la inmutabilidad
      de `rate_amount_snapshot`/`payment_unit`. `handleGetMy`: `select` extendido, subtotales con
      `pickingSubtotal`, `totals_by_unit:{box,kg}` segmentado, `base`/`payment_unit` por línea.
      Files: `supabase/functions/picking-records/index.ts`
      Verify: (con contenedores) registrar en block kg con destare (paid=net) y manual
      (paid=manual_kg); regresión box idéntica; sin contenedores, revisión del call path.

- [ ] 12. Edge Function `settlements` — cálculo por unidad preservando snapshot.
      En los 3 puntos (handleGenerate, handleCrewGenerate, breakdown de handleGetOne) añadir
      `payment_unit, paid_quantity_kg` al select y usar `pickingSubtotal` replicada inline;
      breakdown devuelve payment_unit/base/rate/subtotal + variety_name (hint FK compuesta);
      totales segmentados `units_by_unit:{box,kg}` y total monetario global. NO tocar el trigger
      `prevent_paid_settlement_update` (settlements `paid` siguen inmutables).
      Files: `supabase/functions/settlements/index.ts`
      Verify: (con contenedores) liquidación mixta box+kg correcta; regresión: período 100% box
      reproduce `total_amount` previo (seed); sin contenedores, revisión.

- [ ] 13. Shared — helper de flag + hook web, refactor hook móvil.
      Crear `apps/web/src/hooks/useFeatureFlag.ts` consumiendo `resolveFeatureFlag` de shared;
      refactorizar `apps/mobile/src/hooks/useFeatureFlag.ts` para usar `resolveFeatureFlag` sin
      cambio de comportamiento (override org → default global).
      Files: `apps/web/src/hooks/useFeatureFlag.ts`, `apps/mobile/src/hooks/useFeatureFlag.ts`
      Verify: `npm run lint -w web` y `npm run lint -w mobile` sin errores.

- [ ] 14. Web — UI de variedades, tarifa por variedad, variedad en paño, unidad en liquidación.
      Pantallas products (sub-sección Variedades), block create/edit (campo variedad obligatorio
      si el producto tiene variedades), rates (selector de sujeto Producto/variedad),
      settlements/records (unidad+base, totales segmentados). Gating con `useFeatureFlag`
      (`product_varieties`, `kg_payment`); degradación limpia con flags off.
      Files: pantallas bajo `apps/web/src/app/(dashboard)/products`, `.../fields/[id]/blocks/...`,
      `.../settlements`, `.../records` y componentes/hooks asociados.
      Verify: `npm run build -w web` compila; con flags off la app funciona como hoy (revisión/E2E).

- [ ] 15. Mobile — captura kg/manual, variedad vía paño, unidad en producción/pagos.
      `app/admin/products.tsx` (gestión variedades con flag), `app/(tabs)/register.tsx` (ramas
      box / kg+destare / kg manual según unit_measure, gating `kg_payment`), `production.tsx` y
      `payments.tsx` (unidad correcta, `totals_by_unit`). Sin módulos nativos nuevos.
      Files: `apps/mobile/app/admin/products.tsx`, `apps/mobile/app/(tabs)/register.tsx`,
      `apps/mobile/app/(tabs)/production.tsx`, `apps/mobile/app/(tabs)/payments.tsx`
      Verify: `npm run lint -w mobile` sin errores; typecheck limpio.

- [ ] 16. Verificación integral + no-regresión.
      Con contenedores (Rancher en dockerd/moby): `npx supabase db reset` aplica M1–M5 en orden;
      crear producto kg + variedad + tarifa por variedad, registrar y liquidar (paid=net y
      paid=manual_kg) y confirmar liquidación por kg; confirmar que un período 100% box reproduce
      el `total_amount` previo (no-regresión). Si falla el entorno de contenedores, documentarlo y
      verificar con typecheck/lint/build de todos los workspaces + revisión del SQL.
      Files: — (ejecución/verificación)
      Verify: `supabase db reset` sin error + escenarios kg/box OK, o build/lint/test verdes +
      revisión documentada.

- [ ] 17. Documentación (steering `documentation`).
      Actualizar `CHANGELOG.md` (sección "Sin publicar") y `docs/changelog.md`; mover F-01 (y
      F-05) a "Hecho" en `docs/planning/tablero.md` registrando variedades + tarifa por variedad;
      actualizar `docs/dominio/reglas-de-negocio.md`, `docs/api/vision-general.md`,
      `docs/legacy/decisiones-negocio.md` (cerrar decisiones 1 y 4).
      Files: `CHANGELOG.md`, `docs/changelog.md`, `docs/planning/tablero.md`,
      `docs/dominio/reglas-de-negocio.md`, `docs/api/vision-general.md`,
      `docs/legacy/decisiones-negocio.md`
      Verify: `npm run docs:build` (mkdocs --strict) si está disponible; si no, revisión de que
      los enlaces/entradas existen y F-01 está en Hecho.
