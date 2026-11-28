# Multi-cloud platform architecture

## Operating principle

The project now has a provider adapter layer, but the production origin remains the PHP application on Render with Neon PostgreSQL and the currently selected object-storage provider. The Cloudflare Worker and Next.js deployment targets are optional, independently deployed runtimes. They do not become active merely because their source/configuration exists in Git.

No dual-write is enabled. A single provider is selected for new writes in each runtime. Neon read fallback is permitted during the object-storage migration. Database migrations are engine-specific and are never applied automatically to production by the infrastructure provisioning workflow.

## Runtime map

| Runtime | Responsibility | State |
|---|---|---|
| Render PHP 8.4 / Apache | Existing authentication, Admin, moderation, developer, catalogue, library and download business API | Existing production origin |
| Cloudflare Platform Worker | Edge API health/capabilities, same-origin proxy to the PHP business API, optional public catalogue KV cache | Source implemented; deploy manually |
| Next.js 16.4.6 / React 19.3.1 / Tailwind 4.3.5 | SSR Storefront, app detail SEO, screenshots, changelog/specs/privacy and structured data | Source implemented; separate Render Docker and Workers/OpenNext targets |
| Cloudflare Pages | Existing static assets + _worker.js compatibility proxy to the PHP origin | Legacy optional target; Pages is not a PHP runtime |
| Neon PostgreSQL | Existing source of truth for users, apps, releases, reviews and library | Existing production database |
| CloudFly / R2 / generic S3 | Private objects and direct-to-cloud package uploads via the S3 adapter | Configurable; real provider credentials/bucket must be verified |
| Cloudflare D1 | Separate SQLite-compatible Worker database | Adapter/provisioning path exists; empty resource only until schema is migrated |
| Cloudflare Hyperdrive | Worker connection pool/proxy to PostgreSQL or MySQL | Adapter/provisioning path exists; uses the selected existing database |
| SQLite | Local development, tests or one Render instance with a persistent disk | Not suitable as a shared multi-instance production database |
| MySQL/MariaDB | PDO connection parsing and Worker Hyperdrive probe | PHP connection adapter exists; full PHP business-query portability is incomplete |

## Request/data flow

### Render-only

1. Browser uses the existing Storefront or the optional Next.js service.
2. Next.js same-origin /api.php route proxies cookies, Authorization and CSRF to HENDY_API_ORIGIN.
3. PHP continues to enforce Neon Auth/JWKS, session, role, CSRF and business rules.
4. PHP reads/writes the configured S3-compatible object provider.
5. Neon PostgreSQL remains the database source of truth.

### Cloudflare edge + Render origin

1. Browser calls a Cloudflare Worker or Pages route.
2. The Worker proxies /api.php requests to HENDY_API_ORIGIN.
3. Authentication headers, cookies, CSRF headers and HTTP methods are forwarded; the Worker does not bypass authorization.
4. The optional CACHE KV binding caches only anonymous GET action=products catalogue responses for at most 30 seconds. Authenticated, cookie-bearing, Admin, download and write requests are not cached.
5. Cloudflare WAF, DNS, Bot Management, Turnstile, Analytics and rate limiting are Cloudflare account settings; they are not silently enabled by deploying this Worker.

### Workers + database

- DATABASE_PROVIDER=postgres requires a HYPERDRIVE binding.
- DATABASE_PROVIDER=mysql requires a MYSQL_HYPERDRIVE binding.
- DATABASE_PROVIDER=d1 requires a DB D1 binding.
- DATABASE_PROVIDER=none is the safe default until a binding has been provisioned.
- The Worker adapters perform a connection probe (SELECT 1) only. They do not yet replace every PHP business query.
- D1 is a separate SQLite database. Creating it does not copy PostgreSQL tables or rows. A D1 schema/data migration must be separately authored, validated and reconciled before choosing D1 for application data.

## Storage providers

OBJECT_STORAGE_PROVIDER is selected independently for each runtime.

| Value | Endpoint / region | Adapter |
|---|---|---|
| neon | Existing AWS_ENDPOINT_URL_S3 / AWS_REGION / NEON_STORAGE_BUCKET | AWS SDK PHP |
| cloudfly | https://s3.cloudfly.vn / hn | AWS SigV4, path style |
| r2 | https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com / auto | AWS SigV4, path style |
| s3 | OBJECT_STORAGE_ENDPOINT / configured region | Generic S3 SDK |

When switching from Neon:
- Keep the legacy Neon credentials and bucket available for read fallback.
- New uploads go to the selected provider only.
- Existing objects are not copied or deleted automatically.
- Verify HeadBucket, PutObject, HeadObject, GetObject, presigned PUT CORS and a complete upload/download round trip before cutover.
- Compare object counts, object sizes and SHA-256 before retiring the legacy bucket.
- Never set public-read/public-write ACLs for app packages.

## Database support boundaries

- PostgreSQL is the production source of truth.
- PHP DATABASE_URL parser accepts PostgreSQL and MySQL/MariaDB URI formats, and Docker installs PDO PostgreSQL, MySQL and SQLite extensions.
- A parser/driver does not mean every PHP query is portable. Several PHP modules still use PostgreSQL syntax such as ON CONFLICT, RETURNING and PostgreSQL-specific expressions. The complete PHP application must not be switched to MySQL until dialect-specific migrations and integration tests cover those modules.
- SQLite is used by the smoke tests and local development. Render's ephemeral filesystem cannot be treated as a persistent database disk.
- D1 has a separate Worker adapter and schema lifecycle. It is not a drop-in PostgreSQL endpoint and does not use PDO.

## Secrets and automation

### GitHub Actions secrets

Set these through GitHub repository Settings → Secrets and variables → Actions. Secret values are never committed.

- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID
- CF_OBJECT_STORAGE_ACCESS_KEY_ID
- CF_OBJECT_STORAGE_SECRET_ACCESS_KEY
- Optional CF_OBJECT_STORAGE_SESSION_TOKEN
- Optional CF_PLATFORM_HEALTH_TOKEN
- Optional CF_HYPERDRIVE_CONNECTION_STRING (PostgreSQL)
- Optional CF_MYSQL_HYPERDRIVE_CONNECTION_STRING (MySQL)

For an existing Hyperdrive config, use repository variables CF_HYPERDRIVE_ID / CF_MYSQL_HYPERDRIVE_ID instead of creating a new config.

### GitHub Actions variables

- CF_CREATE_R2=true and CF_R2_BUCKET_NAME only when you explicitly intend to create a new bucket.
- CF_CREATE_D1=true and CF_D1_DATABASE_NAME only when you explicitly intend to create an empty D1 database.
- CF_DATABASE_PROVIDER=none|postgres|mysql|d1 only after the matching binding exists.
- CF_OBJECT_STORAGE_PROVIDER=neon|cloudfly|r2|s3 only after the selected provider can be probed.
- Optional region/location and Hyperdrive config names.

Run .github/workflows/deploy-platform.yml manually:
- provision: create or bind explicitly selected R2/D1/Hyperdrive resources, write Wrangler config in the workflow workspace and deploy the API Worker.
- worker: deploy the Worker.
- next: build and deploy the Next.js Worker.
- pages: deploy the compatibility Pages proxy.
- all: deploy all selected targets.

The workflow does not run on normal pushes. It never deletes resources or migrates database rows. If optional credentials are absent, it does not create corresponding secrets.

### Render environment

The existing PHP service's secrets stay in Render Environment. Do not overwrite all variables through a Blueprint sync. Set only the selected provider values after checking them. The optional Next.js service is defined in render.next.yaml with Auto Deploy disabled; it is not created automatically.

## Current limitations

- The Worker is an edge proxy/capability layer; PHP remains the source of business rules. It is not a complete Express/NestJS rewrite.
- MySQL is not yet fully supported by all PHP features.
- D1 schema/data migration has not been performed.
- KV cache is optional and only for anonymous public product listing.
- Queue, Durable Objects, Vectorize, Workers AI, Turnstile and WAF are not enabled by this source alone. They require a use case, bindings, account resources and a separate security configuration.
- Code signing requires an HSM/Key Vault signing adapter; signing keys must not be put in ordinary environment files.
- Cloudflare resources cannot be provisioned until the account token and bucket/database selection are configured in GitHub Actions.
- The production Neon DATABASE_URL must authenticate before either Render-origin or Cloudflare-proxy routes can be considered healthy.
