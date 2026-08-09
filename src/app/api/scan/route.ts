import { NextRequest, NextResponse } from 'next/server';
import { veniceScan, veniceDecode } from '@/lib/ai/venice';
import { getProductByModel, saveProduct, logSearch, getDailySearchCount, incrementSearchCount } from '@/lib/db/neon';
import { getClientIp, hashIp, isBodyTooLarge, sanitizeModelInput } from '@/lib/security';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
// ~7MB: 5MB binary -> ~6.7MB base64 -> small JSON envelope overhead
const MAX_BODY_BYTES = 7 * 1024 * 1024;
const FREE_DAILY_LIMIT = 5;

function validateBase64Image(imageData: string): { valid: boolean; error?: string } {
  if (!imageData || typeof imageData !== 'string') {
    return { valid: false, error: 'Image data must be a string' };
  }

  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(imageData)) {
    return { valid: false, error: 'Invalid base64 format' };
  }

  const estimatedBytes = Math.floor(imageData.length * 0.75);
  if (estimatedBytes > MAX_IMAGE_SIZE_BYTES) {
    return { valid: false, error: `Image too large. Maximum size is ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB` };
  }

  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    if (isBodyTooLarge(req, MAX_BODY_BYTES)) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
    }

    const validation = validateBase64Image(image);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const ipHash = hashIp(getClientIp(req));

    // Rate limiting
    const dailyCount = await getDailySearchCount(ipHash);
    if (dailyCount >= FREE_DAILY_LIMIT) {
      return NextResponse.json({ error: 'Daily limit reached (5/5). Try again tomorrow.' }, { status: 429 });
    }

    // Extract model from image
    const extractedModel = await veniceScan(image);
    if (!extractedModel || extractedModel.toLowerCase() === 'none') {
      return NextResponse.json({ error: 'Could not clearly identify a model number. Please try closer or adjust lighting.' }, { status: 422 });
    }

    // The vision model's output is untrusted input: sanitize like any user query
    const cleanModel = sanitizeModelInput(extractedModel).toUpperCase();
    if (cleanModel.length === 0) {
      return NextResponse.json({ error: 'Could not clearly identify a model number. Please try closer or adjust lighting.' }, { status: 422 });
    }

    // Check DB cache first
    const existing = await getProductByModel(cleanModel);
    if (existing) {
      // Cache hits are free: bump analytics only, don't count against the daily AI limit
      await incrementSearchCount(cleanModel);
      return NextResponse.json({ found: true, model: cleanModel, ...existing });
    }

    // Call Venice AI to decode
    const decoded = await veniceDecode(cleanModel);
    if (decoded.error) {
      // Detail stays in server logs (veniceDecode logs per-model); clients get a generic message
      console.error(`Decode failed for scanned model: ${decoded.error}`);
      return NextResponse.json({ error: 'Could not decode this model right now. Please try again later.', found: true, model: cleanModel }, { status: 502 });
    }

    // Save to DB
    await saveProduct(cleanModel, decoded);
    await logSearch(cleanModel, null, 'camera', ipHash);

    return NextResponse.json({ found: true, model: cleanModel, ...decoded });

  } catch (error) {
    console.error('Scan API Error:', error);
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 });
  }
}
