# Verification — Fix de textos cortados (clipping / truncation) en mobile

## Alcance

Cambio UI-only en la app móvil Expo RN de Fundo360. Se corrige el recorte de
texto (glifos a media letra y "..." en datos) que ocurre **incluso en escala
"Normal"**, porque la causa raíz es el padding de glifo de Android
(`includeFontPadding` por defecto `true`) más, en datos de identificación,
`numberOfLines={1}` sin margen para crecer. No se toca lógica de negocio,
queries, comportamiento de botones, la escala de fuente (`useFontScale`),
`apps/web` ni `supabase/functions`. No se altera ningún invariante de dominio
(picking quantity>0, rates>0, inmutabilidad de settlements pagadas, RBAC,
nombres de entidad): son exclusivamente estilos/props de presentación de texto.

## Relación con review.json

`review.json` tiene verdict **APPROVED** y sus 3 findings son **non-blocking**,
y además pertenecen al trabajo YA COMMITEADO del motor de escala de fuente
(`useFontScale.tsx`), no a este fix de clipping (git log:
`c32e997 chore(tasks): mark text-scale-and-clipping task completed`). Estado de
cada finding:

1. *"verification.md only file changed" overstates* — este documento ahora
   describe el fix de clipping con un recuento archivo-por-archivo preciso
   (abajo), sin sobre-afirmar. Resuelto a nivel de documentación.
2. *Latent nested-Text inheritance override* — el `AppText` actual
   (`src/components/AppText.tsx`) ya NO inyecta un `fontSize` absoluto: escala
   solo el `fontSize` presente en su propio estilo y deja intacta la herencia de
   RN cuando está ausente. El archivo ya documenta esta regla en su encabezado
   ("Regla de Text anidado"). No hay doble aplicación ni override de herencia;
   finding cubierto por la implementación vigente.
3. *On-device behavior unverified* — igual que entonces, el equipo físico corre
   un APK release que no hot-reloadea el bundle nuevo; la verificación aquí es
   estática (type-check + bundle release). Se declara honestamente abajo.

## Comandos ejecutados y resultado

### 1. Gate de tipos

```
$ cd apps/mobile && npx tsc --noEmit
# (sin salida)
Exit Code: 0
```
OK — sin errores de tipos.

### 2. Gate de bundle release Android

El `main` de la app es `expo-router/entry` (package.json) — entry confirmado.
En este monorepo con workspaces, `expo-router` está hoisted a la raíz, y Metro
resuelve el entry-file desde la raíz del proyecto, por lo que el path exacto del
plan funciona tal cual:

```
$ cd apps/mobile && npx expo export:embed --eager --platform android --dev false \
    --entry-file node_modules/expo-router/entry.js \
    --bundle-output /tmp/fundo360-verify.bundle \
    --assets-dest /tmp/fundo360-verify-assets
...
Android Bundled 6712ms node_modules/expo-router/entry.js (2003 modules)
Writing bundle output to: /tmp/fundo360-verify.bundle
Copying 31 asset files
Done writing bundle output
Exit Code: 0
```
OK — bundle release generado (~10.8 MB, 2003 módulos, 31 assets). Temporales de
`/tmp` eliminados al terminar (`/tmp/fundo360-verify.bundle`,
`/tmp/fundo360-verify-assets`).

### Caveat on-device (NO verificado visualmente)

El equipo físico conectado corre el APK release instalado, que no puede
hot-reloadear el bundle JS nuevo. La corrección se sustenta en razonamiento de
layout de RN + los dos gates anteriores. Para confirmación visual: dev build
(`npx expo start --dev-client`) o un APK nuevo, revisando en escala Normal y
Extra grande que ninguno de los textos del inventario (Hoy, Identificar,
Pendiente, Parcial, Agregar, Vaciar, Anotadores, RUT, Teléfono, Tamaño del
texto) aparezca cortado ni con "...".

## Patrón aplicado

- `includeFontPadding: false` en el estilo de texto afectado: elimina el padding
  de línea que Android reserva y que recortaba el glifo final/inferior
  ("Identific[ar]", "Pendient[e]", "Parcia[l]", "Agrega[r]", "Vacia[r]",
  "Ho[y]"). En iOS es no-op, seguro aplicarlo transversalmente.
- Datos de identificación (RUT/Teléfono) nunca con "...": `numberOfLines={2}` +
  `adjustsFontSizeToFit` + `minimumFontScale={0.85}` (primero envuelve a 2ª
  línea; si aún no cabe, encoge levemente — jamás trunca).
- Pills/chips de ancho acotado: `adjustsFontSizeToFit` + `minimumFontScale={0.85}`
  para encoger en vez de truncar; `minWidth:0` donde el `flexShrink` del texto lo
  necesitaba para actuar.
- Botones y badges: dejan crecer el texto con el contenido; el corte era el
  padding de glifo, así que `includeFontPadding:false` basta.

`AppText` propaga `numberOfLines` / `adjustsFontSizeToFit` / `minimumFontScale`
vía `{...rest}` y `style` tal cual al `Text` de RN (verificado en AppText.tsx);
no se duplicó lógica.

## Resumen archivo por archivo

### apps/mobile/app/(tabs)/production.tsx — "Hoy"
- `dayDate` (el "Hoy"), `dayBtnText` ("‹ Ayer"/"Mañana ›"), `headerUnit`,
  `listTitle`, `listCount`, `cardBlock`, `cardUnit`: `+ includeFontPadding:false`.
- Decisión: **no wrap, no encoger** — el texto cabe en su contenedor
  (`dayCenter` es flex row con gap; el header y la lista tienen ancho de sobra);
  el único corte era el padding de glifo de Android. Se corrige solo eso.

### apps/mobile/app/(tabs)/register.tsx — "Identificar"
- `primaryBtnText` ("Identificar"), y por el mismo patrón `confirmBtnText`,
  `backBtnText`, `scaleBtnText`, `blockName`, `blockProduct`, `workerChipText`,
  `unitLabel`: `+ includeFontPadding:false`.
- Decisión: **no encoger** — los botones son `width:'100%'` (o crecen con el
  contenido), había espacio; el glifo final se recortaba por el padding de línea.

### apps/mobile/app/admin/settlements.tsx — badges "Pendiente"/"Parcial"
- `statusText` (la palabra del badge) + `cardPeriod`, `cardAmount` por
  consistencia de la card: `+ includeFontPadding:false`.
- Decisión: **badge crece con el contenido** (`alignSelf:'flex-start'`), sin
  `numberOfLines`; con el padding de glifo corregido la palabra se ve completa.

### apps/mobile/app/(tabs)/payments.tsx — badges "Pendiente"/"Parcial"
- `statusText` + `cardPeriod`, `cardWorker`, `cardAmount`:
  `+ includeFontPadding:false`. Mismo razonamiento que settlements.

### apps/mobile/src/components/DayRosterManager.tsx — "Agregar"/"Vaciar"
- `addBtnText` ("Agregar"), `clearBtnText` ("Vaciar"), y textos hermanos de la
  pantalla: `title`, `subtitle`, `count`, `memberName`, `memberUnits`,
  `availName`, `baseTagText`, `sheetTitle`, `emptyText`:
  `+ includeFontPadding:false`.
- Decisión: **los botones crecen con el contenido** (padding horizontal propio,
  sin ancho fijo); el corte era el padding de glifo. Cubre team.tsx y crew.tsx.

### apps/mobile/app/(tabs)/profile.tsx — RUT/Teléfono/Estado/Desde, pill, label, chips
- **InfoRow (RUT / Teléfono / Estado / Desde)**: el `AppText` de valor pasa de
  `numberOfLines={1}` a `numberOfLines={2}` + `adjustsFontSizeToFit` +
  `minimumFontScale={0.85}`; `ir.value` e `ir.label` reciben
  `includeFontPadding:false`. `ir.valueWrap` ya traía `flexShrink:1`+`minWidth:0`.
  Decisión: **wrap a 2ª línea** para datos de identificación (RUT chileno cabe en
  2 líneas) y, como red de seguridad en "Extra grande", **encoger levemente**
  (0.85) antes que cualquier "...". Nunca truncar.
- **Pill de rol "Anotadores"/"Encargado"** (`roleText`): el pill gana
  `minWidth:0` (para que el `flexShrink:1` del texto actúe) y el AppText gana
  `adjustsFontSizeToFit` + `minimumFontScale={0.85}` (ya tenía
  `numberOfLines={1}` e `includeFontPadding:false`).
  Decisión: **encoger** (hasta 0.85) en vez de romper el pill en 2 líneas.
- **"Tamaño del texto"** (`a11yTitle`): se quita `numberOfLines={1}` → `{2}`
  (permitir 2ª línea; el header tiene altura libre) y el estilo gana
  `includeFontPadding:false`.
  Decisión: **wrap a 2ª línea** (no se encoge: es un título, prefiere envolver).
- **Chips de período, stats y escala** (`periodChipText`, `statLabel`,
  `a11yChipText`): estilos ganan `includeFontPadding:false`; los AppText ganan
  `minimumFontScale={0.85}` (ya tenían `numberOfLines={1} adjustsFontSizeToFit`).
  Decisión: **encoger acotado a 0.85** — son celdas de ancho fijo (`flex:1`),
  encoger es lo correcto; el 0.85 limita cuánto para no volverse ilegible.

## Git

Cambios dejados en el working tree. Nada committeado (según instrucción).
