/**
 * Health factor math — the core calculations.
 *
 * All functions are pure — they take data in, return results out.
 * Used by both the live position reader and the what-if simulator.
 */

/**
 * Compute health factor from collaterals and borrows.
 *
 * @param {Array} collaterals - [{ asset, suppliedUsd, collateralFactor, adjustedUsd }]
 * @param {Array} borrows - [{ asset, borrowedUsd }]
 * @returns {number} health factor (Infinity if no borrows)
 */
function computeHealthFactor(collaterals, borrows) {
  const totalBorrowed = borrows.reduce((s, b) => s + (b.borrowedUsd || 0), 0);
  if (totalBorrowed === 0) return Infinity;

  const totalAdjusted = collaterals.reduce((s, c) => s + (c.adjustedUsd || 0), 0);
  return totalAdjusted / totalBorrowed;
}

/**
 * Compute adjusted collateral for each asset.
 * adjustedUsd = suppliedUsd × collateralFactor
 */
function computeAdjustedCollateral(collaterals) {
  return collaterals.map(c => ({
    ...c,
    adjustedUsd: (c.suppliedUsd || 0) * (c.collateralFactor || 0),
  }));
}

/**
 * Compute liquidation price for each collateral asset.
 *
 * For asset i: the price multiplier at which HF = 1:
 * liquidationPrice = currentPrice × (totalBorrow - sum(adjustedCollateral of OTHER assets)) / adjustedCollateral of THIS asset
 *
 * @param {Array} collaterals - with adjustedUsd and price fields
 * @param {Array} borrows - with borrowedUsd
 * @returns {Array} [{ asset, currentPrice, liquidationPrice, dropPct, isWeakest }]
 */
function computeLiquidationPrices(collaterals, borrows) {
  const totalBorrowed = borrows.reduce((s, b) => s + (b.borrowedUsd || 0), 0);
  if (totalBorrowed === 0 || collaterals.length === 0) return [];

  const totalAdjusted = collaterals.reduce((s, c) => s + (c.adjustedUsd || 0), 0);

  return collaterals
    .filter(c => c.price > 0 && c.adjustedUsd > 0)
    .map(c => {
      const otherAdjusted = totalAdjusted - c.adjustedUsd;
      const numerator = totalBorrowed - otherAdjusted;

      if (numerator <= 0) {
        // Other collateral already covers the borrow — this asset can go to zero
        return {
          asset: c.asset,
          currentPrice: c.price,
          liquidationPrice: 0,
          dropPct: 100,
          isWeakest: false,
        };
      }

      const priceMultiplier = numerator / c.adjustedUsd;
      const liquidationPrice = c.price * priceMultiplier;
      const dropPct = (1 - priceMultiplier) * 100;

      return {
        asset: c.asset,
        currentPrice: c.price,
        liquidationPrice: Math.max(0, liquidationPrice),
        dropPct: Math.max(0, dropPct),
        isWeakest: false,
      };
    })
    .sort((a, b) => a.dropPct - b.dropPct) // smallest buffer = most at risk
    .map((item, idx) => ({ ...item, isWeakest: idx === 0 }));
}

/**
 * Get a human-readable health zone label.
 */
function healthZone(hf) {
  if (hf === Infinity || hf > 100) return { label: 'No Borrow', color: '#4ade80', zone: 'safe' };
  if (hf >= 1.5) return { label: 'Safe', color: '#4ade80', zone: 'safe' };
  if (hf >= 1.4) return { label: 'Comfortable', color: '#a3e635', zone: 'comfortable' };
  if (hf >= 1.2) return { label: 'Aggressive', color: '#fbbf24', zone: 'aggressive' };
  if (hf >= 1.0) return { label: 'Danger', color: '#fb923c', zone: 'danger' };
  return { label: 'Liquidatable', color: '#f87171', zone: 'liquidatable' };
}

/**
 * Format USD value compactly.
 */
function formatUsd(v) {
  if (v === Infinity) return '∞';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

/**
 * Format a price with appropriate precision.
 */
function formatPrice(v) {
  if (v === 0) return '$0';
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v > 0) return `$${v.toFixed(6)}`;
  return '$0';
}

/**
 * Format a percentage.
 */
function formatPct(v) {
  if (v === Infinity) return '∞';
  return `${v.toFixed(1)}%`;
}

// Export for browser and node
if (typeof window !== 'undefined') {
  Object.assign(window, {
    computeHealthFactor, computeAdjustedCollateral, computeLiquidationPrices,
    healthZone, formatUsd, formatPrice, formatPct,
  });
}
if (typeof module !== 'undefined') module.exports = {
  computeHealthFactor,
  computeAdjustedCollateral,
  computeLiquidationPrices,
  healthZone,
  formatUsd,
  formatPrice,
  formatPct,
};