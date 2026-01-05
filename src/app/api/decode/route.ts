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

        // DEBUG: List available models to see what the key has access to
        try {
            console.log("Fetching available models for this key...");
            const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const listData = await listRes.json();
            if (listData.models) {
                console.log("AVAILABLE MODELS:", listData.models.map((m: any) => m.name).join(", "));
            } else {
                console.log("NO MODELS RETURNED via direct list call. Response:", JSON.stringify(listData));
            }
        } catch (listErr) {
            console.error("Failed to list models:", listErr);
        }

        const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash", "gemini-1.5-flash"];
        let lastError = null;

        const systemPrompt = `
      You are TecRec, a premium tech decoder. Identify technology products by model code.
      CRITICAL: Use Google Search to find 2024/2025 specs, prices (US), & reviews.
      
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
            "releaseWindow": "string", // Quarter & Year (e.g. Q3 2024)
            "amazonLink": "string", // Constructed search URL for Amazon US
            "insight": "string", // Concise verdict < 30 words
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
                    generationConfig: { responseMimeType: "application/json" }
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
