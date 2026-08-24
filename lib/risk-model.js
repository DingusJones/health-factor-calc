/** Canonical isolated risk-container model and integer-safe ratio math. */
function assetId(chainId, addressOrMint) {
  if (chainId === undefined || !addressOrMint) throw new Error('Asset identity requires chain and address/mint');
  return `${chainId}:${String(addressOrMint).toLowerCase()}`;
}
function makeAsset(input) {
  if (!Number.isInteger(input.decimals) || input.decimals < 0) throw new Error('Asset decimals are required');
  const raw = BigInt(input.rawAmount ?? 0);
  return { id: assetId(input.chainId, input.address || input.mint), chainId: input.chainId,
    address: input.address, mint: input.mint, symbol: input.symbol || 'Unknown', decimals: input.decimals,
    rawAmount: raw.toString(), humanAmount: fixedToStringLocal(raw, input.decimals), role: input.role,
    protocolRiskPrice: input.protocolRiskPrice ?? null, displayUsdPrice: input.displayUsdPrice ?? null,
    oracleSource: input.oracleSource || null, timestamp: input.timestamp || null, block: input.block || null,
    warnings: [...(input.warnings || [])] };
}
function makeRiskContainer(input) {
  if (!input.id || !input.protocol) throw new Error('Risk container id and protocol are required');
  return { id: input.id, protocol: input.protocol, chainId: input.chainId, marketId: input.marketId || null,
    assets: input.assets || [], healthFactor: input.healthFactor ?? null, liquidation: input.liquidation || null,
    warnings: [...(input.warnings || [])], provenance: input.provenance || {} };
}
function fixedToStringLocal(n, decimals) { const b=10n**BigInt(decimals), w=n/b, f=(n%b).toString().padStart(decimals,'0').replace(/0+$/,''); return f?`${w}.${f}`:w.toString(); }
function ratioDecimal(numerator, denominator, precision=18) {
  numerator=BigInt(numerator); denominator=BigInt(denominator); if (denominator===0n) return null;
  return fixedToStringLocal(numerator*(10n**BigInt(precision))/denominator, precision);
}
function shouldRenderRiskContainers(position) {
  return position?.protocol === 'morpho' || Boolean(position?.riskContainers?.some(container => container.assets?.length));
}
if (typeof window !== 'undefined') Object.assign(window,{assetId,makeAsset,makeRiskContainer,ratioDecimal,shouldRenderRiskContainers});
if (typeof module !== 'undefined') module.exports={assetId,makeAsset,makeRiskContainer,ratioDecimal,shouldRenderRiskContainers};
