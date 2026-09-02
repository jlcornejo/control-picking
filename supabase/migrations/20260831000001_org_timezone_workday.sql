-- ============================================================
-- MULTI-TENANT: zona horaria por organización y "día de trabajo"
-- ============================================================
-- La base opera en UTC (correcto). Pero el "día de cosecha" (work_day) es un
-- concepto de negocio que pertenece a la OPERACIÓN, no al instante UTC ni al
-- dispositivo de quien registra. Por eso cada organización define su zona
-- horaria y el work_day se calcula en esa zona, en el servidor.
--
-- Añade:
--   - organizations.timezone (IANA, default 'America/Santiago')
--   - org_workday(org_id): fecha actual en la zona de esa organización
--   - current_org_workday(): fecha actual en la zona del tenant del JWT
--     (usada por las políticas RLS que limitan acciones a "hoy")
-- ============================================================

-- ------------------------------------------------------------
-- Columna: zona horaria IANA de la organización
-- ------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Santiago';

COMMENT ON COLUMN organizations.timezone IS
  'Zona horaria IANA de la organización (ej. America/Santiago). Autoridad del work_day.';

-- Validar que sea una zona IANA reconocida por Postgres. Un CHECK constraint no
-- admite subconsultas (no puede referenciar pg_timezone_names), así que la
-- validación se hace con un trigger BEFORE INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.validate_organization_timezone()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.timezone IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'Zona horaria inválida: %', NEW.timezone
      USING HINT = 'Debe ser una zona IANA reconocida (ej. America/Santiago).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizations_validate_timezone ON organizations;
CREATE TRIGGER trg_organizations_validate_timezone
  BEFORE INSERT OR UPDATE OF timezone ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_organization_timezone();

COMMENT ON FUNCTION public.validate_organization_timezone IS
  'Valida que organizations.timezone sea una zona IANA reconocida por Postgres.';

-- ------------------------------------------------------------
-- Helper: fecha "hoy" en la zona de una organización dada
-- ------------------------------------------------------------
-- SECURITY DEFINER para poder leer organizations.timezone sin exponer la fila
-- vía RLS. STABLE porque depende de now() dentro de la misma transacción.
CREATE OR REPLACE FUNCTION public.org_workday(p_org_id UUID)
RETURNS DATE AS $$
  SELECT (now() AT TIME ZONE COALESCE(
    (SELECT timezone FROM public.organizations WHERE id = p_org_id),
    'America/Santiago'
  ))::date;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.org_workday IS
  'Fecha actual (work_day) en la zona horaria de la organización indicada.';

-- ------------------------------------------------------------
-- Helper: fecha "hoy" en la zona del tenant del usuario autenticado
-- ------------------------------------------------------------
-- Usa el claim org_id del JWT. Pensada para las políticas RLS que restringen
-- operaciones (corrección de picking) a la jornada actual.
CREATE OR REPLACE FUNCTION public.current_org_workday()
RETURNS DATE AS $$
  SELECT public.org_workday(public.current_org_id());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.current_org_workday IS
  'Fecha actual (work_day) en la zona del tenant del JWT. Usada por RLS de "solo hoy".';

-- ------------------------------------------------------------
-- Default de work_day: dejar de usar CURRENT_DATE (UTC).
-- El valor autoritativo lo fija el servidor (Edge Function) al insertar; este
-- default es solo un respaldo y ahora usa la zona del tenant de la fila.
-- ------------------------------------------------------------
ALTER TABLE picking_records
  ALTER COLUMN work_day SET DEFAULT NULL;

-- Trigger de respaldo: si un INSERT no trae work_day, se calcula en la zona
-- de la organización del propio registro (nunca en UTC).
CREATE OR REPLACE FUNCTION public.set_picking_work_day()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.work_day IS NULL THEN
    NEW.work_day := public.org_workday(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_picking_set_work_day ON picking_records;
CREATE TRIGGER trg_picking_set_work_day
  BEFORE INSERT ON picking_records
  FOR EACH ROW
  EXECUTE FUNCTION public.set_picking_work_day();

COMMENT ON FUNCTION public.set_picking_work_day IS
  'Respaldo: fija work_day en la zona del tenant si el INSERT no lo especifica.';
