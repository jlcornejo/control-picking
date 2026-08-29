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

## Decisiones arquitectónicas clave

1. **Supabase sobre backend propio**: Auth + DB + Storage + Realtime en un solo servicio, con RLS para seguridad de datos.
2. **Edge Functions sobre API tradicional**: serverless, auto-escalable, desplegado junto a la base de datos.
3. **Monorepo con Turborepo**: tipos compartidos, builds unificados, una sola fuente de verdad.
4. **RLS como capa primaria de seguridad**: la base de datos aplica las reglas de acceso, no solo el middleware.
5. **`rate_amount_snapshot` en `picking_records`**: registro inmutable de la tarifa vigente al momento del registro.
6. **UUIDs en todas partes**: sin IDs secuenciales expuestos; el QR contiene un UUID opaco.

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
