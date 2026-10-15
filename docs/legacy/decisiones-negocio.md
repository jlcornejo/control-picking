# Decisiones de negocio

Preguntas que definen el alcance de la prueba en terreno. Cada una indica el **impacto** si
se decide implementarla y lo que necesitamos **confirmar con el cliente**.

> Esta página es la que se lleva a la reunión con negocio. Las decisiones **abiertas** se
> deben responder antes de cerrar el alcance; las **cerradas** quedan registradas para
> evitar rediscutirlas.

---

## Decisiones abiertas

### 2. Calidad: ¿afecta la tarifa?

- **Contexto**: el legacy clasifica la cosecha en **Comercial, IQF, Bulk, Proceso** y lo
  asocia al lote.
- **Pregunta para negocio**:
    1. ¿La **tarifa** que se paga al cosechero **cambia según la calidad**?
    2. ¿Necesitan **reportar** cuántos kilos salieron de cada calidad?
- **Decisión (validada con negocio)**: la calidad **no afecta la tarifa** y **no se mide**.
  No se reporta por calidad por ahora. Es **dato muerto → se descarta**. Las tareas F-02
  (catálogo + captura de calidad) y F-03 (calidad afecta tarifa) quedan **descartadas**; no
  se implementan. Si el negocio lo requiere a futuro, se reabre como feature nueva.

### 3. Lote/guía de despacho

- **Contexto**: el legacy agrupa la cosecha en **lotes** con número de **guía**, **estado**
  (ej. "GUIA ASIGNADA") y **condición** (ABIERTO / CERRADO). Pareciera modelar la fruta que
  **sale del campo hacia planta** en una guía de despacho.
- **Hoy en Fundo360**: la cosecha se registra por trabajador/día, sin un agrupador de lote.
- **Pregunta para negocio**: ¿Necesitan **guías de despacho** (agrupar lo que sale del campo,
  cerrarlo y asignarle número de guía), o lo único relevante es **cuánto cosechó cada
  trabajador** para pagarle?
- **Impacto**:
    - Si solo importa el pago por trabajador → el modelo actual **ya sirve**.
    - Si necesitan la guía de despacho → es una **feature nueva** (la de mayor tamaño): tabla
      de lotes + estados + agrupar los registros bajo un lote.
- **Recomendación**: para una **primera** prueba en terreno probablemente se pueda salir
  **sin** esto, si el objetivo es validar registro + pago. Confirmar con el cliente.

---

## Decisiones cerradas

Registradas para no volver a discutirlas.

### 1. Pago por kilo — además de por bandeja/caja

- **Decisión**: se **implementa el pago por kilo** y **coexiste** con el pago por caja. El
  producto define su unidad (`products.unit_measure` = `box` | `kg`). En productos por kg,
  la base pagable son los kilos netos (`paid_quantity_kg`) y la tarifa es $/kg; en productos
  por caja, el pago sigue siendo por cantidad de cajas, sin cambios.
- **Gating**: detrás del feature flag `kg_payment` (override por organización). Con el flag
  apagado, la plataforma funciona solo con caja, como antes.
- **Captura en kg**: con destare, el peso neto (`bruto − tara`) es la base pagada; sin
  destare, se capturan los kilos manualmente. El `rate_amount_snapshot` se congela al
  registrar (inmutable), igual que en caja.

### 4. Variedad bajo el producto

- **Decisión**: se **implementan variedades** como un nivel bajo el producto
  (producto → variedad). Un paño (`block`) puede tener **un solo** producto/variedad y, si
  el producto tiene variedades, la variedad del paño es **obligatoria**. Cada variedad puede
  tener su **propia tarifa** (tarifa por sujeto: producto o variedad).
- **Gating**: detrás del feature flag `product_varieties` (override por organización). Con el
  flag apagado, no hay UI de variedades y los paños operan solo con producto.

### Contratista / furgón = Encargado de cuadrilla

- **Decisión**: el "contratista" o "furgón" (quien lleva al personal al campo) **ya está
  cubierto** por el modelo de **cuadrillas** (`crews` + `crew_lead`) y el armado del equipo
  del día (`day_roster`), que permite que un trabajador vaya con un líder un día y con otro
  al día siguiente (relación variable).
- **Acción**: no se crea una entidad "contratista" nueva.
- **A confirmar (menor)**: a quién se paga (al furgón que reparte, o a cada trabajador) y si
  el furgón necesita datos propios (RUT, teléfono). No bloquea.

### Tipo de cosecha (Manual / Mecanizada)

- **Decisión**: **descartado**. La cosecha mecanizada no se usa en Campo Viejo.
- **Acción**: no se implementa. Queda como posible mejora futura.

### Anotador = Supervisor

- **Decisión**: el "anotador" del legacy es el **supervisor** en Fundo360; el registro ya
  guarda quién lo hizo (`recorded_by`). No es una entidad aparte.

### Cultivo = Producto

- **Decisión**: los cultivos (arándano, frambuesa, mora) se modelan con el **maestro de
  productos**; se crean tantos como haga falta.

---

## Tabla resumen

| # | Decisión | Estado | Impacto si va |
|---|----------|:------:|---------------|
| 1 | Pago por kilo (coexiste con caja) | ✅ Cerrada (implementada) | Alto — definió el modelo |
| 2 | Calidad afecta tarifa | ✅ Cerrada (descartada) | No se mide ni afecta tarifa — dato muerto |
| 3 | Lote/guía de despacho | ✅ Cerrada (implementada) | F-04: guía por paño y cierre de campo + recepción vs despacho |
| 4 | Variedad bajo el producto | ✅ Cerrada (implementada) | Variedad + tarifa por variedad |
| — | Contratista = cuadrilla | ✅ Cerrada | — |
| — | Tipo cosecha | ✅ Cerrada (descartada) | — |
| — | Anotador = supervisor | ✅ Cerrada | — |
| — | Cultivo = producto | ✅ Cerrada | — |

---

## Siguiente paso

Una vez que negocio responda las decisiones abiertas, cada una que requiera trabajo se
convierte en un ítem del [planning del proyecto](../planning/vision-general.md), priorizado
según su impacto en la salida a terreno.
