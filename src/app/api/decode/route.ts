import { NextRequest, NextResponse } from 'next/server';
import { veniceDecode } from '@/lib/ai/venice';
import { getProductByModel, saveProduct, logSearch, getDailySearchCount, incrementSearchCount } from '@/lib/db/neon';
import { getClientIp, hashIp, isBodyTooLarge, sanitizeModelInput } from '@/lib/security';

const MAX_BODY_BYTES = 8 * 1024; // model strings are <=200 chars; anything bigger is abuse
const FREE_DAILY_LIMIT = 5;

export async function POST(req: NextRequest) {
  try {
    if (isBodyTooLarge(req, MAX_BODY_BYTES)) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    const { model: targetModel } = await req.json();

    if (!targetModel || typeof targetModel !== 'string') {
      return NextResponse.json({ error: 'Model code is required and must be a string' }, { status: 400 });
    }

    const cleanModel = sanitizeModelInput(targetModel);

    if (cleanModel.length === 0) {
      return NextResponse.json({ error: 'Model code cannot be empty' }, { status: 400 });
    }

    const ipHash = hashIp(getClientIp(req));

    // Rate limiting
    const dailyCount = await getDailySearchCount(ipHash);
    if (dailyCount >= FREE_DAILY_LIMIT) {
      return NextResponse.json({ error: 'Daily limit reached (5/5). Try again tomorrow.' }, { status: 429 });
    }

    // Check DB cache first
    const existing = await getProductByModel(cleanModel);
    if (existing) {
      // Cache hits are free: bump analytics only, don't count against the daily AI limit
      await incrementSearchCount(cleanModel);
      return NextResponse.json(existing);
    }

    // Call Venice AI
    const decoded = await veniceDecode(cleanModel);
    if (decoded.error) {
      // Detail stays in server logs (veniceDecode logs per-model); clients get a generic message
      console.error(`Decode failed for model: ${decoded.error}`);
      return NextResponse.json({ error: 'Could not decode this model right now. Please try again later.' }, { status: 502 });
    }

    // Save to DB
    await saveProduct(cleanModel, decoded);
    await logSearch(cleanModel, null, 'text', ipHash);

    return NextResponse.json(decoded);

  } catch (error) {
    console.error('Decode API Error:', error);
    return NextResponse.json({ error: 'Failed to decode model' }, { status: 500 });
  }
}
