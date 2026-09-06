# Ummah FX

Ummah FX is a currency planning tool that helps users compare indicative foreign-exchange provider costs and understand FX risk.

## Run & Operate

- `pnpm install --frozen-lockfile` — restore the workspace dependencies after an import
- Use the managed `artifacts/ummah-fx: web` workflow — run the React/Vite frontend
- Use the managed `artifacts/api-server: API Server` workflow — run the Express API
- Use the managed `artifacts/mockup-sandbox: Component Preview Server` workflow — run canvas component previews
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — supplied by Replit's built-in PostgreSQL database

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ummah-fx` — React/Vite frontend
- `artifacts/api-server` — Express API
- `artifacts/mockup-sandbox` — canvas component preview app
- `lib/api-spec` — OpenAPI source and code generation
- `lib/api-client-react` — generated React API client
- `lib/api-zod` — generated Zod API schemas
- `lib/db` — PostgreSQL/Drizzle database package

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
