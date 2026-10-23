# Final Report — mobile-admin-parity

Paridad admin en la app móvil Fundo360 + navegación híbrida (drawer admin sobre los tabs de terreno). Rama `feature/mobile-admin-parity` integrada a `main`.

- **Rama feature:** `feature/mobile-admin-parity`
- **Base:** `main`, fast-forwardeada de `b7d17b1` → `055448d`
- **Merge:** fast-forward limpio (sin conflictos; `main` ya era ancestro directo de la feature, el rebase fue no-op)
- **Veredicto de revisión:** APPROVED (0 findings) — `review.md` / `review.json`

## Features entregadas (6)

1. **FEAT-001 — Infra nativa drawer + Envelope edge** (`db44b41`)
   Instalación de `@react-navigation/drawer`, `react-native-gesture-handler`, `react-native-reanimated`, `expo-print`, `expo-sharing`, `expo-file-system` (versiones fijadas por `expo install` para SDK 54). Plugin de Reanimated en `babel.config.js` (último del array), árbol envuelto en `GestureHandlerRootView`, y tipo `Envelope<T>` en `src/lib/edge.ts`.

2. **FEAT-002 — Navegación híbrida (drawer admin + hamburguesa)** (`f982dfd`)
   `app/admin/_layout.tsx` convertido de `Stack` a `Drawer` (`expo-router/drawer`) con `AdminDrawerContent` custom en dos secciones (Datos maestros / Administración). Hamburguesa en el header de tabs **solo para `role === 'admin'`**; `AdminGuard` envuelve toda pantalla admin (deep-link no-admin → "Acceso restringido"). Rutas de detalle (`fields/[id]`, `dispatch-guides/[id]`) ocultas del drawer.

3. **FEAT-003 — Configuración de la organización (G4)** (`1fb7725`)
   `app/admin/settings.tsx` (gating `SETTINGS_MANAGE`): Marca (nombre/logo/colores con validación hex), Modo Capataz, Melgas y Etiquetas de rol. Toggles optimistas con rollback. `useOrgSettings` migrado a `useQuery(['org-settings'])` conservando API pública y recarga por sesión; `useBranding` suma listener aditivo `branding:updated`.

4. **FEAT-004 — Generación de liquidaciones en móvil (G1)** (`5d9e10c`)
   `app/admin/settlements.tsx` + `useSettlements` (paginado 20/máx 100). Botón "Generar" solo con `SETTLEMENTS_MANAGE`; validación de rango en cliente; invoca `settlements/generate` y lee el **sobre** `{ success, data }` con type guard; mensajes de error en español desde `data.error.message`; distingue "sin producción" vs "nada nuevo que generar". Generación 100% delegada a la Edge Function (sin insert cliente).

5. **FEAT-005 — Histórico de registros + corrección auditada (G2)** (`46c029e`)
   `app/admin/records.tsx`: query única del período (default 7 días, tope 1000 filas), filtros (trabajador/paño/fechas) con reset a página 1, paginación cliente 20/página y resumen por unidad. `usePickingCorrection` extraído de `production.tsx` (soft-update con `original_record_id`, sin tocar `rate_amount_snapshot`/`payment_unit`, valida `> 0`, rama offline), invalida `['production']` y `['records']`. `production.tsx` queda como extracción no-funcional.

6. **FEAT-006 — Export CSV/PDF (G5) + stub Guías de despacho (G3)** (`055448d`)
   `useReportExport` (`showCsv`/`showPdf`, kill-switch `disable_pdf_export` oculta solo PDF). `csv.ts` (`toCSV` pura, encabezados literales de la web incl. `Peso neto (kg)`) y `settlement-pdf.ts` (`settlementHtml` + `printSettlement` con expo-print/expo-sharing). CSV exporta el set completo del período; PDF por liquidación leyendo el sobre `Envelope<SettlementDetail>`. Unit tests Vitest (16).

## Qué se verificó

Fuente: `verification.md` (evidencia por feature + convergencia cross-feature). Re-confirmado en este paso tras el rebase, desde `.worktrees/mobile-admin-parity/apps/mobile`:

| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **0 errores** (exit 0) — re-ejecutado post-rebase |
| `npm run lint` (`eslint app/ src/`) | **0 errores**, 97 warnings preexistentes en archivos no tocados; **0 nuevos** (exit 0) — re-ejecutado post-rebase |
| `npm run test` (`vitest --run`) | **16/16 tests** (`toCSV` 8, `settlementHtml` 8) — por evidencia de `verification.md` |

Matriz de no-regresión (confirmada contra `origin/main` en la revisión): `apps/web/**`, `supabase/functions/**`, `app/(tabs)/team.tsx`, `app/(tabs)/crew.tsx` y `payments.tsx` sin cambios. El diff toca solo `apps/mobile` + `package-lock.json`.

Desviación menor validada: el export usa la nueva API `File`/`Paths` de `expo-file-system 19` en lugar de `writeAsStringAsync`/`cacheDirectory` (que lanzan en runtime en SDK 54). Requerida y correcta.

## Veredicto de revisión

APPROVED — 0 findings bloqueantes ni accionables (`review.json`). La revisión validó el scoping de navegación, la lectura por sobre de las Edge Functions, los invariantes de dominio (generación delegada al backend, corrección solo del día actual, sin mutar `rate_amount_snapshot`/`payment_unit`) y la matriz de no-regresión.

## Pendiente de prueba MANUAL en dispositivo

Nada de esto es verificable por typecheck/lint/unit; requiere equipo físico (moto g04s):

- **Recompilar el dev client** antes de probar el drawer en dispositivo: FEAT-001 agregó módulos nativos (`react-native-gesture-handler`, `react-native-reanimated`); un reload de JS no basta.
- **APK preview apuntando al remoto** (Supabase Cloud) para validar los flujos admin end-to-end.
- Navegación: `/admin` monta el Drawer con los dos grupos; hamburguesa solo visible para admin; worker/supervisor/crew_lead sin cambios en tabs; deep-link no-admin → "Acceso restringido".
- G4: guardar marca con hex válido re-pinta la app; hex/nombre inválido bloquea con error en español; toggles revierten al fallar; cambiar de sesión no sirve caché del tenant anterior.
- G1: rango válido genera y refresca lista + tab Pagos; rango inválido no invoca backend; "Sin producción" vs "Nada nuevo"; error de backend en español; tab Pagos sin regresión.
- G2: filtros/paginación; corrección del día actual (online y offline encolada) refresca Producción y Registros; días previos sin "Corregir"; valor ≤ 0 bloqueado; resumen coherente por unidad.
- G5: CSV compartido con columnas/acentos correctos; PDF por liquidación equivalente al web; `disable_pdf_export` oculta solo PDF; botones deshabilitados sin datos.

## Trabajo diferido

- **G3 — flujo completo de guías de despacho:** solo stub bajo flag `dispatch_guides` (`app/admin/dispatch-guides/{index,[id]}.tsx`, `EmptyState` "en preparación"). El diseño completo (lista/crear/detalle/recepción/comparación contra la Edge Function `dispatch-guides`) queda documentado en `design.md §7` para implementarse después sin re-diseñar.
