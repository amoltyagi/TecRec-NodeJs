/**
 * Which dollar figure the price card is showing:
 * - `MSRP`: official US launch list price.
 * - `Street`: what a US retailer actually charges today.
 *
 * Optional because rows cached before the field existed cannot supply it.
 */
export type PriceBasis = 'MSRP' | 'Street';

export interface PriceIndicator {
    level: string; // "Value" | "Mid-Range" | "Premium" | "Elite"
    percent: number; // 0-100 value for the meter
    estimatedPrice: string; // e.g., "$1,299" or "$2,700-$2,800"
    basis?: PriceBasis;
    /**
     * ISO date (YYYY-MM-DD) the street price was observed on. Only meaningful
     * with `basis: 'Street'` - it is what the card shows as "as of ...".
     */
    observedOn?: string;
    /**
     * Official launch MSRP, shown as a small anchor under a street-price
     * headline so the card never hides what the product launched at.
     */
    listPrice?: string;
}

/**
 * Marks facts that came from the curated datasheet file rather than a model
 * guess. Always derived server-side from `src/lib/datasheets.ts`: it is never
 * read from AI output or from a stored row, so a model cannot claim it.
 */
export interface VerificationStamp {
    /** ISO date (YYYY-MM-DD) the figures were last checked against the source. */
    asOf: string;
    /** Short human label for the source, e.g. "Manufacturer specification page". */
    source: string;
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
    verified?: VerificationStamp;
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
}

/** `/api/decode` response: a validated result plus its canonical page slug. */
export type DecodeResponse = DecodeResult & {
    slug?: string;
};

/** `/api/scan` success response. */
export type ScanResponse = DecodeResponse & {
    found: true;
    model: string;
};
