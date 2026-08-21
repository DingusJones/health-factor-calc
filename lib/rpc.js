/**
 * JSON-RPC helper for EVM chains.
 * Calls eth_call against a contract with fallback RPC rotation.
 */

/**
 * Make a JSON-RPC eth_call to a contract.
 *
 * @param {Array<string>} rpcs - list of RPC URLs to try in order
 * @param {string} to - contract address (0x...)
 * @param {string} data - calldata (0x... including selector)
 * @returns {Promise<string>} raw result (0x... hex string)
 */
async function rpcCall(rpcs, to, data) {
  let lastError = null;

  for (const rpc of rpcs) {
    try {
      const resp = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to, data }, 'latest'],
          id: 1,
        }),
      });

      if (!resp.ok) {
        lastError = new Error(`HTTP ${resp.status} from ${rpc}`);
        continue;
      }

      const json = await resp.json();

      if (json.error) {
        const msg = json.error.message || 'Unknown RPC error';
        // "execution reverted" means the contract ran but the user has no position
        // — treat as empty result, not an error
        if (msg.includes('reverted')) {
          return '0x';
        }
        lastError = new Error(`RPC: ${msg}`);
        continue;
      }

      return json.result;
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error('All RPCs failed');
}

/**
 * Decode a hex string result from getUserAccountData into the 5 uint256 values.
 * Returns: { totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, healthFactor }
 * All values are scaled by 1e8 (Aave's base currency unit).
 */
function decodeGetUserAccountData(hexResult) {
  if (!hexResult || hexResult === '0x' || hexResult.length < 130) {
    return null; // empty = no position
  }

  // Each uint256 is 32 bytes = 64 hex chars, prefixed with 0x
  const clean = hexResult.slice(2);
  const read = (offset) => BigInt('0x' + clean.slice(offset, offset + 64));

  return {
    totalCollateralBase: Number(read(0)) / 1e8,
    totalDebtBase: Number(read(64)) / 1e8,
    availableBorrowsBase: Number(read(128)) / 1e8,
    currentLiquidationThreshold: Number(read(192)) / 1e4, // percentage (e.g. 8000 = 80%)
    healthFactor: Number(read(256)) / 1e8,
  };
}

/**
 * Encode an address for calldata (pad to 32 bytes).
 */
function encodeAddress(addr) {
  return addr.toLowerCase().replace('0x', '').padStart(64, '0');
}

// Expose as global
if (typeof window !== 'undefined') {
  window.rpcCall = rpcCall;
  window.decodeGetUserAccountData = decodeGetUserAccountData;
  window.encodeAddress = encodeAddress;
}
if (typeof module !== 'undefined') module.exports = { rpcCall, decodeGetUserAccountData, encodeAddress };