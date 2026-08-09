import { NextRequest, NextResponse } from 'next/server';
import { veniceScan, veniceDecode } from '@/lib/ai/venice';
import { getProductByModel, saveProduct, logSearch, getDailySearchCount, incrementSearchCount } from '@/lib/db/neon';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
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

function hashIp(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
    }

    const validation = validateBase64Image(image);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const ipHash = hashIp(ip);

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

    const cleanModel = extractedModel.toUpperCase().trim();

    // Check DB cache first
    const existing = await getProductByModel(cleanModel);
    if (existing) {
      // Cache hits are free: bump analytics only, don't count against the daily AI limit
      await incrementSearchCount(cleanModel);
      return NextResponse.json({ found: true, model: extractedModel, ...existing });
    }

    // Call Venice AI to decode
    const decoded = await veniceDecode(cleanModel);
    if (decoded.error) {
      return NextResponse.json({ error: decoded.error, found: true, model: extractedModel }, { status: 502 });
    }

    // Save to Supabase
    await saveProduct(cleanModel, decoded);
    await logSearch(cleanModel, null, 'camera', ipHash);

    return NextResponse.json({ found: true, model: extractedModel, ...decoded });

  } catch (error) {
    console.error('Scan API Error:', error);
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 });
  }
}