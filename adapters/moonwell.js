/**
 * Moonwell adapter — reads live positions from api.moonwell.fi
 *
 * Supports: Base (8453), Optimism (10)
 * API is public, returns structured JSON.
 * Market list (all lendable/borrowable assets) fetched for the simulator.
 */

const MOONWELL_API = 'https://api.moonwell.fi/v1';
const MOONWELL_CHAINS = {
  8453: 'base',
  10: 'optimism',
};

// Moonwell's API whitelists specific origins and sends NO CORS header for github.io.
// cors.sh is a free CORS relay that sends Access-Control-Allow-Origin: * and
// doesn't rate-limit sequential requests (verified working from browser context).
const CORS_PROXY = 'https://proxy.cors.sh/';

/**
 * Fetch a Moonwell endpoint, routed through the CORS proxy.
 */
async function moonwellFetch(path) {
  const url = `${MOONWELL_API}${path}`;
  const r = await fetch(CORS_PROXY + url);
  if (!r.ok) throw new Error(`Moonwell proxy HTTP ${r.status}`);
  return await r.json();
}

/**
 * Fetch all available Moonwell markets (for the simulator's add-token dropdown).
 * Returns [{ asset, mToken, collateralFactor, deprecated }]
 */
async function fetchAvailableMarkets(chainId) {
  const chainParam = MOONWELL_CHAINS[chainId];
  if (!chainParam) return [];
  try {
    const resp = await moonwellFetch(`/markets?chain=${chainParam}`);
    if (!resp.success) return [];
    return (resp.data || [])
      .filter(m => !m.deprecated)
      .map(m => ({
        asset: m.asset,
        mToken: m.mToken,
        collateralFactor: m.collateralFactor,
        supplyApy: m.baseSupplyApy,
        borrowApy: m.baseBorrowApy,
      }));
  } catch (e) { return []; }
}

/**
 * Fetch a live Moonwell position.
 * @param {string} wallet - EVM address (0x...)
 * @param {number} chainId - 8453 or 10
 * @returns {Promise<object>} normalized position shape
 */
async function fetchPosition(wallet, chainId) {
  const chainParam = MOONWELL_CHAINS[chainId];
  if (!chainParam) throw new Error(`Moonwell not available on chain ${chainId}`);

  // Fetch health, positions, and market list. cors.sh doesn't rate-limit
  // so we can fire these in parallel.
  const [healthResp, positionsResp, marketsResp] = await Promise.all([
    moonwellFetch(`/health/${wallet}?chain=${chainParam}`),
    moonwellFetch(`/positions/${wallet}?chain=${chainParam}&active=true`),
    moonwellFetch(`/markets?chain=${chainParam}`).catch(() => null),
  ]);

  if (!healthResp.success) throw new Error(healthResp.error || 'Moonwell API error');
  const health = healthResp.data;

  if (!positionsResp.success) throw new Error(positionsResp.error || 'Moonwell positions error');
  const positions = positionsResp.data || [];

  // Build available markets list for simulator
  let availableMarkets = [];
  if (marketsResp && marketsResp.success) {
    availableMarkets = (marketsResp.data || [])
      .filter(m => !m.deprecated)
      .map(m => ({
        asset: m.asset,
        mToken: m.mToken,
        collateralFactor: m.collateralFactor,
      }));
  }

  // Build collaterals (markets with supply > 0)
  const collaterals = positions
    .filter(p => p.suppliedUsd > 0)
    .map(p => ({
      asset: p.market,
      suppliedUsd: p.suppliedUsd,
      collateralFactor: p.collateralUsd > 0 ? p.collateralUsd / p.suppliedUsd : 0,
      adjustedUsd: p.collateralUsd || 0,
      price: 0, // filled by app.js after price fetch
    }));

  // Build borrows (markets with borrow > 0)
  const borrows = positions
    .filter(p => p.borrowedUsd > 0)
    .map(p => ({
      asset: p.market,
      borrowedUsd: p.borrowedUsd,
      price: 0,
    }));

  return {
    protocol: 'moonwell',
    chain: chainParam,
    chainId,
    healthFactor: health.healthFactor,
    totalSuppliedUsd: health.totalSupplyUsd,
    totalBorrowedUsd: health.totalBorrowUsd,
    totalCollateralUsd: health.totalCollateralUsd,
    marketCount: health.marketCount,
    collaterals,
    borrows,
    availableMarkets,
    liquidationPrices: [],
    raw: { health, positions },
  };
}

// Expose as global for browser script-tag loading
if (typeof window !== 'undefined') {
  window.MoonwellAdapter = { fetchPosition, fetchAvailableMarkets, MOONWELL_CHAINS };
}
if (typeof module !== 'undefined') module.exports = { fetchPosition, fetchAvailableMarkets, MOONWELL_CHAINS };