---
description: Deploy the Next.js application to Vercel
---

1. Ensure you have the [Vercel CLI](https://vercel.com/download) installed:
   ```bash
   npm install -g vercel
   ```
   (Or use `npx vercel@latest` without a global install.)

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Initialize the deployment and link the project (follow prompts):
   ```bash
   vercel
   ```

4. Provision a Neon Postgres database (via the Vercel Marketplace integration or
   [neon.tech](https://neon.tech)), then:
   - fresh database: run `neon-schema.sql` in the Neon SQL editor;
   - existing database: run `migrations/001_hardening.sql` (idempotent).
   Both create/upgrade `products`, `search_history` and `ai_quota`.

5. Add the required environment variables (Production, and Preview/Development
   as needed):

   ```bash
   vercel env add AI_API_KEY           # API key for the chat-completions provider
   vercel env add AI_API_URL           # full chat-completions endpoint URL
   vercel env add DATABASE_URL         # Neon pooled connection string
   vercel env add IP_HASH_SALT         # random salt for IP hashing (recommended)
   vercel env add NEXT_PUBLIC_SITE_URL # canonical production origin, e.g. https://example.com
   ```

   > **Required for production:** the build reads `NEXT_PUBLIC_SITE_URL` and
   > **fails loudly if it is unset on a Vercel production build**. This prevents
   > silently deploying `http://localhost:3000` canonical URLs to search engines.
   > Set it to the exact public origin before the first production deploy.

   Optional overrides (defaults live in `src/lib/env.ts`):

   ```bash
   vercel env add AI_DECODE_MODEL         # default: zai-org-glm-4.7
   vercel env add AI_SCAN_MODEL           # default: qwen3-vl-235b-a22b
   vercel env add AI_DECODE_FALLBACKS     # comma-separated fallback model chain
   vercel env add AI_SCAN_FALLBACKS       # comma-separated fallback model chain
   vercel env add AI_EXTRA_BODY_JSON      # JSON object merged into request bodies
   vercel env add AI_TIMEOUT_MS           # default: 25000
   vercel env add AI_DAILY_LIMIT_PER_IP   # default: 5 paid calls per IP per UTC day
   vercel env add AI_GLOBAL_DAILY_LIMIT   # default: 500 paid calls per UTC day
   vercel env add AMAZON_AFFILIATE_TAG    # optional tag appended to Amazon links
   vercel env add ADMIN_TOKEN             # enables DELETE /api/admin/product when set
   ```

6. Deploy to production:
   ```bash
   vercel --prod
   ```

7. Smoke-test after deploy: decode a known model via the UI, open a
   `/product/<slug>` page, and check `/sitemap.xml`, `/robots.txt` and
   `/manifest.webmanifest`.
