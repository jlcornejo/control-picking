# Implementation Plan — M2-01b `payment_photo_evidence`

Plan derivado del diseño APROBADO en `.agents/tasks/pago-imagenes/design.md`. Se
secuencia el trabajo por capa respetando dependencias; NO se re-decide la
arquitectura. Trabajar DENTRO del worktree
`/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/pago-imagenes`
(rutas absolutas; `git -C <worktree>`). Rama: `feature/pago-imagenes`.

Comandos reales del proyecto (descubiertos durante exploración):
- Build/typecheck: `npm run build` (turbo; corre `tsc`/`next build`/expo typecheck por paquete).
- Tests unit shared: `npm test` (turbo → `vitest --run` en `packages/shared`) o
  `cd packages/shared && npx vitest --run`.
- Migración local: `npx supabase db reset` (requiere Rancher Desktop en modo
  `dockerd (moby)`; ver `.kiro/steering/local-env.md`). Tras el reset esperar ~40s y
  `bash scripts/seed-users.sh` si se necesitan usuarios de prueba.
- Lint/format: `npm run lint`, `npm run format:check`.

El flujo de pagos es **cliente-directo** (SDK, sin Edge Function); NO se crea ni
modifica Edge Function (design §2.1, §10). El gating efectivo es consumo de UI +
RLS; `resolveFlagForOrg` ya existe y queda disponible, sin cambios.

Invariantes de dominio respetados (no se violan): la foto NO altera `payments.amount`
ni cálculos; `settlements` sigue inmutable al estar `paid` (`prevent_paid_settlement_update`
intacto; la evidencia nunca toca `settlements`); RBAC por RLS (write solo
admin/supervisor/crew_lead, acotado por org); nombres de entidad correctos
(`payments`, `workers`, `settlements`, nueva `payment_photo_evidence`). No se tocan
`picking_records` ni `rates`.

---

- [ ] 1. Crear la migración `20261006000001_create_payment_photo_evidence.sql`.
      Replica el precedente `20261002000001` (bucket privado) y el patrón 1:N de
      `20261005000002` (tabla aparte). Contenido, en orden:
      (a) `INSERT INTO storage.buckets` id/name `payment-evidence`, `public=false`,
          `file_size_limit=10485760`, mime `{jpeg,png,webp}`, `ON CONFLICT DO NOTHING`.
      (b) Policies `storage.objects` acotadas al bucket: `org_read_payment_evidence`
          (SELECT; `is_platform_admin() OR (storage.foldername(name))[1]=current_org_id()::text`)
          y `org_insert_payment_evidence` (INSERT WITH CHECK; `is_platform_admin() OR
          ((is_admin() OR is_supervisor() OR is_crew_lead()) AND (storage.foldername(name))[1]=current_org_id()::text)`).
          SIN UPDATE/DELETE (inmutable).
      (c) `ALTER TABLE payments ADD CONSTRAINT uq_payments_id_org UNIQUE (id, organization_id);`
          (requisito de la FK compuesta; `payments` no lo tiene hoy).
      (d) `CREATE TABLE payment_photo_evidence` (id, organization_id, payment_id,
          image_path TEXT CHECK length>0, uploaded_by, created_at; UNIQUE (id, organization_id)).
          SIN `updated_at` (inmutable).
      (e) FKs compuestas: `fk_pay_evidence_payment_org` → payments (id,org) ON DELETE CASCADE;
          `fk_pay_evidence_uploaded_by_org` → workers (id,org) ON DELETE RESTRICT.
      (f) Índices `idx_payment_photo_evidence_organization`, `idx_payment_photo_evidence_payment_id`.
      (g) Trigger de tenant `trg_set_org_id_payment_photo_evidence` (fn `set_organization_id`).
      (h) `enforce_payment_evidence_limit()` + trigger `trg_enforce_payment_evidence_limit`
          BEFORE INSERT: `count(*)` por `payment_id`; si `>=3` RAISE `PAYMENT_EVIDENCE_LIMIT`
          con `ERRCODE='check_violation'`.
      (i) `ALTER TABLE payment_photo_evidence ENABLE ROW LEVEL SECURITY` + policies
          `admin_all_payment_evidence` (FOR ALL), `writer_insert_payment_evidence`
          (INSERT WITH CHECK roles+org+`uploaded_by=current_worker_id()`),
          `member_read_payment_evidence` (SELECT roles admin/supervisor/crew_lead + org).
      (j) Seed del flag en `platform_feature_flags` (`payment_photo_evidence`,
          'Foto de respaldo en pagos', categoría `pagos`, `org_override`, `enabled=false`),
          `ON CONFLICT (key) DO NOTHING`.
      (k) Header con la reversibilidad documentada (design §13) y COMMENTs de tabla/columna.
      Files: `supabase/migrations/20261006000001_create_payment_photo_evidence.sql`
      Verify: `npx supabase db reset` aplica sin error; en SQL (`psql`/Studio) confirmar
      bucket creado, insertar 3 filas OK y la 4ª lanza `PAYMENT_EVIDENCE_LIMIT`, y que el
      flag existe con `enabled=false`.

- [ ] 2. Añadir el contrato compartido en `@fundo360/shared`.
      - `packages/shared/src/types/index.ts`: interfaz `PaymentPhotoEvidence`
        (id, organization_id, payment_id, image_path, uploaded_by, created_at).
      - `packages/shared/src/constants/index.ts`: `ERROR_CODES.PAYMENT_EVIDENCE_LIMIT='PAYMENT_EVIDENCE_LIMIT'`;
        `FEATURE_FLAGS.PAYMENT_PHOTO_EVIDENCE='payment_photo_evidence'`;
        `export const PAYMENT_EVIDENCE = { MAX_IMAGES: 3, BUCKET: 'payment-evidence' } as const;`.
      - `packages/shared/src/validation/index.ts`: `createPaymentEvidenceSchema`
        (`payment_id: z.string().uuid()`, `image_path: z.string().min(1,'Ruta de imagen requerida')`).
      Files: `packages/shared/src/types/index.ts`, `packages/shared/src/constants/index.ts`,
      `packages/shared/src/validation/index.ts`
      Verify: `cd packages/shared && npx tsc --noEmit` (o `npm run build`) sin errores.

- [ ] 3. Añadir test unit en `packages/shared` (patrón `dispatch.test.ts`).
      Verificar `PAYMENT_EVIDENCE.MAX_IMAGES===3`, `PAYMENT_EVIDENCE.BUCKET==='payment-evidence'`,
      `FEATURE_FLAGS.PAYMENT_PHOTO_EVIDENCE==='payment_photo_evidence'`, que
      `resolveFeatureFlag(undefined, undefined)===false` (OFF por default para el key),
      y que `createPaymentEvidenceSchema` acepta un payload válido y rechaza `payment_id`
      no-uuid / `image_path` vacío.
      Files: **nuevo** `packages/shared/src/types/payment-evidence.test.ts`
      Verify: `cd packages/shared && npx vitest --run` — todos los tests pasan incluyendo los nuevos.

- [ ] 4. Crear el helper mobile de evidencia de pago (espejo de `picking-evidence.ts`).
      `apps/mobile/src/lib/payment-evidence.ts`: `BUCKET = PAYMENT_EVIDENCE.BUCKET`,
      reusar `currentOrgId()` y `newUuid()` de `picking-evidence.ts` (importarlos/reexportarlos),
      `evidencePath(orgId, paymentId, uuid)` → `{org}/{payment}/{uuid}.jpg`,
      `uploadPaymentEvidence({orgId, paymentId, localUri})` (fetch→arrayBuffer→
      `supabase.storage.from(BUCKET).upload(path, buf, {contentType:'image/jpeg', upsert:false})`),
      `signedPaymentEvidenceUrl(path, 3600)`.
      Files: **nuevo** `apps/mobile/src/lib/payment-evidence.ts`
      Verify: `npm run build` (typecheck del paquete mobile) sin errores.

- [ ] 5. Wire de fotos en el modal de pago mobile (`payments.tsx`).
      - `useFeatureFlag('payment_photo_evidence')` para gatear el bloque.
      - Estado `photoUris: string[]` (máx `PAYMENT_EVIDENCE.MAX_IMAGES`) + `showPhoto`.
      - Reusar `PhotoCapture` (igual que `register.tsx`): botón "Agregar foto"
        (deshabilitado al llegar a 3), thumbnails con `<Image>` + acción "Quitar".
      - En `payMutation` (solo rama `online`): tras insertar el pago, obtener su id con
        `.insert({...}).select('id').single()`; por cada uri subir con
        `uploadPaymentEvidence` + `insert` en `payment_photo_evidence`
        (`payment_id`, `image_path`, `uploaded_by = worker.id`). Best-effort: si una
        falla, el pago queda; avisar con `showAlert` (criterio de `register.tsx`).
        Offline no sube fotos (igual que picking); avisar.
      - En el detalle expandido del pago: con flag ON, resolver URLs firmadas de
        `payment_photo_evidence` por `payment_id` y mostrar thumbnails.
      Files: `apps/mobile/app/(tabs)/payments.tsx`
      Verify: `npm run build` sin errores. Prueba manual en device (cámara nativa) queda anotada.

- [ ] 6. Crear el helper web de evidencia de pago (espejo del de mobile).
      `apps/web/src/lib/payment-evidence.ts`: leer `org_id` del claim JWT de la sesión
      (análogo a `currentOrgId()` mobile; usar `supabase.auth.getSession()` + decode del
      JWT), `evidencePath`, `uploadPaymentEvidence` (File/Blob →
      `supabase.storage.from(PAYMENT_EVIDENCE.BUCKET).upload(path, file, {upsert:false})`),
      `signedPaymentEvidenceUrl(path, 3600)`.
      Files: **nuevo** `apps/web/src/lib/payment-evidence.ts`
      Verify: `npm run build` (next build / typecheck web) sin errores.

- [ ] 7. Adjuntar + mostrar thumbnails en `/payments` web (`CreatePaymentForm` + lista).
      - `useFeatureFlag('payment_photo_evidence')` para gatear el bloque "Fotos de
        respaldo (opcional, máx 3)".
      - Ajustar el insert del pago a `.insert({...}).select('id').single()` para obtener el id.
      - `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>` limitado a 3
        (`PAYMENT_EVIDENCE.MAX_IMAGES`); deshabilitar "Agregar" al llegar al máx.
      - Por archivo: `uploadPaymentEvidence` + insert en `payment_photo_evidence`
        (`uploaded_by = worker.id`). Secuencia: pago primero (crítico), fotos best-effort;
        si una falla, toast "El pago se registró; una foto no se pudo adjuntar".
      - En la lista de pagos: con flag ON, consultar `payment_photo_evidence` por
        `payment_id` y `createSignedUrl(path, 3600)`; mostrar thumbnails (click → grande).
      - Design system: tokens HSL del tema (`text-foreground`, `bg-muted`, `border-border`,
        `ring-primary/30`) e iconos `lucide-react`. Nada hardcodeado fuera de tokens.
      Files: `apps/web/src/app/(dashboard)/payments/page.tsx`
      Verify: `npm run build` sin errores. Visual: con flag ON (override org) registrar pago
      + 2 fotos y ver thumbnails; con flag OFF el bloque no aparece y el pago funciona igual.

- [ ] 8. Actualizar documentación de flags (regla `documentation`).
      Añadir la fila `payment_photo_evidence | Foto de respaldo en pagos | pagos |
      org_override | ...` a la tabla "Catálogo de flags vigentes" de
      `.kiro/steering/feature-flags.md`.
      Files: `.kiro/steering/feature-flags.md`
      Verify: la fila aparece en la tabla; `npm run format:check` no reporta el archivo.

- [ ] 9. Verificación integral.
      Correr `npm run build` y `npm test` en la raíz; `npx supabase db reset` para
      confirmar que la migración aplica limpia sobre el seed. Confirmar degradación limpia
      con flag OFF (UI de fotos oculta en web y mobile, registro de pago intacto) y que
      `prevent_paid_settlement_update` sigue intacto (adjuntar evidencia no toca `settlements`).
      Files: —
      Verify: build verde, tests verdes, `db reset` sin error.

## Notas / supuestos
- Fuera de alcance inmediato (del diseño §11): evidencia en pagos offline
  (`offline-queue.ts` `payment_insert`) y en `crew.tsx`. La policy ya autoriza a
  `crew_lead`; extender `crew.tsx` luego es solo UI.
- No se añade saga/rollback por objetos huérfanos en Storage (bucket privado, no
  referenciable sin su fila); limpieza futura por job service-role.
