# Pruebas — Supervisor / Anotador

!!! danger "Requisito mínimo para terreno"
    Este es el perfil que opera en campo. Los casos marcados con 🔴 (armar equipo, registrar
    cosecha, bloqueo fuera de equipo y foto de respaldo) son el núcleo que debe pasar sí o sí
    antes de la prueba en terreno.

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

!!! info "Datos que usarás en esta guía"
    - **Trabajador de prueba:** Camila Rojas · badge **`badge-sur-worker-001`**.
    - **Paño:** "Paño F1 - Frutillas" · **Melga 1** · producto Frutilla (**kg**) · tarifa **$1.200/kg**.
    - La lista completa de badges y datos del campo está en
      [Preparación](vision-general.md#codigos-de-badge-de-los-trabajadores-para-el-ingreso-manual).

## S-01 · Iniciar sesión

- **Precondición:** la app abierta en la pantalla de inicio de sesión (si ya hay una sesión,
  ve a **Perfil** → **Cerrar sesión** primero).
- **Pasos:**
  1. En el campo **Email**, escribir `supervisor@surberries.cl`.
  2. En el campo **Contraseña**, escribir `super123`.
  3. Tocar el botón verde **Ingresar**.
- **Resultado esperado:** la app entra y muestra la pantalla **Producción** (barra verde
  arriba con "0 cajas / $0 estimado" si no hay registros hoy). En la **barra inferior** hay 6
  íconos: Dashboard, Producción, un **botón verde central con un QR** (Registro), Pagos,
  **Mi Equipo** y Perfil.
  - ✅ Correcto si entra sin el error rojo "Failed to fetch".
  - ❌ Si aparece "Failed to fetch", la app no está conectada al servidor (avisar al equipo).

## S-02 · Armar el equipo del día 🔴 (hazlo ANTES de registrar)

> Un supervisor solo puede registrar la cosecha de los trabajadores que están en **su equipo
> de hoy**. Por eso este paso va primero.

- **Precondición:** sesión iniciada como supervisor.
- **Pasos:**
  1. En la barra inferior, tocar **Mi Equipo**.
  2. En el gestor de "equipo del día", tocar el botón para **agregar trabajador** (buscador o
     botón "+").
  3. Buscar **Camila Rojas** y agregarla al equipo de **hoy**.
- **Resultado esperado:** Camila Rojas queda en la lista del equipo del día. Si vuelves a
  entrar a Mi Equipo, sigue ahí.

## S-03 · Abrir el Registro de Picking

- **Pasos:** tocar el **botón verde central con el ícono QR** en la barra inferior.
- **Resultado esperado:** se abre la pantalla **Registro Picking** en el primer paso, con un
  botón grande **"Escanear Badge"** y, más abajo, un campo de texto para **ingreso manual**
  ("Código del badge") con un botón **Identificar**.

## S-04 · Registrar cosecha de Camila (camino feliz) 🔴

- **Precondición:** Camila agregada al equipo del día (S-02).
- **Pasos:**
  1. En Registro Picking, en el campo **"Código del badge"**, escribir exactamente
     `badge-sur-worker-001` → tocar **Identificar**.
     *(En el dispositivo con cámara, también puedes tocar "Escanear Badge". En el navegador,
     usa el ingreso manual.)*
  2. En la lista de paños, tocar **"Paño F1 - Frutillas"**.
  3. En la lista de melgas, tocar **"Melga 1"**.
  4. En el teclado numérico, escribir la cantidad **10** (son 10 kg).
  5. Tocar **✓ Confirmar**.
- **Resultado esperado:** aparece una pantalla de éxito con **"10 unidades registradas"**, el
  nombre **Camila Rojas** y el monto **$12.000** (10 kg × $1.200). Vuelve al inicio del
  registro.

## S-05 · Bloqueo: trabajador fuera del equipo del día (caso negativo) 🔴

- **Precondición:** **no** haber agregado a Diego Torres al equipo de hoy.
- **Pasos:** en Registro Picking, ingresar el badge `badge-sur-worker-002` (Diego Torres) →
  **Identificar**.
- **Resultado esperado:** aparece un aviso titulado **"Fuera de tu equipo de hoy"** con el
  texto de que lo agregues desde "Mi equipo" antes de registrar. **No** deja continuar al
  paso del paño.

## S-06 · Badge inexistente (caso negativo)

- **Pasos:** en Registro Picking, en "Código del badge" escribir `zzz-no-existe` →
  **Identificar**.
- **Resultado esperado:** aviso **"Badge QR no reconocido"**. No avanza.

## S-07 · Foto de respaldo en el registro 🔴

- **Precondición:** repetir S-04 hasta el paso de **cantidad** (badge Camila → Paño F1 →
  Melga 1 → escribir 10). Tener conexión.
- **Pasos:**
  1. En la pantalla de cantidad, buscar el bloque **"Agregar foto de respaldo"** y tocarlo.
  2. Se abre la cámara. En el navegador, el sistema pedirá permiso de **webcam**: aceptar.
  3. Tomar la foto con el botón de disparo (círculo) → aparece una previsualización → tocar
     **✓ Usar foto**.
  4. De vuelta en el formulario, tocar **✓ Confirmar**.
- **Resultado esperado:** antes de confirmar, se ve una **miniatura** de la foto con las
  opciones **Reemplazar** y **Quitar**. Tras confirmar, el mensaje de éxito muestra el ícono
  **📷** junto al monto. (La foto es opcional: el registro también se puede confirmar sin ella.)
  - ⏭️ Si el navegador no da acceso a webcam, marcar N/A y probar este caso en el dispositivo.

## S-08 · Ver la producción del día

- **Pasos:** en la barra inferior, tocar **Producción**.
- **Resultado esperado:** la barra verde superior muestra el total (ej. **20 kg** si hiciste
  S-04 y S-07, cada uno de 10) y el **monto estimado**. Abajo, la lista **"Registros"** con
  una tarjeta por registro, cada una con el nombre **Camila Rojas**, el paño y la hora.

## S-09 · Corregir un registro del día

- **Precondición:** un registro de **hoy** (el de S-04).
- **Pasos:**
  1. En Producción, tocar la tarjeta del registro de Camila.
  2. En el detalle, tocar **"Corregir cantidad"**.
  3. Cambiar la cantidad a **8** → **Guardar corrección**.
- **Resultado esperado:** mensaje "Registro corregido". La tarjeta ahora muestra **8**. (El
  registro original se conserva como auditoría; la tarifa no cambia.)

## S-10 · La corrección solo aplica al día actual (caso negativo)

- **Pasos:** en Producción, tocar **"‹ Ayer"** (o deslizar a la derecha) para ir a un día
  pasado y tocar un registro (si hay).
- **Resultado esperado:** en el detalle **no** aparece el botón "Corregir cantidad". Solo se
  corrige el día de hoy.

## S-11 · Registrar un pago

- **Precondición:** existe una liquidación **pendiente** o **parcial** en Pagos. (Si no hay
  ninguna, marcar N/A: las liquidaciones las genera el admin o el encargado.)
- **Pasos:**
  1. Tocar **Pagos** en la barra inferior.
  2. Tocar una liquidación cuyo estado **no** sea "Pagado" → botón **Pagar**.
  3. Dejar el monto propuesto (el saldo) o escribir uno **menor** → confirmar.
- **Resultado esperado:** el pago se registra, el estado pasa a **Parcial** o **Pagado** y el
  "Total pendiente de pago" baja.
- **Chequeo negativo:** intenta pagar un monto **mayor** al saldo → debe rechazarlo con un
  aviso de que supera el saldo.

## S-12 · Accesibilidad: tamaño del texto

- **Pasos:**
  1. Tocar **Perfil** en la barra inferior.
  2. Bajar hasta **"Tamaño del texto"**.
  3. Tocar **Grande** y observar; luego **Extra grande**.
- **Resultado esperado:** el texto de toda la app se agranda de inmediato al elegir cada
  opción. Si cierras y vuelves a abrir la app, la preferencia **se mantiene**.

---

## Checklist mínimo para dar OK a terreno

- [ ] S-01 Iniciar sesión
- [ ] S-02 Armar equipo del día 🔴
- [ ] S-04 Registrar cosecha (camino feliz) 🔴
- [ ] S-05 Bloqueo fuera de equipo 🔴
- [ ] S-07 Foto de respaldo 🔴
- [ ] S-08 Ver producción del día
- [ ] S-09 Corregir registro del día
- [ ] S-11 Registrar un pago
