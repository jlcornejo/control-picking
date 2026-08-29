-- ============================================================
-- FASE 2: rol crew_lead (Encargado / Capataz)
-- ============================================================
-- Añade el valor 'crew_lead' al enum worker_role, entre 'supervisor'
-- y 'worker' para reflejar la jerarquía Admin > Supervisor > Encargado > Trabajador.
--
-- IMPORTANTE: ALTER TYPE ... ADD VALUE debe ejecutarse en su propia
-- migración, separada de cualquier uso del nuevo valor, porque el valor
-- no es utilizable dentro de la misma transacción que lo añade.
-- ============================================================

ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'crew_lead' AFTER 'supervisor';
