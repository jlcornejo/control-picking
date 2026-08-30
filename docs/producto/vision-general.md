# Visión General del Producto

## Propósito

Fundo360 es una plataforma SaaS multi-cliente para la gestión integral de operaciones agrícolas: estructura de campos, trabajadores, control de cosecha (picking), rendimiento del campo y liquidación de pagos por pieza. Cada cliente (organización) opera en un ambiente aislado con su propia marca.

## Usuarios objetivo

| Rol | Ámbito | Responsabilidad |
|-----|--------|-----------------|
| **Administrador de Plataforma** | Todo el SaaS | Da de alta clientes, gestiona suscripciones y da soporte con acceso auditado. |
| **Administrador de fundo** | Su organización | Configura marca, campos, tarifas, trabajadores y cuadrillas. Visualiza métricas y gestiona pagos. |
| **Supervisor de campo** | Su organización | Registra la producción de su equipo en terreno usando escaneo QR. |
| **Encargado / Capataz** (opcional) | Su cuadrilla | Gestiona su cuadrilla, recibe el pago del cliente por su producción y paga a sus trabajadores. |
| **Trabajador recolector** | Sus datos | Consulta su producción diaria y pagos desde su celular. |

## Funcionalidades clave

1. **Multi-cliente (SaaS)**: cada organización opera en un ambiente aislado, con su propia marca (logo, colores, nombre) y etiquetas de rol configurables.
2. Gestión de estructura productiva (campos, paños, productos)
3. Registro rápido de picking con Badge QR (< 10 segundos)
4. Configuración de tarifas por producto con historial
5. **Modo Capataz opcional** (por organización, con override por campo): jerarquía con Encargado y cuadrillas.
6. Cálculo automático de liquidaciones y pagos, **en dos niveles** cuando hay capataz (cliente → encargado → trabajadores).
7. Dashboard de métricas en tiempo real
8. RBAC (cada rol solo ve/hace lo que le corresponde) con aislamiento entre organizaciones
9. Consulta de producción y pagos por trabajador
10. **Consola de plataforma**: alta de clientes, gestión de suscripciones, soporte auditado.

## Contexto de negocio

- **Industria**: Agricultura / Fruticultura (Chile)
- **Modelo de pago**: Piece-rate (por caja o kilo recolectado)
- **Cultivos iniciales**: Arándanos (expandible a otros berries y frutales)
- **Operación**: zonas rurales con conectividad intermitente
- **Usuarios**: trabajadores con bajo nivel de alfabetización digital

## Roadmap

### Base (implementado)

- Campos, Trabajadores, Tarifas, Picking, Consulta, RBAC
- Liquidaciones y Pagos, Asignación de supervisión
- Dashboard de métricas

### Evolución SaaS multi-cliente (implementado)

- **Multi-tenant**: aislamiento por organización + Administrador de Plataforma
- **Jerarquía con Encargado**: rol crew_lead y cuadrillas, con Modo Capataz opcional por campo
- **Liquidación en dos niveles**: cliente → encargado → trabajadores
- **Consola de plataforma**: alta de clientes, suscripciones, impersonación de soporte auditada

### Próximo

- MFA para administradores de plataforma
- App móvil del encargado (pantallas específicas de cuadrilla y pagos)
- Offline sync, integraciones contables, reportes avanzados

## Métricas de éxito

- Reducción ≥ 90% en errores de conteo vs. proceso manual
- Liquidación generada en ≤ 1 hora desde cierre de período
- Adopción ≥ 80% de trabajadores consultando producción diariamente
- Latencia ≤ 5 minutos entre registro y visualización en dashboard
