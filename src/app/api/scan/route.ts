import { NextResponse } from 'next/server';
import { decodeModel, scanImage } from '@/lib/ai/provider';
import {
  getProductByModel,
  logSearch,
  maybePruneExpiredData,
  reserveAiUnit,
  reserveGlobalAiUnit,
  saveProduct,
} from '@/lib/db/neon';
import { getGlobalDailyLimit, getIpDailyLimit } from '@/lib/env';
import {
  base64SizeBytes,
  cleanText,
  detectImageMime,
  isBase64String,
  normalizeModelCode,
} from '@/lib/validation';
import {
  getClientIp,
  hashIp,
  isAllowedOrigin,
  isJsonContentType,
  readJsonBody,
  secondsUntilUtcMidnight,
} from '@/lib/security';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 3 MB of image -> ~4 MB of base64, staying under the hosting request cap. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

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

    const payload = body.value as { image?: unknown } | null;
    const image = payload?.image;
    if (typeof image !== 'string' || image.length === 0) {
      return jsonError(400, 'An image is required');
    }
    if (!isBase64String(image)) {
      return jsonError(400, 'Invalid image encoding');
    }
    if (base64SizeBytes(image) > MAX_IMAGE_BYTES) {
      return jsonError(413, `Image is too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
    }

    const mimeType = detectImageMime(image);
    if (!mimeType) {
      return jsonError(415, 'Unsupported image format (JPEG, PNG or WebP required)');
    }

    maybePruneExpiredData();

    const ipHash = hashIp(getClientIp(request));
    const ipLimit = getIpDailyLimit();

    // Quota comes before the vision call: the model number is unknown until the
    // image is read, and the vision call is itself paid. One scan = one unit,
    // covering the vision call plus any follow-up decode.
    if (!(await reserveAiUnit(ipHash, ipLimit))) {
      return jsonError(
        429,
        `Daily limit reached (${ipLimit} AI scans per UTC day). Try again after 00:00 UTC.`,
        { 'Retry-After': String(secondsUntilUtcMidnight()) },
      );
    }
    if (!(await reserveGlobalAiUnit(getGlobalDailyLimit()))) {
      console.error('Global daily AI budget exhausted');
      return jsonError(503, 'The scanner is at capacity right now. Please try again later.', {
        'Retry-After': String(secondsUntilUtcMidnight()),
      });
    }

    const outcome = await scanImage(image, mimeType);
    if (outcome.status === 'error') {
      console.error('Scan failed:', outcome.reason);
      return jsonError(502, 'Could not scan the label right now. Please try again.');
    }
    if (outcome.status === 'none') {
      return jsonError(422, 'Could not clearly identify a model number. Move closer and avoid glare.');
    }

    // The vision model's output is untrusted text: sanitize it like any user input.
    const modelKey = normalizeModelCode(outcome.model);
    const decodeInput = cleanText(outcome.model, 200);
    if (!modelKey || !decodeInput) {
      return jsonError(422, 'Could not clearly identify a model number. Move closer and avoid glare.');
    }

    // Scanning a product we already have still cost a vision call, but should not
    // cost a second one.
    const cached = await getProductByModel(modelKey);
    if (cached) {
      return NextResponse.json({
        found: true,
        model: modelKey,
        identity: cached.result.identity,
        alternatives: cached.result.alternatives,
        slug: cached.slug,
      });
    }

    const decoded = await decodeModel(decodeInput);
    if (decoded.error || !decoded.identity) {
      console.error('Decode after scan failed:', decoded.error ?? 'payload contained no identity');
      // No `found` flag on failure: the client must not silently re-decode.
      return jsonError(502, 'Read the model number, but could not decode it right now. Please try again.');
    }

    let slug: string | undefined;
    try {
      const saved = await saveProduct(modelKey, decoded);
      slug = saved.slug;
      await logSearch(modelKey, saved.id, 'camera', ipHash);
    } catch (error) {
      console.error('Failed to persist scanned product:', error);
    }

    return NextResponse.json({
      found: true,
      model: modelKey,
      identity: decoded.identity,
      alternatives: decoded.alternatives,
      slug,
    });
  } catch (error) {
    console.error('Scan route failed:', error);
    return jsonError(500, 'Failed to process image');
  }
}
