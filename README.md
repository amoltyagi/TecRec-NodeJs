# TecRec Universal

TecRec Universal is a tech-product decoder. You enter a product model code (or
scan a label with your camera) and the app returns a structured readout:
identity, key specs, release window, market price tier, and a set of
alternatives.

Decoded products are cached in Postgres, so repeat lookups are instant and free.
The same cache powers server-rendered SEO pages, a dynamic sitemap and
`robots.txt`.

- **Live app:** not deployed in this repository snapshot
- **License:** MIT (see [LICENSE](LICENSE))
- **Status:** mid-hardening; see [Known limitations](#known-limitations)

## Features

- **Text decode** — submit a model code, get structured JSON back.
- **Camera scan** — point the camera at a product label/price tag; the image is
  downscaled in the browser, validated server-side (base64 shape, magic bytes,
  ≤3 MB, JPEG/PNG/WebP), and a vision model extracts the model number before
  decoding it.
- **Persistent cache** — every successful decode is stored in Postgres; cached
  products are answered without calling the AI provider and cost no quota.
- **Paid-call quota** — `5` paid AI calls per hashed IP per UTC day (configurable)
  plus a global daily circuit breaker (`500` by default). Quota is reserved
  atomically *before* each paid call, so failed calls count too.
- **SEO product pages** — `/product/[slug]` is an ISR page (24h revalidate) with
  JSON-LD `Product` structured data, canonical URL and Open Graph metadata.
- **Dynamic sitemap + robots** — `/sitemap.xml` is a route handler (CDN-cached
  1h) listing the 1000 most-searched usable products; `/robots.txt` allows
  crawling, disallows `/api/` and references the sitemap.
- **Web app manifest** — `/manifest.webmanifest` for installability metadata;
  there is no service worker and no offline support.
- **Deep links** — `/?q=MODEL` pre-fills and auto-decodes, used by product pages
  to link alternatives back into the live decoder.
- **Server-built product links** — Amazon search links are generated from
  validated brand/model fields; the AI never supplies URLs. Optional affiliate
  tag via `AMAZON_AFFILIATE_TAG`.
- **Security hardening** — input/output validation, streaming request-size caps,
  JSON content-type and same-origin checks, image magic-byte checks, salted
  hashed IPs, constant-time admin token comparison, CSP and other security
  headers, generic client-facing errors.
- **Optional admin delete** — `DELETE /api/admin/product`, enabled only when
  `ADMIN_TOKEN` is configured.

## Screenshots

_Placeholders — replace with real captures when available._

| Screen | Notes |
|--------|-------|
| Home / decode | Desktop and mobile |
| Scan flow | Camera modal + extracted model |
| Result view | Identity, price meter, alternatives |
| SEO product page | `/product/[slug]` with structured data |

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Browser                                                             │
│  Home page (client component)          Camera modal (getUserMedia)  │
│   └─ POST /api/decode                    └─ POST /api/scan          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼─────────────────────────────────────┐
│ Next.js 16 App Router (Vercel)                                      │
│                                                                     │
│  Pages / routes                     API routes                       │
│   /              decoder UI         POST /api/decode                │
│   /product/[slug] SEO (ISR 24h)     POST /api/scan                  │
│   /sitemap.xml   route (CDN 1h)     DELETE /api/admin/product       │
│   /robots.txt                       (optional, ADMIN_TOKEN)          │
│   /manifest.webmanifest                                             │
│                                                                     │
│  Server libs                                                        │
│   src/lib/ai/provider.ts   chat-completions client, prompts,        │
│                            model chains, timeout, output validation │
│   src/lib/db/neon.ts       product CRUD, quota reserve, logs        │
│   src/lib/env.ts           validated env access (lazy)              │
│   src/lib/security.ts      sanitizer, client IP, IP hash, limits    │
│   src/lib/affiliate.ts     server-built Amazon search links         │
└───────────────┬──────────────────────────────────┬──────────────────┘
                │                                  │
                │ DATABASE_URL                     │ AI_API_URL
┌───────────────▼───────────────┐   ┌──────────────▼──────────────────┐
│ Neon serverless Postgres      │   │ Chat-completions AI provider    │
│  products (cache)             │   │  decode model (text, optional   │
│  ai_quota (paid-call budget)  │   │  provider feature such as       │
│  search_history (audit log)   │   │  live web search)               │
│                               │   │  scan model (image input)       │
└───────────────────────────────┘   └─────────────────────────────────┘
```

## Data flow

**Text decode — `/api/decode`**

```text
POST { model }
  → JSON content-type + same-origin checks
  → streaming body cap (8 KB max)
  → validate + sanitize model code
  → cache lookup (products fresh for 90 days)
      ├─ HIT  → bump search_count, return cached result   (no quota used)
      └─ MISS → atomic quota reserve (ai_quota, UTC day; per-IP, then global)
                  ├─ per-IP limit reached → 429 + Retry-After
                  ├─ global limit reached → 503 + Retry-After
                  └─ reserved (failures count too)
                     → AI provider decode
                     → normalize/validate decoded JSON
                     → upsert into products
                     → log successful decode in search_history
                     → return result
```

**Camera scan — `/api/scan`**

```text
POST { image }  (base64 JPEG/PNG/WebP)
  → JSON content-type + same-origin checks
  → streaming body cap (4 MB max)
  → validate image (base64 shape + magic bytes, ≤3 MB)
  → atomic quota reserve FIRST: the vision call is paid and the model code is
    unknown until the vision model runs; one scan = one quota unit
    ├─ per-IP limit → 429   └─ global limit → 503
  → vision model extracts the model number
  → sanitize the extracted string (untrusted model output)
  → cache lookup
      ├─ HIT  → return cached product (unit already consumed by the scan)
      └─ MISS → AI decode → validate → save → return
  → failure responses: { error[, model] } with NO `found` flag
```

**SEO**

```text
first decode of a product → row in products → /product/[slug] renders it
every day (ISR) → JSON-LD + canonical
products older than 90 days are still served but marked noindex
crawler → /sitemap.xml (dynamic route, CDN 1h, top 1000 by search_count)
        → /robots.txt
```

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, TypeScript 5, Tailwind CSS 4 |
| Motion / icons | Framer Motion 12, lucide-react |
| Database | Neon serverless Postgres (`@neondatabase/serverless`) |
| AI | Hosted chat-completions API over plain `fetch` (no SDK), text + vision models |
| Validation | Server-side normalization of untrusted AI/stored payloads (`src/lib/validation.ts`) |
| Tests | Vitest (`tests/`: slugs, security helpers, affiliate links, payload validation) |
| Lint / types | ESLint 9 (flat config), `tsc --noEmit` |
| Hosting | Vercel + Neon |

There is no auth system, no client SDK and no ORM.

## Getting started

Prerequisites: Node.js 20.9+ (CI uses Node 22), npm, and a Postgres database
(Neon or compatible).

```bash
git clone <repository-url>
cd tecrec
npm install

# 1. Configure environment
cp .env.example .env.local
#    then edit .env.local with real credentials

# 2. Create/upgrade the database schema (once per database)
#    Fresh database:  run neon-schema.sql in the Neon SQL editor
#    Existing DB:     run migrations/001_hardening.sql (idempotent)
#    or with psql:
#    psql "$DATABASE_URL" -f neon-schema.sql
#    psql "$DATABASE_URL" -f migrations/001_hardening.sql

# 3. Run
npm run dev
```

Open <http://localhost:3000>. The camera scanner requires HTTPS or localhost.

The production build does not require secrets: environment variables are read
lazily at request time, so `npm run build` works in CI with no `.env` file. The
one exception is `NEXT_PUBLIC_SITE_URL`: it is read at build time for
robots/sitemap/canonical URLs, and a Vercel production build fails loudly when
it is missing (see [Deployment](#deployment-vercel--neon)).

## Environment variables

Copy [.env.example](.env.example) to `.env.local`. All secrets are server-side
only; `NEXT_PUBLIC_SITE_URL` is the single public value.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `AI_API_KEY` | yes | — | Credential for the chat-completions endpoint (sent as `Authorization: Bearer …`). |
| `AI_API_URL` | yes | — | Full URL of the chat-completions endpoint. |
| `AI_DECODE_MODEL` | no | `zai-org-glm-4.7` | Primary text decode model. |
| `AI_SCAN_MODEL` | no | `qwen3-vl-235b-a22b` | Primary vision/scan model. |
| `AI_DECODE_FALLBACKS` | no | built-in chain | Comma-separated extra fallback models appended to the decode chain. |
| `AI_SCAN_FALLBACKS` | no | built-in chain | Comma-separated extra fallback models appended to the scan chain. |
| `AI_EXTRA_BODY_JSON` | no | — | JSON object merged into the primary model's request body (not the fallbacks); use it for provider-specific features such as live web search. Invalid JSON is ignored with a server log. |
| `AI_TIMEOUT_MS` | no | `25000` | Per-request timeout; clamped to 3000–60000. |
| `DATABASE_URL` | yes | — | Neon pooled Postgres connection string. |
| `IP_HASH_SALT` | recommended | static fallback | Salt for SHA-256 client-IP hashes; set a unique random value in production (the server logs a warning when it is missing in production). |
| `AI_DAILY_LIMIT_PER_IP` | no | `5` | Paid AI calls allowed per hashed IP per UTC day. |
| `AI_GLOBAL_DAILY_LIMIT` | no | `500` | Global paid AI calls per UTC day (circuit breaker; API returns 503 when exhausted). |
| `NEXT_PUBLIC_SITE_URL` | prod | `http://localhost:3000` (`VERCEL_URL` on previews) | Canonical origin for canonical tags, sitemap, robots and OG metadata. **Vercel production builds fail if unset.** |
| `AMAZON_AFFILIATE_TAG` | no | — | Appended as `tag=` to server-built Amazon search links. Empty = plain links. |
| `ADMIN_TOKEN` | no | — | When set, enables `DELETE /api/admin/product` (bearer token). When unset the admin route returns 404. |

On Vercel, `VERCEL_ENV` and `VERCEL_URL` are provided by the platform; they are
not something you set by hand.

## npm scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `next dev` | Development server at <http://localhost:3000>. |
| `npm run build` | `next build` | Production build (no secrets needed). |
| `npm run start` | `next start` | Serve the production build. |
| `npm run lint` | `eslint` | ESLint 9 flat config. |
| `npm run typecheck` | `tsc --noEmit` | TypeScript type check. |
| `npm test` | `vitest run` | Unit tests (CI mode). |
| `npm run test:watch` | `vitest` | Unit tests in watch mode. |

## Database

Fresh databases: run `neon-schema.sql`. Existing databases: run the idempotent
migration `migrations/001_hardening.sql`. Both are meant for the Neon SQL
editor (or `psql`).

- `products` — decoded product cache: model number (unique), slug (unique),
  brand, category, JSONB specs/price/alternatives, insight, `year`, release
  window, Amazon link field, `search_count` (indexed DESC), timestamps.
- `search_history` — append-only audit/analytics log: query, optional product
  FK, source (`text` | `camera`), hashed IP, `outcome` (`ok` | `error`),
  timestamp.
- `ai_quota` — paid-call budget: per-IP rows keyed by `(ip_hash, window_start)`
  with `used`, reserved atomically before each paid call. A reserved row at
  `ip_hash = '__global__'` enforces the global daily budget. Windows are UTC
  days. Quota is **not** derived from `search_history`.
- **Retention:** elapsed quota rows (2 days) and old `search_history` rows
  (30 days) are pruned opportunistically on a small fraction of requests; there
  is no external cron.
- The migration backfills `products.year` from `release_window`, creates the
  quota table, adds `search_history.outcome`, adds the sitemap index, and drops
  indexes duplicated by the `UNIQUE` constraints.
- The sitemap only includes products with usable content (`brand` known,
  non-thin insight, at least one spec), ordered by `search_count`.

## API reference

All responses are JSON. Errors use `{ "error": "message" }` with a generic
message; upstream/AI details are logged server-side only.

### `POST /api/decode`

Decode a model code (cache first, AI on miss).

Request body:

```json
{ "model": "WH-1000XM5" }
```

Success `200`:

```json
{
  "identity": {
    "brand": "Sony",
    "category": "Wireless Headphones",
    "keySpecs": ["Industry-leading ANC", "30h battery", "LDAC"],
    "year": "2022",
    "releaseWindow": "May 2022",
    "amazonLink": "https://www.amazon.com/s?k=Sony+WH-1000XM5",
    "insight": "Flagship noise-cancelling headphones.",
    "priceIndicator": { "level": "Premium", "percent": 65, "estimatedPrice": "$399" }
  },
  "alternatives": [
    { "brand": "Bose", "model": "QuietComfort Ultra", "why": "Closest ANC competitor" }
  ],
  "slug": "sony-wh-1000xm5"
}
```

`slug` is the canonical SEO page path (`/product/<slug>`).

`amazonLink` is built server-side from the validated brand and model (plus the
optional affiliate tag). The AI does not choose the URL.

Errors:

| Status | Meaning |
|--------|---------|
| `400` | Missing/invalid model code or unparsable JSON body |
| `403` | Cross-origin browser request rejected |
| `413` | Body larger than 8 KB |
| `415` | `Content-Type` is not `application/json` |
| `429` | Per-IP daily paid-call limit exhausted (`Retry-After` set) |
| `502` | AI provider could not produce a valid decode |
| `503` | Global daily paid-call budget exhausted (`Retry-After` set) |
| `500` | Unexpected server error |

### `POST /api/scan`

Extract a model number from a product-label image, then return its decoded
record. The client renders the response directly; it must not issue a second
decode.

Request body:

```json
{ "image": "<base64 JPEG/PNG/WebP, no data: prefix, ≤3 MB>" }
```

Success `200`:

```json
{
  "found": true,
  "model": "WH-1000XM5",
  "identity": { "...": "same shape as /api/decode" },
  "alternatives": [],
  "slug": "sony-wh-1000xm5"
}
```

Errors:

| Status | Meaning |
|--------|---------|
| `400` | Missing/invalid image data or unparsable JSON body |
| `403` | Cross-origin browser request rejected |
| `413` | Body larger than 4 MB or image larger than 3 MB |
| `415` | Not `application/json`, or image is not JPEG/PNG/WebP |
| `422` | No model number could be identified in the image |
| `429` | Per-IP daily paid-call limit exhausted (`Retry-After` set) |
| `502` | AI provider failure |
| `503` | Global daily paid-call budget exhausted (`Retry-After` set) |
| `500` | Unexpected server error |

Failure responses contain `error` (and sometimes `model`) but never `found`.

### `DELETE /api/admin/product`

Delete a cached product. Disabled entirely (404) unless `ADMIN_TOKEN` is set.

Request:

```http
DELETE /api/admin/product
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{ "model": "WH-1000XM5" }
```

Responses:

| Status | Body / meaning |
|--------|----------------|
| `200` | `{ "deleted": 1, "model": "WH-1000XM5" }`; `deleted` is `0` when the product did not exist |
| `400` | Missing/invalid `model` or unparsable JSON body |
| `401` | Missing or wrong bearer token (constant-time comparison) |
| `403` | Cross-origin browser request rejected |
| `404` | Admin surface disabled (`ADMIN_TOKEN` unset) |
| `413` | Body larger than 4 KB |
| `415` | `Content-Type` is not `application/json` |
| `500` | Unexpected server error (generic message) |

### Pages and SEO routes

| Route | Description |
|-------|-------------|
| `GET /` | Decoder UI; accepts `?q=MODEL` for deep-linked auto-decode |
| `GET /product/[slug]` | Server-rendered product page (ISR, 24h), JSON-LD, canonical; `noindex` when cache is older than 90 days |
| `GET /sitemap.xml` | Dynamic route handler, CDN-cached for 1h (`s-maxage=3600`): home + up to 1000 usable product URLs ordered by `search_count`; degrades to home-only if the DB is unreachable |
| `GET /robots.txt` | Allow all crawlers, disallow `/api/`, reference the sitemap |
| `GET /manifest.webmanifest` | Web app manifest (installability metadata only; no service worker/offline) |

## Deployment (Vercel + Neon)

1. Create a Neon project and copy the **pooled** connection string.
2. Create the schema: run `neon-schema.sql` on a fresh database, or
   `migrations/001_hardening.sql` on an existing one.
3. Import the repository into Vercel (framework preset: Next.js; Node 22).
4. **Set `NEXT_PUBLIC_SITE_URL` before deploying.** It is read during the
   build (robots/sitemap/canonical metadata) and the app **fails the build
   loudly if it is missing on Vercel production**, rather than silently
   shipping `http://localhost:3000` URLs to search engines. Set it to the exact
   public origin (for example `https://tecrec.example.com`).
5. Set the remaining variables from the table above. At minimum:
   `AI_API_KEY`, `AI_API_URL`, `DATABASE_URL`, `IP_HASH_SALT`; optionally
   `AI_*` overrides, quota limits, `AMAZON_AFFILIATE_TAG`, `ADMIN_TOKEN`.
6. Deploy (`vercel --prod`, or merge to `main` if the repo is connected).
7. Smoke-test: decode a product, open its `/product/[slug]` page, check
   `/sitemap.xml`, `/robots.txt` and `/manifest.webmanifest`.

The GitHub Actions workflow in [.github/workflows/ci.yml](.github/workflows/ci.yml)
runs lint, typecheck, tests and build on every push and pull request with no
secrets configured (CI builds are not Vercel production builds, so the site URL
check does not apply there).

## Known limitations

- **AI accuracy** — specs, release windows and prices are model-generated from
  public web sources and can be outdated or wrong. Pricing assumes the US
  market; the UI tells users to verify before buying.
- **Quota is a UTC-day budget** — `5` paid calls per IP per UTC day and a
  global `500` cap. The global cap is a circuit breaker: a busy day can
  return `503` for everyone until 00:00 UTC. Reserved calls count even when the
  AI call later fails.
- **Reserve order** — the per-IP unit is reserved before the global check: when
  the global budget is exhausted the request is rejected with 503 but the IP's
  unit stays consumed.
- **IP-based limiting** — bypassable via IP rotation; off-Vercel the client IP
  header is client-controlled. IPv6 quotas are keyed on the /64 prefix.
- **Stale cache** — products are refreshed after 90 days on decode; SEO pages
  keep serving the last known record (with `noindex`) if the cache is stale.
  There is no background refresh job.
- **Single AI endpoint** — one provider URL; fallbacks only switch models, not
  providers. There is no provider-side status/health monitoring.
- **Admin API** — a single static bearer token (or disabled), no user accounts,
  no audit log.
- **CSP** — `script-src` allows `'unsafe-inline'` because Next.js injects inline
  bootstrap scripts; nonce-based CSP is future work.
- **No offline support** — a web app manifest exists, but there is no service
  worker, so installability/offline caching from the original spec is not
  implemented.
- **No E2E tests** — unit tests only; camera behaviour and AI responses are
  mocked or untested.
- **Sitemap cap** — at most 1000 product URLs, cached at the CDN for 1h.

## Project structure

```text
.
├── .github/workflows/ci.yml   # lint + typecheck + test + build
├── docs/archive/spec-v2.md    # original product spec (superseded)
├── migrations/                # idempotent SQL migrations for existing DBs
├── neon-schema.sql            # full database schema for fresh DBs
├── src/
    ├── app/
    │   ├── api/decode/route.ts
    │   ├── api/scan/route.ts
    │   ├── api/admin/product/route.ts
    │   ├── product/[slug]/page.tsx
    │   ├── sitemap.xml/route.ts
    │   ├── robots.ts
    │   ├── manifest.ts
    │   ├── layout.tsx
    │   └── page.tsx
    ├── components/            # results, scanner, UI
    ├── context/               # toast provider
    ├── lib/
    │   ├── ai/provider.ts     # AI provider client + prompts
    │   ├── db/neon.ts         # Postgres access + quota
    │   ├── env.ts             # environment access
    │   ├── security.ts        # input/IP/body-size guards
    │   ├── validation.ts      # untrusted payload normalization
    │   ├── affiliate.ts       # server-built Amazon links
    │   └── slug.ts            # URL slugs
    └── types.ts               # shared types
├── tests/                     # Vitest unit tests
└── vitest.config.ts
```

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Amol Tyagi.
