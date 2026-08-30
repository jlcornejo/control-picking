# Reglas de Dominio

## Invariantes de negocio

Estas reglas son propiedades de correctness del sistema. Nunca deben violarse y deben validarse con property-based tests.

### Picking

1. Un registro de picking siempre tiene: `worker_id`, `block_id`, cantidad > 0, fecha/hora.
2. No se puede registrar picking para un trabajador desactivado.
3. No se puede registrar picking en un paño desactivado.
4. La cantidad registrada nunca puede ser negativa ni cero.
5. Un registro solo puede corregirse dentro de la misma jornada (día calendario).
6. La corrección conserva el registro original como auditoría (soft-update, no delete).

### Tarifas

7. Una tarifa siempre es > 0 (nunca cero ni negativa).
8. La tarifa aplicada a un registro es la vigente al momento del registro, no la actual.
9. El historial de tarifas es inmutable — no se borran, se crean nuevas versiones.
10. Siempre existe exactamente una tarifa activa por producto en un momento dado.

### Liquidaciones

11. Liquidación = Σ (cantidad_i × tarifa_vigente_i) para todos los registros del período.
12. Una liquidación nunca puede ser negativa.
13. El monto pagado nunca puede exceder el monto liquidado pendiente.
14. Una liquidación marcada como pagada es inmutable.
15. El saldo pendiente = total liquidado − total pagado (nunca negativo).

### RBAC

16. Un trabajador solo puede ver SUS propios datos.
17. Un supervisor solo puede operar sobre trabajadores y paños ASIGNADOS a él.
18. Solo un administrador puede modificar tarifas, campos y configuraciones.
19. Los datos financieros (montos, tarifas) son invisibles para el rol trabajador, excepto su propio estimado.

### Estructura de campo

20. Un paño pertenece a exactamente un campo.
21. Un paño tiene asociado exactamente un producto.
22. La superficie de los paños no puede exceder la superficie total del campo.
23. No se puede eliminar un campo/paño con registros de picking asociados (solo desactivar).

## Glosario técnico → dominio

| Concepto de negocio | Nombre en código | Tabla DB |
|---------------------|------------------|----------|
| Campo / Fundo | `Field` | `fields` |
| Paño / Cuartel | `Block` | `blocks` |
| Producto | `Product` | `products` |
| Tarifa | `Rate` | `rates` |
| Trabajador | `Worker` | `workers` |
| Supervisor | `Supervisor` | (rol en `workers`) |
| Registro de Picking | `PickingRecord` | `picking_records` |
| Jornada | `WorkDay` | `work_days` |
| Liquidación | `Settlement` | `settlements` |
| Pago | `Payment` | `payments` |
| Badge QR | `QrBadge` | (campo en `workers`) |

## Estados de entidades

### Worker

- `active` — puede recibir registros de picking.
- `inactive` — no puede recibir registros; no puede desactivarse si tiene deuda pendiente.

### Field / Block

- `active` — operativo, visible para supervisores.
- `inactive` — no se puede registrar picking; los datos históricos se mantienen.

### Settlement

- `pending` — calculada, pendiente de pago.
- `partial` — parcialmente pagada.
- `paid` — completamente pagada (inmutable).

### Rate

- `current` — tarifa vigente para el producto.
- `historical` — tarifa anterior, usada solo para cálculos históricos.
