# Fundo360 — Documento de Diseño Actual (baseline para rediseño)

> Estado capturado el 2026-09-12. Este documento describe el **diseño y las funcionalidades actuales** de la plataforma, pensado como línea base ("as-is") para un rediseño. No propone cambios: documenta lo que hoy existe.

Alcance: dos apps cliente (móvil Expo + web Next.js) sobre un backend Supabase multi-tenant. El objetivo del producto es la **gestión de cosecha por pieza (picking)** en fruticultura: estructura de campos, trabajadores, tarifas, registro de cosecha con badge QR, liquidaciones y pagos, y métricas.

---

## 1. Arquitectura general

| Capa | Tecnología | Rol |
|------|-----------|-----|
| Móvil | Expo (SDK 54) + Expo Router, React 19, React Native 0.81 | App de terreno (operadores) y consulta (trabajadores) |
| Web | Next.js 15 (App Router), React 19, Tailwind | Dashboard administrativo + consola de plataforma |
| Backend | Supabase (Postgres + RLS, Auth JWT, Edge Functions, Storage, Realtime) | API, seguridad, persistencia |
| Estado/datos | TanStack Query (con persistencia AsyncStorage en móvil) | Cache, refetch, soporte offline |
| Compartido | `@fundo360/shared` | Tipos, enums, constantes, validación Zod |

Principios transversales:
- **RLS como barrera de seguridad primaria.** El ocultamiento de UI por rol es cosmético; Postgres (RLS + JWT) es la barrera real.
- **Acceso a datos híbrido:** las páginas de negocio leen tablas directamente (acotadas por RLS); la lógica sensible (generar liquidaciones, pagos, gestión de organizaciones, auditoría) pasa por **Edge Functions**.
- **Soft delete en todo el dominio:** no hay borrados destructivos; se togglea `status` (active/inactive). Los registros de picking se corrigen con **snapshot de auditoría**, nunca se sobreescriben sin traza.
- **Multi-tenant con branding dinámico:** cada organización define nombre, logo y colores; los mismos componentes se re-tematizan por tenant en runtime.
- **Copy en español, código en inglés.**

### Roles (jerarquía)
`admin > supervisor > crew_lead (Encargado) > worker (Trabajador)`

- **admin:** gestión total. Único que usa el dashboard web completo + app móvil.
- **supervisor:** operador de terreno; arma su "Mi Equipo" del día y registra producción.
- **crew_lead (Encargado):** gestiona su cuadrilla; en web solo ve "Mi Cuadrilla".
- **worker:** consulta su producción y pagos desde móvil; sin acceso al web.

---

## 2. Modelo de dominio (entidades)

Definidas en `packages/shared/src/types/index.ts`. Todas las PK son UUID.

- **Organization** — tenant. Campos clave: `slug`, `logo_url`, `brand_primary_color`, `brand_secondary_color`, `subscription_status` (trial/active/suspended/cancelled), `crew_mode_enabled`, `rows_enabled`, `role_labels` (etiquetas personalizadas por rol).
- **PlatformAdmin** — super-admin del SaaS, fuera de cualquier tenant.
- **Field (Campo)** — `location`, `total_area`, overrides opcionales `crew_mode_enabled` / `rows_enabled` (null = hereda de la org).
- **Block (Paño)** — pertenece a un campo, ligado a un `product_id`, con `area`.
- **FieldRow (Melga)** — subdivisión más fina de un paño (hilera). Nivel opcional (`rows_enabled`). Hereda producto/tarifa del paño. `row_number` opcional.
- **Product** — `unit_measure` (box/kg).
- **Rate (Tarifa)** — `amount` por producto con ciclo de vida `current`/`historical`. Al fijar nueva tarifa, la vigente pasa a histórica; los `rate_amount_snapshot` pasados **no cambian**.
- **Worker** — `full_name`, `national_id` (RUT), `phone`, `role`, `qr_badge_url` (UUID opaco), `crew_id`, `auth_user_id`.
- **Crew (Cuadrilla)** — `crew_lead_id`, `supervisor_id`, `name`.
- **DayRoster** — "equipo del día": un trabajador asignado a un lead (encargado o supervisor) para una jornada. Un trabajador tiene exactamente un lead por día (unique `org + work_day + worker_id`). Congela la atribución diaria.
- **PickingRecord** — un registro de cosecha: `quantity`, `rate_amount_snapshot` (inmutable), `work_day`, `recorded_by`, `day_roster_id`, `original_record_id` (si no es null → es snapshot de corrección).
- **Settlement (Liquidación)** — `payee_type` (worker/crew), período, `total_amount`, estado (pending/partial/paid).
- **Payment (Pago)** — pago contra una liquidación: `amount`, `paid_at`, `notes`.
- **SupervisorAssignment** — asigna trabajadores y/o paños a un supervisor.

**Contrato API** (Edge Functions): `{ success: true, data, meta? }` / `{ success: false, error: { code, message, details? } }`. Códigos de error de dominio en `packages/shared/src/constants/index.ts` (p. ej. `WORKER_NOT_ACTIVE`, `SETTLEMENT_IS_IMMUTABLE`, `PAYMENT_EXCEEDS_BALANCE`, `CORRECTION_OUTSIDE_WORKDAY`, `CREW_MODE_DISABLED`).

Edge Functions: `auth`, `workers`, `fields`, `blocks`, `field-rows`, `products`, `rates`, `crews`, `supervisors`, `picking-records`, `settlements`, `payments`, `metrics`, `organizations`, `platform-org-view`, `platform-audit-log`.

---

## 3. Sistema de diseño (tokens visuales)

### Móvil — `apps/mobile/src/constants/theme.ts`
- **Colores de marca (dinámicos):** `primary` (default `#1b5e20`), y derivados `primaryDark`, `primaryLight`, `primaryBg`, `primaryMuted`. Se recalculan en runtime desde el branding de la organización con `applyBrandColors()` (deriva variantes por HSL manteniendo el hue). El objeto `colors` es **mutable** y el `ThemeProvider` re-monta el árbol para reflejar el cambio.
- **Neutrales (fijos):** `background #fafbfc`, `card #ffffff`, `cardBorder #f0f2f5`, `surface #f8f9fb`.
- **Texto:** `text #0f172a`, `textSecondary #475569`, `textMuted #94a3b8`, `textWhite`.
- **Acentos:** blue `#3b82f6`, violet `#8b5cf6`, amber `#f59e0b`, red `#ef4444`, orange `#f97316` (cada uno con su `*Bg` claro).
- **spacing:** 4 / 8 / 12 / 16 / 20 / 24 / 32.
- **radius:** 8 / 12 / 16 / 20 / 24 / full(999).
- **font weights:** 400–800.
- Nota: el gradiente verde del login/producción usa hardcodes `#064e3b → #047857 → #059669` (no derivado del token de marca).

### Web — `globals.css` + `tailwind.config.ts`
- **Theming por CSS variables HSL:** `--primary: 152 60% 28%`, `--glow: 152 80% 50%`, `--background`, `--card`, `--muted`, `--accent`, `--border`, `--ring`. `--radius: 1rem`. Overridables por tenant vía branding.
- **Superficies con efecto:**
  - `.glow-card` — hover levanta 2px + sombra glow + gradiente radial que sigue el mouse.
  - `.aura-bg` — fondo con tres gradientes radiales (orbes verdes/cian).
  - `.glass-card` — glassmorphism (blanco 70% + backdrop-blur).
  - `.micro-chart` — mini barras.
- **Motion:** `fadeIn` keyframe + utilidad `.animate-in`; Framer Motion para transiciones.
- Íconos: `lucide-react`.

**Discrepancia actual entre plataformas:** el móvil usa un objeto de color mutable + Ionicons + emojis (🌿), mientras el web usa CSS variables HSL + lucide-react + orbes/glassmorphism. El verde es común pero los sistemas de tematización y el vocabulario visual difieren — punto a unificar en el rediseño.

---

## 4. App Móvil (Expo) — funcionalidades por pantalla

### Shell y navegación
- **RootLayout (`app/_layout.tsx`):** `SafeAreaProvider` + `PersistQueryClientProvider` (QueryClient: `staleTime` 30s, `retry` 1, `gcTime` 7 días; cache persistida en AsyncStorage `fundo360.query_cache.v1` para offline). Renderiza `OfflineBanner` global + `AnimatedSplash`. `AuthGate` redirige según sesión: sin sesión → `/login`; con sesión → `/(tabs)/production`.
- **Tab bar (`app/(tabs)/_layout.tsx`):** barra redondeada con sombra, respetando safe-area. Visibilidad **role-gated** vía `href: null`:
  - Dashboard (metrics) — admin/supervisor/crew_lead.
  - Producción — todos (título "Producción" para admin, "Mi Día" para worker).
  - Registro (botón central QR elevado) — admin/supervisor/crew_lead.
  - Pagos — todos (badge con nº de pagos de la última semana para workers, polling 60s).
  - Mi Cuadrilla — solo crew_lead.
  - Mi Equipo — solo supervisor.
  - Perfil — todos.
- Existe `FloatingTabBar.tsx` (barra flotante con blur) pero **no está cableada** hoy (diseño alternativo/no usado).

### Login (`app/login.tsx`)
Pantalla full-screen con `LinearGradient` verde oscuro→claro + 3 círculos decorativos translúcidos. Animación de entrada (logo spring + card slide-up). Logo emoji 🌿 en cuadro translúcido, "Fundo360 / Gestión integral de campo". Card blanca con inputs email + password (toggle 👁️/🙈), caja de error inline (Alert no es fiable en web), botón "Ingresar" con estado de carga. Muestra `v0.1.0`.

### Producción (`app/(tabs)/production.tsx`) — pantalla de aterrizaje
- Header con `LinearGradient` verde mostrando total de unidades + estimado ($). Etiqueta de unidad adaptativa (cajas/kilos/unidades).
- Barra de navegación por día ("‹ Ayer" / fecha centrada con punto "live" si es hoy / "Mañana ›" deshabilitado en hoy) + **gesto swipe** (PanResponder) para cambiar de día.
- `FlatList` de tarjetas de registro (`AnimatedCard` con entrada escalonada) → abre modal de detalle (producto, paño, campo, tarifa, hora, fecha).
- **Corrección:** roles de terreno pueden corregir cantidad, solo del día actual → escribe snapshot de auditoría con valores viejos y actualiza el original in-place. Offline: se encola (`picking_correction`).
- Pull-to-refresh; auto-refetch 15s en hoy; `ListSkeleton` / `EmptyState`.

### Registro de Picking (`app/(tabs)/register.tsx`) — flujo core
Wizard de 4 pasos con indicador de puntos: **scan → select-block → select-row → quantity**.
- **scan:** botón grande "Escanear Badge" (📷 → `QRScanner`) + input manual. Busca worker por `qr_badge_url`, valida que exista y esté activo. Si el usuario es crew_lead/supervisor, valida que el trabajador esté en su **day roster** de hoy (si no, bloquea con "Fuera de tu equipo de hoy"). Congela `day_roster_id`.
- **select-block:** lista de paños activos (nombre + producto). Al elegir, carga melgas activas; si el paño tiene melgas → select-row, si no → salta a quantity (el nivel melga aparece solo si el campo lo usa).
- **select-row:** lista de melgas con badge de número opcional.
- **quantity:** input numérico gigante (64px), Confirmar.
- **Submit:** resuelve tarifa vigente (online consulta `rates` current; offline usa cache; rechaza si ≤0), inserta `picking_records` con `rate_amount_snapshot`, `work_day`, `recorded_by`, `day_roster_id`. Éxito → `SuccessOverlay` fullscreen y resetea para el mismo paño. Offline: encola `picking_insert`.

### Dashboard (`app/(tabs)/metrics.tsx`) — admin/supervisor/crew_lead
- `DatePicker` (día). Auto-refetch 30s/60s solo en hoy.
- **KPIs 2×2:** Producción (unidades), Jornada ($), Trabajadores, Paños — tarjetas con gradiente e `AnimatedNumber` (count-up), tap → modal drilldown.
- **Alerta pendiente:** card ámbar "N liquidaciones pendientes / $ por pagar" → navega a Pagos.
- **Gráficos:** "Producción últimos 7 días" y "Producción por paño" (top 6) con `BarChart` SVG propio (react-native-svg).
- **Ranking:** Top-5 con medallas oro/plata/bronce y barra proporcional; tap → drilldown por trabajador.
- Pull-to-refresh, `MetricsSkeleton`, `EmptyState`.

### Pagos (`app/(tabs)/payments.tsx`) — todos (branch por rol)
- **Hero card** verde: saldo pendiente ("de cobro" worker vs "de pago" admin) + Liquidado + Pagado, calculado de `settlements` − `payments`.
- Lista de hasta 30 liquidaciones, expandibles al detalle de pagos; badge de estado (Pendiente/Parcial/Pagado). Beneficiario worker o "(cuadrilla)".
- **Admin:** botón "Pagar" por liquidación no pagada → modal (bottom sheet) prellenado con saldo, campos monto + notas; valida que el monto no supere el saldo, inserta `payments` (payee derivado de `payee_type`) y actualiza estado. Offline: encola `payment_insert`.
- **`PaymentToast`:** workers con pagos en las últimas 24h ven toast "¡Recibiste un pago!".

### Mi Cuadrilla (`app/(tabs)/crew.tsx`) — solo crew_lead
Vista financiera de dos niveles + roster. Arriba embebe `DayRosterManager`. **Nivel 1:** cards de solo lectura de la liquidación de la cuadrilla (`payee_type='crew'`, lo que el cliente paga al Encargado). **Nivel 2:** liquidaciones individuales de sus trabajadores — puede **generar** (modal con rango de fechas) y **pagar**. RLS acota todo a su cuadrilla.

### Mi Equipo (`app/(tabs)/team.tsx`) — solo supervisor
Embebe `DayRosterManager` con `crewId=null` (el supervisor arma un roster directo, sin cuadrilla base). Debajo, lista de referencia "Cuadrillas a mi cargo".

### Perfil (`app/(tabs)/profile.tsx`) — todos
Card de avatar (inicial), nombre, pill de rol (color + etiqueta de `useOrgSettings`). Chips de período (Hoy/Semana/Mes) → stats según rol. Card de info (Estado, RUT, Teléfono, "Desde"). **Admin** ve botón "Administración" → `/admin`. **Worker** con badge ve "Mi Badge QR" (modal con QR). Logout con confirmación.

### Sección Admin (`app/admin/*`) — solo admin (Stack sobre los tabs)
- **AdminHome:** menú de módulos (Trabajadores, Campos y Paños, Productos y Tarifas, Cuadrillas [si `crewModeEnabled`], Supervisores; Configuración marcada "Próximamente").
- **Workers:** buscador + lista + FAB (+). Form (bottom sheet, validación Zod `createWorkerSchema`): nombre, RUT, teléfono, rol (chips). En create genera `qr_badge_url = Crypto.randomUUID()`. Modal de badge imprimible (`react-native-qrcode-svg`).
- **Fields (index + [id]):** lista de campos → detalle con paños; override "Modo Capataz" por campo. En detalle: gestión de paños + melgas (modo melga efectivo = override del campo o default org).
- **Products:** lista + tarifa vigente; `RateManagerModal` (nueva tarifa mueve la vigente a histórica + inserta nueva current; historial).
- **Crews:** guardado por `crewModeEnabled`. Form con Encargado + Supervisor; modal de miembros (flip `workers.crew_id`).
- **Supervisors:** modal con tabs Trabajadores / Paños; asigna/quita `supervisor_assignments`.

### Componentes/patrones compartidos (móvil)
`QRScanner` (expo-camera, ventana de escaneo con esquinas verdes), `SuccessOverlay` (círculo + check spring), `PaymentToast`, `OfflineBanner` (ámbar offline / azul sincronizando), `Skeleton` (varias variantes shimmer), `EmptyState`, `AnimatedCard`, `AnimatedNumber`, `AnimatedSplash`, `DatePicker`, `DayRosterManager` (constructor "equipo de hoy" usado por crew y team), y `form/FormControls` (`Field`, `TextField`, `SelectField` con chips, `SubmitButton`, `RowItem`).

**Through-line móvil:** paleta verde, modales tipo bottom-sheet (`slide`, overlay translúcido, esquinas superiores redondeadas) para crear/editar/detalle, FAB (+) para crear en listas admin, Ionicons, `expo-haptics` en casi toda mutación, TanStack Query con pull-to-refresh + polling en vistas "hoy", y patrón de carga skeleton→empty→content.

---

## 5. App Web (Next.js) — funcionalidades por página

Tres grupos de rutas: `(dashboard)` (operacional, org-scoped), `(platform)` (super-admin), y `login`. Todas las páginas son client components que hablan con Supabase directo + TanStack Query; escrituras sensibles vía Edge Functions.

### Gating de acceso (`(dashboard)/layout.tsx`, server-side)
- Sin worker ni platform_admin → `/login`.
- platform_admin sin fila en workers → `/platform`.
- `crew_lead` → solo puede estar en `/crew` (cualquier otra ruta lo redirige a `/crew`).
- Cualquier rol distinto de `admin`/`crew_lead` → `/login`. (RLS es la barrera real.)

### Sidebar (`components/ui/Sidebar.tsx`)
Logo/nombre de marca dinámico. Menú según rol: `crew_lead` solo "Mi Cuadrilla"; `admin` ve Dashboard, Campos, Productos, Trabajadores, Cuadrillas (solo con Modo Capataz), Registros, Liquidaciones, Pagos, Supervisores, Configuración. Footer con usuario + "Cerrar sesión". Responsive (hamburguesa en móvil).

### Páginas del dashboard
1. **Login (`login/page.tsx`)** — card centrada sobre `aura-bg` con dos orbes Framer Motion; logo gradiente `primary→glow` (ícono Leaf); `glass-card` con inputs; error animado.
2. **Dashboard (`dashboard/page.tsx`)** — la página visualmente más rica. `DatePicker`, indicador "En vivo" pulsante, 4 `KpiCard` gradiente con `AnimatedCounter` (clic → drilldown), gráficos Recharts (AreaChart 7 días + BarChart por paño, ambos clicables), ranking top-10 con medallas y barras animadas, modal drilldown con tabla de registros. Polling 30/60s en hoy. Todo filtra `original_record_id IS NULL`.
3. **Campos (`fields/page.tsx`)** — CRUD de campos, `DataTable` + form Zod, soft delete vía `ConfirmDialog`. Overrides tri-estado (heredar/on/off) para Modo Capataz y Melgas.
4. **Detalle de campo (`fields/[id]/page.tsx`)** — header + CRUD de paños; gestión de melgas inline (`RowsManager`) si melgas efectivas.
5. **Paño/melga (`fields/[id]/blocks/[blockId]/page.tsx`)** — CRUD de melgas (`field_rows`), breadcrumb de 3 niveles.
6. **Productos (`products/page.tsx`)** — CRUD + `RateManager` (versionado current/historical), chips "Usado en" con conteo de paños.
7. **Trabajadores (`workers/page.tsx`)** — CRUD; genera `qr_badge_url` con `crypto.randomUUID()`; `QRBadge` (canvas, descarga PNG + imprimir).
8. **Cuadrillas (`crews/page.tsx`)** — feature-flag `crewModeEnabled`; CRUD + gestión de miembros; terminología configurable (`roleLabel`).
9. **Mi Cuadrilla (`crew/page.tsx`)** — vista del crew_lead: liquidación nivel 1 (cliente→lead) + generar/pagar liquidaciones nivel 2 (lead→trabajadores) vía Edge Functions.
10. **Registros (`records/page.tsx`)** — historial con filtros (fechas/worker/paño), tiles resumen, `DataTable` (pageSize 25), corrección de mismo día (snapshot de auditoría), badge Original/Corrección.
11. **Liquidaciones (`settlements/page.tsx`)** — generar (Edge Function `settlements/generate`) + export PDF (`generateSettlementPDF`).
12. **Pagos (`payments/page.tsx`)** — registrar/ver pagos; barra de progreso pagado/total; validación saldo ≤ remaining.
13. **Supervisores (`supervisors/page.tsx`)** — asignación de trabajadores y paños con modal de tabs.
14. **Configuración (`settings/page.tsx`)** — solo admin. Tarjetas: **Marca** (nombre, logo URL, 8 paletas preset + color pickers con validación hex), **Modo Capataz** (toggle), **Melgas** (toggle), **Etiquetas de rol**. `notifyBrandingUpdated()` re-aplica colores/logo en vivo.

### Consola de Plataforma (`(platform)`) — super-admin
- **Organizaciones (`platform/page.tsx`)** — vía Edge Function `organizations` (service-role); crear cliente (slug auto), editar suscripción.
- **Vista de org (`platform/[orgId]/page.tsx`)** — solo lectura, **auditada**; contadores de operación + distribución de roles.
- **Auditoría (`platform/audit/page.tsx`)** — log de acciones de plataforma (view_org / change_subscription / impersonate / update_field).

### Sistema de componentes (web) — `components/ui/`
`DataTable` (búsqueda cliente + sort + paginación + skeleton + empty), `Modal` (AnimatePresence, tamaños sm/md/lg, Esc-to-close), `ConfirmDialog` (variantes danger/default), `PageHeader` (slide-down + slot de acción), `ActionButton`, `FormField` (+ patrón repetido `inputClass` + Zod vía `useFormValidation`), `StatusBadge` (pill ring con color+etiqueta ES), `QRBadge`, `DatePicker`, `animations` (`FadeIn`, `Stagger*`, `AnimatedCounter`, `PageTransition`, `Shimmer`), `skeletons`, `Toast`. `SettlementPDF` (jsPDF branded). `PlatformNav` (sidebar de plataforma, distinto del `Sidebar` de org).

**Semántica de color de estado (web):** emerald=active/paid, amber=pending/trial, orange=partial, blue=current, gray=inactive/historical, red=cancelled/danger.

---

## 6. Reglas de negocio embebidas en la UI (relevantes para el rediseño)

- **Cantidad de picking > 0:** el registro y las correcciones rechazan cantidades ≤ 0.
- **Tarifa > 0 y congelada (`rate_amount_snapshot`):** el registro exige tarifa vigente > 0 y guarda la tarifa del momento; cambiarla luego no altera registros pasados.
- **Liquidación inmutable al pagar:** una liquidación pagada no se modifica; los pagos no pueden superar el saldo pendiente.
- **Corrección auditable:** solo el día actual; nunca sobreescribe — inserta snapshot con valores viejos + `original_record_id`. FK `ON DELETE RESTRICT` impide quitar del roster a quien ya registró producción.
- **Roster diario:** el equipo parte vacío cada jornada; un trabajador tiene un solo lead por día (unique constraint). Congela atribución con `day_roster_id`.
- **RBAC:** roles gateados en UI (tabs/rutas) y aplicados de verdad por RLS en Postgres.
- **Liquidación de dos niveles (Modo Capataz):** nivel 1 cliente→Encargado (`payee_type='crew'`), nivel 2 Encargado→trabajadores (`payee_type='worker'`).
- **Feature flags por org y override por campo:** `crew_mode_enabled` y `rows_enabled` (melgas). El nivel melga solo aparece cuando el campo realmente lo usa.
- **Branding en runtime:** colores/logo por tenant, aplicados sin recargar.
- **Offline-first (móvil):** cache persistida + cola de mutaciones (`picking_insert`, `picking_correction`, `payment_insert`) reproducida al reconectar, con banner de estado.

---

## 7. Inconsistencias y observaciones (insumos para el rediseño)

1. **Dos sistemas de tematización distintos:** móvil = objeto `colors` mutable + Ionicons + emojis; web = CSS variables HSL + lucide + orbes/glass. Unificar tokens y vocabulario visual.
2. **Verde del gradiente hardcodeado** en login/producción móvil (no deriva del token de marca), rompe el branding dinámico en esas superficies.
3. **Formularios sin primitiva única:** patrón repetido `FormField` + `inputClass` + Zod (web) y `FormControls` (móvil). Oportunidad de consolidar un `Input`/`Form` unificado.
4. **`FloatingTabBar` no usado** en móvil (diseño alternativo latente).
5. **Íconos mixtos** entre emojis (🌿, 📷, 👷) y sets de íconos — decidir un único lenguaje icónico.
6. **Consultas con joins manuales / N+1** en varias pantallas (nombres de worker/paño resueltos con `in()` separados) — no es diseño visual pero afecta latencia percibida y estados de carga.
7. **Configuración móvil incompleta:** el módulo "Configuración" en AdminHome está "Próximamente" (solo existe en web).
8. **Consistencia de estados de carga:** skeleton→empty→content está bien establecido, pero las variantes de skeleton difieren entre apps.

---

## 8. Inventario rápido (mapa de archivos)

**Móvil (`apps/mobile/`):** `app/_layout.tsx`, `app/login.tsx`, `app/(tabs)/{_layout,production,register,metrics,payments,crew,team,profile}.tsx`, `app/admin/{index,workers,products,supervisors,crews,fields/index,fields/[id]}.tsx`, `src/components/*`, `src/constants/theme.ts`, `src/hooks/{useAuth,useBranding,useConnectivity,useOfflineSync,useOrgSettings}.ts`, `src/lib/{supabase,offline-queue}.ts`.

**Web (`apps/web/`):** `src/app/login/page.tsx`, `src/app/(dashboard)/{dashboard,fields,products,workers,crews,crew,records,settlements,payments,supervisors,settings}/…`, `src/app/(platform)/platform/{page,[orgId],audit}`, `src/components/ui/*`, `src/components/settlement/SettlementPDF.tsx`, `src/components/platform/PlatformNav.tsx`, `globals.css`, `tailwind.config.ts`.

**Compartido:** `packages/shared/src/{types,constants,validation}/index.ts`.
