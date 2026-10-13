-- ============================================================
-- FEATURE FLAGS: kg_payment + product_varieties
-- ============================================================
-- Gating de "Pago por kilo" y "Variedades de producto". Default global apagado
-- (enabled=false); cada organización los activa vía override en
-- organization_feature_flags. strategy='org_override' (se puede sobreescribir por
-- tenant). Idempotente por la UNIQUE uq_platform_feature_flags_key.
--
-- No se crea flag nuevo de destare: se reutiliza box_tare_control (20260927000001).
--
-- Reversibilidad (documentada; sin `down` automático):
--   DELETE FROM platform_feature_flags WHERE key IN ('kg_payment', 'product_varieties');
-- ============================================================

INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('kg_payment', 'Pago por kilo',
   'Habilita productos por kilo (unit_measure=kg): captura de kilos pagables y cálculo de liquidación por kilo. Coexiste con el pago por caja.',
   'cosecha', 'org_override', false),
  ('product_varieties', 'Variedades de producto',
   'Habilita el catálogo de variedades bajo un producto, su asignación a paños y la tarifa por variedad.',
   'cosecha', 'org_override', false)
ON CONFLICT (key) DO NOTHING;
