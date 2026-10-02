# Planning del proyecto

Vista única del plan de Fundo360: las **etapas**, qué está **listo** y **pendiente**, y las
**estimaciones de tiempo** por tema. Reemplaza la necesidad de Jira/Confluence: toda la
información del proyecto vive aquí, versionada y compartible por link.

> **Última actualización**: 2026-10-02.
> Para el detalle de tareas en curso, ver el [Tablero](tablero.md).
> Para el histórico de cambios, ver el [Changelog](../changelog.md).

---

## Etapas del proyecto

| Fase | Alcance | Estado |
|------|---------|:------:|
| **Fase 1 — MVP** | Campos, trabajadores, tarifas, picking, consulta, RBAC | 🟡 En desarrollo |
| **Fase 2** | Liquidaciones automáticas, pagos, asignación de supervisión | 🟡 En desarrollo |
| **Fase 3** | Dashboard de métricas, rankings, reportes, alertas | ⚪ Planificada |
| **Fase 4** | Multi-fundo, offline sync, integraciones contables, app nativa | ⚪ Planificada |

Leyenda: 🟢 Lista · 🟡 En desarrollo · ⚪ Planificada.

---

## Qué está listo

Verificado en el repositorio (migraciones, Edge Functions, web y móvil):

- **Multi-cliente (multitenancy)** con aislamiento por organización.
- **Consola de plataforma** (super-admin): organizaciones, métricas, auditoría, modo soporte.
- **Roles base + RLS** (admin, supervisor, encargado, trabajador) y **RBAC configurable**.
- **Estructura productiva**: campo → paño → melga.
- **Productos y tarifas** con historial de tarifa.
- **Cuadrillas / Modo Capataz** y armado del equipo del día.
- **Registro de picking** con tarifa congelada, badge QR y **cola offline**.
- **Destare y control de merma** por peso con tolerancia configurable.
- **Liquidaciones y pagos** (individual o a cuadrilla).
- **Métricas** y **feature flags** por organización.
- **Cambio de contraseña obligatorio** en el primer ingreso.

---

## Qué está pendiente

Agrupado por su origen. El detalle operativo (quién/cuándo) vive en el [Tablero](tablero.md).

### Paridad con el legacy (antes de terreno)

Depende de [decisiones de negocio](../legacy/decisiones-negocio.md). Estimaciones orientativas:

| Tema | Condición | Estimación |
|------|-----------|-----------|
| Pago por kilo | Solo si negocio confirma pago por kilo | 2–3 días |
| Calidad (catálogo + registro) | Solo si se reporta por calidad | 2–3 días |
| Calidad afecta tarifa | Solo si la tarifa depende de calidad | +3–4 días |
| Lote/guía de despacho | Solo si requieren guía de despacho | 5–8 días |
| Variedad por cuartel | Solo si usan variedad | 0,5 día |

### Backlog de reunión (ya priorizado)

El backlog detallado está en [Producto → Backlog de reunión](../producto/backlog-reunion.md).
Resumen de hitos:

| Hito | Contenido | Estado |
|------|-----------|:------:|
| **M1 — Núcleo de pesaje** | RBAC configurable + destare/tolerancia | 🟢 Entregado |
| **M2 — Confianza y trazabilidad** | Imágenes de respaldo, accesibilidad (fuente), informes PDF/Excel, ticketera | 🟡 Pendiente |
| **M3 — Configurabilidad fina** | Visibilidad de cosecha del trabajador como capacidad | ⚪ Pendiente |

---

## Estimaciones por tema (pendientes)

!!! note "Cómo leer las estimaciones"
    Son estimaciones de **esfuerzo de desarrollo** (días-persona), no fechas de calendario.
    Incluyen implementación + pruebas, no el tiempo de validación con negocio.

| Tema | Hito | Estimación | Notas |
|------|------|-----------|-------|
| Imágenes de respaldo (picking + pagos) | M2 | 4–6 días | Storage por tenant + captura móvil + visor web. |
| Accesibilidad: escala de fuente | M2 | 2–3 días | Preferencia por usuario, tokens de tipografía. |
| Informes exportables (PDF/Excel) | M2 | 5–7 días | Catálogo de informes + exportadores. |
| Ticketera de soporte (MVP) | M2 | 3–4 días | Formulario + bandeja del admin de plataforma. |
| Visibilidad de cosecha del trabajador | M3 | 1–2 días | Como capacidad RBAC. |

> Las estimaciones se ajustan a medida que se cierran las decisiones de negocio y se
> refina el alcance de cada tema.

---

## Flujo de trabajo

1. **Decisión de negocio** → se registra en [Decisiones de negocio](../legacy/decisiones-negocio.md).
2. Si requiere trabajo → entra como ítem en el [Tablero](tablero.md) con su estimación.
3. Al completarse → se mueve a "Hecho" y se registra en el [Changelog](../changelog.md).
