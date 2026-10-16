---
inclusion: auto
name: feature-flags
description: Regla de arquitectura — toda funcionalidad nueva de usuario debe estar detrás de un feature flag (gating). Cubre el catálogo global, overrides por tenant, kill-switches y cómo conectar código a un flag. Úsalo al implementar o modificar features de usuario, pantallas, endpoints/Edge Functions o al crear flags.
---

# Feature Flags — Regla de Arquitectura (Fundo360)

## Regla principal (invariante de proyecto)

**Toda funcionalidad nueva orientada al usuario DEBE estar conectada (gated) a un feature flag.**
Si una feature no está ligada a un flag, no se considera terminada: no debe mergearse.

Un flag por sí solo NO es la feature — es solo el interruptor. La feature está "conectada"
cuando el código consulta el estado **efectivo** del flag para la organización actual y
muestra/oculta/activa el comportamiento en consecuencia. Crear el flag en la consola
super-admin sin ese cableado en el código NO cumple esta regla.

## Por qué

- Permite rollout progresivo: probar con un tenant piloto antes de activar para todos.
- Da un kill-switch de emergencia sin necesidad de re-desplegar la app.
- Desacopla "código desplegado" de "función visible", reduciendo el riesgo de cada release.

## Modelo de resolución (estado efectivo por organización)

1. Si existe override en `organization_feature_flags` para `(org, flag)` → manda `override.enabled`.
2. Si no hay override → manda `platform_feature_flags.enabled` (default global).

Tablas: `platform_feature_flags` (catálogo global, sin `organization_id`) y
`organization_feature_flags` (override por tenant). Gestión vía Edge Function
`platform-feature-flags` (solo super-admin, auditada en `platform_audit_log`).

## Estrategias de flag (`feature_flag_strategy`)

- `global`: mismo valor para todos los tenants.
- `org_override`: se puede sobreescribir por organización (default recomendado para features).
- `kill_switch`: interruptor de emergencia para apagar algo rápido en producción.

## Cómo conectar una feature nueva (checklist obligatorio)

Al implementar CUALQUIER feature de usuario:

1. Definir un `key` estable para el flag (`^[a-z0-9]+(_[a-z0-9]+)*$`, ej. `excel_export`).
2. Envolver el punto de entrada de la feature (botón, pantalla, endpoint, job) con la
   comprobación del estado efectivo del flag para la org/usuario actual.
3. Elegir la estrategia (`org_override` salvo que haya razón para `global` o `kill_switch`)
   y un default seguro (normalmente **off** hasta validar).
4. Registrar el flag en el catálogo (`platform_feature_flags`) **vía migración/seed**
   (NUNCA desde la consola — ver "Amarre de 3 capas" abajo).
5. Comportamiento por defecto sin el flag encendido: la feature permanece oculta/inactiva
   y la app debe seguir funcionando con normalidad (degradación limpia, sin errores).

## Amarre de 3 capas (un flag no está "amarrado" si falta alguna)

Un feature flag solo se considera completo cuando existe en las TRES capas. Esto lo
verifica el hook `.kiro/hooks/feature-flag-wiring.json` al guardar migraciones/seed.

1. **Catálogo** — sembrado en `platform_feature_flags` por migración/seed (key snake_case,
   name, description, category, strategy, default seguro).
2. **Código** — al menos un punto de consumo que lee el estado efectivo (override → global)
   y activa/oculta el comportamiento. Un `key` que no se consume en ningún lado es un
   **"flag muerto"**: no debe mergearse.
3. **Panel de administración** — gestionable desde la consola super-admin
   (`/platform/feature-flags`), pero SOLO para activar/desactivar el default global y
   gestionar overrides por organización.

### El catálogo lo define el código, NO la consola

El super-admin **no crea flags nuevos ni edita su identidad** (`key`/`name`/`category`/
`strategy`) desde la consola: un flag sin código que lo consuma no haría nada. La Edge
Function `platform-feature-flags` **rechaza `POST` con 403** y el `PATCH` solo acepta
`description` y `enabled`. Los flags nacen por migración/seed cuando se construye la
feature. No reintroducir creación/edición de identidad de flags en la UI.

## Convenciones

- El `key` del flag es la fuente de verdad que usa el código; nunca hardcodear el
  comportamiento sin pasar por el flag.
- Un mismo `key` se usa en cliente y (si aplica) en el backend; mantenerlos consistentes.
- Naming del `key`: `snake_case`, descriptivo de la capacidad (no del tenant ni de la fecha).
- La lectura del estado del flag debe resolver override → default global (nunca leer solo
  el default global ignorando el override del tenant).

## Catálogo de flags vigentes

Sembrados en `platform_feature_flags` (todos default **off** salvo indicación):

| key | nombre | categoría | estrategia | notas |
|-----|--------|-----------|-----------|-------|
| `bluetooth_scale` | Báscula Bluetooth | cosecha | org_override | Lectura de peso desde balanza BT |
| `offline_sync` | Sincronización Offline | infraestructura | org_override | Cola de mutaciones (default **on**) |
| `ai_yield_prediction` | Predicción de Rendimiento (IA) | analitica | org_override | Sin implementación aún |
| `advanced_metrics` | Métricas Avanzadas | analitica | org_override | — |
| `disable_pdf_export` | Kill-Switch: Exportación PDF | infraestructura | kill_switch | Apaga PDFs en picos de carga |
| `box_tare_control` | Control de Destare y Tolerancia | cosecha | org_override | KAN-6: destare + alerta de merma (ver domain-rules §24-30) |
| `configurable_rbac` | RBAC Configurable | seguridad | org_override | KAN-5: perfiles de permisos (ver domain-rules §31-37) |
| `picking_photo_evidence` | Foto de respaldo en registro | cosecha | org_override | Foto comprobante al registrar picking (Storage por tenant) |
| `kg_payment` | Pago por kilo | cosecha | org_override | Pago por kilo coexistiendo con pago por caja; base = peso neto o kg manual |
| `product_varieties` | Variedades de producto | cosecha | org_override | Catálogo de variedades bajo producto + tarifa por variedad |
| `report_export` | Informes exportables | analitica | org_override | PDF de liquidaciones + CSV de producción/rankings (default **off**) |
| `payment_photo_evidence` | Foto de respaldo en pagos | pagos | org_override | Hasta 3 imágenes de respaldo al registrar un pago (Storage privado por tenant) |

## Helpers de resolución (implementados)

- **Lógica compartida**: `resolveFeatureFlag` en `@fundo360/shared` resuelve el estado
  efectivo (override por org → default global). Es la fuente de verdad de la regla de
  resolución; no duplicarla.
- **Mobile**: hook `useFeatureFlag(key)` en `apps/mobile/src/hooks/useFeatureFlag.ts`
  (cachea con TanStack Query).
- **Web**: hook `useFeatureFlag(key)` en `apps/web/src/hooks/useFeatureFlag.ts`.

Consumir SIEMPRE estos helpers en vez de reimplementar la resolución override → global.
