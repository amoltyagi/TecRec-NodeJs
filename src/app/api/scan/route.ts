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
        console.log("Using API Key ending in:", apiKey.slice(-4));

        const genAI = new GoogleGenerativeAI(apiKey);

        // Attempt with multiple model identifiers in case of environment-specific naming
        const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro-vision"];
        let lastError = null;

        for (const modelName of modelsToTry) {
            try {
                console.log(`Attempting scan with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent([
                    { inlineData: { data: image, mimeType: 'image/jpeg' } },
                    "Extract the technology product model number or name from this price tag or product label. Return ONLY the model/name string. If nothing found, return 'None'."
                ]);

                const extracted = result.response.text().trim();
                if (extracted) {
                    console.log(`Successfully extracted with ${modelName}: ${extracted}`);
                    return NextResponse.json({ found: extracted.toLowerCase() !== 'none', model: extracted });
                }
            } catch (err) {
                console.error(`Failed with model ${modelName}:`, err);
                lastError = err;
            }
        }

        return NextResponse.json({
            error: 'All models failed to respond.',
            details: lastError instanceof Error ? lastError.message : String(lastError)
        }, { status: 500 });

    } catch (error) {
        console.error('Scan API Error:', error);
        return NextResponse.json({ error: 'Failed to process image' }, { status: 500 });
    }
}
