import { DecodeResult } from '@/types';

const VENICE_API_URL = 'https://api.venice.ai/api/v1/chat/completions';

function getApiKey(): string {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey) throw new Error('VENICE_API_KEY missing from environment');
  return apiKey;
}

// Primary models can be overridden via env; the rest are fallbacks.
const DECODE_MODELS = [
  process.env.VENICE_DECODE_MODEL || 'zai-org-glm-4.7',
  'qwen3-vl-235b-a22b',
  'google-gemma-4-31b-it',
];
const SCAN_MODELS = [
  process.env.VENICE_SCAN_MODEL || 'qwen3-vl-235b-a22b',
  'google-gemma-4-31b-it',
];

interface ChatMessage {
  role: 'system' | 'user';
  content: string | Array<Record<string, unknown>>;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

async function veniceChat(
  model: string,
  messages: ChatMessage[],
  options: { webSearch?: boolean; jsonMode?: boolean; temperature?: number } = {}
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    venice_parameters: {
      enable_web_search: options.webSearch ? 'on' : 'off',
      include_venice_system_prompt: false,
      strip_thinking_response: true,
    },
  };
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  const res = await fetch(VENICE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as ChatCompletionResponse;
  if (!res.ok) {
    throw new Error(`Venice API ${res.status}: ${data.error?.message || res.statusText}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Venice returned an empty response');
  return content;
}

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return cleaned.trim();
}

const SYSTEM_PROMPT = `
You are TecRec, a premium tech decoder. Identify technology products by model code.
CRITICAL: You have access to REAL-TIME web search. ALWAYS use it for the latest information.

Your search results contain CURRENT web data from 2024/2025/2026. Use this search data,
NOT your training knowledge, which may be outdated.

Search Workflow:
1. First, search the web for the exact model code
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

export async function veniceDecode(model: string): Promise<DecodeResult> {
  let lastError: unknown;

  for (const modelName of DECODE_MODELS) {
    try {
      console.log(`Attempting decode with model: ${modelName}`);

      const rawText = await veniceChat(
        modelName,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Decode this tech model using REAL-TIME web search for latest specs, release date, and US pricing: ${model}`,
          },
        ],
        { webSearch: true, jsonMode: true }
      );

      const cleaned = cleanJsonResponse(rawText);
      const parsed = JSON.parse(cleaned);
      console.log(`Successfully decoded with ${modelName}`);
      return parsed as DecodeResult;
    } catch (err) {
      console.error(`Failed with model ${modelName}:`, err);
      lastError = err;
    }
  }

  return {
    error: `Failed to decode with all available models.${lastError instanceof Error ? ` ${lastError.message}` : ''}`,
  };
}

export async function veniceScan(imageBase64: string): Promise<string | null> {
  let lastError: unknown;

  for (const modelName of SCAN_MODELS) {
    try {
      console.log(`Attempting scan with model: ${modelName}`);

      const extracted = (
        await veniceChat(
          modelName,
          [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
                },
                {
                  type: 'text',
                  text: "Extract the technology product model number or name from this price tag or product label. Return ONLY the model/name string. If nothing found, return 'None'.",
                },
              ],
            },
          ],
          { temperature: 0.1 }
        )
      )
        .trim()
        .replace(/^```[a-z]*\n?|\n?```$/gi, '')
        .trim();

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
