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
      CRITICAL: You have access to REAL-TIME Google Search. ALWAYS use it for the latest information.

      Your search results contain CURRENT web data from 2024/2025/2026. Use this search data,
      NOT your training knowledge, which may be outdated.

      Search Workflow:
      1. First, Google Search the exact model code
      2. Extract: release date, current US pricing, latest specs, recent reviews
      3. If product is very new (just announced/launched), say so
      4. If product is upcoming/rumored, clarify that status

      IMPORTANT: Output ONLY raw JSON, no markdown, no code fences.

      ===== RELEASE WINDOW - MUST INCLUDE YEAR =====
      CRITICAL: Both "year" and "releaseWindow" fields must ALWAYS include the year.
      - year: Just the year (e.g., "2024", "2025", "2026")
      - releaseWindow: Specific timing WITH year (e.g., "Q1 2025", "January 2026", "Late 2024")
      - NEVER omit the year from releaseWindow
      - Examples: "Q2 2025", "September 2024", "H2 2026", "Early 2025"

      ===== PRICING - ACCURATE US MARKET PRICING =====
      CRITICAL: Use REAL current US market prices from Amazon, Best Buy, B&H, etc.

      Reference Variant Rules (use ONE standard config for pricing):
      - TVs: 65" size (most popular)
      - Laptops: Standard config (16GB RAM, 512GB SSD for ultrabooks, 32GB RAM for gaming)
      - Cameras: Body-only or standard kit
      - Phones: Base storage (128GB/256GB depending on what's standard)
      - Audio: Standard color/finish
      - Other: Most popular/mid-range option

      Pricing Tier Logic (based on REAL market prices for that category):
      - Value (0-25%): Budget-friendly, entry-level
      - Mid-Range (26-50%): Mainstream, good value
      - Premium (51-75%): High-end, enthusiast
      - Elite (76-100%): Luxury, flagship, professional

      Examples of REAL pricing:
      - TV: $400 = Value, $700 = Mid-Range, $1,200 = Premium, $2,500+ = Elite
      - Laptop: $500 = Value, $1,000 = Mid-Range, $1,800 = Premium, $3,000+ = Elite
      - Phone: $400 = Value, $700 = Mid-Range, $1,000 = Premium, $1,200+ = Elite
      - Camera: $500 = Value, $1,500 = Mid-Range, $2,500 = Premium, $4,000+ = Elite

      ===== ALTERNATIVES - MINIMUM 3 REQUIRED =====
      CRITICAL: Return at least 3 alternative products.
      - Must be same product category
      - Order by similarity: closest match first
      - Include both cheaper AND more expensive options
      - Mix of competitors AND same-brand alternatives
      - For each "why" field: explain similarity (features, positioning, use case)

      Alternatives format:
      [
        { "brand": "Competitor Brand", "model": "Model Name", "why": "Direct competitor with similar [key feature] and positioning" },
        { "brand": "Same Brand", "model": "Model Name", "why": "Same brand, [tier higher/lower] alternative" },
        { "brand": "Another Brand", "model": "Model Name", "why": "Similar [use case] with different [differentiating feature]" }
      ]

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
            { "brand": "string", "model": "string", "why": "string" },
            { "brand": "string", "model": "string", "why": "string" },
            { "brand": "string", "model": "string", "why": "string" }
        ]
      }
    `;

        for (const modelName of modelsToTry) {
            try {
                console.log(`Attempting decode with model: ${modelName}`);

                // Configure Google Search for real-time web data
                // Note: Flash models use googleSearch, not googleSearchRetrieval
                const googleSearchTool = {
                    googleSearch: {}
                };

                const generativeModel = genAI.getGenerativeModel({
                    model: modelName,
                    tools: [googleSearchTool as Tool]
                });

                const result = await generativeModel.generateContent([
                    systemPrompt,
                    `Decode this tech model using REAL-TIME Google Search for latest specs, release date, and US pricing: ${sanitizedModel}`
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
