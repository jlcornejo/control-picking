# Requirements Document

## Introduction

El presente documento describe los requerimientos de negocio para un sistema de gestión integral de operaciones de cosecha agrícola. El sistema resuelve la falta de visibilidad, trazabilidad y control sobre la producción en campo, el rendimiento de los trabajadores y la liquidación de pagos por unidad recolectada (caja/kilo).

### Problema que Resuelve

Los fundos agrícolas que operan bajo esquema de pago por pieza (piece-rate) enfrentan:

- **Registro manual propenso a errores**: Cuadernos y planillas generan discrepancias en el conteo de cajas, pérdida de datos y conflictos con trabajadores.
- **Falta de visibilidad en tiempo real**: Los supervisores no conocen el avance de la jornada hasta el cierre del día.
- **Liquidaciones lentas y opacas**: Los trabajadores desconfían del cálculo de pagos cuando no pueden verificar sus propios registros.
- **Nula trazabilidad por paño/cuartel**: No se sabe qué zonas rinden más ni dónde concentrar esfuerzos.
- **Imposibilidad de escalar**: Al crecer la operación, los mecanismos manuales colapsan.

### Propuesta de Valor

El sistema entrega control completo de la cadena operativa — desde la estructura de campos hasta la liquidación final — en una plataforma digital accesible desde dispositivos móviles, con identificación por QR y métricas en tiempo real.

## Glossary

- **Sistema**: La plataforma de gestión de campo y control de picking descrita en este documento.
- **Campo**: Unidad productiva principal (fundo, predio o estancia) que contiene uno o más Paños.
- **Paño**: Subdivisión operativa de un Campo (también llamado cuartel o bloque), asociada a un producto específico.
- **Producto**: Tipo de fruta o cultivo que se cosecha (arándano, cereza, frambuesa, etc.).
- **Tarifa**: Valor monetario configurable que se paga por cada unidad recolectada (caja o kilo) de un Producto determinado.
- **Trabajador**: Persona que realiza la recolección de fruta en campo.
- **Supervisor**: Persona responsable de registrar la producción de un grupo de Trabajadores y supervisar la operación diaria.
- **Administrador**: Persona con acceso completo al Sistema para configuración, reportes y gestión financiera.
- **Jornada**: Período operativo de un día calendario en el que se registra producción.
- **Registro_de_Picking**: Entrada que asocia un Trabajador, una cantidad de unidades recolectadas, un Paño y una Jornada.
- **Liquidación**: Cálculo del monto a pagar a un Trabajador basado en sus Registros_de_Picking y las Tarifas vigentes.
- **Badge_QR**: Identificador visual único asignado a cada Trabajador para su identificación rápida en campo.
- **Dashboard**: Panel de indicadores que muestra métricas consolidadas de producción, rendimiento y costos.

## Requirements

### Requerimiento 1: Gestión de Estructura de Campos

**User Story:** Como Administrador, quiero definir y organizar la estructura de mis campos productivos (fundos, paños, hectáreas y productos asociados), para tener un catastro digital actualizado de mi operación.

#### Criterios de Aceptación

1. THE Sistema SHALL permitir al Administrador crear, modificar y desactivar Campos con nombre, ubicación y superficie total en hectáreas.
2. THE Sistema SHALL permitir al Administrador crear, modificar y desactivar Paños dentro de un Campo, con nombre, superficie en hectáreas y Producto asociado.
3. WHEN un Administrador asocia un Producto a un Paño, THE Sistema SHALL registrar la asociación y hacerla visible para Supervisores y el Dashboard.
4. THE Sistema SHALL mantener un catálogo de Productos con nombre y unidad de medida (caja o kilo).
5. IF un Administrador intenta desactivar un Campo o Paño con Registros_de_Picking activos en la Jornada actual, THEN THE Sistema SHALL advertir al Administrador y solicitar confirmación antes de proceder.

---

### Requerimiento 2: Gestión de Trabajadores

**User Story:** Como Administrador, quiero registrar y gestionar a los trabajadores de la operación con sus datos esenciales y un identificador QR, para tener un padrón confiable y facilitar la identificación en campo.

#### Criterios de Aceptación

1. THE Sistema SHALL permitir al Administrador crear, modificar y desactivar Trabajadores con nombre completo, RUT o identificador nacional, teléfono de contacto y rol asignado.
2. WHEN un Trabajador es creado, THE Sistema SHALL generar automáticamente un Badge_QR único vinculado a ese Trabajador.
3. THE Sistema SHALL permitir al Administrador regenerar el Badge_QR de un Trabajador en caso de pérdida o deterioro.
4. THE Sistema SHALL soportar la asignación de roles: Administrador, Supervisor y Trabajador.
5. IF un Administrador intenta desactivar un Trabajador con Liquidaciones pendientes de pago, THEN THE Sistema SHALL notificar la deuda pendiente y requerir resolución antes de desactivar.

---

### Requerimiento 3: Configuración de Tarifas por Producto

**User Story:** Como Administrador, quiero configurar el valor a pagar por cada unidad recolectada según el tipo de producto, para que las liquidaciones se calculen de forma automática y precisa.

#### Criterios de Aceptación

1. THE Sistema SHALL permitir al Administrador definir y modificar la Tarifa (valor monetario por unidad) para cada Producto.
2. WHEN un Administrador modifica una Tarifa, THE Sistema SHALL aplicar la nueva Tarifa únicamente a los Registros_de_Picking creados a partir de la fecha de modificación.
3. THE Sistema SHALL conservar el historial de Tarifas con fecha de vigencia para garantizar la trazabilidad de pagos históricos.
4. IF un Administrador intenta guardar una Tarifa con valor cero o negativo, THEN THE Sistema SHALL rechazar la operación y mostrar un mensaje descriptivo.

---

### Requerimiento 4: Registro de Picking en Campo

**User Story:** Como Supervisor, quiero registrar de forma rápida y confiable las cajas o kilos recolectados por cada trabajador en cada paño durante la jornada, para que la producción diaria quede documentada sin errores.

#### Criterios de Aceptación

1. WHEN un Supervisor escanea el Badge_QR de un Trabajador, THE Sistema SHALL identificar al Trabajador y presentar el formulario de registro de picking.
2. THE Sistema SHALL permitir al Supervisor registrar la cantidad de unidades recolectadas, el Paño de origen y la fecha/hora del registro.
3. WHEN un Registro_de_Picking es guardado, THE Sistema SHALL asociarlo automáticamente a la Jornada vigente.
4. THE Sistema SHALL permitir al Supervisor corregir un Registro_de_Picking dentro de la misma Jornada, conservando el registro original como auditoría.
5. IF el Supervisor intenta registrar picking para un Trabajador desactivado, THEN THE Sistema SHALL rechazar el registro e informar que el Trabajador no está activo.
6. IF el Supervisor intenta registrar picking en un Paño desactivado, THEN THE Sistema SHALL rechazar el registro e informar que el Paño no está activo.

---

### Requerimiento 5: Consulta de Producción por Trabajador

**User Story:** Como Trabajador, quiero ver cuántas cajas o kilos he recolectado durante el día y en períodos anteriores, para conocer mi avance y verificar que mis registros son correctos.

#### Criterios de Aceptación

1. THE Sistema SHALL mostrar al Trabajador autenticado su total de unidades recolectadas en la Jornada actual.
2. THE Sistema SHALL mostrar al Trabajador un historial de producción por Jornada con detalle de Paño y cantidad.
3. THE Sistema SHALL mostrar al Trabajador el monto estimado a percibir en la Jornada actual basado en las Tarifas vigentes.
4. WHILE un Trabajador consulta sus registros, THE Sistema SHALL presentar únicamente los datos pertenecientes a ese Trabajador.

---

### Requerimiento 6: Liquidación y Pagos

**User Story:** Como Administrador, quiero que el sistema calcule automáticamente lo que se le debe a cada trabajador según sus registros de producción y las tarifas vigentes, para agilizar el proceso de pago y eliminar errores de cálculo manual.

#### Criterios de Aceptación

1. WHEN un Administrador solicita generar una Liquidación para un período determinado, THE Sistema SHALL calcular el monto total multiplicando las unidades registradas de cada Trabajador por la Tarifa vigente al momento de cada Registro_de_Picking.
2. THE Sistema SHALL presentar el detalle de la Liquidación desglosado por Jornada, Paño y Producto para cada Trabajador.
3. WHEN un Administrador marca una Liquidación como pagada, THE Sistema SHALL registrar la fecha de pago y el monto abonado.
4. THE Sistema SHALL mantener un saldo de deuda pendiente por cada Trabajador, calculado como la diferencia entre el total liquidado y el total pagado.
5. IF el monto abonado excede el saldo pendiente de un Trabajador, THEN THE Sistema SHALL rechazar la operación e informar el saldo máximo disponible para pago.

---

### Requerimiento 7: Métricas y Dashboard de Producción

**User Story:** Como Administrador, quiero visualizar indicadores clave de la operación (rendimiento por trabajador, producción por paño, costos por hectárea y rankings), para tomar decisiones informadas y optimizar la eficiencia de la cosecha.

#### Criterios de Aceptación

1. THE Sistema SHALL presentar en el Dashboard la producción total del día (unidades y monto) con actualización durante la Jornada.
2. THE Sistema SHALL mostrar un ranking de Trabajadores ordenado por unidades recolectadas en un período seleccionable.
3. THE Sistema SHALL mostrar la producción acumulada por Paño y por Campo en un período seleccionable.
4. THE Sistema SHALL calcular y presentar el costo por hectárea como el total de pagos dividido por la superficie cosechada en el período.
5. THE Sistema SHALL permitir al Administrador filtrar las métricas por Campo, Paño, Producto, Trabajador y rango de fechas.
6. WHILE un Supervisor accede al Dashboard, THE Sistema SHALL mostrar únicamente las métricas correspondientes a los Trabajadores y Paños bajo su supervisión.

---

### Requerimiento 8: Control de Acceso Basado en Roles

**User Story:** Como Administrador, quiero que cada usuario vea y haga solo lo que corresponde a su rol, para proteger la información sensible y mantener la integridad operativa.

#### Criterios de Aceptación

1. THE Sistema SHALL restringir el acceso a funcionalidades según el rol del usuario autenticado: Administrador, Supervisor o Trabajador.
2. WHILE un usuario tiene rol de Administrador, THE Sistema SHALL permitir acceso completo a todas las funcionalidades del Sistema.
3. WHILE un usuario tiene rol de Supervisor, THE Sistema SHALL permitir acceso al registro de picking, consulta de producción de su equipo y métricas de su supervisión.
4. WHILE un usuario tiene rol de Trabajador, THE Sistema SHALL permitir acceso exclusivamente a la consulta de su propia producción y sus propias liquidaciones.
5. IF un usuario intenta acceder a una funcionalidad no autorizada para su rol, THEN THE Sistema SHALL denegar el acceso y mostrar un mensaje indicando permisos insuficientes.

---

### Requerimiento 9: Asignación de Supervisión

**User Story:** Como Administrador, quiero asignar trabajadores a supervisores y supervisores a paños, para que cada supervisor tenga responsabilidad clara sobre su equipo y zona de trabajo.

#### Criterios de Aceptación

1. THE Sistema SHALL permitir al Administrador asignar uno o más Trabajadores a un Supervisor.
2. THE Sistema SHALL permitir al Administrador asignar uno o más Paños a un Supervisor.
3. WHEN un Supervisor accede al registro de picking, THE Sistema SHALL mostrar únicamente los Trabajadores y Paños asignados a ese Supervisor.
4. IF un Supervisor intenta registrar picking para un Trabajador no asignado a su supervisión, THEN THE Sistema SHALL rechazar la operación e informar la restricción.

---

## Roadmap por Fases

### Fase 1 — Fundación Operativa (MVP)
- Gestión de Campos, Paños y Productos (Req. 1)
- Gestión de Trabajadores con Badge QR (Req. 2)
- Configuración de Tarifas (Req. 3)
- Registro de Picking en campo (Req. 4)
- Consulta de producción por Trabajador (Req. 5)
- Control de acceso básico por roles (Req. 8)

### Fase 2 — Gestión Financiera
- Liquidación y Pagos automáticos (Req. 6)
- Asignación de supervisión (Req. 9)

### Fase 3 — Inteligencia Operativa
- Dashboard y métricas avanzadas (Req. 7)
- Rankings y reportes exportables
- Alertas de rendimiento anormal

### Fase 4 — Escalamiento (Futuro)
- Soporte multi-fundo con consolidación central
- Modo offline con sincronización
- Integraciones con sistemas contables y de RRHH
- App móvil nativa para trabajadores

---

## Criterios de Éxito / KPIs

| Indicador | Meta | Medición |
|-----------|------|----------|
| Reducción de errores en conteo de cajas | ≥ 90% vs. proceso manual | Discrepancias reportadas por mes |
| Tiempo de liquidación de pagos | ≤ 1 hora desde cierre de período | Tiempo promedio de generación |
| Adopción por trabajadores | ≥ 80% consultan su producción al menos 1 vez por jornada | Accesos únicos diarios al módulo de consulta |
| Visibilidad de producción en tiempo real | Datos disponibles con ≤ 5 minutos de retraso | Latencia entre registro y visualización en Dashboard |
| Satisfacción de supervisores con el registro | ≥ 4/5 en encuesta de usabilidad | Encuesta trimestral |
| Trazabilidad completa | 100% de cajas registradas asociadas a Trabajador + Paño + Jornada | Registros sin campos vacíos / total registros |

---

## Restricciones de Negocio

1. El Sistema debe ser operable desde dispositivos móviles en campo (smartphones/tablets).
2. La interfaz del Trabajador debe ser simple y comprensible para personas con bajo nivel de alfabetización digital.
3. El registro de picking debe completarse en menos de 10 segundos por operación para no retrasar la cosecha.
4. Los datos financieros (tarifas, liquidaciones, pagos) son visibles únicamente para el rol Administrador.
5. El Sistema debe soportar operación con conectividad intermitente en zonas rurales (Fase 4).
