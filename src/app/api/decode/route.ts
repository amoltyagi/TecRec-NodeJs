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

        const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro"];
        let lastError = null;

        const systemPrompt = `
      You are a premium universal tech shopping decoder named TecRec. 
      Identify any piece of technology (cameras, monitors, SD cards, appliances, etc.) by its model code.
      
      Response JSON Schema:
      {
        "identity": {
            "brand": "string",
            "category": "string",
            "keySpecs": ["string"],
            "year": "string",
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
