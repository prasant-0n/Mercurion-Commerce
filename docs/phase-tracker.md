# E-Commerce Platform Phase Tracker

Last reviewed: 2026-04-27
Source of truth: `docs/ecommerce-platform-architecture.md`

## Current status

The repository now has a complete Phase 0 repository foundation, a complete Phase 1 shared platform, and a complete Phase 2 implementation covering both auth and cart.

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
- `c4a6448` `feat(repo): complete phase 0 quality gate`

### Phase 1: shared platform foundations

Status: complete

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
- Shared security headers, request content-type enforcement, and API/auth rate limiting
- Prisma client wiring
- Initial Prisma schema and migration covering auth, inventory, orders, payments, outbox, and idempotency tables
- PostgreSQL contract hardening for `citext`, `inet`, quantity checks, reservation invariants, and partial hot-path indexes
- Unit and integration coverage for runtime state, app middleware, and PostgreSQL schema contract

Residual risks:

- No transaction-heavy reservation SQL or concurrency test coverage yet
- No OpenTelemetry assertion coverage yet

Relevant commits:

- `ef0663b` `feat(api): add runtime lifecycle foundation`
- `d989973` `feat(api): add structured logging and request context`
- `7f1b919` `feat(api): add centralized error handling`
- `28f348a` `feat(api): add prisma schema baseline`
- `4fa1c7f` `feat(api): add idempotency middleware`
- `b0b0c7f` `feat(api): add opentelemetry tracing`
- `d7a58c4` `feat(api): add security middleware`
- `b367c19` `feat(api): harden postgres schema`
- Pending current branch commit for shared-platform tests and CI-backed integration verification

### Phase 2: auth

Status: complete

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
- Password reset request + confirm flow
- Password reset token persistence and session revocation on password change
- Auth integration coverage for register, login, refresh rotation, logout, reuse revocation, and password reset

Residual risks:

- RBAC enforcement is not yet applied across future business modules because those modules do not exist yet

Relevant commits:

- `a3a6d24` `feat(auth): add register and token session flows`
- `a12243b` `feat(auth): add access token authentication middleware`
- `bebe82b` `feat(auth): add rbac seed and authorization context`

### Phase 2: cart

Status: complete

Completed:

- Redis-backed cart repository with explicit cart schema versioning
- Cart TTL refresh behavior on read and write paths
- Authenticated cart APIs for read, upsert line, remove line, and clear cart
- Server-authoritative cart mutation validation for SKU and quantity inputs
- Cart response versioning to support optimistic client reconciliation
- Cart-specific rate limiting
- Cart integration coverage and Redis repository unit coverage

Residual risks:

- Cart validation is intentionally limited to server-side mutation rules until catalog and inventory modules exist
- No real Redis integration test is present yet; the Redis adapter is covered through unit tests and exercised by the production path

## Not started

The following architecture phases do not have implemented module code in the repository yet:

- Phase 3 catalog authoring and search projection
- Phase 4 inventory core
- Phase 5 checkout and payments
- Phase 6 storefront
- Phase 7 hardening
- Phase 8 extraction roadmap

## What to do next

Execution order should follow dependency risk, not feature excitement.

1. Start Phase 3 catalog authoring and search projection.
   - MongoDB product authoring model
   - publication flow and outbox event emission
   - OpenSearch projection worker

2. Keep checkout and inventory deferred until catalog and cart read models are stable enough to support authoritative checkout validation.

## Delivery note

The repository was already clean and synchronized with `origin/main` at review time. This tracker commit records the actual completion state so future work can start from the real merged baseline instead of assumptions.
