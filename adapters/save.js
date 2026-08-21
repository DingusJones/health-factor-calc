/**
 * Save.finance (formerly Solend) adapter — reads live Solana positions.
 *
 * Uses api.solend.fi HTTP API. No API key needed.
 *
 * The user-overview endpoint returns deposits and borrows with USD values.
 * Health factor is computed as depositValueUSD / borrowValueUSD (approximate —
 * the exact HF uses per-asset collateral factors from on-chain reserve config,
 * which aren't exposed in the API config endpoint). This approximation is
 * slightly conservative (overestimates HF) since it uses full deposit value
 * rather than collateral-adjusted value.
 *
 * To improve: fetch per-reserve LTV from on-chain Solana program state
 * (requires @solana/web3.js RPC call — Phase 2 enhancement).
 */

const SAVE_API = 'https://api.solend.fi';

/**
 * Fetch a live Save.finance position.
 * @param {string} wallet - Solana address (base58)
 * @returns {Promise<object>} normalized position shape
 */
async function fetchPosition(wallet) {
  const resp = await fetch(`${SAVE_API}/v1/user-overview?wallet=${wallet}`);
  const data = await resp.json();

  // Find the first market with a non-null position
  let position = null;
  let marketName = null;

  for (const [marketAddr, pos] of Object.entries(data)) {
    if (pos !== null && pos !== undefined) {
      position = pos;
      marketName = pos.lendingMarketName || marketAddr;
      break;
    }
  }

  if (!position) {
    return {
      protocol: 'save',
      chain: 'solana',
      chainId: 'solana',
      healthFactor: Infinity,
      totalSuppliedUsd: 0,
      totalBorrowedUsd: 0,
      totalCollateralUsd: 0,
      collaterals: [],
      borrows: [],
      liquidationPrices: [],
      noPosition: true,
    };
  }

  const totalSupplied = parseFloat(position.depositValueUSD) || 0;
  const totalBorrowed = parseFloat(position.borrowValueUSD) || 0;

  // Approximate HF: deposit / borrow (not collateral-adjusted)
  // This overestimates HF slightly vs. the real on-chain calculation
  const approxHf = totalBorrowed > 0 ? totalSupplied / totalBorrowed : Infinity;

  const collaterals = (position.deposits || []).map(d => ({
    asset: d.symbol,
    suppliedUsd: parseFloat(d.valueUSD) || 0,
    collateralFactor: 1.0, // unknown from API — would need on-chain reserve read
    adjustedUsd: parseFloat(d.valueUSD) || 0, // using full value as approximation
    price: 0,
    mint: d.mint,
    amount: parseFloat(d.depositedAmount) || 0,
  }));

  const borrows = (position.borrows || []).map(b => ({
    asset: b.symbol,
    borrowedUsd: parseFloat(b.valueUSD) || 0,
    price: 0,
    mint: b.mint,
    amount: parseFloat(b.borrowedAmount) || 0,
  }));

  return {
    protocol: 'save',
    chain: 'solana',
    chainId: 'solana',
    marketName,
    healthFactor: approxHf,
    totalSuppliedUsd: totalSupplied,
    totalBorrowedUsd: totalBorrowed,
    totalCollateralUsd: totalSupplied, // approximation
    collaterals,
    borrows,
    availableMarkets: [], // Save has 89 reserves but no CF data via API — skip for now
    liquidationPrices: [],
    note: 'HF is approximate (deposit/borrow ratio). Exact HF requires per-asset collateral factors from on-chain reserve config.',
    raw: position,
  };
}

// Expose as global for browser script-tag loading
if (typeof window !== 'undefined') {
  window.SaveAdapter = { fetchPosition };
}
if (typeof module !== 'undefined') module.exports = { fetchPosition };