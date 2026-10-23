# Tablero

Tablero de tareas tipo Kanban del proyecto, en tres columnas: **Por hacer**, **En curso** y
**Hecho**. Es la vista operativa del [planning](vision-general.md).

!!! info "Tablero en formato tabla (por ahora)"
    Este tablero es una **tabla versionada** en la documentación: se actualiza por commit.
    Un tablero **interactivo** (arrastrar tarjetas, que persista en vivo) está previsto como
    una fase siguiente dentro de la consola de plataforma. Mientras tanto, esta vista cumple
    la función de "no depender de Jira" y mantener todo en un solo lugar compartible.

> **Convención de IDs**: `F-xx` (paridad/legacy), `M2-xx` / `M3-xx` (hitos del backlog).
> **Última actualización**: 2026-10-23.

---

## 🟦 Por hacer

| ID | Tarea | Origen | Estimación | Prioridad |
|----|-------|--------|-----------|:---------:|
| M2-04 | Ticketera de soporte (MVP bandeja) | [Backlog §6](../producto/backlog-reunion.md) | 3–4 d | 🟡 P1 |

---

## 🟨 En curso

| ID | Tarea | Origen | Nota |
|----|-------|--------|------|
| — | *(sin tareas en curso)* | — | — |

---

## 🟩 Hecho

| ID | Tarea | Entregado |
|----|-------|-----------|
| M3-01 | **Visibilidad de la propia cosecha del trabajador** (capacidad RBAC `own_production.view` bajo `configurable_rbac`; default visible, ocultar = asignar un perfil de worker que la omita; gating de presentación de la pantalla "Mi Día", pagos fuera de alcance) | ✅ |
| M2-01b | **Imágenes de respaldo en pagos** (hasta 3 fotos por pago, bucket `payment-evidence` por tenant, flag `payment_photo_evidence`; no afecta el monto) | ✅ |
| F-04 | **Lote/guía de despacho** (`dispatch_guides`: guía por paño y cierre diario de campo, recepción vs despacho con merma, peso preciso/aprox; tras feature flag, no afecta el pago) | ✅ |
| F-01 | **Pago por kilo** (variedades + tarifa por variedad, gating por feature flags, coexistencia con pago por caja) | ✅ |
| F-05 | **Variedad por cuartel** (variedades bajo el producto; un paño = un producto/variedad; tarifa por variedad) | ✅ |
| M2-03 | **Informes exportables** (PDF de liquidaciones con resumen por unidad, CSV de producción y CSV de ranking segmentado; flag `report_export`, [Backlog §8](../producto/backlog-reunion.md)) | ✅ |
| M2-01 | Imágenes de respaldo en el registro de picking (foto + Storage por tenant) | ✅ |
| M2-02 | Accesibilidad: tamaño de texto configurable (Normal/Grande/Extra) | ✅ |
| M1-01 | RBAC configurable (perfiles de permisos) | ✅ |
| M1-02 | Destare + tipos de caja + alertas de peso/merma | ✅ |
| B-01 | Registro de picking con tarifa congelada + badge QR | ✅ |
| B-02 | Cola offline de registro | ✅ |
| B-03 | Cuadrillas / Modo Capataz + equipo del día | ✅ |
| B-04 | Liquidaciones y pagos (individual / cuadrilla) | ✅ |
| B-05 | Consola de plataforma (super-admin) + auditoría | ✅ |
| B-06 | Multi-cliente (multitenancy) + RLS por tenant | ✅ |

---

## Cómo mantener este tablero

- Al **empezar** una tarea, muévela de *Por hacer* a *En curso*.
- Al **terminarla**, muévela a *Hecho* y añade una entrada en el [Changelog](../changelog.md).
- Las tareas nuevas que salgan de una [decisión de negocio](../legacy/decisiones-negocio.md)
  entran en *Por hacer* con su estimación.
