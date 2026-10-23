# Fundo360 — Validación E2E y manual de puesta en marcha

> Recorrido completo de una puesta en marcha real, ejecutado contra **Supabase local** (ambiente limpio tras `db reset`) con Playwright. Documenta, paso a paso y con capturas, cómo opera cada rol — tanto en el **dashboard web** como en la **app móvil** (versión web).
>
> Objetivo doble: (1) validar que el producto está listo para probar en terreno, (2) servir de manual de uso.
>
> Entorno: web `http://localhost:3000`, mobile-web `http://localhost:8083`, Supabase local `http://127.0.0.1:54321`.

## Roles del sistema

- **Platform admin** (dueño del SaaS): crea organizaciones (clientes) y su primer admin. Consola `/platform`.
- **Admin del cliente**: configura todo lo de su organización — usuarios con login, trabajadores, campos, productos, tarifas, cuadrillas. Genera liquidaciones y pagos.
- **Supervisor**: registra producción en terreno por escaneo QR.
- **Encargado (crew_lead)**: lidera una cuadrilla; registra producción de su equipo.
- **Trabajador recolector**: sin login; se identifica con badge QR.

---

## Índice del recorrido

1. Platform admin crea un cliente nuevo + su primer admin
2. Admin del cliente: primer ingreso y cambio de contraseña
3. Admin: crear usuarios con login (supervisor, encargado)
4. Admin: crear trabajadores (badge QR)
5. Admin: estructura productiva (campos, paños, productos, tarifas)
6. Admin: cuadrillas (modo capataz)
7. Mobile: supervisor/encargado arma el roster del día y registra cosecha por QR
8. Admin: generar liquidación y registrar pago
9. Consulta de producción y pagos
10. Hallazgos de la validación

---

## 1. Platform admin crea un cliente nuevo + su primer admin

El dueño del SaaS (platform admin) entra a la **consola de plataforma** (`/platform`) con su cuenta de soporte. Es el único que puede dar de alta clientes.

Al entrar, la consola muestra las organizaciones (tenants) registradas, con tarjetas de resumen (activas, en prueba, suspendidas) y métricas agregadas de toda la plataforma.

![Consola de plataforma](img/01-platform-consola-vacia.png)

**Crear el cliente:** botón **"+ Nuevo cliente"**. El formulario pide:
- Nombre de la empresa (y slug opcional, se autogenera del nombre).
- Suscripción inicial (Prueba / Activa / Suspendida / Cancelada).
- Datos del **primer administrador del cliente**: nombre, email y contraseña inicial. Esa cuenta deberá cambiar la contraseña en su primer acceso.

![Formulario de nuevo cliente](img/02-platform-nuevo-cliente-modal.png)

En esta validación se creó **"Agrícola Los Robles SpA"** con suscripción **Activa** y admin `admin@losrobles.cl`.

Al confirmar, el sistema crea en un solo paso (atómico): la organización, la cuenta de Supabase Auth del admin, y su fila de trabajador con rol `admin` y `must_change_password=true`. La consola muestra **una sola vez** las credenciales para entregárselas al cliente.

![Cliente creado — credenciales del admin](img/03-platform-cliente-creado-credenciales.png)

> **Nota de operación (entorno local):** las operaciones privilegiadas (crear organización/usuario) corren en **Edge Functions**. En local hay que levantarlas aparte con `npx supabase functions serve` además de `npx supabase start`; si no, la consola responde `503 Service Unavailable` y muestra "Error al crear el cliente". En el entorno remoto esto no aplica (las funciones están desplegadas). Ver §10.

## 2. Admin del cliente: primer ingreso y cambio de contraseña

El admin del cliente entra a la web (`/login`) con las credenciales que le entregó el platform admin (`admin@losrobles.cl` / contraseña inicial).

En el **primer ingreso**, el sistema lo redirige obligatoriamente a **cambiar la contraseña** (`must_change_password`). No puede acceder al resto de la app hasta definir una nueva.

![Cambio de contraseña forzado en el primer ingreso](img/04-admin-cambio-password.png)

Tras guardar la nueva contraseña, se re-autentica con ella y entra al **dashboard de su organización**. El dashboard arranca vacío (0 producción, 0 trabajadores, 0 paños) — es un cliente recién creado. El menú lateral muestra todas las secciones que el admin puede gestionar: Campos, Productos, Trabajadores, Registros, Liquidaciones, Pagos, Supervisores, **Usuarios** y Configuración, bajo la marca de la organización.

![Dashboard del cliente recién creado](img/05-admin-dashboard-vacio.png)

> **Validado:** el flujo de `must_change_password` funciona end-to-end (login inicial → cambio forzado → re-login → dashboard). La sección **"Usuarios"** (gestión de accesos con login) está presente en el menú del admin.

## 3. Admin: crear usuarios con login (supervisor, encargado)

> Esta es la capacidad clave para la autogestión del cliente: el admin da acceso (login) a su propio equipo, sin SQL ni intervención del dueño del SaaS.

En el menú **"Usuarios"**, el admin ve las **cuentas de acceso** (administradores, supervisores, encargados). Al inicio solo está él mismo (Carmen Fuentes, Administrador). Cada fila tiene acciones **Editar / Resetear contraseña / Desactivar**.

![Sección Usuarios — solo el admin inicial](img/06-admin-usuarios-lista.png)

**Crear usuario:** botón **"+ Nuevo Usuario"**. El formulario pide nombre, email y rol (**Administrador / Supervisor / Encargado** — no permite crear "trabajador" aquí, ese es un concepto separado sin login). La contraseña **se autogenera**: no se escribe.

![Formulario de nuevo usuario](img/07-admin-nuevo-usuario-modal.png)

Al crear, el sistema genera una **contraseña temporal** y la muestra **una sola vez** para entregarla. El usuario queda con "Debe cambiar contraseña".

![Contraseña temporal del supervisor (se muestra una vez)](img/08-admin-supervisor-credenciales.png)

En esta validación se crearon:
- **Jorge Cañete** — Supervisor — `supervisor@losrobles.cl`
- **Ramón Lagos** — Encargado — `encargado@losrobles.cl`

Ambos aparecen en la lista con estado Activo y "Debe cambiar contraseña".

![Usuarios con login creados](img/09-admin-usuarios-3.png)

> **Validado (feature P0):** creación de usuarios con login por el admin del cliente, con contraseña temporal autogenerada (CSPRNG, incluye mayúsculas/minúsculas/dígitos/símbolos) + `must_change_password`. El rol "trabajador" está excluido de esta sección por diseño. Las acciones de **resetear contraseña** y **desactivar** están disponibles (recuperación de accesos sin depender del dueño del SaaS). RBAC: solo un admin ve y usa esta sección.

## 4. Admin: crear trabajadores (badge QR)

En **"Trabajadores"** el admin registra al personal de campo (cosecheros). A diferencia de "Usuarios", este formulario pide nombre, RUT y teléfono — **sin email ni contraseña**: el trabajador no inicia sesión, se identifica con un **badge QR**.

![Formulario de nuevo trabajador (sin login)](img/10-admin-nuevo-trabajador.png)

Al crear, el sistema genera un badge QR (UUID opaco) por trabajador. La tabla muestra nombre, RUT, rol, teléfono, **Badge QR** y estado, con acción **"Ver Badge QR"** para mostrar/imprimir.

![Lista de trabajadores](img/11-admin-trabajadores-lista.png)

En esta validación se crearon **Pedro Morales** y **Rosa Jiménez** (rol Trabajador).

> **Validado — separación Usuarios vs Trabajadores (feature P0):** consultando la base del nuevo tenant, los trabajadores tienen badge QR y `auth_user_id = NULL` (sin login), mientras admin/supervisor/encargado tienen login. La pantalla de Trabajadores NO muestra a los usuarios con login (filtro `auth_user_id IS NULL`), y la de Usuarios NO muestra a los cosecheros — la separación es limpia en ambos sentidos.
>
> **Aislamiento multi-tenant:** la consulta confirma que el tenant "Agrícola Los Robles" solo contiene su propio personal; no se filtran datos de otras organizaciones.

## 5. Admin: productos y tarifas (incl. variedades)

En **"Productos"** el admin registra los cultivos y su tarifa de recolección. El formulario pide nombre, unidad de medida (**Caja** o **Kilo**, si el pago por kilo está habilitado) y una tarifa inicial.

Se crearon tres productos:
- **Arándano** — Caja — $380
- **Cereza** — Caja — $520
- **Uva de mesa** — Caja — $300 (con variedades)

![Productos con tarifa vigente](img/12-admin-productos.png)

Cada producto tiene acciones: **$** (historial de tarifas), **Gestionar variedades**, **Editar** y **Desactivar**. La columna "Tarifa vigente" muestra el precio activo; el historial conserva las tarifas anteriores (la tarifa queda congelada en cada registro de cosecha, `rate_amount_snapshot`).

**Variedades:** para "Uva de mesa" se agregaron tres variedades — **Thompson Seedless, Red Globe, Crimson Seedless**. Al tener variedades, los paños de ese producto deberán asignar una variedad, y la tarifa puede definirse por variedad.

![Variedades de Uva de mesa](img/13-admin-variedades-uva.png)

> **Nota de configuración (feature flags):** "Variedades de producto" (`product_varieties`) y "Pago por kilo" (`kg_payment`) son **feature flags** con estrategia `org_override`, apagados por defecto. Para habilitarlos en un cliente, el **platform admin** los activa desde la consola `/platform/feature-flags` (override por organización). En esta validación se activaron para "Agrícola Los Robles" y, tras recargar, la UI mostró la unidad "Kilo" y el botón "Gestionar variedades". El **modo capataz** no es un flag sino una opción de la organización (`crew_mode_enabled`) que el admin activa en **Configuración**.

## 6. Admin: estructura productiva (campos y paños)

En **"Campos"** el admin registra los terrenos. Cada campo tiene nombre, ubicación y superficie (ha). Se creó **"Fundo El Roble"** (Curicó, 45 ha).

Dentro de un campo (**"Ver paños"**) se crean los **paños** (cuarteles). Cada paño se asocia a un **producto** y a una **superficie**. Se crearon:
- **Cuartel 1 - Arándano** — producto Arándano — 8 ha
- **Cuartel 2 - Uva** — producto Uva de mesa — variedad **Thompson Seedless** — 6 ha

Cuando el producto tiene variedades, el formulario del paño exige elegir una **variedad** (aparece el selector tras elegir "Uva de mesa"):

![Paño de un producto con variedades — selector de variedad](img/14-admin-pano-uva-variedad.png)

![Campo con sus paños](img/15-admin-campo-panos.png)

> **Validado:** jerarquía Campo → Paño → Producto (→ Variedad) funciona end-to-end. La asignación de variedad al paño solo se exige cuando el producto tiene variedades activas, como define la feature.

## 7. Admin: asignar trabajadores al supervisor (prerrequisito del terreno)

> **Paso obligatorio del setup, descubierto durante la validación.** Un supervisor **no puede armar su equipo del día ni registrar cosecha** hasta que el admin le asigne trabajadores. Esto es por diseño (seguridad): la política RLS `supervisor_read_assigned_workers` solo deja al supervisor ver a los trabajadores que tiene asignados.

En **"Supervisores"**, el admin ve a cada supervisor (aquí Jorge Cañete) con sus trabajadores y paños "Sin asignar". Con **"Gestionar"** abre el panel de asignaciones y agrega trabajadores (y/o paños) al supervisor. Se asignaron **Pedro Morales** y **Rosa Jiménez** a Jorge Cañete.

![Asignar trabajadores al supervisor](img/19-admin-asignar-supervisor.png)

> **Orden correcto de puesta en marcha:** crear usuarios con login → crear trabajadores → **asignar trabajadores a cada supervisor** → (en terreno) el supervisor arma su roster del día y registra. Si se omite la asignación, en el móvil el supervisor verá "No hay trabajadores disponibles para agregar" al intentar armar su equipo. Ver §10 (Hallazgos).

> **Importante — asignar también los paños:** además de los trabajadores, el admin debe asignar al supervisor los **paños** donde registrará (tab "Paños" del mismo panel). Sin paños asignados, al identificar a un trabajador en el móvil aparece "Sin paños disponibles". Se asignaron "Cuartel 1 - Arándano" y "Cuartel 2 - Uva" a Jorge Cañete.

![Asignar paños al supervisor](img/21-admin-asignar-panos.png)

## 8. Mobile: supervisor arma el roster del día y registra cosecha por QR

El supervisor usa la **app móvil**. En el primer ingreso cambia su contraseña temporal (igual que el admin), y luego opera con las pestañas: Panel, Campo (producción), **[QR central] registrar**, Pagos, Equipo, Perfil.

![Supervisor: cambio de contraseña en móvil](img/16-mobile-supervisor-cambio-pass.png)

**Armar el equipo del día (roster):** en la pestaña **Equipo**, con "Agregar" el supervisor incluye a los trabajadores de la jornada. Solo aparecen los que tiene asignados. Se agregaron Pedro Morales y Rosa Jiménez.

![Equipo del día armado](img/20-mobile-roster-dia.png)

**Registrar cosecha:** en la pestaña central se escanea el badge QR del trabajador (o se ingresa el código manualmente). Tras identificarlo, se elige el **paño** (solo los asignados), y si el producto tiene variedades, la **variedad**; luego la cantidad de cajas y **Confirmar**. El badge solo funciona si el trabajador está en el equipo del día.

![Registro: elegir paño tras identificar al trabajador](img/22-mobile-registro-panos.png)

Se registraron **Pedro Morales — 12 cajas** y **Rosa Jiménez — 9 cajas** en Cuartel 1 - Arándano. La pantalla de **Producción** muestra el acumulado del día: **21 cajas, $7.980 estimado, 2 registros**.

![Producción del día (supervisor)](img/23-mobile-produccion-dia.png)

> **Validado:** flujo de terreno completo — roster del día → identificación por badge → selección de paño → registro de cantidad. Verificado en base de datos que cada registro guarda la **tarifa congelada** (`rate_amount_snapshot = $380`), de modo que un cambio futuro de tarifa no altera los registros ya hechos. El cálculo del estimado es correcto ($380 × 21 = $7.980).

## 9. Admin: generar liquidación y registrar pago

En **"Liquidaciones"**, el admin genera las liquidaciones de un período con **"Generar Liquidaciones"** indicando fecha inicio y fin. El sistema toma la producción del período, la agrupa por trabajador (o por cuadrilla en modo capataz) y calcula el monto con la tarifa congelada de cada registro.

Para el período 2026-10-20 a 2026-10-22 se generaron **2 liquidaciones individuales**: Pedro Morales **$4.560** (12 cajas × $380) y Rosa Jiménez **$3.420** (9 cajas × $380), ambas en estado Pendiente.

![Liquidaciones generadas](img/24-admin-liquidaciones.png)

**Registrar pago:** en **"Pagos"** → "Registrar Pago", el admin elige una liquidación pendiente; el sistema muestra el saldo (Pagado $0 / $4.560) y precarga el monto total. Se registró el pago de Pedro ($4.560, nota "Transferencia bancaria").

![Registrar pago](img/25-admin-registrar-pago.png)

El pago queda en el historial y la liquidación de Pedro pasa a **pagada** (verificado en BD: `status='paid'`), mientras la de Rosa sigue pendiente. Una liquidación pagada es **inmutable** (trigger `prevent_paid_settlement_update`).

![Pago registrado](img/26-admin-pago-registrado.png)

> **🔴→✅ HALLAZGO BLOQUEANTE (P0) encontrado y CORREGIDO durante esta validación.** Al intentar generar las liquidaciones, el sistema respondía "No se encontró producción para el período" pese a existir registros válidos — un cliente recién configurado no habría podido liquidar nada.
>
> **Causa raíz:** `supabase/functions/settlements/index.ts` embebía `workers` con un hint de FK **inexistente** (`picking_records_worker_id_fkey`). PostgREST devolvía error `PGRST200` y el handler **se tragaba el error**, dejando `records = null` → cero producción. Además había un **segundo bug latente** idéntico: el insert de liquidación de cuadrilla usaba un embed ambiguo de `crews` (`PGRST201` tragado), por lo que las liquidaciones de cuadrilla nunca se creaban.
>
> **Corrección:** usar los hints de FK correctos (`workers!fk_picking_worker_org`, `crews!fk_settlements_crew_org`), propagar los errores en vez de ignorarlos, y resolver el modo capataz con consultas simples separadas en lugar del embed anidado de 3 niveles. Verificado: generar ahora produce las 2 liquidaciones ($7.980 total), es idempotente (no duplica) y el modo capataz crea correctamente la liquidación de cuadrilla. Fix en `supabase/functions/settlements/index.ts` (pendiente de commit junto al resto del trabajo).

## 10. Consulta, RBAC y recuperación de accesos

**Consulta de producción y pagos:** el supervisor ve la producción del día en la app móvil (pestaña Campo); el admin ve el acumulado en el dashboard web (Dashboard, Registros), y el historial de pagos en "Pagos". El trabajador consulta su propia producción/pagos desde el móvil con su badge (no requiere login).

**Recuperación de accesos (reset de contraseña):** el admin del cliente puede resetear la contraseña de cualquier usuario con login desde "Usuarios" → "Resetear contraseña". El sistema genera una nueva contraseña temporal (mostrada una vez) y marca al usuario con "debe cambiar contraseña". Validado con Jorge Cañete: tras el reset, su siguiente ingreso lo obligó a definir una nueva contraseña. Esto cubre el caso de personal que pierde su acceso, sin depender del dueño del SaaS ni de SQL.

![Reset de contraseña por el admin del cliente](img/27-admin-reset-password.png)

**RBAC (control de acceso por rol):** validado que un **supervisor** no puede acceder a la gestión de usuarios. Al intentar entrar a `/usuarios` (y al dashboard web en general) con la sesión de supervisor, la ruta lo bloquea (el dashboard web es para administradores; el supervisor opera desde la app móvil). La barrera real es el backend: las Edge Functions exigen rol admin + `workers.manage` para crear/editar/resetear usuarios, y la RLS acota todo a la organización del JWT.

> **Observación de UX (no bloqueante):** el bloqueo del supervisor en rutas de admin del dashboard web se manifiesta como un bucle de redirección (`ERR_TOO_MANY_REDIRECTS`) en lugar de una pantalla clara de "acceso solo para administradores". No es un fallo de seguridad (el acceso sí queda denegado), pero conviene mostrar un mensaje o redirigir a una vista válida. Recomendado P2.

---

## 11. Hallazgos de la validación

Resueltos o aclarados durante el recorrido (ambiente local):

1. **Edge Functions en local** — `npx supabase start` no sirve las Edge Functions; hay que correr `npx supabase functions serve` aparte. Sin eso, crear cliente/usuarios responde `503`. (Operativo; no aplica al remoto, donde están desplegadas.)
2. **Feature flags** — "Variedades de producto" y "Pago por kilo" son flags con override por organización, apagados por defecto. Los activa el **platform admin** desde `/platform/feature-flags` (o por SQL en pruebas). El **modo capataz** no es flag: es la opción `crew_mode_enabled` de la organización, en Configuración.
3. **`.env` de la app móvil** — `apps/mobile/.env.local` apuntaba al Supabase remoto y Expo le da prioridad sobre `.env`. Para probar contra local hubo que priorizar el `.env` local. (Nota de desarrollo.)
4. **Prerrequisito de supervisión** — un supervisor necesita que el admin le asigne **trabajadores y paños** antes de poder armar su equipo del día y registrar cosecha (por RLS). Es correcto por diseño, pero debe quedar claro en el onboarding: sin esas asignaciones, en terreno parece "no me deja".
5. **🔴→✅ BUG P0 — Generación de liquidaciones (CORREGIDO).** El endpoint `settlements/generate` devolvía cero producción por un hint de FK inexistente cuyo error se ignoraba (más un segundo bug idéntico en liquidaciones de cuadrilla). Habría impedido liquidar a cualquier cliente nuevo. Corregido y verificado end-to-end. **Este bug solo se descubrió al validar con un cliente creado desde cero** — con los datos de seed no se manifestaba.
6. **UX redirect del supervisor en web** (P2, ver §10).
7. **Nota técnica de la validación** — en la app móvil servida como web, un overlay de React Native Web intercepta los clics de Playwright; se automatizó con clics por JavaScript. No afecta al dispositivo real.

---

## 12. Veredicto de preparación para terreno

El recorrido completo de puesta en marcha **funciona end-to-end** con un cliente creado desde cero: el platform admin da de alta la organización y su primer admin; ese admin configura **todo lo suyo sin SQL** — usuarios con login (y recuperación de accesos), trabajadores con badge QR, productos con variedades, campos y paños, tarifas, y asignación de supervisión; el supervisor arma su equipo del día y registra cosecha por QR; y el admin genera liquidaciones y registra pagos, con la liquidación quedando inmutable al pagarse.

El aislamiento multi-tenant (RLS) se mantuvo en todo el recorrido: el cliente de prueba solo vio y operó sus propios datos.

La validación cumplió su segundo objetivo: **destapó un bug P0 bloqueante** (generación de liquidaciones) que ya quedó corregido, además de dejar claro el prerrequisito de asignación de supervisión y un par de mejoras de UX menores. Con esos puntos atendidos, el flujo central está listo para una prueba con un cliente real en terreno, usando el dispositivo físico para el registro por QR (la cámara no está disponible en la versión web).
