-- ============================================================
-- FEATURE FLAG: dispatch_guides
-- ============================================================
-- Gating de "Guías de despacho": armado de guías logísticas (por paño o cierre
-- diario del campo) agregando la cosecha, y registro de recepción del cliente
-- para comparar despachado vs recibido. Default global apagado (enabled=false);
-- cada organización lo activa vía override en organization_feature_flags.
-- strategy='org_override' (se puede sobreescribir por tenant). Idempotente por
-- la UNIQUE uq_platform_feature_flags_key.
--
-- Amarre de 3 capas (design §10): (1) catálogo = esta migración; (2) código =
-- FEATURE_FLAGS.DISPATCH_GUIDES en @fundo360/shared + consumo vía useFeatureFlag
-- (web) y resolveFeatureFlag (Edge Function) — implementado en FEAT-002;
-- (3) panel = aparece automáticamente en /platform/feature-flags (solo gestiona
-- default global y overrides; nunca se crea/renombra desde la consola).
--
-- Reversibilidad (documentada; sin `down` automático):
--   DELETE FROM platform_feature_flags WHERE key = 'dispatch_guides';
-- ============================================================

INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('dispatch_guides', 'Guías de despacho',
   'Armado de guías de despacho (por paño o cierre diario del campo) agregando la cosecha, y registro de recepción del cliente para comparar despachado vs recibido.',
   'logistica', 'org_override', false)
ON CONFLICT (key) DO NOTHING;
