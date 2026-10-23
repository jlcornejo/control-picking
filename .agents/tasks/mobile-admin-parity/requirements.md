# Requisitos — Paridad total del rol Administrador en la app móvil (Fundo360)

> Artefacto de **requisitos**. No contiene diseño ni implementación.
> Base de verdad del gap: `.agents/tasks/app-web-parity/findings.md`.
> Worktree de trabajo: `.worktrees/mobile-admin-parity` (app en `apps/mobile`).
> Alcance: dar al **Administrador** en la móvil las capacidades que hoy solo tiene en la web
> (G1–G5), e introducir **navegación híbrida** (tabs + drawer/menú hamburguesa).

---

## 1. Resumen

Hoy el Administrador en la móvil (Expo Router) tiene 5 pestañas operativas y un panel
"Administración" (en Perfil → Administración) con 7 módulos de **datos maestros**. Frente a la
web (Next.js, admin-only) le faltan cinco capacidades y le sobra fricción de navegación:

- **G1** Generar liquidaciones por rango (hoy la móvil solo paga, no genera a nivel admin).
- **G2** Vista de **Registros** histórica con filtros, corrección auditada y export CSV.
- **G3** **Guías de despacho** (crear/cerrar/recepción/merma) — no existe nada en móvil.
- **G4** **Configuración** real de la organización (reemplazar el stub "Próximamente").
- **G5** **Export de informes** (CSV en Registros, PDF en Liquidaciones) con share/print nativo.

Además se introduce **navegación híbrida**: se conservan los **tabs** para la operación de
terreno y se añade un **drawer / menú hamburguesa** (Expo Router Drawer) para TODA la gestión
del admin, agrupada en (a) Datos maestros (módulos admin existentes) y (b) Administración /
transaccional (Configuración, Liquidaciones con generación, Registros, Guías de despacho).

Todos los endpoints de backend **ya existen** (`settlements`, `picking-records`, `metrics`,
`dispatch-guides`, y acceso directo a `organizations`). El trabajo es de cliente móvil: UI,
navegación, reuso de patrones y de la lógica compartida (`@fundo360/shared`), más instalar
`expo-print` / `expo-sharing` para G5.

### Supuestos (asunciones explícitas; validables en diseño)

- **S1.** El Administrador objetivo de esta paridad es el rol de tenant `admin`. Supervisor y
  encargado conservan sus flujos (`team.tsx`, `crew.tsx`) **sin cambios**; el drawer de gestión
  es visible **solo** para `role === 'admin'`, igual que el actual panel `admin/index.tsx`.
- **S2.** La generación de liquidaciones del admin (G1) debe delegar en la Edge Function
  `settlements/generate` (clasifica por modo capataz del campo y fija `payee_type`), **no**
  replicar el insert cliente de `crew.tsx` (ese es nivel 2 del encargado). Así se evita
  desincronizar la lógica de negocio. Justificación: la web ya lo hace así.
- **S3.** G3 (guías de despacho) es el esfuerzo mayor. Si no cabe en el ciclo, se entrega
  **diseñada** y con su **entrada en el drawer tras el flag `dispatch_guides`** (puede quedar
  como pantalla "en construcción" bajo flag), pero el resto (G1, G2, G4, G5, navegación) sí se
  implementa. Esta decisión se toma en diseño/implementación, no en requisitos.
- **S4.** No existe una capability `dispatch.manage` en `CAPABILITIES`; las guías se gatean por
  el **flag** `dispatch_guides` (igual que la web). Registros/Liquidaciones usan las
  capabilities `SETTLEMENTS_MANAGE`, `PAYMENTS_MANAGE`, `REPORTS_EXPORT`, `SETTINGS_MANAGE`
  ya presentes en el catálogo compartido.
- **S5.** La paginación obligatoria (default 20, máx 100) aplica a los **listados nuevos**
  (Registros, Guías, y la lista de liquidaciones si se re-trabaja). No se obliga a repaginar
  listados existentes fuera de alcance.

---

## 2. Decisiones de ambigüedad (resueltas y justificadas)

### D1 — Qué va en tabs vs. drawer para el admin

**Decisión:** se conservan **exactamente los tabs actuales** para la operación de terreno
(Dashboard/Panel, Campo/Producción, botón central QR, **Pagos**, Perfil). El drawer agrega la
**gestión**. En particular, **Pagos permanece como tab** y la **generación** de liquidaciones
(G1) vive en el **drawer** bajo "Liquidaciones".

**Justificación:** registrar pagos es una tarea frecuente y de terreno (mismo nivel que
registrar producción), por eso merece acceso de un toque en el tab bar; en cambio **generar**
liquidaciones es una tarea periódica de gestión (cierre de período), que encaja en el drawer
junto a Registros, Configuración y Guías. Separar "pagar" (operación, tab) de "generar"
(gestión, drawer) evita saturar el tab bar (ya tiene 6 ítems incl. el botón central) y mantiene
el modelo mental "tabs = hago hoy / drawer = administro". Para no fragmentar la experiencia, la
pantalla de Liquidaciones del drawer enlaza a Pagos y viceversa (navegación cruzada).

**Mapa resultante:**

| Superficie | Ítems |
|------------|-------|
| **Tabs** (terreno) | Panel · Campo (Producción) · **QR** (central) · Pagos · Perfil |
| **Drawer › Datos maestros** | Trabajadores · Campos y Paños · Productos y Tarifas · Tipos de Caja* · Cuadrillas* · Supervisores · Perfiles de Permisos* |
| **Drawer › Administración** | Configuración (G4) · Liquidaciones + Generar (G1) · Registros (G2) · Guías de despacho (G3)* |

(\* sujetos a su flag/capability: `box_tare_control`, `crew_mode_enabled`, `configurable_rbac`,
`dispatch_guides`.)

### D2 — Cómo integrar Drawer + Tabs en Expo Router sin romper el grupo `(tabs)` ni otros roles

**Decisión:** **no** envolver los tabs globales en un Drawer de app. En su lugar, el drawer de
gestión se monta como una **sección propia del admin** (el actual grupo `app/admin/` migra de
`Stack` a `Drawer`), y se accede desde un **icono hamburguesa en el header** de los tabs
(botón visible solo para `role === 'admin'`) que navega a esa sección. Las pantallas admin
existentes se **reusan** como rutas dentro del Drawer; no se duplican.

**Justificación:** envolver todo `(tabs)` en un Drawer afectaría a worker/supervisor/encargado
(que no deben ver gestión) y arriesga el layout del tab bar flotante actual. Montar el Drawer
**solo en la sección admin** mantiene intactos los tabs y los otros roles, respeta el guard de
rol ya existente, y convierte la navegación de admin de "lista de tarjetas enterrada en Perfil"
a un drawer deslizable con descubribilidad directa desde el header. El punto de entrada actual
(Perfil → Administración) se conserva como camino alternativo.

**Nota de implementación (para diseño):** el patrón concreto (dependencia de drawer de Expo
Router, agrupamiento de rutas, header con hamburguesa) se define en diseño; a nivel de requisito
basta: tabs intactos + drawer solo-admin accesible por hamburguesa.

### D3 — Alcance de G3 en este ciclo

**Decisión:** G3 queda **completamente diseñada** y con **entrada en el drawer tras el flag
`dispatch_guides`**. Su implementación puede diferirse a una iteración posterior si el ciclo no
alcanza, sin bloquear G1/G2/G4/G5 ni la navegación. Ver S3.

---

## 3. Historias de usuario y criterios de aceptación

> Convención: criterios **numerados y testeables**. "AC" = Acceptance Criterion.
> Roles: solo `admin` salvo que se indique. Invariantes de dominio aplican siempre.

### NAV — Navegación híbrida (tabs + drawer)

> Como **administrador**, quiero un menú hamburguesa que agrupe toda la gestión, para no tener
> que entrar por Perfil y no saturar la barra inferior.

- **NAV-AC1.** Con `role === 'admin'`, el header de las pantallas de tabs muestra un **icono
  hamburguesa** que abre el drawer de gestión. Con cualquier otro rol, el icono **no** se
  renderiza.
- **NAV-AC2.** El drawer presenta dos grupos con encabezado: **"Datos maestros"** y
  **"Administración"**, con los ítems del mapa de D1.
- **NAV-AC3.** Cada ítem del drawer respeta su gating: se **oculta** si falta la capability
  (`usePermissions().has`) o el flag (`useFeatureFlag`) correspondiente, replicando la lógica de
  `admin/index.tsx` (ej.: Cuadrillas requiere `crew_mode_enabled`; Tipos de Caja requiere
  `box_tare_control`; Perfiles de Permisos requiere `configurable_rbac`; Guías requiere
  `dispatch_guides`).
- **NAV-AC4.** Las pantallas admin existentes (workers, fields, products, crews, supervisors,
  box-types, permission-profiles) se **reutilizan** sin duplicar su código; siguen accesibles.
- **NAV-AC5.** Los **tabs** de terreno quedan **sin cambios funcionales**: Panel, Campo, QR,
  Pagos, Perfil siguen operando igual para admin, y worker/supervisor/encargado **no** ven el
  drawer ni cambios en su navegación (team.tsx y crew.tsx intactos).
- **NAV-AC6.** El acceso actual Perfil → "Administración" sigue funcionando (no se elimina el
  camino existente).
- **NAV-AC7.** Un rol que intente acceder por URL/deep-link a una ruta de gestión sin ser admin
  recibe el `EmptyState` de "Acceso restringido" (mismo guard que hoy).

### G1 — Generar liquidaciones (admin)

> Como **administrador**, quiero generar las liquidaciones de un período por rango de fechas,
> para no depender de la web en el cierre.

- **G1-AC1.** Desde el drawer, "Liquidaciones" muestra la lista de todas las liquidaciones
  (reusando el patrón de lectura de `payments.tsx`) y un botón **"Generar liquidaciones"**.
- **G1-AC2.** El botón abre un formulario con **Desde** y **Hasta** (AAAA-MM-DD) y los valida:
  ambos requeridos, `Desde <= Hasta`, formato correcto; en error muestra mensaje en español y
  no invoca el backend.
- **G1-AC3.** La generación invoca la **Edge Function `settlements/generate`** (POST con
  `period_start`/`period_end`), **no** inserta en `settlements` desde el cliente. Justificación:
  es la lógica que clasifica por modo capataz y fija `payee_type` (worker/crew), idéntica a la
  web (S2).
- **G1-AC4.** Tras una generación exitosa muestra "N liquidación(es) generada(s)" (o "No se
  encontró producción para el período" cuando N=0) e invalida las queries de liquidaciones para
  refrescar la lista.
- **G1-AC5.** Errores del backend (red, validación, permisos) se muestran como alerta en español
  sin romper la pantalla; no se crean liquidaciones parciales desde el cliente.
- **G1-AC6.** La capacidad de generar se gatea por `CAPABILITIES.SETTLEMENTS_MANAGE`: si el
  perfil del admin la restringe, el botón "Generar" no aparece.
- **G1-AC7.** El flujo de **pago** existente (`payments.tsx`, nivel admin) permanece **intacto**;
  G1 solo **agrega** la generación, no modifica la lógica de pago/estado. Se preserva el
  invariante: liquidación `paid` ⇒ pagos = total; `partial` ⇒ pago(s) < total; no se modifica
  una liquidación pagada.
- **G1-AC8.** No se altera `crew.tsx` (generación nivel 2 del encargado) ni su invariante.

### G2 — Vista de Registros (histórico, corrección auditada, export)

> Como **administrador**, quiero ver el histórico de picking con filtros y corregir con
> auditoría, para controlar la producción más allá del día actual.

- **G2-AC1.** El drawer abre una pantalla **"Registros"** que lista `picking_records` paginado
  (default 20, máx 100) ordenado por `recorded_at` desc, con nombre de trabajador y paño
  resueltos (joins manuales como en `payments.tsx`).
- **G2-AC2.** Filtros disponibles: **rango de fechas** (Desde/Hasta, default últimos 7 días),
  **trabajador** y **paño** (block); cambiar un filtro reinicia la paginación y refresca el
  listado.
- **G2-AC3.** El listado excluye las filas de corrección (`original_record_id` no nulo) del
  conteo "original" y las **marca visualmente** como "Corrección" cuando se muestren, igual que
  la web.
- **G2-AC4.** Un registro **solo** puede corregirse si `work_day === hoy` (regla de dominio
  "solo el día actual"); para días anteriores la acción de corregir **no** se ofrece.
- **G2-AC5.** La corrección es un **soft-update auditado**: inserta una fila snapshot con los
  valores viejos y `original_record_id` apuntando al registro, y actualiza in-place el original
  (`quantity` para caja; `paid_quantity_kg` a 3 decimales para kg). `rate_amount_snapshot` y
  `payment_unit` **nunca** cambian. (Mismo contrato que `production.tsx` y la web.)
- **G2-AC6.** La nueva cantidad/kilos debe ser `> 0`; en caso contrario muestra error en español
  y no persiste (invariante: picking `quantity > 0`).
- **G2-AC7.** Resumen agregado del período (registros, total cajas, total kilos si aplica, total
  $) coherente con la segmentación por unidad (nunca mezcla cajas y kilos), reusando
  `pickingPayableBase`/`pickingSubtotal` de `@fundo360/shared`.
- **G2-AC8.** La corrección respeta conectividad: online hace el soft-update directo; offline lo
  **encola** (tipo `picking_correction`) igual que `production.tsx`, re-verificando al
  reconectar. (Si se decide no soportar offline aquí, debe documentarse en diseño.)
- **G2-AC9.** La capacidad de corregir se mantiene para roles de terreno de la misma forma que
  hoy; la **vista** de histórico es del admin (gating por rol).

### G3 — Guías de despacho (esfuerzo alto; diseñada, implementable tras flag)

> Como **administrador**, quiero crear guías de despacho, registrar la recepción del cliente y
> ver la merma, para controlar la logística campo→cliente desde la móvil.

- **G3-AC1.** La entrada "Guías de despacho" aparece en el drawer **solo** si el flag
  `dispatch_guides` está activo; si no, no se muestra (paridad con la web).
- **G3-AC2.** La pantalla lista guías **paginadas** (default 20, máx 100) invocando la Edge
  Function `dispatch-guides` (GET con `page`/`limit` y filtros `scope`, `field_id`, `block_id`,
  `status`, `work_day`), mostrando por guía: número, nivel (paño/campo), campo/paño, jornada,
  estado (abierta/cerrada), bandejas, peso y si el peso es preciso o aproximado.
- **G3-AC3.** Crear guía: scope **block** (requiere paño) o **field** (requiere campo), jornada,
  número de guía (requerido, máx 60), transportista opcional (máx 150). Un botón **"Calcular
  desde cosecha"** invoca `dispatch-guides/suggestion` (GET) y prellena bandejas/peso; el peso
  editado a mano queda marcado como aproximado. Crear invoca `dispatch-guides` (POST).
- **G3-AC4.** Detalle de guía (`dispatch-guides/:id` GET) muestra tres bloques: **Despacho**
  (editable solo si `status === 'open'`), **Recepción del cliente** y **Comparación**
  despachado vs. recibido (merma: `trays_diff`, `weight_diff_kg`, `weight_shrinkage_pct`), usando
  `aggregateDispatchWeight`/`compareDispatch` de `@fundo360/shared` cuando aplique en cliente.
- **G3-AC5.** Acciones de detalle mapeadas a la Edge Function: **guardar** cambios de despacho
  (PUT `:id`), **cerrar** (POST `:id/close`, idempotente), **reabrir** (POST `:id/reopen`),
  **recepción** crear (POST `:id/receipt`) o corregir (PUT `:id/receipt`).
- **G3-AC6.** Validaciones de recepción: `received_trays >= 0`, `received_weight_kg >= 0`,
  `received_at` opcional con formato AAAA-MM-DD; en error muestra el mensaje del backend en
  español.
- **G3-AC7.** Invariante de inmutabilidad: una guía **cerrada** no permite editar su despacho
  (campos deshabilitados); la recepción sí puede corregirse estando cerrada. El error del
  trigger de inmutabilidad se traduce a un mensaje claro.
- **G3-AC8.** Si G3 se difiere (S3), la entrada del drawer existe tras el flag y abre una
  pantalla provisional que indica que la función está en preparación; esto **no** rompe build ni
  navegación.

### G4 — Configuración de la organización (reemplazar el stub)

> Como **administrador**, quiero configurar marca, modo capataz, melgas y etiquetas de rol desde
> la móvil, en vez del placeholder "Próximamente".

- **G4-AC1.** El módulo "Configuración" deja de estar `available:false`; abre una pantalla real
  con **cuatro secciones**: **Marca**, **Modo Capataz**, **Melgas**, **Etiquetas de rol**
  (paridad con `settings/page.tsx`).
- **G4-AC2.** Lee y escribe directamente sobre la tabla `organizations` vía Supabase (sin nueva
  Edge Function); RLS acota a la organización del usuario.
- **G4-AC3. Marca:** editar nombre (requerido), URL de logo (opcional), color primario y
  secundario con **validación hex** `#RRGGBB` (u `#RRGGBBAA`); color inválido muestra error y no
  guarda. Al guardar, el branding se re-aplica (invalidar `branding`, notificar como en
  `useBranding`).
- **G4-AC4. Modo Capataz:** toggle `crew_mode_enabled`; al cambiar persiste de inmediato y
  refresca `useOrgSettings`/estado dependiente (ej. visibilidad de Cuadrillas en el drawer).
- **G4-AC5. Melgas:** toggle `rows_enabled`; persiste de inmediato.
- **G4-AC6. Etiquetas de rol:** editar `role_labels` para admin/supervisor/crew_lead/worker;
  las vacías caen al default; guarda solo las no vacías (mismo saneamiento que la web). Cambiar
  etiquetas **no** altera la seguridad ni la jerarquía de roles (RBAC intacto).
- **G4-AC7.** Gating por `CAPABILITIES.SETTINGS_MANAGE`; si el perfil lo restringe, la pantalla
  no es accesible desde el drawer.
- **G4-AC8.** Errores de guardado muestran alerta en español y no dejan la UI en estado
  inconsistente (el toggle revierte si la escritura falla).

### G5 — Export de informes (CSV / PDF nativo)

> Como **administrador**, quiero exportar Registros a CSV y Liquidaciones a PDF desde la móvil,
> para compartirlos o imprimirlos.

- **G5-AC1.** El export se ofrece **solo** si el flag `report_export` está activo (y, para PDF,
  **solo** si el kill-switch `disable_pdf_export` **no** está activo), replicando la lógica de
  la web (`showPdfExport = report_export && !disable_pdf_export`).
- **G5-AC2.** En **Registros** (G2): botón **"Exportar CSV"** que genera el CSV del período/
  filtros actuales con las mismas columnas que la web (Fecha, Trabajador, RUT, Paño, Producto,
  Variedad, Cantidad, Unidad, Peso neto, Tarifa, Monto estimado, Tipo) y lo comparte vía
  **`expo-sharing`** (archivo generado con `expo-file-system`).
- **G5-AC3.** En **Liquidaciones** (G1): acción **PDF** por liquidación que arma el documento
  (datos del beneficiario worker/crew, período, registros del período, pagos) e invoca
  **`expo-print`** (imprimir/compartir PDF). El contenido equivale al `SettlementPDF` de la web.
- **G5-AC4.** El export se gatea además por `CAPABILITIES.REPORTS_EXPORT`.
- **G5-AC5.** Si no hay datos que exportar (0 registros / 0 líneas), el botón se deshabilita o
  avisa en español, sin generar un archivo vacío.
- **G5-AC6.** Fallos de generación/compartición muestran alerta en español y no bloquean la
  pantalla; no se cuelgan recursos (archivos temporales se limpian según el patrón de Expo).
- **G5-AC7.** `expo-print` y `expo-sharing` se **añaden como dependencias** del paquete móvil si
  faltan (hoy no están). Al ser módulos nativos, requerirán recompilar el dev client (anotar en
  diseño/entrega).

---

## 4. Requisitos no funcionales

- **NFR1. TypeScript strict, sin `any`.** Usar `unknown` + type guards; tipar los contratos de
  las Edge Functions y los `select` de Supabase. (Las pantallas existentes usan `any` en varios
  puntos; el **código nuevo** no debe introducir `any`.)
- **NFR2. Convenciones.** Archivos `kebab-case`; componentes `PascalCase`; funciones
  `camelCase`; constantes `UPPER_SNAKE_CASE`. UI en **español**, código/comentarios en **inglés**.
- **NFR3. Reuso de theme y componentes.** Usar `src/constants/theme` (colors/radius/spacing/font)
  y componentes de `src/components` (EmptyState, Skeleton, DatePicker, PhotoCapture, etc.);
  evitar colores hardcodeados nuevos salvo que el archivo base ya lo haga.
- **NFR4. Paginación obligatoria** en listados nuevos (default 20, máx 100): Registros y Guías
  (y lista de liquidaciones si se re-trabaja).
- **NFR5. Lógica compartida.** Reusar `@fundo360/shared` (`pickingPayableBase`,
  `pickingSubtotal`, `aggregateDispatchWeight`, `compareDispatch`, `CAPABILITIES`,
  `resolveFeatureFlag`, `hasCapability`) en vez de reimplementar cálculos.
- **NFR6. Gating consistente.** Rol (`useAuth`), capabilities (`usePermissions`) y feature flags
  (`useFeatureFlag`) tal como en `admin/index.tsx`. El gating de UI nunca sustituye a RLS/backend.
- **NFR7. Resiliencia de red.** Respetar los patrones de conectividad existentes
  (`useConnectivity`, `offline-queue`) donde ya aplican (corrección de picking, pagos). No
  degradar los flujos offline actuales.
- **NFR8. No regresión.** No romper los flujos de supervisor (`team.tsx` / "Mi Equipo") ni de
  encargado (`crew.tsx` / "Mi Cuadrilla"), ni la navegación de worker.

### Invariantes de dominio (deben preservarse)

- Picking `quantity > 0`; tarifas (`rate`) `> 0`.
- Liquidación `paid` ⇒ pagos = total; `partial` ⇒ pago(s) < total; **no** modificar liquidaciones
  pagadas.
- Corrección de picking (`picking_records`): solo **día actual**, soft-update con
  `original_record_id`, sin tocar `rate_amount_snapshot` ni `payment_unit`.
- Guía de despacho **cerrada**: despacho inmutable; recepción corregible.
- RBAC jerárquico: `admin` > `supervisor` > `crew_lead` > `worker`.
- Entidades (nombres canónicos): `fields`, `blocks`, `products`, `rates`, `workers`,
  `picking_records`, `settlements`, `payments`, `organizations`.

---

## 5. Fuera de alcance

- **Paridad inversa** (llevar a la web los módulos solo-móvil: Tipos de Caja, Perfiles de
  Permisos). No se toca la web en esta tarea.
- **Consola de plataforma** (super-admin del SaaS): fuera del admin de tenant.
- Nuevas Edge Functions o cambios de backend/migraciones: todo el backend requerido **ya existe**.
- Rediseño del tab bar de terreno o de las pantallas de datos maestros existentes más allá de
  colgarlas del drawer (se **reutilizan**).
- Cambios a los flujos de supervisor, encargado y trabajador.
- Actualizar la **guía de pruebas** (`docs/pruebas/*.md`) para reflejar las nuevas capacidades:
  es trabajo derivado, no requisito de esta entrega (se puede abordar después, ver findings §6).
- Soporte **offline** para generación de liquidaciones (G1), guías de despacho (G3) y export
  (G5): online-only salvo que diseño decida lo contrario (la corrección de picking de G2 sí
  mantiene el patrón offline existente).
