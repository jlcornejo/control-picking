-- ============================================================
-- IMÁGENES DE RESPALDO DEL REGISTRO DE PICKING (EVIDENCIA)
-- ============================================================
-- Permite que el supervisor/anotador adjunte una foto de respaldo al registrar
-- la cosecha (comprobante visual de la entrega). La imagen se guarda en un bucket
-- privado de Storage, aislado por organización vía la ruta del objeto, y se
-- referencia desde picking_records con una columna opcional (patrón snapshot,
-- igual que el destare: NULLable, no altera el pago).
--
-- Decisiones de negocio:
--   - UNA imagen por registro (columna, no tabla hija): suficiente para el caso.
--   - Se guarda la RUTA del objeto (storage key), NUNCA una URL pública: el bucket
--     es privado y se accede con URL firmada temporal.
--   - Aislamiento por tenant por el PRIMER segmento del path = organization_id.
--     Convención de ruta: {org_id}/{picking_record_id}/{uuid}.jpg
--   - Evidencia INMUTABLE: los roles de terreno pueden subir y leer, pero NO
--     borrar ni sobreescribir (coherente con los snapshots de auditoría).
--   - Gating: se activa por organización con el feature flag
--     `picking_photo_evidence` (default global apagado).
-- ============================================================

-- ------------------------------------------------------------
-- Bucket privado de evidencia
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'picking-evidence',
  'picking-evidence',
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
CREATE POLICY "org_read_picking_evidence" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'picking-evidence'
    AND (
      is_platform_admin()
      OR (storage.foldername(name))[1] = current_org_id()::text
    )
  );

-- Subida: roles de terreno que registran, dentro de su organización.
CREATE POLICY "org_insert_picking_evidence" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'picking-evidence'
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
-- picking_records: referencia a la imagen de respaldo
-- ============================================================
-- Columna OPCIONAL (NULLable): solo se completa cuando el tenant usa evidencia
-- fotográfica y el supervisor adjuntó una foto. Guarda la ruta del objeto en el
-- bucket, no una URL. El registro es válido con o sin foto.
ALTER TABLE picking_records
  ADD COLUMN backup_image_path TEXT
  CHECK (backup_image_path IS NULL OR length(backup_image_path) > 0);

COMMENT ON COLUMN picking_records.backup_image_path IS 'Ruta (storage key) de la foto de respaldo en el bucket privado picking-evidence. NULL si no se adjuntó. Formato {org_id}/{record_id}/{uuid}.jpg. Se accede con URL firmada temporal; nunca es pública.';

-- ============================================================
-- Feature flag: picking_photo_evidence
-- ============================================================
-- Gating de la captura de foto de respaldo. Default global apagado; cada
-- organización lo activa vía override (organization_feature_flags).
INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('picking_photo_evidence', 'Foto de respaldo en registro', 'Permite al supervisor/anotador adjuntar una foto de respaldo al registrar la cosecha. La imagen se guarda en almacenamiento privado por organización y se accede con enlace firmado temporal.', 'cosecha', 'org_override', false)
ON CONFLICT (key) DO NOTHING;
