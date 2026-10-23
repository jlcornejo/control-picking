# Verificación — mobile-admin-parity

Evidencia de verificación por feature. Comandos corridos desde
`.worktrees/mobile-admin-parity/apps/mobile` salvo que se indique otra ruta.

## FEAT-001 — Infra nativa drawer + Envelope edge

### Qué se hizo
- `npm install` en la raíz del worktree (no había `node_modules`). Resultado: OK (1145 paquetes).
- `npx expo install @react-navigation/drawer react-native-gesture-handler react-native-reanimated expo-print expo-sharing expo-file-system` → fijó versiones compatibles con Expo SDK 54:
  - `@react-navigation/drawer ^7.14.4`
  - `react-native-gesture-handler ~2.28.0`
  - `react-native-reanimated ~4.1.1`
  - `expo-print ~15.0.8`
  - `expo-sharing ~14.0.8`
  - `expo-file-system ~19.0.24`
- `babel.config.js`: `plugins: ['react-native-reanimated/plugin']` añadido como último elemento dentro del objeto retornado por la función.
- `app/_layout.tsx`: árbol envuelto en `<GestureHandlerRootView style={{ flex: 1 }}>` bajo `SafeAreaProvider`. Lógica de `AuthGate`/`QueryClient`/persistencia sin cambios.
- `src/lib/edge.ts`: creado, exporta `Envelope<T>` (design §4), sin `any`.

### Resolución de módulos (verificado con `node require.resolve`)
- `expo-router/drawer` → **RESUELVE** en `expo-router 6.0.24`. Conclusión: FEAT-002 puede usar el `Drawer` de Expo Router directamente; **no** se necesita el fallback `createDrawerNavigator` (design §2.3).
- `react-native-reanimated/plugin` → **RESUELVE** (Reanimated 4 lo re-exporta). `react-native-worklets/plugin` NO está presente, por lo que se mantiene `react-native-reanimated/plugin` tal como pide el spec.

### Comandos de verificación
| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **0 errores** (exit 0) |
| `npm run lint` (`eslint app/ src/`) | **0 errores**, 98 warnings preexistentes en archivos no tocados; **0 nuevos** (exit 0) |
| `npx eslint src/lib/edge.ts app/_layout.tsx` | 0 errores; único warning en `_layout.tsx:67` es el `exhaustive-deps` preexistente del `useEffect` de `AuthGate` (no introducido por este cambio); `edge.ts` limpio |

### Pendiente manual (no verificable por typecheck/lint)
- Los módulos nativos (`react-native-gesture-handler`, `react-native-reanimated`) requieren **recompilar el dev client** antes de probar el drawer en dispositivo. Un reload de JS no basta.

## FEAT-002 — Navegación híbrida (drawer admin + hamburguesa)

### Qué se hizo
- `src/components/admin/AdminGuard.tsx`: nuevo. Extrae el guard `role !== 'admin' → EmptyState "Acceso restringido"` (icon `lock-closed-outline`, `iconColor={colors.amber}`, misma copia que `admin/index.tsx`). Envuelve el contenido de las pantallas admin (NAV-AC7).
- `src/components/admin/AdminDrawerContent.tsx`: nuevo. Usa `DrawerContentScrollView`. Replica **verbatim** la lógica de visibilidad de `admin/index.tsx` (`requiresCrewMode`→`useOrgSettings().crewModeEnabled`, `requiresTareFlag`→`useFeatureFlag('box_tare_control')`, `requiresRbacFlag`→`useFeatureFlag('configurable_rbac')`, `requiresCapability`→`usePermissions().has`; `permission-profiles` SOLO por `configurable_rbac`, sin capability). La extiende con ítems transaccionales: `settings`→`SETTINGS_MANAGE`, `settlements`→`SETTLEMENTS_MANAGE`, `records`→solo rol, `dispatch-guides/index`→flag `dispatch_guides`. Dos secciones: "Datos maestros" / "Administración". Navega con `props.navigation.navigate(route)`; resalta activo con `props.state`. Incluye su propio guard de rol para no listar módulos a no-admin.
- `app/admin/_layout.tsx`: convertido de `Stack` a `Drawer` de `expo-router/drawer` con `drawerContent={AdminDrawerContent}`, `drawerType:'front'`. Registra las 14 pantallas; `fields/[id]` y `dispatch-guides/[id]` con `drawerItemStyle:{display:'none'}`.
- `app/admin/{settings,settlements,records}.tsx` y `app/admin/dispatch-guides/{index,[id]}.tsx`: stubs mínimos (componente default envuelto en `AdminGuard` con `EmptyState "En preparación."`). Los reemplazan FEAT-003..007.
- `app/(tabs)/_layout.tsx`: `headerRight` en `screenOptions` que renderiza `TouchableOpacity` con `Ionicons name="menu"` → `router.push('/admin')` **solo si `worker?.role === 'admin'`**, `null` para los demás (NAV-AC1, NAV-AC5). Sin cambios al `href` gating de los tabs.
- `app/admin/index.tsx`: refactor para usar `AdminGuard` (guard inline eliminado, UI de tarjetas intacta — NAV-AC6). Quitados `useAuth`/`worker` ya no usados.

### Resolución de módulos (verificado con `node require.resolve`)
- `expo-router/drawer` **RESUELVE** → se usa el `Drawer` de Expo Router directamente; **no** se usó el fallback `createDrawerNavigator`.
- `@react-navigation/drawer` **RESUELVE** → `DrawerContentScrollView` y `DrawerContentComponentProps` disponibles (confirmado además porque `tsc` pasa).

### Rutas registradas vs. archivos (verificado con `ls`)
Las 14 `Drawer.Screen` mapean a archivos existentes: `index`, `workers`, `fields/index`, `fields/[id]`, `products`, `box-types`, `crews`, `supervisors`, `permission-profiles`, `settings`, `settlements`, `records`, `dispatch-guides/index`, `dispatch-guides/[id]`. Dos grupos en el drawer custom ("Datos maestros" / "Administración"); detalles ocultos.

### Comandos de verificación
| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **0 errores** (exit 0) |
| `npm run lint` (`eslint app/ src/`) | **0 errores**, 98 warnings; **0 nuevos** respecto a FEAT-001 |
| `npx eslint` (solo archivos FEAT-002) | 0 errores; 3 warnings **preexistentes** no introducidos: `(tabs)/_layout.tsx` `radius` sin usar (import previo), `admin/index.tsx` `any` en el `as any` de la UI de tarjetas (no se debía tocar) |
| `node require.resolve('expo-router/drawer' , '@react-navigation/drawer')` | resuelven OK |

### Pendiente manual (no verificable por typecheck/lint)
- Recompilar el dev client (módulos nativos de FEAT-001) antes de probar en dispositivo.
- Runtime: confirmar que `/admin` monta el Drawer con los dos grupos y que la hamburguesa abre `/admin` solo para admin.
- Runtime: worker/supervisor/crew_lead no ven drawer ni cambios en tabs (NAV-AC5); deep-link no-admin a una ruta admin muestra "Acceso restringido" (NAV-AC7).

## FEAT-003 — Configuración de la organización (G4)

### Qué se hizo
- Se reemplazó el stub `app/admin/settings.tsx` por la pantalla real, envuelta en `AdminGuard` y gateada por `usePermissions().has(CAPABILITIES.SETTINGS_MANAGE)` (fallback a "Acceso restringido" si falta la capacidad). Lectura: `organizations.select('id, name, logo_url, brand_primary_color, brand_secondary_color, crew_mode_enabled, rows_enabled, role_labels').limit(1).maybeSingle()` (queryKey `['my-organization']`); escritura `update(patch).eq('id', org.id)`.
- 4 secciones: **Marca** (nombre requerido, logo_url opcional, colores primario/secundario con `HEX_RE = ^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$` + chips preset + input hex con swatch; nombre/hex inválido muestra error en español y NO guarda; tras éxito emite `DeviceEventEmitter.emit('branding:updated')`), **Modo Capataz** (`Switch` sobre `crew_mode_enabled`, invalida `['org-settings']`), **Melgas** (`Switch` sobre `rows_enabled` por query directa a `organizations`; `rows_enabled` NO entra en `OrgSettings`), **Etiquetas de rol** (4 `TextInput`, guarda solo las no vacías; presentación, no RBAC).
- Toggles optimistas con rollback en error + `showAlert('Error', …)` en español (G4-AC8).
- `app/admin/index.tsx`: el módulo `settings` pasa a `available: true` + `requiresCapability: CAPABILITIES.SETTINGS_MANAGE` (se eliminó "Próximamente").
- `src/hooks/useBranding.ts`: cuerpo del effect ya extraído a `load()`; se añadió `DeviceEventEmitter.addListener('branding:updated', load)` de forma aditiva (se conservan `onAuthStateChange`, `DEFAULT_BRANDING` y fallback) con cleanup `sub.remove()`. Se exporta `BRANDING_UPDATED_EVENT`.
- `src/hooks/useOrgSettings.ts`: migrado a `useQuery(['org-settings'])` conservando la API pública (`settings, roleLabel, crewModeEnabled, loading`) y la recarga por `onAuthStateChange` (ahora invalida `['org-settings']` en el callback). `rows_enabled` no se incorpora a `OrgSettings`.
- No se tocó `ThemeProvider` (re-monta por `key`); el refresco de marca va por `DeviceEventEmitter`, no por `invalidateQueries` (useBranding no usa React Query).

### Comandos de verificación
| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **0 errores** (exit 0) |
| `npm run lint` (`eslint app/ src/`) | **0 errores**, 98 warnings; **0 nuevos** respecto a FEAT-002 |
| `npx eslint app/admin/settings.tsx src/hooks/useBranding.ts src/hooks/useOrgSettings.ts` | **0 errores, 0 warnings** (sin `any` en código nuevo) |
| `npx eslint app/admin/index.tsx` | 0 errores; 2 warnings **preexistentes** (`as any` en `m.route`/`m.icon` de la UI de tarjetas; no se debían tocar) |

### Compatibilidad con la nueva API de hooks (verificado por `tsc`)
- `admin/index.tsx` consume `useOrgSettings().crewModeEnabled` → sigue compilando.
- `AdminDrawerContent.tsx` consume `useOrgSettings().crewModeEnabled` → sigue compilando.
- La API pública de `useOrgSettings` (`settings`, `roleLabel`, `crewModeEnabled`, `loading`) se mantiene idéntica.

### Pendiente manual (no verificable por typecheck/lint)
- Runtime (dev client): guardar marca con hex válido re-pinta la app (evento `branding:updated` dispara `load()` y `ThemeProvider` re-monta por `key`); hex/nombre inválido bloquea el guardado con error en español.
- Runtime: toggles Modo Capataz/Melgas persisten de inmediato y revierten al fallar; Cuadrillas aparece/desaparece del drawer según `crew_mode_enabled`.
- Runtime: cambiar de sesión recarga `useOrgSettings` sin servir el caché del tenant anterior.
- Runtime: etiquetas de rol se sanean (solo no vacías) y no alteran la seguridad.

## FEAT-004 — Liquidaciones con generación en móvil (G1)

### Qué se hizo
- `src/hooks/useSettlements.ts` (nuevo): `useSettlementsList({ page, limit })`, default `limit=20` con clamp a máx 100, orden `generated_at` desc, `.range()` por página, join manual del beneficiario (worker `full_name` / crew `name` → "… (cuadrilla)") y de los `payments` por liquidación, igual que `payments.tsx`. `queryKey: ['settlements', page, limit]`. Sin `any` (interfaces locales + `SettlementPayeeType` como literal `'worker' | 'crew'`).
- `app/admin/settlements.tsx` (reemplaza el stub): pantalla real envuelta en `AdminGuard`. Lista paginada (`FlatList` + pager Anterior/Siguiente). Botón **"Generar liquidaciones"** visible solo con `usePermissions().has(CAPABILITIES.SETTLEMENTS_MANAGE)` (G1-AC6).
- Modal de generación (patrón `Modal` + `KeyboardAvoidingView` de `payments.tsx`): `TextInput` Desde/Hasta (AAAA-MM-DD). Validación cliente (G1-AC2): ambos requeridos, regex `^\d{4}-\d{2}-\d{2}$`, `start<=end`; en error `showAlert('Rango inválido', …)` en español y **no** se invoca el backend.
- Generación (G1-AC3): `supabase.functions.invoke<Envelope<GenerateSettlementsResponse>>('settlements/generate', { method:'POST', body:{ period_start, period_end } })`. Lee el **sobre** (`data.data`), con type guard `isGenerateResponse` (`Array.isArray(settlements)` + `typeof total_amount === 'number'`). Errores desde `data.error.message` (español) con fallback; nunca `error.message`. **No** inserta en `settlements` desde el cliente.
- Resultado (G1-AC4): `settlements.length===0 && total_amount===0` → "Sin producción"; `length===0 && total_amount>0` → "Nada nuevo que generar"; `length>0` → "N liquidación(es) generada(s)". Tras éxito invalida `['settlements']`, `['my-balance']`, `['my-settlements']`.
- Error (G1-AC5): `onError` → `showAlert('Error', err.message)` con el mensaje español del backend; la pantalla no se rompe; sin inserciones parciales desde cliente.
- No tocados: `payments.tsx` (G1-AC7) ni `crew.tsx` (G1-AC8). Invariante preservado: la generación delega 100% en la Edge Function; ninguna liquidación pagada se modifica.

### Backend (inspección read-only, sin modificar)
- `supabase/functions/settlements/index.ts`: `POST /settlements/generate` (`handleGenerate`) hace `requireRole(['admin'])` + `requirePermission('settlements.manage')`, salta (`continue`) las liquidaciones ya existentes del período y responde `success({ settlements, total_amount, units_by_unit }, 201)` → coincide con el sobre `{ success, data }` que consume la pantalla. `total_amount` refleja la producción global (incluye lo ya liquidado), lo que habilita la distinción "sin producción" vs "nada nuevo".

### Comandos de verificación (desde `apps/mobile`)
| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **0 errores** (exit 0) |
| `npm run lint` (`eslint app/ src/`) | **0 errores**, 98 warnings preexistentes en archivos no tocados; **0 nuevos** (exit 0) |
| `npx eslint app/admin/settlements.tsx src/hooks/useSettlements.ts` | **0 problemas** (exit 0) |

### Pendiente manual (no verificable por typecheck/lint)
- Runtime (dev client): generar un rango válido muestra "N generada(s)" y refresca lista + tab Pagos.
- Runtime: rango inválido (vacío / formato / `start>end`) NO invoca el backend.
- Runtime: período sin producción → "Sin producción"; período ya generado → "Nada nuevo que generar".
- Runtime: error del backend (p. ej. 403/422) muestra el mensaje en español, no el genérico de `FunctionsHttpError`.
- Runtime: la tab Pagos sigue pagando igual (no regresión).

## FEAT-005 — Histórico de registros + corrección auditada (G2)

### Qué se hizo
- `src/hooks/usePickingCorrection.ts`: nuevo. Extrae **verbatim** la mutación de corrección de `production.tsx` (soft-update: insert snapshot con valores viejos + `original_record_id`, luego `update` in-place del original; `quantity` para caja, `paid_quantity_kg` a 3 decimales para kg; `rate_amount_snapshot`/`payment_unit` nunca cambian; valida `> 0`; rama offline `useConnectivity` + `enqueue({ type:'picking_correction', ... })`). `onSuccess` invalida **ambas** familias: `['production']` y `['records']` (hallazgo 2). El hook expone solo la mutación (acepta `{ record, rawValue }`); NO decide visibilidad del botón. Sin `any`.
- `app/(tabs)/production.tsx`: reemplazada la mutación inline por `usePickingCorrection()`. Se conserva `canCorrect = admin|supervisor|crew_lead` y la regla `selectedRecord.work_day === localDate(0)`. El cierre de modales y haptics/alertas quedan iguales (haptics y alertas ahora en el hook; el cierre de `selectedRecord`/`correctRecord` se hace en el `onSuccess` por-llamada de `submitCorrection`). Imports `useMutation`/`useQueryClient`/`useConnectivity`/`enqueue`/`showAlert` ya no se usan aquí → eliminados. Sin cambio funcional.
- `app/admin/records.tsx`: reemplazado el stub por la pantalla real, envuelta en `AdminGuard` (acceso solo admin). Query única del período filtrado sobre `picking_records` (`gte/lte work_day`, default últimos 7 días `localDate(-7)..localDate(0)`, `worker_id`/`block_id` opcionales, `.order('recorded_at',{ascending:false})`, `.limit(1000)` tope duro); `select` ampliado con `net_weight_kg` + joins manuales de `workers(full_name, national_id)` y `blocks(products(name), product_varieties(name))` para RUT/producto/variedad del CSV (FEAT-006). `queryKey: ['records', dateFrom, dateTo, workerId, blockId]`. Paginación en cliente (`pageSize=20`, botón "Cargar más") recortando el array; cualquier filtro reinicia a page 1; aviso de truncado si llega a 1000. Lista excluye `original_record_id` no nulo del conteo; badge "Corrección" para filas de corrección (no se listan por defecto, pero el badge queda definido). Botón "Corregir" solo si `!is_correction && work_day === localDate(0)`, usa `usePickingCorrection`. Resumen agregado (registros/cajas/kg/$) con `pickingPayableBase`/`pickingSubtotal` de shared, segmentado por unidad, sobre el set completo del período. Sin `any`.

### Invariantes preservados
- Picking `quantity > 0`: validado en el hook antes de persistir/encolar.
- Corrección solo del día actual: `work_day === localDate(0)` tanto para la visibilidad del botón como dentro del hook.
- Soft-update sin tocar `rate_amount_snapshot` ni `payment_unit`: el `patch` solo escribe `quantity` o `paid_quantity_kg`.
- Entidades canónicas: `picking_records`, `workers`, `blocks`, `fields`, `products`.
- RBAC: `AdminGuard` acota `records.tsx` a admin; el hook no arrastra lógica de roles.

### Comandos de verificación (desde `apps/mobile`)
| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **0 errores** (exit 0) |
| `npm run lint` (`eslint app/ src/`) | **0 errores**, 97 warnings preexistentes en archivos no tocados; **0 nuevos** (exit 0) |
| `npx eslint app/admin/records.tsx src/hooks/usePickingCorrection.ts` | **0 problemas** (exit 0) — sin `any`, sin unused |

### Pendiente manual (no verificable por typecheck/lint)
- Runtime (dev client): filtros de fecha/trabajador/paño reinician la paginación y refrescan; "Cargar más" avanza de a 20.
- Runtime: corrección del día actual (online y offline encolada) refresca Producción Y Registros (ambas keys `['production']`/`['records']`).
- Runtime: registros de días previos no ofrecen "Corregir"; valor ≤ 0 bloqueado con error en español.
- Runtime: resumen coherente por unidad (nunca mezcla cajas y kilos) sobre el set completo del período.
- Runtime: `production.tsx` mantiene su comportamiento exacto tras extraer el hook (corrección online/offline, mensajes y cierre de modales).

---

## FEAT-006 — Export CSV/PDF (G5) + stub Guías de despacho (G3)

### Archivos creados / modificados
- `src/hooks/useReportExport.ts` (nuevo): gating `{ showCsv, showPdf }`. `showCsv = report_export && has(REPORTS_EXPORT)`; `showPdf = report_export && !disable_pdf_export && has(REPORTS_EXPORT)` (kill-switch oculta solo PDF).
- `src/lib/export/csv.ts` (nuevo): `toCSV` pura (string, sin DOM) + `CsvColumn<T>` tipado, sin `any`. Formato idéntico a la web (BOM UTF-8, separador `;`, CRLF, escaping RFC 4180).
- `src/lib/export/settlement-pdf.ts` (nuevo): `settlementHtml(data)` pura (HTML + estilos inline, reproduce `SettlementPDF` web) y `printSettlement(data)` (`expo-print` + `expo-sharing`, imports dinámicos). `SettlementPdfData` tipado, sin `any`.
- `app/admin/records.tsx`: botón "Exportar CSV" (visible si `showCsv`) sobre el **set completo del período filtrado** (query de FEAT-005, no la página). Escribe en `Paths.cache` vía la nueva API `File` de expo-file-system v19 y comparte con `Sharing.shareAsync(uri, { mimeType: 'text/csv' })`. Deshabilitado/aviso con 0 filas; `try/catch` con alerta en español.
- `app/admin/settlements.tsx`: acción "Exportar PDF" por liquidación (visible si `showPdf`) vía `settlements/:id` (sobre `Envelope<SettlementDetail>`, lee `data.data`, errores de `data.error.message`) + `printSettlement`. Aviso si el breakdown está vacío; `try/catch` con alerta en español.
- `src/lib/export/__tests__/csv.test.ts`, `src/lib/export/__tests__/settlement-pdf.test.ts` (nuevos): unit tests Vitest.

### Nota de implementación (desviación menor, sin cambio de comportamiento)
- **expo-file-system SDK 54:** `writeAsStringAsync`/`cacheDirectory` del módulo raíz están deprecados y **lanzan en runtime** en v19. Se usa la nueva API `new File(Paths.cache, nombre)` + `.create()/.write()/.uri`, que es el equivalente correcto en SDK 54 (mismo resultado: CSV en caché compartido).
- **PDF:** `settlementHtml` es pura y `printSettlement` importa `expo-print`/`expo-sharing` de forma dinámica, para que el test de la función pura corra bajo Node sin cargar módulos nativos.

### G3 (diferido) — stubs confirmados
- `app/admin/dispatch-guides/index.tsx` y `[id].tsx` muestran `EmptyState` "Guías de despacho / En preparación" envueltos en `AdminGuard` (creados en FEAT-002). La entrada del drawer sigue gateada por `useFeatureFlag('dispatch_guides')` en `AdminDrawerContent`. No se implementó el flujo completo (design §7).

---

## Convergencia — Verificación de integración cross-feature (iteración 1)

Paso de convergencia tras FEAT-001..006 (todas commiteadas). Objetivo: confirmar
que las seis features integran entre sí sin costuras rotas, no re-implementar.
Comandos desde `.worktrees/mobile-admin-parity/apps/mobile`.

### Estado del repo
- `git status`: working tree limpio sobre `feature/mobile-admin-parity`.
- 6 commits de feature por encima de `origin/main` (db44b41 → 055448d), uno por FEAT.

### Suite completa
| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **0 errores** (exit 0) |
| `npm run lint` (`eslint app/ src/`) | **0 errores**, 97 warnings preexistentes en archivos no tocados; **0 nuevos** (exit 0) |
| `npm run test` (`vitest --run`) | **2 archivos, 16 tests, todos pasan** (`toCSV` 8, `settlementHtml` 8) |

### Resolución de rutas del Drawer (Expo Router)
- `app/admin/_layout.tsx` registra **14 `Drawer.Screen`** y existen los 14 archivos de ruta
  correspondientes (`index`, `workers`, `fields/index`, `fields/[id]`, `products`, `box-types`,
  `crews`, `supervisors`, `permission-profiles`, `settings`, `settlements`, `records`,
  `dispatch-guides/index`, `dispatch-guides/[id]`). 1:1, sin rutas huérfanas ni faltantes.
- Rutas nuevas de admin (`settings`, `settlements`, `records`, `dispatch-guides`) resueltas por
  archivo y por `tsc`; `fields/[id]` y `dispatch-guides/[id]` ocultas del listado con
  `drawerItemStyle:{display:'none'}`.

### Costuras entre features (revisadas, sin cambios necesarios)
- **Migración `useOrgSettings`/`useBranding` consumida correctamente**: `useOrgSettings` mantiene
  su API pública (`settings`, `roleLabel`, `crewModeEnabled`, `loading`) ya migrada a
  `useQuery(['org-settings'])` con recarga por `onAuthStateChange`. Tanto `admin/index.tsx` como
  `AdminDrawerContent.tsx` consumen `crewModeEnabled` y compilan sin error. `useBranding` suma el
  listener aditivo `branding:updated` (con cleanup) sin romper `onAuthStateChange`/defaults.
- **Sin stubs duplicados ni sin reemplazar**: `settings.tsx`, `settlements.tsx` y `records.tsx`
  son las pantallas reales (sin "En preparación"); solo `dispatch-guides/index.tsx` y `[id].tsx`
  permanecen como stubs intencionales de G3 (diferido) bajo flag.
- **Imports/tipos coherentes entre hooks y pantallas**: `usePickingCorrection` compartido por
  `production.tsx` y `records.tsx`; `useSettlements`/`useReportExport`/`edge.ts`/`csv.ts`/
  `settlement-pdf.ts` consumidos por `settlements.tsx` y `records.tsx` — todo resuelto por `tsc`.

### Matriz de no-regresión (verificada con `git diff origin/main...HEAD`)
- `app/(tabs)/team.tsx` → **UNTOUCHED**.
- `app/(tabs)/crew.tsx` → **UNTOUCHED**.
- `apps/web/**` → **0 archivos cambiados**.
- `supabase/functions/**` → **0 archivos cambiados**.
- `app/(tabs)/production.tsx` → solo extracción no-funcional del hook de corrección (−89/+ líneas),
  comportamiento preservado (invariantes `quantity>0`, corrección solo día actual, soft-update sin
  tocar `rate_amount_snapshot`/`payment_unit`).

### Invariantes de dominio (preservados)
- Picking `quantity > 0` y corrección solo del día actual (`usePickingCorrection`).
- Tarifas `> 0`; generación de liquidaciones delega 100% en la Edge Function (sin insert cliente).
- Liquidación pagada inmutable: el export es solo lectura; la generación salta períodos ya emitidos.
- RBAC admin>supervisor>crew_lead>worker vía `AdminGuard` + capabilities (gating UI no sustituye RLS).
- Nombres canónicos: `fields`, `blocks`, `products`, `rates`, `workers`, `picking_records`,
  `settlements`, `payments`, `organizations`, `dispatch_guides`.

### Conclusión
Integración cross-feature verificada: tsc 0 errores, lint 0 errores (97 warnings preexistentes),
test 16/16. Todas las rutas del drawer resuelven, los hooks migrados se consumen correctamente, no
hay stubs sin reemplazar fuera de G3 (diferido) y la matriz de no-regresión se cumple. **Sin
cambios de código necesarios en esta iteración → sin commit.**

### Comandos de verificación (desde `apps/mobile`)
| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **0 errores** (exit 0) |
| `npm run lint` (`eslint app/ src/`) | **0 errores**, 97 warnings preexistentes en archivos no tocados; **0 nuevos** (exit 0) |
| `npm run test` (`vitest --run`) | **2 archivos, 16 tests, todos pasan** (`toCSV` 8, `settlementHtml` 8) |

### Invariantes preservados
- Export es **solo lectura**: no muta `picking_records`, `settlements` ni `rates`.
- Inmutabilidad de liquidación pagada intacta (no se escribe nada).
- Entidades canónicas: `picking_records`, `settlements`, `payments`, `workers`, `blocks`.
- RBAC/gating: `AdminGuard` + flags + capability `REPORTS_EXPORT`; el gating de UI no sustituye RLS/backend.

### Pendiente manual (requiere dev client recompilado — módulos nativos)
- CSV compartido en dispositivo con las columnas y encabezados literales (incl. `Peso neto (kg)`); abre en hoja de cálculo con acentos correctos.
- PDF por liquidación equivalente al `SettlementPDF` web (beneficiario worker/crew, período, desglose, resumen por unidad, total, pagos).
- `disable_pdf_export` activo oculta solo el PDF y deja el CSV visible.
- Botones deshabilitados / aviso cuando no hay datos (0 registros / breakdown vacío).
- Con `dispatch_guides` activo aparece la entrada del drawer y abre la pantalla provisional; sin el flag no aparece.
