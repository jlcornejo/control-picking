# Revisión de diseño — Pago por kilo + Variedades (Rev. 4)

> **Alcance de esta ronda**: cierre de los 3 hallazgos abiertos de la Rev. 3
> (1 MEDIUM: capability `VARIETIES_MANAGE` / RBAC del CRUD de variedades;
> 2 NIT: rutas de archivo §4.3 y default de `status` en `GET /varieties`).
> El diseño convergió en 3 rondas previas; se revisa fresco contra `requirements.md`,
> los steering (`database-migrations`, `feature-flags`, `api-design`, `domain-rules`)
> y el código/esquema real del repo.

## Veredicto

**APPROVED** — 0 HIGH, 0 MEDIUM. Los 3 hallazgos de la Rev. 3 están resueltos y
verificados contra el código real. No se abren hallazgos bloqueantes nuevos. Se dejan
2 NIT no bloqueantes (abajo).

## Verificación de los 3 cierres solicitados

### (a) MEDIUM — Autorización del CRUD de variedades (cerrada por vía coherente)

El diseño **descarta** crear la capability `VARIETIES_MANAGE` y autoriza el CRUD de
variedades **solo** con `requireRole(['admin'])` (§4.3, §5.4, Resumen de archivos).
Verificado contra el código real:

- `supabase/functions/products/index.ts`: `handlePost` y `handlePut` gatean con
  `requireRole(req, ['admin'])` únicamente (líneas 66 y 99). No usan `requirePermission`.
- `supabase/functions/blocks/index.ts`: `handlePost`, `handlePut`, `handlePatchStatus`
  gatean con `requireRole(req, ['admin'])` únicamente (líneas 65, 88, 108). No usan
  `requirePermission`.

La decisión es coherente con el patrón real de los módulos análogos y **evita** el riesgo
que señaló la Rev. 3 (un admin con `permission_profile` restrictivo quedaría sin la
capacidad en su claim `permissions` del JWT → CRUD inaccesible). Como consecuencia, el
catálogo `CAPABILITIES` en `types/index.ts` no se toca. Verificado que ese catálogo y su
cableado existen y que tocarlo tendría efecto en cadena:

- `CAPABILITIES`, `Capability`, `ALL_CAPABILITIES` y `CAPABILITY_LABELS`
  (`Record<Capability,string>` **exhaustivo**) viven en
  `packages/shared/src/types/index.ts` (líneas ~370–406). Añadir una clave obligaría a
  extender el `Record` exhaustivo (su olvido rompe la compilación TS) y `ALL_CAPABILITIES`
  la recogería automáticamente.
- `createPermissionProfileSchema` en `packages/shared/src/validation/index.ts` usa
  `z.enum(ALL_CAPABILITIES as [...])` (línea ~50), de modo que una capability nueva se
  propagaría al schema y a la UI de perfiles.

Conclusión: la autorización quedó cerrada por `requireRole(['admin'])` + policy
`admin_all_product_varieties` (RLS). RBAC preservado (CA-26). **Cerrada.**

### (b) NIT — Rutas de archivo §4.3 separadas correctamente

El diseño separa explícitamente (§4.3 y Resumen de archivos):

- `ERROR_CODES` y `FEATURE_FLAGS` → `packages/shared/src/constants/index.ts`.
- `ProductVariety`, extensiones a `Block`/`Rate`/`PickingRecord`, `SettlementBreakdownLine`,
  y las funciones puras `pickingPayableBase`/`pickingSubtotal`/`resolveFeatureFlag` →
  `packages/shared/src/types/index.ts`.

Verificado contra el repo:

- `ERROR_CODES` efectivamente vive en `packages/shared/src/constants/index.ts`.
- `FEATURE_FLAGS` **no existe aún** en `constants/index.ts` → el diseño lo trata
  correctamente como nuevo (sin conflicto con lo existente).
- `CAPABILITIES`/`CAPABILITY_LABELS`/`ALL_CAPABILITIES` viven en `types/index.ts`, no en
  `constants/index.ts`; el diseño lo refleja correctamente y deja ese archivo intacto.

La ruta errónea de la Rev. 3 (`constants/index.ts` para la capability) quedó corregida.
**Cerrada.**

### (c) NIT — Default de `status` y paginación en `GET /varieties`

§5.4 declara:

- `status` **omitido ⇒ `active`** para todos los roles; `status=all` solo lo honra `admin`
  (para no-admin la RLS `member_read_active_product_varieties` oculta inactivas igualmente);
  valor no reconocido ⇒ `VALIDATION_ERROR` 422.
- Paginación obligatoria: `limit` default **20**, máx **100** (recortado), `offset`/`page`,
  respuesta `{ success, data, meta }` con `meta = { page, total, limit }`.

Verificado contra el patrón real de `products/index.ts` (`handleGet`):
`const status = url.searchParams.get('status') || 'active'` con rama `status !== 'all'`;
`limit = Math.min(parseInt(... || '20'), 100)`; `meta = { page, total: count ?? 0, limit }`.
El diseño coincide con la convención real y la endurece de forma razonable (no-admin no
honra `all`, status inválido → 422), sin conflicto con `api-design`. **Cerrada.**

## Hallazgos

1. **NIT — `product_id` obligatorio en `GET /varieties` sin spec de validación de formato.**
   §5.4 exige `product_id` (422 si falta) pero no dice que valide formato UUID antes de
   consultar. *Fix*: documentar que `product_id` se valida como UUID (`z.string().uuid()` en
   cliente / check en la función) y que un UUID mal formado también devuelve
   `VALIDATION_ERROR` 422, para no filtrar un error de DB como 400 genérico. No bloqueante.

2. **NIT — Referencia por número de línea frágil en §4.3.** §4.3 referencia
   "`types/index.ts`, líneas ~370–406". El rango es correcto hoy (verificado) pero las
   referencias por número de línea envejecen mal. *Fix*: al implementar, referir por nombre
   de símbolo (`CAPABILITIES`/`CAPABILITY_LABELS`) sin el número de línea. No bloqueante.

## Supuestos verificados

- `products` y `blocks` gatean su escritura **solo** con `requireRole(req, ['admin'])`, sin
  `requirePermission` (leído en ambos `index.ts`). Sustenta la decisión RBAC de §4.3/§5.4.
- `CAPABILITIES`, `ALL_CAPABILITIES` y `CAPABILITY_LABELS` (`Record` exhaustivo) viven en
  `packages/shared/src/types/index.ts`; `createPermissionProfileSchema` consume
  `z.enum(ALL_CAPABILITIES)` en `validation/index.ts`. Sustenta "no tocar el catálogo".
- `ERROR_CODES` vive en `packages/shared/src/constants/index.ts`.
- `FEATURE_FLAGS` no existe aún en `constants/index.ts` (se añade nuevo, sin colisión).
- Patrón de listado/paginación de `products` (`status || 'active'`, `Math.min(limit,100)`,
  `meta={page,total,limit}`) coincide con lo que §5.4 especifica para `GET /varieties`.

## Supuestos no verificados / fuera de esta ronda

- **Supuesto B** (no hay productos `kg` ni variedades en producción; el backfill M4 marca
  todo `box`): no verificable desde migraciones; aceptado y declarado en §12. Fuera del
  alcance acotado de esta ronda; ya evaluado en rondas previas.
- **Supuesto A** (`rates` no tiene `updated_at` pese a `Rate extends BaseEntity`): declarado
  en §12; no re-verificado en esta ronda por estar fuera de los 3 cierres solicitados.
- Resolución efectiva del flag en runtime (override org → default global) y el
  comportamiento del embedding PostgREST con hint de FK compuesta: ya aceptados en rondas
  previas; no re-ejecutados en entorno local en esta ronda.
