# Revisión de diseño — Paridad total del rol Administrador en la app móvil (Fundo360)

Revisor: subagente de revisión de diseño (lectura en frío del diseño, verificando
contra el código real del worktree `.worktrees/mobile-admin-parity` y del repo
principal).

Documento revisado: `.agents/tasks/mobile-admin-parity/design.md` (iteración 3).
Requisitos: `.agents/tasks/mobile-admin-parity/requirements.md`.
Gap base: `.agents/tasks/app-web-parity/findings.md`.

Veredicto: **APPROVED** (0 HIGH, 0 MEDIUM, 2 NIT).

---

## Resumen del método

Esta es la tercera iteración del diseño. En vez de confiar en las afirmaciones del
documento, verifiqué contra el código fuente real cada supuesto crítico que el
diseño declara "verificado": el sobre de respuesta de las Edge Functions, el
comportamiento de `settlements/generate`, las rutas de `dispatch-guides`, el
patrón de corrección de `production.tsx`, las query keys de `payments.tsx`, los
hooks `useBranding`/`useOrgSettings`/`useFeatureFlag`, `ThemeProvider`,
`babel.config.js`, el catálogo `CAPABILITIES`/`FEATURE_FLAGS` de `@fundo360/shared`,
y la cola offline. Todos los supuestos fuertes del diseño resultaron **correctos**.
Los únicos hallazgos restantes son de nivel NIT.

Se revisó específicamente lo pedido por el encargo:

1. **Integración Drawer + Tabs en Expo Router (D2).** Correcta y segura. No envuelve
   el grupo `(tabs)` en un Drawer; convierte solo `app/admin/_layout.tsx` de `Stack`
   a `Drawer`. Esto no afecta ni el grupo `(tabs)` ni los roles supervisor/crew_lead
   (ver Hallazgo-NIT-1 por un matiz de UX, no de corrección).
2. **G1–G5 con pantallas, flags, guards, capabilities y endpoints concretos.** Cada
   gap tiene su archivo de pantalla, su gating (rol + capability + flag), y su
   endpoint real verificado.
3. **G3 completamente diseñado aunque diferido.** La §7 especifica rutas, contratos
   de Edge Function, validaciones e invariantes; la implementación se difiere con
   pantalla provisional tras el flag `dispatch_guides` (D3/S3).
4. **Invariantes de dominio.** Preservados y con "puntos de propiedad" explícitos
   (§5): la autoridad final siempre es backend/RLS/trigger; el cliente solo gatea UI.

---

## Hallazgos

### NIT-1 — El botón hamburguesa de los tabs no abre el drawer directamente (indirección vs. literal de NAV-AC1)

**Severidad:** NIT.
**Dónde:** §2.4 "Botón hamburguesa en el header de los tabs (NAV-AC1)".

NAV-AC1 dice que el icono hamburguesa "**abre el drawer de gestión**". El diseño,
por una limitación real de Expo Router (no se puede llamar `openDrawer()` desde
fuera del `NavigationContainer` del drawer), hace que el icono ejecute
`router.push('/admin')`, que aterriza en `admin/index` cuyo layout **es** el Drawer;
el drawer se abre después con el gesto o con el botón de menú propio del header del
Drawer. Es decir, hay un paso intermedio: el icono **navega a la sección** cuyo
layout es el drawer, no abre el panel deslizable de inmediato.

El diseño documenta esto explícitamente y lo justifica como el patrón estable de
Expo Router, lo cual es correcto y aceptable. Queda como NIT porque difiere de la
redacción literal de NAV-AC1 ("abre el drawer"). No bloquea.

**Fix concreto (elegir uno, documentarlo):**
- (a) Dejarlo como está y precisar en el diseño/entrega que "abrir el drawer" se
  cumple vía navegación a la sección admin (índice) con el drawer accesible por
  gesto/botón, aceptando el paso intermedio; o
- (b) si se quiere apertura en un toque, hacer que `admin/index` detecte un
  parámetro de navegación (p. ej. `router.push('/admin?open=1')`) y en su primer
  render invoque `navigation.openDrawer()` usando el `navigation` del Drawer (ya
  dentro del navigator), cerrando la indirección percibida.

### NIT-2 — El catálogo `FEATURE_FLAGS` de `@fundo360/shared` no lista `report_export`, `disable_pdf_export` ni `configurable_rbac`

**Severidad:** NIT.
**Dónde:** §4.4 (gating G5), §2.3/§7.6 (gating por flags); contrastado con
`packages/shared/src/constants/index.ts`.

Verificado: `FEATURE_FLAGS` en shared solo contiene `kg_payment`,
`product_varieties`, `box_tare_control`, `dispatch_guides`,
`payment_photo_evidence`. Los flags `report_export`, `disable_pdf_export` y
`configurable_rbac` **no** están en ese catálogo TS. Sin embargo, esto **no es un
defecto de diseño**: `useFeatureFlag(key: string)` acepta **cualquier string** y
resuelve contra las tablas `platform_feature_flags`/`organization_feature_flags` en
la base de datos, no contra la constante de shared. La web ya consume exactamente
`useFeatureFlag('report_export')` y `useFeatureFlag('disable_pdf_export')` como
literales (verificado en `apps/web/.../settlements/page.tsx` y `records/page.tsx`),
y el `admin/index.tsx` móvil ya usa `useFeatureFlag('configurable_rbac')`. Por tanto
el diseño es consistente con el patrón existente.

**Fix concreto (opcional, higiene):** añadir las claves faltantes a `FEATURE_FLAGS`
en `packages/shared/src/constants/index.ts` (`REPORT_EXPORT: 'report_export'`,
`DISABLE_PDF_EXPORT: 'disable_pdf_export'`, `CONFIGURABLE_RBAC: 'configurable_rbac'`)
y referenciarlas por constante en vez de literal, para evitar typos. No bloquea; es
mejora de catálogo, no requisito del diseño.

---

## Supuestos verificados (confirmados contra el código)

1. **Sobre de respuesta de Edge Functions** (`_shared/response.ts`): `success(data,
   status, meta?)` → `{ success:true, data, meta? }`; `error(...)` → `{ success:false,
   error:{ code, message, details? } }`. **Confirmado.** La regla transversal del
   diseño (tipar `invoke<Envelope<T>>`, leer `data.data` y `data.error.message`) es
   correcta.
2. **`settlements/generate`** (`supabase/functions/settlements/index.ts`): devuelve
   `success({ settlements, total_amount, units_by_unit }, 201)`; `total_amount` =
   `totalAmountGlobal` (producción global del período, incluye lo ya liquidado);
   salta liquidaciones existentes con `if (existing) continue`. **Confirmado** — la
   distinción de G1-AC4 ("Sin producción" cuando `total_amount===0` vs. "Nada nuevo
   que generar" cuando `settlements.length===0 && total_amount>0`) es correcta.
3. **`handleGenerate` hace `requireRole(req,['admin'])` + `requirePermission(req,
   'settlements.manage')`** y valida `422` "period_start y period_end son
   requeridos". **Confirmado.** El cliente no inserta en `settlements` (S2).
4. **Ruteo de `settlements`**: `subResource = pathParts[1]`, por lo que
   `functions.invoke('settlements/generate', ...)` entra a `handleGenerate`.
   **Confirmado.**
5. **`CAPABILITIES`** incluye `SETTLEMENTS_MANAGE` (`settlements.manage`),
   `PAYMENTS_MANAGE`, `REPORTS_EXPORT` (`reports.export`), `SETTINGS_MANAGE`
   (`settings.manage`). **Confirmado.** No existe `dispatch.manage` (S4 correcto);
   `permission-profiles` se gatea solo por el flag `configurable_rbac` sin capability
   (hallazgo 7 de iteración 2, correcto).
6. **`useBranding.ts`**: usa `useState`/`useEffect` y recarga por
   `onAuthStateChange`; **no** usa React Query ni existe key `['branding']`.
   **Confirmado.** `invalidateQueries(['branding'])` sería inerte; el diseño lo
   descarta y adopta `DeviceEventEmitter('branding:updated')` + `load()` (hallazgo 1
   HIGH de iteración 3, corregido correctamente).
7. **`ThemeProvider.tsx`**: consume `useBranding()`, llama `applyBrandColors(...)` y
   re-monta por `key={colors.primary}` (vía `themeKey`). **Confirmado** — el refresco
   de marca de G4-AC3 funciona con el emisor + re-montaje.
8. **`useOrgSettings.ts`**: usa `useState`/`useEffect`, recarga por
   `onAuthStateChange`, y su `select` es `'crew_mode_enabled, role_labels'` (no
   incluye `rows_enabled`). **Confirmado** — la migración a `useQuery` conservando la
   recarga por sesión (hallazgo 3 MEDIUM) y la aclaración de que `rows_enabled` se
   lee por query directa son correctas.
9. **`production.tsx`**: `canCorrect = admin|supervisor|crew_lead`; la mutación de
   corrección hace soft-update (snapshot + update in-place, sin tocar
   `rate_amount_snapshot`/`payment_unit`), valida `>0` y "solo día actual", encola
   offline con `type:'picking_correction'`, y su `onSuccess` invalida **solo**
   `['production']`. **Confirmado** — justifica el hallazgo 2 MEDIUM (invalidar
   también `['records']`) y la separación guard-vs-mutación (hallazgo 4).
10. **`payments.tsx`**: query keys `['my-balance', worker?.id]` y
    `['my-settlements', worker?.id]`. **Confirmado** — la invalidación triple de G1
    (`['settlements']` nuevo + `['my-balance']` + `['my-settlements']`) es correcta.
11. **`dispatch-guides/index.ts`**: existen las rutas `GET /`, `GET /suggestion`,
    `GET /:id` (devuelve `{ guide, receipt, comparison }`), `POST /`,
    `PUT /:id` (implícito en el ruteo de item), `POST /:id/close`, `POST /:id/reopen`
    (solo admin), `POST /:id/receipt`, `PUT /:id/receipt` (permitida con guía
    cerrada). **Confirmado** — §7.2 es fiel al backend.
12. **`compareDispatch` / `aggregateDispatchWeight`** existen en
    `packages/shared/src/types/index.ts` con tests. **Confirmado** (NFR5).
13. **`useFeatureFlag(key:string)`** resuelve claves arbitrarias contra tablas de la
    base de datos (`platform_feature_flags`/`organization_feature_flags`).
    **Confirmado** — habilita el uso de `report_export`/`disable_pdf_export`/
    `dispatch_guides`/`configurable_rbac` como literales, igual que la web.
14. **`babel.config.js`** exporta una función `function(api){...return{...}}`.
    **Confirmado** — el snippet de §2.5 (plugin de reanimated dentro del objeto
    retornado, al final) es correcto (hallazgo 6).
15. **`app/admin/_layout.tsx`** es hoy un `Stack` con las 9 screens listadas.
    **Confirmado** — la conversión a `Drawer` de §2.3 parte del estado real.
16. **`(tabs)/_layout.tsx`** tiene `headerShown:true`. **Confirmado** — el
    `headerRight` de NAV-AC1 es renderizable; el diseño usa `worker?.role === 'admin'`
    (no el `isAdmin` amplio del archivo), correcto para que solo el admin vea el icono.
17. **Cola offline** (`offline-queue.ts`): soporta `type:'picking_correction'` con la
    forma de payload que `production.tsx` encola. **Confirmado** — el reuso vía
    `usePickingCorrection` (G2-AC8) es viable sin tocar el procesador.
18. **`records/page.tsx` (web)**: trae el período completo sin `.range()`, pagina en
    cliente, resuelve `national_id`/producto/variedad por joins manuales, y calcula
    resumen/CSV sobre el set completo. **Confirmado** — el "modelo de dos lecturas"
    de G2 (query única con tope 1000 + paginación en cliente) replica fielmente a la
    web (hallazgo 3 de iteración 2).

## Supuestos no verificables en frío (correctamente marcados por el diseño como verificación de ejecución)

Ninguno de estos bloquea; el diseño los lista en §8 (Riesgos) y §9 (Verificación) y
no afirma falsamente que estén verificados:

- **A2** — Que RLS permita al `admin` leer `settlements/:id` vía `functions.invoke`.
  Plausible: `handleGetOne` no impone rol extra, solo `getUser`; pero depende de RLS
  de `settlements` para el admin. Punto de verificación en ejecución.
- **A3** — Compatibilidad de `expo-print`/`expo-sharing`/`expo-file-system` y del trío
  `@react-navigation/drawer`/`react-native-gesture-handler`/`react-native-reanimated`
  con Expo SDK 54 (vía `npx expo install`), más la recompilación del dev client.
- **Subpath `expo-router/drawer`** en expo-router 6.0.24: no verificable sin
  `node_modules`. El diseño ofrece fallback a `createDrawerNavigator` sin cambiar la
  arquitectura de rutas (hallazgo 5). Correcto como mitigación.

## Supuestos erróneos detectados

Ninguno. Todas las afirmaciones "verificado" del diseño se confirmaron contra el
código real.

---

## Conclusión

El diseño es completo, internamente consistente y fiel al código. Resuelve las tres
preocupaciones del encargo (integración Drawer+Tabs correcta y aislada al admin;
G1–G5 con pantallas/flags/guards/capabilities/endpoints concretos y verificados; G3
diseñado al completo aunque diferido) y preserva los invariantes de dominio con
puntos de propiedad explícitos. No hay hallazgos HIGH ni MEDIUM; los dos NIT son
mejoras opcionales que no afectan la corrección ni bloquean la implementación.
