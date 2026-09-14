export type CommonRetailer = 
  | 'Amazon' 
  | 'Walmart' 
  | 'Target' 
  | 'Best Buy' 
  | 'B&H Photo' 
  | 'Home Depot' 
  | 'Newegg' 
  | 'eBay' 
  | 'Micro Center' 
  | 'Costco' 
  | 'Apple' 
  | 'Nike' 
  | string;

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
}

export interface PriceHistoryPoint {
  date: string;
  amazon?: number;
  bestBuy?: number;
  newegg?: number;
  bh?: number;
  microcenter?: number;
  walmart?: number;
  target?: number;
  lowest: number;
}

export type ItemCategory = 
  | 'Audio & Headphones'
  | 'Gaming & Consoles'
  | 'Home & Kitchen'
  | 'Appliances'
  | 'Smartphones & Tablets'
  | 'Laptops & Computers'
  | 'Smart Home'
  | 'Tools & Hardware'
  | 'Fashion & Apparel'
  | 'TV & Home Theater'
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
