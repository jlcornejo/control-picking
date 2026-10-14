# Requisitos — Pago por kilo + Variedades de producto (F-01 + extensión F-05)

> **Estado**: Borrador para revisión de diseño.
> **IDs del tablero**: F-01 (pago por kilo, 🔴 P0) + F-05 (variedad por cuartel, 🟢 P3,
> ampliada a "variedades de producto" en la jerarquía).
> **Idioma**: contenido de negocio en español (user stories y criterios de aceptación);
> identificadores técnicos (tablas, columnas, flags) en inglés según la convención del proyecto.

## 1. Resumen

Hoy Fundo360 paga la cosecha **siempre por cantidad de cajas** (`Σ quantity × rate_amount_snapshot`),
y el peso (destare) existe solo como control de merma que **no altera el pago** (ver
domain-rules §26). El cliente (Campo Viejo) confirmó que para ciertos productos el pago es
**por kilo recolectado**, no por caja.

Este cambio introduce la **coexistencia** de dos modelos de pago dentro de un mismo tenant,
resuelta por el enum **existente** `products.unit_measure`:

- `unit_measure = 'box'` → pago por caja (comportamiento actual, **no se debe romper**).
- `unit_measure = 'kg'` → pago por kilo recolectado.

Además incorpora **variedades de producto** como parte de la jerarquía (un producto tiene N
variedades; p. ej. Frambuesa → Heritage, Regina; Mora → Navajo), con **tarifa propia por
variedad**, y conecta la **jerarquía física** (un paño/cuartel tiene un único
producto/variedad; las melgas heredan del paño) y el **destare por tipo de caja** (ya
existente) con el nuevo pago por kilo: cuando el destare está activo, el **peso neto**
(`net_weight_kg = bruto − tara`) pasa a ser la **base de pago** para productos por kilo.

Todo lo nuevo orientado a usuario queda **detrás de feature flags** con override por tenant,
según la regla de arquitectura de `feature-flags`.

### Estado actual verificado (leído de las migraciones, no asumido)

| Elemento | Estado real hoy |
|----------|-----------------|
| `products.unit_measure` | enum `unit_measure('box','kg')`, **ya existe**, `NOT NULL`. |
| `products` multi-tenant | tiene `organization_id NOT NULL` + `UNIQUE (id, organization_id)` + trigger `set_organization_id`. |
| `rates` | cuelga de `product_id` (FK compuesta `(product_id, organization_id)`), `amount CHECK > 0`, `effective_from`, `status('current'|'historical')`, índice único parcial **un `current` por `product_id`**. |
| `blocks.product_id` | `NOT NULL`, FK compuesta a `products`. **No existe** `variety_id`. |
| `field_rows` (melgas) | **no** tienen producto ni tarifa propios; heredan del `block` (confirmado en el comentario de la migración). |
| `box_types` | por organización, con `tare_weight_kg`, `target_net_weight_kg`, `tolerance_over/under/unit`, flag `box_tare_control`, `UNIQUE (id, organization_id)`. |
| `picking_records` | `quantity NUMERIC(10,2) CHECK > 0`, `rate_amount_snapshot NUMERIC(12,2) CHECK > 0`, `box_type_id`, `gross_weight_kg`, `tare_snapshot_kg`, `net_weight_kg`, `out_of_tolerance`. **No existe** campo de kilos pagables ni `variety_id`. |
| Liquidación (`settlements/index.ts`) | computa `amount = quantity × rate_amount_snapshot` **siempre**, para individuales y cuadrillas (nivel 1 y 2). |
| Registro (`picking-records/index.ts`) | resuelve la tarifa con `rates.eq('product_id', block.product_id).eq('status','current')`; congela `rate.amount` en `rate_amount_snapshot`. |
| Inmutabilidad | trigger `prevent_paid_settlement_update` bloquea UPDATE de settlements `paid`; las correcciones de picking son soft-update (fila de auditoría con `original_record_id`). |

**Supuestos declarados** (a validar en la revisión de diseño):
- Los datos existentes son todos productos por caja (`unit_measure='box'`); no hay productos
  `'kg'` en producción todavía. La migración debe no obstante soportar que un producto `'box'`
  preexistente conviva con nuevos `'kg'`.
- Los `blocks` existentes no tienen variedad (la columna aún no existe); al introducir
  `variety_id` quedará `NULL` para todos, lo que debe seguir siendo válido.
- El flag `box_tare_control` seguirá gobernando la captura de peso; el pago por kilo se
  gobierna con un flag nuevo (ver Decisión D-8).

---

## 2. Requisitos funcionales (user stories)

### Pago por kilo (coexistencia con pago por caja)

**US-01 — Como administrador**, quiero definir si un producto se paga por caja o por kilo
mediante `products.unit_measure`, para que un mismo tenant pueda operar productos por caja y
por kilo en paralelo sin romper lo existente.

**US-02 — Como supervisor/anotador**, al registrar la cosecha de un producto por kilo quiero
que el sistema tome como base de pago los **kilos recolectados** (peso neto cuando el destare
está activo, o kilos capturados manualmente cuando no lo está), para pagar correctamente por
kilo.

**US-03 — Como administrador**, quiero que la liquidación calcule el monto según la unidad de
pago del producto de cada registro: por caja `Σ(cajas × $/caja)` y por kilo `Σ(kilos × $/kg)`,
para que la liquidación sea correcta cuando conviven ambos modelos en el período.

**US-04 — Como trabajador**, quiero ver mi producción y estimado del día expresados en la
unidad correcta (cajas o kilos) y su valor, para entender cuánto llevo ganado.

### Variedades de producto

**US-05 — Como administrador**, quiero crear N variedades bajo un producto (p. ej. Frambuesa →
Heritage, Regina), para reflejar las variedades reales del campo.

**US-06 — Como administrador**, quiero fijar una **tarifa propia por variedad** (versionada,
con historial, igual que las tarifas de producto), para pagar distinto según variedad.

**US-07 — Como administrador**, quiero asignar a cada paño/cuartel un producto y —cuando el
producto tenga variedades— **una variedad**, respetando que un paño tiene un único
producto/variedad (no se mezclan), para que la cosecha de ese paño se tarifique con la
variedad correcta.

**US-08 — Como supervisor/anotador**, quiero que al registrar en un paño con variedad el
sistema resuelva y congele la tarifa de **esa variedad** (y no una genérica del producto),
para que el pago sea el de la variedad.

### Destare conectado al pago por kilo

**US-09 — Como administrador**, quiero seguir manteniendo N tipos de caja con su destare
configurable (ya existe), para que el peso neto por caja sea confiable como base de pago por
kilo.

**US-10 — Como supervisor/anotador**, cuando el destare está activo y el producto es por kilo,
quiero que los **kilos pagables** se deriven del peso neto (`bruto − tara`); cuando el destare
no está activo para ese producto/tenant, quiero poder **capturar los kilos manualmente**, para
registrar producción por kilo en ambos escenarios.

### Gating

**US-11 — Como super-admin de plataforma**, quiero activar/desactivar "pago por kilo" y
"variedades" por organización (override sobre el default global), para hacer rollout
progresivo y tener kill-switch.

---

## 3. Criterios de aceptación (numerados, testables)

### Coexistencia y resolución de pago

- **CA-01** Un producto con `unit_measure='box'` se paga exactamente como hoy:
  `Σ(quantity × rate_amount_snapshot)`. Un test de regresión con datos actuales produce el
  mismo `total_amount` que antes del cambio.
- **CA-02** Un producto con `unit_measure='kg'` se liquida como `Σ(kilos × rate_snapshot_kg)`,
  donde `kilos` = peso neto (destare activo) o kilos capturados manualmente (destare inactivo).
- **CA-03** En un mismo período y trabajador con registros `box` y `kg`, la liquidación suma
  ambos subtotales con la fórmula que corresponde a cada registro (verificado por su
  `unit_measure` o un indicador congelado en el registro — ver Decisión D-6).
- **CA-04** `rate_amount_snapshot` sigue siendo inmutable y `> 0`: representa `$/caja` para
  registros `box` y `$/kg` para registros `kg`; una vez creado el registro no cambia aunque la
  tarifa vigente cambie después.
- **CA-05** Las liquidaciones `paid` siguen siendo inmutables (trigger
  `prevent_paid_settlement_update` intacto); el cálculo nuevo no las modifica.
- **CA-06** La liquidación de cuadrilla (nivel 1 y nivel 2, `settlements/index.ts`) aplica la
  misma resolución por unidad que la individual.

### Base de pago en kilos

- **CA-07** Con `box_tare_control` activo y producto `kg`: al registrar con `box_type_id` +
  `gross_weight_kg`, los kilos pagables = `net_weight_kg = max(gross − tare, 0)` (misma fórmula
  que domain-rules §24), y la liquidación usa ese valor.
- **CA-08** Con destare inactivo y producto `kg`: el registro acepta un valor de kilos
  capturado manualmente (`> 0`); si no se envía o es `≤ 0`, el registro se rechaza con error de
  validación.
- **CA-09** Para producto `kg`, los kilos pagables se persisten en el registro de forma que la
  liquidación no dependa de recalcular tara después (snapshot inmutable). Ver Decisión D-5 para
  el campo concreto.
- **CA-10** `out_of_tolerance` sigue siendo **no bloqueante** (domain-rules §27): el registro
  `kg` con destare se guarda igual aunque quede fuera de tolerancia; la alerta se mantiene.

### Variedades

- **CA-11** Existe `product_varieties` por organización con: `id`, `organization_id NOT NULL`,
  `product_id` (FK compuesta `(product_id, organization_id)` a `products`), `name`, `status`
  (`entity_status`), `created_at`, `updated_at`, trigger `set_organization_id`, trigger
  `update_updated_at_column`, RLS espejando `box_types`/`blocks`, y `UNIQUE (id, organization_id)`.
- **CA-12** Un producto puede tener 0..N variedades. Un producto **sin** variedades funciona
  como hoy (tarifa a nivel de producto). (Ver Decisión D-1.)
- **CA-13** `blocks.variety_id` existe (FK compuesta `(variety_id, organization_id)` a
  `product_varieties`, `ON DELETE RESTRICT`), **nullable** para compatibilidad con blocks
  existentes y con productos sin variedades.
- **CA-14** Invariante de integridad: la variedad referenciada por un block debe pertenecer al
  **mismo producto** del block y a la **misma organización**. Si el producto del block tiene al
  menos una variedad activa, `variety_id` es **obligatorio**; si el producto no tiene
  variedades, `variety_id` debe ser `NULL`. (Ver Decisión D-2 para la capa que lo valida.)
- **CA-15** Las melgas (`field_rows`) siguen **sin** producto ni variedad propios: heredan del
  block. No se agregan columnas de producto/variedad a `field_rows` (domain-rules §21 ampliada:
  un paño tiene exactamente un producto y, cuando aplica, una variedad).

### Tarifas por variedad

- **CA-16** `rates` soporta tarifa por variedad conservando la versión actual por producto.
  (Ver Decisión D-3 para la estrategia; recomendación: añadir `variety_id` nullable.)
- **CA-17** Se mantiene "exactamente una tarifa `current`" por sujeto de tarifa (producto sin
  variedad, o par producto+variedad), reemplazando el índice único actual por uno que
  contemple la variedad. (domain-rules §10.)
- **CA-18** Al registrar en un block con variedad, la tarifa congelada es la `current` de esa
  variedad; en un block sin variedad, la `current` del producto. Si no hay tarifa vigente
  aplicable, el registro se rechaza (`NOT_FOUND`/`No hay tarifa vigente`), como hoy.
- **CA-19** El historial de tarifas por variedad es inmutable (`amount CHECK > 0`); crear una
  nueva pone la anterior en `historical` (domain-rules §7, §9).

### Gating

- **CA-20** Existen en `platform_feature_flags` los flags necesarios (ver Decisión D-8) con
  `strategy='org_override'` y default global **off**. Insertados por migración (`ON CONFLICT DO NOTHING`).
- **CA-21** Con el flag de pago por kilo **off** para una organización, la app funciona como
  hoy (solo caja), sin errores; crear productos `kg` o variedades queda oculto/inactivo según
  el flag correspondiente.
- **CA-22** La resolución del estado efectivo usa override por org → default global (nunca solo
  el default), reutilizando `useFeatureFlag` en móvil (y el helper equivalente en web).

### Multi-tenant / migraciones / RBAC

- **CA-23** Toda tabla/columna nueva cumple database-migrations: UUID PK, snake_case,
  `created_at`/`updated_at`, índice en toda FK, FK compuestas de tenant con
  `UNIQUE (id, organization_id)`, RLS habilitada, trigger `set_organization_id`.
- **CA-24** La migración es segura para datos existentes: backfill no rompe blocks sin variedad
  ni productos por caja; ninguna columna nueva obligatoria sin default sobre tablas con datos.
- **CA-25** El timestamp de la migración es posterior a `20261002000003` (la más reciente).
- **CA-26** RBAC se preserva: solo `admin` crea/edita variedades y tarifas por variedad
  (domain-rules §18); supervisor/crew_lead/worker solo leen variedades activas de su
  organización (espejo de la policy `member_read_active_box_types`). Ningún dato financiero
  (tarifas por kilo/variedad) se expone al rol trabajador salvo su propio estimado
  (domain-rules §19).

---

## 4. Requisitos no funcionales

- **NFR-01 Compatibilidad hacia atrás**: ningún registro, liquidación o pago existente cambia
  de valor. Regresión obligatoria sobre el cálculo por caja.
- **NFR-02 Aislamiento de tenant**: variedades, tarifas por variedad y pago por kilo respetan
  RLS por `organization_id` y FKs compuestas; ningún cruce entre tenants.
- **NFR-03 Precisión numérica**: kilos con la misma precisión que los pesos existentes
  (`NUMERIC(10,3)`); montos en `NUMERIC(12,2)`. El redondeo de subtotales sigue el patrón
  actual (`Math.round(x*100)/100`).
- **NFR-04 Documentación viva**: actualizar `docs/dominio/reglas-de-negocio.md`,
  `docs/api/vision-general.md`, `docs/legacy/decisiones-negocio.md` (cerrar decisiones 1 y 4),
  mover F-01/F-05 en `docs/planning/tablero.md`, y añadir entrada en `CHANGELOG.md` + `docs/changelog.md`.
- **NFR-05 Testabilidad**: el cálculo de pago (caja vs kilo, con/sin destare, con/sin variedad)
  debe ser unit-testeable de forma aislada; property-based tests para los invariantes de
  dominio afectados (§7–§11, §21, §26 reinterpretado).

---

## 5. Decisiones de diseño abiertas (con recomendación)

> Estas son las preguntas que el documento de diseño debe resolver. Cada una incluye la
> recomendación de este autor; el diseño las confirma o las corrige.

**D-1 — ¿Un producto puede tener cero variedades (variedad opcional) o se exige al menos una?**
*Recomendación*: **opcional a nivel de producto**. El legacy modela la variedad como atributo
del cuartel, y hay productos (p. ej. arándano) sin variedades relevantes. Un producto sin
variedades conserva su tarifa a nivel de producto; uno con variedades obliga a elegir variedad
en el block. Esto no rompe datos existentes (todos quedan "sin variedad").

**D-2 — ¿Dónde se valida la regla "si el producto tiene variedades, el block debe traer una
variedad del mismo producto"?**
*Recomendación*: la validación cruza tablas (block → product → varieties), por lo que un CHECK
simple no alcanza. Enforcar con: (a) FK compuesta `(variety_id, organization_id)` para tenant;
(b) un **trigger `BEFORE INSERT/UPDATE` en `blocks`** que valide que `variety_id` pertenece a
`product_id` y que exige/prohíbe variedad según si el producto tiene variedades activas;
(c) validación espejo en el servicio (Edge Function `blocks`) para dar error 422 legible. La DB
es la barrera real (consistente con el uso de triggers del proyecto).

**D-3 — ¿Cómo evolucionar `rates` para tarifa por variedad?**
*Recomendación*: **añadir `rates.variety_id` nullable** (FK compuesta
`(variety_id, organization_id)` a `product_varieties`). Una tarifa con `variety_id = NULL` es
tarifa a nivel de producto (compat total con datos actuales); con `variety_id` seteado es la
tarifa de esa variedad. Alternativa descartada: tabla separada `variety_rates` (duplica el
versionado y la lógica de `current/historical`). Mantener una sola tabla preserva el patrón de
snapshot y el historial.

**D-4 — ¿Cómo garantizar "una sola tarifa current por sujeto de tarifa" con variedades?**
*Recomendación*: reemplazar el índice único parcial actual
`CREATE UNIQUE INDEX ... ON rates(product_id) WHERE status='current'` por **dos índices únicos
parciales**: uno sobre `(product_id)` where `status='current' AND variety_id IS NULL`, y otro
sobre `(product_id, variety_id)` where `status='current' AND variety_id IS NOT NULL`. Así
coexisten una tarifa de producto y una por cada variedad, cada una única.

**D-5 — ¿Necesita `picking_records` un campo nuevo para los kilos pagables?**
*Recomendación*: **sí, añadir `paid_quantity_kg NUMERIC(10,3)` nullable** (snapshot inmutable),
que es la base de pago cuando `unit_measure='kg'`:
- destare activo → `paid_quantity_kg = net_weight_kg`;
- destare inactivo → `paid_quantity_kg` = kilos capturados manualmente.
Para productos `box`, `paid_quantity_kg` queda `NULL` y el pago usa `quantity` como hoy.
*Alternativa evaluada*: reutilizar `net_weight_kg` directamente. Se descarta porque
`net_weight_kg` solo existe con destare y es "auditoría de pesaje por caja", no base de pago; y
no cubre el caso de captura manual sin caja. Un campo explícito deja clara la intención y
mantiene `net_weight_kg` con su semántica actual. Debe llevar CHECK `paid_quantity_kg IS NULL OR
paid_quantity_kg > 0`.

**D-6 — ¿Cómo sabe la liquidación qué fórmula aplicar por registro?**
*Recomendación*: resolver por el `unit_measure` del producto del registro (join
`blocks → products`), **y además** congelar en el registro un indicador de unidad de pago para
no depender de que el producto no cambie de unidad en el futuro. Opción recomendada: añadir
`picking_records.payment_unit` (enum reutilizando `unit_measure`) como snapshot al registrar.
Alternativa mínima: derivarlo siempre por join (más simple, pero frágil si un producto cambia
de `box` a `kg`). Dado el patrón de snapshots inmutables del proyecto, se recomienda el campo
congelado.

**D-7 — ¿Cómo representa `rate_amount_snapshot` el `$/kg` vs `$/caja`?**
*Recomendación*: **mismo campo, significado según `payment_unit` del registro**. No se añade
columna nueva de tarifa; `rate_amount_snapshot` es `$/caja` cuando `payment_unit='box'` y
`$/kg` cuando `payment_unit='kg'` (sigue con `CHECK > 0`). El subtotal es
`base × rate_amount_snapshot`, con `base = quantity` (box) o `paid_quantity_kg` (kg). Esto
permite box y kg lado a lado sin cambiar la forma del registro.

**D-8 — Granularidad de los feature flags.**
*Recomendación*: **dos flags `org_override`, default off**:
- `kg_payment` — "Pago por kilo": habilita productos `unit_measure='kg'`, la captura de kilos
  pagables y el cálculo por kilo en liquidación.
- `product_varieties` — "Variedades de producto": habilita el catálogo de variedades, su
  asignación en blocks y la tarifa por variedad.
Son capacidades independientes (un tenant podría querer variedades sin pago por kilo, o
viceversa). Reusan `box_tare_control` ya existente para la fuente del peso (no se crea un flag
nuevo de destare). Insertar ambos en `platform_feature_flags` vía migración.

**D-9 — Comportamiento de corrección (soft-update) para registros `kg`.**
*Recomendación*: la corrección debe copiar también `paid_quantity_kg` y `payment_unit` al
registro de auditoría, igual que ya hace con el snapshot de destare, y permitir corregir los
kilos pagables (no solo `quantity`) dentro de la misma jornada (domain-rules §5-6). El diseño
debe especificar el contrato de `PUT /picking-records/:id` para el caso kg, manteniendo
`paid_quantity_kg > 0`.

**D-10 — `quantity` en registros `kg`.**
*Recomendación*: para productos `kg` con destare, `quantity` sigue representando **nº de cajas
pesadas** (sirve para conteo/merma) y `paid_quantity_kg` los kilos a pagar. Para captura manual
sin caja, definir si `quantity` representa "nº de entregas" o se fija en 1. El diseño debe
cerrar esto respetando el invariante `quantity CHECK > 0` (domain-rules §4): `quantity` nunca
puede ser cero ni negativa en ningún escenario.

---

## 6. Fuera de alcance

- **Calidad que afecta la tarifa** (F-02/F-03, decisión de negocio 2): no se implementa aquí.
- **Lote / guía de despacho** (F-04, decisión 3): fuera de alcance.
- **Báscula Bluetooth** (`bluetooth_scale`): la captura de peso sigue siendo manual/por balanza
  existente; integrar BT no es parte de este cambio.
- **Migrar productos existentes de `box` a `kg`**: no se automatiza; es una acción manual del
  administrador por producto.
- **Reportes/métricas nuevos por variedad o por kilo** más allá de reflejar la unidad correcta
  en las vistas ya existentes (producción del trabajador, detalle de liquidación).
- **Cambios en el modelo de cuadrillas/day_roster**: la resolución por unidad aplica dentro de
  la lógica de cuadrilla ya existente, sin rediseñarla.
