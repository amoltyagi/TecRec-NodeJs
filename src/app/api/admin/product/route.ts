import { NextResponse } from 'next/server';
import { deleteProduct } from '@/lib/db/neon';
import { getAdminToken } from '@/lib/env';
import {
  constantTimeEquals,
  isAllowedOrigin,
  isJsonContentType,
  readJsonBody,
  sanitizeModelInput,
} from '@/lib/security';

export const runtime = 'nodejs';
export const maxDuration = 15;
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4 * 1024;

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Remove a cached product (for moderation: flagged, poisoned or plainly wrong
 * entries would otherwise live in the cache forever, since cache hits never
 * re-decode).
 *
 * Disabled entirely unless ADMIN_TOKEN is configured, so a deployment that does
 * not need it exposes no surface at all.
 */
export async function DELETE(request: Request) {
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
    const deleted = await deleteProduct(model);
    return NextResponse.json({ deleted, model: model.toUpperCase() });
  } catch (error) {
    console.error('Admin delete failed:', error);
    return jsonError(500, 'Failed to delete product');
  }
}
