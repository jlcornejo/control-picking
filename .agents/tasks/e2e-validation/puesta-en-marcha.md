# Fundo360 — Guía de puesta en marcha

> Manual paso a paso para poner en marcha un cliente nuevo y operar el sistema en terreno. Sirve de referencia para el equipo de QA durante las pruebas y como guía para el cliente durante el arranque.
>
> El sistema tiene dos aplicaciones: el **dashboard web** (para administración) y la **app móvil** (para el trabajo en terreno). Cada captura muestra la pantalla real.

## Roles

- **Administrador de plataforma** (Fundo360): da de alta a cada cliente y entrega la primera cuenta de administrador. Es un paso que hace el equipo Fundo360, no el cliente.
- **Administrador del cliente**: configura todo lo de su empresa desde el dashboard web — accesos de su equipo, trabajadores, campos, productos, tarifas — y gestiona liquidaciones y pagos.
- **Supervisor**: desde la app móvil, arma el equipo del día y registra la producción escaneando el badge QR de cada trabajador.
- **Encargado (modo capataz)**: arma su cuadrilla del día y consulta la producción y las liquidaciones de su equipo desde la app móvil. Si el cliente le paga a nivel de cuadrilla, el encargado gestiona el pago a los trabajadores de su equipo. **No registra la recolección de fruta** (eso lo hace el supervisor) ni accede al resto de la configuración.
- **Trabajador recolector**: no inicia sesión; se identifica con su **badge QR**.

---

## Índice

1. Alta del cliente y su administrador (equipo Fundo360)
2. Primer ingreso del administrador y cambio de contraseña
3. Crear los accesos del equipo (usuarios con login)
4. Registrar a los trabajadores (badge QR)
5. Cargar productos y tarifas (y variedades)
6. Crear campos y paños
7. Asignar trabajadores y paños a cada supervisor
8. En terreno: armar el equipo del día y registrar la cosecha (app móvil)
9. Generar liquidaciones y registrar pagos
10. Consultas, control de acceso y recuperación de contraseñas

---

## 1. Alta del cliente y su administrador

> Este paso lo realiza el **equipo Fundo360** (administrador de plataforma). El cliente recibe al final una cuenta de administrador lista para usar.

En la consola de plataforma, el botón **"+ Nuevo cliente"** abre el formulario de alta. Se completa:
- **Nombre de la empresa** (el identificador corto se genera solo).
- **Suscripción inicial** (normalmente **Activa**).
- Datos del **primer administrador del cliente**: nombre, email y una contraseña inicial.

![Formulario de nuevo cliente](img/02-platform-nuevo-cliente-modal.png)

Al confirmar, el sistema crea la organización y la cuenta del administrador en un solo paso, y muestra **una sola vez** las credenciales para entregárselas al cliente. El administrador deberá cambiar la contraseña en su primer ingreso.

![Cliente creado — credenciales del administrador](img/03-platform-cliente-creado-credenciales.png)

## 2. Primer ingreso del administrador y cambio de contraseña

El administrador del cliente ingresa al dashboard web con el email y la contraseña inicial que recibió.

En el **primer ingreso**, el sistema le pide obligatoriamente **definir una nueva contraseña** antes de continuar.

![Cambio de contraseña en el primer ingreso](img/04-admin-cambio-password.png)

Hecho esto, entra al **panel de su empresa**. Al inicio está vacío (sin producción ni personal) porque es un cliente recién creado. En el menú lateral están todas las secciones que puede gestionar: Campos, Productos, Trabajadores, Registros, Liquidaciones, Pagos, Supervisores, **Usuarios** y Configuración.

![Panel del cliente recién creado](img/05-admin-dashboard-vacio.png)

## 3. Crear los accesos del equipo (usuarios con login)

En **"Usuarios"** el administrador da de alta a las personas que **inician sesión** en el sistema: otros administradores, supervisores y encargados. (Los trabajadores recolectores se cargan aparte, en "Trabajadores" — ver paso 4 — porque no usan login.)

![Sección Usuarios](img/06-admin-usuarios-lista.png)

Con **"+ Nuevo Usuario"** se completa nombre, email y rol (**Administrador / Supervisor / Encargado**). La contraseña **se genera automáticamente**.

![Formulario de nuevo usuario](img/07-admin-nuevo-usuario-modal.png)

Al crear, el sistema muestra **una sola vez** la contraseña temporal para entregarla a la persona. En su primer ingreso, esa persona deberá cambiarla.

![Contraseña temporal generada](img/08-admin-supervisor-credenciales.png)

Los usuarios creados quedan listados con su rol y estado. Desde aquí también se puede **editar**, **resetear la contraseña** o **desactivar** a cada uno.

![Usuarios del equipo](img/09-admin-usuarios-3.png)

## 4. Registrar a los trabajadores (badge QR)

En **"Trabajadores"** se carga al personal de campo (recolectores). Se ingresa nombre, RUT y teléfono — **no llevan email ni contraseña**: cada trabajador se identifica con su **badge QR**, que el sistema genera automáticamente.

![Formulario de nuevo trabajador](img/10-admin-nuevo-trabajador.png)

La lista muestra a cada trabajador con su badge QR, que puede verse e imprimirse con **"Ver Badge QR"** para repartirlo en terreno.

![Lista de trabajadores](img/11-admin-trabajadores-lista.png)

## 5. Cargar productos y tarifas (y variedades)

En **"Productos"** se registran los cultivos con su **tarifa de recolección** (por caja o por kilo) y la unidad de medida.

![Productos con su tarifa vigente](img/12-admin-productos.png)

Si un producto tiene **variedades** (por ejemplo, uva de mesa), se gestionan con **"Gestionar variedades"**; cada paño de ese producto deberá indicar la variedad, y la tarifa puede definirse por variedad.

![Variedades de un producto](img/13-admin-variedades-uva.png)

> La tarifa vigente queda registrada en cada cosecha en el momento del registro, por lo que un cambio futuro de tarifa no altera lo ya cosechado. El historial de tarifas se conserva.

## 6. Crear campos y paños

En **"Campos"** se registran los terrenos (nombre, ubicación, hectáreas). Dentro de cada campo, con **"Ver paños"**, se crean los **paños** (cuarteles): cada uno se asocia a un **producto** y a una superficie.

Cuando el producto tiene variedades, el paño pide elegir la **variedad**.

![Crear paño eligiendo producto y variedad](img/14-admin-pano-uva-variedad.png)

![Campo con sus paños](img/15-admin-campo-panos.png)

## 7. Asignar trabajadores y paños a cada supervisor

> Paso necesario antes de salir a terreno: cada supervisor solo puede registrar a los **trabajadores** y en los **paños** que tiene asignados.

En **"Supervisores"**, con **"Gestionar"** se abre el panel de asignaciones de cada supervisor. Ahí se le agregan los **trabajadores** que estarán a su cargo...

![Asignar trabajadores al supervisor](img/19-admin-asignar-supervisor.png)

...y, en la pestaña **"Paños"**, los **paños** donde registrará la cosecha.

![Asignar paños al supervisor](img/21-admin-asignar-panos.png)

> **Orden recomendado del arranque:** crear accesos del equipo (paso 3) → registrar trabajadores (paso 4) → cargar productos y campos (pasos 5 y 6) → **asignar trabajadores y paños a cada supervisor** (este paso). Con eso, el supervisor ya puede operar en terreno.

## 8. En terreno: armar el equipo del día y registrar la cosecha (app móvil)

El supervisor trabaja desde la **app móvil**. En su primer ingreso cambia su contraseña temporal; luego usa las pestañas: Panel, Campo (producción), **registrar** (botón central), Pagos, Equipo y Perfil.

![Cambio de contraseña en la app móvil](img/16-mobile-supervisor-cambio-pass.png)

**Armar el equipo del día:** en la pestaña **Equipo**, con **"Agregar"** incluye a los trabajadores de la jornada (aparecen los que tiene asignados).

![Equipo del día armado](img/20-mobile-roster-dia.png)

**Registrar la cosecha:** en el botón central se **escanea el badge QR** del trabajador (o se ingresa el código). Luego se elige el **paño**, la **variedad** si corresponde, la **cantidad de cajas** y se confirma.

![Elegir el paño tras identificar al trabajador](img/22-mobile-registro-panos.png)

A medida que se registra, la pestaña **Producción** muestra el acumulado del día: cajas, monto estimado y el detalle por trabajador.

![Producción del día en la app](img/23-mobile-produccion-dia.png)

## 9. Generar liquidaciones y registrar pagos

En **"Liquidaciones"**, con **"Generar Liquidaciones"** y un rango de fechas, el administrador calcula el pago de cada trabajador (o de cada cuadrilla, en modo capataz) según la producción del período y su tarifa.

![Liquidaciones generadas](img/24-admin-liquidaciones.png)

**Registrar un pago:** en **"Pagos"** → "Registrar Pago" se elige una liquidación pendiente; el sistema muestra el saldo y propone el monto total. Se puede agregar una nota (medio de pago).

![Registrar pago](img/25-admin-registrar-pago.png)

El pago queda en el historial y la liquidación pasa a **Pagada**. Una liquidación ya pagada no puede modificarse.

![Pago registrado](img/26-admin-pago-registrado.png)

## 10. Consultas, control de acceso y recuperación de contraseñas

**Consultas:** el supervisor ve la producción del día en la app móvil; el administrador ve el acumulado y el historial de pagos en el dashboard web.

**Recuperación de contraseñas:** si un supervisor o encargado pierde su acceso, el administrador del cliente lo recupera desde **"Usuarios" → "Resetear contraseña"**. El sistema genera una nueva contraseña temporal (mostrada una vez) y la persona deberá cambiarla en su siguiente ingreso. No hace falta contactar a Fundo360.

![Resetear la contraseña de un usuario](img/27-admin-reset-password.png)

**Control de acceso:** cada rol ve solo lo que le corresponde. La gestión de usuarios, campos, productos, liquidaciones y pagos es exclusiva del administrador; los supervisores y encargados operan desde la app móvil. Además, cada empresa ve únicamente sus propios datos.
