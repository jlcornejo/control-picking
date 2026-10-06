# Pruebas — Supervisor / Anotador

!!! danger "Requisito mínimo para terreno"
    Este es el perfil que opera en campo. Los casos **S-03 a S-07 (registro de cosecha)**
    son el núcleo que debe pasar sí o sí antes de la prueba en terreno.

**Usuario:** `supervisor@surberries.cl` / `super123` (tenant Sur Berries).

Ver [preparación del entorno](vision-general.md#preparacion-del-entorno) para levantar la app.

---

## Qué puede hacer este perfil

- Ver **Dashboard**, **Producción** (de todo el equipo), **Registro Picking**, **Pagos**,
  **Mi Equipo**, **Perfil**.
- **Armar su equipo del día** (roster) y **registrar la cosecha** de esos trabajadores.
- **Corregir** registros del día, **registrar pagos** de liquidaciones.
- **No** ve Administración ni Mi Cuadrilla.

---

## S-01 · Login y aterrizaje

- **Precondición:** app abierta, sin sesión.
- **Pasos:** ingresar `supervisor@surberries.cl` / `super123` → Entrar.
- **Resultado esperado:** entra y aterriza en **Producción**. En la barra inferior se ven:
  Dashboard, Producción, botón central **Registro Picking**, Pagos, **Mi Equipo**, Perfil.
  **No** aparece "Mi Cuadrilla" ni "Administración".

## S-02 · Armar el equipo del día (precondición del registro)

- **Precondición:** sesión de supervisor.
- **Pasos:** ir a **Mi Equipo** → usar el gestor de equipo del día → agregar a un trabajador
  (ej. **Camila Rojas**) al roster de hoy.
- **Resultado esperado:** Camila queda listada en el equipo del día. Este paso es
  **obligatorio** para poder registrar su producción (ver S-04).

## S-03 · Abrir Registro Picking

- **Precondición:** sesión de supervisor.
- **Pasos:** tocar el botón central **Registro Picking** (ícono QR).
- **Resultado esperado:** se abre el flujo en el paso **Escanear Badge**, con opción de
  **ingreso manual** del código del badge.

## S-04 · Registrar cosecha de un trabajador del equipo (camino feliz) 🔴

- **Precondición:** Camila Rojas agregada al equipo del día (S-02).
- **Pasos:**
  1. En Registro Picking, escanear el badge de Camila **o** ingresarlo manual → Identificar.
  2. Elegir un **paño**.
  3. Si el paño tiene **melgas**, elegir una.
  4. Ingresar una **cantidad** (ej. 12) → **✓ Confirmar**.
- **Resultado esperado:** aparece la pantalla de éxito con el nombre de la trabajadora y el
  monto estimado. El registro queda disponible en **Producción** (ver S-09).

## S-05 · Bloqueo: trabajador fuera del equipo del día (caso negativo) 🔴

- **Precondición:** elegir un trabajador que **NO** esté en el roster de hoy (ej. Diego
  Torres si no lo agregaste).
- **Pasos:** en Registro Picking, identificar a ese trabajador.
- **Resultado esperado:** se bloquea con el aviso **"Fuera de tu equipo de hoy"** y el
  mensaje de que lo agregue desde "Mi equipo" antes de registrar. **No** permite continuar.

## S-06 · Badge inválido (caso negativo)

- **Pasos:** en Registro Picking, ingresar manualmente un badge inexistente (ej. `xxxxxx`).
- **Resultado esperado:** aviso **"Badge QR no reconocido"**. No avanza.

## S-07 · Foto de respaldo en el registro 🔴

- **Precondición:** estar en el paso **cantidad** de un registro válido (S-04), con conexión.
- **Pasos:**
  1. Tocar **"Agregar foto de respaldo"**.
  2. Tomar una foto (en web, usar la webcam) → **✓ Usar foto**.
  3. Confirmar el registro.
- **Resultado esperado:** la miniatura de la foto aparece en el formulario antes de
  confirmar; permite **Reemplazar** o **Quitar**. Tras confirmar, el registro se guarda y el
  mensaje de éxito incluye el ícono 📷. (La foto es opcional: el registro también se puede
  confirmar sin ella.)

## S-08 · Registro sin tarifa (caso negativo)

- **Precondición:** un paño cuyo producto **no tenga tarifa vigente** (si existe en el
  ambiente; si todos tienen tarifa, marcar N/A).
- **Pasos:** intentar registrar en ese paño.
- **Resultado esperado:** error **"Sin tarifa vigente para este producto"**; no se guarda.

## S-09 · Ver producción del día

- **Pasos:** ir a **Producción**.
- **Resultado esperado:** se ve el total de unidades y el monto estimado del día, y la lista
  de registros **con el nombre del trabajador** en cada tarjeta. El registro de S-04 aparece.

## S-10 · Corregir un registro del día

- **Precondición:** un registro de **hoy** en Producción.
- **Pasos:** abrir el registro → **Corregir cantidad** → cambiar la cantidad → Guardar.
- **Resultado esperado:** la cantidad se actualiza. (La corrección conserva el registro
  original como auditoría; la tarifa no cambia.)

## S-11 · Corrección bloqueada en días pasados (caso negativo)

- **Pasos:** en Producción, navegar a **Ayer** (botón o swipe) y abrir un registro.
- **Resultado esperado:** **no** aparece el botón "Corregir cantidad" (solo se corrige el
  día actual).

## S-12 · Registrar un pago

- **Precondición:** existe una liquidación **pendiente** o **parcial** en Pagos.
- **Pasos:** ir a **Pagos** → abrir una liquidación no pagada → **Pagar** → ingresar un monto
  (≤ saldo) → confirmar.
- **Resultado esperado:** el pago se registra, el estado pasa a **parcial** o **pagado** y el
  saldo pendiente baja. Intentar un monto mayor al saldo debe ser rechazado.

## S-13 · Accesibilidad: tamaño del texto

- **Pasos:** ir a **Perfil** → **Tamaño del texto** → elegir **Grande** y luego **Extra grande**.
- **Resultado esperado:** el texto de toda la app se agranda de inmediato. La preferencia
  **persiste** tras cerrar y reabrir la app.

---

## Checklist mínimo para dar OK a terreno

- [ ] S-01 Login y aterrizaje
- [ ] S-02 Armar equipo del día
- [ ] S-04 Registrar cosecha (camino feliz) 🔴
- [ ] S-05 Bloqueo fuera de equipo 🔴
- [ ] S-07 Foto de respaldo 🔴
- [ ] S-09 Ver producción del día
- [ ] S-10 Corregir registro del día
- [ ] S-12 Registrar un pago
