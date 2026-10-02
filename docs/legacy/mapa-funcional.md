# Mapa funcional del legacy

La "foto" de la app **Cosecha Agrícola Campo Viejo** (AppSheet): sus módulos, las entidades
que maneja y cómo se relacionan. Es la referencia de lo que el cliente ya conoce y usa.

> Reconstruido a partir del análisis de las capturas de pantalla de la app en terreno.

---

## Menú (11 secciones)

La app expone estos módulos desde su menú lateral:

| Módulo | Qué hace |
|--------|----------|
| **Anotador** | Catálogo de anotadores (supervisores que registran). |
| **CALIDAD** | Catálogo de calidades de fruta (Comercial, IQF, Bulk, Proceso). |
| **Contratistas** | Catálogo de contratistas (el "furgón" que lleva al personal). |
| **INGRESAR COSECHA** | Núcleo: registro de la cosecha organizado en lotes/guías. |
| **Enrolamiento** | Catálogo de trabajadores (cosecheros). |
| **MATERIALES** | Insumos/EPP. En la práctica está vacío. |
| **PREDIOS** | Estructura productiva: predio, cuartel, cultivo, variedad, superficie. |
| **TIPO COSECHA** | Catálogo: Manual / Mecanizada. |
| **TIPO ENVASES** | Catálogo de envases con su tara y el peso máximo por producto. |
| **Valor cosechado** | Liquidación: valor acumulado por trabajador. |
| **Assistant** | Asistente de AppSheet (genérico de la plataforma). |

---

## Entidades y campos

### Catálogos maestros

| Entidad | Campos principales | Valores observados |
|---------|--------------------|--------------------|
| **Anotador** | id, nombre | Supervisores: Claudia, Andrés, Corine, Dante… |
| **CALIDAD** | nombre, id | Comercial (1), IQF (2), Bulk (3), Proceso (4) |
| **TIPO COSECHA** | nombre, id | Manual (1), Mecanizada (2) |
| **TIPO ENVASES** | envase, peso (tara), producto, peso máximo | 11 envases; taras 0,25–0,35 kg |
| **PREDIOS** | predio, cultivo, cuartel, variedad, superficie | Frutillares, Pataguas…; variedades Heritage/Navajo/Regina |
| **Enrolamiento** | nombre, apellido paterno, apellido materno, RUT | Lista de cosecheros |
| **Contratistas** | nombre, RUT, contacto, comuna, fecha de ingreso | Independiente, Claudia, Damián… |

### Tipos de envase (tara y peso máximo)

Cada envase define la **tara** (peso propio del envase) y el **peso máximo** por producto:

| Producto | Peso máximo por bandeja |
|----------|-------------------------|
| Arándano | 2,50 kg |
| Frambuesa | 2,30 kg |
| Mora | 2,50 kg |

Las bandejas registradas van de 0,25 a 0,35 kg de tara (más una "bandeja frutillera" de
1,00 kg y una "blanca arándano grande" de 0,32 kg).

---

## El núcleo: INGRESAR COSECHA

Es donde el anotador registra la producción. El legacy organiza la jornada en **lotes**
(también llamados guías):

- **Cabecera del lote**: predio, tipo de bandeja, cultivo, cuartel, variedad, calidad,
  tipo cosecha, número de **guía**, fecha/hora del lote, **estado** (ej. "GUIA ASIGNADA"),
  peso máximo, usuario/anotador, **condición** (ABIERTO / CERRADO) y totales del lote
  (cosechas relacionadas, bandejas totales, peso total, valor).
- **Detalle del lote**: cada bandeja entregada se registra con **hora**, **tarjeta**
  (el trabajador, identificado por su badge), **RUT** y **kilos**. El detalle se agrupa
  por predio con subtotal de kilos.

!!! note "Dato: lote de producción propia"
    Existe un lote especial "Campo viejo ." con RUT `000000` para registrar la producción
    propia del campo (no atribuible a un cosechero individual).

---

## Jerarquía del modelo de datos

El modelo del legacy se puede leer como una jerarquía:

```
Predio
 └─ Cuartel  (cultivo + variedad + superficie)
     └─ Lote de cosecha  (guía · estado · condición · calidad · tipo cosecha)
         └─ Detalle de cosecha  (bandeja: trabajador + RUT + hora + kilos)
```

Reglas de negocio implícitas:

- El **envase** aporta la **tara**; el **producto** define el **peso máximo** de la bandeja.
- El **peso neto** = peso bruto − tara.
- El **pago** se calcula por trabajador en función de las bandejas/kilos entregados
  (ver la discusión de kilo vs bandeja en [Decisiones de negocio](decisiones-negocio.md)).

---

## Pagos: Valor cosechado

La liquidación del legacy muestra, por cada trabajador (identificado por su **tarjeta**),
el **valor acumulado**. El detalle se desglosa por fecha, con subtotal diario, y columnas
de RUT, tarjeta y bandejas. El pago es **por pieza** (*piece-rate*).
