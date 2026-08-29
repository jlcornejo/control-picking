# Fundo360

Plataforma SaaS multi-cliente para la gestión integral de operaciones agrícolas: estructura de campos, trabajadores, control de cosecha (picking), rendimiento del campo y liquidación de pagos por pieza.

## ¿Qué encontrarás aquí?

Esta documentación reúne el conocimiento del producto y del sistema en un solo lugar:

- **[Producto](producto/vision-general.md)** — Qué resuelve Fundo360, para quién y con qué alcance.
- **[Arquitectura](arquitectura/vision-general.md)** — Cómo está construido: monorepo, stack y decisiones técnicas.
- **[Dominio](dominio/reglas-de-negocio.md)** — Reglas de negocio, invariantes y glosario.
- **[API](api/vision-general.md)** — Endpoints REST, contratos y convenciones.
- **[Base de datos](base-de-datos/esquema.md)** — Esquema de tablas, relaciones y RLS (generado automáticamente).
- **[Contribuir](contribuir/documentacion.md)** — Cómo escribir y publicar documentación.

## Estado

| Fase | Alcance | Estado |
|------|---------|--------|
| Fase 1 (MVP) | Campos, Trabajadores, Tarifas, Picking, Consulta, RBAC | En desarrollo |
| Fase 2 | Liquidaciones automáticas, Pagos, Asignación de supervisión | Planificada |
| Fase 3 | Dashboard de métricas, Rankings, Reportes, Alertas | Planificada |
| Fase 4 | Multi-fundo, Offline sync, Integraciones contables, App nativa | Planificada |

!!! note "Fuente única de verdad"
    Gran parte de esta documentación se deriva de los archivos de contexto del proyecto (`.kiro/steering/`) y del esquema real de la base de datos. La sección de base de datos se regenera automáticamente a partir de las migraciones.
