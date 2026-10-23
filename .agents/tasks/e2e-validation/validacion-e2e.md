# Fundo360 — Registro de validación E2E (QA)

> Registro técnico de la validación end-to-end del flujo de puesta en marcha, ejecutada contra **Supabase local** (ambiente limpio tras `db reset`) automatizando web y app móvil (versión web) con Playwright. Se creó un cliente desde cero ("Agrícola Los Robles SpA") y se recorrió todo el ciclo: configuración → cosecha → liquidación → pago → consulta.
>
> El **manual de uso del camino correcto** está en `puesta-en-marcha.md`. Este documento recoge lo que es propio de QA: hallazgos, bug encontrado, veredicto y notas de entorno.
>
> Entorno de la corrida: web `http://localhost:3000`, mobile-web `http://localhost:8083`, Supabase local `http://127.0.0.1:54321`.

## Alcance verificado

Recorrido completo con un tenant creado de cero, validando cada rol (platform admin, admin del cliente, supervisor, encargado, trabajador):

1. Platform admin crea organización + primer admin (credenciales mostradas una vez, `must_change_password`).
2. Admin: primer login con cambio de contraseña forzado.
3. Admin crea usuarios con login (supervisor, encargado) con contraseña temporal autogenerada.
4. Admin crea trabajadores (badge QR, sin login).
5. Admin crea productos (Arándano, Cereza, Uva de mesa con variedades) y tarifas.
6. Admin crea campos y paños (con asignación de variedad cuando aplica).
7. Admin asigna trabajadores y paños a un supervisor.
8. Supervisor (móvil): arma el roster del día y registra cosecha por QR.
9. Admin genera liquidaciones y registra un pago.
10. Consulta de producción/pagos, RBAC y recuperación de accesos (reset de contraseña).

**Datos de la corrida:** tenant "Agrícola Los Robles SpA"; admin Carmen Fuentes; supervisor Jorge Cañete; encargado Ramón Lagos; trabajadores Pedro Morales y Rosa Jiménez; campo "Fundo El Roble" (Curicó, 45 ha) con "Cuartel 1 - Arándano" y "Cuartel 2 - Uva" (Thompson Seedless); productos Arándano $380, Cereza $520, Uva de mesa $300. Cosecha registrada: Pedro 12 cajas + Rosa 9 cajas de Arándano = 21 cajas / $7.980.

## Verificaciones clave (OK)

- **`must_change_password`** end-to-end (web y móvil): login inicial → cambio forzado → re-login.
- **Separación Usuarios vs Trabajadores:** los usuarios con login tienen `auth_user_id` y no aparecen en Trabajadores; los cosecheros (badge QR, `auth_user_id = NULL`) no aparecen en Usuarios. Filtro limpio en ambos sentidos.
- **Aislamiento multi-tenant (RLS):** el tenant de prueba solo vio y operó sus propios datos durante todo el recorrido.
- **Tarifa congelada:** cada `picking_record` guarda `rate_amount_snapshot` (= $380), de modo que cambios futuros de tarifa no alteran registros ya hechos.
- **Inmutabilidad de liquidación pagada:** al pagar, la liquidación pasa a `status='paid'` y queda protegida por el trigger `prevent_paid_settlement_update`.
- **RBAC:** el supervisor no puede acceder a la gestión de usuarios; las Edge Functions exigen rol admin + `workers.manage` y la RLS acota todo a la organización del JWT.

## Hallazgos

### 🔴→✅ BUG P0 — Generación de liquidaciones devolvía cero producción (CORREGIDO)

Al generar liquidaciones para un período con cosecha válida, `settlements/generate` respondía "No se encontró producción para el período" y creaba cero liquidaciones. **Un cliente recién configurado no habría podido liquidar nada.**

- **Causa raíz:** `supabase/functions/settlements/index.ts` embebía `workers` con un hint de FK **inexistente** (`picking_records_worker_id_fkey`). PostgREST devolvía `PGRST200` y el handler **ignoraba el error**, dejando `records = null` → cero producción. Un **segundo bug idéntico** afectaba el insert de liquidaciones de cuadrilla (embed ambiguo de `crews`, `PGRST201` también silenciado), por lo que nunca se creaban.
- **Corrección:** usar los hints de FK correctos (`workers!fk_picking_worker_org`, `crews!fk_settlements_crew_org`), **propagar** los errores en vez de ignorarlos, y resolver el modo capataz con consultas separadas en vez del embed anidado de 3 niveles.
- **Verificado:** generar produce las 2 liquidaciones ($7.980 total), es idempotente (no duplica) y el modo capataz crea correctamente la liquidación de cuadrilla. Confirmado también en el remoto con datos reales (octubre de surberries). Desplegado a producción con `supabase functions deploy settlements`.
- **Lección:** este bug solo se manifestó al validar con un cliente creado **desde cero**; con los datos de seed no se veía. Refuerza el valor de validar el onboarding limpio.

### Prerrequisito de supervisión (comportamiento por diseño, documentar en onboarding)

Un supervisor necesita que el admin le asigne **trabajadores y paños** antes de poder armar su equipo del día y registrar cosecha (RLS `supervisor_read_assigned_workers`). Es correcto, pero debe quedar explícito en el onboarding: sin esas asignaciones, en terreno aparece "No hay trabajadores disponibles para agregar" / "Sin paños disponibles". Ya está reflejado como paso del manual (`puesta-en-marcha.md` §7).

### UX — redirect del supervisor en el dashboard web (P2, no bloqueante)

El bloqueo del supervisor en rutas de admin del dashboard web se manifiesta como un bucle de redirección (`ERR_TOO_MANY_REDIRECTS`) en vez de una pantalla clara de "acceso solo para administradores". No es un fallo de seguridad (el acceso queda denegado), pero conviene mostrar un mensaje o redirigir a una vista válida.

## Notas de entorno (solo desarrollo/QA local)

- **Edge Functions en local:** `npx supabase start` no sirve las Edge Functions; hay que correr `npx supabase functions serve` aparte. Sin eso, crear cliente/usuarios responde `503 Service Unavailable`. En el remoto no aplica (las funciones están desplegadas).
- **Feature flags:** "Variedades de producto" (`product_varieties`) y "Pago por kilo" (`kg_payment`) son flags con override por organización, apagados por defecto. Los activa el **platform admin** desde `/platform/feature-flags` (o por SQL en pruebas). El **modo capataz** no es flag: es la opción `crew_mode_enabled` de la organización, en Configuración.
- **`.env` de la app móvil:** `apps/mobile/.env.local` apunta al Supabase remoto y Expo le da prioridad sobre `.env`. Para probar contra local hay que priorizar el `.env` local durante la corrida (y restaurarlo después).
- **Automatización móvil-web con Playwright:** en la app móvil servida como web, un overlay de React Native Web intercepta los clics de Playwright; se automatiza con clics por JavaScript. No afecta al dispositivo físico real.

## Veredicto

El recorrido completo de puesta en marcha **funciona end-to-end** con un cliente creado desde cero: el platform admin da de alta la organización y su primer admin; ese admin configura **todo lo suyo sin SQL** — usuarios con login (y recuperación de accesos), trabajadores con badge QR, productos con variedades, campos y paños, tarifas, y asignación de supervisión; el supervisor arma su equipo del día y registra cosecha por QR; y el admin genera liquidaciones y registra pagos, con la liquidación quedando inmutable al pagarse. El aislamiento multi-tenant (RLS) se mantuvo en todo el recorrido.

La validación cumplió su segundo objetivo: **destapó un bug P0 bloqueante** (generación de liquidaciones), ya corregido, verificado y desplegado. Con el prerrequisito de asignación de supervisión documentado y la mejora de UX menor pendiente (P2), el flujo central está listo para una prueba con un cliente real en terreno, usando el dispositivo físico para el registro por QR (la cámara no está disponible en la versión web).
