# Technology Stack

## Core Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Mobile | React Native (Expo) | SDK 51+ | App para supervisores y trabajadores |
| Web | Next.js (App Router) | 14+ | Dashboard administrativo |
| Backend | Supabase Edge Functions | Latest | API REST, lógica de negocio |
| Database | PostgreSQL | 15+ | Persistencia con RLS |
| Auth | Supabase Auth | Latest | JWT, roles, sesiones |
| Storage | Supabase Storage | Latest | Imágenes QR badges |
| Realtime | Supabase Realtime | Latest | Dashboard en vivo |

## Frontend Libraries

| Library | Purpose |
|---------|---------|
| TanStack Query | State management, cache, optimistic updates |
| Recharts | Gráficos del dashboard |
| React Navigation | Navegación mobile |
| expo-camera | Scanner QR |
| Zod | Validación de schemas en cliente |
| tailwindcss | Styling web |

## Development Tools

| Tool | Purpose |
|------|---------|
| TypeScript | Strict mode, type safety |
| ESLint | Linting |
| Prettier | Formateo |
| Vitest | Unit + integration tests |
| Playwright | E2E tests web |
| Supabase CLI | Dev local, migraciones |

## Conventions

### Language

- Código, variables, funciones, commits: **Inglés**
- UI messages, documentación de negocio: **Español**
- Comentarios en código: **Inglés**

### Naming

- Files: `kebab-case.ts`
- Classes/Interfaces: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- DB tables: `snake_case` plural
- DB columns: `snake_case`
- API endpoints: `/api/kebab-case` plural
- UUIDs for all primary keys (never sequential IDs)

### API Response Format

```typescript
// Success
{ success: true, data: { ... }, meta?: { page, total, limit } }

// Error
{ success: false, error: { code: string, message: string, details?: object } }
```

### Git

- Conventional Commits: `type(scope): description`
- Types: feat, fix, refactor, test, docs, chore, ci
- Scopes: fields, workers, picking, payments, metrics, auth, infra
- Branch: `feature/{id}-description` or `fix/{id}-description`

## Constraints

- TypeScript strict mode always on
- No `any` — use `unknown` + type guards
- Paginación obligatoria en listados (default: 20, max: 100)
- Rate limiting en endpoints públicos
- Logs estructurados JSON con correlation ID
- No secrets en logs (RUT, tokens, passwords)
