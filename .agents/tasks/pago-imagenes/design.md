# M2-01b — Imágenes de respaldo en pagos (`payment_photo_evidence`)

> Diseño técnico. Primera iteración (no existe `design-review.json` previo en
> `.agents/tasks/pago-imagenes/`, por lo que no hay hallazgos que corregir).
> Cada decisión se fundamenta en código ya leído del repo y replica el precedente
> `picking_photo_evidence` (migración `20261002000001`) y el patrón 1:N de
> `dispatch_receipts` (migración `20261005000002`).

---

## 1. Resumen

Permitir adjuntar **de 0 a 3 imágenes genéricas de respaldo** al **registrar un
pago** (`payments`). Caso de uso típico: pago en mano/efectivo donde se deja
evidencia visual. La foto es **solo evidencia adjunta**: no altera `payments.amount`,
ni el estado de la liquidación, ni la transición `pending→partial→paid`, ni ningún
cálculo, ni la inmutabilidad de settlements pagados (`prevent_paid_settlement_update`).

La feature replica el precedente `picking_photo_evidence` en seguridad (bucket
privado por tenant, ruta `{org_id}/{payment_id}/{uuid}.jpg`, URL firmada temporal,
RLS sobre `storage.objects`), pero usa una **tabla hija 1:N** (`payment_photo_evidence`)
en vez de una columna embebida, porque un pago admite hasta 3 fotos. Es la misma
decisión estructural que `dispatch_receipts` (tabla separada en vez de columnas).

Toda la feature va **detrás del feature flag `payment_photo_evidence`** (categoría
`pagos`, estrategia `org_override`, default **OFF**), amarrado en las 3 capas.

### Decisión clave: ¿web, mobile o ambos?

**Ambos.** Investigué dónde se registran pagos hoy y los pagos NO son solo-web:

- **Web** `apps/web/src/app/(dashboard)/payments/page.tsx` → `CreatePaymentForm`
  inserta con `supabase.from('payments').insert(...)` directo (sin Edge Function).
- **Mobile** `apps/mobile/app/(tabs)/payments.tsx` → `payMutation` inserta pagos
  (admin/supervisor) con `supabase.from('payments').insert(...)`; también encola
  offline (`enqueue({ type: 'payment_insert' })`).
- **Mobile** `apps/mobile/app/(tabs)/crew.tsx:176` → el crew_lead inserta pagos de
  su gente.
- **Mobile** `apps/mobile/src/lib/offline-queue.ts:224` → replay del pago offline.

El pago en mano por supervisor/encargado ocurre en terreno desde el móvil, así que
**mobile reusa `PhotoCapture`** (igual que el registro de picking). Web adjunta por
selector de archivo. Alcance mobile en esta tarea: la pantalla **`payments.tsx`**
(flujo admin/supervisor), que es el punto natural del "pago por mano". El flujo
`crew.tsx` y el **offline** quedan documentados abajo como fuera de alcance
inmediato con su justificación (§11).

---

## 2. Modelo de datos y almacenamiento (precedente de código)

### 2.1 Punto de inserción real de pagos = cliente directo, NO Edge Function

`supabase/functions/payments/index.ts` **sí** tiene `POST /payments`, pero ni web
ni mobile lo usan: ambos insertan por el SDK (`supabase.from('payments').insert`),
apoyándose en RLS + triggers (`set_organization_id`) para tenant y rol. Esto espeja
`picking_photo_evidence`, donde la subida de la foto **también** la hace el cliente
directo contra Storage (`apps/mobile/src/lib/picking-evidence.ts`:
`supabase.storage.from('picking-evidence').upload(...)` y `.createSignedUrl(...)`),
sin pasar por `supabase/functions/picking-records/index.ts` (que no tiene nada de
evidencia).

**Decisión:** la evidencia de pago sigue el mismo modelo cliente-directo:
subida a Storage y INSERT en `payment_photo_evidence` vía SDK; RLS es la capa de
seguridad primaria. No se crea una Edge Function nueva (sería inconsistente con el
flujo de pagos y con el precedente de picking). El amarre backend del flag se
cumple vía `resolveFlagForOrg` en `_shared/feature-flags.ts`, listo para cuando el
flujo migre a Edge Function; hoy el gating backend lo garantiza RLS + el gating de
UI (ver §5 y §8, nota de alcance).

### 2.2 Bucket de Storage `payment-evidence` (separado de picking)

Replica exacta del bloque de `20261002000001` pero con id/nombre `payment-evidence`:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-evidence', 'payment-evidence',
  false,                                    -- privado: solo URL firmada
  10485760,                                 -- 10 MiB por archivo (igual que picking)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
```

Ruta del objeto: `{org_id}/{payment_id}/{uuid}.jpg`. El **primer segmento** es el
`org_id`, que es lo que las policies RLS validan contra el claim JWT
(`(storage.foldername(name))[1] = current_org_id()::text`). `storage.foldername`
devuelve todos los segmentos de carpeta; con 3 segmentos (`org/payment/uuid.jpg`)
`[1]` sigue siendo el `org_id` — idéntico a picking, verificado en
`20261002000001`.

### 2.3 Policies RLS sobre `storage.objects` (acotadas al bucket)

Mismo esquema que picking, pero el INSERT se acota a los roles que registran pagos
hoy (admin, supervisor, crew_lead) en vez de los roles de terreno:

```sql
-- Lectura: miembros de la organización dueña del objeto.
CREATE POLICY "org_read_payment_evidence" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'payment-evidence'
    AND ( is_platform_admin()
          OR (storage.foldername(name))[1] = current_org_id()::text )
  );

-- Subida: solo roles que registran pagos, dentro de su organización.
CREATE POLICY "org_insert_payment_evidence" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'payment-evidence'
    AND ( is_platform_admin()
          OR ( (is_admin() OR is_supervisor() OR is_crew_lead())
               AND (storage.foldername(name))[1] = current_org_id()::text ) )
  );
-- SIN policies UPDATE/DELETE para roles de tenant: evidencia inmutable
-- (RLS deniega por defecto). platform_admin opera vía service role si hace falta.
```

**Justificación del alcance de roles en el INSERT de Storage:** `is_worker()`
NO puede subir (un worker no registra pagos). Admin, supervisor y crew_lead sí
registran pagos (ver §7 RBAC), así que son los únicos autorizados a subir. Esto es
más restrictivo que picking (que incluye terreno) y coherente con quién inserta en
`payments`.

### 2.4 Tabla `payment_photo_evidence` (1:N, patrón `dispatch_receipts`)

Tabla separada (no columnas embebidas) para la relación 1:N, exactamente como
`dispatch_receipts` razona el 1:N. Multi-tenant obligatorio: `organization_id`,
trigger `set_organization_id`, UNIQUE `(id, organization_id)`, FKs compuestas de
tenant, RLS con el patrón del proyecto.

```sql
CREATE TABLE payment_photo_evidence (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  payment_id       UUID NOT NULL,

  image_path       TEXT NOT NULL CHECK (length(image_path) > 0),  -- storage key, nunca URL
  uploaded_by      UUID NOT NULL,                                 -- identidad de escritura
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_payment_photo_evidence_id_org UNIQUE (id, organization_id)
);
```

**No lleva `updated_at`** (evidencia inmutable: nunca se hace UPDATE; sin
`update_updated_at_column`). Esto se desvía del template genérico de
`database-migrations §7`, de forma deliberada y consistente con la inmutabilidad
exigida (ver §4); se documenta en el COMMENT.

FKs compuestas de tenant (requieren `UNIQUE (id, organization_id)` en la tabla
destino). **`payments` NO tiene hoy ese UNIQUE** (verificado en
`20260829000005_tenant_composite_fks.sql`: añade `uq_*_id_org` a products, fields,
blocks, workers, settlements, pero **no a payments**). Por tanto la migración debe
**añadirlo primero**:

```sql
-- Requisito para la FK compuesta payment_photo_evidence -> payments.
ALTER TABLE payments ADD CONSTRAINT uq_payments_id_org UNIQUE (id, organization_id);

ALTER TABLE payment_photo_evidence ADD CONSTRAINT fk_pay_evidence_payment_org
  FOREIGN KEY (payment_id, organization_id) REFERENCES payments (id, organization_id)
  ON DELETE CASCADE;                       -- borrar el pago arrastra su evidencia
ALTER TABLE payment_photo_evidence ADD CONSTRAINT fk_pay_evidence_uploaded_by_org
  FOREIGN KEY (uploaded_by, organization_id) REFERENCES workers (id, organization_id)
  ON DELETE RESTRICT;
```

Índices (toda FK indexada, `database-migrations §5`):

```sql
CREATE INDEX idx_payment_photo_evidence_organization ON payment_photo_evidence (organization_id);
CREATE INDEX idx_payment_photo_evidence_payment_id    ON payment_photo_evidence (payment_id);
```

Trigger de tenant (como todas las tablas de dominio):

```sql
CREATE TRIGGER trg_set_org_id_payment_photo_evidence
  BEFORE INSERT ON payment_photo_evidence
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();
```

### 2.5 Validación del máximo de 3 (DECISIÓN JUSTIFICADA)

**Decisión: trigger `BEFORE INSERT` en la base de datos** (defensa autoritativa),
además de validación en cliente (UX) y en el schema Zod.

Por qué trigger y no solo Edge Function / solo cliente:
- El flujo de pagos NO pasa por Edge Function (§2.1): un límite "solo Edge Function"
  no se aplicaría nunca. El cliente inserta directo, así que el único punto donde
  el límite es **inviolable** es la base de datos.
- Un CHECK no puede contar filas hermanas (necesita agregación sobre la tabla), así
  que no sirve. Un UNIQUE sobre un "slot" (p. ej. `(payment_id, slot in 1..3)`)
  obligaría a gestionar slots en el cliente y es frágil. El trigger que cuenta las
  filas existentes del `payment_id` es el mecanismo correcto y es el patrón que el
  repo ya usa para invariantes de dominio en DB (p. ej. `prevent_paid_settlement_update`).

```sql
CREATE OR REPLACE FUNCTION enforce_payment_evidence_limit()
RETURNS TRIGGER AS $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM payment_photo_evidence WHERE payment_id = NEW.payment_id;
  IF n >= 3 THEN
    RAISE EXCEPTION 'PAYMENT_EVIDENCE_LIMIT: a payment can have at most 3 evidence images (payment_id: %)', NEW.payment_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_payment_evidence_limit
  BEFORE INSERT ON payment_photo_evidence
  FOR EACH ROW EXECUTE FUNCTION enforce_payment_evidence_limit();
```

El cliente igualmente valida (deshabilita "Agregar" al llegar a 3) para no
depender del error y dar UX inmediata. El mensaje del trigger lleva el prefijo
`PAYMENT_EVIDENCE_LIMIT` para que el cliente lo mapee al `ERROR_CODES` compartido.

> Nota de concurrencia (documentada, no bloqueante): dos INSERT simultáneos del
> mismo `payment_id` podrían, en teoría, pasar ambos el `count` y dejar 4 filas.
> En la práctica el adjunto es secuencial desde un solo cliente (hasta 3 fotos de
> un mismo pago, un usuario). No se añade bloqueo pesado por no justificarse; si a
> futuro se vuelve concurrente, se endurece con `SELECT ... FOR UPDATE` sobre el
> `payments` padre dentro del trigger. Se deja anotado.

### 2.6 RLS de `payment_photo_evidence`

Patrón del proyecto `is_platform_admin() OR (<predicado_rol> AND organization_id =
current_org_id())`. Lectura para la org (mostrar thumbnails); escritura (INSERT)
acotada a quien registra pagos. **Sin UPDATE/DELETE para roles de tenant**
(inmutable, igual que la decisión de picking):

```sql
ALTER TABLE payment_photo_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_payment_evidence" ON payment_photo_evidence
  FOR ALL USING (
    is_platform_admin() OR (is_admin() AND organization_id = current_org_id())
  );

CREATE POLICY "writer_insert_payment_evidence" ON payment_photo_evidence
  FOR INSERT WITH CHECK (
    is_platform_admin()
    OR ( (is_admin() OR is_supervisor() OR is_crew_lead())
         AND organization_id = current_org_id()
         AND uploaded_by = current_worker_id() )   -- identidad de escritura = JWT
  );

CREATE POLICY "member_read_payment_evidence" ON payment_photo_evidence
  FOR SELECT USING (
    is_platform_admin()
    OR ( (is_admin() OR is_supervisor() OR is_crew_lead())
         AND organization_id = current_org_id() )
  );
```

> El `admin_all` ya cubre al admin con `FOR ALL`; la policy de INSERT añade
> supervisor y crew_lead (que no son admin) y fija `uploaded_by = current_worker_id()`
> para que la identidad de escritura venga del claim, igual que el patrón
> `recorded_by = current_worker_id()` usado en picking/day_roster. El SELECT se
> acota a los mismos roles de gestión (un `worker` no necesita ver evidencia de
> pagos). `current_worker_id()` ya existe y es la función usada por el esquema.

### 2.7 DELETE (replicar política de picking)

Picking es **inmutable**: no hay policy de DELETE para roles de tenant. **Se
replica**: `payment_photo_evidence` no permite DELETE a roles de tenant. La única
forma de que desaparezca una fila es `ON DELETE CASCADE` al borrar el `payments`
padre (que hoy no se borra; `payments` referencia settlements con `ON DELETE
RESTRICT`). Resultado: evidencia inmutable una vez subida, consistente con el
mandato de dominio.

---

## 3. Nombres exactos (contrato de la implementación)

| Elemento | Nombre exacto |
|---|---|
| Migración | `supabase/migrations/20261006000001_create_payment_photo_evidence.sql` |
| Tabla | `payment_photo_evidence` |
| Bucket Storage | `payment-evidence` |
| Ruta del objeto | `{org_id}/{payment_id}/{uuid}.jpg` |
| Feature flag `key` | `payment_photo_evidence` |
| Flag: `name` | `Foto de respaldo en pagos` |
| Flag: `category` | `pagos` |
| Flag: `strategy` | `org_override` |
| Flag: `enabled` (default) | `false` (OFF) |
| Trigger límite | `trg_enforce_payment_evidence_limit` / fn `enforce_payment_evidence_limit` |
| ERROR_CODE | `PAYMENT_EVIDENCE_LIMIT` |
| Constante máx | `PAYMENT_EVIDENCE_MAX_IMAGES = 3` |
| Constante bucket | `PAYMENT_EVIDENCE_BUCKET = 'payment-evidence'` |
| Flag en FEATURE_FLAGS | `PAYMENT_PHOTO_EVIDENCE: 'payment_photo_evidence'` |

> Timestamp `20261006000001` es posterior a la última migración existente
> (`20261005000003`), como exige el enunciado. El `key` cumple el regex
> `^[a-z0-9]+(_[a-z0-9]+)*$` de `feature-flags`.

---

## 4. Invariantes de dominio (quién los dueña)

| Invariante | Capa que lo dueña | Por qué |
|---|---|---|
| La foto NO altera `payments.amount` ni cálculos | **Modelo de datos**: la evidencia vive en tabla aparte, sin columnas de monto. Ningún código de liquidación/pago la lee. | Separación física: imposible que afecte el monto. |
| No afecta `pending→partial→paid` ni `prevent_paid_settlement_update` | **Diseño de flujo**: la evidencia se adjunta DESPUÉS de que el pago ya se insertó y el status ya se recalculó. No toca `settlements`. | El trigger `prevent_paid_settlement_update` sigue intacto; no se modifica. |
| Máximo 3 imágenes por pago | **Base de datos** (trigger `enforce_payment_evidence_limit`), reforzado en cliente + Zod | Único punto inviolable dado el flujo cliente-directo (§2.5). |
| Evidencia inmutable (sin UPDATE; DELETE sólo por cascade) | **Base de datos**: ausencia de policies UPDATE/DELETE + sin `updated_at`; `ON DELETE CASCADE` desde `payments` | Replica la política de picking. |
| Aislamiento por tenant | **Base de datos**: RLS + `set_organization_id` + FKs compuestas + path `{org_id}/...` validado por RLS de Storage | Patrón multi-tenant del proyecto. |
| La calidad NO se mide ni afecta nada | **Alcance**: no existe campo de calidad ni validación de contenido | Confirmado por negocio. |
| Identidad de escritura desde JWT | **Base de datos** (RLS `uploaded_by = current_worker_id()`) | Igual que `recorded_by` en picking. |

---

## 5. Feature flag — amarre de 3 capas

Según `feature-flags` §"Amarre de 3 capas", el flag solo está completo con las tres.

**(1) Catálogo** — sembrado por la MISMA migración `20261006000001` (patrón de
`20261002000001` y `20261005000003`, que siembran el flag en la migración de la
feature con `ON CONFLICT (key) DO NOTHING`):

```sql
INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('payment_photo_evidence', 'Foto de respaldo en pagos',
   'Permite adjuntar hasta 3 imágenes de respaldo al registrar un pago (p. ej. pago en mano/efectivo). Las imágenes se guardan en almacenamiento privado por organización y se acceden con enlace firmado temporal. No afecta el monto ni la liquidación.',
   'pagos', 'org_override', false)
ON CONFLICT (key) DO NOTHING;
```

**(2) Código / consumo** — se añade `FEATURE_FLAGS.PAYMENT_PHOTO_EVIDENCE` en
`@fundo360/shared` y se consume con `useFeatureFlag('payment_photo_evidence')`:
- Web: `apps/web/src/hooks/useFeatureFlag.ts` (ya existe, reusar).
- Mobile: `apps/mobile/src/hooks/useFeatureFlag.ts` (ya existe, reusar).
- Backend: `resolveFlagForOrg(client, orgId, 'payment_photo_evidence')` de
  `supabase/functions/_shared/feature-flags.ts` queda disponible como defensa en
  profundidad para cuando el flujo use Edge Function (hoy el gating efectivo lo da
  el consumo de UI + RLS; ver nota de alcance en §8). El `resolveFeatureFlag`
  compartido es la fuente de verdad de la resolución override→global.

**(3) Panel admin** — aparece automáticamente en
`apps/web/src/app/(platform)/platform/feature-flags/page.tsx`, que lista todo
`platform_feature_flags` y permite gestionar solo `enabled`/overrides (nunca crear
flags desde la consola; la Edge Function `platform-feature-flags` rechaza POST).
No se requiere código extra: el panel es data-driven y `category` se renderiza
capitalizado tal cual (`'pagos'` → "Pagos").

**Degradación limpia (flag OFF):** la UI de adjuntar/mostrar fotos no se renderiza;
el registro de pago funciona exactamente como hoy. Sin errores.

> Se debe actualizar la tabla "Catálogo de flags vigentes" del steering
> `feature-flags` añadiendo la fila `payment_photo_evidence` al implementar, para
> que la documentación quede en sincronía (regla `documentation`).

---

## 6. `packages/shared` — contrato compartido

En `packages/shared/src/types/index.ts`:

```typescript
/** Evidencia fotográfica de respaldo de un pago (1:N; máx 3 por pago). */
export interface PaymentPhotoEvidence {
  id: string;
  organization_id: string;
  payment_id: string;
  image_path: string;      // storage key en bucket payment-evidence, nunca URL
  uploaded_by: string;
  created_at: string;
}
```

En `packages/shared/src/constants/index.ts`:
- `ERROR_CODES.PAYMENT_EVIDENCE_LIMIT = 'PAYMENT_EVIDENCE_LIMIT'`.
- `FEATURE_FLAGS.PAYMENT_PHOTO_EVIDENCE = 'payment_photo_evidence'`.
- `export const PAYMENT_EVIDENCE = { MAX_IMAGES: 3, BUCKET: 'payment-evidence' } as const;`

En `packages/shared/src/validation/index.ts` (Zod, patrón de los demás schemas):

```typescript
/** Validation: adjuntar una evidencia a un pago (una fila; el máx 3 lo valida la DB). */
export const createPaymentEvidenceSchema = z.object({
  payment_id: z.string().uuid(),
  image_path: z.string().min(1, 'Ruta de imagen requerida'),
});
```

> El límite "3" no se expresa en Zod por fila (cada fila es una imagen); el máximo
> agregado lo dueña el trigger (§2.5). El cliente usa `PAYMENT_EVIDENCE.MAX_IMAGES`
> para la UX. Se añade test en `packages/shared` (precedente `dispatch.test.ts`,
> `picking-payment.test.ts`): verificar `MAX_IMAGES === 3`, el `BUCKET` y que
> `resolveFeatureFlag` responde OFF por default para el nuevo key.

---

## 7. RBAC — quién puede adjuntar

Hoy registran pagos (verificado en código y policies):
- **admin**: `admin_all_payments` (FOR ALL). Web `CreatePaymentForm` y mobile
  `payments.tsx`.
- **supervisor**: `supervisor_insert_crew_payments` (INSERT acotado a pagos de
  cuadrilla que supervisa, `worker_id IS NULL`, `crew_id` de sus crews) —
  migración `20261002000003`. Mobile `payments.tsx`.
- **crew_lead**: `crew_lead_insert_member_payments` (pagos de su gente). Mobile
  `crew.tsx`.

**Decisión:** la escritura de evidencia se acota a esos tres roles
(`is_admin() OR is_supervisor() OR is_crew_lead()`), tanto en la policy de Storage
(§2.3) como en la de la tabla (§2.6), con `uploaded_by = current_worker_id()`. Un
`worker` no registra pagos y no puede adjuntar ni (por decisión) leer evidencia.

> Observación acotada, no se amplía sin pedir: no modelo un vínculo RLS entre la
> fila de `payment_photo_evidence` y la propiedad del `payments` concreto (p. ej.
> que el supervisor solo adjunte a pagos de SU cuadrilla). Las policies acotan por
> rol + org, no por "este pago es tuyo", igual que la evidencia de picking (que
> acota por rol + org, no por "este record es tuyo"). Endurecerlo requeriría un
> `EXISTS` contra `payments` con las condiciones de `supervisor_insert_crew_payments`;
> se deja anotado como refuerzo futuro, fuera de alcance salvo que negocio lo pida.

---

## 8. Web — `/payments`

Archivo: `apps/web/src/app/(dashboard)/payments/page.tsx`.

**Adjuntar (en `CreatePaymentForm`):** tras insertar el pago y recibir su `id`
(`.insert({...}).select('id').single()` — hoy el insert no pide `.select()`, se
ajusta para obtener el `id`), si el flag está ON mostrar un bloque "Fotos de
respaldo (opcional, máx 3)":
- `useFeatureFlag('payment_photo_evidence')` para gatear el bloque.
- `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>` limitado
  a 3; deshabilitar "Agregar" al llegar a 3 (`PAYMENT_EVIDENCE.MAX_IMAGES`).
- Por cada archivo: subir a Storage con
  `supabase.storage.from(PAYMENT_EVIDENCE.BUCKET).upload('{orgId}/{paymentId}/{uuid}.{ext}', file, { upsert:false })`
  y luego `insert` en `payment_photo_evidence` (`payment_id`, `image_path`,
  `uploaded_by = worker.id`). El `orgId` se lee del claim JWT (mismo mecanismo que
  mobile `currentOrgId()`); crear un helper web análogo en `apps/web/src/lib`.
- **Secuencia:** primero el pago (obligatorio y crítico), luego las fotos
  best-effort. Si una subida falla, no se revierte el pago; se avisa con toast
  ("El pago se registró; una foto no se pudo adjuntar").

**Mostrar thumbnails (lista de pagos):** añadir sección que, con el flag ON,
consulta `payment_photo_evidence` por `payment_id` y genera URL firmada temporal
con `supabase.storage.from(PAYMENT_EVIDENCE.BUCKET).createSignedUrl(image_path, 3600)`
para cada `image_path`. Mostrar como thumbnails (click → abrir en grande).

**Design system (regla del enunciado):** usar tokens HSL del tema
(`text-foreground`, `bg-muted`, `border-border`, `ring-primary/30`, etc. — ya
presentes en el archivo) e iconos **lucide-react** (el proyecto usa lucide en
`(platform)`). Layout responsive con las mismas clases Tailwind del formulario
actual. Nada de colores hardcodeados fuera de tokens.

**Nota de alcance (gating backend):** como el pago se inserta por SDK (no Edge
Function), el gating "duro" de servidor para esta feature recae en RLS (rol+org) y
el límite en el trigger. El flag OFF se respeta en el cliente (no se renderiza la
UI). Es idéntico al modelo de `picking_photo_evidence` (gating efectivo cliente +
RLS). `resolveFlagForOrg` queda cableado y disponible para endurecer si el flujo
migra a Edge Function.

---

## 9. Mobile — `payments.tsx`

Archivo: `apps/mobile/app/(tabs)/payments.tsx` (modal "Registrar Pago").

- `useFeatureFlag('payment_photo_evidence')` para gatear el bloque de fotos en el
  modal de pago.
- **Reusar `PhotoCapture`** (`apps/mobile/src/components/PhotoCapture.tsx`) igual
  que `register.tsx`: botón "Agregar foto" → muestra `PhotoCapture` → devuelve
  `uri` local → se acumula en un arreglo (hasta 3; deshabilitar al llegar al máx).
  Mostrar thumbnails con `<Image>` y acción "Quitar" antes de confirmar.
- **Crear `apps/mobile/src/lib/payment-evidence.ts`** espejo de
  `apps/mobile/src/lib/picking-evidence.ts`: `BUCKET = 'payment-evidence'`,
  `evidencePath(orgId, paymentId, uuid)`, `uploadPaymentEvidence(...)`,
  `signedEvidenceUrl(...)`, reusando `currentOrgId()` y `newUuid()` ya exportados
  (o reexportarlos). No requiere módulo nativo nuevo: `expo-camera` y `expo-crypto`
  ya están en el build (igual que picking) → entregable OTA, sin recompilar.
- **Secuencia en `payMutation` (solo online):** insertar el pago, recalcular
  status (como hoy), obtener el `id` del pago insertado (`.select('id').single()`),
  y luego por cada `uri` subir a Storage + insertar en `payment_photo_evidence`.
  Best-effort: si una foto falla, el pago queda igual y se avisa con `showAlert`
  (mismo criterio que `register.tsx`: "la operación crítica es el pago/registro").
- **Mostrar:** en el detalle expandido del pago, con flag ON, resolver URLs
  firmadas de la evidencia del pago y mostrar thumbnails.

---

## 10. Edge Functions

**Decisión: no se crea ni modifica una Edge Function de subida/listado/borrado**,
porque el flujo de pagos (web y mobile) es cliente-directo por SDK y la evidencia
replica el modelo cliente-directo de picking (§2.1). Crear una Edge Function solo
para esto introduciría un patrón inconsistente con todo el dominio de pagos.

Lo que SÍ se toca del área backend:
- `supabase/functions/_shared/feature-flags.ts`: ya expone `resolveFlagForOrg`;
  no requiere cambios, queda disponible para el key nuevo.
- `supabase/functions/payments/index.ts`: no se modifica (sigue existiendo para su
  contrato, pero ni web ni mobile lo usan hoy; no se le añade evidencia para no
  tocar un camino muerto).

Si a futuro el equipo centraliza pagos en la Edge Function, el amarre backend ya
está (`resolveFlagForOrg`) y bastaría mover la subida+INSERT ahí con
`requireRole(['admin','supervisor','crew_lead'])`, `requirePermission('payments.manage')`
y 403 cuando el flag esté OFF. Fuera de alcance.

---

## 11. Casos borde y errores

| Caso | Comportamiento |
|---|---|
| Flag OFF | UI de fotos oculta; registro de pago normal; sin errores (degradación limpia). |
| 0 fotos | Pago normal; `payment_photo_evidence` sin filas. Caso por defecto. |
| Intento de 4ª foto | Cliente deshabilita "Agregar" al llegar a 3; si aún así se intenta, el trigger `enforce_payment_evidence_limit` lanza `PAYMENT_EVIDENCE_LIMIT` → el cliente lo mapea y muestra "Máximo 3 imágenes". |
| Falla la subida a Storage | Best-effort: el pago NO se revierte; se avisa (toast/alert) y la fila de evidencia no se crea. |
| Falla el INSERT de evidencia tras subir el objeto | Queda un objeto huérfano en Storage (sin fila). Aceptable: bucket privado, objeto no referenciable sin su fila; limpieza futura por job de mantenimiento (service role). Se documenta; no se añade saga/rollback (sobre-ingeniería). |
| MIME no permitido | `allowed_mime_types` del bucket (jpeg/png/webp) rechaza; el cliente filtra con `accept`. |
| Archivo > 10 MiB | `file_size_limit` del bucket rechaza; mobile `PhotoCapture` ya toma a `quality: 0.6`. |
| URL firmada expirada | Se regenera on-demand al abrir la vista (TTL 3600 s, igual que picking). |
| Cross-tenant | RLS de tabla y de Storage (`[1] = current_org_id()`) + FKs compuestas lo impiden en todos los extremos. |
| Pago inexistente / de otra org | FK compuesta `fk_pay_evidence_payment_org` falla el INSERT. |

**Validación de cada input externo:**
- `payment_id`: UUID requerido (Zod + FK). Fallo → error de validación/FK.
- `image_path`: string no vacío (Zod + CHECK `length>0`). Debe tener el prefijo
  `{org_id}/` que la RLS de Storage valida; si no, el `upload` se rechaza.
- Archivo imagen: MIME ∈ {jpeg,png,webp}, ≤10 MiB (bucket). Cantidad ≤3 (trigger).
- `uploaded_by`: lo fija el cliente = `worker.id`, y RLS lo exige igual a
  `current_worker_id()`; discrepancia → RLS rechaza.

**Fuera de alcance inmediato (justificado):**
- **Evidencia en pagos offline** (`offline-queue.ts` `payment_insert`): subir fotos
  requiere conexión; el replay offline inserta el pago sin fotos. Igual que picking
  (`register.tsx`: `photoSkippedOffline`). Se mantiene esa política: pago encolado
  offline no adjunta fotos; se avisa. No se persisten imágenes locales para replay
  (sobre-ingeniería para el MVP).
- **Evidencia en `crew.tsx`** (pago del crew_lead a su gente): fuera de alcance de
  esta tarea para acotar; la policy ya autoriza a `crew_lead`, así que extenderlo
  luego es solo UI. Anotado.

---

## 12. Testabilidad

- **Unit (`packages/shared`, Vitest):** `MAX_IMAGES === 3`, `BUCKET` correcto,
  `resolveFeatureFlag` OFF por default para el key; `createPaymentEvidenceSchema`
  acepta/rechaza payloads. Precedente: `dispatch.test.ts`, `picking-payment.test.ts`.
- **Integración DB (migración):** aplicar `20261006000001` sobre DB con seed;
  verificar (a) bucket creado, (b) INSERT de 3 filas OK y la 4ª lanza
  `PAYMENT_EVIDENCE_LIMIT`, (c) RLS: worker no inserta/lee; admin/supervisor/
  crew_lead de la org sí; cross-tenant denegado, (d) `ON DELETE CASCADE` al borrar
  un `payments` de prueba, (e) la FK compuesta rechaza `payment_id` de otra org,
  (f) `prevent_paid_settlement_update` sigue intacto (adjuntar evidencia a un pago
  cuya liquidación quedó `paid` no toca `settlements`).
- **Integración Storage RLS:** subir a `{org}/{payment}/{uuid}.jpg` con token de
  cada rol; validar lectura/escritura por org y la inmutabilidad (UPDATE/DELETE
  denegados).
- **E2E web (Playwright, si aplica):** con flag ON, registrar pago + 2 fotos y ver
  thumbnails; con flag OFF, el bloque no aparece.
- **Difícil de automatizar:** la cámara nativa de `PhotoCapture` (prueba manual en
  device). El resto es testeable.

Verificación: tras implementar, correr `turbo build`/typecheck y los tests de
`packages/shared`; aplicar la migración con `npx supabase db reset` (local requiere
Rancher en modo `dockerd (moby)`, ver `local-env`).

---

## 13. Reversibilidad de la migración

Sin `down` automático (las migraciones del repo documentan la reversión en
comentarios, p. ej. `dispatch_receipts`). Documentar en el header:

```sql
-- Reversibilidad (documentada; sin down automático; en orden):
--   DROP TABLE payment_photo_evidence CASCADE;
--   DROP FUNCTION IF EXISTS enforce_payment_evidence_limit();
--   DROP POLICY "org_read_payment_evidence"   ON storage.objects;
--   DROP POLICY "org_insert_payment_evidence" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'payment-evidence';
--   DELETE FROM platform_feature_flags WHERE key = 'payment_photo_evidence';
--   ALTER TABLE payments DROP CONSTRAINT uq_payments_id_org;  -- solo si no hay otras FKs apoyadas
```

---

## 14. Resumen de archivos a tocar

- **Nuevo** `supabase/migrations/20261006000001_create_payment_photo_evidence.sql`
  (bucket + policies Storage + tabla + FKs + `uq_payments_id_org` + trigger límite
  + RLS + seed del flag).
- `packages/shared/src/types/index.ts` (interfaz `PaymentPhotoEvidence`).
- `packages/shared/src/constants/index.ts` (`ERROR_CODES.PAYMENT_EVIDENCE_LIMIT`,
  `FEATURE_FLAGS.PAYMENT_PHOTO_EVIDENCE`, `PAYMENT_EVIDENCE`).
- `packages/shared/src/validation/index.ts` (`createPaymentEvidenceSchema`).
- **Nuevo** `packages/shared/src/types/payment-evidence.test.ts`.
- `apps/web/src/app/(dashboard)/payments/page.tsx` (adjuntar + thumbnails, gated).
- **Nuevo** helper web `apps/web/src/lib/payment-evidence.ts` (org del JWT, upload,
  signed URL) — espejo del de mobile.
- **Nuevo** `apps/mobile/src/lib/payment-evidence.ts` (espejo de `picking-evidence.ts`).
- `apps/mobile/app/(tabs)/payments.tsx` (adjuntar con `PhotoCapture` + thumbnails,
  gated).
- Doc: fila nueva en la tabla de flags de `.kiro/steering/feature-flags` y
  CHANGELOG/MkDocs según `documentation`.

---

## 15. Stack (bloqueado tras aprobación)

PostgreSQL 15 + RLS (migración SQL cruda), Supabase Storage (bucket privado),
Supabase JS SDK para subida/signed URL (cliente directo, sin Edge Function nueva),
`@fundo360/shared` (tipos/constantes/Zod), Next.js App Router + Tailwind (tokens
HSL) + lucide-react en web, Expo React Native + `expo-camera` (`PhotoCapture`) +
`expo-crypto` en mobile, TanStack Query para lectura/caché, Vitest para unit.
