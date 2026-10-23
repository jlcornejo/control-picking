# Integración de balanza Bluetooth (LP7516C) — Informe final

Rama: `feature/bluetooth-scale`
Worktree: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale`
Commit: `69e2555` — `feat(picking): add bluetooth scale auto-weight capture`
Estado: **NO fusionada / NO pusheada**. Rebasada sobre `main` (`c32e997`), lista para revisión.

---

## 1. Qué se implementó

La balanza (modelo LP7516C, 60 kg, Bluetooth Classic/SPP, emparejada en Android con PIN 1234) se integra a la pantalla de registro de cosecha para **autocompletar los kilos** sin que el anotador tenga que teclearlos. El flujo del anotador sigue siendo: escanear el QR del trabajador → seleccionar paño/melga → en productos pagados por kilo, tocar "Leer balanza" y el peso estabilizado cae en el input de kilos. La captura manual **siempre** queda como respaldo.

Resumen por los seis puntos de la tarea:

1. **Flag de gating `bluetooth_scale`** (default OFF, override por tenant). Catálogo global en `platform_feature_flags` vía migración; constante en `@fundo360/shared`; consumo con `useFeatureFlag('bluetooth_scale')`. Aparece solo si: flag ON **y** Android **y** el paño es de pago por kilo manual (`kgManualApplies`).

2. **Parser puro del peso** (`parse-weight.ts`): función sin React ni imports nativos, testeable con Vitest. Recibe una línea ya terminada (el hook parte el stream por CR/LF), extrae el número en kg, normaliza coma decimal / gramos / signo, detecta overload y deriva la estabilidad (`ST`/`US`/`OL`). **Los patrones del frame son una suposición documentada** porque el fabricante no publica el formato del módulo BT; se ajustan con una edición de una línea cuando se capture el frame real (ver punto 7).

3. **Hook `useBluetoothScale`**: máquina de estados (`idle`/`connecting`/`connected`/`error`) sobre `react-native-bluetooth-classic`. El módulo nativo se carga de forma **perezosa y solo en Android**; en iOS / Expo Go / binario sin prebuild el hook queda **inerte** (`supported: false`, acciones no-op) y nunca enlaza ni toca el módulo. Resuelve el dispositivo por **nombre primero** (`L261241`) y cae al **MAC** como respaldo. Pide `BLUETOOTH_CONNECT` en Android 12+. Todos los errores se capturan y se exponen como texto en español; el hook nunca lanza hacia el componente.

4. **UI en la pantalla de registro**: botón "Leer balanza", línea de estado (conectando / conectada · N kg / error) y un **panel DEBUG** ("Ver crudo") que lista dispositivos emparejados y el stream crudo línea por línea con los CR/LF visibles (`\r` / `\n`), para afinar el parser con el hardware real.

5. **Permisos nativos** declarados en `app.json`: Android (`BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION`) e iOS (`NSBluetoothAlwaysUsageDescription`, aunque en iOS la función queda inerte).

6. **Redondeo compartido `round3`** extraído a `src/lib/scale/round3.ts` y reutilizado por el autocompletado de la balanza y por el submit del registro, para evitar divergencias en los kilos pagados.

---

## 2. Archivos tocados/creados

Rutas relativas a la raíz del repo:

Creados:
- `apps/mobile/src/hooks/useBluetoothScale.ts` — hook Android-only del ciclo de vida BT.
- `apps/mobile/src/lib/scale/parse-weight.ts` — parser puro del peso.
- `apps/mobile/src/lib/scale/round3.ts` — redondeo a 3 decimales compartido.
- `apps/mobile/src/lib/scale/__tests__/parse-weight.test.ts` — tests del parser (Vitest).
- `supabase/migrations/20261007000001_feature_flag_bluetooth_scale.sql` — catálogo del flag global.

Modificados:
- `apps/mobile/app/(tabs)/register.tsx` — botón "Leer balanza", estado, panel DEBUG, `handleReadScale`.
- `apps/mobile/app.json` — permisos Bluetooth Android + descripción iOS.
- `apps/mobile/package.json` — dependencia `react-native-bluetooth-classic@1.73.0-rc.17`.
- `package-lock.json` — lockfile.
- `packages/shared/src/constants/index.ts` — `FEATURE_FLAGS.BLUETOOTH_SCALE = 'bluetooth_scale'`.

---

## 3. Cómo compilar el build nativo Android

La función usa un módulo nativo (`react-native-bluetooth-classic`), por lo tanto **NO funciona en Expo Go ni con un reload de JS**. Cada vez que se cambia código nativo, permisos (`app.json`) o se agrega/actualiza el módulo, hay que **recompilar** el binario.

Desde `apps/mobile`:

```bash
cd apps/mobile

# 1) Regenerar los proyectos nativos con los permisos y el módulo (idempotente).
npx expo prebuild --platform android

# 2a) Build + instalación en un Android conectado por USB (desarrollo).
npx expo run:android

# 2b) O build local de APK con EAS (perfil preview), igual que el script del repo.
npm run build:android
#    equivale a: eas build --platform android --profile preview --local
```

Notas:
- Tras `prebuild`/`run:android` hay que **reinstalar el APK en el equipo**; un reload de Metro no basta para código nativo.
- Requisitos del entorno ya resueltos en este repo: JDK 21 y memoria de Gradle (`org.gradle.jvmargs` en `app.json`, plugin `expo-build-properties`).
- iOS **no** es un objetivo de esta función (Bluetooth Classic/SPP no está soportado sin MFi); la pantalla queda igual que hoy en iOS.

---

## 4. Cómo activar el flag `bluetooth_scale`

El **default es OFF** (`enabled=false`, `strategy='org_override'`). Pasos:

1. **Aplicar la migración del catálogo** (crea el flag global, idempotente):
   `supabase/migrations/20261007000001_feature_flag_bluetooth_scale.sql`
   con el flujo de migraciones del repo (p. ej. `npm run db:migrate` / `supabase db push`, según el entorno).

2. **Activarlo para un tenant** con un override por organización (recomendado, no tocar el default global):

```sql
INSERT INTO organization_feature_flags (organization_id, feature_flag_key, enabled)
VALUES ('<ORG_UUID>', 'bluetooth_scale', true)
ON CONFLICT (organization_id, feature_flag_key) DO UPDATE SET enabled = true;
```

   (Alternativa global, afecta a todos los tenants sin override — usar con cuidado:
   `UPDATE platform_feature_flags SET enabled = true WHERE key = 'bluetooth_scale';`)

3. Desde la consola Super-Admin, el flag aparece automáticamente en `/platform/feature-flags`; ahí se gestionan el default global y los overrides por tenant (la consola no crea ni renombra flags).

Revertir el catálogo (documentado, sin `down` automático):
`DELETE FROM platform_feature_flags WHERE key = 'bluetooth_scale';`

---

## 5. Cómo emparejar la balanza en Android

1. Encender la balanza y activar su Bluetooth.
2. En el equipo Android: Ajustes → Bluetooth → buscar/emparejar el dispositivo con nombre **`L261241`**.
3. Cuando pida código, ingresar el **PIN `1234`**.
4. Abrir la app (con el flag ON) y, en un paño de pago por kilo, tocar **"Leer balanza"**. El hook resuelve el dispositivo por nombre (`L261241`) y, si el nombre no coincide, cae al MAC `0F:03:25:C2:02:01` como respaldo.

(Las constantes `SCALE_DEVICE_NAME` y `SCALE_DEVICE_MAC` viven en `apps/mobile/src/hooks/useBluetoothScale.ts`.)

---

## 6. Modo DEBUG — capturar el stream crudo

Sirve para ver exactamente qué bytes/caracteres manda la balanza y así confirmar el formato real del frame antes de ajustar el parser.

1. Flag `bluetooth_scale` ON, en Android, en un paño de pago por kilo.
2. En el paso de cantidad tocar **"Ver crudo"** para abrir el panel DEBUG.
3. "Buscar emparejados" lista los dispositivos bonded; tocar uno conecta directo.
4. Pesar en la balanza: cada línea recibida aparece en el log, con los terminadores visibles (`\r`, `\n`), para identificar el patrón (status, número, unidad).
5. "Limpiar" vacía el log.

El log es un buffer acotado (máx. 200 líneas) y las líneas son seleccionables para copiarlas.

---

## 7. Dónde ajustar el parser cuando se conozca el formato real del LP7516C

Archivo: `apps/mobile/src/lib/scale/parse-weight.ts`
Lo que hay que editar es el array **`WEIGHT_PATTERNS`** (declarado en la línea **57**; las dos entradas-suposición abarcan aproximadamente las líneas **58–71**). **Gana la primera coincidencia**, así que el patrón confirmado se agrega como **PRIMERA entrada** del array.

Ejemplo concreto. Supón que el stream capturado con el panel DEBUG resulta ser algo como `wn 12.50 kg` (prefijo `wn` = net weight stable). Se antepone una entrada:

```ts
const WEIGHT_PATTERNS: WeightPattern[] = [
  {
    // CONFIRMADO LP7516C: prefijo 'wn' (neto estable) + decimal + 'kg'.
    label: 'LP7516C: wn + decimal + kg',
    re: /^wn\s+([+-]?\s*\d+(?:[.,]\d+)?)\s*(kg|g)?/i,
    extract: (m) => ({ status: 'ST', value: m[1] ?? '', unit: m[2] }),
  },
  // ...las dos entradas-suposición existentes quedan debajo como respaldo.
];
```

Detalles del contrato de `extract`:
- `value`: texto numérico crudo (puede traer signo y espacios internos); `normalizeKg` lo limpia, acepta coma decimal y divide por 1000 si la unidad es `g`.
- `status`: token crudo que `statusToStable` mapea a la tri-estado `stable` (`ST`→true, `US`/`OL`→false, ausente→null). Si el frame real no trae estado, no lo pongas y el hook usará el debounce de `STABLE_DEBOUNCE_MS`.
- `unit`: `kg` o `g`. Si el frame reporta gramos **sin** unidad, ajusta la suposición "número sin unidad = kg" en `normalizeKg` (documentado en ese archivo).

Además, en `apps/mobile/src/lib/scale/__tests__/parse-weight.test.ts` hay un test `it.skip('parses the confirmed real LP7516C frame ...')`: reemplazar `<<REPLACE WITH CAPTURED FRAME>>` por el frame real, poner el `expect` correcto y quitar el `.skip`.

---

## 8. Verificación

**Verificado:**
- **Typecheck**: `npx tsc --noEmit` en `apps/mobile` → sin errores (EXIT 0).
- **Lint**: `npx eslint "app/(tabs)/register.tsx" src/hooks/useBluetoothScale.ts src/lib/scale` → 0 errores (5 warnings `no-explicit-any` preexistentes en el código de queries/mutaciones de `register.tsx`, ajenas a esta integración).
- **Tests del parser**: `npx vitest --run src/lib/scale` en `apps/mobile` → 14 pasados, 1 skipped (el del frame real pendiente de captura).
- **Lógica de render iOS / flag OFF**: por código, `scaleApplies = scaleEnabled && Platform.OS === 'android' && kgManualApplies`. En iOS o con el flag apagado el botón "Leer balanza" y el panel DEBUG **no se renderizan** y el hook queda inerte; la pantalla queda exactamente como hoy. Verificado por lectura de la condición de render, no en ejecución sobre dispositivo.

**NO se pudo verificar (requiere el usuario con el hardware + un build nativo):**
- La **lectura real del peso** desde la balanza LP7516C. Depende del formato real del stream SPP, que no está documentado por el fabricante y que solo se confirma capturándolo con el panel DEBUG en un equipo Android emparejado. Hasta entonces, los patrones del parser son suposiciones (ver punto 7).
- Ejecución end-to-end sobre un Android físico con la balanza conectada (emparejado, permisos en runtime, autocompletado del input). Queda para el usuario tras el build nativo.
