# Gestión de Usuarios de login por el admin del cliente (P0 MVP)

Requisitos + diseño técnico. Todas las rutas y patrones citados fueron verificados leyendo el código real del repo.

---

## 1. Resumen

Hoy no existe ninguna UI que cree usuarios con login (cuentas de Supabase Auth) dentro de un tenant. Solo el **platform super-admin** crea el primer admin del cliente (`supabase/functions/organizations/index.ts` → `handleCreate`), o se hace por SQL. El objetivo es que el **admin del cliente** (tenant "super admin") pueda, desde la app (web y móvil) y **sin SQL ni intervención de plataforma**:

1. Ver una sección **"Usuarios"** NUEVA y separada de "Trabajadores".
2. **Crear** usuarios de login (roles `admin`, `supervisor`, `crew_lead`) con contraseña temporal autogenerada mostrada una sola vez y `must_change_password=true`.
3. **Listar / editar / desactivar** esos usuarios.
4. **Resetear contraseña** (regenera temporal, se muestra una vez, `must_change_password=true`).

"Trabajadores" (cosecheros con badge QR, sin login) conserva su flujo y su UI; el **único** cambio que recibe es un filtro añadido a su consulta de listado (`.is('auth_user_id', null)`) en web y móvil, necesario para que los usuarios de login creados por esta feature no aparezcan también en Trabajadores (ver §2). No cambia su lógica de crear/editar/estado ni su diseño visual.

El aislamiento multi-tenant se mantiene: `organization_id` siempre se deriva del JWT (`getOrgId`), nunca del body. Las operaciones privilegiadas (crear auth user, resetear password) requieren service-role y por tanto viven en Edge Functions gateadas por rol; el listado/edición/estado reutiliza el acceso directo a la tabla `workers` vía supabase-js protegido por RLS, exactamente como las pantallas de Trabajadores hoy.

---

## 2. Decisión de modelo de datos (cómo se representa un usuario de login)

**Decisión: un "usuario de login" ES una fila en `workers` con `auth_user_id` no nulo.** No se crea ningún concepto/tabla nueva de "users". Esto está confirmado por el código:

- `supabase/migrations/20260822000005_create_workers.sql`: `workers` tiene `role worker_role`, `auth_user_id UUID UNIQUE REFERENCES auth.users(id)`, `status entity_status`.
- `20260829000009_add_crew_lead_role.sql`: el enum `worker_role` es `('admin','supervisor','crew_lead','worker')`.
- `20260913000001_worker_must_change_password.sql`: `workers.must_change_password BOOLEAN NOT NULL DEFAULT false`.
- `20260829000006_multitenant_auth_helpers.sql`: el hook `custom_access_token_hook` lee de `workers` (por `auth_user_id`, `status='active'`) e inyecta en el JWT `app_role`, `worker_id`, `org_id`, `is_platform_admin`.
- `organizations/handleCreate` crea exactamente así el primer admin del cliente: `auth.admin.createUser(...)` → insert en `workers` con `role:'admin'`, `auth_user_id`, `must_change_password:true`, `status:'active'`.

Por tanto la distinción **"Trabajador" vs "Usuario"** es una vista lógica sobre la misma tabla:

| Vista | Filtro sobre `workers` (estado objetivo tras esta tarea) | Login |
|-------|------------------------|-------|
| **Trabajadores** (pantalla existente, con filtro añadido) | cosecheros de terreno | `auth_user_id IS NULL` (sin cuenta de login) |
| **Usuarios** (sección nueva) | gente que inicia sesión | `role IN ('admin','supervisor','crew_lead')` **y** `auth_user_id IS NOT NULL` |

> **Corrección de una suposición errónea (hallazgo de revisión §2):** se verificó en el código que **hoy** NINGUNA de las dos pantallas de "Trabajadores" aplica filtro alguno — ni `auth_user_id IS NULL` ni por `role`. `apps/web/src/app/(dashboard)/workers/page.tsx` consulta `select('id, full_name, national_id, phone, role, status, qr_badge_url, created_at').order('full_name')` sin filtro, y `apps/mobile/app/admin/workers.tsx` consulta `select('id, full_name, national_id, phone, role, status, qr_badge_url, permission_profile_id').order('full_name')` sin filtro. Es decir, ambas pantallas listan TODAS las filas de `workers` de la org (incluidos admins/supervisores/crew_leads). Por tanto, si esta feature creara usuarios de login (filas con `auth_user_id` no nulo) y no se tocara nada más, esos usuarios **aparecerían también en Trabajadores**, rompiendo la separación "Usuarios vs Trabajadores" que es el núcleo de la feature.
>
> **Decisión (Opción A — añadir el filtro):** para lograr el split limpio, esta tarea **añade** `.is('auth_user_id', null)` a la consulta de "Trabajadores" en **ambas** pantallas (web y móvil). El filtro por `auth_user_id IS NULL` es el canónico para Trabajadores (cosecheros sin cuenta de login); NO se filtra adicionalmente por `role = 'worker'`, porque hoy esas pantallas permiten crear supervisores/crew_leads sin login (filas con `auth_user_id` nulo) y filtrar por rol los ocultaría y cambiaría su comportamiento actual más de lo necesario. El criterio simple y suficiente para no mostrar cuentas de login es `auth_user_id IS NULL`. Estas dos ediciones son acotadas (una cláusula por consulta) y se reflejan en §12 como archivos tocados; reemplazan la afirmación previa (errónea) de que el filtro "ya existía".
>
> Nota sobre cuentas sin login: un `supervisor`/`crew_lead` creado desde la pantalla Trabajadores sin cuenta de login (fila con `auth_user_id` nulo) seguirá apareciendo en Trabajadores (porque su `auth_user_id` es nulo) y **no** en Usuarios (porque Usuarios exige `auth_user_id IS NOT NULL`). Esto evita mostrar cuentas "fantasma" sin credenciales en la sección de login. El filtro canónico de "Usuarios" es `auth_user_id IS NOT NULL AND role <> 'worker'`.

**Alternativa descartada:** tabla `users` separada con FK a `workers`. Se descarta porque duplicaría rol/estado/org, rompería el hook de claims (que resuelve todo desde `workers`) y el login (`auth/handleLogin` busca el `worker` por `auth_user_id`). Reusar `workers` es coherente con todo el sistema de RLS y JWT ya existente.

### `national_id` como DNI / recuperación de acceso (contexto mensaje 11 del usuario)
El usuario planteó que los trabajadores podrían entrar con su DNI (QR) y que el admin pueda recuperar accesos. El **scope autorizado de ESTA tarea** son solo usuarios de login (`admin`/`supervisor`/`crew_lead`); los cosecheros siguen SIN login (identificados por badge QR). La recuperación de acceso solicitada se cubre con la **función de reset de contraseña** (§5), que es justamente "el super admin cliente debe poder restaurar sus accesos a un valor por defecto". No se añade login por DNI a trabajadores en esta tarea (fuera de scope). `national_id` permanece como campo informativo de `workers`.

---

## 3. Guards de RBAC y aislamiento de tenant (mecanismo exacto)

### Capability
Se reutiliza el catálogo de `packages/shared/src/types/index.ts` → `CAPABILITIES`. No hay una capacidad "users.manage". **Decisión: reutilizar `CAPABILITIES.WORKERS_MANAGE` (`'workers.manage'`)** para gatear la sección Usuarios y las operaciones, por estas razones:

- Añadir un valor nuevo a `CAPABILITIES` implicaría tocar el catálogo compartido, `CAPABILITY_LABELS`, la UI de perfiles de permisos y la semántica de `requirePermission` — expansión de scope no pedida.
- Gestionar usuarios de login es gestión de personal, conceptualmente dentro de `workers.manage`.
- `requireRole(req, ['admin'])` ya es la barrera dura; la capability solo recorta dentro del rol admin cuando hay perfil restrictivo.

> Si en revisión se prefiere separar, la extensión mínima sería añadir `USERS_MANAGE: 'users.manage'` a `CAPABILITIES` + su label + default en perfiles. Se deja como backlog, no se implementa aquí.

### Guards de backend (Edge Functions) — verificados en `supabase/functions/_shared/auth.ts`
Toda operación de la feature aplica, en este orden, el patrón ya usado en `workers/handlePost`:

1. `requireRole(req, ['admin'])` → `app_role` del JWT debe ser `admin` (platform admin bypassa). Un `supervisor`/`crew_lead` recibe 403. **Esto impide que un no-admin cree admins o resetee contraseñas.**
2. `requirePermission(req, 'workers.manage')` → recorta si el perfil del usuario restringe esa capacidad.
3. `getOrgId(req)` → `organization_id` SIEMPRE del claim `org_id`. Si falta, `ORG_CONTEXT_REQUIRED` (403). **Nunca** se lee `organization_id` del body.

### Aislamiento de tenant — política vigente en `20260927000003_rbac_phase_b_rls.sql`
- Policy `admin_all_workers` (definición **vigente**, que reemplaza la original de `20260829000007_multitenant_rls.sql`): `FOR ALL USING (is_platform_admin() OR (is_admin() AND has_permission('workers.manage') AND organization_id = current_org_id()))`. La migración `20260927000003` hizo `DROP`/`CREATE` de esta policy para añadir el conjunto `has_permission('workers.manage')`. Garantiza que el acceso **de solo lectura** vía supabase-js (el listado de §4.2) solo toca filas de la propia org; y respalda las operaciones de `handlePut`/`handlePatchStatus`, que también corren con el cliente RLS del request (`getUser(req)`), acotando sus consultas y updates a la org. Nota: el conjunto extra `has_permission('workers.manage')` **no** debilita el argumento anti-degradación de §4.3 — gatea el acceso del admin de forma global (pasa o no pasa), pero no restringe qué valor de `role` puede escribir un admin que sí pasa; por eso el guard server-side de `handlePut` sigue siendo necesario.
- La **edición** (cambio de nombre/rol) y el **cambio de estado** se enrutan por las Edge `PUT /workers/:id` y `PATCH /workers/:id/status` (ver §4.3 y §4.4). No se usa supabase-js directo para estas escrituras, porque ambas necesitan guards server-side adicionales (anti-degradación a `worker`, deuda de cuadrilla) que la RLS por sí sola no provee. El aislamiento de estas rutas combina RLS (al usar el cliente del request) y, en el caso del guard anti-degradación que resuelve la fila con service client, `requireOrg`.
- Para operaciones con **service-role** (crear auth user, reset password, y la resolución de la fila objetivo en el guard anti-degradación de `handlePut`), que bypassan RLS, el aislamiento se enforcea **en código** reutilizando el helper **ya existente** `requireOrg(req, resourceOrgId)` de `_shared/auth.ts` (verificado): se resuelve el worker objetivo con el service client y se pasa `target.organization_id` a `requireOrg`. El helper ya: (a) deja pasar al platform admin, (b) devuelve `ORG_CONTEXT_REQUIRED` (403) si no hay `org_id` en el claim, y (c) devuelve `CROSS_TENANT_FORBIDDEN` (403) si `resourceOrgId` es null o no coincide. No se escribe una comparación ad-hoc; se usa `requireOrg` para no duplicar lógica (mismo patrón que `handlePatchBranding`).

**Invariante de seguridad (owner de cada capa):**
- *RLS (DB)* posee el aislamiento del **listado** (supabase-js directo) y respalda las escrituras que corren con el cliente del request.
- *Edge Function (código)* posee los guards de negocio y el aislamiento de create/reset/edición-de-rol/estado: create y reset por service-role (re-verifican `org_id` con `requireOrg`); edición y estado por rutas gateadas con `requireRole`+`requirePermission` más los guards específicos (anti-degradación con `requireOrg`; deuda de cuadrilla por RLS del request).
- *UI* solo oculta/gatea cosméticamente; nunca es la barrera.

---

## 4. Backend: crear / listar / editar / desactivar

### 4.1 Crear usuario de login — extensión mínima de `workers/handlePost`
`supabase/functions/workers/index.ts` → `handlePost` ya:
- aplica `requireRole(['admin'])` + `requirePermission('workers.manage')`;
- si vienen `email` y `password`, crea el auth user con `createServiceClient().auth.admin.createUser({ email, password, email_confirm:true })`;
- inserta en `workers` con `organization_id = getOrgId(req)`, `role`, `auth_user_id`, `qr_badge_url` (UUID).

**Faltantes a extender (mínimo, sin romper el flujo de Trabajadores):**

1. **`must_change_password`**: `handlePost` NO lo setea hoy. Añadir al insert `must_change_password: !!authUserId` (true solo cuando se creó cuenta de login). Para trabajadores sin login queda en el default `false`.
2. **Trigger canónico y validación** cuando el objetivo es un usuario de login: hoy `handlePost` entra al bloque auth **solo si `body.email && body.password`**. La UI de "Usuarios" **no enviará `password`** (lo genera el backend), por lo que con el código actual ese bloque se saltaría y crearía un worker sin login. **Decisión: el único disparador de creación de login es `body.create_login === true`** (flag explícito que la UI de "Usuarios" envía; la pantalla de Trabajadores NO lo envía, así su flujo queda intacto).

   **El branch legacy `email && password` se ELIMINA.** Verificado contra el repo: **ningún llamador invoca el POST de la Edge Function `workers`**. La pantalla web de Trabajadores (`apps/web/src/app/(dashboard)/workers/page.tsx`) crea trabajadores con **insert directo de supabase-js** (`supabase.from('workers').insert(...)`), nunca vía `handlePost`; la pantalla móvil hace lo propio. No existe ningún `functions.invoke('workers', { method: 'POST' })` en el código. Por tanto el fork "si existe un llamador" es decidible hoy (no existe) y se resuelve eliminando el camino legacy: queda **una sola** vía de creación de auth user, disparada por `create_login === true` con password generada server-side. Esto evita además dos caminos con semánticas de password distintas (cliente vs servidor). La condición `if (body.email && body.password)` se **reemplaza** por `if (body.create_login === true)`.

   Lógica ramificada resultante:
   - Si `body.create_login === true` → es un usuario de login: exigir `email` válido, generar la contraseña server-side (`generateTempPassword()`) y crear el auth user. No se lee `password` del body.
   - Si `body.create_login` es falsy → comportamiento actual de Trabajadores (sin auth user). El único requisito duro es no romper ese flujo (que hoy ni siquiera pasa por aquí al usar insert directo, pero se preserva por si en el futuro se enruta por la Edge).

   Reglas de validación para `create_login === true`:
   - `email`: requerido, formato válido (regex `EMAIL_RE` idéntico al de `organizations/index.ts`), `trim().toLowerCase()`. Ausente/ inválido → `VALIDATION_ERROR` (422).
   - `role`: debe ser `admin|supervisor|crew_lead` (rechazar `worker` con login por esta vía con `VALIDATION_ERROR` 422). Nota: `handlePost` ya valida que `role ∈ {admin,supervisor,crew_lead,worker}`; se añade el recorte extra que excluye `worker` cuando `create_login` es true.
   - `password`: **ignorar cualquier password del body**; generar con `generateTempPassword()` (ver §6). Esto difiere del platform-admin (que tipea la password) a propósito: el scope pide **autogenerada**.

   **Campos del insert cuando `create_login === true`** (resuelve la ambigüedad de los campos que `handlePost` setea hoy — `national_id`, `phone`, `permission_profile_id`, `qr_badge_url`):
   - `national_id`: opcional passthrough. La UI de "Usuarios" NO lo envía (no es un cosechero con DNI/badge), así que será `body.national_id || null` → `null` en la práctica. Se mantiene passthrough para no divergir del insert existente.
   - `phone`: opcional passthrough, `body.phone || null`. La UI de "Usuarios" no lo envía → `null`.
   - `permission_profile_id`: opcional passthrough, `body.permission_profile_id || null`. Permite que un admin asigne un perfil de permisos restrictivo al crear el usuario; si la UI no lo manda, queda `null` (capacidades completas del rol).
   - `qr_badge_url`: **se sigue generando** (`crypto.randomUUID()`) igual que hoy, de forma incondicional. Decisión: mantenerlo uniforme con el insert existente aunque un usuario de login no use badge QR; es inocuo (un UUID opaco) y evita ramificar el insert. El filtro canónico de "Usuarios" (`auth_user_id IS NOT NULL AND role <> 'worker'`) no depende de `qr_badge_url`; y, una vez añadido el filtro `.is('auth_user_id', null)` a las pantallas de Trabajadores (ver §2, Opción A), un usuario de login nunca aparece en Trabajadores (porque su `auth_user_id` NO es nulo) aunque tenga `qr_badge_url`.
   - `status`: **se omite del insert a propósito**; se apoya en el default de la columna `entity_status` (`'active'`), tal como hace el `handlePost` actual. Esto es **requerido** porque `custom_access_token_hook` solo inyecta `app_role/worker_id/org_id` para filas con `status='active'`; un usuario creado con otro estado no obtendría claims y no podría operar. No "limpiar"/explicitar este campo a otro valor.
   - `must_change_password`: `true` (ver punto 1).
3. **Respuesta**: devolver `{ worker, temp_password }` **solo** en la respuesta de creación (una vez). `temp_password` nunca se persiste ni se loguea.

**Decisión de dónde generar la contraseña:** server-side en la Edge Function (no en el cliente), para que la política de generación sea única y auditable y el cliente no pueda forzar passwords débiles. `organizations/handleCreate` hoy recibe la password del cliente (platform admin); aquí **cambia** a autogenerada por requerimiento explícito.

**Edge case — fallo parcial (auth user creado, insert en workers falla):** replicar la compensación best-effort de `handleCreate`: `await svc.auth.admin.deleteUser(authUserId).catch(()=>{})` antes de devolver error, para no dejar cuentas de Auth huérfanas. `handlePost` hoy NO compensa (devuelve error dejando el auth user). Añadir la compensación cuando `authUserId` fue creado en esta request.

**Edge case — email ya registrado:** `createUser` devuelve error; mapear a 409 con mensaje "El email ya está en uso" (patrón `conflict` de `handleCreate`). No se filtra si el email existe en otra org (Supabase Auth es global); el mensaje es genérico.

### 4.2 Listar — supabase-js directo (como Trabajadores)
La sección "Usuarios" lee directo de `workers` (RLS acota a la org), igual que `workers/page.tsx` y `admin/workers.tsx`:

```ts
supabase.from('workers')
  .select('id, full_name, role, status, auth_user_id, must_change_password, created_at')
  .not('auth_user_id', 'is', null)
  .neq('role', 'worker')
  .order('full_name')
```
No se expone `national_id`/`phone` en la tabla de Usuarios salvo que se quieran como columnas opcionales (se mantiene mínimo: nombre, rol, estado). **No** se selecciona ningún secreto. Nunca se trae el email desde `workers` (no existe ahí); el email vive en `auth.users` y **no** se muestra en el listado (ver §9 edge case "email no visible").

**Edición requerida en las dos pantallas de "Trabajadores" (complemento al listado de "Usuarios"):** para que el split sea limpio (ver §2, Opción A), se añade `.is('auth_user_id', null)` a la consulta de listado de Trabajadores, de modo que ya no muestre cuentas de login:
- `apps/web/src/app/(dashboard)/workers/page.tsx` — la query del `useQuery(['workers'])` pasa de `supabase.from('workers').select('id, full_name, national_id, phone, role, status, qr_badge_url, created_at').order('full_name')` a `...select(...).is('auth_user_id', null).order('full_name')`. Nada más cambia en la pantalla.
- `apps/mobile/app/admin/workers.tsx` — la query del `useQuery(['admin-workers'])` pasa de `supabase.from('workers').select('id, full_name, national_id, phone, role, status, qr_badge_url, permission_profile_id').order('full_name')` a `...select(...).is('auth_user_id', null).order('full_name')`. Nada más cambia.

Es un cambio aditivo de una sola cláusula por archivo; no altera columnas, formularios, mutaciones ni estilos de esas pantallas. (La RLS ya acota ambas consultas a la org; el filtro solo excluye las filas con cuenta de login.)

### 4.3 Editar — Edge `PUT /workers/:id` con guard anti-degradación (server-side)
Editar nombre y rol. Dos caminos existen en el repo:
- supabase-js directo `update({ full_name, role }).eq('id', ...)` (RLS lo permite para admin de la org), como hace `workers/page.tsx`.
- la Edge `PUT /workers/:id` (`handlePut`, con `requireRole`+`requirePermission`).

**Problema de seguridad detectado (no se puede usar supabase-js directo para el rol):** `updateLoginUserSchema` restringe `role` a los tres roles de login **solo en el cliente**. La RLS `admin_all_workers` (definición vigente en `20260927000003_rbac_phase_b_rls.sql`: `is_platform_admin() OR (is_admin() AND has_permission('workers.manage') AND organization_id = current_org_id())`) permite a un admin de la org (con la capacidad `workers.manage`) actualizar **cualquier** fila de `workers` a **cualquier** valor, incluido `role='worker'` — el conjunto `has_permission('workers.manage')` gatea el acceso pero no restringe el valor de `role` escrito. Un usuario de login degradado a `role='worker'` manteniendo su `auth_user_id` desaparecería de la lista de "Usuarios" (filtro `role <> 'worker'`) **pero seguiría teniendo login funcional** y un JWT con `app_role='worker'`: una cuenta de login huérfana invisible en ambas pantallas. La validación Zod del cliente no es barrera (el diseño insiste "la UI nunca es la barrera").

**Decisión: el cambio de rol se enruta por la Edge `PUT /workers/:id` (`handlePut`), y `handlePut` se extiende con un guard server-side que rechaza degradar a `worker` un usuario con login.** Concretamente, antes de aplicar el update de `role`, cuando `body.role === 'worker'` se resuelve la fila objetivo con el **service client** (`svc.from('workers').select('auth_user_id, organization_id').eq('id', workerId).single()`), se aplica `requireOrg(req, target.organization_id)` (aislamiento de tenant, mismo helper que §5) y, si `target.auth_user_id` no es null, se devuelve `VALIDATION_ERROR` 422 ("No se puede convertir un usuario con acceso en trabajador; desactívelo en su lugar"). Esto cierra el hueco tanto para la pantalla de Trabajadores como para la de Usuarios, porque la barrera vive en el servidor y no en el enum de Zod. (Nota: no se usa un trigger de DB porque implicaría una migración nueva — ver §12 "sin migraciones"; el guard en `handlePut` es suficiente dado que ninguna otra vía escribe `role` sobre usuarios de login.)

**Qué usa la UI de "Usuarios":**
- Nombre y rol → `supabase.functions.invoke('workers/'+id, { method:'PUT', body:{ full_name, role } })`. El `ROLE_OPTIONS` del formulario **no ofrece `worker`**, de modo que el guard server-side solo se dispara ante manipulación directa; es defensa en profundidad, no la única barrera.
- La pantalla de Trabajadores existente sigue usando su update directo para campos que no son el rol; su flujo no cambia salvo que, si alguna vez intentara fijar `role='worker'` sobre una fila con `auth_user_id`, ahora debería pasar por `handlePut` para quedar protegida. Como esa pantalla no gestiona usuarios de login, no se ve afectada en la práctica.

El cambio de **email** NO se soporta en esta tarea (el email vive en Auth; cambiarlo requiere `auth.admin.updateUserById` y flujo de confirmación) → fuera de scope, documentado en §10.

### 4.4 Desactivar — Edge `PATCH /workers/:id/status` (guard de deuda pendiente)
Existen dos caminos: `update({ status })` vía supabase-js directo (patrón de `workers/page.tsx` `toggleStatus`) o la Edge `PATCH /workers/:id/status` (`handlePatchStatus`, que bloquea la desactivación si hay liquidaciones pendientes con `WORKER_HAS_PENDING_DEBT`).

**Corrección sobre la suposición "los usuarios de login no son payees":** es **falsa** para `crew_lead`. Verificado en el modelo de liquidaciones (`20260829000012_settlement_payee_type.sql` + `20260829000010_create_crews.sql`): una liquidación de nivel 1 es `payee_type='crew'` y referencia `crew_id` (la cuadrilla **a nombre del encargado**); el encargado es `crews.crew_lead_id`, un worker con rol `crew_lead` — exactamente un usuario de login de esta feature. Por tanto desactivar un `crew_lead` **sí** puede dejar deuda de cosecha pendiente, y saltarse el guard con un `update` directo reproduciría el bug que la pantalla de Trabajadores evita.

**Alineación del guard chain en `handlePatchStatus` (hallazgo de revisión §3):** se verificó que hoy `handlePatchStatus` (y `handleRegenerateBadge`) solo llaman `requireRole(req, ['admin'])` — **no** aplican `requirePermission('workers.manage')`, a diferencia de `handlePost`/`handlePut`. Como §3 afirma que "toda operación de la feature aplica `requireRole` + `requirePermission` + `getOrgId`", esto es una inconsistencia. **Decisión: añadir `requirePermission(req, 'workers.manage')` a `handlePatchStatus`**, inmediatamente después del `requireRole(['admin'])`, para que la desactivación de usuarios de login respete el mismo guard chain que crear/editar. El impacto es acotado y correcto: solo recorta dentro del rol admin cuando el perfil restringe `workers.manage`; un admin con capacidades completas no se ve afectado. (No se toca `handleRegenerateBadge`, que es regeneración de badge QR de Trabajadores y queda fuera de scope.)

**Decisión: la desactivación de usuarios de login se enruta por la Edge `PATCH /workers/:id/status`** (no por supabase-js directo), para heredar el guard de deuda. Efecto del soft-deactivate (`entity_status` es `active|inactive`): al quedar `status='inactive'`, el `custom_access_token_hook` ya **no** inyecta `app_role/org_id` (filtra por `status='active'`), por lo que el usuario pierde acceso efectivo en el siguiente refresh de token. No se hace hard-delete (coherente con el modelo).

**Extensión necesaria de `handlePatchStatus` (gap del guard actual):** hoy el chequeo de deuda es `settlements WHERE worker_id = :id AND status IN ('pending','partial')`. Eso cubre las liquidaciones **de nivel trabajador** (incluidas las de nivel 2 donde un `crew_lead` cobra como miembro), pero **NO** cubre las liquidaciones **de cuadrilla** (`payee_type='crew'`), que están keyeadas por `crew_id`, no por `worker_id`. Para cerrar el gap al desactivar un `crew_lead`, `handlePatchStatus` añade, cuando `status='inactive'`, un segundo chequeo: resolver las cuadrillas lideradas por el worker (`crews WHERE crew_lead_id = :id`) y contar `settlements WHERE payee_type='crew' AND crew_id IN (...) AND status IN ('pending','partial')`; si hay > 0, devolver el mismo `WORKER_HAS_PENDING_DEBT` 409 con un mensaje acorde ("La cuadrilla a cargo tiene liquidaciones pendientes de pago"). Este chequeo extra es inocuo para `admin`/`supervisor` (no lideran cuadrillas → 0 filas) y para cualquier worker que no sea crew_lead. Se mantiene dentro de `handlePatchStatus` para que tanto la pantalla de Trabajadores como la de Usuarios queden protegidas por la misma barrera.

> Nota de aislamiento: `handlePatchStatus` corre con el `supabase` del `getUser(req)` (anon + RLS), por lo que las consultas de `settlements`/`crews` ya están acotadas a la org del admin por RLS; no requiere service client ni `requireOrg` adicional.

---

## 5. Backend: reset de contraseña por el admin del cliente (operación nueva, mínima, RLS-safe)

**No existe** endpoint de reset iniciado por admin. Verificado: `auth/index.ts` solo tiene `login`, `refresh`, `logout`, `change-password` (y `change-password` cambia la contraseña del **propio** usuario autenticado, no sirve para que el admin resetee a otro). `workers/index.ts` no tiene reset.

**Decisión: añadir una sub-ruta nueva en la función `workers`**, no en `auth`, porque es gestión de personal del tenant y así reutiliza intactos `requireRole`/`requirePermission`/`getOrgId` del mismo módulo. La función `auth` corre con anon key y maneja sesiones propias; mezclar ahí un reset administrativo cross-user sería incoherente.

### Endpoint
```
POST /workers/:id/reset-password
```
Registrado en el router de `workers/index.ts` junto a los `subResource` existentes. El router ya parsea `const subResource = pathParts[2] || null` (hoy comentado `// "status" or "badge"`) y despacha los bloques `PATCH .../status` y `POST .../badge` **antes** del `switch(req.method)`. La nueva ruta se añade en ese mismo bloque de guards, antes del `switch`: `if (req.method==='POST' && workerId && subResource==='reset-password') return await handleResetPassword(req, supabase, workerId);`. Actualizar el comentario del router a `// "status" | "badge" | "reset-password"`. Importante: debe colocarse antes del `switch`, porque dentro del `case 'POST'` se invoca `handlePost` (crear worker) y un POST con `subResource` no debe caer ahí.

### Lógica de `handleResetPassword(req, supabase, workerId)`
1. `requireRole(req, ['admin'])` → 403 si no es admin.
2. `requirePermission(req, 'workers.manage')` → 403 si el perfil lo restringe.
3. `const orgId = getOrgId(req)`; si falta → `ORG_CONTEXT_REQUIRED` (403).
4. Resolver el worker objetivo con **service client** (necesario para leer `auth_user_id` y actuar sobre Auth):
   ```ts
   const svc = createServiceClient();
   const { data: target } = await svc.from('workers')
     .select('id, organization_id, auth_user_id, role').eq('id', workerId).single();
   ```
   - Si no existe → `NOT_FOUND` (404).
   - **Aislamiento de tenant (barrera de código):** `const orgError = requireOrg(req, target.organization_id); if (orgError) return orgError;`. Se usa el helper existente (no una comparación manual) porque el service client bypassa RLS; devuelve `CROSS_TENANT_FORBIDDEN` (403) si la fila es de otra org y `ORG_CONTEXT_REQUIRED` (403) si falta el claim. Dado que `requireOrg` ya cubre el chequeo de `org_id`, el paso 3 (`getOrgId`) queda solo para tener el valor disponible; no es necesario duplicar el guard de ausencia.
   - Si `target.auth_user_id` es null → `VALIDATION_ERROR` "El usuario no tiene cuenta de acceso" (422). (No se puede resetear a un cosechero sin login.)
   - (Opcional defensivo) si `target.role === 'worker'` → mismo 422.
5. Generar `tempPassword = generateTempPassword()`.
6. `await svc.auth.admin.updateUserById(target.auth_user_id, { password: tempPassword })` → si falla, `VALIDATION_ERROR` 400 con el mensaje del provider.
7. `await svc.from('workers').update({ must_change_password: true }).eq('id', workerId)`.
8. Responder `success({ temp_password: tempPassword }, 200)` → mostrada **una vez** en la UI.

El `updateUserById` del Admin API es el mismo mecanismo que ya usa `auth/handleChangePassword`, confirmando que está disponible en el runtime Edge.

**No exponer a no-admins:** garantizado por `requireRole(['admin'])` + RLS; un supervisor/crew_lead nunca llega al paso 5.

**Logging:** nada de passwords ni emails en logs. La operación NO escribe en `platform_audit_log` (ese log es de acciones de plataforma; el actor aquí es un admin de tenant, no un platform admin). No se añade logging de secretos.

---

## 6. `packages/shared`: tipos y Zod a añadir

Archivo `packages/shared/src/validation/index.ts` (donde ya vive `createWorkerSchema` y se importa `WorkerRole`, `ALL_CAPABILITIES`). Añadir:

```ts
/**
 * Roles que pueden tener login (excluye 'worker', que es cosechero sin acceso).
 * Se declaran como tupla de literales de string `as const` para que `z.enum`
 * los acepte directamente (ver nota de precedente abajo).
 */
export const LOGIN_USER_ROLES = ['admin', 'supervisor', 'crew_lead'] as const;

/** Crear usuario de login (sección "Usuarios"). La contraseña la genera el backend. */
export const createLoginUserSchema = z.object({
  full_name: z.string().min(1, 'Nombre completo es requerido').max(150),
  email: z.string().email('Email inválido').max(255),
  role: z.enum(LOGIN_USER_ROLES, {
    required_error: 'Seleccione un rol',
  }),
});
export type CreateLoginUserInput = z.infer<typeof createLoginUserSchema>;

/** Editar usuario de login (solo nombre y rol; email no es editable en esta fase). */
export const updateLoginUserSchema = z.object({
  full_name: z.string().min(1).max(150).optional(),
  role: z.enum(LOGIN_USER_ROLES).optional(),
});
```

**Nota de precedente (hallazgo de revisión §6):** `z.enum` exige una tupla de **literales** de string (`[string, ...string[]]`); no acepta miembros de un enum de TS sin ensanchar el tipo. El repo lo resuelve de dos formas — `createPermissionProfileSchema` castea (`z.enum(ALL_CAPABILITIES as [string, ...string[]])`) y `updateOrganizationSchema` usa literales directos (`z.enum(['trial','active','suspended','cancelled'])`). La versión previa de este diseño pasaba `z.enum([WorkerRole.ADMIN, WorkerRole.SUPERVISOR, WorkerRole.CREW_LEAD])`, que **fallaría `tsc` strict** porque los miembros del enum no se ensanchan a la tupla de literales esperada. Se corrige usando literales (`LOGIN_USER_ROLES = ['admin','supervisor','crew_lead'] as const`), lo que además mantiene una sola fuente de verdad para los tres roles de login (reutilizada por ambos schemas). Los literales coinciden exactamente con los valores de `WorkerRole` (`ADMIN='admin'`, `SUPERVISOR='supervisor'`, `CREW_LEAD='crew_lead'`), verificado en `packages/shared/src/types/index.ts`. No se añade capability nueva ni enum nuevo (ver §3).

**Generador de contraseña temporal** (backend, Deno Edge): nuevo helper `supabase/functions/_shared/password.ts`.

**Contexto de política (verificado):** `supabase/config.toml` tiene `minimum_password_length = 6` y `password_requirements = ""` (sin exigencia de clases) en **local**. La política del proyecto **remoto** (Supabase Cloud) es configuración de proyecto, **no** está en el repo y puede diferir (podría exigir `lower_upper_letters_digits` o incluso símbolos). Si el generador pudiera emitir, p. ej., todo minúsculas, `auth.admin.createUser` / `updateUserById` podría rechazarlo en runtime de forma no determinista. **Por tanto el generador DEBE garantizar clases de caracteres por construcción**, independientemente de la política configurada.

**Especificación concreta (no por comentarios):**
- Longitud: `len = 14` por defecto (≥ 12; margen cómodo sobre cualquier `minimum_password_length` razonable).
- Alfabetos sin caracteres ambiguos (para dictado verbal admin→usuario): `lower = 'abcdefghijkmnpqrstuvwxyz'` (sin `l`, `o`), `upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'` (sin `I`, `O`), `digits = '23456789'` (sin `0`, `1`), `symbols = '@#$%*+?'` (sin ambiguos ni problemáticos de shell/URL).
- **Garantía de clases:** sembrar la contraseña con **al menos 1 carácter de cada una de las 4 clases** (lower, upper, digit, symbol). Incluir un símbolo satisface también la política más estricta (`lower_upper_letters_digits_symbols`); como los símbolos son un superconjunto de lo que piden las políticas menos estrictas, la salida es válida bajo **cualquiera** de los tres `password_requirements` soportados.
- Rellenar el resto (`len - 4`) con selección uniforme sobre la unión de los 4 alfabetos.
- **Aleatoriedad:** toda selección de índices usa `crypto.getRandomValues(new Uint32Array(...))` con rechazo de módulo (evitar sesgo de `% n`). NUNCA `Math.random()`.
- **Shuffle final:** Fisher–Yates sobre el arreglo de caracteres, con índices también de `crypto.getRandomValues`, para que las 4 posiciones sembradas no queden siempre al inicio.

```ts
// supabase/functions/_shared/password.ts
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '@#$%*+?';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** Índice uniforme en [0, n) sin sesgo de módulo, usando CSPRNG. */
function randIndex(n: number): number {
  const max = Math.floor(0xffffffff / n) * n; // umbral de rechazo
  const buf = new Uint32Array(1);
  let x: number;
  do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= max);
  return x % n;
}

function pick(alphabet: string): string { return alphabet[randIndex(alphabet.length)]; }

/**
 * Contraseña temporal fuerte: longitud >= 12 (default 14), con al menos un
 * carácter de cada clase (minúscula, mayúscula, dígito, símbolo), alfabeto sin
 * caracteres ambiguos, mezclada con Fisher-Yates sobre CSPRNG.
 */
export function generateTempPassword(len = 14): string {
  if (len < 12) len = 12;
  const chars: string[] = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  for (let i = chars.length; i < len; i++) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) { // Fisher-Yates
    const j = randIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
```

El helper se ubica en `_shared/password.ts` para poder reusarlo desde `organizations/handleCreate` en el futuro (no obligatorio en esta tarea). Es importable por cualquier Edge Function.

---

## 7. UI Web (`apps/web/src/app/(dashboard)/usuarios/`)

### Placement / navegación
- Nueva ruta: `apps/web/src/app/(dashboard)/usuarios/page.tsx`.
- Añadir entrada en `apps/web/src/components/ui/Sidebar.tsx`. **Decisión de icono:** `UserCog` ya está en uso por "Supervisores" (verificado en el import actual: `LayoutDashboard, MapPin, Package, Users, FileText, ClipboardList, Wallet, UserCog, Truck, Send, Settings, Menu, X`), así que para distinguir "Usuarios" se usa `ShieldCheck` de lucide-react y se **añade** al import existente (hoy no está importado). Entrada: `{ href: '/usuarios', label: 'Usuarios', icon: ShieldCheck }`.
- **Dónde y con qué guard:** el `navLinks` actual tiene dos ramas: `role === 'crew_lead'` (solo "Mi Cuadrilla") y la rama de gestión (admin/supervisor). Dentro de esa segunda rama, `/settings` ya se condiciona con `...(role === 'admin' ? [...] : [])`. "Usuarios" se agrega con el **mismo** patrón `...(role === 'admin' ? [{ href: '/usuarios', label: 'Usuarios', icon: ShieldCheck }] : [])`, ubicado junto a "Supervisores".
  - **Atención (guards distintos en entradas adyacentes):** a diferencia de "Supervisores" — que en el `Sidebar.tsx` actual **NO** está gateado por rol y es visible para `supervisor` (está en la rama de gestión compartida) — "Usuarios" **sí** va envuelto en `role === 'admin'`, de modo que un `supervisor` ve "Supervisores" pero **no** "Usuarios". Las dos entradas quedan contiguas pero con guards diferentes; es fácil introducir un copy-paste erróneo que las iguale, así que el `...(role === 'admin' ? [...] : [])` de "Usuarios" debe mantenerse explícito y separado.
  - El gating duro ya lo hace `(dashboard)/layout.tsx` (solo `admin` entra al dashboard; `crew_lead` queda confinado a `/crew`; supervisor/worker no entran); el ocultamiento del link es solo cosmético.
- Label en español: **"Usuarios"**.

### Estructura (mirror de `workers/page.tsx` + patrón de credenciales de `platform/page.tsx`)
- `useQuery(['login-users'])` con el select de §4.2 (`DataTable`, `StatusBadge`, `PageHeader`, `ActionButton`, `Modal`, `FormField`, `useToast`, `PageTransition` — todos ya usados por `workers/page.tsx`).
- Columnas: Nombre, Rol (usar `roleLabel` configurable de la org vía `useOrgSettings` — ya usado en `Sidebar.tsx` como `orgRoleLabel`), Estado (`StatusBadge`). Opcional "Debe cambiar contraseña" como badge si `must_change_password`.
- **Crear**: botón "+ Nuevo Usuario" → `Modal` con `CreateUserForm` que valida con `createLoginUserSchema`, invoca `supabase.functions.invoke('workers', { method:'POST', body:{ full_name, email, role, create_login:true } })`. Al éxito, muestra la **pantalla de credenciales** replicando 1:1 el UX de `CreateOrgForm` en `platform/page.tsx` (cajita verde "Usuario creado", email + `temp_password` en monospace, aviso ámbar "no se volverá a mostrar", botón "Listo"). La diferencia es que `temp_password` viene de la **respuesta** (`data.data.temp_password`), no del input.
- **Editar**: `Modal` con formulario (nombre + rol). Invocar la Edge `supabase.functions.invoke('workers/'+id, { method:'PUT', body:{ full_name, role } })` (ver §4.3: el cambio de rol va por `handlePut` para heredar el guard server-side anti-degradación a `worker`; el `ROLE_OPTIONS` del form NO incluye `worker`). No se usa `supabase.from('workers').update(...)` directo para el rol.
- **Desactivar/Activar**: `ConfirmDialog` + Edge `supabase.functions.invoke('workers/'+id+'/status', { method:'PATCH', body:{ status } })` (ver §4.4: va por `handlePatchStatus` para heredar el guard de deuda pendiente, incluido el chequeo de liquidaciones de cuadrilla para crew_leads). Si responde `WORKER_HAS_PENDING_DEBT` (409), mostrar el mensaje de error como toast. No se usa `update({ status })` directo.
- **Reset contraseña**: botón de acción (icono llave) → `ConfirmDialog` ("¿Resetear la contraseña de {nombre}? Se generará una temporal.") → `supabase.functions.invoke('workers/'+id+'/reset-password', { method:'POST' })` → mostrar `temp_password` en el mismo componente de credenciales (reutilizable), una vez.

> `supabase.functions.invoke('workers/:id/reset-password', { method:'POST' })` con path compuesto está confirmado como patrón válido: `platform/page.tsx` ya hace `invoke('organizations/${org.id}/subscription', { method:'PATCH' })` y `change-password` hace `invoke('auth/change-password', ...)`.

Copy en español en toda la pantalla.

---

## 8. UI Móvil (`apps/mobile/app/admin/users.tsx`)

### Placement / navegación
- Nueva pantalla: `apps/mobile/app/admin/users.tsx`.
- Registrar en `apps/mobile/app/admin/_layout.tsx` como `<Drawer.Screen name="users" options={{ title: 'Usuarios' }} />`, en la sección de datos maestros (junto a `supervisors`/`permission-profiles`).
- Añadir el ítem en `apps/mobile/src/components/admin/AdminDrawerContent.tsx` dentro de `items` (section `'master'`): `{ route: 'users', title: 'Usuarios', icon: 'person-circle', color: colors.violet, section: 'master', requiresCapability: CAPABILITIES.WORKERS_MANAGE }`.
- También añadir el módulo equivalente en `apps/mobile/app/admin/index.tsx` (grid de módulos). **El shape del array `AdminModule` exige `available` explícito** (verificado: todos los ítems existentes setean `available: true`; el filtro `visible` solo navega si `m.available`). El objeto completo, espejando el ítem `workers`, es: `{ key: 'users', route: '/admin/users', title: 'Usuarios', description: 'Cuentas de acceso (admin, supervisor, encargado)', icon: 'person-circle', color: colors.violet, available: true, requiresCapability: CAPABILITIES.WORKERS_MANAGE }`. (Nota: `route` es la ruta absoluta `/admin/users`, no `users`, igual que los demás ítems del grid.)
- El drawer ya restringe todo a `role === 'admin'` (guard al inicio de `AdminDrawerContent`).

### Estructura (mirror de `admin/workers.tsx`)
- `useQuery(['admin-login-users'])` con el select de §4.2.
- `FlatList` + `RowItem` (subtitle = `roleLabel(role)` vía `useOrgSettings`, badge de estado), FAB "+", `Modal` sheet para crear/editar, igual que `WorkerFormModal`.
- Crear: validar con `createLoginUserSchema`; invocar `supabase.functions.invoke('workers', { method:'POST', body:{ full_name, email, role, create_login:true } })`. Mostrar `temp_password` en un modal de credenciales **una vez** (copy: "Entrega esta contraseña al usuario; deberá cambiarla al ingresar. No se volverá a mostrar.").
- **Modal de credenciales (reutilizable para crear y resetear) con botón "Copiar":** usar un `Modal` de RN (no `Alert` plano) que muestre email + `temp_password` en monospace. El texto seleccionable en RN **no** es copiable de forma fiable, así que se añade un botón **"Copiar"** explícito que use `expo-clipboard` (`import * as Clipboard from 'expo-clipboard'` → `await Clipboard.setStringAsync(tempPassword)`) y muestre feedback ("Copiado"). `expo-clipboard` **no** está en `apps/mobile/package.json` hoy (verificado), por lo que debe añadirse como dependencia (`npx expo install expo-clipboard`). Al ser un módulo nativo de Expo, requiere recompilar el dev client (Xcode Play), no basta un reload de JS.
- Editar: `supabase.functions.invoke('workers/'+id, { method:'PUT', body:{ full_name, role } })` (Edge `handlePut`, por el guard anti-degradación de §4.3). No `supabase.from('workers').update(...)` directo para el rol. `ROLE_OPTIONS` sin "Trabajador".
- Desactivar/Activar: `Alert.alert` de confirmación + `supabase.functions.invoke('workers/'+id+'/status', { method:'PATCH', body:{ status } })` (Edge `handlePatchStatus`, por el guard de deuda de §4.4). Si devuelve `WORKER_HAS_PENDING_DEBT` (409), mostrar el mensaje en un `Alert`.
- Reset: botón (icono `key-outline`) → `Alert.alert` confirmación → `invoke('workers/'+id+'/reset-password', { method:'POST' })` → modal con `temp_password` una vez.
- `ROLE_OPTIONS` solo `[Encargado(crew_lead), Supervisor, Administrador]` (sin "Trabajador", porque esta pantalla es de login).

El flujo de cambio forzado ya existe en móvil (`apps/mobile/app/change-password.tsx`) y web (`apps/web/src/app/change-password/page.tsx` + `(dashboard)/layout.tsx` que redirige si `must_change_password`), por lo que un usuario recién creado o reseteado será forzado a cambiar su contraseña en el primer login sin trabajo adicional.

---

## 9. Validación de entradas y manejo de errores (por operación)

**Crear (`POST /workers` con `create_login`):**
- `full_name`: requerido, ≤150, trim. Falla → `VALIDATION_ERROR` 422.
- `email`: requerido, formato `EMAIL_RE`, lowercased. Falla → 422. Duplicado en Auth → 409 ("El email ya está en uso").
- `role`: debe ∈ `{admin,supervisor,crew_lead}`. Otro → 422.
- `password` del body: ignorado; generado server-side. Recuperable: el admin reintenta.
- Fallo creando auth user: fatal para la request, recuperable por el usuario (reintenta); compensación borra lo creado. Se devuelve 400/409. No se loguea email/clave.
- Fallo insert `workers` tras crear auth user: fatal; compensar borrando auth user; 400.

**Listar:** errores de query → `VALIDATION_ERROR` 400 (patrón `handleGetList`). RLS vacía el resultado si no es admin de la org (no error, lista vacía).

**Editar (`PUT /workers/:id`):** no-admin → 403; sin campos → 422 ("Sin campos para actualizar", como `handlePut`); rol inválido → 422; degradar a `worker` un usuario con login → 422 (ver línea dedicada abajo); fila inexistente/otra org → 404.

**Desactivar (`PATCH /workers/:id/status`):** no-admin → 403; `status` ∉ `{active,inactive}` → 422; deuda pendiente a nivel trabajador o de cuadrilla (crew_lead) → `WORKER_HAS_PENDING_DEBT` 409 (recuperable: resolver pagos antes de desactivar); fila inexistente/otra org → 404 vía RLS (0 filas). Activar (`status='active'`) nunca dispara el guard de deuda.

**Editar rol a `worker` sobre un usuario con login (`PUT /workers/:id`):** `VALIDATION_ERROR` 422 ("No se puede convertir un usuario con acceso en trabajador; desactívelo en su lugar"). Fila de otra org resuelta por service client → `CROSS_TENANT_FORBIDDEN` 403 vía `requireOrg`.

**Reset (`POST /workers/:id/reset-password`):** no-admin → 403; sin `org_id` → 403; worker inexistente → 404; otra org → `CROSS_TENANT_FORBIDDEN` 403; sin `auth_user_id` → 422; fallo `updateUserById` → 400. Éxito → 200 con `temp_password` (una vez). Todas las fallas son recuperables (reintento) salvo las de autorización.

**Formato de respuesta:** reusar `success()/error()` de `_shared/response.ts` → `{ success, data }` / `{ success:false, error:{ code, message } }`, consistente con el stack.

**Nota sobre invariantes de dominio:** esta feature no toca cantidades de picking, tarifas ni inmutabilidad de liquidaciones; solo gestiona cuentas de acceso. No altera nombres de entidades (`workers`, `settlements`, `payments` se usan con su nombre canónico). El RBAC se refuerza (requireRole + requirePermission + aislamiento por `org_id`), no se debilita.

---

## 10. Fuera de scope

- Login de cosecheros (`worker`) por DNI/QR + contraseña. (El reset de §5 cubre la "recuperación de accesos" pedida para usuarios de login.)
- Cambio de **email** de un usuario existente (requiere Auth Admin + confirmación).
- Capability nueva `users.manage` (se reutiliza `workers.manage`; extensión dejada en backlog).
- Invitaciones por correo / envío automático de credenciales (se entregan a mano, mostradas una vez).
- Cambios en escala/clipping, drawer layout no relacionado, o cualquier archivo ajeno a la feature. **Excepción explícita:** las dos pantallas de "Trabajadores" (`apps/web/.../workers/page.tsx` y `apps/mobile/app/admin/workers.tsx`) SÍ se tocan, pero **solo** para añadir el filtro `.is('auth_user_id', null)` a su consulta de listado (ver §2 y §4.2). Ningún otro cambio en esas pantallas está en scope.
- Auditoría en `platform_audit_log` para acciones de tenant (ese log es solo de plataforma).

---

## 11. Testabilidad

**Unit (Vitest, en `packages/shared`):** `createLoginUserSchema`/`updateLoginUserSchema` (email inválido, rol fuera de set, nombre vacío/largo). Hay precedente de tests en `packages/shared/src/types/*.test.ts`.

**Unit del generador de password** (`generateTempPassword`): como vive en `supabase/functions/_shared/password.ts` (Deno), se testea con el runner de funciones (o se extrae la función pura a un módulo testeable por Vitest si el repo ya lo hace). Las aserciones NO son solo de longitud; deben verificar las **garantías de clase**, corriendo N iteraciones (p. ej. 1000) y comprobando en **cada** salida: longitud ≥ 12; contiene al menos una minúscula, una mayúscula, un dígito y un símbolo del set definido; no contiene ningún carácter ambiguo excluido (`0`, `O`, `o`, `1`, `l`, `I`); y que dos invocaciones consecutivas difieren (aleatoriedad básica). Esto cubre el riesgo de que una salida degenerada (p. ej. todo minúsculas) rompa la política de Auth del proyecto remoto.

**Integration (Edge Functions, contra Supabase local):** crear usuario de login (verifica fila `workers` con `auth_user_id`, `must_change_password=true`, y que el login posterior exponga `must_change_password`); reset (verifica `updateUserById` llamado y flag re-activado); **tenant isolation** (admin de org A intenta `reset-password` sobre worker de org B → 403); RBAC (supervisor intenta crear/reset → 403). Verificar que la respuesta de create/reset contiene `temp_password` y que **no** aparece en ningún log. Además, cubrir los dos guards nuevos: (a) `PUT /workers/:id` con `role='worker'` sobre una fila con `auth_user_id` no nulo → 422 (anti-degradación, §4.3), y que `role='worker'` sobre una fila sin `auth_user_id` sí se permite (no romper Trabajadores); (b) `PATCH /workers/:id/status` a `inactive` sobre un `crew_lead` cuya cuadrilla tiene una liquidación `payee_type='crew'` en estado `pending`/`partial` → `WORKER_HAS_PENDING_DEBT` 409 (§4.4), y que sin deuda de cuadrilla ni de trabajador la desactivación procede.

**Manual / E2E (Playwright web):** flujo admin crea usuario → ve credenciales una vez → login del nuevo usuario fuerza `change-password`. El forzado ya está cubierto por el redirect de `(dashboard)/layout.tsx`.

Riesgo de testabilidad: las llamadas a `auth.admin.*` requieren service-role y entorno Supabase real/local; se cubren con tests de integración, no unit. El diseño mantiene la lógica de autorización en helpers puros (`requireRole`, `getOrgId`) ya testeables.

---

## 12. Lista de archivos a tocar (resumen)

Backend:
- `supabase/functions/workers/index.ts` — extender `handlePost` (disparador `create_login`, temp password autogenerada, `must_change_password`, campos del insert, compensación; se elimina el branch legacy `email && password`); extender `handlePut` (guard anti-degradación a `worker` para filas con `auth_user_id`, §4.3); extender `handlePatchStatus` (chequeo de deuda de cuadrilla para crew_leads, §4.4); añadir ruta `POST /workers/:id/reset-password` + `handleResetPassword`.
- `supabase/functions/_shared/password.ts` — **nuevo**: `generateTempPassword`.

Shared:
- `packages/shared/src/validation/index.ts` — `createLoginUserSchema`, `updateLoginUserSchema`, `LOGIN_USER_ROLES`.

Web:
- `apps/web/src/app/(dashboard)/usuarios/page.tsx` — **nuevo**.
- `apps/web/src/components/ui/Sidebar.tsx` — entrada "Usuarios" (solo admin).
- `apps/web/src/app/(dashboard)/workers/page.tsx` — **solo** añadir `.is('auth_user_id', null)` a la query de listado de Trabajadores (§2/§4.2); ningún otro cambio.

Móvil:
- `apps/mobile/app/admin/users.tsx` — **nuevo**.
- `apps/mobile/app/admin/_layout.tsx` — `Drawer.Screen name="users"`.
- `apps/mobile/src/components/admin/AdminDrawerContent.tsx` — ítem "Usuarios".
- `apps/mobile/app/admin/index.tsx` — módulo "Usuarios" en el grid (`available: true`).
- `apps/mobile/app/admin/workers.tsx` — **solo** añadir `.is('auth_user_id', null)` a la query de listado de Trabajadores (§2/§4.2); ningún otro cambio.
- `apps/mobile/package.json` — añadir dependencia `expo-clipboard` (para el botón "Copiar" del modal de credenciales; requiere recompilar el dev client).

Sin migraciones nuevas: el modelo (`workers.auth_user_id`, `role`, `must_change_password`, `status`) y las RLS ya soportan todo. Los dos guards añadidos (anti-degradación en `handlePut` y deuda de cuadrilla en `handlePatchStatus`) viven en código de Edge Function, no requieren migración.

---

## 13. Respuestas a la revisión de diseño (`design-review.json` / `design-review.md`)

Todos los hallazgos se resolvieron editando el diseño en su sección correspondiente, verificados contra el código real.

- **MEDIUM §4.1 — branch legacy `email && password` ambiguo:** RESUELTO. Se verificó que **ningún** llamador invoca el POST de la Edge `workers` (la UI de Trabajadores usa insert directo de supabase-js). El fork se cierra: se **elimina** el branch legacy y el único disparador de creación de login es `create_login === true`. (§4.1)
- **MEDIUM §4.1/§6 — campos `national_id`/`phone`/`permission_profile_id`/`qr_badge_url` no especificados:** RESUELTO. §4.1 ahora enumera el valor de cada campo para `create_login === true`: `national_id`/`phone`/`permission_profile_id` como passthrough opcional (null en la práctica), y `qr_badge_url` se sigue generando (decisión justificada: inocuo, mantiene el insert uniforme y no afecta los filtros de ninguna de las dos vistas). (§4.1)
- **MEDIUM §4.3 — edición podía degradar a `role='worker'` sin guard server-side:** RESUELTO. El cambio de rol se enruta por la Edge `PUT /workers/:id`, y `handlePut` se extiende con un guard server-side: rechaza `role='worker'` (422) cuando la fila objetivo tiene `auth_user_id` no nulo, con `requireOrg` para aislamiento. Ya no depende de la validación Zod del cliente. (§4.3, §4.1 file list, §9, §11)
- **MEDIUM §4.4 — desactivación saltaba el guard de deuda; suposición "nunca payees" errónea:** RESUELTO. Se verificó en el modelo (`payee_type='crew'` keyeado por `crew_id`; crew_lead = `crews.crew_lead_id`) que un crew_lead **sí** puede ser payee. La desactivación se enruta por la Edge `PATCH /workers/:id/status`, y `handlePatchStatus` se extiende para chequear también liquidaciones de cuadrilla (`payee_type='crew'`) de las cuadrillas lideradas por el worker, cerrando el gap del guard original (que solo miraba `worker_id`). (§4.4, §9, §11)
- **MEDIUM §6 — `generateTempPassword` sin charset/fuerza:** RESUELTO. §6 reemplaza los comentarios por una implementación concreta con garantía de ≥1 carácter por clase (lower/upper/dígito/símbolo), alfabeto sin ambiguos, CSPRNG con rechazo de módulo y shuffle Fisher–Yates. §11 exige tests de las garantías de clase (no solo longitud) sobre N iteraciones. Se documentó que la política remota de Auth es desconocida y por eso el generador debe ser robusto por construcción. (§6, §11)
- **NIT §7 — gating del sidebar poco claro:** RESUELTO. §7 añade la advertencia explícita de que "Supervisores" NO está gateado por rol (visible a supervisores) mientras que "Usuarios" sí va envuelto en `role === 'admin'`, para evitar un copy-paste erróneo entre entradas contiguas. (§7)
- **NIT §8 — `available` del grid móvil no especificado:** RESUELTO. §8 da el objeto `AdminModule` completo con `available: true` y `route` absoluta `/admin/users`, espejando el ítem `workers`. (§8, §12)
- **NIT §8 — copiar al portapapeles solo implícito:** RESUELTO. §8 añade un botón "Copiar" explícito con `expo-clipboard` (`Clipboard.setStringAsync`) en el modal de credenciales reutilizable; se añadió la dependencia al file list. (§8, §12)

### Segunda ronda de revisión (`design-review.json` / `design-review.md`, veredicto CHANGES_REQUESTED)

- **MEDIUM (Finding 1) §2/§1/§8 — afirmación falsa de que "Trabajadores ya filtra `auth_user_id IS NULL`" y conflicto con "Trabajadores intacto":** RESUELTO (Opción A). Se verificó leyendo el código que **ninguna** de las dos pantallas de Trabajadores (`apps/web/.../workers/page.tsx`, `apps/mobile/app/admin/workers.tsx`) aplica filtro alguno; ambas listan todas las filas de `workers`. Se eliminó la afirmación falsa (§2) y se decidió **añadir** `.is('auth_user_id', null)` a la query de listado de ambas pantallas, documentando el cambio exacto en §2 y §4.2, moviendo los dos archivos al listado de tocados en §12 y declarando la excepción explícita en §10. Se ajustó §1 para decir que Trabajadores conserva flujo/UI con ese único filtro añadido, en vez de "intacta".
- **NIT (Finding 2) §3/§4.4 — `handlePatchStatus` no aplica `requirePermission`:** RESUELTO. Se verificó que hoy solo llama `requireRole(['admin'])`. §4.4 ahora decide explícitamente **añadir `requirePermission('workers.manage')`** a `handlePatchStatus` para alinear con el guard chain de §3; se aclara que `handleRegenerateBadge` queda fuera de scope.
- **NIT (Finding 3) §6 — `z.enum` con miembros de enum falla `tsc` strict:** RESUELTO. Se cambió a `LOGIN_USER_ROLES = ['admin','supervisor','crew_lead'] as const` + `z.enum(LOGIN_USER_ROLES)` en ambos schemas, alineado con el precedente del repo (`updateOrganizationSchema` usa literales; `createPermissionProfileSchema` castea). Se verificó que los literales coinciden con los valores de `WorkerRole`.
- **NIT (Finding 4) §4.1 — `status` no mencionado en el insert:** RESUELTO. §4.1 añade una línea explicando que `status` se omite a propósito y depende del default `active` de `entity_status`, requerido por `custom_access_token_hook` (que filtra `status='active'`), para que no se "limpie" por error.

Scope sin cambios: sección "Usuarios" separada solo para usuarios de login (`admin`/`supervisor`/`crew_lead`); Trabajadores conserva su flujo/UI (único cambio: filtro `auth_user_id IS NULL` en su listado, para no mostrar cuentas de login); password temporal autogenerada mostrada una vez con `must_change_password=true`; reset iniciado por admin acotado a su org; RBAC admin-only; `organization_id` siempre del JWT (`getOrgId`/`requireOrg`), nunca del body.
