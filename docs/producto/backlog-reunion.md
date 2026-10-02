# Backlog de Producto — Reunión 24/25

Documento maestro que organiza los puntos de la última reunión, los contrasta con lo
que ya está implementado en el código y define un backlog priorizado por hitos.

> **Fuente**: notas manuscritas de la reunión (5 páginas) + aclaraciones del equipo.
> **Última actualización**: 2026-09-27.
> **Estado del backlog**: propuesta inicial para validación.

---

## 1. Cómo leer este documento

Cada ítem tiene:

- **Estado actual**: `✅ Implementado` · `⚠️ Parcial` · `❌ Falta`.
- **Prioridad**: `P0` (crítico/base) · `P1` (alto) · `P2` (medio) · `P3` (despriorizado, no olvidar).
- **Hito**: agrupación de entrega (ver [§11 Hitos](#11-hitos-y-backlog-priorizado)).

La leyenda de estado se basa en la revisión del repositorio (migraciones SQL, Edge
Functions, app web Next.js y app móvil Expo) hecha el 2026-09-27.

---

## 2. Jerarquía de roles y RBAC configurable (P0 — muy importante)

### Decisión

La **jerarquía base** queda confirmada y es correcta:

```
Admin Plataforma → Admin Cliente → Supervisor → Encargado de cuadrilla → Trabajador
```

- **Admin Plataforma** (super-admin del SaaS): ya implementado (`platform_admins`,
  consola `(platform)/`, Edge Functions `platform-*`). ✅
- **Admin Cliente / Supervisor / Encargado (crew_lead) / Trabajador**: enum
  `worker_role` con `admin`, `supervisor`, `crew_lead`, `worker` + RLS por rol. ✅

**NO** se agregan roles fijos nuevos (Secretaría/Admin 2, Anotador, Jefe de Campo).
En su lugar, se aborda con **RBAC avanzado y configurable**:

- El **Admin Cliente puede crear N administradores** dentro de su organización.
- Si necesita **restringir funcionalidades** a alguno (ej. una secretaria / "Admin 2"),
  le crea un **perfil personalizado** (permission profile).
- El Admin Cliente configura perfiles con **todos los features marcables/desmarcables**
  (activar/desactivar por capacidad). Es el patrón de las plataformas modernas: da
  flexibilidad para casos que no encajan en roles rígidos.
- El rol "Anotador" y variantes se resuelven como **un perfil** (ej. un supervisor con
  el permiso de "tomar fotos de respaldo" y "registrar", ver §5), no como rol nuevo.

### Estado actual

⚠️ **Parcial**. Existen 4 roles fijos con RLS. Falta la capa de **perfiles de permisos
configurables** por el Admin Cliente (catálogo de capacidades + asignación por usuario).

### Alcance propuesto

1. Catálogo de **capacidades** (permissions) versionado (ej. `workers.create`,
   `payments.view`, `records.photo`, `metrics.export`, `own_production.view`…).
2. Tabla de **perfiles** por organización (`permission_profiles`) + asignación a usuarios.
3. Resolución efectiva de permisos (rol base + perfil) en el JWT/consulta y en RLS.
4. UI en el dashboard del Admin Cliente para crear perfiles y marcar/desmarcar features.
5. Integración con los **feature flags** ya existentes (un feature apagado a nivel
   plataforma/tenant no debe poder habilitarse en un perfil).

> Relacionado: el punto §3 (visibilidad de cosecha del trabajador) se resuelve como una
> capacidad más dentro de este sistema.

---

## 3. Visibilidad de la propia cosecha del trabajador (P2)

### Decisión

Menor prioridad. Se aborda **a través del RBAC configurable (§2)**: el Admin Cliente
activa o desactiva, en el perfil del trabajador, la visualización de sus propios
trabajos, pagos, etc.

### Estado actual

⚠️ **Parcial**. Hoy el móvil muestra producción y pagos del trabajador
(`production.tsx`, `payments.tsx`, `profile.tsx`). Falta que esa visibilidad sea
**gobernada por una capacidad** configurable.

> **Nota de producto**: ocultar la producción al trabajador tensiona la métrica de éxito
> "adopción ≥ 80% de trabajadores consultando producción diariamente". Al ser configurable,
> cada cliente decide; el default puede seguir siendo "visible".

---

## 4. Destare y alertas de peso / merma (P0)

Este es el ítem con mayor impacto operativo y toca el modelo de datos base. Une los
puntos 5 y 6 de la reunión.

### Problema de negocio

- Las cajas/envases tienen un **peso propio (tara/destare)** que debe **restarse** al
  pesar lo recolectado. Ej.: tara de **200 g** → si la balanza marca 10,2 kg, el neto
  del trabajador es **10,0 kg**.
- Existen **N tipos de caja estándar**, cada una con su **destare configurable**.
- Cada tipo de caja tiene un **peso objetivo conocido** (ej. **10 kg** de fruta).
- **Sobrellenar es un problema**: si una caja de 10 kg pesa 11 kg neto, al **apilar**
  las cajas la fruta inferior **se revienta → merma**. El sistema debe **alertar de
  inmediato** para ajustar antes de continuar.
- Debe existir una **banda de tolerancia** (en % o en kg) **superior e inferior**.

### Modelo propuesto (tipos de caja / envase)

Configurable por organización (y potencialmente por producto):

| Atributo | Ejemplo | Descripción |
|---|---|---|
| `name` | "Bandeja 10 kg" | Nombre del tipo de envase |
| `tare_weight_kg` | 0.200 | Destare a restar del peso bruto |
| `target_net_weight_kg` | 10.000 | Peso neto objetivo de fruta |
| `tolerance_over` | +3% o +0.3 kg | Límite superior antes de alertar (sobrellenado) |
| `tolerance_under` | −3% o −0.3 kg | Límite inferior antes de alertar (caja incompleta) |
| `tolerance_unit` | `percent` \| `kg` | Cómo se expresa la tolerancia |

**Cálculo en el registro**: `neto = bruto − tare_weight_kg`. Luego se compara `neto`
contra `target_net_weight_kg ± tolerancia`:

- `neto > objetivo + tolerancia_superior` → **alerta de sobrellenado** (riesgo de merma).
- `neto < objetivo − tolerancia_inferior` → **alerta de caja incompleta**.
- En rango → registro normal.

### Referencias (investigación web)

- **Neto = Bruto − Tara** es el estándar de pesaje (USDA, NIST, Measurement Canada).
- La tolerancia de tara común usada por reguladores ronda **≤ 0.2 lb o 2%** del valor
  establecido (CDFA California) — buen orden de magnitud para el default de tolerancia.
- El **sobrellenado produce daño por compresión** ("compression bruising"): la FAO
  recomienda no llenar los envases ni muy sueltos ni muy apretados; guías de arándano
  sugieren mantener baja la altura de apilado de fruta. Esto valida la alerta inmediata.

  > Contenido parafraseado de fuentes públicas (USDA FSIS/AMS, NIST, Measurement Canada,
  > CDFA, FAO, extensiones universitarias UMass/UGA/PSU). Reformulado por licenciamiento.

Fuentes:
[USDA — Net Weight](https://www.fsis.usda.gov/sites/default/files/media_file/2021-03/FPLIC_3_Net_Weight.pdf) ·
[Measurement Canada — Tare/Net](https://ised-isde.canada.ca/site/measurement-canada/en/laws-and-requirements/field-inspection-manual-non-automatic-weighing-devices/part-3-section-11) ·
[CDFA — Common Tares](https://www.cdfa.ca.gov/dms/programs/wm/commontares.pdf) ·
[FAO — Postharvest Handling](http://www.fao.org/3/ae075e/ae075e08.htm) ·
[UMass — Post-harvest](https://www.umass.edu/agriculture-food-environment/fruit/ne-small-fruit-management-guide/general-information/post-harvest-handling-storage)

### Estado actual

❌ **Falta**. No existe modelo de tipos de caja/envase, ni destare, ni tolerancia, ni
alertas de peso. El registro de picking hoy no descuenta tara ni valida rangos.

### Alcance propuesto

1. Tabla `box_types` (o `containers`) por organización con los atributos de arriba.
2. Referenciar el tipo de caja en el registro de picking + guardar `gross_weight`,
   `tare_snapshot`, `net_weight` (snapshot inmutable, como `rate_amount_snapshot`).
3. Cálculo de neto + evaluación de tolerancia en el registro.
4. **Alerta inmediata** en la app móvil al registrar fuera de rango (sonora/visual).
5. Reporte de cajas fuera de tolerancia para el supervisor/admin.

---

## 5. Imágenes de respaldo (P1)

### Decisión

El **Supervisor y/o Anotador** (puede ser el mismo rol/perfil) debe poder **tomar fotos
de respaldo**:

- Al **anotar / registrar** producción.
- Al **registrar un pago** (transferencia, efectivo, etc.), como comprobante.

### Estado actual

❌ **Falta**. No hay adjuntos de imágenes en `picking_records` ni en pagos. Supabase
Storage está disponible en el stack pero sin integrar para este caso.

### Alcance propuesto

1. Bucket de Storage por organización (aislamiento por tenant) con RLS.
2. Campo(s) de adjuntos en registro de picking y en pagos (1..N imágenes).
3. Captura desde cámara en la app móvil + subida con reintento (offline-friendly).
4. Visualización de los respaldos en dashboard web (auditoría).
5. Capacidad RBAC: "tomar/ver fotos de respaldo".

---

## 6. Ticketera / soporte (P1 — versión mínima)

### Decisión

**MVP simple**: un formulario de ticket que llegue a una **bandeja de contacto del
Admin Plataforma** (soporte de la app). Más adelante, construir una **ticketera tipo
tablero** (To-Do / En curso / Hecho).

### Estado actual

❌ **Falta**.

### Alcance propuesto (fase 1)

1. Formulario "Contactar soporte" en dashboard/móvil (asunto, descripción, adjunto opcional).
2. Persistencia + notificación a la bandeja del Admin Plataforma.
3. (Fase 2) Estados y tablero Kanban de tickets.

---

## 7. Accesibilidad — tamaño de fuente configurable (P1)

### Decisión

Muchos administradores de fundo son de **tercera edad** y pueden tener baja visión. Se
necesita **tamaño de fuente configurable / letras grandes**.

### Estado actual

❌ **Falta**. Los `fontSize` en el móvil son estáticos; no hay escala de fuente ni
preferencia de accesibilidad.

### Alcance propuesto

1. Preferencia de **escala de fuente** (ej. Normal / Grande / Extra grande) persistida
   por usuario.
2. Aplicar escala global en móvil (tokens de tipografía) y en web.
3. Respetar ajustes del sistema operativo cuando sea posible.

---

## 8. Informes / reportes exportables (P1)

### Decisión

Informes, métricas y todo lo relevante **exportable a PDF y/o Excel** según el caso.

### Estado actual

⚠️ **Parcial**. Hay métricas en pantalla (Edge Functions `metrics` / `platform-metrics`)
y un flag `disable_pdf_export`, pero **no** hay un módulo de informes exportables.

### Alcance propuesto

1. Definir catálogo de informes (producción por período, por trabajador/cuadrilla,
   pagos/liquidaciones, cajas fuera de tolerancia, etc.).
2. Exportación a **Excel** (datos tabulares) y **PDF** (informes con formato).
3. Respetar el kill-switch `disable_pdf_export` para picos de carga.
4. Filtros por fecha, campo, producto, trabajador.

---

## 9. Ítems despriorizados (P3 — no olvidar)

Confirmados como despriorizados por ahora; se documentan para no perderlos.

| # | Ítem | Nota |
|---|---|---|
| 3 | **Suscripción / planes** | Existe `subscription_status/plan` + enforcement en JWT. Falta catálogo de planes (N meses), features por plan y pantalla "actualizar plan". Retomar más adelante. |
| 7 | **Tipo de cosecha Manual/Mecanizada** | No implementado. Campo/enum a futuro. |
| 9 | **Comparación Huerto vs Recepción** | Cuando el campo despacha N kg y la frutícola (ej. Olmue) recepciona menos → **alertar por posibles robos/mermas en tránsito**. Requiere datos de recepción. |
| 10 | **Integración Olmue** | Endpoint de datos de recepción de la frutícola. Habilita el punto 9. |
| 11 | **WhatsApp** | Notificaciones / soporte por WhatsApp. |
| 15 | **Documentación / e-learning / videos** | Ayuda, mejores prácticas agrícolas en video, e-learning. |
| 16 | **Publicidad** | Espacios/superficie publicitaria. |
| 17 | **Asistente IA** | Existe flag `ai_yield_prediction` sin implementación. Soporte con IA + predicción de rendimiento. |

---

## 10. Ya implementado (base sobre la que construimos)

Verificado en el repositorio (2026-09-27):

- **Multi-cliente (multitenancy)**: `organizations` + RLS por tenant. ✅
- **Capa de plataforma / super-admin**: `platform_admins`, consola `(platform)/`,
  Edge Functions `platform-*`, auditoría (`platform_audit_log`) y modo soporte
  solo-lectura (`platform-org-detail`). ✅
- **Roles base + RLS**: `admin`, `supervisor`, `crew_lead`, `worker`. ✅
- **Etiquetas de rol configurables**: `role_labels` en Configuración. ✅
- **Estructura productiva**: Campo → Paño → Melga (`fields`, `blocks`, `field_rows`,
  toggle `rows_enabled`). ✅
- **Productos**: tabla + Edge Function `products`. ✅
- **Cuadrillas / Encargado (Modo Capataz)**: `crews`, `crew_lead`,
  `crew_mode_enabled`, pagos a cuadrilla. **Aquí vive el "Contratista/Furgón" = Encargado**
  (no crear entidad nueva). ✅
- **Registro de picking**: `picking_records` con `rate_amount_snapshot`. ✅
- **Día/hora + zona horaria**: `org_timezone_workday`, `day_roster`. ✅
- **Tarifas con historial**: `rates`. ✅
- **Liquidaciones y pagos**: `settlements` + `payments` (transferencia / efectivo como
  métodos). ✅
- **Métricas**: Edge Functions `metrics` + `platform-metrics`. ✅
- **Feature flags**: `platform_feature_flags` + overrides por org. ✅
- **Cambio de contraseña obligatorio**: `worker_must_change_password`. ✅

---

## 11. Hitos y backlog priorizado

Propuesta de secuenciación. Los hitos agrupan el trabajo por valor entregable.

### Hito M1 — Núcleo operativo de pesaje (P0)

Máximo impacto operativo; toca modelo de datos base.

- [ ] **RBAC configurable / perfiles de permisos** (§2) — `P0`
- [ ] **Destare + tipos de caja + alertas de peso/merma** (§4) — `P0`

### Hito M2 — Confianza y trazabilidad (P1)

- [ ] **Imágenes de respaldo** en registro y pagos (§5) — `P1`
- [ ] **Accesibilidad: tamaño de fuente configurable** (§7) — `P1`
- [ ] **Informes / exportación PDF + Excel** (§8) — `P1`
- [ ] **Ticketera de soporte (MVP bandeja)** (§6) — `P1`

### Hito M3 — Configurabilidad fina (P2)

- [ ] **Visibilidad de cosecha del trabajador** como capacidad RBAC (§3) — `P2`

### Backlog futuro (P3 — no olvidar)

- [ ] Suscripción / planes y "actualizar plan"
- [ ] Tipo de cosecha Manual/Mecanizada
- [ ] Comparación Huerto vs Recepción (alertas de robo/merma)
- [ ] Integración Olmue (datos de recepción)
- [ ] WhatsApp
- [ ] Documentación / e-learning / videos
- [ ] Publicidad
- [ ] Asistente IA (soporte + predicción de rendimiento)

---

## 12. Trazabilidad reunión → backlog

Mapa de los 17 puntos numerados de la reunión a su sección en este documento.

| # reunión | Tema | Sección | Prioridad |
|---|---|---|---|
| 1 | Jerarquía + RBAC configurable | §2 | P0 |
| 2 | Trabajador ve/no ve su cosecha | §3 | P2 |
| 3 | Suscripción | §9 | P3 |
| 4 | Contratista/Furgón = crew (Encargado) | §10 | ✅ (aclaración) |
| 5 | Alertas de rendimiento (peso) | §4 | P0 |
| 6 | Destare | §4 | P0 |
| 7 | Tipo de cosecha Manual/Mecanizada | §9 | P3 |
| 8 | Imágenes de respaldo | §5 | P1 |
| 9 | Huerto vs Recepción | §9 | P3 |
| 10 | Integración Olmue | §9 | P3 |
| 11 | WhatsApp | §9 | P3 |
| 12 | Ticketera / soporte | §6 | P1 |
| 13 | Accesibilidad (tamaño de fuente) | §7 | P1 |
| 14 | Informes exportables | §8 | P1 |
| 15 | Documentación / e-learning | §9 | P3 |
| 16 | Publicidad | §9 | P3 |
| 17 | Asistente IA | §9 | P3 |
