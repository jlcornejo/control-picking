---
inclusion: auto
name: domain-rules
description: Domain invariants, business rules, entity naming conventions, and state machines for the picking control system. Use when writing or modifying TypeScript code, database migrations, or API logic.
---

# Reglas de Dominio — Fundo360

## Invariantes de Negocio (nunca deben violarse)

Estas reglas son propiedades de correctness del sistema. Deben ser validadas con property-based tests.

### Picking

1. Un Registro de Picking siempre tiene: trabajador_id, paño_id, cantidad > 0, fecha/hora
2. No se puede registrar picking para un trabajador desactivado
3. No se puede registrar picking en un paño desactivado
4. La cantidad registrada nunca puede ser negativa ni cero
5. Un registro solo puede corregirse dentro de la misma jornada (día calendario)
6. La corrección conserva el registro original como auditoría (soft-update, no delete)

### Tarifas

7. Una tarifa siempre es > 0 (nunca cero ni negativa)
8. La tarifa aplicada a un registro es la vigente al momento del registro, no la actual
9. El historial de tarifas es inmutable — no se borran, se crean nuevas versiones
10. Siempre existe exactamente una tarifa activa por producto en un momento dado

### Liquidaciones

11. Liquidación = Σ (cantidad_i × tarifa_vigente_i) para todos los registros del período
12. Una liquidación nunca puede ser negativa
13. El monto pagado nunca puede exceder el monto liquidado pendiente
14. Una liquidación marcada como pagada es inmutable
15. El saldo pendiente = total liquidado - total pagado (nunca negativo)

### RBAC

16. Un trabajador solo puede ver SUS propios datos
17. Un supervisor solo puede operar sobre trabajadores y paños ASIGNADOS a él
18. Solo un administrador puede modificar tarifas, campos y configuraciones
19. Los datos financieros (montos, tarifas) son invisibles para rol trabajador excepto su propio estimado

### Estructura de Campo

20. Un paño pertenece a exactamente un campo
21. Un paño tiene asociado exactamente un producto
22. La superficie de los paños no puede exceder la superficie total del campo
23. No se puede eliminar un campo/paño con registros de picking asociados (solo desactivar)

### Destare y Tolerancia de Peso (KAN-6, feature flag `box_tare_control`)

24. El peso neto se calcula como `neto = max(bruto − tara, 0)`, donde la tara proviene del tipo de caja (`box_types.tare_weight_kg`)
25. El destare aplica solo a productos con `unit_measure = 'box'` y cuando el flag `box_tare_control` está activo para la organización
26. **El pago NO cambia por el destare**: la liquidación sigue calculándose por `quantity` (cantidad de cajas). El peso es control de merma + auditoría, nunca altera tarifas ni liquidaciones
27. La alerta de tolerancia es **no bloqueante**: el registro se guarda igual y se marca `out_of_tolerance` para auditoría; el supervisor decide
28. Los pesos (`gross_weight_kg`, `tare_snapshot_kg`, `net_weight_kg`) y `out_of_tolerance` son un snapshot inmutable; una corrección (soft-update) copia estos valores a la fila de auditoría
29. Un `box_type` referenciado por un registro debe pertenecer a la misma organización (FK compuesta `(box_type_id, organization_id)`)
30. La banda de tolerancia se expresa en `percent` (del peso objetivo) o `kg` (absoluto); fuera de `[objetivo − tol_inferior, objetivo + tol_superior]` dispara la alerta

### RBAC Configurable — Perfiles de Permisos (KAN-5, feature flag `configurable_rbac`)

31. Un perfil de permisos **solo RESTRINGE** capacidades dentro de lo que el rol ya permite; **nunca amplía**
32. Un worker **sin perfil** (`permission_profile_id IS NULL`) conserva **todas** las capacidades de su rol (comportamiento por defecto, retrocompatible)
33. Solo el rol `admin` puede crear/editar perfiles y asignarlos; los perfiles aplican a cualquier rol
34. El claim `permissions` del JWT se inyecta **solo** cuando el worker tiene un perfil activo; su ausencia significa "sin restricción"
35. La capacidad se verifica en tres capas: SQL (`has_permission(cap)`), backend (`requirePermission(req, cap)`), UI (`usePermissions().has(cap)`, cosmético). La barrera real es backend + RLS
36. El primer admin de una organización nunca lleva perfil restrictivo (debe poder gestionar el RBAC)
37. Un `permission_profile` referenciado por un worker debe pertenecer a la misma organización (FK compuesta); al borrar el perfil, el worker vuelve a capacidades completas (`ON DELETE SET NULL`)

## Glosario Técnico → Dominio

Usa este mapeo cuando nombres entidades, tablas, variables:

| Concepto de Negocio | Nombre en Código | Tabla DB |
|---------------------|-----------------|----------|
| Campo / Fundo | Field | fields |
| Paño / Cuartel | Block | blocks |
| Producto | Product | products |
| Tarifa | Rate | rates |
| Trabajador | Worker | workers |
| Supervisor | Supervisor | (role in workers) |
| Registro de Picking | PickingRecord | picking_records |
| Jornada | WorkDay | work_days |
| Liquidación | Settlement | settlements |
| Pago | Payment | payments |
| Badge QR | QrBadge | (field in workers) |
| Tipo de Caja / Envase | BoxType | box_types |
| Perfil de Permisos | PermissionProfile | permission_profiles |
| Capacidad | Capability | (keys en CAPABILITIES, @fundo360/shared) |

## Estados de Entidades

### Worker Status
- `active` — puede recibir registros de picking
- `inactive` — no puede recibir registros, no puede desactivarse si tiene deuda pendiente

### Field / Block Status
- `active` — operativo, visible para supervisores
- `inactive` — no se puede registrar picking, datos históricos se mantienen

### Settlement Status
- `pending` — calculada, pendiente de pago
- `partial` — parcialmente pagada
- `paid` — completamente pagada (inmutable)

### Rate Status
- `current` — tarifa vigente para el producto
- `historical` — tarifa anterior, usada solo para cálculos históricos

### BoxType Status
- `active` — tipo de caja disponible para seleccionar al registrar picking
- `inactive` — oculto en el registro; los registros históricos conservan su snapshot de peso

### PermissionProfile Status
- `active` — el perfil restringe a los workers que lo tienen asignado
- `inactive` — se ignora; los workers con este perfil vuelven a capacidades completas de su rol (igual que sin perfil)
