# Revisión de diseño — M2-01b `payment_photo_evidence`

Revisión independiente del diseño en `.agents/tasks/pago-imagenes/design.md`. Cada
afirmación verificable del diseño se contrastó contra el código real del worktree
(`.worktrees/pago-imagenes`). El veredicto es mecánico: cualquier hallazgo HIGH o
MEDIUM ⇒ CHANGES_REQUESTED.

## Resumen del veredicto

El diseño es sólido, bien fundamentado y replica fielmente los precedentes de
seguridad y multi-tenant del repo. Verifiqué contra el código la gran mayoría de
sus afirmaciones y resultaron correctas (ver "Supuestos verificados"). No encontré
hallazgos HIGH ni MEDIUM que impidan implementar. Los puntos abiertos son NIT
(precisiones de redacción o notas de implementación menores) y no cambian el
veredicto.

**Veredicto: APPROVED** (0 HIGH, 0 MEDIUM).

---

## Hallazgos

### 1. NIT — Afirmación imprecisa: el alcance de roles NO es "más restrictivo que picking"

Ubicación: §2.3 ("Justificación del alcance de roles en el INSERT de Storage… Esto
es más restrictivo que picking (que incluye terreno)") y §7.

El diseño afirma que su policy de INSERT en Storage (`is_admin() OR is_supervisor()
OR is_crew_lead()`) es *más restrictiva* que la de picking porque picking "incluye
terreno". Al leer `20261002000001_create_picking_photo_evidence.sql`, la policy
`org_insert_picking_evidence` usa **exactamente los mismos tres roles**
(`is_admin() OR is_supervisor() OR is_crew_lead()`). No incluye `is_worker()`. Es
decir, el alcance es **idéntico**, no más restrictivo.

Fix: corregir el texto a "mismo alcance de roles que picking
(admin/supervisor/crew_lead); un `worker` no sube evidencia en ninguna de las dos
features". La decisión de roles es correcta; solo la justificación comparativa está
mal redactada.

### 2. NIT — Precedente `picking_photo_evidence` NO está en `FEATURE_FLAGS` de shared

Ubicación: §5(2) y §6 (se añade `FEATURE_FLAGS.PAYMENT_PHOTO_EVIDENCE`).

Verifiqué `packages/shared/src/constants/index.ts`: `FEATURE_FLAGS` contiene
`KG_PAYMENT`, `PRODUCT_VARIETIES`, `BOX_TARE_CONTROL`, `DISPATCH_GUIDES`, pero **no**
`PICKING_PHOTO_EVIDENCE`. O sea, el precedente directo (picking) consume el flag por
string literal sin constante en `FEATURE_FLAGS`. El diseño propone, correctamente,
añadir `PAYMENT_PHOTO_EVIDENCE` a la constante (mejora sobre el precedente). No es un
problema del diseño; se anota solo para que el implementador no espere encontrar
`PICKING_PHOTO_EVIDENCE` como referencia a copiar y para mantener consistencia.

Fix: ninguno obligatorio. Opcional: añadir también `PICKING_PHOTO_EVIDENCE` a la
constante en la misma pasada para cerrar la deuda del precedente (fuera de alcance
si se quiere acotar).

### 3. NIT — `uploadPickingEvidence` fija `contentType: 'image/jpeg'` y ruta `.jpg`; el espejo mobile heredará solo-JPEG

Ubicación: §9 (crear `payment-evidence.ts` "espejo de `picking-evidence.ts`") vs.
§8 web (`accept="image/jpeg,image/png,image/webp"`, ruta `{uuid}.{ext}`).

Verifiqué `apps/mobile/src/lib/picking-evidence.ts`: `uploadPickingEvidence`
hardcodea `contentType: 'image/jpeg'` y `evidencePath` siempre produce `.jpg`.
`PhotoCapture.takePictureAsync` entrega JPEG, así que para mobile es correcto y
consistente. La web, en cambio, admite png/webp y usa extensión variable. No es una
contradicción (son dos caminos distintos), pero el diseño describe el helper mobile
como "espejo" sin señalar que mobile queda intencionalmente solo-JPEG.

Fix: anotar en §9 que el helper mobile mantiene `image/jpeg`/`.jpg` (igual que
picking, por la fuente de cámara), mientras que el helper web deriva el
`contentType`/extensión del `File` seleccionado. Decisión ya implícita; solo
explicitarla para que no se "copie" el `.jpg` al path web.

### 4. NIT — Nota de concurrencia del límite de 3 queda como riesgo asumido, no cerrado

Ubicación: §2.5 (nota de concurrencia) y §4 (invariante "máximo 3").

El diseño reconoce con honestidad que dos INSERT simultáneos del mismo `payment_id`
podrían burlar el `count()` del trigger y dejar 4 filas, y decide no endurecerlo por
el patrón secuencial de un solo cliente. El razonamiento es razonable para el flujo
real (un usuario adjunta hasta 3 fotos en serie). Se registra como NIT porque el
invariante "máximo 3" se declara como propiedad de la DB en §4 sin la salvedad de
concurrencia que sí aparece en §2.5; un lector de §4 podría asumir garantía dura.

Fix: en la tabla de §4, anotar el invariante como "máx 3 (garantía efectiva bajo
escritura secuencial; ver nota de concurrencia §2.5)". No requiere `FOR UPDATE` en
el MVP.

---

## Supuestos verificados (contrastados con el código)

1. **Timestamp de migración > `20261005000003`.** `ls supabase/migrations` confirma
   que la última es `20261005000003_feature_flag_dispatch_guides.sql`; el diseño usa
   `20261006000001`. Correcto (cumple el enunciado (c)).
2. **Patrón de seguridad de picking replicado fielmente.**
   `20261002000001_create_picking_photo_evidence.sql`: bucket privado
   (`public=false`), `file_size_limit=10485760`, MIME jpeg/png/webp, ruta
   `{org_id}/{id}/{uuid}.jpg`, RLS en `storage.objects` acotada por
   `(storage.foldername(name))[1] = current_org_id()::text`, SIN policies
   UPDATE/DELETE (inmutabilidad), seed del flag en la misma migración. El diseño
   replica todo esto para `payment-evidence` (enunciado (a)).
3. **`current_worker_id()` existe** (`20260822000009_auth_roles_setup.sql`,
   `SELECT (auth.jwt() ->> 'worker_id')::UUID`), y es el patrón de identidad de
   escritura usado en picking/day_roster (`recorded_by = current_worker_id()`). El
   diseño lo usa como `uploaded_by = current_worker_id()` (enunciado (a), identidad
   JWT).
4. **Multi-tenant: `set_organization_id` trigger existe**
   (`20260830000003_set_organization_id_trigger.sql`) y es el patrón de todas las
   tablas de dominio. El diseño añade `trg_set_org_id_payment_photo_evidence`.
5. **`payments` NO tiene `uq_payments_id_org`.** Verificado en
   `20260829000005_tenant_composite_fks.sql`: añade `uq_*_id_org` a products,
   fields, blocks, workers, settlements — **no a payments**. El diseño detecta esto
   correctamente y añade `ALTER TABLE payments ADD CONSTRAINT uq_payments_id_org
   UNIQUE (id, organization_id)` ANTES de la FK compuesta (enunciado (b)).
6. **`workers` sí tiene `uq_workers_id_org`** (misma migración), por lo que
   `fk_pay_evidence_uploaded_by_org` → `workers(id, organization_id)` es válida.
7. **Patrón 1:N con tabla hija = `dispatch_receipts`**
   (`20261005000002`): tabla separada con `organization_id`, FKs compuestas de
   tenant (`fk_receipt_guide_org`, `fk_receipt_recorded_by_org`), `UNIQUE (id,
   organization_id)`, índices por FK, `set_organization_id`, RLS
   `is_platform_admin() OR (<rol> AND organization_id = current_org_id())`. El
   diseño calca este patrón (enunciado (b)).
8. **El flujo de pagos es cliente-directo por SDK, no Edge Function.** Verificado:
   web `apps/web/src/app/(dashboard)/payments/page.tsx` →
   `supabase.from('payments').insert(...)` (sin `.select()` hoy; el diseño ajusta);
   mobile `apps/mobile/app/(tabs)/payments.tsx` y `crew.tsx` → mismo patrón +
   `enqueue({ type: 'payment_insert' })` offline. Justifica la decisión de no crear
   Edge Function y de poner el límite en trigger de DB (enunciado (h), (e)).
9. **El status de settlement se recalcula hoy tras el pago** (mobile `payments.tsx`:
   `supabase.from('settlements').update({ status })`). La evidencia se adjunta como
   INSERT separado en `payment_photo_evidence`, que NO toca `settlements` ni
   `amount`; `prevent_paid_settlement_update` (`20260822000008`) permanece intacto —
   los settlements pagados siguen siendo inmutables (enunciado (d)).
10. **Feature flag nace por migración/seed, no por consola.** Precedente
    `20261005000003` (dispatch) y `20261002000001` (picking) siembran el flag con
    `ON CONFLICT (key) DO NOTHING`. La Edge Function `platform-feature-flags`
    rechaza `POST` con 403 ("Los feature flags los define el equipo de desarrollo
    por migración"); solo permite `GET`/`PATCH`/overrides. El panel
    `apps/web/src/app/(platform)/platform/feature-flags/page.tsx` es data-driven y
    renderiza `category` con clase `capitalize` (`'pagos'` → "Pagos"). Amarre de 3
    capas correcto (enunciado (f)).
11. **`resolveFlagForOrg` y `resolveFeatureFlag` existen** en
    `supabase/functions/_shared/feature-flags.ts` (fail-closed) y
    `resolveFeatureFlag` se reusa en `apps/web/src/hooks/useFeatureFlag.ts` y
    `apps/mobile/src/hooks/useFeatureFlag.ts`, ambos con firma
    `useFeatureFlag(key: string)` y retorno `{ enabled, loading }`. El gating de UI
    propuesto es feasible.
12. **`FEATURE_FLAGS` y `ERROR_CODES` existen** en
    `packages/shared/src/constants/index.ts` con la forma esperada para añadir
    `PAYMENT_PHOTO_EVIDENCE` y `PAYMENT_EVIDENCE_LIMIT`.
13. **Helpers mobile reutilizables existen** en `picking-evidence.ts`:
    `currentOrgId()` (lee claim `org_id` del JWT), `newUuid()` (expo-crypto),
    `evidencePath`, `uploadPickingEvidence`, `signedEvidenceUrl`. El diseño propone
    un espejo `payment-evidence.ts` reutilizándolos (enunciado (h)).
14. **`PhotoCapture` existe** (`apps/mobile/src/components/PhotoCapture.tsx`) con
    props `onCapture(uri)/onClose`, una foto por invocación, `quality: 0.6`,
    reutiliza `expo-camera` (OTA, sin recompilar). La estrategia "invocar repetido y
    acumular hasta 3" es feasible (enunciado (h)).
15. **RBAC de escritura de pagos.** admin (`admin_all_payments` FOR ALL),
    supervisor (`20261002000003_supervisor_insert_crew_payments_rls.sql`), crew_lead
    (`20260830000001`, pagos de su gente). El diseño acota la escritura de evidencia
    a esos tres roles; un `worker` no puede adjuntar ni leer (enunciado (g)).
16. **Dominio: la calidad NO se mide ni afecta tarifa.** El diseño no incluye ningún
    campo/validación de calidad, consistente con las instrucciones de negocio del
    usuario (mensajes 4 y 5 del request original) y el enunciado (d). Las tarifas
    (`rates > 0`) y la cantidad de picking (`quantity > 0`) no son tocadas por esta
    feature.

## Supuestos no verificados / incorrectos

- **Ninguno incorrecto.** Todas las afirmaciones de código verificables resultaron
  correctas.
- **No verificado por diseño (correctamente diferido):** el comportamiento en
  tiempo de ejecución de la carrera de concurrencia del trigger de límite (§2.5) no
  se puede verificar estáticamente; el diseño lo documenta como riesgo asumido y
  acotado al patrón de uso. No bloquea (ver hallazgo NIT 4).
- **No verificado (fuera del alcance de esta revisión):** no apliqué la migración
  propuesta `20261006000001` contra una DB real (requiere Rancher en modo
  `dockerd (moby)` por `local-env`); la revisión es estática sobre el diseño y los
  precedentes. El diseño incluye su propio plan de verificación en §12.
