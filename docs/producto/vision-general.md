# Visión General del Producto

## Propósito

Fundo360 es una plataforma SaaS multi-cliente para la gestión integral de operaciones agrícolas: estructura de campos, trabajadores, control de cosecha (picking), rendimiento del campo y liquidación de pagos por pieza. Cada cliente (organización) opera en un ambiente aislado con su propia marca.

## Usuarios objetivo

| Rol | Responsabilidad |
|-----|-----------------|
| **Administrador de fundo** | Configura campos, tarifas y trabajadores. Visualiza métricas y gestiona pagos. |
| **Supervisor de campo** | Registra la producción de su equipo en terreno usando escaneo QR. |
| **Trabajador recolector** | Consulta su producción diaria y pagos desde su celular. |

## Funcionalidades clave

1. Gestión de estructura productiva (campos, paños, productos)
2. Registro rápido de picking con Badge QR (< 10 segundos)
3. Configuración de tarifas por producto con historial
4. Cálculo automático de liquidaciones y pagos
5. Dashboard de métricas en tiempo real
6. RBAC (cada rol solo ve/hace lo que le corresponde)
7. Consulta de producción y pagos por trabajador

## Contexto de negocio

- **Industria**: Agricultura / Fruticultura (Chile)
- **Modelo de pago**: Piece-rate (por caja o kilo recolectado)
- **Cultivos iniciales**: Arándanos (expandible a otros berries y frutales)
- **Operación**: zonas rurales con conectividad intermitente
- **Usuarios**: trabajadores con bajo nivel de alfabetización digital

## Roadmap

- **Fase 1 (MVP)**: Campos, Trabajadores, Tarifas, Picking, Consulta, RBAC
- **Fase 2**: Liquidaciones automáticas, Pagos, Asignación de supervisión
- **Fase 3**: Dashboard de métricas, Rankings, Reportes, Alertas
- **Fase 4**: Multi-fundo, Offline sync, Integraciones contables, App nativa

## Métricas de éxito

- Reducción ≥ 90% en errores de conteo vs. proceso manual
- Liquidación generada en ≤ 1 hora desde cierre de período
- Adopción ≥ 80% de trabajadores consultando producción diariamente
- Latencia ≤ 5 minutos entre registro y visualización en dashboard
