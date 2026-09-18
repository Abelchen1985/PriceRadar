export type CommonRetailer = 
  | 'Amazon' 
  | 'Walmart' 
  | 'Target' 
  | 'Best Buy' 
  | 'REI'
  | 'Bass Pro Shops'
  | "Cabela's"
  | 'Backcountry'
  | 'Tackle Warehouse'
  | 'Dick\'s Sporting Goods'
  | 'Moosejaw'
  | 'Sierra'
  | 'B&H Photo' 
  | 'Home Depot' 
  | 'Newegg' 
  | 'eBay' 
  | 'Micro Center' 
  | 'Costco' 
  | 'Apple' 
  | 'Nike' 
  | 'Patagonia'
  | 'Columbia'
  | string;

export type LinkType = 'verified_product' | 'search_results' | 'unknown';
export type MatchStatus = 'exact' | 'strong' | 'probable' | 'search_only' | 'wrong_product' | 'not_found';
export type ProductMatchStatus = 'verified_exact' | 'unverified_search' | 'not_stocked';
export type RetailerUrlType = 'direct_product' | 'catalog_search';

export interface ProductIdentity {
  brand?: string;
  productName: string;
  productLine?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  upc?: string;
  ean?: string;
  category?: string;
  variant?: string;
  capacity?: string;
  color?: string;
  size?: string;
  generation?: string;
  bundleComponents?: string[];
  isBundle?: boolean;
  keySpecifications?: Record<string, string>;
  normalizedTitle: string;
}

export interface RetailerCandidate {
  retailer: string;
  url: string;
  title?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  sku?: string;
  price?: number;
  currency?: string;
  availability?: string;
  snippet?: string;
  sourceType: 'search' | 'shopping' | 'retailer_page' | 'structured_data';
  discoveredAt: string;
  isBundle?: boolean;
  bundleItems?: string[];
  generation?: string;
  capacity?: string;
}

export interface ProductMatchResult {
  status: MatchStatus;
  confidence: number;
  reasons: string[];
  matchedIdentifiers: string[];
  mismatches: string[];
  isBundleMismatch?: boolean;
  isGenerationMismatch?: boolean;
  isCapacityMismatch?: boolean;
}

export interface VerifiedPrice {
  retailer: string;
  price: number | null;
  currency: string;
  url: string;
  linkType: LinkType;
  productMatch: ProductMatchResult;
  source: 'retailer_page' | 'structured_data' | 'shopping_result' | 'trusted_search_result' | 'verified_catalog';
  observedAt: string;
  priceVerified: boolean;
  productVerified: boolean;
  directSku?: string;
  inStock?: boolean;
  stockMessage?: string;
  shipping?: string;
  shippingCost?: number;
  evidence?: {
    title?: string;
    productId?: string;
    priceText?: string;
    availabilityText?: string;
    matchingNotes?: string;
  };
}

export interface ProductRecord {
  id: string;
  canonicalTitle: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  category?: string;
  identifiers: {
    retailer: string;
    retailerProductId?: string;
    url?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface DebugTrace {
  normalizedIdentity: ProductIdentity;
  queriesRun: string[];
  candidatesFound: number;
  matches: Array<{
    retailer: string;
    candidateUrl: string;
    matchStatus: MatchStatus;
    confidence: number;
    matchedIdentifiers: string[];
    mismatches: string[];
    reasons: string[];
  }>;
  rejectedRetailers: Array<{
    retailer: string;
    reason: string;
  }>;
  observedAt: string;
}

export interface RetailerPrice {
  id: string;
  retailerName: CommonRetailer;
  title?: string;
  url: string;
  price: number | null;
  originalPrice?: number;
  inStock: boolean;
  stockMessage: string;
  shipping: string;
  shippingCost: number;
  promoCode?: string;
  rebate?: number;
  rating?: number | null;
  reviewCount?: number | null;
  isBestPrice?: boolean;
  productMatchVerified?: boolean;
  matchStatus?: ProductMatchStatus;
  urlType?: RetailerUrlType;
  directSku?: string;
  linkType?: LinkType;
  matchStatusDetailed?: MatchStatus;
  confidence?: number;
  priceVerified?: boolean;
  observedAt?: string;
  evidence?: {
    title?: string;
    productId?: string;
    priceText?: string;
    availabilityText?: string;
    matchingNotes?: string;
  };
}

export interface PriceHistoryPoint {
  date: string;
  amazon?: number;
  bestBuy?: number;
  rei?: number;
  bassPro?: number;
  cabelas?: number;
  backcountry?: number;
  tackleWarehouse?: number;
  walmart?: number;
  target?: number;
  newegg?: number;
  bh?: number;
  microcenter?: number;
  lowest: number;
  [key: string]: string | number | undefined;
}

export type ItemCategory = 
  | 'Hiking & Backpacking'
  | 'Fishing & Angling'
  | 'Camping & Bushcraft'
  | 'Outdoor Apparel & Boots'
  | 'Kayaking & Water Sports'
  | 'Hunting & Optics'
  | 'Audio & Headphones'
  | 'Gaming & Consoles'
  | 'Home & Kitchen'
  | 'Appliances'
  | 'Smartphones & Tablets'
  | 'Laptops & Computers'
  | 'Smart Home'
  | 'Tools & Hardware'
  | 'Cameras & Drones'
  | 'PC Components'
  | 'Electronics'
  | 'Other'
  | string;

export interface EmailRecipient {
  id: string;
  email: string;
  label: string;
  isDefault?: boolean;
}

export interface TrackedItem {
  id: string;
  title: string;
  category: ItemCategory;
  brand: string;
  model: string;
  imageUrl: string;
  msrp: number;
  allTimeLow: number;
  allTimeLowDate: string;
  allTimeLowStore: string;
  targetPrice: number;
  emailAlertEnabled: boolean;
  userEmail: string;
  alertEmails?: string[];
  alertCondition: 'below_target' | 'all_time_low' | 'any_drop';
  retailers: RetailerPrice[];
  priceHistory: PriceHistoryPoint[];
  lastUpdated: string;
  isCustom?: boolean;
}

export interface DealOptimizationResult {
  singleStoreTotals: {
    [retailer: string]: {
      total: number;
      itemCount: number;
      shipping: number;
      finalTotal: number;
    };
  };
  optimalCombo: {
    items: {
      itemId: string;
      itemTitle: string;
      retailer: string;
      price: number;
      shipping: number;
      inStock: boolean;
      url: string;
    }[];
    totalCost: number;
    singleStoreBestTotal: number;
    bestSingleStoreName: string;
    totalSavings: number;
    savingsPercent: number;
    storeCount: number;
  };
}

export interface AlertLog {
  id: string;
  timestamp: string;
  email: string;
  itemTitle: string;
  oldPrice: number;
  newPrice: number;
  dropPercent: number;
  allTimeLow: number;
  isAllTimeLow: boolean;
  retailer: string;
  retailerUrl: string;
  triggerReason: string;
  status: 'sent' | 'delivered';
}
