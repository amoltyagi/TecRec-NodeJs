# TecRec Universal — Agent & Contributor Guide

> Tech-product decoder: enter a model code (or scan a product label) and get back
> identity, specs, release window, US market price tier, and alternatives — powered
> by a hosted chat-completions AI provider, persisted in Neon Postgres.
>
> **Sources of truth**
> - `README.md` — user-facing setup, API reference, deployment.
> - `AGENTS.md` (this file) — working guide, architecture, conventions, risks.
> - `docs/archive/spec-v2.md` — the original v2 product spec, **superseded and kept
>   for historical context only**. Do not treat it as current; it describes a
>   different stack (older framework version, different database/cache/AI plan).

## Non-negotiables

- **No AI vendor branding.** The AI layer is always described generically as
  "the AI provider" / "the chat-completions API". Do not name vendors, their
  SDKs, or their URLs in code, comments, docs, UI copy, fixtures, or log strings.
- **No secrets in the repo.** `AI_API_KEY`, `DATABASE_URL`, `ADMIN_TOKEN` etc.
  live only in `.env.local` (gitignored) or the hosting provider's env settings.
  `.env.example` holds placeholders only.
- **The AI endpoint and credentials are env-driven only** — read them via
  `src/lib/env.ts`; never hardcode URLs or keys.
- **Do not commit build output** (`.next/`, `tsconfig.tsbuildinfo`) or
  `node_modules/`.
- Keep user-visible errors generic; log details server-side only.

## Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript 5** (strict)
- **Tailwind CSS 4** via `@import "tailwindcss"` — theme lives in `globals.css`
  (`@theme inline`), there is no `tailwind.config.ts`
- **Framer Motion 12** (spring physics), **lucide-react** icons
- **Neon** serverless Postgres via `@neondatabase/serverless` — no ORM
- **AI:** hosted chat-completions endpoint called with plain `fetch` (no SDK),
  text decode model + vision scan model, model fallback chains
- **Tests:** Vitest; **lint:** ESLint 9 flat config; **types:** `tsc --noEmit`
  (Node engine: `>=20.9.0`; CI uses Node 22)

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (<http://localhost:3000>) |
| `npm run build` | Production build — must succeed with **no secrets set** |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` |
| `npm run test:watch` | Vitest watch mode |

Do not run `npm install` unless dependency changes are intended; CI uses
`npm ci`. Do not run `git commit`/`git push` unless explicitly asked.

## Environment variables

Read lazily through `src/lib/env.ts`, so builds need no secrets. `.env.local`
for local development; `.env.example` is the documented contract.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `AI_API_KEY` | yes | — | Bearer credential for the chat-completions endpoint |
| `AI_API_URL` | yes | — | Full chat-completions endpoint URL |
| `AI_DECODE_MODEL` | no | `zai-org-glm-4.7` | Primary decode model |
| `AI_SCAN_MODEL` | no | `qwen3-vl-235b-a22b` | Primary vision/scan model |
| `AI_DECODE_FALLBACKS` | no | built-in | Extra comma-separated decode fallbacks (appended after defaults) |
| `AI_SCAN_FALLBACKS` | no | built-in | Extra comma-separated scan fallbacks (appended after defaults) |
| `AI_EXTRA_BODY_JSON` | no | — | JSON object merged into the primary model's request body (provider-specific features, e.g. live web search). Invalid JSON is ignored + logged |
| `AI_TIMEOUT_MS` | no | `25000` | Request timeout, clamped to 3000–60000 |
| `DATABASE_URL` | yes | — | Neon pooled Postgres connection string |
| `IP_HASH_SALT` | recommended | static fallback | Salt for SHA-256 IP hashes |
| `AI_DAILY_LIMIT_PER_IP` | no | `5` | Paid AI calls allowed per hashed IP per UTC day |
| `AI_GLOBAL_DAILY_LIMIT` | no | `500` | Global paid AI calls per UTC day (circuit breaker → 503) |
| `NEXT_PUBLIC_SITE_URL` | prod | localhost / `VERCEL_URL` | Canonical origin for canonical tags, sitemap, robots, OG. **Vercel production builds fail if unset.** |
| `AMAZON_AFFILIATE_TAG` | no | — | Appended as `tag=` to server-built Amazon search links |
| `ADMIN_TOKEN` | no | — | Enables `DELETE /api/admin/product`; unset ⇒ route returns 404 |

`VERCEL_ENV` / `VERCEL_URL` are supplied by the platform.

## Architecture and data flow

```
Client (home decoder / camera modal)
  ├── POST /api/decode   { model }
  └── POST /api/scan     { image: base64 }

/api/decode (final order — do not reorder):
  JSON content-type + same-origin checks
  → streaming body cap (8 KB)
  → validate + sanitize model code
  → cache lookup (products fresh for 90 days)
      ├─ HIT  → increment search_count, return cached result (NO quota used)
      └─ MISS → atomic quota reserve in ai_quota (UTC-day window)
                 ├─ per-IP limit exhausted → 429 + Retry-After
                 ├─ global budget exhausted → 503 + Retry-After
                 │  (the per-IP unit already reserved stays consumed)
                 └─ reserved (reserved calls count even if the AI call fails)
                    → AI decode via chat-completions API
                    → normalize/validate decoded payload
                    → upsert products row
                    → log successful decode in search_history
                    → return result

/api/scan (final order):
  JSON content-type + same-origin checks
  → streaming body cap (4 MB)
  → validate image (base64 shape + magic bytes JPEG/PNG/WebP, ≤3 MB)
  → atomic quota reserve FIRST (vision call is paid; model code unknown until
    it runs; 1 scan = 1 quota unit covering vision + decode)
      ├─ per-IP limit → 429 + Retry-After
      └─ global budget → 503 + Retry-After
  → vision model extracts model number
  → sanitize extracted string (untrusted model output)
  → cache lookup
      ├─ HIT  → return cached product (unit already consumed by the scan)
      └─ MISS → AI decode → validate → save → return
  → failure responses: { error[, model] } with NO `found` flag

SEO:
  /product/[slug] — ISR (24h revalidate), server-rendered from the products
    cache, JSON-LD Product schema (deliberately no `offers`: the price is an AI
    estimate, not a merchant offer), canonical/OG.
    Cache older than 90 days is still served but emitted with `noindex`.
  /sitemap.xml — route handler (dynamic, CDN-cached 1h), top 1000 usable
    products by search_count; degrades to home-only if the DB is unreachable.
  /robots.txt — allow all, disallow /api/, reference sitemap.
  /manifest.webmanifest (from src/app/manifest.ts) — manifest only; no service
    worker, no offline support.
  Alternatives on product pages link to /?q=BRAND+MODEL, which auto-decodes on
  the home page.
```

**Quota semantics**

- Budget is stored in `ai_quota (ip_hash, window_start, used)`; window is a
  **UTC day** and resets at **00:00 UTC**. Rows are pruned after 2 days.
- Per-IP limit: `AI_DAILY_LIMIT_PER_IP` (default 5).
- Global limit: `AI_GLOBAL_DAILY_LIMIT` (default 500), enforced by a reserved
  `ip_hash = '__global__'` row. Global exhaustion returns **503**.
- Quota is **reserved atomically before every paid call** (single UPSERT with a
  `used < limit` guard), so failed attempts count and concurrent requests cannot
  overshoot.
- Order matters: per-IP reserve first, then global. If the global check fails,
  the per-IP unit stays consumed (documented risk).
- Both 429 and 503 include a `Retry-After` header computed to 00:00 UTC.
- One scan consumes one unit (vision + optional decode).
- Cache hits are never counted.
- Quota is **not** derived from `search_history` anymore; that table is now an
  audit/analytics log with an `outcome` column (currently `ok` on success).
- Client IP: `getClientIp` only trusts `x-vercel-forwarded-for` when
  `VERCEL=1`, then falls back to `x-forwarded-for` / `x-real-ip`; only valid IP
  strings are accepted and IPv6 addresses are reduced to their `/64` prefix
  before hashing (client-controlled headers off-Vercel are an accepted risk).
- `/api/scan` must reserve quota before the vision call; `/api/decode` must
  check the cache before reserving so cache hits stay free.

**Cache semantics**

- `products` rows are considered fresh for **90 days** for decode lookups
  (`getProductByModel` filters on `updated_at`); stale rows are re-decoded and
  upserted.
- SEO pages keep serving the last known row after 90 days but mark it
  `noindex`; there is no background refresh job.
- `saveProduct` is an atomic `INSERT … ON CONFLICT (model_number) DO UPDATE`,
  except that the slug is **not** updated on conflict so SEO URLs stay stable.
  A slug collision with a different model number retries with a short hash
  suffix.
- Slugs are generated by `src/lib/slug.ts` (URL-safe, diacritic-stripped) and
  are unique in the DB.
- The sitemap includes only usable rows (`brand <> 'Unknown'`, non-thin
  insight, at least one key spec), ordered by `search_count DESC, updated_at DESC`.
- Outbound Amazon links are built **server-side** from validated brand/model
  (`src/lib/affiliate.ts`) with an optional `AMAZON_AFFILIATE_TAG`. The AI never
  supplies URLs; legacy stored URLs are re-validated (`normalizeAmazonLink`)
  and only `https:` Amazon storefront hosts are accepted.

## AI provider layer

`src/lib/ai/provider.ts` is the only module that talks to the AI provider:

- Plain `fetch` POST to `AI_API_URL` with `Authorization: Bearer AI_API_KEY`.
- Text decode: system prompt + model code wrapped in `<model_code>` tags (the
  prompt tells the model to treat the code as data, not instructions); requests
  JSON output (`response_format: json_object`). The parsed payload is
  normalized/validated (`src/lib/validation.ts`); invalid output falls through to
  the next model.
- Vision scan: base64 image (`data:<detected mime>;base64,…`) plus a text
  instruction; returns one of three outcomes — `ok` (model string), `none`
  (nothing legible), `error` (provider failure) — which the route maps to
  200/422/502.
- Model chains: primary (`AI_DECODE_MODEL` / `AI_SCAN_MODEL`), built-in
  fallbacks, then any comma-separated `AI_*_FALLBACKS`; duplicates removed.
  Fallback only switches models, not providers.
- `AI_EXTRA_BODY_JSON` is merged into the request body for provider-specific
  features (for example enabling live web search), and only for the **primary**
  model in each chain to avoid multiplying that cost.
- Requests use `AbortSignal.timeout(AI_TIMEOUT_MS)`, `cache: 'no-store'` and a
  bounded `max_tokens`.
- All failures throw/log server-side; routes translate them to generic 502s.

## Database (`src/lib/db/neon.ts` + `neon-schema.sql`)

- **Fresh database:** run `neon-schema.sql` in the Neon SQL editor.
- **Existing database:** run the idempotent `migrations/001_hardening.sql`
  (adds `products.year` + backfill, the `products.search_count DESC` index,
  `search_history.outcome`, the `ai_quota` table, and drops indexes duplicated
  by the UNIQUE constraints).
- `products` — one row per decoded model: `model_number` (unique), `slug`
  (unique), brand, category, `key_specs` JSONB, insight, `price_indicator`
  JSONB, `year`, release window, Amazon link field, `alternatives` JSONB,
  `search_count`, timestamps.
- `search_history` — append-only audit log: query, optional product FK, source
  `text`/`camera`, hashed IP, `outcome`, timestamp. **Not used for quota.**
- `ai_quota` — paid-call reserve: `(ip_hash, window_start)` keyed rows with
  `used`; a `__global__` row tracks the global budget. Reserved atomically
  before each paid call; resets per UTC day.
- Queries are parameterized via the Neon template tag; never string-concatenate
  SQL.

## Security

- `src/lib/security.ts`
  - `sanitizeModelInput` — normalizes through `validation.cleanText` (200-char
    cap, control/zero-width chars stripped); applied to typed queries and to
    vision-model output.
  - `getClientIp` — trusts `x-vercel-forwarded-for` only when `VERCEL=1`, then
    `x-forwarded-for` / `x-real-ip`; validates the IP and reduces IPv6 to its
    `/64` prefix (`normalizeIpForQuota`).
  - `hashIp` — SHA-256 + `IP_HASH_SALT` (fixed fallback salt + production
    warning when unset).
  - `constantTimeEquals` — timing-safe admin token comparison.
  - `isJsonContentType` (415) and `isAllowedOrigin` (403): JSON-only API and
    same-origin browser requests (Host / `NEXT_PUBLIC_SITE_URL` allowlist).
  - `readJsonBody` — streaming byte cap independent of `Content-Length`
    (8 KB decode / 4 MB scan / 4 KB admin), 400 on unreadable/invalid JSON.
  - `secondsUntilUtcMidnight` — `Retry-After` value for 429/503.
- `src/lib/validation.ts`
  - Normalizes untrusted decode payloads (AI output and JSONB rows read back
    from Postgres): length caps, control/zero-width/bidi character stripping,
    price-meter clamping, alternative/URL validation. Returns `null` for
    unusable payloads instead of persisting junk.
  - Image detection: base64 shape, magic bytes (`JPEG`/`PNG`/`WEBP`). The scan
    route caps the decoded image at 3 MB and the request body at 4 MB.
  - Amazon link validation restricts to `https:` Amazon storefront hosts.
- Admin route: `ADMIN_TOKEN` unset ⇒ 404 (feature off, no information leak);
  missing/wrong `Authorization: Bearer` ⇒ 401; invalid/missing body ⇒ 400;
  success ⇒ `{ deleted: 0|1, model }`.
- Generic client errors; upstream/AI details stay in server logs.
- Security headers in `next.config.ts`: CSP (`default-src 'self'`,
  `script-src 'self' 'unsafe-inline'` — inline bootstrap is required by Next
  until a nonce-based CSP exists; `object-src 'none'`, `frame-src 'none'`,
  `frame-ancestors 'none'`, `worker-src 'self'`, `manifest-src 'self'`),
  `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy:
  same-origin`, `X-DNS-Prefetch-Control: off`, HSTS (prod),
  `Permissions-Policy` with `camera=(self)` for the scanner, and
  `poweredByHeader: false`.

## Key files

| Path | Responsibility |
|------|----------------|
| `src/app/page.tsx` | Single-page UI: home → analyzing → result states (`/?q=` deep link) |
| `src/app/product/[slug]/page.tsx` | ISR SEO page per cached product + JSON-LD |
| `src/app/sitemap.xml/route.ts` | Dynamic sitemap route handler, CDN-cached 1h |
| `src/app/robots.ts` | Crawler directives (allow all, disallow `/api/`) referencing the sitemap |
| `src/app/manifest.ts` | Web app manifest served at `/manifest.webmanifest` (no offline support) |
| `src/app/layout.tsx` | Root layout, metadata, viewport config |
| `src/app/api/decode/route.ts` | Text decode: validate → cache → quota → AI → save |
| `src/app/api/scan/route.ts` | Scan: validate image → quota → vision → cache/decode → save |
| `src/app/api/admin/product/route.ts` | Bearer-token-protected product delete |
| `src/lib/ai/provider.ts` | AI provider client, prompts, model fallback chains |
| `src/lib/db/neon.ts` | Product CRUD, quota reserve/count, search logging |
| `src/lib/env.ts` | Central environment access (lazy, validated) |
| `src/lib/security.ts` | Input sanitizer, client-IP extraction, IP hashing, body limits |
| `src/lib/validation.ts` | Untrusted payload normalization, image sniffing, link validation |
| `src/lib/affiliate.ts` | Server-built Amazon search links (+ optional affiliate tag) |
| `src/lib/slug.ts` | URL-safe product slugs |
| `src/types.ts` | Shared TS types (`DecodeResult`, `TechIdentity`, …) |
| `src/components/scanner/CameraView.tsx` | Camera modal (getUserMedia, client-side downscale) |
| `src/components/results/*` | ProductIdentity, PriceMeter, AlternativeList |
| `src/components/ui/Toast.tsx` | Toast system + container |
| `src/context/ToastContext.tsx` | Toast provider/context |
| `tests/*.test.ts` | Vitest unit tests (slug, security, affiliate, validation) |
| `neon-schema.sql` | Full schema for fresh databases |
| `migrations/001_hardening.sql` | Idempotent upgrade for existing databases |

## Conventions

- **Font:** Plus Jakarta Sans (`--font-sans`, loaded with `next/font`).
- **Colors:** Emerald `#10b981`, aurora gradient (`#0f172a` → `#1e3a5f`).
- **Glassmorphism:** `.liquid-glass` + `.specular-highlight`.
- **Animations:** spring `{ type: "spring", stiffness: 300, damping: 30, mass: 1 }`;
  respect `prefers-reduced-motion`.
- **Safe areas:** `.pt-safe` / `.pb-safe` / `.px-safe` / `.pl-safe` / `.pr-safe`
  wrap `env(safe-area-inset-*)` — use on full-screen mobile surfaces.
- **Tailwind 4:** configure theme in `globals.css` via `@theme inline`, not a
  config file.
- **Types:** strict TypeScript; no `any` in new code.
- **Naming:** no AI vendor names anywhere (see Non-negotiables).

## Deviations from the original spec

The archived spec (`docs/archive/spec-v2.md`) is historical. Current code
deliberately differs:

| Original spec | Current implementation |
|---------------|------------------------|
| Next.js 15 | Next.js 16 |
| Supabase (Postgres + Auth + Realtime) | Neon serverless Postgres, no auth/realtime |
| Vercel KV cache, 7-day TTL | `products` table cache, 90-day freshness |
| A specific AI vendor with search grounding | Provider-agnostic chat-completions endpoint; provider features (e.g. live search) opt-in via `AI_EXTRA_BODY_JSON`; model fallback chains |
| 5 free decodes/day via KV | Atomic DB quota: 5 paid calls per IP per UTC day + 500 global/day; failed calls count; scans cost one unit |
| `/api/product` CRUD routes | No public product CRUD; only an optional admin DELETE |
| No auth; future third-party sign-in | Still no auth/user accounts |
| PWA: installable + offline | Manifest only; no service worker, no offline support |
| Capacitor native shells (Phase 2) | Not started; web-only |
| Analytics dashboard | Not implemented (`search_count` only; `search_history` audit log) |
| Amazon affiliate tag | Supported optionally (`AMAZON_AFFILIATE_TAG`); links built server-side |
| Spec named a specific AI vendor | All AI references are generic; vendor names redacted from the archived copy |
| — (not in spec) | SEO product pages, dynamic sitemap, robots, JSON-LD added |

## Accepted risks (documented, not fixed)

- **Global circuit breaker can block everyone:** the `500`/day global cap is
  shared; a busy day returns 503 for all IPs until 00:00 UTC. Deliberate cost
  protection.
- **Reserved calls burn budget:** a paid call that later fails/crashes still
  consumes the reserved unit (deliberate anti-abuse trade-off). The per-IP unit
  is also consumed when the subsequent global check returns 503.
- **IP-based limiting:** inherently bypassable via IP rotation; off-Vercel, the
  client IP headers are client-controlled (headers are only trusted via the
  platform when `VERCEL=1`).
- **Single AI provider endpoint:** no health monitoring, no provider failover
  (only model fallbacks within the same endpoint).
- **CSP `unsafe-inline` scripts:** required by Next.js inline bootstrap until a
  nonce-based CSP is implemented.
- **Admin protection:** one static bearer token, no rotation, no audit trail;
  endpoint is off (404) when unset.
- **AI data quality:** specs/prices/release windows may be wrong or fabricated;
  no human review. Pricing is US-market only.
- **Cache staleness:** no background refresh; SEO pages may serve old data
  (marked `noindex` after 90 days). Products from failed decodes are not
  cached.
- **Scan accuracy:** model extraction from label images can misfire; sanitized
  but not verified.
- **Dependency health:** not continuously audited; do not assume `npm audit`
  is clean — check before releases.
- **No E2E tests:** coverage is unit-level; camera/vision paths are mocked or
  untested.

## Repo hygiene & CI

- `.github/workflows/ci.yml` runs on push/PR with Node 22:
  `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.
- `.env.example` is committed; every other `.env*` file is gitignored.
- `_legacy/` (dead pre-rewrite code) and the unused create-next-app SVGs have
  been removed; `.eslintignore` is gone (ESLint 9 flat config ignores are
  configured in `eslint.config.mjs`).
- `docs/archive/spec-v2.md` is superseded; do not cite it as current.
- License: MIT (see `LICENSE`).
