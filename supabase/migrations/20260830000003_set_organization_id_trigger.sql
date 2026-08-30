-- ============================================================
-- FASE 3b (fix): autocompletar organization_id desde el JWT
-- ============================================================
-- Las tablas de dominio tienen organization_id NOT NULL sin default. Los
-- INSERT directos desde el cliente (Supabase JS) no envían organization_id,
-- por lo que quedaban NULL y RLS los rechazaba (42501).
--
-- Este trigger BEFORE INSERT completa organization_id con current_org_id()
-- (el claim org_id del usuario autenticado) cuando viene NULL. Si el INSERT
-- ya trae organization_id (p.ej. el seed o un service role), se respeta.
-- El aislamiento de tenant lo sigue garantizando RLS (organization_id =
-- current_org_id()) y las FKs compuestas de tenant.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_organization_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := current_org_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.set_organization_id IS 'BEFORE INSERT: completa organization_id con el claim org_id del JWT si viene NULL.';

-- Aplicar a las tablas de dominio con organization_id
CREATE TRIGGER trg_set_org_id_payments
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

CREATE TRIGGER trg_set_org_id_settlements
  BEFORE INSERT ON settlements
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

CREATE TRIGGER trg_set_org_id_workers
  BEFORE INSERT ON workers
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

CREATE TRIGGER trg_set_org_id_crews
  BEFORE INSERT ON crews
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

CREATE TRIGGER trg_set_org_id_supervisor_assignments
  BEFORE INSERT ON supervisor_assignments
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

CREATE TRIGGER trg_set_org_id_picking_records
  BEFORE INSERT ON picking_records
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

CREATE TRIGGER trg_set_org_id_products
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

CREATE TRIGGER trg_set_org_id_fields
  BEFORE INSERT ON fields
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

CREATE TRIGGER trg_set_org_id_blocks
  BEFORE INSERT ON blocks
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

CREATE TRIGGER trg_set_org_id_rates
  BEFORE INSERT ON rates
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();
