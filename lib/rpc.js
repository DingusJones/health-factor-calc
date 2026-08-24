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
  validateRpcConfig(rpcs);
  if (!isEvmAddress(to)) throw new Error(`Invalid contract address: ${String(to)}`);
  if (!/^0x[0-9a-fA-F]*$/.test(data || '') || data.length % 2 !== 0) throw new Error('Invalid eth_call data');
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
        lastError = new Error(`RPC eth_call failed at ${rpc}: ${msg}`);
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
 * Decode Pool.getUserAccountData's canonical six uint256 words. Base-currency
 * totals use 1e8, threshold/LTV use basis points, and HF uses WAD (1e18).
 */
function decodeGetUserAccountData(hexResult) {
  if (!hexResult || hexResult === '0x') throw new Error('Empty Aave getUserAccountData response');
  if (!/^0x[0-9a-fA-F]{384}$/.test(hexResult)) throw new Error('Malformed Aave getUserAccountData response: expected six ABI words');

  // Each uint256 is 32 bytes = 64 hex chars, prefixed with 0x
  const clean = hexResult.slice(2);
  const read = (offset) => BigInt('0x' + clean.slice(offset, offset + 64));

  const raw = Array.from({ length: 6 }, (_, i) => read(i * 64));
  return {
    totalCollateralBaseRaw: raw[0].toString(), totalDebtBaseRaw: raw[1].toString(),
    availableBorrowsBaseRaw: raw[2].toString(), currentLiquidationThresholdBpsRaw: raw[3].toString(),
    ltvBpsRaw: raw[4].toString(), healthFactorWadRaw: raw[5].toString(),
    totalCollateralBase: fixedToNumber(raw[0], 8), totalDebtBase: fixedToNumber(raw[1], 8),
    availableBorrowsBase: fixedToNumber(raw[2], 8),
    currentLiquidationThresholdBps: Number(raw[3]), currentLiquidationThreshold: Number(raw[3]) / 100,
    ltvBps: Number(raw[4]), ltv: Number(raw[4]) / 100,
    healthFactor: raw[1] === 0n ? Infinity : fixedToNumber(raw[5], 18),
  };
}

function fixedToString(value, decimals) {
  const n = typeof value === 'bigint' ? value : BigInt(value);
  const base = 10n ** BigInt(decimals); const whole = n / base;
  const fraction = (n % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
function fixedToNumber(value, decimals) { return Number(fixedToString(value, decimals)); }
function isEvmAddress(value) { return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value); }
function validateRpcConfig(rpcs) {
  if (!Array.isArray(rpcs) || !rpcs.length) throw new Error('Chain has no RPC endpoints configured');
  for (const rpc of rpcs) { let url; try { url = new URL(rpc); } catch (_) { throw new Error(`Invalid RPC URL: ${rpc}`); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`Unsupported RPC URL protocol: ${url.protocol}`); }
}

/**
 * Encode an address for calldata (pad to 32 bytes).
 */
function encodeAddress(addr) {
  if (!isEvmAddress(addr)) throw new Error(`Invalid EVM address: ${String(addr)}`);
  return addr.toLowerCase().replace('0x', '').padStart(64, '0');
}

// Expose as global
if (typeof window !== 'undefined') {
  window.rpcCall = rpcCall;
  window.decodeGetUserAccountData = decodeGetUserAccountData; window.isEvmAddress = isEvmAddress;
  window.encodeAddress = encodeAddress;
}
if (typeof module !== 'undefined') module.exports = { rpcCall, decodeGetUserAccountData, encodeAddress, fixedToString, isEvmAddress, validateRpcConfig };
