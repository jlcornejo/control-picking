# Pruebas — Trabajador

El trabajador (cosechero) normalmente **no** inicia sesión en terreno: se identifica por su
**badge QR** ante el supervisor. Pero la app permite que consulte su producción y pagos si
tiene cuenta. Estos casos aplican cuando el trabajador **sí** tiene login.

> En el ambiente de demo, los trabajadores de Sur Berries (Camila Rojas, Diego Torres,
> Fernanda Silva) están configurados **sin login** (solo badge). Si quieres probar este
> perfil, pide al admin crear/credenciar un trabajador con acceso, o marca estos casos como
> ⏭️ N/A para la demo.

---

## Qué puede hacer este perfil

- Ve **Mi Día** (solo **su** producción), **Mis Pagos** (solo **sus** liquidaciones) y
  **Perfil** (con su **Badge QR**).
- **No** ve Dashboard, Registro Picking, Mi Cuadrilla, Mi Equipo ni Administración.
- **No** puede registrar cosecha, corregir registros ni registrar pagos.

---

## T-01 · Login y navegación

- **Pasos:** ingresar con un trabajador que tenga cuenta.
- **Resultado esperado:** aterriza en **Mi Día**; la barra inferior solo muestra **Mi Día**,
  **Mis Pagos** y **Perfil**. No hay Registro Picking ni Dashboard.

## T-02 · Mi Día — solo mi producción

- **Pasos:** ir a **Mi Día**.
- **Resultado esperado:** ve **solo sus propios** registros del día (no los de otros
  trabajadores), con el total de unidades y monto estimado.

## T-03 · Mis Pagos — solo mis liquidaciones

- **Pasos:** ir a **Mis Pagos**.
- **Resultado esperado:** ve el hero "Saldo pendiente de cobro" y solo **sus** liquidaciones.
  **No** aparece el botón "Pagar" (el trabajador no registra pagos). Si recibió un pago
  reciente, puede mostrarse un aviso/insignia.

## T-04 · Mi Badge QR

- **Pasos:** ir a **Perfil** → **Mi Badge QR**.
- **Resultado esperado:** se muestra el código QR del trabajador para presentarlo al
  supervisor. (Solo el rol trabajador ve este botón.)

## T-05 · Perfil — stats personales

- **Pasos:** en **Perfil**, revisar las estadísticas (Hoy / Semana / Mes).
- **Resultado esperado:** muestra métricas **personales** (sus cajas, días trabajados,
  promedio por día), no agregados de la operación.

## T-06 · Escala de texto

- **Pasos:** Perfil → **Tamaño del texto** → Grande / Extra grande.
- **Resultado esperado:** el texto se agranda y la preferencia persiste.

## T-07 · Sin acceso a registro (verificación de restricción)

- **Pasos:** confirmar que **no** existe la pestaña Registro Picking ni acceso a
  Administración.
- **Resultado esperado:** el trabajador no tiene forma de registrar cosecha ni de entrar a
  administración desde la app.
