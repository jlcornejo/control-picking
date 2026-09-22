-- ============================================================
-- GLOBAL FEATURE FLAGS (control de capacidades de la plataforma)
-- ============================================================
-- Permite al super-admin activar/desactivar funcionalidades de forma
-- progresiva y, opcionalmente, sobreescribir por organización (tenant).
--
-- Modelo de resolución (efectivo por org):
--   1) Si existe override en organization_feature_flags para (org, flag) →
--      manda el override.enabled.
--   2) Si no hay override → manda platform_feature_flags.enabled (default global).
--
-- platform_feature_flags es una tabla de PLATAFORMA (no pertenece a un tenant,
-- no tiene organization_id), al estilo de platform_admins/platform_audit_log.
-- organization_feature_flags SÍ es por tenant (lleva organization_id).
-- ============================================================

-- ------------------------------------------------------------
-- Estrategia de despliegue del flag (informativa, para la consola)
-- ------------------------------------------------------------
CREATE TYPE feature_flag_strategy AS ENUM ('global', 'org_override', 'kill_switch');

-- ============================================================
-- platform_feature_flags: catálogo global de flags
-- ============================================================
CREATE TABLE platform_feature_flags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          VARCHAR(80) NOT NULL,                 -- identificador estable (ej. "bluetooth_scale")
  name         VARCHAR(150) NOT NULL,                -- nombre legible (ej. "Báscula Bluetooth")
  description  TEXT,
  category     VARCHAR(60) NOT NULL DEFAULT 'general',
  strategy     feature_flag_strategy NOT NULL DEFAULT 'org_override',
  enabled      BOOLEAN NOT NULL DEFAULT false,       -- default global cuando no hay override
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_platform_feature_flags_key UNIQUE (key),
  -- key url-safe: minúsculas, números y guion bajo
  CONSTRAINT chk_platform_feature_flags_key CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
);

CREATE INDEX idx_platform_feature_flags_category ON platform_feature_flags (category);

CREATE TRIGGER trg_platform_feature_flags_updated_at
  BEFORE UPDATE ON platform_feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE platform_feature_flags IS 'Catálogo global de feature flags de la plataforma (super-admin). Default global en enabled; override por tenant en organization_feature_flags.';
COMMENT ON COLUMN platform_feature_flags.key IS 'Identificador estable del flag, usado por las apps para consultar su estado.';
COMMENT ON COLUMN platform_feature_flags.strategy IS 'Informativa: global (mismo valor para todos), org_override (se puede sobreescribir por tenant), kill_switch (interruptor de emergencia).';
COMMENT ON COLUMN platform_feature_flags.enabled IS 'Valor por defecto global del flag cuando no hay override para la organización.';

-- ============================================================
-- organization_feature_flags: overrides por tenant
-- ============================================================
CREATE TABLE organization_feature_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  flag_key         VARCHAR(80) NOT NULL REFERENCES platform_feature_flags(key) ON DELETE CASCADE,
  enabled          BOOLEAN NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un override por (org, flag)
  CONSTRAINT uq_org_feature_flags UNIQUE (organization_id, flag_key)
);

CREATE INDEX idx_org_feature_flags_org ON organization_feature_flags (organization_id);
CREATE INDEX idx_org_feature_flags_key ON organization_feature_flags (flag_key);

CREATE TRIGGER trg_org_feature_flags_updated_at
  BEFORE UPDATE ON organization_feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Autocompletar organization_id desde el JWT si el override lo crea un miembro
-- de la org (mismo patrón que las demás tablas de tenant). El super-admin envía
-- organization_id explícito vía service client.
CREATE TRIGGER trg_set_org_id_org_feature_flags
  BEFORE INSERT ON organization_feature_flags
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

COMMENT ON TABLE organization_feature_flags IS 'Override por organización de un feature flag global. Ausencia de fila = hereda el default global (platform_feature_flags.enabled).';
COMMENT ON COLUMN organization_feature_flags.flag_key IS 'Referencia al key del flag global.';
COMMENT ON COLUMN organization_feature_flags.enabled IS 'Valor efectivo del flag para esta organización (sobreescribe el default global).';

-- ============================================================
-- RLS
-- ============================================================
-- platform_feature_flags: el super-admin gestiona todo; cualquier usuario
-- autenticado puede LEER el catálogo (las apps necesitan conocer los flags).
ALTER TABLE platform_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_feature_flags" ON platform_feature_flags
  FOR ALL USING (is_platform_admin());

CREATE POLICY "authenticated_read_feature_flags" ON platform_feature_flags
  FOR SELECT USING (auth.role() = 'authenticated');

-- organization_feature_flags: el super-admin gestiona todo; la organización lee
-- (y sus admins gestionan) solo sus propios overrides.
ALTER TABLE organization_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_org_feature_flags" ON organization_feature_flags
  FOR ALL USING (is_platform_admin());

CREATE POLICY "member_read_own_org_feature_flags" ON organization_feature_flags
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "admin_manage_own_org_feature_flags" ON organization_feature_flags
  FOR ALL USING (is_admin() AND organization_id = current_org_id());

-- El hook de claims no necesita estas tablas, pero las apps las leen con el
-- rol authenticated (RLS ya lo permite arriba).
