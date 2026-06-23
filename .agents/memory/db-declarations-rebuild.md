---
name: DB schema changes require declaration rebuild
description: After editing lib/db schema files, tsc must be run in lib/db to regenerate dist/*.d.ts before dependent packages see the new columns.
---

# DB declarations must be rebuilt after schema changes

## The rule
After editing any file in `lib/db/src/schema/`, run:
```
cd lib/db && npx tsc -p tsconfig.json
```
before running typecheck on `artifacts/api-server` or any other consumer.

## Why
`lib/db` uses TypeScript project references (`composite: true`, `emitDeclarationOnly: true`). Consumers resolve types from `lib/db/dist/*.d.ts`, not the source `.ts` files directly. If the declarations are stale, `clientsTable.newColumn` errors appear even though the source is correct. Clearing `.tsbuildinfo` alone is not sufficient — the declarations must be emitted.

## How to apply
Any time a new column is added to `lib/db/src/schema/*.ts`:
1. Edit the schema file
2. Run `pnpm --filter @workspace/db run push` (or push-force) to apply to DB
3. Run `cd lib/db && npx tsc -p tsconfig.json` to regenerate declarations
4. Then run typecheck on consumers — it will pass
