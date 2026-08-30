-- ============================================================
-- PLATFORM_AUDIT_LOG (auditoría de acciones de plataforma)
-- ============================================================
-- Registra accesos y cambios de un Administrador_de_Plataforma sobre datos
-- de clientes (quién, qué organización, qué acción, cuándo). Soporta el
-- requisito de trazabilidad del bypass de aislamiento y la impersonación
-- de soporte. Es append-only por convención (sin updated_at).
-- ============================================================

CREATE TABLE platform_audit_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id  UUID NOT NULL REFERENCES platform_admins(id) ON DELETE RESTRICT,
  organization_id    UUID REFERENCES organizations(id) ON DELETE SET NULL,
  action             VARCHAR(80) NOT NULL,   -- ej. "impersonate", "update_field", "change_subscription"
  resource           VARCHAR(120),           -- ej. "fields:<uuid>"
  detail             JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consulta por admin y por organización
CREATE INDEX idx_platform_audit_admin ON platform_audit_log (platform_admin_id);
CREATE INDEX idx_platform_audit_org ON platform_audit_log (organization_id);
CREATE INDEX idx_platform_audit_created_at ON platform_audit_log (created_at);

-- Comentarios
COMMENT ON TABLE platform_audit_log IS 'Registro append-only de acciones de plataforma sobre datos de clientes.';
COMMENT ON COLUMN platform_audit_log.action IS 'Acción realizada (impersonate, update_*, change_subscription, etc.).';
COMMENT ON COLUMN platform_audit_log.detail IS 'Contexto adicional en JSON (valores previos/nuevos, filtros, etc.).';
