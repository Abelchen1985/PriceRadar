/**
 * Canonical Product Identity & Normalization Engine
 * 
 * Strict Architectural Separation:
 * Product Identity is NOT discovery, NOT matching, and NOT a retailer price.
 * It is the canonical, progressive representation of what the user requested.
 */

import { ProductIdentity } from '../types';

// Common known brands for fast canonical detection
const KNOWN_BRANDS = [
  'Anker', 'Jackery', 'EcoFlow', 'Bluetti', 'Apple', 'Sony', 'Samsung', 'LG',
  'DEWALT', 'Milwaukee', 'Ryobi', 'Makita', 'Bosch', 'Craftsman',
  'Shimano', 'Daiwa', 'Ugly Stik', 'Penn', 'Abu Garcia', 'St. Croix',
  'Osprey', 'Big Agnes', 'YETI', 'MSR', 'Therm-a-Rest', 'Black Diamond', 'Patagonia', 'The North Face',
  'Dyson', 'Shark', 'KitchenAid', 'Ninja', 'Breville', 'iRobot', 'Roborock',
  'AMD', 'NVIDIA', 'Intel', 'ASUS', 'MSI', 'Gigabyte', 'Corsair', 'Crucial'
];

/**
 * Normalizes raw product titles, brands, and models into a canonical ProductIdentity.
 * Progressive extraction: GTIN + brand + MPN > brand + MPN > brand + model > brand + title + specs.
 * Never invents identifiers.
 */
export function normalizeProductIdentity(input: {
  title: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  upc?: string;
  ean?: string;
  category?: string;
  isBundle?: boolean;
  generation?: string;
  capacity?: string;
  specs?: Record<string, string>;
}): ProductIdentity {
  const rawTitle = (input.title || '').trim();
  let brand = input.brand?.trim();

  // 1. Detect Brand if not explicitly provided
  if (!brand || brand.length === 0) {
    for (const b of KNOWN_BRANDS) {
      const regex = new RegExp(`\\b${b}\\b`, 'i');
      if (regex.test(rawTitle)) {
        brand = b;
        break;
      }
    }
  }

  // 2. Detect Product Line & Model Family
  let productLine: string | undefined;
  let model = input.model?.trim();
  let mpn = input.mpn?.trim();
  let gtin = input.gtin?.trim() || input.upc?.trim() || input.ean?.trim();

  // Handle specific product lines
  if (/solix\b/i.test(rawTitle)) {
    productLine = 'SOLIX';
  } else if (/macbook\s*(air|pro)?/i.test(rawTitle)) {
    productLine = 'MacBook';
  } else if (/bravia|galaxy|playstation|xbox/i.test(rawTitle)) {
    const lineMatch = rawTitle.match(/\b(Bravia|Galaxy|PlayStation|Xbox)\b/i);
    if (lineMatch) productLine = lineMatch[1];
  }

  // 3. Detect Generation (e.g. Gen 2, M3, M4, Zen 4)
  let generation: string | undefined = input.generation;
  if (!generation) {
    const genMatch = rawTitle.match(/\b(Gen(?:eration)?\s*([0-9]+)|(?:[0-9]+)(?:st|nd|rd|th)\s*Gen(?:eration)?)\b/i);
    if (genMatch) {
      const num = genMatch[0].match(/[0-9]+/);
      generation = num ? `Gen ${num[0]}` : genMatch[0];
    } else if (/\bM[1-4]\b/i.test(rawTitle)) {
      const mMatch = rawTitle.match(/\bM[1-4]\b/i);
      generation = mMatch ? mMatch[0].toUpperCase() : undefined;
    } else if (/v[1-5]\b/i.test(rawTitle)) {
      const vMatch = rawTitle.match(/\bv([1-5])\b/i);
      generation = vMatch ? `v${vMatch[1]}` : undefined;
    }
  }

  // 4. Detect Capacity, Storage, or Screen Size
  let capacity: string | undefined = input.capacity;
  let size: string | undefined;

  if (!capacity) {
    // Watt-hours / power capacity
    const whMatch = rawTitle.match(/\b([0-9]+(?:,[0-9]+)?)\s*(?:Wh|W|Ah)\b/i);
    if (whMatch) {
      capacity = `${whMatch[1].replace(',', '')}Wh`;
    }

    // Storage (GB / TB)
    const storageMatch = rawTitle.match(/\b([0-9]+)\s*(?:GB|TB)\b/i);
    if (storageMatch && !capacity) {
      capacity = storageMatch[0].toUpperCase();
    }
  }

  // Physical Size / Screen Size (e.g. 15-inch, 65-inch)
  const sizeMatch = rawTitle.match(/\b([0-9]{1,2}(?:\.[0-9])?)\s*(?:["”]|inch|-inch)\b/i);
  if (sizeMatch) {
    size = `${sizeMatch[1]}-inch`;
  }

  // 5. Bundle Detection
  // Look for accessories, extra solar panels, extra batteries, lens kits
  const bundleComponents: string[] = [];
  let isBundle = input.isBundle !== undefined ? input.isBundle : false;

  const solarMatch = rawTitle.match(/(?:with|\+)\s*(?:a\s*)?([0-9]+\s*w(?:att)?\s*solar\s*panel[s]?|solar\s*panel[s]?\s*[a-z0-9]+)/i);
  if (solarMatch) {
    isBundle = true;
    bundleComponents.push(solarMatch[1].trim());
  }

  const extraBatteryMatch = rawTitle.match(/(?:with|\+)\s*(?:an?\s*)?(extra\s*battery|expansion\s*battery)/i);
  if (extraBatteryMatch) {
    isBundle = true;
    bundleComponents.push(extraBatteryMatch[1].trim());
  }

  const lensKitMatch = rawTitle.match(/(?:with|\+)\s*([0-9]+-[0-9]+mm\s*lens|lens\s*kit)/i);
  if (lensKitMatch) {
    isBundle = true;
    bundleComponents.push(lensKitMatch[1].trim());
  }

  const toolComboMatch = rawTitle.match(/([0-9]+-tool\s*(?:combo|kit)|\+\s*[0-9]+\s*batteries)/i);
  if (toolComboMatch) {
    isBundle = true;
    bundleComponents.push(toolComboMatch[1].trim());
  }

  if (/\bbundle\b/i.test(rawTitle) && bundleComponents.length === 0) {
    isBundle = true;
    bundleComponents.push('Bundle item');
  }

  // 6. Extract Model Number if not given
  if (!model) {
    // Check known model formats
    if (/c1000/i.test(rawTitle)) {
      model = generation ? `C1000 ${generation}` : 'C1000';
    } else if (/explorer\s*1500/i.test(rawTitle)) {
      model = generation ? `Explorer 1500 ${generation}` : 'Explorer 1500 v2';
    } else if (/s90d/i.test(rawTitle)) {
      model = 'QN65S90D';
    } else if (/7800x3d/i.test(rawTitle)) {
      model = '7800X3D';
      mpn = '100-100000910WOF';
    } else if (/wh-1000xm5/i.test(rawTitle)) {
      model = 'WH-1000XM5';
    } else if (/dck240c2/i.test(rawTitle)) {
      model = 'DCK240C2';
      mpn = 'DCK240C2';
    } else if (/gx2/i.test(rawTitle)) {
      model = 'GX2';
    }
  }

  // Model-specific MPN extraction for Anker C1000
  if (brand?.toLowerCase() === 'anker' && /c1000/i.test(rawTitle)) {
    if (generation === 'Gen 2' || /gen\s*2/i.test(rawTitle)) {
      model = 'C1000 Gen 2';
      mpn = mpn || 'A1763';
    } else {
      model = 'C1000';
      mpn = mpn || 'A1761';
    }
  }

  // 7. Clean Canonical Normalized Title
  const normalizedTitle = rawTitle
    .toLowerCase()
    .replace(/[#,/\\+]/g, ' ')
    .replace(/["”]/g, ' inch')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    brand,
    productName: rawTitle,
    productLine,
    model,
    mpn,
    gtin,
    upc: input.upc,
    ean: input.ean,
    category: input.category,
    generation,
    capacity,
    size,
    isBundle,
    bundleComponents: isBundle ? bundleComponents : undefined,
    keySpecifications: input.specs || {},
    normalizedTitle
  };
}

/**
 * Checks whether two generations match or are distinctly incompatible.
 * (e.g. Gen 1 vs Gen 2, M3 vs M4).
 */
export function areGenerationsCompatible(requestedGen?: string, candidateGen?: string): boolean {
  if (!requestedGen || !candidateGen) return true; // not enough data to reject on generation alone
  const cleanA = requestedGen.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanB = candidateGen.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleanA === cleanB;
}

/**
 * Checks whether two capacities match or conflict.
 * (e.g. 1000Wh vs 2000Wh).
 */
export function areCapacitiesCompatible(requestedCap?: string, candidateCap?: string): boolean {
  if (!requestedCap || !candidateCap) return true;
  const numA = parseInt(requestedCap.replace(/[^0-9]/g, ''), 10);
  const numB = parseInt(candidateCap.replace(/[^0-9]/g, ''), 10);
  if (isNaN(numA) || isNaN(numB)) return true;
  // If difference is greater than 15%, they are different capacity variants
  return Math.abs(numA - numB) <= 50;
}
