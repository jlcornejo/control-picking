# Fix de textos cortados (clipping / truncation) en la app móvil

El cambio ataca el recorte de texto que aparecía **incluso en escala "Normal"** en la app Expo RN. La causa raíz es el padding de glifo de Android (`includeFontPadding: true` por defecto), que reservaba espacio de línea y recortaba el glifo final/inferior de palabras como "Identific[ar]", "Pendient[e]", "Parcia[l]", "Agrega[r]", "Vacia[r]"; y, en datos de identificación, `numberOfLines={1}` sin margen para crecer, que forzaba "...". La solución aplica `includeFontPadding:false` transversalmente en los estilos de texto afectados (no-op en iOS, seguro) y, para RUT/Teléfono y pills/chips de ancho acotado, cambia la estrategia de truncar por wrap a 2ª línea o encoger acotado (`adjustsFontSizeToFit` + `minimumFontScale={0.85}`). Es un cambio UI-only: no toca lógica de negocio, queries, comportamiento de botones, la escala de fuente (`useFontScale`/`AppText`), `apps/web` ni `supabase/functions`.

Watch for:
- Las REGLAS DURAS se cumplen (confirmed): RUT/Teléfono van a 2ª línea y solo encogen hasta 0.85 — no hay ruta de truncado con "..."; botones y badges muestran la palabra completa porque no se les impuso `numberOfLines` ni ancho que recorte.
- El caveat on-device es real (confirmed): la verificación fue estática (type-check + bundle release). El equipo físico corre un APK release que no hot-reloadea el bundle nuevo, así que no hubo confirmación visual. No es bloqueante para el fix de layout, pero debe validarse en un dev build / APK nuevo.

**Verdict**: APPROVED

## High-level view

El fix es homogéneo y de bajo riesgo: casi todos los cambios son añadir `includeFontPadding:false` a estilos de texto ya existentes, lo que elimina el padding de línea de Android sin afectar iOS. Esto cubre por sí solo los botones y badges ("Identificar", "Pendiente", "Parcial", "Agregar", "Vaciar", "Hoy"), cuyo único recorte era ese padding de glifo, porque sus contenedores ya dejan crecer el texto (botón full-width, badge `alignSelf:'flex-start'` en fila con gap).

Para los datos de identificación (RUT/Teléfono en `profile.tsx`) el cambio es más sustancial y correcto: el valor pasa de `numberOfLines={1}` a `numberOfLines={2}` + `adjustsFontSizeToFit` + `minimumFontScale={0.85}`, sobre una cadena de contenedores (`valueWrap` con `flexShrink:1 + minWidth:0`, `value` con `flexShrink:1`) que permite envolver antes de encoger. No queda ninguna ruta que produzca "..." en datos de identificación, cumpliendo la regla dura.

Las pills y chips de ancho acotado (rol "Anotadores", chips de período/stats/escala) encogen hasta 0.85 en vez de romperse o truncarse; el pill de rol gana `minWidth:0` para que el `flexShrink:1` del texto actúe. El título "Tamaño del texto" pasa a permitir 2ª línea. `AppText` propaga `numberOfLines`/`adjustsFontSizeToFit`/`minimumFontScale` vía `{...rest}` al `Text` de RN, así que estas props llegan intactas sin duplicar lógica.

La escala de fuente (`AppText`/`useFontScale`) no se tocó: escala únicamente el `fontSize` propio del estilo y respeta la herencia de RN, como ya documentaba. La verificación fue estática; la confirmación visual en dispositivo queda pendiente por la naturaleza del APK release instalado.

<details>
<summary>Issues (1)</summary>

1. **Confirmación visual pendiente (non-blocking)** — la verificación fue estática (type-check + bundle release); no hubo validación en dispositivo porque el APK release instalado no hot-reloadea el bundle. Validar en un dev build o APK nuevo que ninguno de los textos del inventario (Hoy, Identificar, Pendiente, Parcial, Agregar, Vaciar, Anotadores, RUT, Teléfono, Tamaño del texto) aparezca cortado ni con "..." en escala Normal y Extra grande.

</details>

<details>
<summary>Details</summary>

### `includeFontPadding:false` como corrección raíz del clipping Android

El grueso del diff es añadir `includeFontPadding:false` a estilos de texto ya existentes en los seis archivos. En Android el `Text` reserva por defecto padding vertical para ascenders/descenders de la fuente, lo que en celdas ajustadas recortaba el glifo final o inferior de la palabra — el síntoma que el usuario describió ("algunos textos cortados") y que ocurre también en escala Normal, consistente con una causa no ligada a la escala. En iOS la prop es no-op, así que aplicarla transversalmente es seguro. Esto por sí solo resuelve "Hoy" (production), "Identificar" y hermanos (register), los badges "Pendiente"/"Parcial" (settlements/payments) y "Agregar"/"Vaciar" (DayRosterManager).

La razón de que esto baste para botones y badges es que sus contenedores no imponen recorte. La verifiqué directamente: en `register.tsx` el `primaryBtn` es `width:'100%'`, `alignItems:'center'`, y su `AppText` no lleva `numberOfLines`, así que "Identificar" crece con el contenido. En `settlements.tsx` el `statusBadge` es `alignSelf:'flex-start'` dentro de `cardBadgeRow` (fila con `gap:8`, sin ancho fijo) y el `statusText` tampoco tiene `numberOfLines` — la palabra del badge se muestra completa. Mismo patrón en `payments.tsx`. Cumple la regla dura de "palabra completa" en botones y badges.

### RUT/Teléfono: de truncar a wrap + encoger, sin "..."

El cambio de mayor peso conceptual está en `InfoRow` de `profile.tsx`. El valor pasa de `numberOfLines={1}` a `numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}`. La cadena de contenedores soporta la estrategia: `valueWrap` tiene `flexDirection:'row', flexShrink:1, minWidth:0, justifyContent:'flex-end'` y `value` tiene `flexShrink:1, textAlign:'right'`. Con `minWidth:0` presente, el `flexShrink` del texto puede reducir el ancho de la celda y permitir el wrap a la 2ª línea; si aún no cabe (escala Extra grande), `adjustsFontSizeToFit` encoge hasta 0.85 antes de romper. No existe ninguna combinación que produzca "..." en el valor, de modo que la regla dura "RUT no se trunca" se cumple. Verifiqué `AppText` (`src/components/AppText.tsx`): reenvía `{...rest}` y el `style` al `Text` de RN, por lo que `numberOfLines`/`adjustsFontSizeToFit`/`minimumFontScale` llegan sin intermediación.

### Pills y chips: encoger acotado en celdas de ancho fijo

El pill de rol ("Anotadores"/"Encargado") gana `minWidth:0` en `rolePill` y su `AppText` gana `adjustsFontSizeToFit minimumFontScale={0.85}` (ya tenía `numberOfLines={1}` e `includeFontPadding:false`). El `minWidth:0` es la pieza que faltaba para que el `flexShrink:1` del texto surta efecto dentro de un contenedor flex; sin él, el texto no podía encogerse y el pill no se ajustaba. Los chips de período, stats y escala (`flex:1`, ancho fijo repartido) reciben `minimumFontScale={0.85}` sobre su `adjustsFontSizeToFit` preexistente: en celdas de ancho fijo, encoger acotado a 0.85 es la estrategia correcta — evita el truncado y pone un piso de legibilidad. El título "Tamaño del texto" pasa de `numberOfLines={1}` a `{2}` para permitir 2ª línea en lugar de encoger, apropiado para un encabezado con altura libre.

### Nada de lógica de negocio, escala de fuente ni otros paquetes

El diff se limita a props de presentación (`includeFontPadding`, `numberOfLines`, `adjustsFontSizeToFit`, `minimumFontScale`) y a dos ajustes de layout (`minWidth:0` en `rolePill`). No hay cambios en queries, handlers de botones, invariantes de dominio (picking quantity>0, rates>0, inmutabilidad de settlements, RBAC) ni en `useFontScale`/`AppText`. `apps/web` y `supabase/functions` no aparecen en el diff. El `minimumFontScale={0.85}` nuevo en los chips de la sección "Tamaño del texto" afecta solo cómo se dibujan las etiquetas de los chips, no el valor de escala que seleccionan ni el motor `useFontScale`.

### Cobertura de verificación

La evidencia en `verification.md` registra `npx tsc --noEmit` (Exit 0) y un export de bundle release Android (`expo export:embed --eager --platform android --dev false`, 2003 módulos, Exit 0), con los temporales de `/tmp` limpiados. Spot-check puntual propio (sin re-ejecutar suites): leí `AppText.tsx` para confirmar la propagación de props, y `profile.tsx`/`register.tsx`/`settlements.tsx` para confirmar las cadenas de contenedores. Todo coincide con lo declarado.

No tested (confirmed): render visual en dispositivo físico en escala Normal y Extra grande. El APK release instalado no hot-reloadea el bundle nuevo, por lo que la confirmación visual queda pendiente a un dev build o APK nuevo. Es el único gap y no bloquea el fix de layout.

</details>

<details>
<summary>File map</summary>

- `apps/mobile/app/(tabs)/production.tsx` — `includeFontPadding:false` en `dayDate` ("Hoy"), `dayBtnText`, `headerUnit`, `listTitle`, `listCount`, `cardBlock`, `cardUnit`.
- `apps/mobile/app/(tabs)/register.tsx` — `includeFontPadding:false` en `primaryBtnText` ("Identificar") y hermanos (`confirmBtnText`, `backBtnText`, `scaleBtnText`, `blockName`, `blockProduct`, `workerChipText`, `unitLabel`).
- `apps/mobile/app/admin/settlements.tsx` — `includeFontPadding:false` en `statusText` (badge), `cardPeriod`, `cardAmount`.
- `apps/mobile/app/(tabs)/payments.tsx` — `includeFontPadding:false` en `statusText` (badge), `cardPeriod`, `cardWorker`, `cardAmount`.
- `apps/mobile/src/components/DayRosterManager.tsx` — `includeFontPadding:false` en `addBtnText` ("Agregar"), `clearBtnText` ("Vaciar") y textos hermanos de la pantalla.
- `apps/mobile/app/(tabs)/profile.tsx` — InfoRow value a `numberOfLines={2} + adjustsFontSizeToFit + minimumFontScale={0.85}`; `rolePill` gana `minWidth:0`; pill/chips ganan `minimumFontScale={0.85}`; `a11yTitle` a `numberOfLines={2}`; `includeFontPadding:false` en labels/valores/chips.
- `.agents/tasks/font-scale-fix/plan.md`, `.agents/tasks/font-scale-fix/verification.md` — documentación de la tarea (no es código de producción).

Full diff: `git diff main` en la raíz del repo.

</details>
