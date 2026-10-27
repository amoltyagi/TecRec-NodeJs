import { NextResponse } from 'next/server';
import { decodeModel } from '@/lib/ai/provider';
import {
  getProductByModel,
  incrementSearchCount,
  logSearch,
  maybePruneExpiredData,
  reserveAiUnit,
  reserveGlobalAiUnit,
  saveProduct,
} from '@/lib/db/neon';
import { getGlobalDailyLimit, getIpDailyLimit } from '@/lib/env';
import {
  getClientIp,
  hashIp,
  isAllowedOrigin,
  isJsonContentType,
  readJsonBody,
  sanitizeModelInput,
  secondsUntilUtcMidnight,
} from '@/lib/security';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** A 200-char model code fits comfortably; anything larger is abuse. */
const MAX_BODY_BYTES = 8 * 1024;

function jsonError(status: number, error: string, headers?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers });
}

export async function POST(request: Request) {
  try {
    if (!isJsonContentType(request)) {
      return jsonError(415, 'Content-Type must be application/json');
    }
    if (!isAllowedOrigin(request)) {
      return jsonError(403, 'Cross-origin requests are not allowed');
    }

    const body = await readJsonBody(request, MAX_BODY_BYTES);
    if (!body.ok) return jsonError(body.status, body.error);

    const payload = body.value as { model?: unknown } | null;
    const modelInput = sanitizeModelInput(payload?.model);
    if (!modelInput) return jsonError(400, 'A model code is required');

    maybePruneExpiredData();

    // Cache first. Reading a product we already paid for must never consume quota
    // (and must stay available after the daily limit is reached).
    const cached = await getProductByModel(modelInput);
    if (cached) {
      await incrementSearchCount(modelInput);
      return NextResponse.json({ ...cached.result, slug: cached.slug });
    }

    const ipHash = hashIp(getClientIp(request));
    const ipLimit = getIpDailyLimit();

    // Reserve before the paid call: failures and timeouts still count, otherwise
    // a failing decode becomes an unlimited free-retry channel.
    if (!(await reserveAiUnit(ipHash, ipLimit))) {
      return jsonError(
        429,
        `Daily limit reached (${ipLimit} AI decodes per UTC day). Try again after 00:00 UTC.`,
        { 'Retry-After': String(secondsUntilUtcMidnight()) },
      );
    }
    if (!(await reserveGlobalAiUnit(getGlobalDailyLimit()))) {
      console.error('Global daily AI budget exhausted');
      return jsonError(503, 'The decoder is at capacity right now. Please try again later.', {
        'Retry-After': String(secondsUntilUtcMidnight()),
      });
    }

    const decoded = await decodeModel(modelInput);
    if (decoded.error || !decoded.identity) {
      console.error('Decode failed:', decoded.error ?? 'payload contained no identity');
      return jsonError(502, 'Could not decode this model right now. Please try again later.');
    }

    let slug: string | undefined;
    try {
      const saved = await saveProduct(modelInput, decoded);
      slug = saved.slug;
      await logSearch(modelInput, saved.id, 'text', ipHash);
    } catch (error) {
      // The AI call already succeeded and was paid for: still return the result
      // rather than turning a storage hiccup into a failed decode.
      console.error('Failed to persist decoded product:', error);
    }

    return NextResponse.json({ ...decoded, slug });
  } catch (error) {
    console.error('Decode route failed:', error);
    return jsonError(500, 'Failed to decode model');
  }
}
