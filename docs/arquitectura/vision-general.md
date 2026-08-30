# Arquitectura

## Monorepo

Fundo360 vive en un monorepo gestionado con **Turborepo** y npm workspaces.

```
fundo360/
├── apps/
│   ├── web/          # Next.js dashboard (admin)
│   └── mobile/       # Expo React Native (supervisores y trabajadores)
├── packages/
│   └── shared/       # Tipos, constantes y validación (Zod) compartidos
├── supabase/
│   ├── migrations/   # Migraciones SQL (timestamped)
│   ├── functions/    # Edge Functions (API REST)
│   └── seed.sql      # Datos de desarrollo
└── docs/             # Esta documentación
```

## Stack tecnológico

| Capa | Tecnología | Propósito |
|------|-----------|-----------|
| Mobile | React Native (Expo SDK 51+) | App para supervisores y trabajadores |
| Web | Next.js (App Router 14+) | Dashboard administrativo |
| Backend | Supabase Edge Functions | API REST, lógica de negocio |
| Database | PostgreSQL 15+ | Persistencia con RLS |
| Auth | Supabase Auth | JWT, roles, sesiones |
| Storage | Supabase Storage | Imágenes de badges QR |
| Realtime | Supabase Realtime | Dashboard en vivo |

### Librerías frontend

- **TanStack Query** — estado, caché y actualizaciones optimistas
- **Recharts** — gráficos del dashboard
- **React Navigation** — navegación mobile
- **expo-camera** — scanner QR
- **Zod** — validación de schemas en cliente
- **tailwindcss** — estilos web

## Patrón de módulo (Edge Functions)

Cada Edge Function sigue esta estructura:

```
supabase/functions/{module-name}/
├── index.ts        # Route handler (entry point)
├── service.ts      # Lógica de negocio
├── validation.ts   # Zod schemas para validar requests
└── types.ts        # Tipos específicos del módulo
```

## Reglas de importación

- `packages/shared` se importa como `@fundo360/shared`
- Nunca importar desde `apps/web` hacia `apps/mobile` ni viceversa
- Las Edge Functions importan tipos compartidos desde `packages/shared`
- Imports relativos dentro de un módulo, absolutos entre módulos

## Multi-tenancy

Fundo360 es un SaaS multi-cliente con **tenant compartido**: una sola base de datos donde cada tabla de dominio lleva `organization_id`, y el aislamiento entre clientes lo garantiza **Row Level Security**.

- **Identidad del tenant en el JWT**: el hook `custom_access_token_hook` inyecta `org_id`, `app_role`, `worker_id`, `is_platform_admin` y `subscription_active` en cada token.
- **Patrón RLS**: toda política combina el rol con el tenant — `is_platform_admin() OR (<predicado_rol> AND organization_id = current_org_id())`.
- **Integridad de tenant**: FKs compuestas `(id, organization_id)` impiden referencias cruzadas entre organizaciones.
- **Administrador de Plataforma**: rol fuera de los tenants (tabla `platform_admins`), con bypass de RLS centralizado en `is_platform_admin()` y auditoría en `platform_audit_log`.
- **Suscripción**: si la organización no está vigente, el hook no entrega `org_id` y RLS niega el acceso a los datos (que se preservan).

La consola de plataforma vive en un espacio separado del dashboard de cliente (`apps/web/src/app/(platform)/`), con su propio layout que valida `platform_admins`.

## Decisiones arquitectónicas clave

1. **Supabase sobre backend propio**: Auth + DB + Storage + Realtime en un solo servicio, con RLS para seguridad de datos.
2. **Edge Functions sobre API tradicional**: serverless, auto-escalable, desplegado junto a la base de datos.
3. **Monorepo con Turborepo**: tipos compartidos, builds unificados, una sola fuente de verdad.
4. **RLS como capa primaria de seguridad**: la base de datos aplica las reglas de acceso, no solo el middleware.
5. **Multi-tenant con `organization_id` + RLS**: un solo esquema, aislamiento por organización, bypass auditable para el Administrador de Plataforma.
6. **`rate_amount_snapshot` en `picking_records`**: registro inmutable de la tarifa vigente al momento del registro.
7. **UUIDs en todas partes**: sin IDs secuenciales expuestos; el QR contiene un UUID opaco.
8. **Modo Capataz opcional**: la jerarquía con Encargado se activa por organización con override por campo, sin fragmentar el modelo de datos.

## Convenciones de nomenclatura

| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Archivos | `kebab-case.ts` | `picking-record.ts` |
| Clases / Interfaces | `PascalCase` | `PickingRecord` |
| Funciones / Variables | `camelCase` | `getWorkerBalance` |
| Constantes | `UPPER_SNAKE_CASE` | `MAX_PAGE_SIZE` |
| Tablas DB | `snake_case` plural | `picking_records` |
| Columnas DB | `snake_case` | `rate_amount_snapshot` |
| Endpoints API | `/api/kebab-case` plural | `/api/picking-records` |
