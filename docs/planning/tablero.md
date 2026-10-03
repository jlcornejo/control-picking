# Tablero

Tablero de tareas tipo Kanban del proyecto, en tres columnas: **Por hacer**, **En curso** y
**Hecho**. Es la vista operativa del [planning](vision-general.md).

!!! info "Tablero en formato tabla (por ahora)"
    Este tablero es una **tabla versionada** en la documentación: se actualiza por commit.
    Un tablero **interactivo** (arrastrar tarjetas, que persista en vivo) está previsto como
    una fase siguiente dentro de la consola de plataforma. Mientras tanto, esta vista cumple
    la función de "no depender de Jira" y mantener todo en un solo lugar compartible.

> **Convención de IDs**: `F-xx` (paridad/legacy), `M2-xx` / `M3-xx` (hitos del backlog).
> **Última actualización**: 2026-10-02.

---

## 🟦 Por hacer

| ID | Tarea | Origen | Estimación | Prioridad |
|----|-------|--------|-----------|:---------:|
| F-01 | Confirmar y, si aplica, implementar **pago por kilo** | [Decisión 1](../legacy/decisiones-negocio.md#1-pago-por-kilo-o-por-bandeja) | 2–3 d | 🔴 P0 |
| F-02 | **Calidad**: catálogo + captura en registro | [Decisión 2](../legacy/decisiones-negocio.md#2-calidad-afecta-la-tarifa) | 2–3 d | 🟡 P1 |
| F-03 | **Calidad afecta tarifa** (tarifa por producto + calidad) | [Decisión 2](../legacy/decisiones-negocio.md#2-calidad-afecta-la-tarifa) | +3–4 d | 🟡 P1 |
| F-04 | **Lote/guía de despacho** (si se confirma) | [Decisión 3](../legacy/decisiones-negocio.md#3-loteguia-de-despacho) | 5–8 d | 🟡 P2 |
| F-05 | **Variedad por cuartel** (si se confirma) | [Decisión 4](../legacy/decisiones-negocio.md#4-variedad-por-cuartel) | 0,5 d | 🟢 P3 |
| M2-01b | Imágenes de respaldo **en pagos** (pendiente) | [Backlog §5](../producto/backlog-reunion.md) | 2–3 d | 🟡 P1 |
| M2-03 | Informes exportables (PDF / Excel) | [Backlog §8](../producto/backlog-reunion.md) | 5–7 d | 🟡 P1 |
| M2-04 | Ticketera de soporte (MVP bandeja) | [Backlog §6](../producto/backlog-reunion.md) | 3–4 d | 🟡 P1 |
| M3-01 | Visibilidad de cosecha del trabajador (capacidad RBAC) | [Backlog §3](../producto/backlog-reunion.md) | 1–2 d | 🟢 P2 |

---

## 🟨 En curso

| ID | Tarea | Origen | Nota |
|----|-------|--------|------|
| — | *(sin tareas en curso)* | — | — |

---

## 🟩 Hecho

| ID | Tarea | Entregado |
|----|-------|-----------|
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
