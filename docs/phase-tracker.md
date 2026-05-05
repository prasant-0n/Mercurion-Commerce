# E-Commerce Platform Phase Tracker

Last reviewed: 2026-05-06
Source of truth: `docs/ecommerce-platform-architecture.md`

## Current status

The repository now has a complete Phase 0 repository foundation, a complete Phase 1 shared platform, a complete Phase 2 implementation covering both auth and cart, a complete Phase 3 catalog slice, a complete Phase 4 inventory core, and a complete Phase 5 checkout and payments core.

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

### Phase 3: catalog authoring

Status: complete

Completed:

- MongoDB runtime configuration and shared client bootstrap
- Graceful MongoDB shutdown wiring alongside existing runtime cleanup
- Admin-protected catalog authoring REST APIs for create, list, get, and update
- Catalog application service with normalization and authoring-only business rules
- MongoDB catalog repository with collection validation and core indexing strategy
- In-memory catalog repository for fast service and route validation
- Unit coverage for catalog authoring service rules
- Integration coverage added for catalog authz and CRUD flows

Residual risks:

- Live MongoDB integration coverage is not present yet
- Local Prisma-backed integration execution is currently blocked by a Prisma schema-engine failure during migration deployment against `localhost:5432`

### Phase 4: inventory core

Status: complete

Completed:

- Inventory item management service and admin REST APIs
- PostgreSQL-backed inventory repository
- Deterministic warehouse allocation by highest available stock and stable warehouse ordering
- Contention-safe reservation transaction using optimistic version checks and bounded retries
- Reservation release, confirmation, and expiration flows with replay-safe state transitions
- Inventory outbox event emission for reserved, confirmed, released, and expired reservation events
- Reservation expiration worker with configurable interval and batch size
- Checkout-safe inventory metrics counters for unavailable stock, contention, and expirations
- Unit coverage for reservation normalization, unavailable-stock metrics, and expiration metrics

Residual risks:

- Live PostgreSQL concurrency stress coverage still depends on the local integration database being available and migrated
- No Prometheus exporter exists yet; inventory metrics are currently service-level counters exposed to the application layer

### Phase 5: checkout and payments

Status: complete

Completed:

- Checkout application service with cart ownership validation, product snapshot validation, order total calculation, and order creation
- REST `POST /api/v1/checkout` endpoint with authentication, RBAC, rate limiting, and required idempotency
- Prisma-backed order and payment attempt persistence
- Payment provider adapter abstraction with a deterministic local Razorpay-compatible development adapter
- Raw-body webhook capture and Razorpay webhook signature verification
- Idempotent payment webhook event persistence
- Webhook-driven saga continuation for captured, authorized, failed, and cancelled payment states
- Inventory compensation on payment initiation or payment failure paths
- Order read API with self-vs-any authorization enforcement
- Payment reconciliation worker for stale pending attempts
- Unit coverage for checkout success, payment-initiation compensation, and captured-payment webhook confirmation

Residual risks:

- Real Razorpay API integration is represented by the provider port and local adapter, not a networked production adapter
- Reconciliation polling behavior is implemented, but provider-specific stale-payment lookup must be expanded when a real PSP adapter is added

## Not started

The following architecture phases do not have implemented module code in the repository yet:

- Phase 6 storefront
- Phase 7 hardening
- Phase 8 extraction roadmap

## What to do next

Execution order should follow dependency risk, not feature excitement.

1. Start Phase 6 storefront only after the catalog read model contracts are confirmed stable enough for SSR/ISR storefront routes.
2. Keep Phase 7 hardening focused on the highest-risk runtime paths first: inventory concurrency, checkout idempotency, webhook replay, and stale payment reconciliation.

## Delivery note

Phase 2 remains closed. Phase 4 and Phase 5 now provide the downstream modules needed to exercise auth/RBAC and cart behavior in real checkout flows.
