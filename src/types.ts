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

export type ProductMatchStatus = 'verified_exact' | 'unverified_search';
export type RetailerUrlType = 'direct_product' | 'catalog_search';

export interface RetailerPrice {
  id: string;
  retailerName: CommonRetailer;
  url: string;
  price: number;
  originalPrice?: number;
  inStock: boolean;
  stockMessage: string;
  shipping: string;
  shippingCost: number;
  promoCode?: string;
  rebate?: number;
  rating: number;
  reviewCount: number;
  isBestPrice?: boolean;
  productMatchVerified?: boolean;
  matchStatus?: ProductMatchStatus;
  urlType?: RetailerUrlType;
  directSku?: string;
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
