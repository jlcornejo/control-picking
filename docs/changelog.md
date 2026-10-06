# Changelog

Historial de cambios relevantes de Fundo360, en formato
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

!!! note "Fuente"
    La fuente de verdad del changelog es el archivo
    [`CHANGELOG.md`](https://github.com/jlcornejo/control-picking/blob/main/CHANGELOG.md)
    en la raíz del repositorio. Esta página reproduce su contenido para consulta rápida
    desde el sitio.

Convenciones: los cambios se agrupan por tipo (**Añadido**, **Cambiado**, **Corregido**,
**Infra/Deploy**). El backend Supabase (migraciones y Edge Functions) se despliega directo
con el CLI; el frontend web se despliega en Vercel desde `main`.

---

## [Sin publicar]

### Añadido

- **Set de pruebas manuales por perfil**: casos paso a paso para validar la app móvil
  (Supervisor, Admin, Encargado, Trabajador). Ver la sección [Pruebas](pruebas/vision-general.md).
- **Actualizaciones OTA (`expo-updates`)** en la app móvil: a partir del próximo build, los
  cambios de solo-código se entregan por aire sin reinstalar la app.
- **Foto de respaldo en el registro de picking** (bajo feature flag por organización): el
  supervisor/anotador adjunta una foto como comprobante al registrar la cosecha. Se guarda
  en almacenamiento privado aislado por organización y se accede con enlace firmado
  temporal; no altera el pago (es evidencia/auditoría). La captura reusa la cámara ya
  presente, por lo que se entrega sin reinstalar la app.
- **Accesibilidad: tamaño de texto configurable** (Normal / Grande / Extra grande) desde el
  perfil, pensado para usuarios con baja visión. Agranda todo el texto de la app.
- **Centro de documentación del proyecto** en el sitio: secciones
  [Legacy / Paridad](legacy/vision-general.md) (mapa funcional del legacy, paridad con
  Fundo360 y decisiones de negocio) y [Planning](planning/vision-general.md) (etapas,
  estado, estimaciones y [tablero](planning/tablero.md) tipo Kanban). Centraliza la
  documentación y el seguimiento del proyecto sin depender de Jira/Confluence.
- **Consola Super-Admin (plataforma)** — panel para el dueño/soporte del SaaS, separado
  del dashboard de cliente. Onboarding de clientes, feature flags globales + overrides por
  tenant, métricas de plataforma y vista de soporte de solo-lectura (todo auditado).
- **Cambio de contraseña forzado** en el primer ingreso (`workers.must_change_password`).
- **Roster diario trabajador–capataz** (`day_roster`): el responsable arma su equipo cada
  jornada; `picking_records.day_roster_id` congela la atribución del día.
- **Datos de prueba del remoto** y scripts de carga de usuarios.

### Cambiado

- Rediseño de la consola super-admin (KPIs, filtros por suscripción, tabla enriquecida,
  banner de sesión auditada).

### Corregido

- CORS de Edge Functions: se añadieron los headers `apikey` y `x-client-info` para que el
  preflight cross-origin no falle en producción.

### Infra/Deploy

- Migraciones y Edge Functions desplegadas al remoto vía CLI.
- `.kiro/settings/mcp.json` dejó de versionarse (puede contener API keys).

---

## [0.1.0] — Base del MVP

### Añadido

- **Multi-tenant**: organizaciones con aislamiento por RLS y claims de JWT.
- **Dominio de cosecha**: campos, paños, melgas, productos, tarifas con historial,
  trabajadores con roles y badges QR.
- **Picking**: registro de cosecha con tarifa congelada inmutable.
- **Liquidaciones y pagos**: individuales y de cuadrilla, inmutables cuando están pagadas.
- **Modo Capataz** y **melgas** configurables por organización.
- **Apps**: dashboard web (Next.js) y app móvil (Expo) sobre Supabase.
