-- ============================================================
-- FEATURE FLAG: bluetooth_scale
-- ============================================================
-- Gating de "Lectura de balanza Bluetooth": captura automática del peso (kg)
-- desde una balanza Bluetooth ya emparejada con el equipo Android, para
-- autocompletar los kilos en el registro de cosecha. Solo Android (la balanza
-- usa Bluetooth Classic/SPP, no soportado por iOS sin MFi). Siempre con captura
-- manual como respaldo. Default global apagado (enabled=false); cada
-- organización lo activa vía override en organization_feature_flags.
-- strategy='org_override' (se puede sobreescribir por tenant). Idempotente por
-- la UNIQUE uq_platform_feature_flags_key.
--
-- Amarre de 3 capas: (1) catálogo = esta migración; (2) código =
-- FEATURE_FLAGS.BLUETOOTH_SCALE en @fundo360/shared + consumo vía
-- useFeatureFlag('bluetooth_scale') en la app móvil; (3) panel = aparece
-- automáticamente en /platform/feature-flags (solo gestiona default global y
-- overrides; nunca se crea/renombra desde la consola).
--
-- Reversibilidad (documentada; sin `down` automático):
--   DELETE FROM platform_feature_flags WHERE key = 'bluetooth_scale';
-- ============================================================

INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('bluetooth_scale', 'Lectura de balanza Bluetooth',
   'Captura automática del peso (kg) desde una balanza Bluetooth ya emparejada con el equipo Android, para autocompletar los kilos en el registro de cosecha. Disponible solo en Android; en iOS y como respaldo siempre queda la captura manual.',
   'cosecha', 'org_override', false)
ON CONFLICT (key) DO NOTHING;
