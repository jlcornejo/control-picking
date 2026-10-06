# Pruebas de la app móvil

Set de pruebas manuales **por perfil** para validar la app móvil Fundo360 antes de la
prueba en terreno. Cada perfil tiene su propia página con casos paso a paso.

> **Última actualización**: 2026-10-03.
> **Alcance**: app móvil (Expo) contra el ambiente **remoto** `fundo360`.

---

## Perfiles

| Perfil | Página | Prioridad |
|--------|--------|:---------:|
| **Supervisor / Anotador** | [Pruebas Supervisor](supervisor.md) | 🔴 Requisito mínimo |
| Administrador | [Pruebas Admin](admin.md) | 🟡 |
| Encargado (cuadrilla) | [Pruebas Encargado](encargado.md) | 🟡 |
| Trabajador | [Pruebas Trabajador](trabajador.md) | 🟢 |

!!! danger "Requisito mínimo para terreno"
    El perfil **Supervisor / Anotador** es el que opera en terreno. Sus casos
    (especialmente **registrar la cosecha**) son el criterio mínimo que debe pasar antes de
    salir a la prueba de campo.

---

## Preparación del entorno

Las features nuevas (foto de respaldo, flags) están en el ambiente **remoto**, no en el
Supabase local. Para probar hay que apuntar la app al remoto.

### Opción rápida — navegador (recomendada para validar lógica)

Desde `apps/mobile`, levanta el dev server apuntando al remoto (sin tocar el `.env`):

```bash
cd apps/mobile
EXPO_PUBLIC_SUPABASE_URL=https://eklnnvhlgitvfxwuhgnv.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_s4KVEgwyxuktgEs1LYdGIQ_Ye5EXCyF \
npx expo start --web
```

Abre la URL que imprime (normalmente `http://localhost:8081`).

!!! note "Limitaciones del navegador"
    En web, la **cámara** usa la webcam del computador y el **escaneo QR** puede no estar
    disponible: usa el **ingreso manual del badge**. La **escala de fuente** y toda la
    navegación se validan perfecto en web. La cámara nativa real se prueba en el dispositivo.

### Opción dispositivo — build real

Para probar la cámara nativa y el flujo tal cual lo verá el cliente, instala el build EAS
(perfil `preview`) en el equipo. Ese APK ya apunta al remoto.

---

## Usuarios de prueba (remoto)

Todos los casos usan el tenant **Sur Berries SpA** (tiene Modo Capataz, melgas y la foto de
respaldo activada).

| Rol | Email | Password |
|-----|-------|----------|
| Administrador | `admin@surberries.cl` | `admin123` |
| Supervisor | `supervisor@surberries.cl` | `super123` |
| Encargado (crew_lead) | `capataz@surberries.cl` | `capataz123` |

### Códigos de badge de los trabajadores (para el ingreso manual)

Los trabajadores no inician sesión: se identifican por su **badge**. En el registro de
picking, cuando pida escanear, usa el botón de **ingreso manual** y escribe exactamente el
código de la columna "Badge" (respeta mayúsculas, minúsculas y guiones):

| Trabajador | Badge (código a escribir) | RUT |
|------------|---------------------------|-----|
| Camila Rojas | `badge-sur-worker-001` | 20.333.333-3 |
| Diego Torres | `badge-sur-worker-002` | 20.444.444-4 |
| Fernanda Silva | `badge-sur-worker-003` | 20.555.555-5 |

### Datos del campo (Sur Berries)

Lo que verás al registrar cosecha en este tenant:

| Dato | Valor en el ambiente |
|------|----------------------|
| Campo | Fundo Los Maitenes |
| Paño | **Paño F1 - Frutillas** (único paño) |
| Melgas | Melga 1, Melga 2, Melga 3 |
| Producto | Frutilla, se mide en **kilos (kg)** |
| Tarifa vigente | **$1.200 por kg** |

!!! note "Qué aparece y qué no en este tenant"
    - La **foto de respaldo** SÍ está activa (verás "Agregar foto de respaldo").
    - El **control de destare / tipo de caja** NO aparece: el producto Frutilla se mide en
      kg, no en cajas, y este tenant no tiene tipos de caja configurados. Es correcto que no
      salga.

---

## Cómo usar estos casos

Cada caso tiene **Precondición**, **Pasos** y **Resultado esperado**. Para registrar el
resultado, marca cada caso con:

- ✅ **OK** — se comporta como se espera.
- ❌ **Falla** — no se comporta como se espera (anota qué pasó).
- ⏭️ **N/A** — no aplica en este entorno (ej. cámara en web).

Reporta las fallas con: perfil, número de caso, qué esperabas y qué pasó.

---

## Resumen de qué ve cada perfil

Referencia rápida de navegación (pestañas visibles por rol):

| Pestaña | Admin | Supervisor | Encargado | Trabajador |
|---------|:-----:|:----------:|:---------:|:----------:|
| Dashboard | ✅ | ✅ | ✅ | — |
| Producción / Mi Día | ✅ | ✅ | ✅ | ✅ (solo suyo) |
| Registro Picking | ✅ | ✅ | ✅ | — |
| Pagos | ✅ | ✅ | ✅ | ✅ (solo suyo) |
| Mi Cuadrilla | — | — | ✅ | — |
| Mi Equipo | — | ✅ | — | — |
| Perfil | ✅ | ✅ | ✅ | ✅ |
| Administración | ✅ | — | — | — |
