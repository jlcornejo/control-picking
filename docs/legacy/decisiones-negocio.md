# Decisiones de negocio

Preguntas que definen el alcance de la prueba en terreno. Cada una indica el **impacto** si
se decide implementarla y lo que necesitamos **confirmar con el cliente**.

> Esta página es la que se lleva a la reunión con negocio. Las decisiones **abiertas** se
> deben responder antes de cerrar el alcance; las **cerradas** quedan registradas para
> evitar rediscutirlas.

---

## Decisiones abiertas

### 1. Pago: ¿por kilo o por bandeja?

!!! danger "Prioridad crítica — define el modelo de datos"
    Es la decisión de mayor impacto. Conviene resolverla primero.

- **Contexto**: en el legacy, el detalle de cosecha muestra una columna **"KILOS PAGO"** y
  los subtotales están en **kilos**. Eso sugiere que el pago al cosechero es **por kilo**.
- **Hoy en Fundo360**: el pago se calcula por **cantidad** (número de cajas/bandejas); el
  peso se usa solo como control de merma, no para pagar.
- **Pregunta para negocio**: ¿Al cosechero se le paga **por kilo recolectado** o **por
  bandeja/caja entregada**?
- **Impacto**:
    - Si es **por bandeja** → el modelo actual ya sirve.
    - Si es **por kilo** → el producto se mide en kg, la cantidad registrada son kilos y la
      tarifa es $/kg. Es un ajuste de modelo que conviene cerrar antes de construir nada más.

### 2. Calidad: ¿afecta la tarifa?

- **Contexto**: el legacy clasifica la cosecha en **Comercial, IQF, Bulk, Proceso** y lo
  asocia al lote.
- **Pregunta para negocio**:
    1. ¿La **tarifa** que se paga al cosechero **cambia según la calidad**?
    2. ¿Necesitan **reportar** cuántos kilos salieron de cada calidad?
- **Impacto**:
    - Si no afecta tarifa ni se reporta → **dato muerto**, se descarta.
    - Si solo se reporta volumen → calidad es un **catálogo** + un campo en el registro (bajo).
    - Si **afecta la tarifa** → la tarifa pasa a depender de producto **+ calidad** (alto).

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

### 4. Variedad por cuartel

- **Contexto**: el legacy guarda en cada cuartel la **variedad** (Heritage y Regina son
  frambuesa; Navajo es mora) y la **superficie**.
- **Hoy en Fundo360**: el paño (`block`) tiene nombre, área y producto, pero **no** variedad.
- **Pregunta para negocio**: ¿Usan la **variedad** para reportes o pago, o es solo un dato de
  referencia que no miran?
- **Impacto**: bajo. Si la quieren, es **un campo de texto** en el paño.

---

## Decisiones cerradas

Registradas para no volver a discutirlas.

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
| 1 | Pago por kilo vs bandeja | 🔴 Abierta | Alto — define el modelo |
| 2 | Calidad afecta tarifa | 🟡 Abierta | Alto si afecta tarifa |
| 3 | Lote/guía de despacho | 🟡 Abierta | Muy alto si va |
| 4 | Variedad por cuartel | 🟢 Abierta | Bajo (un campo) |
| — | Contratista = cuadrilla | ✅ Cerrada | — |
| — | Tipo cosecha | ✅ Cerrada (descartada) | — |
| — | Anotador = supervisor | ✅ Cerrada | — |
| — | Cultivo = producto | ✅ Cerrada | — |

---

## Siguiente paso

Una vez que negocio responda las decisiones abiertas, cada una que requiera trabajo se
convierte en un ítem del [planning del proyecto](../planning/vision-general.md), priorizado
según su impacto en la salida a terreno.
