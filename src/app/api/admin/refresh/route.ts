import { NextResponse } from 'next/server';
import { decodeProduct } from '@/lib/decode';
import { datasheetCanonicalModel } from '@/lib/datasheets';
import { saveProduct } from '@/lib/db/neon';
import { getAdminToken } from '@/lib/env';
import {
  constantTimeEquals,
  isAllowedOrigin,
  isJsonContentType,
  readJsonBody,
  sanitizeModelInput,
} from '@/lib/security';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4 * 1024;

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Re-derive a cached product from source, in one step.
 *
 * Why this exists: a decode is cached for the whole TTL window, so a wrong or
 * outdated entry keeps being served long after the prompt, the datasheet or the
 * model behind it changed. Deleting the row and waiting for the next visitor
 * works, but it costs that visitor a quota unit and leaves a gap; this runs the
 * same decode-and-upsert path directly.
 *
 * No quota is consumed: only an operator holding `ADMIN_TOKEN` can call it, and
 * the per-IP budget exists to bound anonymous spend, not operator maintenance.
 * Upsert (not delete-then-insert) keeps the row's slug and search_count stable.
 */
export async function POST(request: Request) {
  const adminToken = getAdminToken();
  if (!adminToken) return jsonError(404, 'Not found');

  if (!isAllowedOrigin(request)) return jsonError(403, 'Cross-origin requests are not allowed');

  const authorization = request.headers.get('authorization') ?? '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!provided || !constantTimeEquals(provided, adminToken)) {
    return jsonError(401, 'Unauthorized');
  }

  if (!isJsonContentType(request)) return jsonError(415, 'Content-Type must be application/json');

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonError(body.status, body.error);

  const payload = body.value as { model?: unknown } | null;
  const model = sanitizeModelInput(payload?.model);
  if (!model) return jsonError(400, 'A model code is required');

  try {
    const decoded = await decodeProduct(model);
    if (decoded.error || !decoded.identity) {
      console.error('Admin refresh failed:', decoded.error ?? 'payload contained no identity');
      return jsonError(502, 'Could not decode this model right now.');
    }

    // Save under the canonical name when a datasheet covers the product, so the
    // refresh updates the row the decoder actually serves instead of creating a
    // second one under the caller's spelling.
    const cacheKey = datasheetCanonicalModel(model) ?? model;
    const saved = await saveProduct(cacheKey, decoded);
    return NextResponse.json({
      refreshed: true,
      model: cacheKey.toUpperCase(),
      slug: saved.slug,
      verified: Boolean(decoded.identity.verified),
      identity: decoded.identity,
      alternatives: decoded.alternatives ?? [],
    });
  } catch (error) {
    console.error('Admin refresh failed:', error);
    return jsonError(500, 'Failed to refresh product');
  }
}
