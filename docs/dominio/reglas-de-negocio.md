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
11. La corrección conserva el registro original como auditoría (soft-update, no delete).
12. El registro de producción es idéntico exista o no Modo Capataz; no se duplica.

### Tarifas

13. Una tarifa siempre es > 0 (nunca cero ni negativa).
14. La tarifa aplicada a un registro es la vigente al momento del registro, no la actual.
15. El historial de tarifas es inmutable — no se borran, se crean nuevas versiones.
16. Siempre existe exactamente una tarifa activa por producto en un momento dado.

### Liquidaciones y pagos en dos niveles

17. Liquidación = Σ (cantidad_i × tarifa_vigente_i) para todos los registros del período.
18. Una liquidación nunca puede ser negativa.
19. El monto pagado nunca puede exceder el monto liquidado pendiente.
20. Una liquidación marcada como pagada es inmutable.
21. El saldo pendiente = total liquidado − total pagado (nunca negativo).
22. Cada liquidación es a favor de un Trabajador (`payee_type = worker`) o de una Cuadrilla (`payee_type = crew`), nunca ambos a la vez.
23. **Con Modo Capataz activo**: el cliente liquida a la Cuadrilla (nivel 1, a nombre del Encargado, agregando la producción de la cuadrilla); el Encargado liquida y paga a sus Trabajadores (nivel 2).
24. **Sin Modo Capataz**: el cliente/supervisor liquida y paga directamente a cada Trabajador.

### RBAC

25. Un trabajador solo puede ver SUS propios datos.
26. Un supervisor solo puede operar sobre trabajadores y paños ASIGNADOS a él, dentro de su Organización.
27. Un encargado solo puede ver y gestionar SU cuadrilla (sus trabajadores, su producción y los pagos que él realiza).
28. Solo un administrador puede modificar tarifas, campos, cuadrillas y configuración, dentro de su Organización.
29. Los datos financieros (montos, tarifas) son invisibles para el rol trabajador, excepto su propio estimado.
30. Solo el Administrador de Plataforma gestiona Organizaciones y suscripciones.

### Estructura de campo

31. Un paño pertenece a exactamente un campo.
32. Un paño tiene asociado exactamente un producto.
33. No se puede eliminar un campo/paño con registros de picking asociados (solo desactivar).

## Jerarquía de roles

```
Administrador de Plataforma  (dueño del SaaS, fuera de las organizaciones)
        │
        ▼  (por cada Organización / cliente)
Administrador → Supervisor → Encargado (opcional) → Trabajador
```

El nivel **Encargado** (Capataz) es opcional y se activa mediante el **Modo Capataz**, configurable por Organización con override por Campo (`fields.crew_mode_enabled`; `NULL` hereda el default de la organización). Las **etiquetas de rol** son personalizables por Organización (`role_labels`) sin alterar la jerarquía ni la seguridad.

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
