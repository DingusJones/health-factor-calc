/**
 * Moonwell adapter — reads live positions from api.moonwell.fi
 *
 * Supports: Base (8453), Optimism (10)
 * API is public, returns structured JSON.
 *
 * To add a new chain to Moonwell: just add the chain ID to the Moonwell chain
 * mapping below and to PROTOCOLS in config/chains.js. The API uses ?chain=base|optimism.
 */

const MOONWELL_API = 'https://api.moonwell.fi/v1';
const MOONWELL_CHAINS = {
  8453: 'base',
  10: 'optimism',
};

/**
 * Fetch a live Moonwell position.
 * @param {string} wallet - EVM address (0x...)
 * @param {number} chainId - 8453 or 10
 * @returns {Promise<object>} normalized position shape
 */
async function fetchPosition(wallet, chainId) {
  const chainParam = MOONWELL_CHAINS[chainId];
  if (!chainParam) throw new Error(`Moonwell not available on chain ${chainId}`);

  // Fetch health + positions in parallel
  const [healthResp, positionsResp] = await Promise.all([
    fetch(`${MOONWELL_API}/health/${wallet}?chain=${chainParam}`).then(r => r.json()),
    fetch(`${MOONWELL_API}/positions/${wallet}?chain=${chainParam}&active=true`).then(r => r.json()),
  ]);

  if (!healthResp.success) throw new Error(healthResp.error || 'Moonwell API error');
  const health = healthResp.data;

  if (!positionsResp.success) throw new Error(positionsResp.error || 'Moonwell positions error');
  const positions = positionsResp.data || [];

  // Build collaterals (markets with supply > 0)
  const collaterals = positions
    .filter(p => p.suppliedUsd > 0)
    .map(p => ({
      asset: p.market,
      suppliedUsd: p.suppliedUsd,
      collateralFactor: p.collateralUsd > 0 ? p.collateralUsd / p.suppliedUsd : 0,
      adjustedUsd: p.collateralUsd || 0,
      price: 0, // Moonwell doesn't return price; we'd need price feed
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
    liquidationPrices: [], // computed in app.js after price feeds
    // Flag: Moonwell doesn't return per-asset prices, so liquidation price
    // calculation needs external price feeds (Phase 2 enhancement).
    // For now, compute a simplified overall liquidation threshold.
    raw: { health, positions },
  };
}

// Expose as global for browser script-tag loading
if (typeof window !== 'undefined') {
  window.MoonwellAdapter = { fetchPosition, MOONWELL_CHAINS };
}
if (typeof module !== 'undefined') module.exports = { fetchPosition, MOONWELL_CHAINS };