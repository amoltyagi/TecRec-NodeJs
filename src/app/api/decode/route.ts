import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, Tool } from "@google/generative-ai";

// Constants for validation
const MAX_MODEL_LENGTH = 200;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Helper to clean JSON from markdown code fences
function cleanJsonResponse(text: string): string {
    let cleaned = text.trim();
    // Remove markdown code fences if present
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return cleaned.trim();
}

// Sanitize input by removing control characters and limiting length
function sanitizeModelInput(input: string): string {
    return input
        .trim()
        .slice(0, MAX_MODEL_LENGTH)
        .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control chars except newline/tab
}

export async function POST(req: NextRequest) {
    try {
        const { model: targetModel } = await req.json();

        if (!targetModel || typeof targetModel !== 'string') {
            return NextResponse.json({ error: 'Model code is required and must be a string' }, { status: 400 });
        }

        const sanitizedModel = sanitizeModelInput(targetModel);

        if (sanitizedModel.length === 0) {
            return NextResponse.json({ error: 'Model code cannot be empty' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Server API key configuration missing' }, { status: 500 });
        }
        console.log("Using API Key ending in:", apiKey.slice(-4));

        const genAI = new GoogleGenerativeAI(apiKey);

        // Use fastest models first for speed optimization
        const modelsToTry = ["gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"];
        let lastError = null;

        const systemPrompt = `
      You are TecRec, a premium tech decoder. Identify technology products by model code.
      Use your grounding to find 2024/2025 specs, prices (US), & reviews.

      IMPORTANT: Output ONLY raw JSON, no markdown, no code fences.

      ===== PRICING - SINGLE REFERENCE VARIANT ONLY =====
      CRITICAL: Return only ONE representative variant/spec for pricing, NOT all variations.
      - For TVs: Use 65" as the reference size (most common/popular)
      - For Laptops: Use standard/mid-range config (e.g., 16GB RAM, 512GB SSD for mainstream)
      - For Cameras: Use body-only or standard kit price
      - For Phones: Use base storage variant (128GB/256GB)
      - For Audio: Use standard color/finish
      - For other categories: Use the most popular/mid-range option

      In keySpecs: You may briefly mention that "Also available in [other sizes]" but do NOT
      list every variant price. The priceIndicator.estimatedPrice must reflect the SINGLE
      reference variant only.

      Price Logic (based on reference variant):
      - 0-25%: "Value"
      - 26-50%: "Mid-Range"
      - 51-75%: "Premium"
      - 76-100%: "Elite"

      Alternatives: Same exact product category only.

      ===== AMAZON LINK REQUIREMENTS =====
      CRITICAL: amazonLink must be a US Amazon search URL using ONLY the product model code.
      Format: https://www.amazon.com/s?k=MODEL_CODE
      - Use ONLY the brand + model number (NOT all features/specs)
      - Replace spaces with + in the URL
      - Examples:
        * "Sony A7 IV" -> https://www.amazon.com/s?k=Sony+A7+IV
        * "MacBook Pro M3" -> https://www.amazon.com/s?k=MacBook+Pro+M3
        * "Samsung Galaxy S24 Ultra" -> https://www.amazon.com/s?k=Samsung+Galaxy+S24+Ultra

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
                    // Google Search tool configuration - cast to Tool type as SDK doesn't export googleSearch directly
                    tools: [{ googleSearch: {} } as Tool]
                });

                const result = await generativeModel.generateContent([
                    systemPrompt,
                    `Decode this tech model using current 2025 web data and US pricing: ${sanitizedModel}`
                ]);

                const rawText = result.response.text();
                if (rawText) {
                    console.log(`Successfully decoded with ${modelName}`);
                    const cleanedJson = cleanJsonResponse(rawText);
                    const parsed = JSON.parse(cleanedJson);
                    return NextResponse.json({ ...parsed, sources: [] });
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
