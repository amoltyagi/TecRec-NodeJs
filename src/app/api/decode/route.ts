import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";

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

        const ai = new GoogleGenAI({ apiKey });

        const systemPrompt = `
      You are a premium universal tech shopping decoder named TecRec. 
      Identify any piece of technology (cameras, monitors, SD cards, appliances, etc.) by its model code.
      
      CRITICAL: You MUST use Google Search to find the latest 2024/2025 specifications, street prices (US Market), and expert reviews.
      
      Price Indicator Logic:
      - level/percent mapping must be consistent:
        - 0-25%: "Value"
        - 26-50%: "Mid-Range"
        - 51-75%: "Premium"
        - 76-100%: "Elite"

      Alternative Selection Logic:
      - The "alternatives" list MUST ONLY include products from the EXACT SAME PRODUCT CATEGORY as the identified model.
    `;

        // Using gemini-1.5-pro for better reasoning/search grounding, or sticking to lite if speed is key.
        // Original used 'gemini-flash-lite-latest'. Let's upgrade to 1.5-flash which is standard and supports JSON mode well.
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: {
                parts: [
                    { text: systemPrompt },
                    { text: `Decode this tech model using current 2025 web data and US pricing: ${model}` }
                ]
            },
            config: {
                responseMimeType: 'application/json',
                tools: [{ googleSearch: {} }],
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        identity: {
                            type: 'OBJECT',
                            properties: {
                                brand: { type: 'STRING' },
                                category: { type: 'STRING' },
                                keySpecs: { type: 'ARRAY', items: { type: 'STRING' } },
                                year: { type: 'STRING' },
                                insight: { type: 'STRING' },
                                priceIndicator: {
                                    type: 'OBJECT',
                                    properties: {
                                        level: { type: 'STRING' },
                                        percent: { type: 'NUMBER' },
                                        estimatedPrice: { type: 'STRING' }
                                    }
                                }
                            }
                        },
                        alternatives: {
                            type: 'ARRAY',
                            items: {
                                type: 'OBJECT',
                                properties: {
                                    brand: { type: 'STRING' },
                                    model: { type: 'STRING' },
                                    why: { type: 'STRING' }
                                }
                            }
                        }
                    }
                }
            }
        });

        const resultText = response.text || "{}";
        const result = JSON.parse(resultText);
        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        return NextResponse.json({ ...result, sources });

    } catch (error) {
        console.error('Decode API Error:', error);
        return NextResponse.json({ error: 'Failed to decode model' }, { status: 500 });
    }
}
