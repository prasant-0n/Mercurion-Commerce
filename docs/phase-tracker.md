# E-Commerce Platform Phase Tracker

Last reviewed: 2026-04-24
Source of truth: `docs/ecommerce-platform-architecture.md`

## Current status

The repository now has a complete Phase 0 repository foundation, a partial Phase 1 shared platform, and a usable auth baseline. The program is not yet at a complete Phase 2 state.

## Completed work

### Phase 0: repository bootstrap

Status: complete

Completed:

- Monorepo root with `apps/api` and `apps/web`
- `packages/config` workspace scaffold
- `infra/` directory scaffold
- Root workspace config in `package.json`
- TypeScript base config and API-specific config
- ESLint, Prettier, commitlint, lint-staged, and Husky hooks
- GitHub Actions pipeline with lint, typecheck, unit, integration, and build stages
- Local Docker Compose stack for PostgreSQL, MongoDB, Redis, OpenSearch, and RabbitMQ
- API `.env.example` for local bootstrap
- Initial repo bootstrap already committed and pushed

Relevant commits:

- `4f41ed7` `feat(repo): bootstrap monorepo foundation`
- `35d36e2` `chore(repo): modernize husky hook scripts`
- Pending current branch commit for CI, commitlint, and local infra

### Phase 1: shared platform foundations

Status: partially complete

Completed:

- Environment schema validation with `zod`
- Runtime bootstrap and HTTP server startup
- Liveness and readiness endpoints
- Graceful shutdown state tracking
- Structured `pino` logging
- OpenTelemetry tracing bootstrap with HTTP/Express auto-instrumentation
- Request ID propagation and request-scoped context
- Request-log trace correlation via trace and span IDs
- Centralized application error model
- Express async handler and not-found/error middleware
- Shared idempotency middleware backed by Prisma `idempotency_records`
- Prisma client wiring
- Initial Prisma schema and migration covering auth, inventory, orders, payments, outbox, and idempotency tables

Not complete:

- Shared rate limiting / security middleware is not implemented
- No tests for shared runtime or middleware
- Schema does not yet encode all architecture-level database guarantees
- no `CITEXT` email column
- no `INET` IP column
- no partial indexes from the architecture doc
- no DB check constraints for quantity and reservation invariants

Relevant commits:

- `ef0663b` `feat(api): add runtime lifecycle foundation`
- `d989973` `feat(api): add structured logging and request context`
- `7f1b919` `feat(api): add centralized error handling`
- `28f348a` `feat(api): add prisma schema baseline`
- Pending current branch commit for shared idempotency middleware
- Pending current branch commit for tracing bootstrap and log-trace correlation

### Phase 2: auth

Status: mostly complete for auth core, partial for full phase

Completed:

- Registration endpoint
- Login endpoint
- Refresh token rotation
- Logout endpoint
- Authenticated `GET /auth/me`
- Bcrypt password hashing
- JWT access token issuance and verification
- JWT refresh token issuance and verification
- PostgreSQL-backed refresh token persistence
- Refresh token family revocation on reuse / invalid rotation path
- Role and permission persistence in Prisma
- RBAC seed script
- Permission-based route middleware

Not complete:

- Password reset flow is not implemented
- Auth tests are not present
- RBAC enforcement is not yet applied across business modules
- Full cart phase work has not started

Relevant commits:

- `a3a6d24` `feat(auth): add register and token session flows`
- `a12243b` `feat(auth): add access token authentication middleware`
- `bebe82b` `feat(auth): add rbac seed and authorization context`

## Not started

The following architecture phases do not have implemented module code in the repository yet:

- Phase 2 cart core
- Phase 3 catalog authoring and search projection
- Phase 4 inventory core
- Phase 5 checkout and payments
- Phase 6 storefront
- Phase 7 hardening
- Phase 8 extraction roadmap

## What to do next

Execution order should follow dependency risk, not feature excitement.

1. Finish the missing Phase 1 platform requirements.
   - Add rate limiting and request validation hardening at the HTTP boundary.
   - Tighten Prisma migrations to match architecture-critical constraints and indexes.

2. Close the remaining auth gap before starting cart.
   - Add password reset flow.
   - Add auth integration tests for register, login, refresh rotation, logout, and token-reuse revocation.

3. Implement Phase 2 cart as its own bounded step.
   - Redis-backed cart storage
   - schema versioning
   - TTL refresh behavior
   - authoritative server validation

4. Do not start catalog, inventory, or checkout before the idempotency and shared-platform foundation are in place.

## Delivery note

The repository was already clean and synchronized with `origin/main` at review time. This tracker commit records the actual completion state so future work can start from the real merged baseline instead of assumptions.
