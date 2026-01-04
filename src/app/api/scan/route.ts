import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
    try {
        const { image } = await req.json();

        if (!image) {
            return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Server API key configuration missing' }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const result = await model.generateContent([
            { inlineData: { data: image, mimeType: 'image/jpeg' } },
            "Extract the technology product model number or name from this price tag or product label. Return ONLY the model/name string. If nothing found, return 'None'."
        ]);

        const extracted = result.response.text().trim();

        if (!extracted || extracted.toLowerCase() === 'none') {
            return NextResponse.json({ found: false });
        }

        return NextResponse.json({ found: true, model: extracted });

    } catch (error) {
        console.error('Scan API Error:', error);
        return NextResponse.json({ error: 'Failed to process image' }, { status: 500 });
    }
}
