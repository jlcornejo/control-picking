# Reglas de Dominio

## Invariantes de negocio

Estas reglas son propiedades de correctness del sistema. Nunca deben violarse y deben validarse con tests.

### Multi-tenant (aislamiento por organización)

1. Toda entidad de dominio pertenece a exactamente una Organización (`organization_id`).
2. Un usuario solo puede acceder a datos de su propia Organización; el cruce entre organizaciones está prohibido.
3. El Administrador de Plataforma (dueño del SaaS / soporte) puede acceder a todas las Organizaciones; ese acceso queda registrado en auditoría.
4. Si la suscripción de una Organización no está vigente (`suspended`/`cancelled`), sus usuarios pierden acceso a las funcionalidades, pero sus datos se preservan.
5. Las FKs entre entidades de dominio validan que ambos extremos pertenezcan a la misma Organización (FKs compuestas `(id, organization_id)`).

### Picking

6. Un registro de picking siempre tiene: `worker_id`, `block_id`, cantidad > 0, fecha/hora, `organization_id`.
7. No se puede registrar picking para un trabajador desactivado.
8. No se puede registrar picking en un paño desactivado.
9. La cantidad registrada nunca puede ser negativa ni cero.
10. Un registro solo puede corregirse dentro de la misma jornada (día calendario).
11. La corrección es un **soft-update**: el registro original se edita in-place con la nueva base (cantidad de cajas o kilos pagados; sigue contando en los totales) y se conserva una fila-snapshot de auditoría con los valores previos (`original_record_id` apunta al registro corregido; queda excluida de los totales y visible solo en el historial como "Corrección"). Nunca se borra. La tarifa (`rate_amount_snapshot`) y la unidad (`payment_unit`) del registro no cambian al corregir (regla 14).
12. El registro de producción es idéntico exista o no Modo Capataz; no se duplica.
12a. **Unidad de pago (`payment_unit`)**: el paño define la unidad según su producto (`box` | `kg`). En productos por **caja** se paga por `quantity` (cajas, siempre > 0). En productos por **kg** la base pagada es `paid_quantity_kg` (> 0) y `quantity` cuenta cajas pesadas (o 1 en captura manual). `payment_unit` es inmutable tras crear el registro. El pago por kilo está detrás del feature flag `kg_payment` y **coexiste** con el pago por caja sin regresión.
12b. **Destare como base de pago en kg**: cuando el producto se mide en kg y hay control de destare, el **peso neto** (`bruto − tara`, nunca < 0) ES la base pagada (`paid_quantity_kg`). Sin destare, se capturan kilos manuales. En productos por caja, el destare sigue siendo solo control de merma y no altera el pago.

### Tarifas

13. Una tarifa siempre es > 0 (nunca cero ni negativa).
14. La tarifa aplicada a un registro es la vigente al momento del registro, no la actual.
15. El historial de tarifas es inmutable — no se borran, se crean nuevas versiones.
16. La tarifa aplica a un **sujeto**: el producto (sin variedad) o una variedad concreta. Existe exactamente una tarifa vigente por sujeto en un momento dado; el historial se acota al mismo sujeto. Cada variedad puede tener su propia tarifa.

### Liquidaciones y pagos en dos niveles

17. Liquidación = Σ (base_pagable_i × tarifa_vigente_i) para todos los registros del período, donde la base es cajas (`quantity`) para productos por caja y kilos (`paid_quantity_kg`) para productos por kg. Los totales de unidades se muestran segmentados (nunca se suman cajas con kilos).
18. Una liquidación nunca puede ser negativa.
19. El monto pagado nunca puede exceder el monto liquidado pendiente.
20. Una liquidación marcada como pagada es inmutable.
21. El saldo pendiente = total liquidado − total pagado (nunca negativo).
22. Cada liquidación es a favor de un Trabajador (`payee_type = worker`) o de una Cuadrilla (`payee_type = crew`), nunca ambos a la vez.
23. Cada pago es a favor de un Trabajador (`worker_id`) o de una Cuadrilla/Encargado (`crew_id`), nunca ambos a la vez (XOR).
24. **Con Modo Capataz activo**: el cliente liquida a la Cuadrilla (nivel 1, a nombre del Encargado, agregando la producción de la cuadrilla) y le paga al Encargado. **La responsabilidad del campo se cumple al pagar al Encargado.**
25. **Nivel 2 (opcional)**: el Encargado reparte y paga a sus Trabajadores. Puede registrar esos pagos en la plataforma para trazabilidad, pero no está obligado; no es responsabilidad del campo.
26. **Sin Modo Capataz**: el cliente/supervisor liquida y paga directamente a cada Trabajador.

### RBAC

27. Un trabajador solo puede ver SUS propios datos.
28. Un supervisor solo puede operar sobre trabajadores y paños ASIGNADOS a él, dentro de su Organización.
29. Con Modo Capataz activo, cada Cuadrilla queda a cargo de un Supervisor (`crews.supervisor_id`); el Supervisor puede ver (solo lectura) la liquidación y los pagos de la Cuadrilla a su cargo. Un Supervisor puede tener varias cuadrillas; una cuadrilla tiene un solo supervisor.
30. Un encargado solo puede ver y gestionar SU cuadrilla (sus trabajadores, su producción y, opcionalmente, los pagos que él realiza a sus trabajadores).
31. Solo un administrador puede modificar tarifas, campos, cuadrillas y configuración, dentro de su Organización. El pago del campo al Encargado (liquidación de cuadrilla) lo registra el Administrador.
32. Los datos financieros (montos, tarifas) son invisibles para el rol trabajador, excepto su propio estimado.
33. Solo el Administrador de Plataforma gestiona Organizaciones y suscripciones.

### RBAC configurable — Perfiles de permisos

Capa opcional sobre el RBAC por rol, activable con el feature flag `configurable_rbac`. Permite afinar qué puede hacer cada usuario **dentro** de lo que su rol ya autoriza.

34. Un perfil de permisos **solo RESTRINGE** capacidades dentro de lo que el rol ya permite; **nunca amplía** lo que el rol no autoriza.
35. Un trabajador **sin perfil** conserva **todas** las capacidades de su rol (comportamiento por defecto, retrocompatible).
36. Solo el rol Administrador puede crear, editar y asignar perfiles; un mismo perfil puede aplicarse a cualquier rol.
37. El primer Administrador de una Organización nunca lleva perfil restrictivo (debe poder gestionar el RBAC de su organización).
38. La capacidad se verifica en tres capas: base de datos (RLS), backend (Edge Function) e interfaz (solo cosmético). La barrera real de seguridad es backend + RLS; la UI solo oculta lo que no corresponde.
39. Un perfil pertenece a una sola Organización; al borrarlo, los trabajadores que lo tenían vuelven a las capacidades completas de su rol.

### Estructura de campo

34. Un paño pertenece a exactamente un campo.
35. Un paño tiene asociado exactamente un producto.
36. No se puede eliminar un campo/paño con registros de picking asociados (solo desactivar).

## Jerarquía de roles

```
Administrador de Plataforma  (dueño del SaaS, fuera de las organizaciones)
        │
        ▼  (por cada Organización / cliente)
Administrador → Supervisor → Encargado (opcional) → Trabajador
```

El nivel **Encargado** (Capataz) es opcional y se activa mediante el **Modo Capataz**, configurable por Organización con override por Campo (`fields.crew_mode_enabled`; `NULL` hereda el default de la organización). Las **etiquetas de rol** son personalizables por Organización (`role_labels`) sin alterar la jerarquía ni la seguridad.

Cuando el Modo Capataz está activo, el Encargado queda **entre** el Supervisor y los Trabajadores: cada Cuadrilla se asigna a un Supervisor (`crews.supervisor_id`) y los Trabajadores pertenecen a la Cuadrilla del Encargado (`workers.crew_id`). El flujo de pago es **campo → Encargado**: el campo liquida y paga a la Cuadrilla (a nombre del Encargado) y con eso cumple su responsabilidad. El reparto del Encargado a sus Trabajadores es un segundo nivel **opcional**, que el Encargado puede registrar para trazabilidad pero que la plataforma no exige.

## Glosario técnico → dominio

| Concepto de negocio | Nombre en código | Tabla DB |
|---------------------|------------------|----------|
| Organización / Cliente | `Organization` | `organizations` |
| Administrador de Plataforma | `PlatformAdmin` | `platform_admins` |
| Auditoría de plataforma | — | `platform_audit_log` |
| Campo / Fundo | `Field` | `fields` |
| Paño / Cuartel | `Block` | `blocks` |
| Producto | `Product` | `products` |
| Tarifa | `Rate` | `rates` |
| Trabajador | `Worker` | `workers` |
| Supervisor | `Supervisor` | (rol en `workers`) |
| Encargado / Capataz | `CrewLead` | (rol `crew_lead` en `workers`) |
| Cuadrilla | `Crew` | `crews` |
| Registro de Picking | `PickingRecord` | `picking_records` |
| Liquidación | `Settlement` | `settlements` |
| Pago | `Payment` | `payments` |
| Badge QR | `QrBadge` | (campo en `workers`) |

## Estados de entidades

### Organization

- `subscription_status`: `trial` · `active` · `suspended` · `cancelled` — gobierna el acceso de sus usuarios.
- `status`: `active` / `inactive`.

### Worker

- `active` — operativo según su rol.
- `inactive` — no puede recibir registros; no puede desactivarse si tiene deuda pendiente.
- Roles: `admin`, `supervisor`, `crew_lead`, `worker`.

### Field / Block

- `active` — operativo, visible para supervisores.
- `inactive` — no se puede registrar picking; los datos históricos se mantienen.
- `Field.crew_mode_enabled`: `true` / `false` / `NULL` (hereda de la organización).

### Settlement

- `payee_type`: `worker` (individual) o `crew` (cuadrilla, a nombre del encargado).
- `pending` — calculada, pendiente de pago.
- `partial` — parcialmente pagada.
- `paid` — completamente pagada (inmutable).

### Rate

- `current` — tarifa vigente para el producto.
- `historical` — tarifa anterior, usada solo para cálculos históricos.

### PermissionProfile

- `active` — el perfil restringe a los trabajadores que lo tienen asignado.
- `inactive` — se ignora; los trabajadores con este perfil vuelven a las capacidades completas de su rol (igual que si no tuvieran perfil).

## Capacidades (perfiles de permisos)

Las **capacidades** son las acciones de gestión que un perfil de permisos puede habilitar o restringir cuando el feature flag `configurable_rbac` está activo (ver reglas 34-39). Un perfil es un conjunto de capacidades que **acota** a un trabajador dentro de lo que su rol ya autoriza; nunca le concede algo que su rol no permita.

Catálogo de capacidades disponibles:

| Capacidad | Qué habilita |
|-----------|--------------|
| `workers.manage` | Gestionar trabajadores (crear, editar, estado, Badge QR) |
| `fields.manage` | Gestionar campos y paños |
| `products.manage` | Gestionar productos |
| `rates.manage` | Gestionar tarifas |
| `box_types.manage` | Gestionar tipos de caja (envases) |
| `crews.manage` | Gestionar cuadrillas |
| `supervisors.manage` | Gestionar supervisores y sus asignaciones |
| `settlements.manage` | Gestionar liquidaciones |
| `payments.manage` | Gestionar pagos |
| `metrics.view` | Ver métricas y dashboard |
| `reports.export` | Exportar informes |
| `settings.manage` | Gestionar configuración de la organización |

!!! note "Dónde viven las capacidades"
    El catálogo canónico está en código (`CAPABILITIES` en `@fundo360/shared`), que es la fuente única consumida por backend, base de datos e interfaz. Esta tabla es la referencia de negocio; ante cualquier diferencia, el código manda.

!!! warning "La UI no es la barrera de seguridad"
    La verificación de capacidades ocurre en tres capas (base de datos vía RLS, backend en la Edge Function, e interfaz). La interfaz solo oculta lo que no corresponde por comodidad visual: **la barrera real es backend + RLS**. Nunca se debe confiar en el ocultamiento de la UI para proteger una acción.
