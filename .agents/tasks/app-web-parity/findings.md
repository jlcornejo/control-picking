# GAP de capacidades ADMIN: Web (Next.js) vs. Móvil (Expo)

> Investigación **solo lectura**. Fundo360 monorepo. No se modificó código.
> Fecha: 2026-10-16 (contexto de datos de prueba).

## Respuesta resumida

El rol **Administrador** tiene en la **web** un panel de gestión completo de 11 secciones
(sidebar en `apps/web/src/components/ui/Sidebar.tsx`), mientras que en la **móvil** el admin
tiene 5 pestañas operativas + un panel "Administración" de datos maestros con 7 módulos
funcionales (`apps/mobile/app/admin/index.tsx`).

Los **gaps reales de la móvil frente a la web** son, en orden de impacto:

| # | Sección web | ¿Existe en móvil? | Edge Function | Esfuerzo portar |
|---|-------------|-------------------|---------------|-----------------|
| G1 | **Liquidaciones** — *generar* liquidaciones por rango (`/settlements`) | ❌ (la móvil solo **paga**, no genera, para admin) | ✅ `settlements` | Medio |
| G2 | **Registros** — listar + **corregir** histórico, filtros, export CSV (`/records`) | ⚠️ Parcial: móvil corrige solo el **día actual** desde Producción; sin vista de histórico/filtros/export | ✅ `picking-records` + `metrics` | Medio |
| G3 | **Guías de despacho** (`/dispatch-guides`, flag `dispatch_guides`) | ❌ No existe en móvil | ✅ `dispatch-guides` | Alto |
| G4 | **Configuración** (marca, modo capataz, melgas, etiquetas de rol) (`/settings`) | ❌ Stub "Próximamente" (`available:false`) | ✅ tabla `organizations` (acceso directo) | Medio |
| G5 | **Exportar informes** (CSV/PDF en Registros y Liquidaciones, flag `report_export`) | ❌ No existe en móvil | n/a (cliente) | Medio |

**Gap inverso (capacidades solo en móvil, NO en web):** la móvil administra **Tipos de Caja**
(`/admin/box-types`) y **Perfiles de Permisos / RBAC** (`/admin/permission-profiles`); la web
**no** tiene esas pantallas (confirmado: cero referencias a `box_type`/`permission_profile`/
`tolerance`/`configurable_rbac` en `apps/web/src`).

Sobre la **guía de pruebas**: contrario a lo que podría parecer, `docs/pruebas/*.md` describe
bastante fielmente a la app **móvil tal como está hoy** (ver sección 6 para los pocos
desajustes finos). El desajuste que percibe el usuario es más bien que **la móvil no tiene la
paridad funcional de la web**, no que la guía mienta sobre la móvil.

---

## 1. Inventario del admin en la WEB (`apps/web/src/app/`)

Fuente de navegación: `apps/web/src/components/ui/Sidebar.tsx`. Gating de acceso:
`apps/web/src/app/(dashboard)/layout.tsx` — **el dashboard web es admin-only** (crew_lead solo
`/crew`; supervisor/worker **no** acceden al web, usan la móvil).

| Ruta (`(dashboard)/…`) | Gestiona | Notas |
|------------------------|----------|-------|
| `/dashboard` | Métricas de operación | KPIs y gráficos (Recharts). |
| `/fields` + `/fields/[id]` + `/fields/[id]/blocks/[blockId]` | Campos, paños (blocks) y melgas (rows) | Estructura productiva; override de modo capataz/melgas por campo. |
| `/products` | Productos, **variedades** y **tarifas** | Rates y varieties se gestionan **inline** aquí (`products/page.tsx`). |
| `/workers` | Trabajadores y badges QR | CRUD de personal. |
| `/crews` | Cuadrillas y encargados | Visible solo con `crew_mode_enabled`. Etiqueta usa `role_labels`. |
| `/records` | **Histórico de registros de picking** | Filtros por fecha/trabajador/paño, **corrección** (soft-update con auditoría), **export CSV** (flag `report_export`). |
| `/dispatch-guides` + `/dispatch-guides/[id]` | **Guías de despacho** (logística campo→cliente) | Visible solo con flag `dispatch_guides`. Scope block/field, recepción, merma. |
| `/settlements` | **Liquidaciones** | **Genera** liquidaciones + **export PDF** (flags `report_export`, `disable_pdf_export`). |
| `/payments` | Pagos contra liquidaciones | Evidencia fotográfica con flag `payment_photo_evidence`. |
| `/supervisors` | Asignaciones supervisor↔trabajador/paño | — |
| `/settings` | **Configuración de la organización** | 4 tarjetas: Marca (logo/colores), Modo Capataz, Melgas, **Etiquetas de rol**. Solo rol `admin`. |

**Consola de plataforma** (NO es del admin de tenant; es el dueño/soporte del SaaS, sin fila en
`workers`): `(platform)/platform` (dashboard), `/platform/[orgId]`, `/platform/audit`,
`/platform/feature-flags`. Fuera del alcance de la paridad admin móvil.

Otras rutas web no-admin: `/login`, `/change-password`, `/crew` (vista del encargado).

---

## 2. Inventario del admin en la MÓVIL (`apps/mobile/app/`)

### Pestañas (`(tabs)/_layout.tsx`) — lo que ve el admin

El admin ve 5 pestañas (más Perfil). `isAdmin = role ∈ {admin, supervisor, crew_lead}`:

| Pestaña (archivo) | Título admin | Gestiona |
|-------------------|--------------|----------|
| `metrics.tsx` | "Panel" / header "Dashboard" | Métricas del día con drilldown (trabajadores, producción, paños). |
| `production.tsx` | "Campo" / "Producción" | Registros de **todo** el campo por día; **corrige** registros del **día actual**. |
| `register.tsx` | botón central QR | Registro de picking (badge QR, paño, melga, cantidad, foto, destare). |
| `payments.tsx` | "Pagos" / "Liquidaciones" | Lista **todas** las liquidaciones y **registra pagos**. **No genera** liquidaciones. |
| `profile.tsx` | "Perfil" | Datos, stats, escala de texto y **botón "Administración"** (solo `role==='admin'`). |

(`crew.tsx` = encargado; `team.tsx` = supervisor; no son del admin.)

### Panel "Administración" (`admin/index.tsx`) — entrada desde Perfil

Guard: solo `role === 'admin'`. Módulos declarados:

| Módulo (ruta) | Gestiona | Visibilidad |
|---------------|----------|-------------|
| Trabajadores (`admin/workers.tsx`) | Personal + badges | capability `workers.manage` |
| Campos y Paños (`admin/fields/index.tsx`, `fields/[id].tsx`) | Estructura productiva | `fields.manage` |
| Productos y Tarifas (`admin/products.tsx`) | Productos + variedades + rates | `products.manage` |
| Tipos de Caja (`admin/box-types.tsx`) | Destare/tolerancia | flag `box_tare_control` + `box_types.manage` |
| Cuadrillas (`admin/crews.tsx`) | Equipos y encargados | requiere `crew_mode_enabled` + `crews.manage` |
| Supervisores (`admin/supervisors.tsx`) | Asignaciones | `supervisors.manage` |
| Perfiles de Permisos (`admin/permission-profiles.tsx`) | RBAC configurable | flag `configurable_rbac` |
| **Configuración** | Marca, modo capataz, etiquetas | **`available:false` → "Próximamente" (stub)** |

Rutas presentes: `admin/{index,box-types,crews,fields/[id],fields/index,permission-profiles,products,supervisors,workers}.tsx` + `admin/_layout.tsx`. **No existe** `admin/settings`, `admin/records`, `admin/settlements`, `admin/dispatch-guides`.

---

## 3. GAP preciso (Web tiene → Móvil no, o stub)

### G1 — Generación de Liquidaciones · esfuerzo **Medio**
- **Web:** `/settlements` genera liquidaciones por rango (`settlements/page.tsx`, `showGenerate`) y exporta PDF.
- **Móvil:** `payments.tsx` solo **lee** liquidaciones y **registra pagos** (no hay insert en `settlements`; grep confirma `mutationFn` de pago, no de generación). El encargado **sí** genera para su cuadrilla (`crew.tsx`), pero el **admin móvil no** tiene generación global.
- **Endpoint:** ✅ Edge Function `supabase/functions/settlements/`.

### G2 — Vista de Registros / corrección histórica · esfuerzo **Medio**
- **Web:** `/records` lista con filtros (fecha/trabajador/paño), corrige con auditoría (`original_record_id`) y exporta CSV.
- **Móvil:** solo corrige el **día actual** desde `production.tsx`; sin vista dedicada de histórico, filtros ni export (regla "solo día de hoy" presente en `records/page.tsx` y en la móvil).
- **Endpoint:** ✅ `picking-records/` (+ `metrics/` para agregados).

### G3 — Guías de despacho · esfuerzo **Alto**
- **Web:** `/dispatch-guides` (+ detalle `[id]`) tras flag `dispatch_guides`: crear guía block/field, cerrar, recepción, comparación de merma. Lógica compartida en `packages/shared` (`aggregateDispatchWeight`, `compareDispatch`).
- **Móvil:** ❌ sin ninguna referencia a `dispatch` en `apps/mobile`.
- **Endpoint:** ✅ `dispatch-guides/`.

### G4 — Configuración de la organización · esfuerzo **Medio**
- **Web:** `/settings` con 4 tarjetas (Marca/colores/logo, Modo Capataz, Melgas, Etiquetas de rol) sobre tabla `organizations`.
- **Móvil:** módulo "Configuración" marcado **`available:false`** ("Próximamente").
- **Endpoint:** acceso directo a `organizations` vía Supabase (no requiere nueva Edge Function).

### G5 — Export de informes (CSV/PDF) · esfuerzo **Medio**
- **Web:** export CSV en Registros, export PDF en Liquidaciones (`SettlementPDF`), tras flag `report_export`.
- **Móvil:** ❌ no existe export.
- **Endpoint:** n/a (generación en cliente; en móvil requiere share/print nativo).

---

## 4. Capacidades en MÓVIL que NO están en WEB (gap inverso)

- **Tipos de Caja / destare** (`admin/box-types.tsx`, flag `box_tare_control`): sin equivalente web (0 referencias a `box_type`/`tolerance` en `apps/web/src`). La web solo *consume* productos; no configura envases.
- **Perfiles de Permisos (RBAC configurable)** (`admin/permission-profiles.tsx`, flag `configurable_rbac`): sin pantalla web (0 referencias a `permission_profile`/`configurable_rbac` en `apps/web/src`).
- **Accesibilidad: escala de texto** (`profile.tsx` `useFontScale`): propia de la móvil.
- **Registro de picking con cámara/QR y foto de respaldo**: la móvil es la superficie de registro en terreno; la web no registra picking.

> Endpoints de respaldo del gap inverso **sí** existen en backend: `supabase/functions/box-types/` y `supabase/functions/permission-profiles/`, por lo que portarlos a web sería factible si se quisiera paridad en ese sentido.

---

## 5. Navegación actual del admin en móvil (patrón y fricción)

**Patrón:** operación en las 5 pestañas; para datos maestros el admin va a **Perfil →
botón "Administración"** (`profile.tsx`, visible solo `role==='admin'`) que hace
`router.push('/admin')`, abriendo una **lista de tarjetas** (`admin/index.tsx`). Cada módulo
es un `router.push` a su pantalla.

**Fricciones observadas:**
- La administración está **enterrada dos niveles** (Perfil → Administración → módulo); no hay
  acceso directo desde la barra inferior.
- La barra inferior ya usa **6 ítems** (incluye el botón central QR); no queda espacio cómodo
  para más entradas de nivel superior sin saturar.
- El panel admin **mezcla** "datos maestros" (workers, fields, products…) con lo que debería
  ser "Configuración", y esta última es un **stub** → la paridad se siente incompleta.
- Las funciones de **gestión transaccional** que la web agrupa (Registros, Liquidaciones,
  Guías) no tienen hogar en el panel admin móvil; parte vive en pestañas (Pagos, Producción) y
  parte no existe.

---

## 6. Desajustes GUÍA de pruebas (`docs/pruebas/*.md`) vs. app móvil real

La guía está, en general, **alineada** con la móvil actual. Desajustes concretos encontrados:

- **`supervisor.md` S-02 (y encargado `encargado.md` E-02):** S-02 dice agregar un trabajador
  **"de su equipo"**; el componente `team.tsx` (comentario explícito) indica que el supervisor
  **no tiene cuadrilla base**, así que el buscador del roster **lista TODOS los trabajadores**,
  no solo "los suyos". En encargado (`crew.tsx`) sí es su cuadrilla. → La guía del supervisor
  puede inducir a buscar un subconjunto que no existe; el buscador muestra todos.
- **`vision-general.md` (tabla "Resumen de qué ve cada perfil") y `supervisor.md` S-01:**
  afirman que el admin/supervisor **aterriza en "Producción"**. En `_layout.tsx` la pestaña
  por defecto es la primera visible; conviene verificar en runtime que efectivamente abre
  Producción y no Dashboard/Panel (la pestaña `metrics` se titula "Panel" pero su header dice
  "Dashboard" — posible confusión de nombres entre guía ("Dashboard") y UI ("Panel")).
- **`admin.md` A-02 / A-05 / A-06:** describen que "Configuración" sale como "Próximamente"
  (coincide con el stub), que el admin corrige **registros del día** (coincide: solo día
  actual) y que **paga** liquidaciones (coincide). **Pero** la guía del admin **no menciona
  que el admin NO puede *generar* liquidaciones desde la móvil** (G1): un tester admin que
  busque "Generar" en Pagos no lo encontrará y lo reportará como falla, cuando es un gap de
  función, no un bug.
- **`admin.md` sección "Qué puede hacer":** lista "gestiona… tipos de caja y perfiles de
  permisos (según flags)". Es correcto en móvil, pero **estas dos cosas no existen en la web**
  (gap inverso) — si alguien contrasta guía móvil contra web, no cuadra.
- **Guía en general:** describe únicamente lo que la móvil **sí** hace hoy; las capacidades web
  ausentes (Guías de despacho, Registros con filtros/export, Configuración, generación de
  liquidaciones, export de informes) **no tienen casos de prueba** porque no existen en móvil.
  Ese es el origen de la sensación del usuario de que "faltan funcionalidades" respecto a lo
  que la plataforma (web) ofrece.

> Nota: no se observó un caso tipo "A-05" que afirme algo técnicamente falso sobre la móvil; el
> desajuste dominante es por **omisión/paridad** (web > móvil), no por descripciones erróneas.

---

## 7. Opciones de navegación (breve, sin decidir UI)

**Opción A — Drawer / menú hamburguesa para el admin.**
- Pros: cabe toda la gestión (web-parity) sin saturar la barra de 6 ítems; patrón familiar;
  permite separar "Operación" (tabs) de "Gestión" (drawer).
- Contras: añade un segundo paradigma de navegación sobre Expo Router tabs; hay que decidir qué
  queda en tabs vs. drawer; más trabajo de layout/estado.

**Opción B — Ampliar el panel "Administración" actual.**
- Pros: mínimo cambio estructural; se agregan tarjetas (Configuración real, Liquidaciones,
  Registros, Guías) a `admin/index.tsx`.
- Contras: sigue enterrado en Perfil → Administración; mezcla datos maestros con transacciones;
  no mejora el acceso rápido.

**Opción C — Híbrido:** tabs para operación diaria + drawer/hamburguesa que agrupe "Gestión"
(datos maestros) y "Administración" (Configuración, Liquidaciones, Registros, Guías), reusando
los módulos existentes. Equilibra descubribilidad y esfuerzo. (Recomendación tentativa, a
validar en la fase de diseño.)

---

## Evidencia (archivos citados)

- Nav web: `apps/web/src/components/ui/Sidebar.tsx`; gating `apps/web/src/app/(dashboard)/layout.tsx`.
- Páginas web: `apps/web/src/app/(dashboard)/{dashboard,fields,products,workers,crews,records,dispatch-guides,settlements,payments,supervisors,settings}/…`.
- Plataforma: `apps/web/src/app/(platform)/platform/…`.
- Tabs móvil: `apps/mobile/app/(tabs)/_layout.tsx` + `{metrics,production,register,payments,profile,crew,team}.tsx`.
- Admin móvil: `apps/mobile/app/admin/index.tsx` (+ módulos listados).
- Capabilities/tipos: `packages/shared/src/types/index.ts` (`CAPABILITIES`, `WorkerRole`, dispatch helpers).
- Backend: `supabase/functions/` (incluye `settlements`, `picking-records`, `dispatch-guides`, `box-types`, `permission-profiles`, `metrics`, …).
- Guía: `docs/pruebas/{vision-general,admin,supervisor,encargado,trabajador}.md`.

> Verificaciones negativas (grep en `apps/web/src`): sin coincidencias para
> `box_type` / `permission_profile` / `tolerance` / `configurable_rbac` → confirma el gap inverso.
> Verificación negativa (grep en `apps/mobile`): sin coincidencias para `dispatch` → confirma G3.
