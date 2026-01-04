import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
    try {
        const { model } = await req.json();

        if (!model) {
            return NextResponse.json({ error: 'No model provided' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Server API key configuration missing' }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        // Note: 'googleSearch' tool might vary in this SDK. 
        // Standard approach for JSON mode is supported.
        const generativeModel = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                // tools logic for standard SDK often requires Vertex AI for 'googleSearch' retrieval grounding,
                // OR using dynamic retrieval if enabled. 
                // For AI Studio key, basic grounding might be limited or require specific 'tools' config.
                // Let's assume standard text generation for now but try to include tools if supported.
                // tools: [{ googleSearch: {} }] // This is often region/account specific.
            }
        });

        const systemPrompt = `
      You are a premium universal tech shopping decoder named TecRec. 
      Identify any piece of technology (cameras, monitors, SD cards, appliances, etc.) by its model code.
      
      CRITICAL: You MUST use your internal knowledge to find the latest 2024/2025 specifications, street prices (US Market), and expert reviews.
      
      Price Indicator Logic:
      - level/percent mapping must be consistent:
        - 0-25%: "Value"
        - 26-50%: "Mid-Range"
        - 51-75%: "Premium"
        - 76-100%: "Elite"

      Alternative Selection Logic:
      - The "alternatives" list MUST ONLY include products from the EXACT SAME PRODUCT CATEGORY as the identified model.
      
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

        const result = await generativeModel.generateContent([
            systemPrompt,
            `Decode this tech model using current 2025 web data and US pricing: ${model}`
        ]);

        const resultText = result.response.text();
        const parsedParams = JSON.parse(resultText);

        // Grounding metadata is not always returned in the standard response object for AI Studio the same way.
        // We will omit 'sources' or mock them if not present.

        return NextResponse.json({ ...parsedParams, sources: [] });

    } catch (error) {
        console.error('Decode API Error:', error);
        return NextResponse.json({ error: 'Failed to decode model' }, { status: 500 });
    }
}
