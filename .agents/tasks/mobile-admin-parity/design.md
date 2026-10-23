# Diseño técnico — Paridad total del rol Administrador en la app móvil (Fundo360)

> Artefacto de **diseño**. Implementa los requisitos de
> `.agents/tasks/mobile-admin-parity/requirements.md` sobre la base del gap
> `.agents/tasks/app-web-parity/findings.md`.
> Iteración: **tercera** (revisión tras el `design-review.json` de la iteración 2
> → veredicto `CHANGES_REQUESTED`). Las correcciones a los 6 hallazgos de esa
> revisión (1 HIGH, 2 MEDIUM, 3 NIT) se detallan en §11 y están aplicadas en el
> cuerpo del documento. (La ronda anterior había resuelto otros 7 hallazgos, ya
> verificados como correctos por el revisor.)
> Worktree: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/mobile-admin-parity`.
> App móvil: `apps/mobile` (Expo SDK 54, Expo Router 6, React 19, RN 0.81).
>
> Todas las rutas de archivo en este documento son relativas al worktree salvo
> que se indique lo contrario. La raíz absoluta es:
> `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/mobile-admin-parity/`.

---

## 1. Overview

El Administrador de la móvil hoy navega con 5 tabs operativos + un panel
"Administración" (lista de tarjetas) enterrado en Perfil, y le faltan cinco
capacidades que la web sí tiene (G1 generar liquidaciones, G2 registros
históricos con corrección y filtros, G3 guías de despacho, G4 configuración
real, G5 export CSV/PDF). Este diseño introduce **navegación híbrida** (tabs de
terreno intactos + un **drawer de gestión solo-admin**) y define pantalla por
pantalla cómo portar G1–G5 reusando los patrones ya probados de la app
(`payments.tsx`, `production.tsx`, `admin/index.tsx`), la lógica compartida de
`@fundo360/shared` y las Edge Functions existentes (`settlements`,
`picking-records`, `dispatch-guides`), sin tocar backend ni los flujos de
supervisor/encargado/trabajador.

Decisión de stack (bloqueada tras aprobación): **Expo Router `Drawer`
(`expo-router/drawer`)** montado **solo** en el grupo de rutas de admin, apoyado
en sus peers nativos **`react-native-gesture-handler`** y
**`react-native-reanimated`** (hoy ausentes), más
**`@react-navigation/drawer`**. Para G5, **`expo-print`** (PDF vía HTML) y
**`expo-sharing`** + **`expo-file-system`** (CSV). Todo lo demás ya está en el
proyecto (TanStack Query, Supabase JS, Ionicons, theme propio).

El diseño asume la decisión de requisitos **D3/S3**: G1, G2, G4, G5 y la
navegación se implementan completos; **G3 se diseña completo aquí** y, por su
esfuerzo alto y por requerir el nuevo stack de drawer + export ya en el mismo
ciclo, su **implementación se difiere**: la entrada "Guías de despacho" aparece
en el drawer tras el flag `dispatch_guides` y abre una **pantalla provisional
"en preparación"** (G3-AC8). La sección 7 deja la especificación completa para
retomarla sin re-diseñar.

Este diseño **preserva todos los invariantes de dominio** (picking
`quantity > 0`, `rate > 0`, inmutabilidad de liquidación pagada, RBAC
jerárquico, nombres canónicos de entidades: `fields`, `blocks`, `products`,
`rates`, `workers`, `picking_records`, `settlements`, `payments`,
`organizations`). Ninguna pantalla nueva inserta liquidaciones desde el cliente
ni modifica una liquidación pagada; la generación delega 100% en la Edge
Function `settlements/generate` (ver §4.1 y §5).

---

## 2. Decisión de navegación (D2) — Drawer solo-admin, patrón de archivos

### 2.1 Estado actual (verificado)

- `app/_layout.tsx`: `Stack` raíz con `headerShown:false`; monta `AuthGate` que
  redirige por rol/sesión. Rutas de primer nivel: `(tabs)`, `admin`, `login`,
  `change-password`, `index`.
- `app/(tabs)/_layout.tsx`: `Tabs` flotante. `isAdmin = role ∈ {admin,
  supervisor, crew_lead}`. Oculta tabs por rol vía `href: null`. **No se toca su
  estructura**.
- `app/admin/_layout.tsx`: hoy es un **`Stack`** con 9 `Stack.Screen`
  (index, workers, fields/index, fields/[id], products, box-types,
  permission-profiles, crews, supervisors).
- Entrada actual: `app/(tabs)/profile.tsx` → `router.push('/admin')` (solo
  `role === 'admin'`).
- **No instalados**: `@react-navigation/drawer`, `react-native-gesture-handler`,
  `react-native-reanimated` (confirmado por inspección de `node_modules`).

### 2.2 Opciones evaluadas

- **A. Drawer global envolviendo `(tabs)`.** Rechazada: afectaría a
  worker/supervisor/crew_lead (que no deben ver gestión), arriesga el tab bar
  flotante y rompe NAV-AC5/NFR8.
- **B. Seguir con el `Stack` admin y solo agregar tarjetas.** Rechazada:
  mantiene la gestión enterrada (findings §5), no cumple el objetivo de menú
  hamburguesa.
- **C. Convertir el grupo `app/admin/` de `Stack` a `Drawer`, accesible por un
  botón hamburguesa en el header de los tabs (solo admin).** **Elegida.** Es
  exactamente la decisión D2 de requisitos: tabs intactos, drawer aislado al
  admin, reuso de las pantallas admin existentes como rutas del drawer.

### 2.3 Patrón de archivos concreto (opción C)

**Convierte** `app/admin/_layout.tsx` de `Stack` a `Drawer` de Expo Router. Expo
Router expone `Drawer` desde `expo-router/drawer` (wrapper de
`@react-navigation/drawer`). El layout usa `drawerContent` propio para pintar los
dos grupos ("Datos maestros" / "Administración") con sus encabezados y el
gating por capability/flag (hoy en `admin/index.tsx`).

> **Nota de verificación (hallazgo 5 de la revisión).** El subpath
> `expo-router/drawer` **no pudo verificarse en frío** porque el worktree no
> tiene `node_modules` instalado; `package.json` declara `expo-router ~6.0.24` y
> el import es plausible, pero queda como **punto de verificación en ejecución**
> (ver §8 R1, §9). **Fallback si el subpath no existe en 6.0.24:** montar el
> `Drawer` directamente con `createDrawerNavigator` de `@react-navigation/drawer`
> dentro de `app/admin/_layout.tsx`, sin cambiar el resto del diseño de rutas
> (mismas screens, mismo `drawerContent` custom, mismo gating). El cambio sería
> solo el origen del componente `Drawer`, no la arquitectura.

Archivo nuevo/convertido: `app/admin/_layout.tsx`

```tsx
import { Drawer } from 'expo-router/drawer';
import { AdminDrawerContent } from '../../src/components/admin/AdminDrawerContent';
import { colors, font } from '../../src/constants/theme';

export default function AdminLayout() {
  return (
    <Drawer
      drawerContent={(props) => <AdminDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: font.bold, fontSize: 17 },
        drawerType: 'front',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Datos maestros (reuso 1:1 de pantallas existentes) */}
      <Drawer.Screen name="index" options={{ title: 'Administración' }} />
      <Drawer.Screen name="workers" options={{ title: 'Trabajadores' }} />
      <Drawer.Screen name="fields/index" options={{ title: 'Campos' }} />
      <Drawer.Screen name="fields/[id]" options={{ title: 'Campo', drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="products" options={{ title: 'Productos y Tarifas' }} />
      <Drawer.Screen name="box-types" options={{ title: 'Tipos de Caja' }} />
      <Drawer.Screen name="crews" options={{ title: 'Cuadrillas' }} />
      <Drawer.Screen name="supervisors" options={{ title: 'Supervisores' }} />
      <Drawer.Screen name="permission-profiles" options={{ title: 'Perfiles de Permisos' }} />
      {/* Administración / transaccional (G1, G2, G4, G3) */}
      <Drawer.Screen name="settings" options={{ title: 'Configuración' }} />
      <Drawer.Screen name="settlements" options={{ title: 'Liquidaciones' }} />
      <Drawer.Screen name="records" options={{ title: 'Registros' }} />
      <Drawer.Screen name="dispatch-guides/index" options={{ title: 'Guías de despacho' }} />
      <Drawer.Screen name="dispatch-guides/[id]" options={{ title: 'Guía', drawerItemStyle: { display: 'none' } }} />
    </Drawer>
  );
}
```

Puntos clave:
- El drawer **nativo** de `@react-navigation` lista automáticamente las screens.
  Para no listar rutas de detalle (`fields/[id]`, `dispatch-guides/[id]`) se usan
  `drawerItemStyle:{display:'none'}`. El **orden, los encabezados de grupo
  ("Datos maestros"/"Administración") y el gating por capability/flag** se
  controlan en el **`drawerContent` custom** `AdminDrawerContent` (abajo), que
  es la fuente de verdad de visibilidad (NAV-AC2, NAV-AC3). Las `Drawer.Screen`
  solo registran rutas y títulos de header.
- El **guard de rol** se mantiene: cada pantalla admin ya hace su propio guard
  (ver `admin/index.tsx` que retorna `EmptyState` "Acceso restringido" si
  `role !== 'admin'`). El drawer **no** reemplaza eso; se replica el guard en un
  helper compartido (`src/components/admin/AdminGuard.tsx`, extraído del patrón
  de `admin/index.tsx`) y lo usan todas las nuevas pantallas (NAV-AC7).

Archivo nuevo: `src/components/admin/AdminDrawerContent.tsx`

- Usa `DrawerContentScrollView` de `@react-navigation/drawer`.
- Replica el arreglo de ítems de `admin/index.tsx` **verbatim** (misma lógica de
  `requiresCapability` / `requiresCrewMode` / `requiresTareFlag` /
  `requiresRbacFlag`) y lo **extiende** con los ítems transaccionales. Importante
  (hallazgo 7): `permission-profiles` se gatea **solo por `requiresRbacFlag`
  (`configurable_rbac`), sin capability** — se copia tal cual; **no** se
  introduce una capability inexistente (`permission_profiles.manage` no está en
  `CAPABILITIES`). Extensiones:
  - `settings` → requiere `CAPABILITIES.SETTINGS_MANAGE`
  - `settlements` → requiere `CAPABILITIES.SETTLEMENTS_MANAGE`
  - `records` → sin capability extra (vista admin; gating por rol)
  - `dispatch-guides/index` → `requiresFlag: 'dispatch_guides'`
- Hooks: `useAuth`, `useOrgSettings`, `useFeatureFlag` (uno por flag:
  `box_tare_control`, `configurable_rbac`, `dispatch_guides`), `usePermissions`.
  Replica el `.filter(...)` de `admin/index.tsx`.
- Render en dos secciones con título ("Datos maestros", "Administración");
  cada ítem navega con `props.navigation.navigate(routeName)` y resalta el
  activo con `props.state`.

Archivo nuevo/compartido: `src/components/admin/AdminGuard.tsx`

```tsx
// Reusa EmptyState + useAuth. Envuelve el contenido de cada pantalla admin.
// Si role !== 'admin' -> EmptyState "Acceso restringido".
```
Se refactoriza `admin/index.tsx` para usar este guard (sin cambiar su UI de
tarjetas, que se conserva como camino alternativo — NAV-AC6).

> **Separación guard vs. mutación compartida (hallazgo 4 de la revisión).**
> `AdminGuard` (solo `role === 'admin'`) acota el **acceso a las pantallas** del
> drawer, incluida `records.tsx` (G2). El hook compartido `usePickingCorrection`
> (§4.2, §10) expone **solo la mutación de corrección** y **no** decide la
> visibilidad del botón: esa decisión pertenece a cada pantalla. En
> `production.tsx` el botón se muestra con `canCorrect`
> (`admin | supervisor | crew_lead`, el valor actual verificado en el código) y
> en `records.tsx` el acceso ya está acotado a `admin` por `AdminGuard`, además
> de la regla `work_day === hoy`. Así no hay ambigüedad: el hook no arrastra la
> lógica de roles de terreno a la pantalla admin.

### 2.4 Botón hamburguesa en el header de los tabs (NAV-AC1)

En `app/(tabs)/_layout.tsx`, dentro de `screenOptions` se agrega un
`headerRight` que, **solo cuando `worker?.role === 'admin'`**, renderiza un
`TouchableOpacity` con `Ionicons name="menu"` y `onPress={() =>
router.push('/admin')}`. Para cualquier otro rol `headerRight` devuelve `null`
(el icono no se renderiza). Esto **no** cambia los tabs ni su `href` gating;
solo añade un acceso directo. El `router.push('/admin')` entra al grupo
`admin/` cuyo layout ya es el Drawer; el drawer se abre con el gesto o con su
propio botón de header una vez dentro.

> Nota de UX: entrar a `/admin` aterriza en `admin/index` (Administración) con el
> header del Drawer mostrando su botón de menú. Alternativa considerada: abrir el
> drawer directamente sin pantalla intermedia — descartada porque desde fuera del
> `NavigationContainer` del drawer no hay acceso a `openDrawer()`; el `push` a la
> ruta es el patrón estable de Expo Router.

### 2.5 Dependencias nuevas de navegación (riesgo nativo)

Agregar a `apps/mobile/package.json` con las versiones alineadas a Expo SDK 54
(usar `npx expo install` para que fije las compatibles):

- `@react-navigation/drawer`
- `react-native-gesture-handler`
- `react-native-reanimated`

Impacto: `react-native-reanimated` requiere el plugin de Babel. El archivo
`apps/mobile/babel.config.js` ya existe y (verificado) exporta una **función**,
no un objeto literal:
```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
```
El `plugins` debe añadirse **dentro del objeto que retorna la función** (no en un
objeto de nivel superior), con `'react-native-reanimated/plugin'` **al final** del
array (requisito del propio plugin):
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'], // debe ir al final
  };
};
```
`react-native-gesture-handler` requiere que la raíz de
la app esté envuelta por `GestureHandlerRootView`; se envuelve en
`app/_layout.tsx` el árbol bajo `SafeAreaProvider`. Al ser **módulos nativos**,
exigen **recompilar el dev client** (anotar en entrega; ver §9). Estos son los
mismos tres paquetes que `expo-router/drawer` necesita; sin ellos el `Drawer` no
monta.

---

## 3. Qué va en tabs vs. drawer (D1)

Se respeta la decisión D1 de requisitos **sin cambios**:

| Superficie | Ítems | Archivo |
|------------|-------|---------|
| **Tabs** (terreno) | Panel · Campo (Producción) · QR (central) · Pagos · Perfil | `app/(tabs)/*` (intactos) |
| **Drawer › Datos maestros** | Trabajadores · Campos y Paños · Productos y Tarifas · Tipos de Caja\* · Cuadrillas\* · Supervisores · Perfiles de Permisos\* | `app/admin/*` existentes (reuso) |
| **Drawer › Administración** | Configuración (G4) · Liquidaciones + Generar (G1) · Registros (G2) · Guías de despacho (G3)\* | `app/admin/{settings,settlements,records,dispatch-guides}` (nuevos) |

(\* gating por flag/capability: `box_tare_control`, `crew_mode_enabled`,
`configurable_rbac`, `dispatch_guides`.)

Justificación (de D1): "pagar" es tarea de terreno frecuente → tab; "generar"
liquidaciones es gestión periódica → drawer. **Pagos permanece como tab**
(`payments.tsx` intacto). La pantalla G1 del drawer y la tab de Pagos se enlazan
cruzado (botón "Ver/registrar pagos" en G1 → `router.push('/(tabs)/payments')`;
y desde Pagos un enlace a Liquidaciones del drawer solo visible para admin).

---

## 4. Diseño por gap

Convenciones comunes a todas las pantallas nuevas:
- Archivos `kebab-case`; componentes `PascalCase`; UI en español, código/
  comentarios en inglés (NFR2).
- Theme: `src/constants/theme` (colors/radius/spacing/font). Componentes
  reusados: `EmptyState`, `ListSkeleton`/`PaymentsSkeleton` (Skeleton),
  `AnimatedCard`, `DatePicker`, `showAlert` (`src/lib/alert`).
- Datos: `supabase` de `src/lib/supabase`; Edge Functions vía
  `supabase.functions.invoke(name, { body })`. Joins manuales (el móvil no usa
  embeds), igual que `payments.tsx`/`production.tsx`.
- **Sobre de respuesta de las Edge Functions (regla transversal — hallazgos 1 y
  2).** Verificado en `supabase/functions/_shared/response.ts`: `success(data,
  status, meta?)` responde `{ success: true, data, meta? }` y `error(code,
  message, status, details?)` responde `{ success: false, error: { code,
  message, details? } }`. Por tanto `const { data, error } =
  await supabase.functions.invoke<Envelope<T>>(...)` entrega **el sobre** en
  `data`; el payload real vive en `data.data`, y el mensaje de error del backend
  (en español) en `data.error.message`. Para respuestas no-2xx, `supabase-js`
  además setea `error` como `FunctionsHttpError`, cuyo `.message` es **genérico
  en inglés** ("Edge Function returned a non-2xx status code") — nunca el texto
  del backend. Todo contrato tipado de este documento usa este tipo y este
  patrón de lectura (ya probado en `app/change-password.tsx`, que lee
  `data?.success === false` y `data?.error?.message`):

  ```ts
  // src/lib/edge.ts (nuevo, compartido)
  export interface Envelope<T> {
    success: boolean;
    data?: T;
    error?: { code: string; message: string; details?: Record<string, unknown> };
    meta?: { page: number; total: number; limit: number };
  }

  // Patrón de consumo en cada pantalla/hook:
  const { data, error } = await supabase.functions.invoke<Envelope<T>>(name, { method, body });
  if (error || data?.success === false) {
    const msg = data?.error?.message ?? '<fallback en español>';
    showAlert('Error', msg);          // español: del backend cuando existe
    return;                            // o throw para que onError de la mutación lo capture
  }
  const payload = data!.data!;         // T, el payload interno
  ```
  Nunca se tipa `invoke<T>` con el payload interno directamente (eso tiparía el
  sobre como si fuera el payload y `payload.<campo>` sería `undefined` en
  runtime). Esta regla aplica a G1 (§4.1), a G3 (§7.2) y a cualquier otra
  invocación. Las lecturas directas a Supabase (`.from(...).select(...)`) **no**
  llevan sobre; devuelven `{ data, error }` de PostgREST como siempre.
- Gating: `useAuth` (rol), `usePermissions().has(cap)` (capability),
  `useFeatureFlag(key)` (flag). El gating de UI nunca sustituye RLS/backend
  (NFR6).
- Cálculos: `pickingPayableBase`, `pickingSubtotal`, `aggregateDispatchWeight`,
  `compareDispatch` de `@fundo360/shared` (NFR5), nunca reimplementados.
- Código nuevo **sin `any`** (NFR1): se tipan los contratos de Edge Functions y
  los `select` de Supabase con interfaces locales + type guards.
- Todas envueltas en `<AdminGuard>` (§2.3).

### 4.1 G1 — Generar liquidaciones (admin)

**Pantalla nueva:** `app/admin/settlements.tsx` (ruta `/admin/settlements`).

**Lectura (G1-AC1):** reusa el patrón de `payments.tsx`: lista todas las
liquidaciones con join manual del nombre del beneficiario (worker/crew) y los
pagos por liquidación. Para no duplicar lógica, se **extrae** la query de
`payments.tsx` a un hook compartido `src/hooks/useSettlements.ts`
(`useSettlementsList({ page, limit })`) que ambas pantallas consumen. La lista
del drawer es **paginada** (NFR4): default `limit=20`, `page` incremental con
botón "Cargar más" o scroll infinito en `FlatList`; `limit` máx 100. Orden
`generated_at` desc.

> Decisión de paginación: `payments.tsx` hoy usa `.limit(30)` sin paginar y está
> **fuera de alcance** repaginarlo (S5). La pantalla nueva del drawer sí pagina.
> Para evitar divergencia, `useSettlements.ts` acepta `{ page, limit }`; la tab
> Pagos puede migrar luego sin cambiar el hook.

**Generación (G1-AC2..AC5):**
- Botón "Generar liquidaciones" (visible solo si
  `usePermissions().has(CAPABILITIES.SETTLEMENTS_MANAGE)` — G1-AC6) abre un
  modal (patrón `RNModal` de `production.tsx`) con dos campos **Desde**/**Hasta**
  (`YYYY-MM-DD`). Entrada de fecha: `TextInput` numérico con validación de
  formato (se descarta el `DatePicker` existente porque navega día a día, poco
  ergonómico para un rango mensual). Formato validado con regex
  `^\d{4}-\d{2}-\d{2}$`.
- **Validación cliente (G1-AC2):** ambos requeridos; formato válido;
  `period_start <= period_end`. En error: `showAlert('Rango inválido', msg)` en
  español y **no** se invoca el backend.
- **Invocación (G1-AC3):** `POST` a la Edge Function `settlements/generate` con
  `{ period_start, period_end }` vía `supabase.functions.invoke` (adjunta el
  JWT; el backend hace `requireRole(['admin'])` +
  `requirePermission('settlements.manage')` y clasifica worker/crew por el modo
  capataz del campo). **No** se inserta en `settlements` desde el cliente (S2) —
  esto preserva el invariante de clasificación/`payee_type` y la inmutabilidad.
- **Lectura de la respuesta (sobre, hallazgo 1):** `functions.invoke` devuelve
  `{ data, error }` donde `data` es el **sobre** `{ success, data, error? }`. El
  payload interno (`{ settlements, total_amount, units_by_unit }`) vive en
  `data.data`, no en el nivel raíz. Se tipa como `Envelope<GenerateSettlementsResponse>`
  (ver §4.1.3) y se lee tras validar el sobre:
  ```ts
  const { data, error } = await supabase.functions.invoke<Envelope<GenerateSettlementsResponse>>(
    'settlements/generate', { method: 'POST', body: { period_start, period_end } },
  );
  if (error || data?.success === false) {              // ver "Error (G1-AC5)"
    throw new Error(data?.error?.message ?? 'No se pudieron generar las liquidaciones');
  }
  const result = data!.data!;                          // { settlements, total_amount, units_by_unit }
  ```
- **Éxito (G1-AC4) — distinguir "sin producción" de "ya liquidado" (hallazgo
  4):** `handleGenerate` **salta** (`continue`) las liquidaciones que ya existen
  para el período y las excluye de `results`; `total_amount` en cambio refleja la
  **producción global** del período. Por eso `result.settlements.length === 0`
  ocurre en **dos** casos distintos y hay que diferenciarlos con `total_amount`:
  ```ts
  if (result.settlements.length === 0) {
    if (result.total_amount > 0) {
      // Hubo producción pero las liquidaciones del período ya estaban generadas.
      showAlert('Nada nuevo que generar', 'Las liquidaciones del período ya estaban generadas.');
    } else {
      showAlert('Sin producción', 'No se encontró producción para el período.');
    }
  } else {
    showAlert('Listo', `${result.settlements.length} liquidación(es) generada(s)`);
  }
  ```
  Tras éxito (incluido el caso "nada nuevo"), `invalidateQueries` de **tres**
  claves (hallazgo 5): `['settlements']` — clave **nueva** del hook
  `useSettlements` que alimenta la lista del drawer — más `['my-balance']` y
  `['my-settlements']`, que son las claves que usa `payments.tsx`
  (`['my-balance', worker?.id]` / `['my-settlements', worker?.id]`). Las tres se
  invalidan para refrescar tanto la lista del drawer como la tab de Pagos.
- **Error (G1-AC5) — mensaje en español del backend (hallazgo 2):** para
  respuestas no-2xx `supabase-js` setea `error` como `FunctionsHttpError` con
  `.message` genérico en inglés; el mensaje español del backend (p. ej. `422`
  "period_start y period_end son requeridos", `403` de permiso/org) viene en el
  **cuerpo** `data.error.message`. Por eso el `throw` de arriba usa
  `data?.error?.message` (no `error.message`), y el `onError` de la mutación hace
  `showAlert('Error', err.message)` en español; la UI no se rompe. No hay
  inserción parcial desde cliente.

**Invariantes (G1-AC7, AC8):** no se toca `payments.tsx` (pago/estado
pending/partial/paid intactos) ni `crew.tsx` (nivel 2). G1 solo **agrega** la
generación; una liquidación pagada nunca se modifica.

#### 4.1.3 Contrato tipado de la Edge Function

```ts
interface GenerateSettlementsRequest { period_start: string; period_end: string; }
interface GeneratedSettlement { id: string; payee_type: 'worker' | 'crew'; /* ... */ }
// Payload INTERNO (el que el backend pasa a success(...)):
interface GenerateSettlementsResponse {
  settlements: GeneratedSettlement[];
  total_amount: number;                 // producción global del período (incluye lo ya liquidado)
  units_by_unit: { box: number; kg: number };
}
```
El `invoke` se tipa con el **sobre**, no con el payload interno (hallazgo 1):

```ts
const { data, error } = await supabase.functions.invoke<Envelope<GenerateSettlementsResponse>>(
  'settlements/generate', { method: 'POST', body }, // body: GenerateSettlementsRequest
);
```
`Envelope<T>` es el tipo compartido de §4 ("Sobre de respuesta…"). Un type guard
sobre `data.data` (verifica `Array.isArray(result.settlements)` y
`typeof result.total_amount === 'number'`) valida la forma del payload interno
antes de usarla (NFR1), nunca se asume `data.settlements`.

**Edge cases G1:** período sin producción (`settlements.length === 0` y
`total_amount === 0` → "Sin producción"); liquidación ya existente del período
(el backend hace `maybeSingle` + `continue` y la salta, por lo que
`settlements.length === 0` **con** `total_amount > 0` → "Nada nuevo que generar",
no "sin producción"); red caída (online-only, fuera de alcance offline — S5);
permiso restringido por perfil (botón oculto por capability y, si se forzara, el
backend responde 403 cuyo mensaje español se lee de `data.error.message` → alerta).

### 4.2 G2 — Vista de Registros (histórico, corrección, export)

**Pantalla nueva:** `app/admin/records.tsx` (ruta `/admin/records`).

**Listado (G2-AC1):** `FlatList` paginado sobre `picking_records`. Dos
alternativas de origen de datos:
- (a) Query directa a Supabase (como `production.tsx`), paginando con
  `.range()`.
- (b) Edge Function `picking-records` (GET).

Se elige **(a) query directa** porque `production.tsx` ya demuestra el patrón de
join manual (worker, block→field/product) y la corrección (G2-AC5) debe escribir
directo a `picking_records` igual que hoy; mantener lectura y escritura en el
mismo paradigma reduce superficie.

**Modelo de dos lecturas (hallazgo 3).** La web `records/page.tsx` **no pagina
en la query**: trae **todo** el rango de fechas (sin `.range()`) y pagina en
cliente dentro de `DataTable` (`pageSize=25`); por eso su resumen (`totalBoxes`/
`totalKg`/`totalAmount`/`totalRecords`) y su CSV (`handleExportCsv`, que usa el
set completo `records`) operan sobre **todo el período filtrado**, no sobre una
página. Para dar paridad real y a la vez cumplir NFR4 en móvil, la pantalla usa
**una sola lectura del período filtrado con tope duro** y pagina en cliente —el
modelo (b) de la web—, no `.range()` por página:

- **Query única del período (fuente de verdad):** `picking_records` acotado por
  los filtros (rango de fechas + `worker_id`/`block_id` si están), `.order(
  'recorded_at', { ascending: false })` y un **`limit` máximo duro de 1000 filas**
  (tope defensivo; el rango default es 7 días, muy por debajo). Esta query
  alimenta **las tres** lecturas de "todo el período": la lista, el resumen
  (G2-AC7) y el CSV (G5-AC2). `queryKey = ['records', dateFrom, dateTo, workerId,
  blockId]`.
- **Paginación en cliente para la UX (NFR4):** la `FlatList` muestra páginas de
  `pageSize = 20` (default; configurable hasta 100) **recortando el array ya
  cargado** (`records.slice(0, page*pageSize)` con "Cargar más"), igual que la
  web pagina su `DataTable`. La paginación afecta **solo** lo que se pinta, nunca
  el set que alimenta resumen/CSV.
- **Truncado:** si la query del período alcanza el tope de 1000 filas, se muestra
  un aviso en español ("Mostrando los primeros 1000 registros; acota el período o
  los filtros para exportar el total") y el CSV incluye solo esas filas. Esto
  mantiene la escritura de corrección en el mismo paradigma directo a
  `picking_records`. Resolución de nombres de worker/paño con el mismo patrón de
  `production.tsx`.

**Filtros (G2-AC2):** rango **Desde/Hasta** (default últimos 7 días, igual que
la web: `localDate(-7)`..`localDate(0)`), **trabajador** (select) y **paño**
(select). Las listas de workers/blocks se cargan con queries auxiliares (como
`records/page.tsx`). Cambiar cualquier filtro **reinicia `page` a 1** e invalida
la query (la `queryKey` incluye los filtros).

**Correcciones (G2-AC3):** el listado filtra `original_record_id IS NULL` para
el conteo "original"; las filas de corrección, si se muestran, se **marcan**
visualmente con un badge "Corrección" (color `colors.orange`), igual que la web.
Decisión: la lista principal muestra solo originales (como `production.tsx`); un
toggle opcional "ver correcciones" puede incluirlas (no bloqueante).

**Corrección auditada (G2-AC4..AC6, AC8):** reusa **exactamente** la mutación de
`production.tsx` (misma lógica, ya testeada):
- Solo si `work_day === localDate(0)` (G2-AC4); para días anteriores no se
  ofrece el botón "Corregir".
- Soft-update (G2-AC5): inserta snapshot con valores viejos +
  `original_record_id`, luego `update` in-place del original (`quantity` para
  caja; `paid_quantity_kg` 3 decimales para kg). `rate_amount_snapshot` y
  `payment_unit` nunca cambian.
- Nueva cantidad `> 0` (G2-AC6) — preserva el invariante picking `quantity > 0`;
  si no, error español y no persiste.
- **Offline (G2-AC8):** se **reusa** la rama offline de `production.tsx`
  (`useConnectivity` + `enqueue({ type: 'picking_correction', ... })`). Para no
  duplicar, se extrae la mutación a un hook compartido
  `src/hooks/usePickingCorrection.ts` que `production.tsx` y `records.tsx`
  consumen. Preserva el patrón offline existente (NFR7) sin degradarlo.
- **Invalidación de ambas pantallas (hallazgo 2 MEDIUM de la revisión).**
  Verificado: el `onSuccess` actual de la mutación en `production.tsx` invalida
  **solo** `['production']`, mientras que `records.tsx` lee con
  `queryKey = ['records', dateFrom, dateTo, workerId, blockId]`. Si el hook
  compartido se extrajera "verbatim" invalidando solo `['production']`, una
  corrección hecha **desde Registros** no refrescaría la lista, el resumen
  (G2-AC7) ni la fuente del CSV (G5-AC2), porque todos leen de `['records', …]`.
  Por tanto `usePickingCorrection` **debe invalidar ambas familias de claves** en
  su `onSuccess`:
  ```ts
  queryClient.invalidateQueries({ queryKey: ['production'] });
  queryClient.invalidateQueries({ queryKey: ['records'] });
  ```
  (Alternativa equivalente: el hook acepta un parámetro `invalidateKeys` y cada
  pantalla pasa la suya; se prefiere invalidar ambas por simplicidad.) Como la
  query única de Registros tiene tope duro de 1000 filas (ver más abajo),
  invalidar `['records']` re-lee el período filtrado completo y mantiene
  coherentes lista, resumen y CSV. `usePickingCorrection` expone **solo la
  mutación** y la invalidación; **no** decide la visibilidad del botón (ver la
  nota de §2.3, hallazgo 4).

**Resumen agregado (G2-AC7):** tarjetas de resumen (registros, total cajas,
total kg si aplica, total $) segmentando por unidad (nunca mezcla cajas/kg),
usando `pickingPayableBase`/`pickingSubtotal` de shared, idéntico criterio a
`records/page.tsx` y `production.tsx`. **Se calcula sobre el set completo del
período filtrado** (la query única de arriba), **no** sobre la página visible de
la `FlatList` — igual que la web calcula `totalBoxes`/`totalKg`/`totalAmount`/
`totalRecords` sobre `records` completo (hallazgo 3).

**Edge cases G2:** período sin registros (`EmptyState`); corrección de día no
actual (botón ausente); valor ≤ 0 (alerta); pérdida de conexión durante
corrección (encola y re-verifica al reconectar); paginación con filtro que
reduce resultados (reset a page 1).

### 4.3 G4 — Configuración de la organización

**Pantalla nueva:** `app/admin/settings.tsx` (ruta `/admin/settings`).
**Además:** en `admin/index.tsx` el módulo `settings` pasa de `available:false`
a `available:true` con `requiresCapability: CAPABILITIES.SETTINGS_MANAGE`
(G4-AC1, G4-AC7); se elimina el estado "Próximamente".

**Datos (G4-AC2):** lee/escribe **directo** sobre `organizations` vía Supabase
(sin nueva Edge Function); RLS acota a la organización del usuario. Query de
lectura equivalente a `settings/page.tsx`:
`select('id, name, logo_url, brand_primary_color, brand_secondary_color,
crew_mode_enabled, rows_enabled, role_labels').limit(1).maybeSingle()`.
Mutación: `update(patch).eq('id', org.id)`.

**Cuatro secciones (G4-AC1), paridad con `settings/page.tsx`:**

1. **Marca (G4-AC3):** nombre (requerido), URL de logo (opcional), color
   primario y secundario con **validación hex** `^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$`
   (misma `HEX_RE` que la web). Color inválido → error en español, no guarda.

   **Re-aplicación de marca tras guardar (G4-AC3) — mecanismo definitivo
   (hallazgo 1 HIGH de la revisión).** Verificado contra el código:
   `src/hooks/useBranding.ts` **NO usa React Query**; carga el branding con
   `useState`/`useEffect` y solo recarga vía
   `supabase.auth.onAuthStateChange`. **No existe** ninguna query key
   `['branding']`, por lo que `invalidateQueries(['branding'])` **no haría nada**
   (no hay observador de esa clave). Se **descarta** por completo ese camino y se
   adopta un **emisor explícito** como mecanismo **primario** (opción (a) del
   revisor):

   1. En `src/hooks/useBranding.ts` se extrae el cuerpo del `useEffect` a una
      función `load()` reutilizable y se añade una suscripción adicional a un
      evento de `DeviceEventEmitter` (`react-native`), p. ej.
      `'branding:updated'`, que re-ejecuta `load()`:
      ```ts
      // dentro del useEffect de useBranding, junto a onAuthStateChange:
      const sub = DeviceEventEmitter.addListener('branding:updated', () => load());
      // ...cleanup: sub.remove();
      ```
      Se conservan los `DEFAULT_BRANDING`, el fallback y la recarga por
      `onAuthStateChange` actuales (cambio aditivo, retrocompatible).
   2. `settings.tsx`, tras un `update(...)` exitoso sobre `organizations`, emite
      `DeviceEventEmitter.emit('branding:updated')`. Eso dispara `load()` en
      `useBranding`, que relee nombre/logo/colores de `organizations`.
   3. `ThemeProvider` (verificado: `src/theme/ThemeProvider.tsx`) consume
      `useBranding()`, llama `applyBrandColors(...)` (que muta `colors` in-place
      en `theme.ts`) y **re-monta el árbol por `key={colors.primary}`**. Por
      tanto, cuando el **dato** se refresca vía el emisor, el cambio se traduce en
      re-render de estilos y el branding queda re-aplicado de inmediato (G4-AC3),
      sin esperar a un cambio de sesión.

   Queda **eliminada** toda mención a `invalidateQueries(['branding'])` como
   mecanismo de refresco; el único camino es el emisor + re-montaje por `key`.
   Entrada de color: `TextInput` hex +
   presets (chips) tipo `BRAND_PRESETS`; el color picker nativo de la web no
   existe en RN, así que se ofrecen **presets + input hex** (equivalente
   funcional, no se pierde capacidad).
2. **Modo Capataz (G4-AC4):** `Switch` de RN sobre `crew_mode_enabled`; al
   cambiar persiste de inmediato (`update`) y refresca `useOrgSettings` para
   que, por ejemplo, "Cuadrillas" aparezca/desaparezca del drawer. **Decisión:**
   migrar `useOrgSettings` de `useState`/`useEffect` a `useQuery(['org-settings'])`
   conservando su API pública (`settings`, `roleLabel`, `crewModeEnabled`,
   `loading`) para poder `invalidateQueries(['org-settings'])` tras guardar.
   Cambio contenido y retrocompatible; se verifica a sus consumidores
   (`admin/index.tsx`, `AdminDrawerContent`).

   > **Preservar la recarga por sesión (hallazgo 3 MEDIUM de la revisión).**
   > Verificado: `useOrgSettings.ts` hoy recarga su configuración en **cada**
   > `supabase.auth.onAuthStateChange` (login/logout/refresh). La migración a
   > `useQuery` **debe conservar ese comportamiento** o se introduce una
   > regresión (NFR8): tras cerrar e iniciar sesión con otro usuario/organización
   > los settings quedarían servidos de caché del tenant anterior. Por tanto la
   > versión `useQuery` mantiene una suscripción a `onAuthStateChange` cuyo
   > callback hace
   > `queryClient.invalidateQueries({ queryKey: ['org-settings'] })` (o
   > `refetch`), replicando el `load()` por cambio de sesión actual. El `queryFn`
   > es la misma lectura de `organizations` de hoy.
   >
   > **`rows_enabled` NO forma parte de `OrgSettings` (aclaración).** Verificado:
   > el `OrgSettings` de este hook solo expone `crew_mode_enabled` y
   > `role_labels` (su `select` es `'crew_mode_enabled, role_labels'`). El toggle
   > de **Melgas** (G4-AC5, punto 3) lee/escribe `rows_enabled` por **query
   > directa** a `organizations` dentro de `settings.tsx` (y en el `select` de
   > lectura de G4 en §4.3, que sí incluye `rows_enabled`), **no** a través de
   > `useOrgSettings`. Nadie debe asumir que el toggle de Melgas pasa por este
   > hook.
3. **Melgas (G4-AC5):** `Switch` sobre `rows_enabled`; persiste de inmediato.
4. **Etiquetas de rol (G4-AC6):** cuatro `TextInput`
   (admin/supervisor/crew_lead/worker); al guardar se **sanea** igual que la web
   (solo las no vacías; vacías caen al default). **No altera RBAC** ni la
   jerarquía de roles (solo es presentación).

**Errores (G4-AC8):** fallo de guardado → `showAlert('Error', 'No se pudo
guardar')` en español; los toggles **revierten** su estado local si la escritura
falla (optimistic con rollback en `onError`).

**Edge cases G4:** org no encontrada (RLS) → estado de carga/empty; hex con
alpha (`#RRGGBBAA`) aceptado; guardar nombre vacío → bloqueado; toggle con red
caída → revierte y avisa (online-only para settings).

### 4.4 G5 — Export de informes (CSV / PDF nativo)

**Dependencias nuevas** (G5-AC7), instalar con `npx expo install`:
`expo-print`, `expo-sharing`, `expo-file-system`. Módulos nativos → recompilar
dev client (§9).

**Gating (G5-AC1, AC4):** se crea `src/hooks/useReportExport.ts` que expone:
```ts
const { enabled: canExport } = useFeatureFlag('report_export');
const { enabled: pdfDisabled } = useFeatureFlag('disable_pdf_export');
const { has } = usePermissions();
return {
  showCsv: canExport && has(CAPABILITIES.REPORTS_EXPORT),
  showPdf: canExport && !pdfDisabled && has(CAPABILITIES.REPORTS_EXPORT), // kill-switch
};
```
Replica `showPdfExport = report_export && !disable_pdf_export` de la web y añade
la capability `REPORTS_EXPORT` (G5-AC4). El **kill-switch `disable_pdf_export`**
oculta solo el PDF, no el CSV.

**CSV en Registros (G5-AC2):** botón "Exportar CSV" en `records.tsx`, visible si
`showCsv`. Exporta **el período/filtros actuales completo** (el mismo set de la
query única de §4.2, no la página visible — hallazgo 3). Genera el CSV con **las
mismas columnas y encabezados literales que la web** (`handleExportCsv` de
`records/page.tsx`), replicando su `CsvColumn<T>`:

| Encabezado (literal) | Valor |
|---|---|
| `Fecha` | `r.work_day` |
| `Trabajador` | `r.worker_name` |
| `RUT` | `r.national_id` |
| `Paño` | `r.block_name` |
| `Producto` | `r.product_name` |
| `Variedad` | `r.variety` |
| `Cantidad` | `r.base` |
| `Unidad` | `r.payment_unit === 'kg' ? 'Kilo' : 'Caja'` |
| `Peso neto (kg)` | `r.net_weight_kg === null ? '' : Number(r.net_weight_kg)` |
| `Tarifa` | `Number(r.rate_amount_snapshot)` |
| `Monto estimado` | `r.total` |
| `Tipo` | original/corrección |

El encabezado de peso es exactamente **`Peso neto (kg)`** (no "Peso neto") para
paridad literal del archivo (hallazgo 6). Se porta la utilidad `toCSV` de la web
a `src/lib/export/csv.ts` del móvil (función pura, sin DOM). El archivo se escribe
con `FileSystem.writeAsStringAsync(FileSystem.cacheDirectory +
'produccion-<from>_<to>.csv', content)` y se comparte con
`Sharing.shareAsync(uri, { mimeType: 'text/csv' })`. La query de `records.tsx`
debe traer `national_id`, `net_weight_kg`, producto/variedad (ampliar el
`select` respecto a `production.tsx`, confirmado contra el `select` de la web).

**PDF en Liquidaciones (G5-AC3):** acción PDF por liquidación en
`settlements.tsx`, visible si `showPdf`. La web usa `jsPDF`+`jspdf-autotable`
(DOM/canvas) que **no** funciona en RN. **Decisión:** generar el PDF con
`expo-print` a partir de una **plantilla HTML** que reproduce el contenido del
`SettlementPDF` web (encabezado, datos del beneficiario worker/crew, período,
tabla de registros del período, resumen por unidad, total, tabla de pagos). Se
crea `src/lib/export/settlement-pdf.ts`:
```ts
function settlementHtml(data: SettlementPdfData): string  // tabla HTML + estilos inline
async function printSettlement(data): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: settlementHtml(data) });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}
```
Los datos (breakdown + pagos) se obtienen de la Edge Function `settlements/:id`
(GET), que ya devuelve `breakdown`, `units_by_unit`, `payments`, `total_paid`,
`balance` con la clasificación worker/crew resuelta. Esta respuesta también usa
el **sobre** `{ success, data }` (hallazgo 1): se tipa
`invoke<Envelope<SettlementDetail>>` y se lee `data.data` tras validar el sobre,
con el mensaje de error en `data.error.message`. Así el PDF móvil es
**equivalente** al `SettlementPDF` web sin reimplementar cálculo.

**Sin datos (G5-AC5):** el "0 registros" del CSV se evalúa contra el **set
completo del período filtrado** (la query única de §4.2), no contra la página
visible (hallazgo 3); el PDF, contra las 0 líneas del breakdown de la
liquidación. Si está vacío, el botón se **deshabilita** (`disabled` + opacidad)
o, si se pulsa, `showAlert('Sin datos', 'No hay información para exportar')`. No
se genera archivo vacío.

**Fallos (G5-AC6):** `try/catch` alrededor de generación/compartición →
`showAlert('Error', 'No se pudo exportar')` en español; la pantalla no se
bloquea. Los archivos se escriben en `cacheDirectory` (Expo limpia caché; no se
acumulan en almacenamiento permanente).

**Contrato tipado:** `SettlementPdfData`, `CsvColumn<T>` tipados localmente; sin
`any`.

---

## 5. Invariantes de dominio y no regresión

- **Picking `quantity > 0` / `rate > 0`:** la corrección de G2 valida `> 0`
  (reuso de la mutación de `production.tsx`).
- **Liquidación `paid`⇒pagos=total, `partial`⇒<total, no modificar pagada:** G1
  no toca el flujo de pago; la lógica de estado vive en `payments.tsx` (intacta).
  Ninguna pantalla nueva actualiza una liquidación pagada.
- **Corrección de picking: solo día actual, soft-update, no tocar
  `rate_amount_snapshot`/`payment_unit`:** garantizado por el hook compartido
  `usePickingCorrection` (misma lógica actual).
- **Guía cerrada: despacho inmutable, recepción corregible:** G3 (diseñado §7)
  deshabilita campos de despacho si `status==='closed'` y permite PUT receipt; el
  backend y el trigger de inmutabilidad son la autoridad.
- **RBAC jerárquico admin>supervisor>crew_lead>worker:** el drawer y las
  pantallas nuevas son solo-admin (guard de rol + capability); el backend aplica
  `requireRole`/`requirePermission`/RLS. Las etiquetas de rol (G4) son solo
  presentación, no cambian la seguridad.
- **Nombres canónicos de entidades:** se usan tal cual `fields`, `blocks`,
  `products`, `rates`, `workers`, `picking_records`, `settlements`, `payments`,
  `organizations`, `dispatch_guides`, `dispatch_receipts`.
- **No regresión (NFR8):** `team.tsx`, `crew.tsx`, `production.tsx` (salvo la
  extracción no-funcional del hook de corrección), `payments.tsx`, el tab bar y
  la navegación de worker **no cambian de comportamiento**. El cambio en
  `(tabs)/_layout.tsx` es aditivo (`headerRight` condicionado a `role==='admin'`).
  La migración de `useOrgSettings` a `useQuery` conserva su API pública.

**Puntos de propiedad de invariantes:**
- Validación de rango de fechas G1: cliente (UX) + backend (`422` si faltan).
  Autoridad final: backend.
- Clasificación worker/crew y `payee_type` G1: **backend**
  (`settlements/generate`), nunca el cliente (S2).
- "Solo día actual" para corregir G2: cliente oculta el botón; backend/RLS/
  trigger son la barrera real.
- Inmutabilidad de guía cerrada G3: **trigger SQL**
  (`prevent_closed_guide_update`); el cliente solo deshabilita UI.
- `report_export`/`disable_pdf_export`: cliente (gating UI). El export no expone
  datos más allá de lo que RLS ya permite leer.

---

## 6. Validación de entradas (por input externo)

| Input | Pantalla | Reglas | En fallo |
|-------|----------|--------|----------|
| `period_start`,`period_end` | G1 | requeridos; `^\d{4}-\d{2}-\d{2}$`; start ≤ end | alerta ES, no llama backend. Error del backend (422/403) se lee de `data.error.message` |
| Nueva cantidad/kg | G2 | numérico `> 0`; kg a 3 decimales | alerta ES, no persiste |
| `dateFrom`,`dateTo`,`worker`,`block` | G2 filtros | fechas válidas; ids opcionales | reset a defaults/page 1 |
| nombre org | G4 Marca | requerido, trim no vacío | error inline ES, no guarda |
| color primario/secundario | G4 Marca | `HEX_RE` (#RRGGBB / #RRGGBBAA) | error inline ES, no guarda |
| `role_labels` | G4 | strings; vacías → default | saneo, guarda solo no vacías |
| `guide_number` | G3 | requerido, 1..60 | error ES (del backend) |
| `carrier` | G3 | opcional, ≤150 | error ES |
| `received_trays`,`received_weight_kg` | G3 | `>= 0` | error ES (backend) |
| `received_at` | G3 | opcional, `^\d{4}-\d{2}-\d{2}$` | error ES (backend) |
| `page`,`limit` | listados | `limit` default 20, clamp ≤100 | clamp silencioso |

Para G3, las validaciones de cliente **espejan** las de la Edge Function
`dispatch-guides` (que ya valida todo con 422/400 y mensajes en español); el
cliente valida lo barato (requeridos, formato de fecha) y delega el resto al
backend, mostrando el mensaje español de `data.error.message` (no `err.message`
del `FunctionsHttpError`, que es genérico en inglés — hallazgos 1 y 2).

---

## 7. G3 — Guías de despacho (diseño completo; implementación diferida)

**Decisión (D3/S3):** la entrada "Guías de despacho" aparece en el drawer tras
el flag `dispatch_guides`. En este ciclo abre una **pantalla provisional**
(`app/admin/dispatch-guides/index.tsx`) que muestra un `EmptyState`
("Guías de despacho — en preparación") y **no** rompe build ni navegación
(G3-AC8). El diseño siguiente queda listo para implementarse después sin
re-diseñar.

### 7.1 Rutas y archivos (al implementar)

- `app/admin/dispatch-guides/index.tsx` — lista + crear.
- `app/admin/dispatch-guides/[id].tsx` — detalle (despacho/recepción/comparación).
- Ambas registradas en `app/admin/_layout.tsx` (ya listadas en §2.3; `[id]`
  oculta del drawer).

### 7.2 Acceso a la Edge Function

Todas las operaciones van a la Edge Function `dispatch-guides`
(`supabase.functions.invoke`), que ya existe y gatea por el flag en backend
(defensa en profundidad). **Todas sus respuestas usan el sobre
`{ success, data }`** (hallazgos 1 y 2): se tipa `invoke<Envelope<T>>`, el
payload vive en `data.data` (p. ej. `GET /:id` → `data.data` es
`{ guide, receipt, comparison }`, **no** `data.guide`) y el mensaje de error en
español se lee de `data.error.message` —nunca de `error.message` del
`FunctionsHttpError`—. Rutas usadas:
- `GET /dispatch-guides?page&limit&scope&field_id&block_id&status&work_day`
  → lista paginada (G3-AC2).
- `GET /dispatch-guides/suggestion?scope&field_id&block_id&work_day`
  → prellenar bandejas/peso (G3-AC3 "Calcular desde cosecha").
- `POST /dispatch-guides` → crear (G3-AC3).
- `GET /dispatch-guides/:id` → detalle con `{ guide, receipt, comparison }`
  (G3-AC4).
- `PUT /dispatch-guides/:id` → editar despacho (solo si abierta, G3-AC5/AC7).
- `POST /dispatch-guides/:id/close` → cerrar (idempotente, G3-AC5).
- `POST /dispatch-guides/:id/reopen` → reabrir (admin, G3-AC5).
- `POST /dispatch-guides/:id/receipt` → crear recepción (G3-AC5).
- `PUT /dispatch-guides/:id/receipt` → corregir recepción (permitida con guía
  cerrada, G3-AC5/AC7).

### 7.3 Pantalla lista (G3-AC1, AC2)

`FlatList` paginado (default 20, máx 100). Por guía muestra: número, nivel
(paño/campo), campo/paño, jornada, estado (abierta/cerrada), bandejas, peso y si
el peso es preciso o aproximado (`weight_precise`/`weight_source`). Filtros:
`scope`, `field_id`, `block_id`, `status`, `work_day`. Botón flotante "Nueva
guía".

### 7.4 Crear guía (G3-AC3)

Modal: scope **block** (requiere paño) o **field** (requiere campo), jornada
(`work_day`), número de guía (requerido, ≤60), transportista (opcional, ≤150).
Botón "Calcular desde cosecha" → `GET /suggestion` → prellena
`total_trays`/`total_weight_kg` y marca el origen del peso; si el usuario edita
el peso a mano, el backend lo marca `estimated` (`weight_precise=false`). Crear →
`POST`.

### 7.5 Detalle (G3-AC4..AC7)

Tres bloques:
1. **Despacho:** bandejas, peso, número, transportista, notas. **Editable solo
   si `status === 'open'`** (G3-AC7); si cerrada, campos deshabilitados + botón
   "Reabrir" (admin). Guardar → `PUT :id`.
2. **Recepción del cliente:** `received_trays` (≥0), `received_weight_kg` (≥0),
   `received_at` (opcional `YYYY-MM-DD`), notas (≤500). Crear → `POST :id/receipt`;
   corregir → `PUT :id/receipt` (permitido aun con guía cerrada).
3. **Comparación (merma):** `trays_diff`, `weight_diff_kg`,
   `weight_shrinkage_pct` desde el `comparison` que devuelve el backend
   (calculado con `compareDispatch`). Para previews en cliente se usan
   `aggregateDispatchWeight`/`compareDispatch` de `@fundo360/shared` (NFR5).

Acciones: cerrar (`POST :id/close`), reabrir (`POST :id/reopen`). Errores del
trigger de inmutabilidad (`DISPATCH_GUIDE_CLOSED`) se traducen a mensaje claro en
español (G3-AC7).

### 7.6 Gating G3

Entrada del drawer solo con `useFeatureFlag('dispatch_guides')` activo (G3-AC1);
no hay capability `dispatch.manage` (S4), el flag es la puerta. El backend valida
rol (`admin`/`supervisor` para la mayoría; `reopen` solo `admin`) y el flag otra
vez.

---

## 8. Riesgos y supuestos

**Riesgos:**
- **R1 (alto) — Stack nativo de Drawer.** `@react-navigation/drawer` +
  `react-native-gesture-handler` + `react-native-reanimated` no están
  instalados; requieren plugin de Babel, `GestureHandlerRootView` en la raíz y
  **recompilar el dev client** (no basta reload de JS). Mitigación: instalar con
  `npx expo install` (fija versiones compatibles con SDK 54), ajustar
  `babel.config.js`, envolver la raíz, documentar la recompilación. Fallback
  temporal si la recompilación no es viable en el ciclo: mantener
  `admin/_layout.tsx` como `Stack` y presentar los grupos como secciones en
  `admin/index.tsx` (opción B) sin perder G1/G2/G4/G5 — pero incumple
  NAV-AC1/AC2; se prefiere el drawer.
- **R2 (medio) — PDF en RN.** `jsPDF` del web no sirve; se reemplaza por
  plantilla HTML + `expo-print`. Riesgo de divergencia visual con el PDF web.
  Mitigación: la plantilla HTML replica columnas y totales del `SettlementPDF`;
  la fuente de datos es la misma Edge Function `settlements/:id`.
- **R3 (medio) — `useOrgSettings` migrado a Query.** Cambiar su implementación
  interna podría afectar a consumidores. Mitigación: conservar la API pública,
  **preservar la recarga por `onAuthStateChange`** (invalidar/`refetch`
  `['org-settings']` en el callback de auth — hallazgo 3, evita servir caché del
  tenant anterior tras cambiar de sesión) y verificar `admin/index.tsx` + nuevos
  consumidores con typecheck.
- **R4 (bajo) — Export sin datos / archivos temporales.** Mitigación: botón
  deshabilitado con 0 datos, escritura en `cacheDirectory`.
- **R5 (bajo) — Deep-link a ruta admin sin ser admin.** Mitigado por
  `AdminGuard` en cada pantalla (NAV-AC7).

**Supuestos (de requisitos, reafirmados):** S1 (admin = rol tenant `admin`;
otros roles intactos), S2 (G1 delega en `settlements/generate`), S3 (G3
diferido), S4 (G3 gatea por flag, no capability), S5 (paginación solo en
listados nuevos; offline solo para corrección G2).

**Supuestos nuevos del diseño:**
- **A1.** (Verificado, corregido en iteración 3 — hallazgo 1 HIGH)
  `src/hooks/useBranding.ts` **NO usa React Query** ni existe una query key
  `['branding']`; carga con `useState`/`useEffect` y recarga por
  `onAuthStateChange`. El refresco de marca de G4-AC3 **no** se apoya en
  `invalidateQueries(['branding'])` (sería inerte); el mecanismo definitivo es un
  **emisor `DeviceEventEmitter` (`'branding:updated'`)** añadido a `useBranding`
  que re-ejecuta su `load()`, emitido por `settings.tsx` tras guardar, con
  re-montaje de estilos por `key` en `ThemeProvider` (ver §4.3).
- **A2.** La Edge Function `settlements/:id` es accesible para `admin` vía
  `functions.invoke`. Si requiere rol explícito, se ajusta la llamada; el
  contrato de respuesta ya es el documentado.
- **A3.** `expo-print`/`expo-sharing`/`expo-file-system` tienen versiones
  compatibles con Expo SDK 54; `npx expo install` las fija.

---

## 9. Verificación

**Estático:**
- `npm run -w @fundo360/mobile lint` (ESLint sobre `app/` y `src/`): sin errores
  nuevos; código nuevo sin `any` (NFR1).
- Typecheck: `npx tsc --noEmit` en `apps/mobile` (strict). Tipar contratos de
  Edge Functions y `select` de Supabase.
- **Resolución de rutas Expo Router:** `npx expo start` y confirmar que `/admin`
  monta el `Drawer`, que las nuevas rutas (`/admin/settings`,
  `/admin/settlements`, `/admin/records`, `/admin/dispatch-guides`) resuelven, y
  que `fields/[id]` y `dispatch-guides/[id]` **no** aparecen como ítems del
  drawer.

**Unit (Vitest):**
- Funciones puras nuevas: `toCSV` (columnas y escaping), `settlementHtml`
  (presencia de totales/filas), validación de rango de fechas G1, saneo de
  `role_labels` G4, validación hex G4.
- Se reusan (no se reimplementan) `pickingPayableBase`, `pickingSubtotal`,
  `aggregateDispatchWeight`, `compareDispatch`, ya cubiertos en shared.

**Integración / manual (dev client recompilado):**
- NAV: hamburguesa solo admin; drawer con dos grupos y gating por
  flag/capability; worker/supervisor/crew_lead sin drawer ni cambios; deep-link
  no-admin → "Acceso restringido".
- G1: generar rango válido/ inválido / período vacío; refresco de lista; Pagos
  intacto.
- G2: filtros, paginación, corrección día actual (online y offline encolada), no
  corregible en días previos.
- G4: guardar marca (hex válido/ inválido), toggles con rollback en error,
  etiquetas saneadas, **re-aplicación de branding** (confirmar que al guardar en
  `settings.tsx` el evento `'branding:updated'` dispara `load()` en `useBranding`
  y `ThemeProvider` re-pinta por `key` — hallazgo 1); cambiar de sesión recarga
  `useOrgSettings` (sin caché del tenant anterior — hallazgo 3); corrección desde
  Registros refresca la lista/resumen/CSV (invalidación de `['records']` —
  hallazgo 2).
- G5: CSV compartido con columnas correctas; PDF por liquidación; kill-switch
  `disable_pdf_export` oculta solo PDF; botones deshabilitados sin datos.
- No regresión: `team.tsx`, `crew.tsx`, `production.tsx`, `payments.tsx`, tab bar
  y flujo worker sin cambios de comportamiento.

**Unit vs integración:** la lógica pura (CSV, HTML, validaciones, cálculos) es
**unit**. La navegación (drawer/tabs/guards), las llamadas a Edge Functions/
Supabase, el export nativo y el flujo offline son **integración/manual**. Diseño
testeable: la lógica se aísla en hooks (`useSettlements`, `usePickingCorrection`,
`useReportExport`) y utilidades (`export/csv`, `export/settlement-pdf`) separadas
de la UI.

---

## 10. Inventario de archivos

**Nuevos:**
- `apps/mobile/app/admin/settings.tsx` (G4)
- `apps/mobile/app/admin/settlements.tsx` (G1 + G5 PDF)
- `apps/mobile/app/admin/records.tsx` (G2 + G5 CSV)
- `apps/mobile/app/admin/dispatch-guides/index.tsx` (G3 provisional; lista al implementar)
- `apps/mobile/app/admin/dispatch-guides/[id].tsx` (G3 al implementar)
- `apps/mobile/src/components/admin/AdminDrawerContent.tsx`
- `apps/mobile/src/components/admin/AdminGuard.tsx`
- `apps/mobile/src/hooks/useSettlements.ts`
- `apps/mobile/src/hooks/usePickingCorrection.ts`
- `apps/mobile/src/hooks/useReportExport.ts`
- `apps/mobile/src/lib/export/csv.ts`
- `apps/mobile/src/lib/export/settlement-pdf.ts`
- `apps/mobile/src/lib/edge.ts` — tipo compartido `Envelope<T>` para el sobre de
  las Edge Functions (hallazgos 1 y 2).

**Modificados:**
- `apps/mobile/app/admin/_layout.tsx` — `Stack` → `Drawer`.
- `apps/mobile/app/(tabs)/_layout.tsx` — `headerRight` hamburguesa (solo admin).
- `apps/mobile/app/admin/index.tsx` — usa `AdminGuard`; módulo `settings`
  `available:true` + capability; (opcional) añade ítems transaccionales como
  tarjetas para el camino alternativo.
- `apps/mobile/app/(tabs)/production.tsx` — extrae la mutación de corrección a
  `usePickingCorrection` (sin cambio funcional).
- `apps/mobile/app/(tabs)/payments.tsx` — (opcional) consume `useSettlements`;
  enlace a Liquidaciones del drawer (solo admin).
- `apps/mobile/src/hooks/useOrgSettings.ts` — migra a `useQuery` conservando API
  **y la recarga por `onAuthStateChange`** (hallazgo 3).
- `apps/mobile/src/hooks/useBranding.ts` — añade suscripción a
  `DeviceEventEmitter('branding:updated')` que re-ejecuta `load()` (hallazgo 1);
  cambio aditivo, conserva `onAuthStateChange` y defaults.
- `apps/mobile/app/_layout.tsx` — envuelve raíz en `GestureHandlerRootView`.
- `apps/mobile/babel.config.js` — plugin `react-native-reanimated/plugin`.
- `apps/mobile/package.json` — `@react-navigation/drawer`,
  `react-native-gesture-handler`, `react-native-reanimated`, `expo-print`,
  `expo-sharing`, `expo-file-system`.

**Sin cambios (no regresión):** `team.tsx`, `crew.tsx`, resto de `app/admin/*`
(workers, fields, products, box-types, crews, supervisors, permission-profiles),
Edge Functions, migraciones, `apps/web/*`.

---

## 11. Respuestas a la revisión de diseño

### Iteración 3 (revisión del `design-review.json` de la iteración 2)

Revisión: `design-review.json` → veredicto **CHANGES_REQUESTED** (1 HIGH, 2
MEDIUM, 3 NIT). Los seis hallazgos se **verificaron contra el código** del
worktree (`useBranding.ts`, `useOrgSettings.ts`, `production.tsx`,
`babel.config.js`) y se **corrigieron**; ninguno queda en backlog ni ignorado.
Todas las correcciones son de **cliente** (sin tocar backend), coherentes con
los requisitos y con los invariantes de dominio.

| # | Sev. | Resolución | Dónde quedó |
|---|------|-----------|-------------|
| 1 | HIGH | **Corregido.** Verificado: `useBranding.ts` NO usa React Query ni existe la key `['branding']`, así que `invalidateQueries(['branding'])` sería inerte. Se **elimina** ese camino y se adopta como mecanismo primario un **emisor `DeviceEventEmitter('branding:updated')`** añadido a `useBranding` (re-ejecuta `load()`), emitido por `settings.tsx` tras guardar `organizations`; `ThemeProvider` re-monta por `key={colors.primary}` tras `applyBrandColors`. Cumple G4-AC3 sin esperar cambio de sesión. | §4.3 (Marca), §8 A1, §9 (G4), §10 |
| 2 | MEDIUM | **Corregido.** Verificado: `production.tsx` invalida solo `['production']`; `records.tsx` usa `['records', …]`. `usePickingCorrection` ahora invalida **ambas** familias (`['production']` y `['records']`) en `onSuccess`, para que una corrección desde Registros refresque lista, resumen (G2-AC7) y CSV (G5-AC2). | §4.2 (Offline/Invalidación), §9 (G4) |
| 3 | MEDIUM | **Corregido.** Verificado: `useOrgSettings.ts` recarga en cada `onAuthStateChange`. La migración a `useQuery(['org-settings'])` **conserva** esa recarga (invalidar/`refetch` en el callback de auth), evitando servir caché del tenant anterior (NFR8). Se aclara además que `rows_enabled` **no** forma parte de `OrgSettings` y se lee/escribe por query directa en `settings.tsx`. | §4.3 (Modo Capataz), §5 (no regresión), §8 R3, §10 |
| 4 | NIT | **Corregido.** Se aclara que `AdminGuard` (solo `admin`) acota el acceso a las pantallas y que `usePickingCorrection` expone **solo la mutación**; la visibilidad del botón la decide cada pantalla (`production.tsx` con `canCorrect = admin\|supervisor\|crew_lead`; `records.tsx` ya acotada a `admin` por `AdminGuard` + `work_day === hoy`). | §2.3 (nota guard vs. mutación), §4.2 |
| 5 | NIT | **Corregido.** Se añade nota de que el subpath `expo-router/drawer` no se pudo verificar en frío (sin `node_modules`) y queda como punto de verificación en ejecución, con **fallback** a `createDrawerNavigator` de `@react-navigation/drawer` sin cambiar el diseño de rutas. | §2.3 (nota de verificación), §2.5, §8 R1, §9 |
| 6 | NIT | **Corregido.** Se precisa que `babel.config.js` exporta una **función** (`function (api) { … return { … } }`) y que `plugins: ['react-native-reanimated/plugin']` debe ir **dentro del objeto retornado** y **al final**; se incluye el snippet exacto. | §2.5 |

**Supuestos aún no verificables en frío (reafirmados como verificación de
ejecución, no bloqueantes):** que RLS permita al `admin` leer `settlements/:id`
vía `functions.invoke` (A2); que `expo-print`/`expo-sharing`/`expo-file-system` y
el trío de drawer tengan versión compatible con Expo SDK 54 (A3, vía
`npx expo install` + recompilación del dev client); y el comportamiento en
runtime del `Drawer` de Expo Router con `drawerContent` custom (más el subpath
del hallazgo 5). Todos están listados en §8 (Riesgos) y §9 (Verificación).

### Iteración 2 (revisión previa — 2 HIGH, 2 MEDIUM, 3 NIT)

Ronda anterior, resuelta y **verificada como correcta** por el revisor de la
iteración 2. Se conserva el registro para trazabilidad:

| # | Sev. | Resolución | Dónde quedó |
|---|------|-----------|-------------|
| 1 | HIGH | Tipo compartido `Envelope<T>` (`src/lib/edge.ts`) + regla transversal de leer `data.data` / `data.error.message`. Verificado en `_shared/response.ts`. | §4, §4.1, §4.1.3, §4.4, §7.2 |
| 2 | HIGH | El error de G1 lee el mensaje español del cuerpo `data?.error?.message` (no el `.message` genérico del `FunctionsHttpError`). | §4, §4.1, §6 |
| 3 | MEDIUM | G2 adopta **una query única del período filtrado** (tope 1000 filas) que alimenta lista, resumen y CSV; la `FlatList` pagina en cliente (20/pág, máx 100). | §4.2, §4.4 |
| 4 | MEDIUM | G1-AC4 distingue por `total_amount`: `=== 0` → "Sin producción"; `> 0` con 0 liquidaciones → "Nada nuevo que generar". | §4.1, Edge cases G1 |
| 5 | NIT | `['settlements']` es la clave nueva de `useSettlements`; `['my-balance']`/`['my-settlements']` son las de `payments.tsx`; se invalidan las tres. | §4.1 |
| 6 | NIT | CSV con encabezado literal `Peso neto (kg)` y valor `net_weight_kg === null ? '' : Number(...)`. | §4.4 (tabla CSV) |
| 7 | NIT | `AdminDrawerContent` replica `admin/index.tsx` verbatim; `permission-profiles` solo con `requiresRbacFlag`, sin capability inexistente. | §2.3 |
