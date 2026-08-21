/**
 * Aave V3 adapter — reads live positions via direct RPC eth_call to the Pool contract.
 *
 * Supports 15+ EVM chains. Uses getUserAccountData(address) which returns
 * HF + totals in a single call. No API key, no subgraph, no backend.
 *
 * To add a new chain to Aave: add contract addresses to config/chains.js
 * under the chain's `aave` key. That's it — this adapter reads from there.
 *
 * Note: For per-asset breakdown (collateral factors, individual liquidation prices),
 * we'd call UiPoolDataProvider.getUserReservesData which requires more complex
 * ABI encoding. Phase 2 enhancement. For now we get HF + totals which is the
 * core value.
 */

// getUserAccountData(address) selector
const GET_USER_ACCOUNT_DATA_SELECTOR = '0xb691bc39';

/**
 * Fetch a live Aave V3 position.
 * @param {string} wallet - EVM address (0x...)
 * @param {number} chainId - any chain in CHAINS that has aave config
 * @param {object} chainConfig - the CHAINS[chainId] entry
 * @returns {Promise<object>} normalized position shape
 */
async function fetchPosition(wallet, chainId, chainConfig) {
  if (!chainConfig || !chainConfig.aave) {
    throw new Error(`Aave not configured on chain ${chainId}`);
  }

  const { pool } = chainConfig.aave;
  const data = GET_USER_ACCOUNT_DATA_SELECTOR + encodeAddress(wallet);

  const result = await rpcCall(chainConfig.rpcs, pool, data);
  const decoded = decodeGetUserAccountData(result);

  if (!decoded) {
    return {
      protocol: 'aave',
      chain: chainConfig.name,
      chainId,
      healthFactor: Infinity,
      totalSuppliedUsd: 0,
      totalBorrowedUsd: 0,
      totalCollateralUsd: 0,
      liquidationThreshold: 0,
      collaterals: [],
      borrows: [],
      liquidationPrices: [],
      noPosition: true,
    };
  }

  return {
    protocol: 'aave',
    chain: chainConfig.name,
    chainId,
    healthFactor: decoded.healthFactor,
    totalSuppliedUsd: decoded.totalCollateralBase, // in Aave, collateral = supplied
    totalBorrowedUsd: decoded.totalDebtBase,
    totalCollateralUsd: decoded.totalCollateralBase * (decoded.currentLiquidationThreshold / 100),
    liquidationThreshold: decoded.currentLiquidationThreshold,
    availableBorrowsUsd: decoded.availableBorrowsBase,
    collaterals: [], // populated in Phase 2 with UiPoolDataProvider
    borrows: [],
    liquidationPrices: [],
    raw: decoded,
  };
}

// Expose as global for browser script-tag loading
if (typeof window !== 'undefined') {
  window.AaveAdapter = { fetchPosition };
}
if (typeof module !== 'undefined') module.exports = { fetchPosition };