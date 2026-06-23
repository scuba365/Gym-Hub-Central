# Gym OS

A unified command center for personal trainers. Pulls client data from TeamUp (attendance/bookings), Trainerize (training engagement), and InBody (body composition scans) into a single dashboard. Client cards show all key metrics at a glance. A "Sync All Sources" button fetches fresh data from all three platforms on demand.

## Run & Operate

- `pnpm --filter @workspace/gym-os run dev` — run the frontend (port auto-assigned)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Required Secrets

These must be set in Replit Secrets before Sync will pull real data:

| Secret | What it's for |
|---|---|
| `DATABASE_URL` | Postgres connection string (auto-set by Replit DB) |
| `TEAMUP_API_KEY` | TeamUp API token (from TeamUp developer settings) |
| `TEAMUP_CALENDAR_KEY` | Your TeamUp calendar key (from the calendar URL) |
| `TRAINERIZE_API_KEY` | Trainerize partner API key |
| `TRAINERIZE_ACCOUNT_ID` | Your Trainerize account/gym ID |
| `INBODY_API_KEY` | InBody cloud API key |
| `INBODY_BASE_URL` | InBody API base URL (optional, defaults to `https://onus.inbody.com/api/v1`) |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, Recharts, Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/gym-os/` — React + Vite frontend (served at `/`)
- `artifacts/api-server/` — Express API server (served at `/api`)
- `lib/api-spec/openapi.yaml` — Single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle schema: `clients.ts`, `scans.ts`, `attendance.ts`, `training.ts`
- `artifacts/api-server/src/services/` — TeamUp, Trainerize, InBody sync services
- `artifacts/api-server/src/routes/` — `clients.ts`, `sync.ts`, `dashboard.ts`

## Architecture decisions

- **Sync is manual, not real-time.** All three external APIs are polled on demand when the trainer clicks "Sync All Sources". This keeps the app simple and avoids webhooks/polling complexity.
- **Client identity is matched by email first, then name.** When syncing across three platforms, a shared email is the most reliable join key. TeamUp member IDs, Trainerize client IDs, and InBody user IDs are stored on the client record for future delta syncs.
- **Manually edited fields survive sync.** `goals`, `notes`, and `needs_meal_plan` are trainer-owned fields — sync never overwrites them. External platform data only updates attendance/training/scan metrics.
- **Graceful degradation.** If a platform's API key is missing or its call fails, the sync continues for the other platforms and reports which sources succeeded vs. failed.
- **Engagement status.** Computed from the most recent attendance date (TeamUp) or training session (Trainerize): Active = last 7 days, At Risk = 8–14 days, Disengaged = 14+ days.

## Product

- **Dashboard** — stats bar (total, active, at-risk, disengaged, needs meal plan, overdue InBody) + filterable client card grid + Sync button
- **Client cards** — weekly attendance avg, workout compliance %, latest InBody stats (weight + body fat %), engagement badge, meal plan flag, goals preview
- **Client detail** — InBody trajectory chart (weight + body fat % over time), 90-day attendance heatmap, editable goals/notes/meal-plan toggle, full scan history
- **Sync** — parallel fetch from all configured sources, returns per-source counts, lists which sources are missing credentials

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any change to `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` before building the frontend
- Drizzle uses `text` for date fields (stored as ISO date strings `YYYY-MM-DD`). Do not use `date` type columns — Drizzle returns them as JS `Date` objects which break JSON serialization
- TeamUp requires both `TEAMUP_API_KEY` (auth token) and `TEAMUP_CALENDAR_KEY` (calendar identifier from the URL)
- The Trainerize API base URL and auth header format may vary depending on the partner tier — adjust `artifacts/api-server/src/services/trainerize.ts` if needed

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
