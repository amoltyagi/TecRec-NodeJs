import { describe, expect, it } from 'vitest';
import { DATASHEET_ENTRIES, applyDatasheet, datasheetKey, lookupDatasheet } from '@/lib/datasheets';
import { datasheetDecode, decodeProduct } from '@/lib/decode';
import { priceLevelForPercent } from '@/lib/validation';
import type { DecodeResult } from '@/types';

/** A plausible hallucinated decode: the app really produced 600 W for this card. */
function aiResult(): DecodeResult {
  return {
    identity: {
      brand: 'NVIDIA',
      category: 'Desktop Graphics Card',
      keySpecs: ['32 GB GDDR7 VRAM', 'NVIDIA Blackwell Architecture', '21,760 CUDA Cores / 600W TGP'],
      year: '2025',
      releaseWindow: 'January 2025',
      insight: 'Model-written verdict that repeats a wrong figure.',
      priceIndicator: { level: 'Elite', percent: 96, estimatedPrice: '$1,999' },
    },
    alternatives: [{ brand: 'NVIDIA', model: 'GeForce RTX 5080', why: 'model-written text' }],
  };
}

describe('datasheetKey', () => {
  it('collapses brand prefixes, marketing words and separators', () => {
    expect(datasheetKey('NVIDIA GEFORCE RTX 5090')).toBe('RTX 5090');
    expect(datasheetKey('  nvidia   rtx-5090  ')).toBe('RTX 5090');
    expect(datasheetKey('GeForce RTX 5090 Founders Edition')).toBe('RTX 5090');
    expect(datasheetKey('AMD Radeon RX 7900 XTX')).toBe('RX 7900 XTX');
  });

  it('keeps the tokens that identify the product', () => {
    expect(datasheetKey('RTX 5080')).not.toBe(datasheetKey('RTX 5090'));
    expect(datasheetKey('990 PRO')).toBe('990 PRO');
  });
});

describe('lookupDatasheet', () => {
  it('matches every name and alias form', () => {
    for (const entry of DATASHEET_ENTRIES) {
      for (const alias of [entry.name, ...entry.aliases]) {
        expect(lookupDatasheet(alias)?.name, alias).toBe(entry.name);
      }
    }
  });

  it('matches the bare model number a shopper actually types', () => {
    // Regression: searching "5090" used to fall through to the AI path, which
    // showed an unlabelled price and no verified stamp.
    expect(lookupDatasheet('5090')?.name).toBe('NVIDIA GeForce RTX 5090');
    expect(lookupDatasheet('nvidia 5090')?.name).toBe('NVIDIA GeForce RTX 5090');
    expect(lookupDatasheet('geforce 5090')?.name).toBe('NVIDIA GeForce RTX 5090');
    expect(lookupDatasheet('4090')?.name).toBe('NVIDIA GeForce RTX 4090');
    expect(lookupDatasheet('7900 XTX')?.name).toBe('AMD Radeon RX 7900 XTX');
    expect(lookupDatasheet('5070 Ti')?.name).toBe('NVIDIA GeForce RTX 5070 Ti');
    // Ambiguous bare numbers stay unmatched on purpose.
    expect(lookupDatasheet('5070')).toBeUndefined();
  });

  it('matches compact and mixed spellings of the same code', () => {
    expect(lookupDatasheet('RTX5090')?.name).toBe('NVIDIA GeForce RTX 5090');
    expect(lookupDatasheet('rtx-5090')?.name).toBe('NVIDIA GeForce RTX 5090');
    expect(lookupDatasheet('RTX 5070Ti')?.name).toBe('NVIDIA GeForce RTX 5070 Ti');
    expect(lookupDatasheet('A7IV')?.name).toBe('Sony Alpha 7 IV');
    expect(lookupDatasheet('RX7900XTX')?.name).toBe('AMD Radeon RX 7900 XTX');
    expect(lookupDatasheet('Samsung SSD 990 PRO')?.name).toBe('Samsung 990 PRO');
  });

  it('never resolves a laptop or mobile part to its desktop datasheet', () => {
    // The mobile RTX 5090 has 24 GB and a fraction of the board power: serving
    // the desktop entry as "verified" would be the worst kind of false positive.
    expect(lookupDatasheet('RTX 5090 Laptop GPU')).toBeUndefined();
    expect(lookupDatasheet('GeForce RTX 5090 mobile')).toBeUndefined();
    expect(lookupDatasheet('RTX 4090 Laptop')).toBeUndefined();
  });

  it('does not match unknown or neighbouring codes', () => {
    expect(lookupDatasheet('RTX 5060')).toBeUndefined();
    expect(lookupDatasheet('RX 7900 XT')).toBeUndefined();
    expect(lookupDatasheet('Sonos Era 300')).toBeUndefined();
    expect(lookupDatasheet('')).toBeUndefined();
  });
});

describe('datasheet entries', () => {
  it('are complete, sourced and non-overlapping', () => {
    const claimed = new Map<string, string>();

    for (const entry of DATASHEET_ENTRIES) {
      expect(entry.keySpecs.length, entry.name).toBeGreaterThanOrEqual(3);
      expect(entry.keySpecs.length, entry.name).toBeLessThanOrEqual(8);
      for (const spec of entry.keySpecs) {
        // Values without a unit are how "600W TGP" style claims slip through.
        expect(spec, `${entry.name}: ${spec}`).toMatch(/\d/);
      }
      expect(entry.msrp, entry.name).toMatch(/^\$\d/);
      expect(entry.pricePercent, entry.name).toBeGreaterThanOrEqual(0);
      expect(entry.pricePercent, entry.name).toBeLessThanOrEqual(100);
      expect(entry.verifiedOn, entry.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.sourceUrl, entry.name).toMatch(/^https:\/\//);
      expect(entry.releaseWindow, entry.name).toContain(entry.year);
      expect(entry.insight.length, entry.name).toBeGreaterThan(20);
      expect(entry.alternatives.length, entry.name).toBeGreaterThanOrEqual(2);

      if (entry.street) {
        expect(entry.street.price, entry.name).toMatch(/^\$\d/);
        expect(entry.street.price, entry.name).not.toBe(entry.msrp);
        expect(entry.street.observedOn, entry.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(entry.street.source.length, entry.name).toBeGreaterThan(3);
        expect(entry.street.percent, entry.name).toBeGreaterThanOrEqual(0);
        expect(entry.street.percent, entry.name).toBeLessThanOrEqual(100);
      }

      for (const alternative of entry.alternatives) {
        expect(alternative.model.length, entry.name).toBeGreaterThan(0);
        expect(alternative.why.length, entry.name).toBeGreaterThan(0);
      }

      // Two entries sharing a key would serve one product under another's name.
      for (const alias of [entry.name, ...entry.aliases]) {
        const key = datasheetKey(alias);
        expect(claimed.get(key) ?? entry.name, `key "${key}"`).toBe(entry.name);
        claimed.set(key, entry.name);
      }
    }
  });

  it('records a real, past verification date', () => {
    const today = new Date();
    for (const entry of DATASHEET_ENTRIES) {
      const verified = new Date(`${entry.verifiedOn}T00:00:00Z`);
      expect(Number.isNaN(verified.getTime()), entry.name).toBe(false);
      expect(verified.getTime(), entry.name).toBeLessThanOrEqual(today.getTime());
    }
  });

  it('keeps the displayed tier consistent with the stored percentage', () => {
    for (const entry of DATASHEET_ENTRIES) {
      const scored = entry.street ? entry.street.percent : entry.pricePercent;
      const merged = applyDatasheet(entry.name, aiResult());
      expect(merged.identity?.priceIndicator?.level, entry.name).toBe(priceLevelForPercent(scored));
      expect(merged.identity?.priceIndicator?.percent, entry.name).toBe(scored);
    }
  });
});

describe('applyDatasheet', () => {
  it('replaces every field the datasheet covers and stamps the result', () => {
    const merged = applyDatasheet('RTX 5090', aiResult());

    expect(merged.identity?.keySpecs.join(' ')).not.toMatch(/600\s?W/i);
    expect(merged.identity?.keySpecs.join(' ')).toMatch(/575 W TGP \(reference design\)/);
    expect(merged.identity?.insight).not.toMatch(/wrong figure/);
    expect(merged.identity?.priceIndicator?.basis).toBe('Street');
    expect(merged.identity?.priceIndicator?.estimatedPrice).toBe('$6,250');
    expect(merged.identity?.priceIndicator?.observedOn).toBe('2026-11-01');
    expect(merged.identity?.priceIndicator?.listPrice).toBe('$1,999');
    expect(merged.identity?.verified?.source).toBe('Manufacturer spec page');
    expect(merged.identity?.verified?.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(merged.alternatives?.[0]?.why).not.toBe('model-written text');
  });

  it('stamps the current date and names the entry it used', () => {
    const merged = applyDatasheet('NVIDIA RTX 4090', aiResult());
    expect(merged.identity?.brand).toBe('NVIDIA');
    expect(merged.identity?.releaseWindow).toBe('October 2022');
    expect(merged.identity?.verified?.asOf).toBe('2026-11-14');
  });

  it('keeps MSRP as the headline when no street observation exists', () => {
    const merged = applyDatasheet('RTX 5080', aiResult());
    expect(merged.identity?.priceIndicator?.basis).toBe('MSRP');
    expect(merged.identity?.priceIndicator?.estimatedPrice).toBe('$999');
    expect(merged.identity?.priceIndicator?.listPrice).toBeUndefined();
    expect(merged.identity?.priceIndicator?.observedOn).toBeUndefined();
  });

  it('leaves uncovered products exactly as they were', () => {
    const original = aiResult();
    expect(applyDatasheet('RTX 5060', original)).toBe(original);
  });

  it('leaves an error result alone', () => {
    const error: DecodeResult = { error: 'unknown product' };
    expect(applyDatasheet('RTX 5090', error)).toEqual(error);
  });
});

describe('datasheetDecode', () => {
  it('answers a verified product without any model output', () => {
    const result = datasheetDecode('nvidia geforce rtx 5090');

    expect(result?.identity?.brand).toBe('NVIDIA');
    expect(result?.identity?.keySpecs).toHaveLength(3);
    expect(result?.identity?.priceIndicator?.basis).toBe('Street');
    expect(result?.identity?.priceIndicator?.listPrice).toBe('$1,999');
    expect(result?.identity?.verified).toBeDefined();
    expect(result?.identity?.amazonLink).toMatch(/^https:\/\/www\.amazon\.com\/s\?/);
    expect(result?.alternatives?.length).toBeGreaterThanOrEqual(2);
  });

  it('returns null when no datasheet covers the code', () => {
    expect(datasheetDecode('RTX 5060')).toBeNull();
  });

  it('answers the bare model number from the datasheet, not the model', () => {
    const result = datasheetDecode('5090');
    expect(result?.identity?.verified).toBeDefined();
    expect(result?.identity?.priceIndicator?.basis).toBe('Street');
    expect(result?.identity?.priceIndicator?.estimatedPrice).toBe('$6,250');
    expect(result?.identity?.keySpecs.join(' ')).toMatch(/575 W TGP \(reference design\)/);
  });

  it('decodes a verified product without ever reaching the AI provider', async () => {
    // The test environment has no AI_API_KEY / AI_API_URL: any provider call
    // would throw, so a resolved result proves the paid path was skipped.
    const result = await decodeProduct('RTX 5090');
    expect(result.identity?.verified).toBeDefined();
    expect(result.identity?.priceIndicator?.estimatedPrice).toBe('$6,250');
  });
});
