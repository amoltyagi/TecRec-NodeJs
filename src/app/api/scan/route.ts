import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Constants for validation
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Validate base64 image data
function validateBase64Image(imageData: string): { valid: boolean; error?: string } {
    if (!imageData || typeof imageData !== 'string') {
        return { valid: false, error: 'Image data must be a string' };
    }

    // Check if it's valid base64
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    if (!base64Regex.test(imageData)) {
        return { valid: false, error: 'Invalid base64 format' };
    }

    // Check size (base64 is ~33% larger than original, so we account for that)
    const estimatedBytes = Math.floor(imageData.length * 0.75);
    if (estimatedBytes > MAX_IMAGE_SIZE_BYTES) {
        return { valid: false, error: `Image too large. Maximum size is ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB` };
    }

    return { valid: true };
}

export async function POST(req: NextRequest) {
    try {
        const { image } = await req.json();

        if (!image) {
            return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
        }

        // Validate image data
        const validation = validateBase64Image(image);
        if (!validation.valid) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Server API key configuration missing' }, { status: 500 });
        }
        console.log("Using API Key ending in:", apiKey.slice(-4));

        const genAI = new GoogleGenerativeAI(apiKey);

        // Attempt with multiple model identifiers in case of environment-specific naming
        const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];
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
