export interface PriceIndicator {
    level: string; // "Value", "Mid-Range", "Premium", "Elite"
    percent: number; // 0-100 value for the meter
    estimatedPrice: string; // e.g., "$1,299"
}

export interface TechIdentity {
    brand: string;
    category: string; // e.g., "Mirrorless Camera"
    keySpecs: string[]; // 3 main key differentiating specs
    year: string;
    releaseWindow?: string; // e.g. "Q3 2024"
    amazonLink?: string;
    insight: string;
    priceIndicator?: PriceIndicator;
}

export interface AlternativeModel {
    model: string;
    brand: string;
    why: string;
}

export interface DecodeResult {
    identity?: TechIdentity;
    alternatives?: AlternativeModel[];
    error?: string;
    sources?: Record<string, unknown>[];
}
