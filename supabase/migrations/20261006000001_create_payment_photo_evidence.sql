-- ============================================================
-- IMÁGENES DE RESPALDO EN PAGOS (EVIDENCIA)
-- ============================================================
-- Permite adjuntar hasta 3 imágenes de respaldo al registrar un pago
-- (p. ej. pago en mano/efectivo). Las imágenes se guardan en un bucket privado
-- de Storage, aisladas por organización vía el primer segmento de la ruta del
-- objeto, y se referencian desde una tabla hija 1:N payment_photo_evidence
-- (patrón de dispatch_receipts: tabla separada + FKs compuestas de tenant).
--
-- Decisiones de negocio:
--   - N imágenes por pago (tabla hija 1:N), con un MÁXIMO de 3 (trigger).
--   - Se guarda la RUTA del objeto (storage key), NUNCA una URL pública: el
--     bucket es privado y se accede con URL firmada temporal.
--   - Aislamiento por tenant por el PRIMER segmento del path = organization_id.
--     Convención de ruta: {org_id}/{payment_id}/{uuid}.jpg
--   - Evidencia INMUTABLE: los roles de terreno pueden subir y leer, pero NO
--     borrar ni sobreescribir (coherente con los snapshots de auditoría). Sin
--     columna updated_at ni trigger update_updated_at_column.
--   - La evidencia NO altera payments.amount ni ninguna liquidación: no se tocan
--     settlements ni prevent_paid_settlement_update.
--   - Gating: se activa por organización con el feature flag
--     `payment_photo_evidence` (default global apagado).
--
-- Reversibilidad (documentada; sin `down` automático):
--   DROP TABLE payment_photo_evidence CASCADE;
--   DROP FUNCTION enforce_payment_evidence_limit();
--   DROP POLICY "org_read_payment_evidence" ON storage.objects;
--   DROP POLICY "org_insert_payment_evidence" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'payment-evidence';
--   DELETE FROM platform_feature_flags WHERE key = 'payment_photo_evidence';
--   ALTER TABLE payments DROP CONSTRAINT uq_payments_id_org;
-- ============================================================

-- ------------------------------------------------------------
-- Bucket privado de evidencia
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-evidence',
  'payment-evidence',
  false,                                   -- privado: acceso solo con URL firmada
  10485760,                                -- 10 MiB por archivo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- storage.objects: Row Level Security del bucket de evidencia
-- ============================================================
-- storage.objects ya tiene RLS habilitado por defecto en Supabase; solo se
-- añaden policies acotadas a este bucket. El tenant se identifica por el primer
-- segmento de la ruta del objeto: (storage.foldername(name))[1] = org_id.
--
--   admin / supervisor / crew_lead -> suben evidencia de SU organización.
--   todos los roles de la org       -> leen evidencia de SU organización.
--   platform_admin                  -> bypass (soporte).
--   nadie (salvo plataforma)        -> update/delete: la evidencia es inmutable.

-- Lectura: miembros de la organización dueña del objeto.
CREATE POLICY "org_read_payment_evidence" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'payment-evidence'
    AND (
      is_platform_admin()
      OR (storage.foldername(name))[1] = current_org_id()::text
    )
  );

-- Subida: roles de gestión que registran pagos, dentro de su organización.
CREATE POLICY "org_insert_payment_evidence" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'payment-evidence'
    AND (
      is_platform_admin()
      OR (
        (is_admin() OR is_supervisor() OR is_crew_lead())
        AND (storage.foldername(name))[1] = current_org_id()::text
      )
    )
  );

-- Nota: NO se crean policies de UPDATE ni DELETE para roles de tenant. Sin
-- policy permisiva, RLS deniega esas operaciones (la evidencia queda inmutable).
-- platform_admin opera vía service role cuando haga falta mantenimiento.

-- ============================================================
-- payments: clave única compuesta de tenant (requisito de la FK compuesta)
-- ============================================================
-- payments NO tiene uq_payments_id_org hoy (verificado en
-- 20260829000005_tenant_composite_fks.sql); se añade para poder referenciarlo
-- con una FK compuesta (id, organization_id) desde payment_photo_evidence.
ALTER TABLE payments ADD CONSTRAINT uq_payments_id_org UNIQUE (id, organization_id);

-- ============================================================
-- payment_photo_evidence: tabla hija 1:N (inmutable)
-- ============================================================
CREATE TABLE payment_photo_evidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  payment_id      UUID NOT NULL,
  image_path      TEXT NOT NULL CHECK (length(image_path) > 0),
  uploaded_by     UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_payment_photo_evidence_id_org UNIQUE (id, organization_id)
);

-- FKs compuestas de tenant
ALTER TABLE payment_photo_evidence ADD CONSTRAINT fk_pay_evidence_payment_org
  FOREIGN KEY (payment_id, organization_id) REFERENCES payments (id, organization_id) ON DELETE CASCADE;
ALTER TABLE payment_photo_evidence ADD CONSTRAINT fk_pay_evidence_uploaded_by_org
  FOREIGN KEY (uploaded_by, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

CREATE INDEX idx_payment_photo_evidence_organization ON payment_photo_evidence (organization_id);
CREATE INDEX idx_payment_photo_evidence_payment_id ON payment_photo_evidence (payment_id);

-- Trigger de tenant: fija organization_id desde el contexto en INSERT.
CREATE TRIGGER trg_set_org_id_payment_photo_evidence
  BEFORE INSERT ON payment_photo_evidence
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

-- ------------------------------------------------------------
-- Límite máx 3 imágenes por pago
-- ------------------------------------------------------------
CREATE FUNCTION enforce_payment_evidence_limit()
RETURNS TRIGGER AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT count(*) INTO n
  FROM payment_photo_evidence
  WHERE payment_id = NEW.payment_id;
  IF n >= 3 THEN
    RAISE EXCEPTION 'PAYMENT_EVIDENCE_LIMIT: máximo 3 imágenes de respaldo por pago'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_payment_evidence_limit
  BEFORE INSERT ON payment_photo_evidence
  FOR EACH ROW EXECUTE FUNCTION enforce_payment_evidence_limit();

-- ============================================================
-- RLS: escritura solo roles de gestión, acotada por org
-- ============================================================
ALTER TABLE payment_photo_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_payment_evidence" ON payment_photo_evidence
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

CREATE POLICY "writer_insert_payment_evidence" ON payment_photo_evidence
  FOR INSERT WITH CHECK (
    is_platform_admin()
    OR (
      (is_admin() OR is_supervisor() OR is_crew_lead())
      AND organization_id = current_org_id()
      AND uploaded_by = current_worker_id()
    )
  );

CREATE POLICY "member_read_payment_evidence" ON payment_photo_evidence
  FOR SELECT USING (
    is_platform_admin()
    OR (
      (is_admin() OR is_supervisor() OR is_crew_lead())
      AND organization_id = current_org_id()
    )
  );

-- ============================================================
-- Feature flag: payment_photo_evidence
-- ============================================================
-- Gating de la captura de foto de respaldo en pagos. Default global apagado;
-- cada organización lo activa vía override (organization_feature_flags).
INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('payment_photo_evidence', 'Foto de respaldo en pagos', 'Permite adjuntar hasta 3 imágenes de respaldo al registrar un pago (p. ej. pago en mano/efectivo). Las imágenes se guardan en almacenamiento privado por organización y se acceden con enlace firmado temporal. No afecta el monto ni la liquidación.', 'pagos', 'org_override', false)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE payment_photo_evidence IS 'Imágenes de respaldo de un pago (hasta 3, inmutables). Tabla hija 1:N de payments; guarda la ruta del objeto en el bucket privado payment-evidence, nunca una URL. No altera payments.amount ni la liquidación.';
COMMENT ON COLUMN payment_photo_evidence.image_path IS 'Ruta (storage key) de la imagen en el bucket privado payment-evidence. Formato {org_id}/{payment_id}/{uuid}.jpg. Se accede con URL firmada temporal; nunca es pública.';
