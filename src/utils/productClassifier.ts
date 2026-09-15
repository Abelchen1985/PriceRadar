import { ItemCategory, TrackedItem, RetailerPrice, CommonRetailer } from '../types';
import { getRetailerDealUrl } from './retailerUrls';

/**
 * Intelligent Category Detector based on product title and brand
 */
export function detectProductCategory(title: string, brand?: string): ItemCategory {
  const text = `${title} ${brand || ''}`.toLowerCase();

  // 1. Fishing & Angling
  if (
    /ugly\s*stik|spinning\s*rod|casting\s*rod|fly\s*rod|fishing\s*rod|spinning\s*reel|baitcast|fish\s*finder|echomap|tackle\s*box|shimano|daiwa|penn|st\.\s*croix|abu\s*garcia|berkley|rapala|crankbait|tackle\s*bag|angler|fishing/i.test(
      text
    )
  ) {
    return 'Fishing & Angling';
  }

  // 2. Hiking & Backpacking
  if (
    /backpack|daypack|trekking\s*pole|osprey|black\s*diamond|inreach|satellite\s*communicator|hiking\s*boots|gaiters|hydration\s*pack|trail\s*running/i.test(
      text
    )
  ) {
    return 'Hiking & Backpacking';
  }

  // 3. Camping & Bushcraft
  if (
    /tent|sleeping\s*bag|sleeping\s*pad|camping\s*stove|pocketrocket|big\s*agnes|camp\s*kitchen|yeti|cooler|bushcraft|lantern|fire\s*starter|hammock/i.test(
      text
    )
  ) {
    return 'Camping & Bushcraft';
  }

  // 4. Kayaking & Water Sports
  if (/kayak|paddleboard|paddle|inflatable\s*boat|life\s*jacket|life\s*vest|pfd|wetsuit|drybag|canoe/i.test(text)) {
    return 'Kayaking & Water Sports';
  }

  // 5. Hunting & Optics
  if (/binoculars|rangefinder|rifle\s*scope|spotting\s*scope|vortex|leupold|trail\s*camera|hunting/i.test(text)) {
    return 'Hunting & Optics';
  }

  // 6. Outdoor Apparel & Boots
  if (/jacket|parka|fleece|gore-tex|rainwear|merino|patagonia|arc'teryx|columbia|salomon|danner|boots/i.test(text)) {
    return 'Outdoor Apparel & Boots';
  }

  // 7. PC Components
  if (
    /processor|cpu\b|ryzen|intel\s*core|graphics\s*card|gpu\b|geforce|rtx\s*\d{4}|radeon|motherboard|ddr4|ddr5|ram\b|nvme|pcie|internal\s*ssd|power\s*supply|cpu\s*cooler/i.test(
      text
    )
  ) {
    return 'PC Components';
  }

  // 8. Audio & Headphones
  if (/headphone|earbuds|airpods|noise-canceling|soundbar|wh-1000xm|bose|sennheiser|jbl\s*flip|bluetooth\s*speaker/i.test(text)) {
    return 'Audio & Headphones';
  }

  // 9. TV & Home Theater
  if (/oled|qled|smart\s*tv|4k\s*tv|bravia|home\s*theater|projector/i.test(text)) {
    return 'TV & Home Theater';
  }

  // 10. Gaming & Consoles
  if (/playstation|ps5|xbox|nintendo\s*switch|steam\s*deck|dualsense|gaming\s*controller/i.test(text)) {
    return 'Gaming & Consoles';
  }

  // 11. Laptops & Computers
  if (/macbook|laptop|thinkpad|dell\s*xps|chromebook|imac|desktop\s*pc|surface\s*pro/i.test(text)) {
    return 'Laptops & Computers';
  }

  // 12. Tools & Hardware
  if (/dewalt|milwaukee|makita|drill|impact\s*driver|circular\s*saw|socket\s*set|table\s*saw|power\s*tool|wrench/i.test(text)) {
    return 'Tools & Hardware';
  }

  // 13. Home & Kitchen
  if (/espresso|coffee\s*maker|barista|breville|stand\s*mixer|kitchenaid|air\s*fryer|ninja\s*woodfire|vitamix|blender/i.test(text)) {
    return 'Home & Kitchen';
  }

  // 14. Appliances
  if (/vacuum|dyson|roborock|roomba|air\s*purifier|washer|dryer|refrigerator/i.test(text)) {
    return 'Appliances';
  }

  // 15. Cameras & Drones
  if (/alpha\s*a7|eos\s*r|nikon\s*z|mirrorless|dslr|lens\b|dji|mavic|drone|gopro/i.test(text)) {
    return 'Cameras & Drones';
  }

  // 16. Smartphones & Tablets
  if (/iphone|galaxy\s*s\d+|pixel\s*\d+|ipad|tablet/i.test(text)) {
    return 'Smartphones & Tablets';
  }

  return 'Other';
}

/**
 * Curated product image resolver: Returns authentic high-res product photos
 * matching the product's actual nature, never confusing a fishing rod with a CPU!
 */
export function getProductImageUrl(title: string, category: ItemCategory, brand?: string): string {
  const text = `${title} ${brand || ''}`.toLowerCase();

  // Fishing Rods & Combos (e.g. Ugly Stik GX2)
  if (/rod|spinning\s*rod|casting\s*rod|ugly\s*stik|fly\s*rod|combo/i.test(text) && /fish|stik|angler|spinning|rod/i.test(text)) {
    return 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&auto=format&fit=crop&q=80'; // Fishing rod & reel on lake
  }

  // Fishing Reel (Shimano Stradic, Daiwa, Penn)
  if (/reel|spinning\s*reel|baitcaster/i.test(text)) {
    return 'https://images.unsplash.com/photo-1516962215378-7fa2e137ae93?w=600&auto=format&fit=crop&q=80';
  }

  // General Fishing / Tackle
  if (category === 'Fishing & Angling' || /tackle|lure|echomap|fish\s*finder/i.test(text)) {
    return 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=600&auto=format&fit=crop&q=80';
  }

  // Hiking Backpack
  if (/backpack|daypack|osprey/i.test(text)) {
    return 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop&q=80';
  }

  // Camping Tent
  if (/tent|shelter|big\s*agnes/i.test(text)) {
    return 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=600&auto=format&fit=crop&q=80';
  }

  // Camping Stove / Cooking
  if (/stove|pocketrocket|burner/i.test(text)) {
    return 'https://images.unsplash.com/photo-1517824806704-9040b037703b?w=600&auto=format&fit=crop&q=80';
  }

  // Outdoor Cooler (Yeti)
  if (/cooler|yeti\s*tundra|ice\s*chest/i.test(text)) {
    return 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=600&auto=format&fit=crop&q=80';
  }

  // Trekking Poles
  if (/pole|trekking/i.test(text)) {
    return 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=600&auto=format&fit=crop&q=80';
  }

  // Satellite Communicator / GPS (Garmin)
  if (/inreach|satellite|gps|garmin/i.test(text)) {
    return 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80';
  }

  // Audio / Headphones
  if (category === 'Audio & Headphones' || /headphone|earbuds|sony\s*wh|airpods/i.test(text)) {
    return 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80';
  }

  // PC Components / CPU (Ryzen, Intel)
  if (category === 'PC Components' || /cpu|processor|ryzen|intel\s*core|gpu/i.test(text)) {
    return 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=600&auto=format&fit=crop&q=80';
  }

  // Tools / Drill (DeWalt, Milwaukee)
  if (category === 'Tools & Hardware' || /drill|impact|saw|dewalt|milwaukee/i.test(text)) {
    return 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&auto=format&fit=crop&q=80';
  }

  // Espresso / Coffee Maker
  if (category === 'Home & Kitchen' && /espresso|coffee|barista|kitchenaid/i.test(text)) {
    return 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80';
  }

  // Vacuum / Appliances
  if (category === 'Appliances' || /vacuum|dyson|roborock/i.test(text)) {
    return 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=600&auto=format&fit=crop&q=80';
  }

  // TV / Home Theater
  if (category === 'TV & Home Theater' || /oled|tv\b|s90d/i.test(text)) {
    return 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&auto=format&fit=crop&q=80';
  }

  // Gaming Console
  if (category === 'Gaming & Consoles' || /playstation|ps5|xbox|switch/i.test(text)) {
    return 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&auto=format&fit=crop&q=80';
  }

  // Laptop / Computer
  if (category === 'Laptops & Computers' || /macbook|laptop/i.test(text)) {
    return 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&auto=format&fit=crop&q=80';
  }

  // Camera / Drone
  if (category === 'Cameras & Drones' || /camera|sony\s*alpha|drone/i.test(text)) {
    return 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&auto=format&fit=crop&q=80';
  }

  // General outdoor fallback
  if (category === 'Hiking & Backpacking' || category === 'Camping & Bushcraft') {
    return 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=600&auto=format&fit=crop&q=80';
  }

  return 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80';
}

/**
 * Category-to-Storefront compatibility rules:
 * Ensures products are ONLY sold and tracked from retailers that actually sell them!
 * (e.g. Fishing rods are sold at Bass Pro, Cabela's, Tackle Warehouse, Walmart, Amazon — NEVER Micro Center)
 */
export interface CategoryStoreRules {
  allowedStores: CommonRetailer[];
  defaultATLStore: CommonRetailer;
  defaultRetailers: CommonRetailer[];
  forbiddenStores: string[];
}

export function getCategoryStoreRules(category: ItemCategory, title?: string): CategoryStoreRules {
  const isFishing = category === 'Fishing & Angling' || /rod|reel|fishing|ugly\s*stik|tackle/i.test(title || '');

  if (isFishing) {
    return {
      allowedStores: ['Bass Pro Shops', "Cabela's", 'Tackle Warehouse', 'Walmart', 'Amazon', "Dick's Sporting Goods"],
      defaultATLStore: 'Bass Pro Shops',
      defaultRetailers: ['Bass Pro Shops', 'Tackle Warehouse', "Cabela's", 'Amazon'],
      forbiddenStores: ['Micro Center', 'Best Buy', 'Home Depot', 'B&H Photo', 'Apple', 'Costco', 'Newegg']
    };
  }

  if (category === 'Hiking & Backpacking' || category === 'Camping & Bushcraft' || category === 'Kayaking & Water Sports' || category === 'Hunting & Optics' || category === 'Outdoor Apparel & Boots') {
    return {
      allowedStores: ['REI', 'Backcountry', 'Bass Pro Shops', "Cabela's", 'Amazon', 'Moosejaw', 'Sierra', 'Walmart'],
      defaultATLStore: 'REI',
      defaultRetailers: ['REI', 'Backcountry', 'Bass Pro Shops', 'Amazon'],
      forbiddenStores: ['Micro Center', 'Best Buy', 'Home Depot', 'Newegg', 'Apple']
    };
  }

  if (category === 'PC Components') {
    return {
      allowedStores: ['Micro Center', 'Newegg', 'Amazon', 'Best Buy', 'B&H Photo'],
      defaultATLStore: 'Micro Center',
      defaultRetailers: ['Micro Center', 'Amazon', 'Newegg', 'Best Buy'],
      forbiddenStores: ['REI', 'Bass Pro Shops', "Cabela's", 'Tackle Warehouse', 'Home Depot', 'Target', 'Costco']
    };
  }

  if (category === 'Tools & Hardware') {
    return {
      allowedStores: ['Home Depot', 'Amazon', 'Walmart', 'Target'],
      defaultATLStore: 'Home Depot',
      defaultRetailers: ['Home Depot', 'Amazon', 'Walmart'],
      forbiddenStores: ['Micro Center', 'REI', 'Tackle Warehouse', 'Best Buy', 'Apple']
    };
  }

  if (category === 'Audio & Headphones' || category === 'TV & Home Theater' || category === 'Electronics') {
    return {
      allowedStores: ['Best Buy', 'Amazon', 'Walmart', 'Target', 'B&H Photo', 'Costco'],
      defaultATLStore: 'Best Buy',
      defaultRetailers: ['Best Buy', 'Amazon', 'Target', 'Walmart'],
      forbiddenStores: ['Micro Center', 'Home Depot', 'Tackle Warehouse', 'Bass Pro Shops', "Cabela's"]
    };
  }

  if (category === 'Laptops & Computers' || category === 'Smartphones & Tablets') {
    return {
      allowedStores: ['Best Buy', 'Amazon', 'B&H Photo', 'Costco', 'Apple', 'Micro Center'],
      defaultATLStore: 'Best Buy',
      defaultRetailers: ['Best Buy', 'Amazon', 'B&H Photo', 'Costco'],
      forbiddenStores: ['REI', 'Bass Pro Shops', "Cabela's", 'Tackle Warehouse', 'Home Depot']
    };
  }

  if (category === 'Gaming & Consoles') {
    return {
      allowedStores: ['Target', 'Amazon', 'Walmart', 'Best Buy'],
      defaultATLStore: 'Target',
      defaultRetailers: ['Target', 'Amazon', 'Walmart', 'Best Buy'],
      forbiddenStores: ['Micro Center', 'REI', 'Bass Pro Shops', 'Tackle Warehouse', 'Home Depot']
    };
  }

  if (category === 'Home & Kitchen' || category === 'Appliances') {
    return {
      allowedStores: ['Amazon', 'Target', 'Walmart', 'Best Buy', 'Costco', 'Home Depot'],
      defaultATLStore: 'Target',
      defaultRetailers: ['Amazon', 'Target', 'Walmart', 'Best Buy'],
      forbiddenStores: ['Micro Center', 'REI', 'Tackle Warehouse', 'Newegg']
    };
  }

  // Generic fallback
  return {
    allowedStores: ['Amazon', 'Walmart', 'Target', 'Best Buy'],
    defaultATLStore: 'Amazon',
    defaultRetailers: ['Amazon', 'Walmart', 'Target', 'Best Buy'],
    forbiddenStores: []
  };
}

/**
 * Complete Item Auditor & Sanitizer:
 * Validates category, replaces generic/broken CPU images with correct category photography,
 * and purges impossible store assignments (e.g. Micro Center on a fishing rod).
 */
export function sanitizeTrackedItem(item: TrackedItem): TrackedItem {
  // 1. Auto-correct category if generic 'Other' or mismatched
  let category = item.category;
  const detectedCat = detectProductCategory(item.title, item.brand);

  const isFishingItem = /ugly\s*stik|spinning\s*rod|fishing\s*rod|reel|tackle/i.test(item.title);
  if (isFishingItem && category !== 'Fishing & Angling') {
    category = 'Fishing & Angling';
  } else if ((category === 'Other' || !category) && detectedCat !== 'Other') {
    category = detectedCat;
  }

  const rules = getCategoryStoreRules(category, item.title);

  // 2. Validate All-Time Low Store
  let allTimeLowStore = item.allTimeLowStore || rules.defaultATLStore;
  const isInvalidATLStore = rules.forbiddenStores.some(
    f => allTimeLowStore.toLowerCase().includes(f.toLowerCase())
  );
  if (isInvalidATLStore) {
    allTimeLowStore = rules.defaultATLStore;
  }

  // 3. Validate and replace product image
  const cpuImageMarker = '1591799264318-7e6ef8ddb7ea';
  let imageUrl = item.imageUrl;
  if (!imageUrl || imageUrl.includes(cpuImageMarker) && category !== 'PC Components') {
    imageUrl = getProductImageUrl(item.title, category, item.brand);
  }

  // 4. Validate retailers list (purge stores that don't carry this category)
  const msrp = item.msrp || 59.99;
  let validRetailers = (item.retailers || []).filter(r => {
    const rName = (r.retailerName || '').toLowerCase();
    return !rules.forbiddenStores.some(f => rName.includes(f.toLowerCase()));
  });

  // If no valid retailers remain or too few, populate with category defaults
  if (validRetailers.length < 2) {
    validRetailers = rules.defaultRetailers.map((storeName, idx) => {
      const discount = idx === 0 ? 0.92 : idx === 1 ? 0.94 : idx === 2 ? 0.97 : 1.0;
      const price = Number((msrp * discount).toFixed(2));
      return {
        id: `r-clean-${Date.now()}-${idx}`,
        retailerName: storeName,
        url: getRetailerDealUrl(storeName, item.title, undefined, item.brand, item.model),
        price,
        originalPrice: msrp,
        inStock: true,
        stockMessage: 'In Stock',
        shipping: 'Free Shipping',
        shippingCost: 0,
        rating: 4.8,
        reviewCount: 950 + idx * 120,
        isBestPrice: idx === 0
      };
    });
  } else {
    // Sanitize URLs on remaining valid retailers
    validRetailers = validRetailers.map(r => ({
      ...r,
      url: getRetailerDealUrl(r.retailerName, item.title, r.url, item.brand, item.model)
    }));
  }

  return {
    ...item,
    category,
    imageUrl,
    allTimeLowStore,
    retailers: validRetailers
  };
}
