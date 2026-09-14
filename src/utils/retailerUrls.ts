/**
 * Official Storefront Search & Deal URL Generator
 * Prevents 404 "Page Not Found" errors by routing to official search/catalog
 * endpoints for each major online storefront when direct SKU slugs are broken or expired.
 */

export function cleanSearchQuery(title: string, brand?: string, model?: string): string {
  // If we have brand and model, keep search clean and targeted
  let query = title;

  // Remove trailing parentheses or spec noise that causes 0-results in strict retail engines
  query = query
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[#,/\\+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return query;
}

export function getRetailerDealUrl(
  retailerName: string,
  productTitle: string,
  existingUrl?: string,
  brand?: string,
  model?: string
): string {
  const query = encodeURIComponent(cleanSearchQuery(productTitle, brand, model));
  const nameLower = (retailerName || '').toLowerCase().trim();

  // If existingUrl is already a verified search URL with a query param, it is safe to keep
  if (existingUrl) {
    const isSearchUrl = 
      existingUrl.includes('CatalogSearch') ||
      existingUrl.includes('searchpage.jsp') ||
      existingUrl.includes('SearchDisplay') ||
      existingUrl.includes('/search?') ||
      existingUrl.includes('/s?k=') ||
      existingUrl.includes('/s?searchTerm=') ||
      existingUrl.includes('searchresults.html') ||
      existingUrl.includes('/c/search?') ||
      existingUrl.includes('/p/pl?d=');

    if (isSearchUrl) {
      return existingUrl;
    }
  }

  // 1. Costco
  if (nameLower.includes('costco')) {
    return `https://www.costco.com/CatalogSearch?dept=All&keyword=${query}`;
  }

  // 2. Best Buy
  if (nameLower.includes('best buy') || nameLower === 'bestbuy') {
    return `https://www.bestbuy.com/site/searchpage.jsp?st=${query}`;
  }

  // 3. Walmart
  if (nameLower.includes('walmart')) {
    return `https://www.walmart.com/search?q=${query}`;
  }

  // 4. Target
  if (nameLower.includes('target')) {
    return `https://www.target.com/s?searchTerm=${query}`;
  }

  // 5. Amazon
  if (nameLower.includes('amazon')) {
    return `https://www.amazon.com/s?k=${query}`;
  }

  // 6. REI
  if (nameLower.includes('rei')) {
    return `https://www.rei.com/search?q=${query}`;
  }

  // 7. Bass Pro Shops
  if (nameLower.includes('bass pro') || nameLower === 'basspro') {
    return `https://www.basspro.com/shop/en/SearchDisplay?searchTerm=${query}`;
  }

  // 8. Cabela's
  if (nameLower.includes("cabela")) {
    return `https://www.cabelas.com/shop/en/SearchDisplay?searchTerm=${query}`;
  }

  // 9. Tackle Warehouse
  if (nameLower.includes('tackle warehouse') || nameLower === 'tacklewarehouse') {
    return `https://www.tacklewarehouse.com/searchresults.html?search=${query}`;
  }

  // 10. Backcountry
  if (nameLower.includes('backcountry')) {
    return `https://www.backcountry.com/Store/catalog/search.jsp?q=${query}`;
  }

  // 11. B&H Photo
  if (nameLower.includes('b&h') || nameLower.includes('bh photo') || nameLower === 'bh') {
    return `https://www.bhphotovideo.com/c/search?Ntt=${query}`;
  }

  // 12. Newegg
  if (nameLower.includes('newegg')) {
    return `https://www.newegg.com/p/pl?d=${query}`;
  }

  // 13. Home Depot
  if (nameLower.includes('home depot') || nameLower === 'homedepot') {
    return `https://www.homedepot.com/s/${query}`;
  }

  // 14. Micro Center
  if (nameLower.includes('micro center') || nameLower.includes('microcenter')) {
    return `https://www.microcenter.com/search/search_results.aspx?Ntt=${query}`;
  }

  // 15. Dick's Sporting Goods
  if (nameLower.includes('dick') || nameLower.includes('sporting goods')) {
    return `https://www.dickssportinggoods.com/search/SearchDisplay?searchTerm=${query}`;
  }

  // Default fallback to Google Shopping for verified live merchant pricing
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`${retailerName} ${cleanSearchQuery(productTitle, brand, model)}`)}`;
}
