# Project Structure

## Monorepo Layout

```
fundo360/
├── apps/
│   ├── web/                    # Next.js dashboard (admin)
│   │   ├── src/
│   │   │   ├── app/            # App Router pages
│   │   │   ├── components/     # UI components
│   │   │   ├── lib/            # Supabase client, utilities
│   │   │   └── hooks/          # Custom React hooks
│   │   ├── public/
│   │   └── package.json
│   └── mobile/                 # Expo React Native app
│       ├── src/
│       │   ├── screens/        # Screen components
│       │   ├── components/     # Shared mobile components
│       │   ├── navigation/     # React Navigation config
│       │   ├── lib/            # Supabase client, utilities
│       │   └── hooks/          # Custom hooks
│       ├── app.json
│       └── package.json
├── packages/
│   └── shared/                 # Shared types, constants, validation
│       ├── src/
│       │   ├── types/          # Domain interfaces & enums
│       │   ├── constants/      # Shared constants
│       │   └── validation/     # Zod schemas
│       └── package.json
├── supabase/
│   ├── migrations/             # SQL migrations (timestamped)
│   ├── functions/              # Edge Functions (API)
│   │   ├── _shared/            # Shared utilities across functions
│   │   ├── picking-records/    # POST/PUT /api/picking-records
│   │   ├── workers/            # CRUD /api/workers
│   │   ├── fields/             # CRUD /api/fields
│   │   ├── products/           # CRUD /api/products
│   │   ├── settlements/        # Liquidaciones
│   │   ├── payments/           # Pagos
│   │   └── metrics/            # Dashboard analytics
│   ├── seed.sql                # Dev seed data
│   └── config.toml             # Supabase project config
├── docs/                       # Business documents, PDFs
├── .kiro/                      # Kiro agentic config
│   ├── steering/               # Context files
│   ├── hooks/                  # Automation hooks (v1 JSON)
│   ├── specs/                  # Feature specifications
│   └── settings/               # MCP config
├── package.json                # Monorepo root (workspaces)
├── turbo.json                  # Turborepo config
└── .env.example                # Environment variables template
```

## Module Pattern (Edge Functions)

Each Edge Function follows this pattern:

```
supabase/functions/{module-name}/
├── index.ts                    # Route handler (entry point)
├── service.ts                  # Business logic
├── validation.ts               # Zod schemas for request validation
└── types.ts                    # Module-specific types
```

## Import Rules

- `packages/shared` is imported as `@fundo360/shared`
- Never import from `apps/web` into `apps/mobile` or vice versa
- Edge Functions import shared types from `packages/shared`
- Relative imports within a module, absolute across modules

## Key Architectural Decisions

1. **Supabase over custom backend**: Auth + DB + Storage + Realtime in one service, RLS for data security
2. **Edge Functions over traditional API**: Serverless, auto-scaling, deployed alongside DB
3. **Monorepo with Turborepo**: Shared types, unified builds, single source of truth
4. **RLS as primary security layer**: Database enforces access rules, not just middleware
5. **rate_amount_snapshot in picking_records**: Immutable record of tariff at registration time
6. **UUIDs everywhere**: No sequential IDs exposed, QR contains opaque UUID
