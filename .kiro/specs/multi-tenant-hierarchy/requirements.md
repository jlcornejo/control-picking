# Requirements Document

## Introduction

Este documento describe los requerimientos para evolucionar el Sistema de Control de Picking desde una aplicación single-tenant (todos los datos son globales y compartidos) hacia una plataforma **SaaS multi-cliente por suscripción**, donde cada cliente opera dentro de un ambiente aislado y confidencial.

El refactor introduce tres capacidades nuevas:

1. **Multi-tenancy**: N clientes (organizaciones) comparten la misma base de datos, pero sus datos están completamente aislados entre sí mediante Row Level Security. Ningún cliente puede ver ni configurar datos de otro cliente.
2. **Nivel jerárquico "Encargado" (Capataz), opcional**: se añade un nivel entre Supervisor y Trabajador para modelar la realidad de campo donde un capataz (el "furgón X") gestiona su propia cuadrilla y recibe el pago del cliente, pagando luego a sus trabajadores. Este nivel es activable/desactivable por campo (con default por organización), porque campos pequeños no usan esa modalidad.
3. **Administrador de Plataforma (dueño del SaaS / soporte)**: un rol por encima de todos los tenants, con control total, capacidad de dar de alta clientes y usar todas las funcionalidades.

### Problema que Resuelve

- El sistema actual no puede venderse a múltiples clientes porque no aísla datos entre empresas.
- No existe forma de que cada cliente personalice su marca (logo, colores, nombre).
- El modelo de pago actual (supervisor/administrador paga directo a cada trabajador) no cubre el caso frecuente en que el cliente contrata a un capataz que gestiona y paga a su propia cuadrilla.
- No existe un rol de soporte/plataforma para operar el SaaS (alta de clientes, gestión de suscripciones, soporte transversal).

### Propuesta de Valor

Cada cliente obtiene un ambiente propio, seguro y con su identidad de marca, con una jerarquía de roles que se adapta a su modalidad operativa. El dueño del SaaS obtiene una consola de plataforma para gestionar clientes y dar soporte, con trazabilidad completa del flujo de dinero incluso cuando hay capataces de por medio.

## Glossary

- **Sistema**: La plataforma de gestión de campo y control de picking.
- **Organización** (Cliente / Tenant): La empresa o sociedad que contrata la suscripción (ej. "Campos del Sur"). Unidad de aislamiento de datos. Todos los datos de dominio pertenecen a exactamente una Organización.
- **Suscripción**: Estado comercial de una Organización (prueba, activa, suspendida, cancelada) que gobierna su acceso al Sistema.
- **Branding**: Configuración de identidad visual de una Organización (nombre, logo, colores primario y secundario).
- **Administrador_de_Plataforma**: Persona del equipo dueño del SaaS con control total sobre todas las Organizaciones. Puede dar de alta clientes, configurar todo y usar todas las funcionalidades. Vive por encima de los tenants.
- **Administrador**: Persona con acceso completo dentro de **su propia** Organización. Configura branding, jerarquía, estructura y finanzas de su empresa. Nunca ve datos de otra Organización.
- **Supervisor**: Persona que supervisa la operación diaria (campos y/o cuadrillas) dentro de su Organización.
- **Encargado** (Capataz / Jefe de Cuadrilla): Persona que gestiona una Cuadrilla propia. Registra la producción de sus Trabajadores y recibe el pago del cliente por la producción de su cuadrilla; luego paga a sus Trabajadores. Rol opcional.
- **Trabajador**: Persona que realiza la recolección de fruta en campo.
- **Cuadrilla** (Crew): Grupo de Trabajadores gestionado por un Encargado.
- **Modo_Capataz**: Configuración que determina si una Organización o un Campo opera con Encargados (liquidación en dos niveles) o sin ellos (Supervisor paga directo, comportamiento actual).
- **Etiquetas_de_Rol**: Nombres personalizables que una Organización puede asignar a cada nivel de la jerarquía para mostrarlos en su interfaz (ej. mostrar "Capataz" en lugar de "Encargado"), sin alterar la jerarquía ni las reglas de seguridad.
- **Aislamiento_de_Tenant**: Garantía de que los datos de una Organización solo son accesibles dentro de esa Organización (o por un Administrador_de_Plataforma).
- **Impersonación_de_Soporte**: Mecanismo por el cual un Administrador_de_Plataforma fija un contexto de Organización activo para operar dentro de ese ambiente de forma auditable.

## Requirements

### Requerimiento 1: Aislamiento de Datos por Organización (Multi-tenancy)

**User Story:** Como dueño del SaaS, quiero que cada cliente opere en un ambiente de datos aislado, para poder vender suscripciones a múltiples empresas garantizando la confidencialidad de sus datos.

#### Criterios de Aceptación

1. THE Sistema SHALL asociar cada entidad de dominio (Trabajadores, Campos, Paños, Productos, Tarifas, Registros_de_Picking, Liquidaciones, Pagos, asignaciones y Cuadrillas) a exactamente una Organización.
2. WHEN un usuario autenticado accede a cualquier dato de dominio, THE Sistema SHALL restringir el acceso exclusivamente a los datos de la Organización a la que pertenece el usuario.
3. THE Sistema SHALL impedir que un usuario de una Organización lea, cree, modifique o elimine datos de otra Organización.
4. THE Sistema SHALL propagar la identidad de la Organización del usuario en el token de sesión para su uso en el control de acceso a nivel de datos.
5. IF un usuario autenticado no tiene una Organización asociada activa y no es Administrador_de_Plataforma, THEN THE Sistema SHALL denegar el acceso a los datos de dominio.
6. WHEN se migran los datos existentes al modelo multi-tenant, THE Sistema SHALL asignar todos los datos actuales a una Organización semilla por defecto, sin pérdida de información.

---

### Requerimiento 2: Gestión de Organizaciones y Suscripciones (Plataforma)

**User Story:** Como Administrador_de_Plataforma, quiero dar de alta y gestionar clientes y sus suscripciones, para operar el negocio SaaS.

#### Criterios de Aceptación

1. THE Sistema SHALL permitir al Administrador_de_Plataforma crear una Organización con nombre, identificador único y su Administrador inicial.
2. THE Sistema SHALL permitir al Administrador_de_Plataforma consultar y modificar el estado de Suscripción de una Organización (prueba, activa, suspendida, cancelada).
3. WHEN la Suscripción de una Organización está suspendida o cancelada, THE Sistema SHALL impedir el acceso de los usuarios de esa Organización a las funcionalidades, preservando sus datos.
4. THE Sistema SHALL permitir al Administrador_de_Plataforma ver y configurar los datos de cualquier Organización.
5. THE Sistema SHALL restringir la creación y gestión de Organizaciones y Suscripciones exclusivamente al Administrador_de_Plataforma.

---

### Requerimiento 3: Administrador de Plataforma (Soporte y Control Total)

**User Story:** Como dueño de la aplicación, quiero un rol de plataforma con control total sobre todos los clientes, para dar soporte y administrar el sistema completo.

#### Criterios de Aceptación

1. THE Sistema SHALL permitir al Administrador_de_Plataforma ver y editar datos de todas las Organizaciones, ignorando el Aislamiento_de_Tenant.
2. THE Sistema SHALL permitir al Administrador_de_Plataforma usar todas las funcionalidades disponibles para los roles de cualquier Organización.
3. THE Sistema SHALL gestionar el rol de Administrador_de_Plataforma de forma independiente de los roles internos de cada Organización.
4. WHEN un Administrador_de_Plataforma opera dentro del ambiente de una Organización específica, THE Sistema SHALL permitir fijar un contexto de Organización activo (Impersonación_de_Soporte).
5. WHEN un Administrador_de_Plataforma accede o modifica datos de una Organización, THE Sistema SHALL registrar el acceso en un registro de auditoría (quién, qué Organización, qué acción, cuándo).
6. THE Sistema SHALL requerir autenticación reforzada (segundo factor) para las cuentas de Administrador_de_Plataforma.

---

### Requerimiento 4: Configuración de Marca de la Organización (Branding)

**User Story:** Como Administrador de una Organización, quiero configurar la identidad visual de mi empresa, para que la aplicación refleje mi marca.

#### Criterios de Aceptación

1. THE Sistema SHALL permitir al Administrador configurar el nombre visible, el logo y los colores primario y secundario de su Organización.
2. WHEN un usuario de una Organización usa la aplicación, THE Sistema SHALL mostrar el Branding configurado para esa Organización.
3. THE Sistema SHALL restringir la configuración del Branding al Administrador de la propia Organización (y al Administrador_de_Plataforma).
4. IF una Organización no ha configurado Branding, THEN THE Sistema SHALL aplicar valores por defecto.

---

### Requerimiento 5: Jerarquía de Roles Configurable

**User Story:** Como Administrador de una Organización, quiero una jerarquía de roles clara y con nombres que pueda adaptar a mi terminología, para reflejar la estructura real de mi operación.

#### Criterios de Aceptación

1. THE Sistema SHALL soportar la jerarquía de roles internos de Organización: Administrador → Supervisor → Encargado → Trabajador.
2. THE Sistema SHALL mantener la jerarquía y las reglas de seguridad fijas independientemente de las Etiquetas_de_Rol.
3. THE Sistema SHALL permitir al Administrador definir Etiquetas_de_Rol personalizadas para mostrar en la interfaz de su Organización (ej. "Capataz" en vez de "Encargado").
4. WHEN se muestran roles en la interfaz de una Organización, THE Sistema SHALL usar las Etiquetas_de_Rol configuradas por esa Organización.
5. THE Sistema SHALL restringir a cada usuario a operar únicamente según los permisos de su rol dentro de su Organización.

---

### Requerimiento 6: Nivel Encargado / Cuadrilla Opcional

**User Story:** Como Administrador de una Organización, quiero activar o desactivar el uso de Encargados por campo, para adaptar el sistema a campos grandes (con cuadrillas) y a campos pequeños (sin ellas).

#### Criterios de Aceptación

1. THE Sistema SHALL permitir configurar el Modo_Capataz a nivel de Organización como valor por defecto.
2. THE Sistema SHALL permitir configurar el Modo_Capataz a nivel de Campo, sobrescribiendo el valor por defecto de la Organización.
3. IF un Campo no define Modo_Capataz propio, THEN THE Sistema SHALL heredar el valor por defecto de la Organización.
4. WHEN el Modo_Capataz está activo, THE Sistema SHALL permitir agrupar Trabajadores en Cuadrillas gestionadas por un Encargado.
5. WHEN el Modo_Capataz está inactivo, THE Sistema SHALL operar con el flujo directo Supervisor → Trabajador, sin exponer el rol Encargado ni las Cuadrillas.
6. THE Sistema SHALL soportar la coexistencia, dentro de una misma Organización, de Campos con Modo_Capataz activo y Campos con Modo_Capataz inactivo.

---

### Requerimiento 7: Alcance de Datos por Rol dentro de la Organización

**User Story:** Como Administrador de una Organización, quiero que cada rol vea y gestione solo lo que le corresponde, para mantener la confidencialidad y el orden dentro de mi empresa.

#### Criterios de Aceptación

1. THE Sistema SHALL otorgar al Administrador acceso completo a todos los datos de su propia Organización.
2. THE Sistema SHALL limitar al Supervisor a los Campos, Cuadrillas y Trabajadores que le han sido asignados dentro de su Organización.
3. WHEN el Modo_Capataz está activo, THE Sistema SHALL limitar al Encargado a su propia Cuadrilla: sus Trabajadores, la producción de ellos y los pagos que él realiza a ellos.
4. THE Sistema SHALL limitar al Trabajador a sus propios datos de producción, liquidaciones y pagos.
5. THE Sistema SHALL impedir que cualquier rol acceda a datos fuera del alcance definido para su rol dentro de su Organización.

---

### Requerimiento 8: Liquidación y Trazabilidad en Dos Niveles

**User Story:** Como Administrador de una Organización que opera con Encargados, quiero pagar al Encargado por la producción de su cuadrilla y que él pague a sus trabajadores, manteniendo trazabilidad completa, para reflejar mi modalidad de contratación real.

#### Criterios de Aceptación

1. WHEN el Modo_Capataz está activo para el contexto de una producción, THE Sistema SHALL calcular la Liquidación del cliente hacia el Encargado agregando la producción de toda su Cuadrilla.
2. WHEN el Modo_Capataz está activo, THE Sistema SHALL permitir al Encargado registrar los pagos a sus propios Trabajadores.
3. THE Sistema SHALL mantener la trazabilidad de cuánto se le paga al Encargado y del detalle de producción de cada Trabajador de su Cuadrilla.
4. WHEN el Modo_Capataz está inactivo para el contexto de una producción, THE Sistema SHALL calcular y registrar los pagos directamente del Supervisor/Administrador hacia el Trabajador, como en el comportamiento actual.
5. THE Sistema SHALL asociar cada Registro_de_Picking a un Trabajador y a un Paño, y resolver la Cuadrilla correspondiente cuando el Modo_Capataz esté activo, sin duplicar el registro de producción.
6. THE Sistema SHALL preservar la inmutabilidad de las Liquidaciones pagadas en ambos niveles.

---

### Requerimiento 9: Compatibilidad y Migración

**User Story:** Como equipo de producto, quiero que la evolución multi-tenant no rompa la operación existente, para desplegar el cambio de forma segura.

#### Criterios de Aceptación

1. THE Sistema SHALL preservar todas las funcionalidades actuales de los roles Administrador, Supervisor y Trabajador dentro del modelo multi-tenant.
2. WHEN se despliega el modelo multi-tenant, THE Sistema SHALL mantener operativa a la Organización semilla con sus datos y usuarios existentes.
3. THE Sistema SHALL aplicar las reglas de Aislamiento_de_Tenant a toda entidad de dominio nueva que se cree en el futuro.
4. THE Sistema SHALL mantener el formato de respuesta de API y las convenciones existentes del proyecto.
