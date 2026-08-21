/**
 * Price feed library — fetches live token prices from Coinbase (primary)
 * with Coingecko as fallback for tokens Coinbase doesn't list.
 *
 * Coinbase spot prices: https://api.coinbase.com/v2/prices/{SYMBOL}-USD/spot
 * Coingecko simple price: https://api.coingecko.com/api/v3/simple/price?ids={id}&vs_currencies=usd
 *
 * Symbol mapping: token symbol → Coinbase trading pair (or Coingecko ID as fallback)
 */

// Coinbase covers most major tokens directly by symbol
// For tokens not on Coinbase, map to Coingecko coin IDs
const COINGECKO_FALLBACK = {
  'cbBTC': 'coinbase-wrapped-btc',
  'bSOL': 'b-sol', // may not exist — will gracefully fail
  'mSOL': 'marinade-solana',
  'jitoSOL': 'jito-sol',
  'bSOL': 'b-sol',
};

// Stablecoins that are always ~$1 (no API call needed)
const STABLECOINS = {
  'USDC': 1.0, 'USDT': 1.0, 'DAI': 1.0, 'EURC': 1.09, 'USDe': 1.0,
  'USDs': 1.0, 'GHO': 1.0, 'crvUSD': 1.0, 'SUSDe': 1.0,
};

// Simple in-memory cache (avoids re-fetching same price during one session)
const priceCache = {};
const cacheTTL = 60000; // 1 minute

/**
 * Fetch the live USD price of a token by symbol.
 * @param {string} symbol - e.g. 'cbBTC', 'WETH', 'USDC', 'SOL'
 * @returns {Promise<number>} price in USD
 */
async function fetchPrice(symbol) {
  if (!symbol) return 0;

  // Check stablecoin table first
  if (STABLECOINS[symbol] !== undefined) return STABLECOINS[symbol];

  // Check cache
  const now = Date.now();
  if (priceCache[symbol] && now - priceCache[symbol].t < cacheTTL) {
    return priceCache[symbol].v;
  }

  // Try Coinbase first (fast, CORS-friendly)
  try {
    const resp = await fetch(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`);
    if (resp.ok) {
      const json = await resp.json();
      const price = parseFloat(json.data?.amount);
      if (price > 0) {
        priceCache[symbol] = { v: price, t: now };
        return price;
      }
    }
  } catch (e) { /* fall through to Coingecko */ }

  // Try Coingecko fallback for tokens not on Coinbase
  const cgId = COINGECKO_FALLBACK[symbol];
  if (cgId) {
    try {
      const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`);
      if (resp.ok) {
        const json = await resp.json();
        const price = json[cgId]?.usd;
        if (price > 0) {
          priceCache[symbol] = { v: price, t: now };
          return price;
        }
      }
    } catch (e) { /* give up */ }
  }

  // Last resort: if it's a wrapped token (wXXX, cbXXX), try the underlying
  if (symbol.startsWith('cb') || symbol.startsWith('w') || symbol.startsWith('W')) {
    const underlying = symbol.replace(/^(cb|w|W)/, '');
    if (underlying !== symbol) {
      return await fetchPrice(underlying);
    }
  }

  return 0; // unknown — liquidation price can't be computed
}

/**
 * Fetch prices for multiple symbols in parallel.
 * @param {Array<string>} symbols
 * @returns {Promise<Object>} { symbol: price }
 */
async function fetchPrices(symbols) {
  const unique = [...new Set(symbols.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async s => [s, await fetchPrice(s)])
  );
  return Object.fromEntries(entries);
}

// Expose as global
if (typeof window !== 'undefined') {
  window.fetchPrice = fetchPrice;
  window.fetchPrices = fetchPrices;
  window.STABLECOINS = STABLECOINS;
}
if (typeof module !== 'undefined') module.exports = { fetchPrice, fetchPrices, STABLECOINS };