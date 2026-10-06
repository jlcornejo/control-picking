# Pruebas — Encargado (cuadrilla)

**Usuario:** `capataz@surberries.cl` / `capataz123` (tenant Sur Berries, rol `crew_lead`).

Ver [preparación del entorno](vision-general.md#preparacion-del-entorno) para levantar la app.

---

## Qué puede hacer este perfil

- Ve **Dashboard**, **Producción**, **Registro Picking**, **Pagos**, **Mi Cuadrilla** y
  **Perfil**.
- **Arma su equipo del día** y **registra la cosecha** de los trabajadores de su cuadrilla
  (solo los del roster del día).
- **Genera las liquidaciones** de su equipo y **registra pagos** a cada trabajador.
- Ve la **liquidación de su cuadrilla** (lo que el campo le paga a él), en solo lectura.
- **No** ve Mi Equipo ni Administración.

---

## E-01 · Login y navegación

- **Pasos:** ingresar con el usuario encargado.
- **Resultado esperado:** aterriza en **Producción**; ve Dashboard, Producción, Registro
  Picking, Pagos, **Mi Cuadrilla**, Perfil. **No** ve Mi Equipo ni Administración.

## E-02 · Armar el equipo del día

- **Pasos:** ir a **Mi Cuadrilla** → gestor de equipo del día → agregar un trabajador de su
  cuadrilla al roster de hoy.
- **Resultado esperado:** el trabajador queda en el equipo del día (prerrequisito para
  registrar su cosecha).

## E-03 · Registrar cosecha de un trabajador del equipo

- **Precondición:** trabajador agregado al roster (E-02).
- **Pasos:** Registro Picking → identificar al trabajador → paño → (melga) → cantidad →
  Confirmar.
- **Resultado esperado:** el registro se guarda y aparece en Producción.

## E-04 · Bloqueo fuera del equipo del día (caso negativo)

- **Pasos:** intentar registrar a un trabajador que no está en su roster de hoy.
- **Resultado esperado:** aviso **"Fuera de tu equipo de hoy"**; no permite continuar.

## E-05 · Liquidación de mi cuadrilla (solo lectura)

- **Pasos:** en **Mi Cuadrilla**, revisar la sección "Liquidación de mi cuadrilla".
- **Resultado esperado:** muestra la liquidación que el cliente/campo le paga al encargado
  (nivel 1), con su monto, período y estado. Es solo lectura.

## E-06 · Generar liquidaciones de mi equipo

- **Precondición:** su cuadrilla tiene trabajadores con producción en el período.
- **Pasos:** en **Mi Cuadrilla** → "Liquidaciones de mi equipo" → **Generar** → elegir rango
  de fechas → confirmar.
- **Resultado esperado:** se crean las liquidaciones de los trabajadores del período (sin
  duplicar las ya existentes). Si no hay producción en el rango, avisa que no hay nada que
  liquidar.

## E-07 · Registrar pago a un trabajador de mi equipo

- **Precondición:** una liquidación de equipo pendiente (E-06).
- **Pasos:** abrir una liquidación no pagada → **Registrar pago** → monto válido → confirmar.
- **Resultado esperado:** el pago se registra; el estado pasa a parcial/pagado. Un monto
  mayor al saldo es rechazado.

## E-08 · Corregir un registro del día

- **Pasos:** Producción → abrir registro de hoy → **Corregir cantidad** → Guardar.
- **Resultado esperado:** la cantidad se actualiza (el original queda como auditoría).

## E-09 · Escala de texto

- **Pasos:** Perfil → **Tamaño del texto** → Grande / Extra grande.
- **Resultado esperado:** el texto se agranda y la preferencia persiste.
