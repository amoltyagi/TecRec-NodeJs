import { GoogleGenerativeAI, Tool } from '@google/generative-ai';
import { DecodeResult } from '@/types';

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY or API_KEY missing from environment');

const genAI = new GoogleGenerativeAI(apiKey);

const DECODE_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
const SCAN_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return cleaned.trim();
}

const SYSTEM_PROMPT = `
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

export async function geminiDecode(model: string): Promise<DecodeResult> {
  let lastError: unknown;

  for (const modelName of DECODE_MODELS) {
    try {
      console.log(`Attempting decode with model: ${modelName}`);

      const googleSearchTool = { googleSearch: {} };
      const generativeModel = genAI.getGenerativeModel({
        model: modelName,
        tools: [googleSearchTool as Tool],
      });

      const result = await generativeModel.generateContent([
        SYSTEM_PROMPT,
        `Decode this tech model using REAL-TIME Google Search for latest specs, release date, and US pricing: ${model}`,
      ]);

      const rawText = result.response.text();
      if (rawText) {
        console.log(`Successfully decoded with ${modelName}`);
        const cleaned = cleanJsonResponse(rawText);
        const parsed = JSON.parse(cleaned);
        return parsed as DecodeResult;
      }
    } catch (err) {
      console.error(`Failed with model ${modelName}:`, err);
      lastError = err;
    }
  }

  return {
    error: `Failed to decode with all available models.${lastError instanceof Error ? ` ${lastError.message}` : ''}`,
  };
}

export async function geminiScan(imageBase64: string): Promise<string | null> {
  let lastError: unknown;

  for (const modelName of SCAN_MODELS) {
    try {
      console.log(`Attempting scan with model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        {
          inlineData: { data: imageBase64, mimeType: 'image/jpeg' },
        },
        "Extract the technology product model number or name from this price tag or product label. Return ONLY the model/name string. If nothing found, return 'None'.",
      ]);

      const extracted = result.response.text().trim();
      if (extracted && extracted.toLowerCase() !== 'none') {
        console.log(`Successfully extracted with ${modelName}: ${extracted}`);
        return extracted;
      }
    } catch (err) {
      console.error(`Failed with model ${modelName}:`, err);
      lastError = err;
    }
  }

  console.error('All scan models failed:', String(lastError));
  return null;
}