import { NextRequest, NextResponse } from 'next/server';
import { veniceDecode } from '@/lib/ai/venice';
import { getProductByModel, saveProduct, logSearch, getDailySearchCount, incrementSearchCount } from '@/lib/db/neon';

const MAX_MODEL_LENGTH = 200;
const FREE_DAILY_LIMIT = 5;

function sanitizeModelInput(input: string): string {
  return input
    .trim()
    .slice(0, MAX_MODEL_LENGTH)
    .replace(/[\x00-\x1F\x7F]/g, '');
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
    const { model: targetModel } = await req.json();

    if (!targetModel || typeof targetModel !== 'string') {
      return NextResponse.json({ error: 'Model code is required and must be a string' }, { status: 400 });
    }

    const cleanModel = sanitizeModelInput(targetModel);

    if (cleanModel.length === 0) {
      return NextResponse.json({ error: 'Model code cannot be empty' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const ipHash = hashIp(ip);

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
      return NextResponse.json(decoded, { status: 502 });
    }

    // Save to Supabase
    await saveProduct(cleanModel, decoded);
    await logSearch(cleanModel, null, 'text', ipHash);

    return NextResponse.json(decoded);

  } catch (error) {
    console.error('Decode API Error:', error);
    return NextResponse.json({ error: 'Failed to decode model' }, { status: 500 });
  }
}