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
4. Registrar el flag en el catálogo (`platform_feature_flags`) — vía migración/seed o consola.
5. Comportamiento por defecto sin el flag encendido: la feature permanece oculta/inactiva
   y la app debe seguir funcionando con normalidad (degradación limpia, sin errores).

## Convenciones

- El `key` del flag es la fuente de verdad que usa el código; nunca hardcodear el
  comportamiento sin pasar por el flag.
- Un mismo `key` se usa en cliente y (si aplica) en el backend; mantenerlos consistentes.
- Naming del `key`: `snake_case`, descriptivo de la capacidad (no del tenant ni de la fecha).
- La lectura del estado del flag debe resolver override → default global (nunca leer solo
  el default global ignorando el override del tenant).

## Nota de estado actual

A la fecha existen el catálogo en DB y la consola super-admin de gestión, pero aún NO hay
un helper/hook cliente compartido (p. ej. `useFeatureFlag(key)`) que resuelva el estado
efectivo. Al implementar la primera feature gated, crear ese helper en `packages/shared`
(`@fundo360/shared`) y consumirlo desde `apps/web` y `apps/mobile`, en lugar de duplicar
la lógica de resolución en cada app.
