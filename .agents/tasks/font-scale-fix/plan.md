# Implementation Plan — Fix de textos cortados (mobile)

Objetivo: eliminar el recorte/truncado de textos en la app móvil Expo RN de
Fundo360. El bug ocurre **incluso en escala "Normal"**, así que la causa raíz es
de layout + el padding de glifo de Android, no la escala de fuente.

## Diagnóstico (causa raíz por fenómeno)

- **Clipping SIN ellipsis** ("Identific[ar]", "Pendient[e]", "Parcia[l]",
  "Agrega[r]", "Vacia[r]", "Ho[y]"): Android reserva padding de línea
  (`includeFontPadding` por defecto `true`) que recorta el glifo final/inferior
  cuando el contenedor ajusta exacto al contenido (botones compactos, badges
  `alignSelf:'flex-start'`, filas con `gap` + icono). Ninguno de esos estilos
  de texto tiene `includeFontPadding:false` hoy (verificado). Fix base:
  `includeFontPadding:false` en el estilo del texto afectado, y donde el
  contenedor aprieta, permitir que crezca (`flexShrink` + `minWidth:0`, o quitar
  el ancho que no cabe).
- **Ellipsis con "..."** (RUT, Teléfono, "Activo", pill "Anotadores", label
  "Tamaño del texto"): `numberOfLines={1}` sin margen para crecer. Para datos de
  identificación (RUT/Teléfono) **nunca** usar "..."; se decide por caso entre
  envolver a segunda línea o `adjustsFontSizeToFit` con `minimumFontScale`.

## Decisión wrap-vs-encoger por caso

- **RUT y Teléfono** (profile InfoRow): **wrap a 2 líneas** (dato crítico, debe
  verse completo; el RUT chileno cabe en 2 líneas sin problema). `numberOfLines`
  pasa de `1` a `2`, se quita el riesgo de "...". No se encoge fuente porque son
  pocos caracteres y la fila tiene altura libre (es una card, no una barra).
- **"Activo" / "Desde"** (InfoRow): cortos; basta `includeFontPadding:false` +
  permitir 2 líneas por consistencia. Sin "...".
- **Pill rol "Anotadores"/"Encargado"** (profile roleText): **encoger** con
  `adjustsFontSizeToFit` + `minimumFontScale:0.85` + `includeFontPadding:false`.
  Es un pill de ancho acotado; preferible encoger levemente a romper el pill en
  2 líneas.
- **Botones de acción "Identificar"/"Agregar"/"Vaciar"/"Confirmar"**: dejar
  crecer el texto (`includeFontPadding:false`, sin `numberOfLines`); los botones
  ya tienen ancho suficiente, el corte era solo el padding de glifo. No encoger.
- **Badges "Pendiente"/"Parcial"/"Pagado"**: palabra completa siempre. El badge
  se ajusta al contenido, así que `includeFontPadding:false` en `statusText`
  resuelve el glifo recortado; no se limita con `numberOfLines`.
- **"Hoy" (production dayDate) y chips de período/escala**: `includeFontPadding:
  false`; los chips ya usan `adjustsFontSizeToFit` y se mantienen.
- **"Tamaño del texto" (a11yTitle)**: `includeFontPadding:false` + `flexShrink:1`
  ya presente; además permitir 2 líneas (quitar `numberOfLines={1}`), el header
  tiene altura libre.

Regla transversal: donde se añade `includeFontPadding:false`, mantener el resto
del estilo intacto (solo layout/estilos de texto; no tocar lógica, queries,
nombres de entidad, RBAC ni invariantes de dominio).

---

## Pasos

- [ ] 1. production.tsx — texto "Hoy" y labels del header/lista.
      Añadir `includeFontPadding:false` a los estilos de texto que recortan:
      `dayDate` (el "Hoy"), y por robustez `dayBtnText`, `headerUnit`,
      `listTitle`, `listCount`, `cardUnit`, `cardBlock`. No se cambia layout:
      `dayCenter` ya es flex row con gap y el texto cabe; el corte era el padding
      de glifo de Android.
      Files: /Users/ericksegura/Documents/backupHDD/personal/control-picking/apps/mobile/app/(tabs)/production.tsx
      Verify: `npx tsc --noEmit` (desde apps/mobile) sin errores; revisión visual del APK (paso 8) muestra "Hoy" completo.

- [ ] 2. register.tsx — botón "Identificar" (y botones de acción hermanos).
      Añadir `includeFontPadding:false` a `primaryBtnText` (el "Identificar"),
      y por el mismo patrón a `confirmBtnText`, `backBtnText`, `scaleBtnText`,
      `blockName`, `blockProduct`, `workerChipText`, `unitLabel`. El botón ya es
      `width:'100%'`, así que no hay que ensanchar nada: el glifo final se
      recortaba por el padding de línea.
      Files: /Users/ericksegura/Documents/backupHDD/personal/control-picking/apps/mobile/app/(tabs)/register.tsx
      Verify: `npx tsc --noEmit` sin errores; en el APK el botón muestra "Identificar" completo.

- [ ] 3. settlements.tsx — badges de estado "Pendiente"/"Parcial"/"Pagado".
      Añadir `includeFontPadding:false` a `statusText`. El badge
      (`statusBadge`) usa `alignSelf:'flex-start'` y crece con el contenido, así
      que no se limita con `numberOfLines`; con el padding de glifo corregido la
      palabra se ve completa. Añadir también `includeFontPadding:false` a
      `cardPeriod` y `cardAmount` por consistencia de la card.
      Files: /Users/ericksegura/Documents/backupHDD/personal/control-picking/apps/mobile/app/admin/settlements.tsx
      Verify: `npx tsc --noEmit` sin errores; badges muestran "Pendiente"/"Parcial" completos en el APK.

- [ ] 4. payments.tsx — mismos badges "Pendiente"/"Parcial"/"Pagado".
      Añadir `includeFontPadding:false` a `statusText` (y a `cardPeriod`,
      `cardAmount`, `cardWorker` por consistencia). Mismo razonamiento que el
      paso 3: badge que crece con el contenido, el corte era el padding de glifo.
      Files: /Users/ericksegura/Documents/backupHDD/personal/control-picking/apps/mobile/app/(tabs)/payments.tsx
      Verify: `npx tsc --noEmit` sin errores; badges completos en el APK.

- [ ] 5. DayRosterManager.tsx — botones "Agregar" y "Vaciar".
      Añadir `includeFontPadding:false` a `addBtnText` y `clearBtnText` (causa del
      "Agrega[r]"/"Vacia[r]"). Aplicar el mismo flag a los textos de la misma
      pantalla que pueden recortar: `title`, `subtitle`, `count`, `memberName`,
      `memberUnits`, `availName`, `baseTagText`, `sheetTitle`, `emptyText`. Los
      botones (`addBtn`/`clearBtn`) tienen padding horizontal propio y crecen con
      el contenido; no se fija ancho. Usado por team.tsx y crew.tsx, así que el
      fix cubre ambas pantallas.
      Files: /Users/ericksegura/Documents/backupHDD/personal/control-picking/apps/mobile/src/components/DayRosterManager.tsx
      Verify: `npx tsc --noEmit` sin errores; "Agregar"/"Vaciar" completos en team y crew en el APK.

- [ ] 6. profile.tsx — InfoRow (RUT/Teléfono/Estado/Desde) sin "...".
      En el componente `InfoRow`: cambiar la prop `numberOfLines={1}` del
      `AppText` de valor a `numberOfLines={2}` y añadir `includeFontPadding:false`
      al estilo `ir.value`. En `ir.valueWrap` ya hay `flexShrink:1` + `minWidth:0`;
      mantener. Esto permite que RUT y Teléfono envuelvan a 2ª línea en vez de
      truncar con "...". `ir.label` también recibe `includeFontPadding:false`.
      Como el RUT debe verse completo aun si 2 líneas no bastan en "Extra grande",
      añadir `adjustsFontSizeToFit` con `minimumFontScale={0.85}` SOLO al AppText
      de valor (combinado con `numberOfLines={2}`), de modo que primero envuelva y,
      si aún no cabe, encoja levemente — nunca "...".
      Files: /Users/ericksegura/Documents/backupHDD/personal/control-picking/apps/mobile/app/(tabs)/profile.tsx
      Verify: `npx tsc --noEmit` sin errores; en el APK RUT y Teléfono se ven completos (2 líneas o fuente levemente menor), sin puntos suspensivos, en escala Normal y Extra grande.

- [ ] 7. profile.tsx — pill "Anotadores" y label "Tamaño del texto" + chips.
      (a) `roleText` (pill de rol): ya tiene `includeFontPadding:false` y
      `flexShrink:1`; añadir al JSX del pill `adjustsFontSizeToFit` y
      `minimumFontScale={0.85}` (ya tiene `numberOfLines={1}`), y añadir a
      `s.rolePill` `minWidth:0` para que el `flexShrink` del texto actúe. Así
      "Anotadores" encoge en vez de truncar.
      (b) `a11yTitle` ("Tamaño del texto"): quitar `numberOfLines={1}` del JSX
      (permitir 2 líneas) y añadir `includeFontPadding:false` al estilo; el header
      (`a11yHeader`) es flex row con `gap:8`, el texto ya tiene `flexShrink:1`.
      (c) Chips de período (`periodChipText`), stats (`statLabel`) y escala
      (`a11yChipText`): añadir `includeFontPadding:false` a esos estilos; el JSX ya
      usa `numberOfLines={1} adjustsFontSizeToFit`, se mantiene (son celdas de
      ancho fijo por `flex:1`, encoger es correcto aquí). Añadir
      `minimumFontScale={0.85}` a esos tres AppText para acotar cuánto encogen.
      Files: /Users/ericksegura/Documents/backupHDD/personal/control-picking/apps/mobile/app/(tabs)/profile.tsx
      Verify: `npx tsc --noEmit` sin errores; en el APK la pill de rol y "Tamaño del texto" se ven completos en Normal y Extra grande.

- [ ] 8. Verificación de tipos y build de release Android.
      Type-check de todo el proyecto móvil y export del bundle release para
      confirmar que los cambios de estilo compilan en una build de producción.
      Files: (ninguno — solo verificación)
      Verify:
        1) `npx tsc --noEmit` desde /Users/ericksegura/Documents/backupHDD/personal/control-picking/apps/mobile → sin errores.
        2) `npm run lint` desde apps/mobile → sin errores nuevos.
        3) Build release APK con el perfil `preview` (ver skill android-build-install):
           `cd apps/mobile && export JAVA_HOME=$(/usr/libexec/java_home -v 21) && eas build --platform android --profile preview --local`
           → termina con el `.apk` generado (p. ej. guardado como
           apps/mobile/build-fundo360-preview.apk). Si no se desea build local,
           alternativa en nube: `eas build --platform android --profile preview`.
        4) Validación en teléfono físico (moto g04s): `adb install -r <apk>` →
           `Success`; abrir la app y revisar en escala Normal y Extra grande que
           ninguno de los textos del inventario (Hoy, Identificar, Pendiente,
           Parcial, Agregar, Vaciar, Anotadores, RUT, Teléfono, Tamaño del texto)
           aparezca cortado ni con "...".

## Notas / supuestos

- `AppText` hace spread de `{...rest}` al `Text` RN, así que `numberOfLines`,
  `adjustsFontSizeToFit`, `minimumFontScale` e `includeFontPadding` (vía `style`)
  se propagan tal cual (verificado en AppText.tsx). No hace falta tocar AppText.
- No se modifica `useFontScale` ni la lógica de escala; solo layout/estilos de
  texto. No se tocan queries, botones (comportamiento), apps/web ni
  supabase/functions.
- Invariantes de dominio no afectados: estos cambios son exclusivamente de
  presentación de texto (no tocan picking quantity>0, rates>0, inmutabilidad de
  settlements pagadas, RBAC ni nombres de entidad).
- `includeFontPadding` es un prop válido de `TextStyle` en RN; en iOS es no-op
  (sin efecto visual), así que es seguro aplicarlo transversalmente.
- Si tras el APK algún caso en "Extra grande" aún recorta pese a los pasos,
  el siguiente recurso (dentro del patrón ya probado) es bajar el padding
  horizontal del contenedor o añadir `flexShrink:1 + minWidth:0` en la cadena de
  contenedores de ese caso puntual, sin cambiar la decisión wrap/encoger tomada.
