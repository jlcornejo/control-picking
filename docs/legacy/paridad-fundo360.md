# Paridad con Fundo360

Contraste entre lo que hace la app **legacy** y lo que hoy tiene **Fundo360**. El objetivo
es ver, de un vistazo, qué está cubierto antes de la prueba en terreno.

> **Base de la revisión**: migraciones SQL, Edge Functions, `packages/shared` y la app
> móvil (Expo), al 2026-10-02.

## Leyenda

- ✅ **Cubierto** — existe y es equivalente (o mejor) que el legacy.
- ⚠️ **Parcial** — existe pero con diferencias a validar.
- ❌ **Falta** — no existe en Fundo360.
- ❔ **A decidir** — depende de una [decisión de negocio](decisiones-negocio.md).

---

## Catálogos maestros

| Legacy | Fundo360 | Estado | Nota |
|--------|----------|:------:|------|
| Enrolamiento (trabajadores) | `workers` (nombre, RUT, teléfono, rol, badge QR) | ✅ | Admin móvil: Trabajadores. |
| PREDIOS (predio + cuartel) | `fields` + `blocks` | ✅ | Admin móvil: Campos y Paños. |
| TIPO ENVASES (tara + peso máx.) | `box_types` (tara, peso objetivo, tolerancia) | ✅ | Bajo *feature flag* `box_tare_control`. |
| Productos / cultivos | `products` (+ `rates` con tarifa histórica) | ✅ | Se crean N productos (arándano/frambuesa/mora). |
| Anotador | Rol **supervisor** (`recorded_by` en el registro) | ✅ | El anotador = supervisor; no es entidad aparte. |
| Contratistas | `crews` + `crew_lead` + `day_roster` | ✅ | El "furgón/contratista" = Encargado de cuadrilla. |
| CALIDAD (Comercial/IQF/Bulk/Proceso) | — | ❔ | No existe. Ver [decisión](decisiones-negocio.md#2-calidad-afecta-la-tarifa). |
| TIPO COSECHA (Manual/Mecanizada) | — | ❌ | Descartado: mecanizada no se usa. |
| Variedad por cuartel (Heritage/Navajo/Regina) | — | ❔ | `blocks` no tiene variedad. Ver [decisión](decisiones-negocio.md#4-variedad-por-cuartel). |
| MATERIALES | — | ❌ | Vacío en el legacy; sin prioridad. |

---

## Registro de cosecha (picking)

| Legacy | Fundo360 | Estado | Nota |
|--------|----------|:------:|------|
| Identificar trabajador por tarjeta | Escaneo de **badge QR** real + búsqueda manual | ✅ | El legacy escribía la tarjeta como texto. |
| Registro por bandeja (hora, trabajador, kilos) | `picking_records` (cantidad, tarifa congelada, fecha) | ✅ | Con `rate_amount_snapshot`. |
| Peso neto = bruto − tara | Destare + peso neto + alerta de merma | ✅ | Supera al legacy (tolerancia configurable). |
| Registrar sin señal | **Cola offline** con sincronización al reconectar | ✅ | El legacy depende de sincronización de AppSheet. |
| Agrupar la jornada en lote/guía (estado, condición) | — | ❔ | No existe el "lote de despacho". Ver [decisión](decisiones-negocio.md#3-loteguia-de-despacho). |
| Pago por kilo vs por bandeja | Pago por `cantidad` (cajas) | ❔ | **Decisión crítica.** Ver [decisión](decisiones-negocio.md#1-pago-por-kilo-o-por-bandeja). |

---

## Pagos / liquidación

| Legacy | Fundo360 | Estado | Nota |
|--------|----------|:------:|------|
| Valor cosechado por trabajador | `settlements` + `payments` | ✅ | Soporta pago individual o a cuadrilla. |
| Desglose por fecha con subtotal | Liquidaciones por período | ✅ | Móvil: Pagos / Liquidaciones. |

---

## Lo que Fundo360 suma sobre el legacy

Más allá de la paridad, Fundo360 ya incluye capacidades que el legacy **no** tiene:

- **Multi-cliente (multitenancy)** con aislamiento por organización.
- **Consola de plataforma** (super-admin) con métricas, auditoría y modo soporte.
- **RBAC configurable** (perfiles de permisos por capacidad).
- **Cuadrillas / Modo Capataz** y armado del equipo del día (`day_roster`).
- **Control de merma** por peso con tolerancia configurable.
- **Registro offline** con cola de sincronización.
- **Tablero de métricas** en vivo.

---

## Resumen

La paridad está **casi completa**. Lo que resta no es trabajo técnico pendiente sino
**decisiones de negocio** (marcadas ❔) que, una vez resueltas, dirán si hay que construir
algo o si se descarta. La prioridad #1 es definir si el **pago es por kilo o por bandeja**.
Todo el detalle está en [Decisiones de negocio](decisiones-negocio.md).
