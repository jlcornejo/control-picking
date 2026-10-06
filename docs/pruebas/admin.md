# Pruebas — Administrador

**Usuario:** `admin@surberries.cl` / `admin123` (tenant Sur Berries).

Ver [preparación del entorno](vision-general.md#preparacion-del-entorno) para levantar la app.

---

## Qué puede hacer este perfil

- Ve **Dashboard**, **Producción** (de todo el campo), **Registro Picking**, **Pagos** y
  **Perfil** con acceso a **Administración**.
- Registra la cosecha de **cualquier trabajador activo** (no está limitado al equipo del día).
- Gestiona los datos maestros: trabajadores, campos y paños, productos y tarifas, cuadrillas,
  supervisores, tipos de caja y perfiles de permisos (según flags de la organización).
- **No** ve Mi Cuadrilla ni Mi Equipo.

---

## A-01 · Login y navegación

- **Pasos:** ingresar con el usuario admin → observar la barra inferior.
- **Resultado esperado:** aterriza en **Producción**; ve Dashboard, Producción, Registro
  Picking, Pagos, Perfil. **No** ve Mi Cuadrilla ni Mi Equipo.

## A-02 · Acceso a Administración

- **Pasos:** ir a **Perfil** → botón **Administración**.
- **Resultado esperado:** entra al panel de administración con los módulos: Trabajadores,
  Campos y Paños, Productos y Tarifas, Supervisores, y los condicionales según la
  organización (Tipos de Caja, Cuadrillas, Perfiles de Permisos). "Configuración" aparece
  como "Próximamente".

## A-03 · Registrar cosecha de cualquier trabajador (sin equipo del día)

- **Precondición:** un trabajador **activo** del tenant, aunque **no** esté en ningún roster.
- **Pasos:** Registro Picking → identificar al trabajador → paño → (melga) → cantidad →
  Confirmar.
- **Resultado esperado:** el registro se guarda **sin** el bloqueo de "equipo del día" (el
  admin no está limitado al roster, a diferencia del supervisor/encargado).

## A-04 · Ver producción de todo el campo

- **Pasos:** ir a **Producción**.
- **Resultado esperado:** ve los registros de **todos** los trabajadores del día, con nombre,
  totales de unidades y monto estimado.

## A-05 · Corregir un registro del día

- **Pasos:** abrir un registro de hoy → **Corregir cantidad** → cambiar → Guardar.
- **Resultado esperado:** la cantidad se actualiza; el original queda como auditoría.

## A-06 · Pagos: ver todas las liquidaciones y pagar

- **Pasos:** ir a **Pagos** → abrir una liquidación no pagada → **Pagar** → monto válido →
  confirmar.
- **Resultado esperado:** ve **todas** las liquidaciones (de trabajadores y cuadrillas); el
  pago se registra y actualiza el estado. Un monto mayor al saldo es rechazado.

## A-07 · Administración — Trabajadores

- **Pasos:** Administración → **Trabajadores**.
- **Resultado esperado:** lista de trabajadores del tenant; se pueden ver sus datos y badge.

## A-08 · Administración — Productos y Tarifas

- **Pasos:** Administración → **Productos y Tarifas**.
- **Resultado esperado:** lista de productos y su tarifa vigente. (La tarifa debe ser > 0.)

## A-09 · Dashboard

- **Pasos:** ir a **Dashboard**.
- **Resultado esperado:** métricas de la operación (producción, trabajadores activos, etc.)
  sin errores.

## A-10 · Escala de texto

- **Pasos:** Perfil → **Tamaño del texto** → Grande / Extra grande.
- **Resultado esperado:** el texto de toda la app se agranda y la preferencia persiste.
