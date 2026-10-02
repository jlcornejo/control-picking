# Legacy / Paridad — Visión general

Esta sección documenta la aplicación **legacy** que hoy usa el cliente en terreno y la
compara con **Fundo360**. Su propósito es doble:

1. Dejar registrado qué hace exactamente la app actual (la base de conocimiento del negocio).
2. Definir el **criterio mínimo** que Fundo360 debe cumplir **antes de la primera prueba en terreno**.

> **Última actualización**: 2026-10-02.
> **Estado**: propuesta para validación con negocio.

---

## Qué es la app legacy

La aplicación actual se llama **"Cosecha Agrícola Campo Viejo"** y pertenece al fundo
**Cerro Viejo Ltda.** (comuna de **Coihueco**, Chile). Está construida sobre
**Google AppSheet** (una herramienta no-code sobre planillas de Google).

Es la app que opera el **anotador/supervisor** en terreno: registra la cosecha de cada
trabajador, administra los datos maestros del campo (predios, envases, trabajadores,
contratistas) y calcula el valor cosechado para el pago.

!!! info "Cultivos y contexto"
    Campo Viejo cosecha **frambuesa, mora y arándano** (berries). El pago es por pieza
    (*piece-rate*). La operación es en zona rural, con conectividad intermitente, y gran
    parte del personal tiene baja alfabetización digital.

---

## Por qué importa como línea base

Antes de reemplazar la herramienta del cliente, Fundo360 debe **al menos igualar** lo que
el cliente ya hace hoy. Si la app nueva pierde una capacidad que ellos usan a diario, la
prueba en terreno fracasa aunque el resto esté impecable.

Por eso tratamos la app legacy como **la línea base de paridad funcional**: el conjunto
mínimo de funciones que deben existir y ser verificables en Fundo360 (web + móvil + backend)
antes de salir a terreno.

---

## Criterio de salida a terreno

!!! warning "Regla de paridad (bloqueante)"
    No se va a una prueba en terreno hasta que Fundo360 cubra **toda la funcionalidad del
    legacy que el cliente realmente usa**. Las funciones del legacy que el cliente **no**
    utiliza (dato muerto) se validan con negocio y se descartan explícitamente — no se
    copian por inercia.

El trabajo de esta sección se organiza así:

| Página | Qué contiene |
|--------|--------------|
| [Mapa funcional](mapa-funcional.md) | La "foto" del legacy: sus módulos, entidades y la jerarquía del modelo de datos. |
| [Paridad con Fundo360](paridad-fundo360.md) | El contraste legacy → Fundo360 con estados: qué está listo, parcial o falta. |
| [Decisiones de negocio](decisiones-negocio.md) | Las preguntas abiertas y cerradas que definen el alcance de la prueba. |

---

## Resumen ejecutivo

Fundo360 **ya cubre la mayor parte** del legacy y en varios frentes lo **supera** (escaneo
QR real, registro sin conexión, control de merma por peso, cuadrillas, multi-cliente,
tablero de métricas). Quedan unas pocas **decisiones de negocio** que determinan si hay o
no trabajo pendiente antes de terreno; la más importante es **si el pago es por kilo o por
bandeja/caja**. El detalle está en [Decisiones de negocio](decisiones-negocio.md).
