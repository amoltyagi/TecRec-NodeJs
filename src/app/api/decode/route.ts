import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
    try {
        const { model: targetModel } = await req.json();

        if (!targetModel) {
            return NextResponse.json({ error: 'No model provided' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Server API key configuration missing' }, { status: 500 });
        }
        console.log("Using API Key ending in:", apiKey.slice(-4));

        const genAI = new GoogleGenerativeAI(apiKey);

        // Use the fastest models first for speed optimization
        const modelsToTry = ["gemini-2.0-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-flash-latest"];
        let lastError = null;

        const systemPrompt = `
      You are TecRec, a premium tech decoder. Identify technology products by model code.
      Use your grounding to find 2024/2025 specs, prices (US), & reviews.
      
      Output JSON only.
      
      Price Logic:
      - 0-25%: "Value"
      - 26-50%: "Mid-Range"
      - 51-75%: "Premium"
      - 76-100%: "Elite"

      Alternatives: Same exact product category only.
      
      Response JSON Schema:
      {
        "identity": {
            "brand": "string",
            "category": "string",
            "keySpecs": ["string"],
            "year": "string",
            "releaseWindow": "string",
            "amazonLink": "string",
            "insight": "string",
            "priceIndicator": {
                "level": "string",
                "percent": number,
                "estimatedPrice": "string"
            }
        },
        "alternatives": [
            { "brand": "string", "model": "string", "why": "string" }
        ]
      }
    `;

        for (const modelName of modelsToTry) {
            try {
                console.log(`Attempting decode with model: ${modelName}`);
                const generativeModel = genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: { responseMimeType: "application/json" },
                    // Enable Google Search grounding for real-time data
                    tools: [{ googleSearch: {} } as any]
                });

                const result = await generativeModel.generateContent([
                    systemPrompt,
                    `Decode this tech model using current 2025 web data and US pricing: ${targetModel}`
                ]);

                const resultText = result.response.text();
                if (resultText) {
                    console.log(`Successfully decoded with ${modelName}`);
                    return NextResponse.json({ ...JSON.parse(resultText), sources: [] });
                }
            } catch (err) {
                console.error(`Failed with model ${modelName}:`, err);
                lastError = err;
            }
        }

        return NextResponse.json({
            error: 'Failed to decode with all available models.',
            details: lastError instanceof Error ? lastError.message : String(lastError)
        }, { status: 500 });

    } catch (error) {
        console.error('Decode API Error:', error);
        return NextResponse.json({ error: 'Failed to decode model' }, { status: 500 });
    }
}
